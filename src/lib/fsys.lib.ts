"use strict";
// fsys.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {parse as parseFilePath} from 'node-path'
import {parse as parseJSONC, JsonValue} from '@std/jsonc'
import {debounce} from '@std/async/debounce'
import {existsSync, emptyDirSync, ensureDirSync} from '@std/fs'
import {appendFileSync, openSync, closeSync} from 'node-fs'
import {pathToFileURL} from 'node-url'
import {EventEmitter} from 'node-events'
import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from '@std/streams/text-line-stream'
import {
	parse, resolve, relative, fromFileUrl,
	} from '@std/path'

import {
	LOG, DBG, WARN, ERR, INDENT, UNDENT,
	pushLogLevel, popLogLevel,
	} from 'logger'
import {
	pass, undef, defined, notdefined, toRelPath,
	normalizePath, toFullPath,
	allLinesInFile,
	TIterator, TAsyncIterator,
	fileExt, withExt, getFileStats, encode,
	croak, assert, obviously,
	getEmptyIterator, getEmptyAsyncIterator,
	} from 'base'
import {
	isEmpty, nonEmpty, isString, isNonEmptyString,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {sinceLoadStr} from 'timer'
import {MAP} from 'mapper'
import {
	getOptions, spaces,
	arrayToBlock, words, f,
	} from 'llutils'
import {isMetaDataStart, getMetaDataHash} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, ML, DBGVALUE} from 'nice'
import {civet2tsFile} from 'llcivet'

export {
	normalizePath, toRelPath, toFullPath,
	allLinesInFile,
	fileExt, withExt, getFileStats,
	}

// --- Create a function capable of synchronously
//     importing ESM modules

const Deno = globalThis.Deno
type FsEvent = Deno.FsEvent

// ---------------------------------------------------------------------------
// Deno.FileInfo has:
//    isFile (boolean): True if it's a regular file.
//    isDirectory (boolean): True if it's a directory.
//    isSymlink (boolean): True if it's a symlink.
//    size (number): File size in bytes.
//    mtime (Date | null): Modification time.
//    atime (Date | null): Last access time.
//    birthtime (Date | null): Creation time (not available on all platforms).
//    mode (number | null): Permissions (POSIX only).
//    uid / gid (number | null): Owner/group ID (POSIX only)
// ---------------------------------------------------------------------------
/**
 * returns one of:
 *    'missing'  - does not exist
 *    'dir'      - is a directory
 *    'file'     - is a file
 *    'symlink'  - is a symlink
 *    'unknown'  - exists, but not a file, directory or symlink
 */

export type TPathType = 'missing' | 'file' | 'dir' | 'symlink' | 'unknown'

export const isPathType = (x: unknown): x is TPathType => {

	return isString(x) && words('missing file dir symlink unknown').includes(x)
}

export const getPathType = (path: string): TPathType => {

	assert(isString(path), `not a string: ${OL(path)}`)
	if (!existsSync(path)) {
		return 'missing'
	}
	const h = getFileStats(path)
	return (
		  h.isFile         ? 'file'
		: h.isDirectory    ? 'dir'
		:                    'unknown'
		)
}

// ---------------------------------------------------------------------------

export const isStub = (str: string): boolean => {

	// --- a stub cannot contain any of '\\', '/'
	return notdefined(str.match(/[\\\/]/)) && (str[0] !== '.')
}

// ---------------------------------------------------------------------------

export const touch = (path: string): void => {

	const fd = openSync(path, 'a')
	closeSync(fd)
	return
}

// ---------------------------------------------------------------------------

export const pathToURL = (...lParts: string[]): string => {

	const path = resolve(...lParts)
	return new URL('file:' + path).href.replaceAll('\\', '/')
}

// ---------------------------------------------------------------------------

export const mkpath = (...lParts: (string | undefined)[]): string => {

	const lUseParts = Array.from(MAP(lParts, function*(x) {
		if (nonEmpty(x)) {
			obviously(defined(x))
			// --- Remove any leading or trailing slashes,
			//     even if leading slash is preceded by '.'
			const lMatches = x.match(/^(?:\.?[\\\/])?(.*?)[\\\/]?$/)
			if (defined(lMatches)) {
				yield lMatches[1]
			}
		}
		return
	}))

	return normalizePath(lUseParts.join('/'))
}

// ---------------------------------------------------------------------------

export type TPathDesc = {
	dir: string
	root: string
	lParts: string[]
	}

export const pathSubDirs = (
		path: string,
		hOptions: hash = {}
		): TPathDesc => {

	path = toFullPath(path)
	const {root, dir} = parse(path)
	return {
		dir,
		root,
		lParts: dir.slice(root.length).split(/[\\\/]/)
		}
}

// ---------------------------------------------------------------------------
// --- Should be called like: myself(import.meta.url)
//     returns relative path of current file

export const myself = (url: string): string => {

	return toRelPath(fromFileUrl(url))
}

// ---------------------------------------------------------------------------
// --- Should be called like: myTestDir(import.meta.url)

export const myTestDir = (url: string): string => {

	const relPath = myself(url)
	const {dir, stub} = parsePath(relPath)
	const name = stub.split('.')[0]
	return './' + mkpath(dir, name)
}

// ---------------------------------------------------------------------------

export const barf = (
		path: string,
		contents: string,
		hOptions: hash = {}
		): void => {

	type opt = {
		append: boolean
		}
	const {append} = getOptions<opt>(hOptions, {
		append: false
		})

	mkDirsForFile(path)
	const data = encode(contents)
	if (append && isFile(path)) {
		appendFileSync(path, data)
	}
	else {
		Deno.writeFileSync(path, data)
	}
	return
}

// ---------------------------------------------------------------------------

export const barfTempFile = (
		contents: string,
		hOptions: hash = {}
		): string => {

	type opt = {
		ext: string
		}
	const {ext} = getOptions<opt>(hOptions, {
		ext: '.civet'
		})
	const tempFilePath = Deno.makeTempFileSync({suffix: ext})
	barf(tempFilePath, contents)
	return tempFilePath
}

// ---------------------------------------------------------------------------

export const modTime = (path: string): Date => {

	const ms = getFileStats(path).mtime
	assert(defined(ms), `ms not defined for ${path}`)
	return ms
}

// ---------------------------------------------------------------------------

export const newerDestFileExists = (
		srcPath: string,
		destPath: string    // --- can be a file extension
		): boolean => {

	// --- source file must exist
	assert(isFile(srcPath), `No such file: ${OL(srcPath)}`)

	// --- allow passing a file extension for 2nd argument
	if (destPath.startsWith('.')) {
		assert((fileExt(srcPath) !== destPath), "Identical extensions")
		destPath = withExt(srcPath, destPath)
	}

	if (!existsSync(destPath)) {
		return false
	}
	return modTime(destPath) > modTime(srcPath)
}

// ---------------------------------------------------------------------------

export const mkDir = (
		dirPath: string,
		clear: boolean = false
		): void => {

	if (clear) {
		// --- creates dir if it doesn't exist
		emptyDirSync(dirPath)
	}
	else {
		ensureDirSync(dirPath)
	}
	assert(isDir(dirPath), `Dir not created: ${dirPath}`)
	return
}

// ---------------------------------------------------------------------------

export const clearDir = (dirPath: string): void => {

	if (existsSync(dirPath) && isDir(dirPath)) {
		emptyDirSync(dirPath)
	}
	else {
		mkDir(dirPath)
	}
	return
}

// ---------------------------------------------------------------------------

export const mkDirsForFile = (path: string): void => {

	const {root, lParts} = pathSubDirs(path)
	let dir = root
	for (const part of lParts) {
		dir += `/${part}`
		mkDir(dir)
	}
	return
}

// ---------------------------------------------------------------------------

export type TFsEventHandler = (kind: string, path: string) => void | boolean
/**
 * class FileEventHandler
 *    handles file changed events when .handle(fsEvent) is called
 *    callback is a function, debounced by 200 ms
 *       that takes an FsEvent and returns a TVoidFunc
 *       which will be called if the callback returns a function reference
 * [unit tests](../test/fs.test.civet#:~:text=%23%20%2D%2D%2D%20class%20FileEventHandler)
 */

export class FileEventHandler {
	handler: TFsEventHandler // --- debounced handler
	onStop: ()=> void = pass

	// ..........................................................

	constructor(callback: TFsEventHandler, hOptions: hash = {}) {
		type opt = {
			onStop: TVoidFunc
			debounceBy: number
			}
		const {onStop: onStop1, debounceBy} = getOptions<opt>(hOptions, {
			onStop: pass,
			debounceBy: 200,
		})
		this.onStop = onStop1
		const handler1 = debounce(callback, debounceBy)
		this.handler = handler1
		DBG("FileEventHandler constructor() called")
	}

	// ..........................................................
	// --- Calls a TVoidFunc, but is debounced by @ms ms

	handle(fsEvent: FsEvent): void {
		const {kind, paths} = fsEvent
		DBG(`HANDLE: [${sinceLoadStr()}] ${kind} ${OL(paths)}`)
		for (const path of paths) {
			this.handler(kind, path)
		}
		return
	}
}

// ---------------------------------------------------------------------------
// ASYNC

/**
 * a function that watches for changes one or more files or directories
 *    and calls a callback function for each change.
 * If the callback returns true, watching is halted
 *
 * Usage:
 *   handler := (kind, path) => console.log path
 *   await watchFile 'temp.txt', handler
 *   await watchFile 'src/lib',  handler
 *   await watchFile ['temp.txt', 'src/lib'], handler
 */

export const watchFiles = async function(
		path: string | string[],
		watcherCB: TFsEventHandler,
		hOptions: hash = {}
		): AutoPromise<void> {

	// --- debounceBy is milliseconds to debounce by, default is 200
	type opt = {
		debounceBy: number
		}
	const {debounceBy} = getOptions<opt>(hOptions, {
		debounceBy: 200
		})

	DBG(`WATCH: ${OL(path)}`)
	const watcher = Deno.watchFs(path)
	let doStop: boolean = false
	const fsCallback: TFsEventHandler = (kind, path): void => {
		const result = watcherCB(kind, path)
		DBG(`FCB: result = ${result}`)
		if (result) {
			watcher.close()
		}
		return
	}
	const handler = new FileEventHandler(fsCallback, { debounceBy })
	for await (const item of watcher) {
		const fsEvent: FsEvent = item
		DBG("watcher event fired")
		if (doStop) {
			DBG(`doStop = ${doStop}, Closing watcher`)
			break
		}
		for (const path of fsEvent.paths) {
			// --- fsCallback will be (eventually) called
			handler.handle(fsEvent)
		}
	}
}
export const watchFile = watchFiles

// ---------------------------------------------------------------------------

export const patchFirstLine = (path: string, str: string, newstr: string): void => {

	// --- Replace str with newstr, but only on first line
	const contents = Deno.readTextFileSync(path)
	const nlPos = contents.indexOf("\n")
	const strPos = contents.indexOf(str)
	if ((strPos !== -1) && ((nlPos === -1) || (strPos < nlPos))) {
		Deno.writeTextFileSync(path, contents.replace(str, newstr))
	}
	return
}

// ---------------------------------------------------------------------------

export const fromJsonFile = (path: string): hash => {

	if (isFile(path)) {
		const contents = Deno.readTextFileSync(path)
		if (isEmpty(contents)) {
			return {}
		}
		const result = parseJSONC(contents)
		return defined(result) ? result as hash : {}
	}
	else {
		return {}
	}
}

// ---------------------------------------------------------------------------

export const toJsonFile = (
		path: string,
		data: hash
		): void => {

	Deno.writeTextFileSync(path, JSON.stringify(data, null, 3))
	return
}

// ---------------------------------------------------------------------------

export const addJsonValue = (
		path: string,
		key: string,
		value: unknown
		): void => {

	const hData = fromJsonFile(path)
	if (defined(hData) && isHash(hData)) {
		hData[key] = value
		toJsonFile(path, hData)
	}
	return
}

// ---------------------------------------------------------------------------

export const inSameDir = (
		path: string,
		fileName: string
		): string => {

	const {dir} = parsePath(path)
	const newpath = mkpath(dir, fileName)
	return normalizePath(newpath)
}

// ---------------------------------------------------------------------------

export const removeCR = (str: string): string => {

	return str.replaceAll('\r', '')
}

// ---------------------------------------------------------------------------

export const slurp = (path: string): string => {

	assert(isFile(path), `No such file: ${path}`)
	const data = Deno.readTextFileSync(path)
	return defined(data) ? removeCR(data) : ''
}

// ---------------------------------------------------------------------------

export const slurpAsync = async (path: string): AutoPromise<string> => {

	const data = await Deno.readTextFile(path)
	return defined(data) ? removeCR(data) : ''
}

// ---------------------------------------------------------------------------

export const pathStr = (
		path: string,
		root: string = '.'
		): string => {

	return normalizePath(relative(root, path))
}

// ---------------------------------------------------------------------------

export const splitPatterns = (
		lPatterns: string[],
		): [string[], string[]] => {

	type TAccum = [string[], string[]]

	const acc0: TAccum = [[],[]]
	const accum = MAP(lPatterns, acc0, function(pat: string, acc: TAccum): TAccum {
		const [lPos, lNeg] = acc
		const lMatches = pat.match(/^\!\s+(.*)$/)
		return (
			  defined(lMatches)
			? [ lPos,              lNeg.concat(lMatches[1])]
			: [ lPos.concat(pat),  lNeg                    ]
			)
	})
	return accum
}

// ---------------------------------------------------------------------------
// TIterator
//
//    Use like:
//       for path of allFilesMatching(lPats)
//          OR
//       lPaths := Array.from(allFilesMatching(lPats))
//
//    NOTE: By default, searches from .
//          By default, ignores anything inside a folder
//                      named '.temp' or '.save'

export const allFilesMatching = function*(
		lPatterns: string | string[],
		hOptions: hash = {}
		): TIterator<string> {

	type opt = {
		root: string
		hMoreGlobOptions: hash
		lIgnoreDirs: string[]
		includeDirs: boolean
		}

	const {root, hMoreGlobOptions, lIgnoreDirs, includeDirs
		} = getOptions<opt>(hOptions, {
			root: '.',
			hMoreGlobOptions: {},
			lIgnoreDirs: ['.temp', '.save'],
			includeDirs: false
			})

	const hGlobOptions: hash = {
		root,
		includeDirs,
		followSymlinks: false,
		canonicalize: false,
		...hMoreGlobOptions
		}

	const lAllPatterns: string[] = isString(lPatterns) ? [lPatterns] : lPatterns
	const lMorePatterns = (
		  defined(lIgnoreDirs)
		? lIgnoreDirs.map((x) => `! **/${x}/**`)
		: []
		)

	const [lPosPats, lNegPats] = splitPatterns(lAllPatterns.concat(...lMorePatterns))
	if (isEmpty(lPosPats)) {
		return
	}
	if (nonEmpty(lNegPats)) {
		hGlobOptions.exclude = lNegPats
	}
	if (debugging) {
		LOG("PATTERNS:")
		for (const pat of lPosPats) {
			LOG(`   POS: ${pat}`)
		}
		for (const pat of lNegPats) {
			LOG(`   NEG: ${pat}`)
		}
	}
	const setSkip = new Set<string>()
	for (const pat of lPosPats) {
		for (const entry of expandGlobSync(pat, hGlobOptions)) {
			const {path} = entry
			if (!setSkip.has(path)) {
				if (debugging) {
					LOG(`PATH: ${path}`)
				}
				const npath = normalizePath(path)
				yield npath
				setSkip.add(path)
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------
// --- hOptions gets passed to allFilesMatching()

export const removeFilesMatching = (
		pattern: string,
		hOptions: hash = {}
		): void => {

	assert((pattern !== '*') && (pattern !== '**'),
			`Can't delete files matching ${OL(pattern)}`)
	for (const path of allFilesMatching(pattern, hOptions)) {
		Deno.removeSync(path)
	}
	return
}

// ---------------------------------------------------------------------------

export const findFile = (
		fileName: string,
		hOptions: hash = {}
		): (string | undefined) => {

	type opt = {
		root: string
		lIgnoreDirs: string[]
		}
	const {root, lIgnoreDirs} = getOptions<opt>(hOptions, {
		root: '.',
		lIgnoreDirs: ['.temp', '.save']
		})

	assert(!root.endsWith('/'), `Bad root: ${root}`)
	const pat = root ? `${root}/**/${fileName}` : `**/${fileName}`

	// NOTE: allFilesMatching() returns normalized paths
	const lPaths = Array.from(allFilesMatching(pat, {
		lIgnoreDirs
		}))
	DBGVALUE('lPaths', lPaths)
	switch(lPaths.length) {
		case 1:
			const path = lPaths[0]
			assert(isFile(path), `Not a file: ${OL(path)}`)
			return path
		case 0:
			return undef
		default:
			for (const path of lPaths) {
				console.log(path)
			}
			croak(`Multiple files with name ${fileName}`)
			return ''
	}
}

// ---------------------------------------------------------------------------
// GENERATOR
//
//    Use like:
//       for path of allDirsMatching(lPats)
//          OR
//       lDirs := Array.from(allDirsMatching(lPats))
//
//    NOTE: By default, searches from ./src

export const allDirsMatching = function*(
		lPatterns: string | string[],
		hMoreGlobOptions: hash = {}
		): TIterator<string> {

	const hGlobOptions: hash = {
		root: '.',
		includeDirs: true,
		followSymlinks: false,
		canonicalize: false,
		...hMoreGlobOptions
		}
	const lAllPatterns: string[] = (
		  isString(lPatterns)
		? [lPatterns]
		: lPatterns
		)
	const [lPosPats, lNegPats] = splitPatterns(lAllPatterns)
	if (lNegPats.length > 0) {
		hGlobOptions.exclude = lNegPats
	}
	if (debugging) {
		LOG("PATTERNS:")
		for (const pat of lPosPats) {
			LOG(`   POS: ${pat}`)
		}
		for (const pat of lNegPats) {
			LOG(`   NEG: ${pat}`)
		}
	}
	const setSkip = new Set<string>()
	for (const pat of lPosPats) {
		for (const {path} of expandGlobSync(pat, hGlobOptions)) {
			if (!setSkip.has(path) && isDir(path)) {
				if (debugging) {
					LOG(`DIR: ${path}`)
				}
				const npath = normalizePath(path)
				yield npath
				setSkip.add(path)
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export type TPathInfo = {
	root: string
	dir: string
	fileName: string
	stub: string
	purpose: (string | undefined)
	ext: (string | undefined)
}

export const parsePath = (path: string): TPathInfo => {

	if (defined(path.match(/^file\:\/\//))) {
		path = fromFileUrl(path)
	}
	const {root, dir, base} = parseFilePath(path)
	const lParts = base.split('.')
	const nParts = lParts.length
	let ref1
	switch(nParts) {
		case 0:
			throw new Error(`Bad path: ${path}`)
		case 1: {
			ref1 = base;break;
		}
		case 2: {
			ref1 = lParts[0];break;
		}
		default:
			ref1 = lParts.slice(0, -2).join('.')
	}
	const stub = ref1
	return {
		root: normalizePath(root),
		dir: normalizePath(dir),
		fileName: base,
		stub,
		purpose: (nParts > 2? lParts.at(-2) : undef),
		ext: (nParts > 1? (`.${lParts.at(-1)}`) : undef)
	}
}

// ---------------------------------------------------------------------------

export const isFile = (path: string): boolean => {

	try {
		const stats = getFileStats(path)
		return stats.isFile
	}
	catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false
		}
		else {
			throw err
		}
	}
}

// ---------------------------------------------------------------------------

export const isDir = (path: string): boolean => {

	try {
		const stats = getFileStats(path)
		return stats.isDirectory
	}
	catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false
		}
		else {
			throw err
		}
	}
}

// ---------------------------------------------------------------------------

export const rmFile = (path: string): void => {

	if (isFile(path)) {
		Deno.removeSync(path)
	}
	return
}

// ---------------------------------------------------------------------------

export const rmDir = (
		path: string,
		hOptions: hash = {}
		): void => {

	type opt = {
		clear: boolean
		}
	const {clear} = getOptions<opt>(hOptions, {
		clear: false
		})

	if (existsSync(path)) {
		assert(isDir(path), `Not a directory: ${path}`)
		if (clear) {
			Deno.removeSync(path, {recursive: true})
		}
		else {
			Deno.removeSync(path)
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const isValidStub = (stub: string): boolean => {

	for (const ch of [',', '/', '\\']) {
		if (stub.includes(ch)) {
			return false
		}
	}
	return (stub !== 'all')
}

// ---------------------------------------------------------------------------
// ASYNC

export const configFromFile = async (
		fileName: string
		): AutoPromise<hash> => {

	// --- config should be a hash named hConfig

	// --- NOTE: If a defined path is returned, it definitely exists
	const path = findFile(fileName)
	assert(defined(path), `No such file: ${OL(fileName)}`)
	const {purpose, ext} = parsePath(path)
	assert(defined(ext), `No file ext in ${OL(path)}`)
	assert((purpose === 'config'), `Not a config file: ${OL(path)}`)
	assert(['.civet', '.ts'].includes(ext), `Invalid path: ${OL(path)}`)
	DBG(`Import config from ${OL(path)}`)
	const url = (
		(await (async ()=>{if (ext === '.civet') {
			const tsPath = await civet2tsFile(path)
			return pathToFileURL(tsPath)
		}
		else {
			return pathToFileURL(path)
		}})())
		)
	const h = await import(url)
	return h.hConfig
}

// ---------------------------------------------------------------------------

export class CWritableFile {

	path: string
	file: Deno.FsFile

	constructor(path1: string, hOptions: hash = {}) {

		this.path = path1;

		type opt = {
			append: boolean
			}
		const {append} = getOptions<opt>(hOptions, {
			append: false
			})

		this.file = Deno.openSync(this.path, {
			write: true,
			create: true,
			truncate: !append
			})
	}

	async write(str: string) {
		await this.file.write(encode(str))
		return
	}

	async writeln(str: string) {
		await this.file.write(encode(str + '\n'))
		return
	}

	close() {
		this.file.close()
	}
}

// ---------------------------------------------------------------------------

export class CReadableFile {

	path: string
	initialized: boolean = false
	hMetaData: hash = {}
	iter: TAsyncIterator<string,void,void> = getEmptyAsyncIterator<string>()
	firstLine: (string | undefined) = undef

	constructor(path2: string){this.path = path2;}

	async init(): AutoPromise<void> {

		assert(isFile(this.path), `No such file: ${this.path}`)
		const iter1 = allLinesInFile(this.path);this.iter = iter1;

		// --- we need to get the first line to check if
		//     there's meta data. But if there is not,
		//     we need to return it by the reader

		let {value, done} = await this.iter.next()
		if (done) {
			this.firstLine = undef
		}
		else {
			obviously(defined(value))
			this.firstLine = value
			// --- Get meta data if present
			this.hMetaData = (
				(await (async ()=>{if (isMetaDataStart(value)) {
					const lMetaLines: string[] = [];
					({value, done} = await this.iter.next())
					while (!done && (value !== this.firstLine)) {
						obviously(defined(value))
						lMetaLines.push(value);
						({value, done} = await this.iter.next())
					}
					if (value === this.firstLine) {
						obviously(defined(value))
						this.firstLine = undef
						return getMetaDataHash(value, arrayToBlock(lMetaLines))
					}
					else {
						return ({})
					}
				}
				else {
					return ({})
				}})())
				)
		}
		this.initialized = true
		return
	}

	async metaData(): AutoPromise<hash> {

		if (!this.initialized) {
			await this.init()
		}
		return this.hMetaData
	}

	async getLine():AutoPromise<(string | undefined)> {

		if (!this.initialized) {
			await this.init()
		}
		if (defined(this.firstLine)) {
			const str = this.firstLine
			this.firstLine = undef
			return str
		}

		const {value, done} = await this.iter.next()
		if (done) {
			return undef
		}
		else {
			return value as string
		}
	}

	async getContents(): AutoPromise<string> {

		if (!this.initialized) {
			await this.init()
		}
		const lLines: string[] = []
		let line = await this.getLine()
		while (defined(line)) {
			lLines.push(line)
			line = await this.getLine()
		}
		return lLines.join('\n')
	}
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCO0FBQ2xELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsK0JBQStCO0FBQzVELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ3ZDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQ25CLEFB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LEksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDckMsQUFBQSxFQUFFLEdBQUcsQ0FBQSxJQUFJLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLO0VBQUssQ0FBQTtBQUNmLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNO0VBQU0sQztDQUFBLENBQUE7QUFDekIsQUFBQTtBQUNBLEFBQUEsQyxNLFdBQVksQ0FBQyxDQUFDLEMsQyxXLENBQUMsQUFBQyxNLENBQU0sQ0FBQSxDQUFBO0FBQ3RCLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFBLENBQUksSSxDQUFDLFdBQVcsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLEtBQUssQ0FBQyxJLENBQUMsSUFBSSxDQUFDLEM7RUFBQyxDQUFBO0FBQ2hCLEFBQUEsRUFBa0IsTUFBaEIsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQzdCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ25CLEFBQUEsR0FBRyxJQUFJLEMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxJLENBQUMsT0FBTyxDQUFDLEM7RUFBQyxDQUFBO0FBQzFCLEFBQUEsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEM7Q0FBQyxDO0FBQUEsQ0FBQTtBQUMxQiIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBmc3lzLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtwYXJzZTogcGFyc2VGaWxlUGF0aH0gZnJvbSAnbm9kZS1wYXRoJ1xyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUpTT05DLCBKc29uVmFsdWV9IGZyb20gJ0BzdGQvanNvbmMnXHJcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJ0BzdGQvYXN5bmMvZGVib3VuY2UnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge2FwcGVuZEZpbGVTeW5jLCBvcGVuU3luYywgY2xvc2VTeW5jfSBmcm9tICdub2RlLWZzJ1xyXG5pbXBvcnQge3BhdGhUb0ZpbGVVUkx9IGZyb20gJ25vZGUtdXJsJ1xyXG5pbXBvcnQge0V2ZW50RW1pdHRlcn0gZnJvbSAnbm9kZS1ldmVudHMnXHJcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXHJcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcy90ZXh0LWxpbmUtc3RyZWFtJ1xyXG5pbXBvcnQge1xyXG5cdHBhcnNlLCByZXNvbHZlLCByZWxhdGl2ZSwgZnJvbUZpbGVVcmwsXHJcblx0fSBmcm9tICdAc3RkL3BhdGgnXHJcblxyXG5pbXBvcnQge1xyXG5cdExPRywgREJHLCBXQVJOLCBFUlIsIElOREVOVCwgVU5ERU5ULFxyXG5cdHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsXHJcblx0fSBmcm9tICdsb2dnZXInXHJcbmltcG9ydCB7XHJcblx0cGFzcywgdW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIHRvUmVsUGF0aCxcclxuXHRub3JtYWxpemVQYXRoLCB0b0Z1bGxQYXRoLFxyXG5cdGFsbExpbmVzSW5GaWxlLFxyXG5cdFRJdGVyYXRvciwgVEFzeW5jSXRlcmF0b3IsXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgZ2V0RmlsZVN0YXRzLCBlbmNvZGUsXHJcblx0Y3JvYWssIGFzc2VydCwgb2J2aW91c2x5LFxyXG5cdGdldEVtcHR5SXRlcmF0b3IsIGdldEVtcHR5QXN5bmNJdGVyYXRvcixcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0aXNFbXB0eSwgbm9uRW1wdHksIGlzU3RyaW5nLCBpc05vbkVtcHR5U3RyaW5nLFxyXG5cdGlzQm9vbGVhbiwgaXNOdW1iZXIsIGlzSW50ZWdlciwgaXNBcnJheSwgaXNBcnJheU9mU3RyaW5ncyxcclxuXHRpc0hhc2gsIGlzUmVnRXhwLCBpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIFRWb2lkRnVuYyxcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtzaW5jZUxvYWRTdHJ9IGZyb20gJ3RpbWVyJ1xyXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xyXG5pbXBvcnQge1xyXG5cdGdldE9wdGlvbnMsIHNwYWNlcyxcclxuXHRhcnJheVRvQmxvY2ssIHdvcmRzLCBmLFxyXG5cdH0gZnJvbSAnbGx1dGlscydcclxuaW1wb3J0IHtpc01ldGFEYXRhU3RhcnQsIGdldE1ldGFEYXRhSGFzaH0gZnJvbSAnbWV0YS1kYXRhJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7T0wsIE1MLCBEQkdWQUxVRX0gZnJvbSAnbmljZSdcclxuaW1wb3J0IHtjaXZldDJ0c0ZpbGV9IGZyb20gJ2xsY2l2ZXQnXHJcblxyXG5leHBvcnQge1xyXG5cdG5vcm1hbGl6ZVBhdGgsIHRvUmVsUGF0aCwgdG9GdWxsUGF0aCxcclxuXHRhbGxMaW5lc0luRmlsZSxcclxuXHRmaWxlRXh0LCB3aXRoRXh0LCBnZXRGaWxlU3RhdHMsXHJcblx0fVxyXG5cclxuIyAtLS0gQ3JlYXRlIGEgZnVuY3Rpb24gY2FwYWJsZSBvZiBzeW5jaHJvbm91c2x5XHJcbiMgICAgIGltcG9ydGluZyBFU00gbW9kdWxlc1xyXG5cclxuRGVubyA6PSBnbG9iYWxUaGlzLkRlbm9cclxudHlwZSBGc0V2ZW50ID0gRGVuby5Gc0V2ZW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIERlbm8uRmlsZUluZm8gaGFzOlxyXG4jICAgIGlzRmlsZSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHJlZ3VsYXIgZmlsZS5cclxuIyAgICBpc0RpcmVjdG9yeSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIGRpcmVjdG9yeS5cclxuIyAgICBpc1N5bWxpbmsgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBzeW1saW5rLlxyXG4jICAgIHNpemUgKG51bWJlcik6IEZpbGUgc2l6ZSBpbiBieXRlcy5cclxuIyAgICBtdGltZSAoRGF0ZSB8IG51bGwpOiBNb2RpZmljYXRpb24gdGltZS5cclxuIyAgICBhdGltZSAoRGF0ZSB8IG51bGwpOiBMYXN0IGFjY2VzcyB0aW1lLlxyXG4jICAgIGJpcnRodGltZSAoRGF0ZSB8IG51bGwpOiBDcmVhdGlvbiB0aW1lIChub3QgYXZhaWxhYmxlIG9uIGFsbCBwbGF0Zm9ybXMpLlxyXG4jICAgIG1vZGUgKG51bWJlciB8IG51bGwpOiBQZXJtaXNzaW9ucyAoUE9TSVggb25seSkuXHJcbiMgICAgdWlkIC8gZ2lkIChudW1iZXIgfCBudWxsKTogT3duZXIvZ3JvdXAgSUQgKFBPU0lYIG9ubHkpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8qKlxyXG4gKiByZXR1cm5zIG9uZSBvZjpcclxuICogICAgJ21pc3NpbmcnICAtIGRvZXMgbm90IGV4aXN0XHJcbiAqICAgICdkaXInICAgICAgLSBpcyBhIGRpcmVjdG9yeVxyXG4gKiAgICAnZmlsZScgICAgIC0gaXMgYSBmaWxlXHJcbiAqICAgICdzeW1saW5rJyAgLSBpcyBhIHN5bWxpbmtcclxuICogICAgJ3Vua25vd24nICAtIGV4aXN0cywgYnV0IG5vdCBhIGZpbGUsIGRpcmVjdG9yeSBvciBzeW1saW5rXHJcbiAqL1xyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhUeXBlID0gJ21pc3NpbmcnIHwgJ2ZpbGUnIHwgJ2RpcicgfCAnc3ltbGluaycgfCAndW5rbm93bidcclxuXHJcbmV4cG9ydCBpc1BhdGhUeXBlIDo9ICh4OiB1bmtub3duKTogeCBpcyBUUGF0aFR5cGUgPT5cclxuXHJcblx0cmV0dXJuIGlzU3RyaW5nKHgpICYmIHdvcmRzKCdtaXNzaW5nIGZpbGUgZGlyIHN5bWxpbmsgdW5rbm93bicpLmluY2x1ZGVzKHgpXHJcblxyXG5leHBvcnQgZ2V0UGF0aFR5cGUgOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoVHlwZSA9PlxyXG5cclxuXHRhc3NlcnQgaXNTdHJpbmcocGF0aCksIFwibm90IGEgc3RyaW5nOiAje09MKHBhdGgpfVwiXHJcblx0aWYgbm90IGV4aXN0c1N5bmMocGF0aClcclxuXHRcdHJldHVybiAnbWlzc2luZydcclxuXHRoIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0cmV0dXJuIChcclxuXHRcdCAgaC5pc0ZpbGUgICAgICAgICA/ICdmaWxlJ1xyXG5cdFx0OiBoLmlzRGlyZWN0b3J5ICAgID8gJ2RpcidcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1N0dWIgOj0gKHN0cjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBhIHN0dWIgY2Fubm90IGNvbnRhaW4gYW55IG9mICdcXFxcJywgJy8nXHJcblx0cmV0dXJuIG5vdGRlZmluZWQoc3RyLm1hdGNoIC9bXFxcXFxcL10vKSAmJiAoc3RyWzBdICE9ICcuJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG91Y2ggOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0ZmQgOj0gb3BlblN5bmMocGF0aCwgJ2EnKVxyXG5cdGNsb3NlU3luYyhmZClcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGF0aFRvVVJMIDo9ICguLi5sUGFydHM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdHBhdGggOj0gcmVzb2x2ZSAuLi5sUGFydHNcclxuXHRyZXR1cm4gbmV3IFVSTCgnZmlsZTonICsgcGF0aCkuaHJlZi5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta3BhdGggOj0gKC4uLmxQYXJ0czogc3RyaW5nP1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGxVc2VQYXJ0cyA6PSBBcnJheS5mcm9tIE1BUCBsUGFydHMsICh4KSAtPlxyXG5cdFx0aWYgbm9uRW1wdHkoeClcclxuXHRcdFx0b2J2aW91c2x5IGRlZmluZWQoeClcclxuXHRcdFx0IyAtLS0gUmVtb3ZlIGFueSBsZWFkaW5nIG9yIHRyYWlsaW5nIHNsYXNoZXMsXHJcblx0XHRcdCMgICAgIGV2ZW4gaWYgbGVhZGluZyBzbGFzaCBpcyBwcmVjZWRlZCBieSAnLidcclxuXHRcdFx0bE1hdGNoZXMgOj0geC5tYXRjaCAvLy9eXHJcblx0XHRcdFx0KD86XHJcblx0XHRcdFx0XHRcXC4/IFtcXFxcXFwvXVxyXG5cdFx0XHRcdFx0KT9cclxuXHRcdFx0XHQoLio/KVxyXG5cdFx0XHRcdFtcXFxcXFwvXT9cclxuXHRcdFx0XHQkLy8vXHJcblx0XHRcdGlmIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdFx0eWllbGQgbE1hdGNoZXNbMV1cclxuXHRcdHJldHVyblxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBsVXNlUGFydHMuam9pbignLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhEZXNjID0ge1xyXG5cdGRpcjogc3RyaW5nXHJcblx0cm9vdDogc3RyaW5nXHJcblx0bFBhcnRzOiBzdHJpbmdbXVxyXG5cdH1cclxuXHJcbmV4cG9ydCBwYXRoU3ViRGlycyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUUGF0aERlc2MgPT5cclxuXHJcblx0cGF0aCA9IHRvRnVsbFBhdGgocGF0aClcclxuXHR7cm9vdCwgZGlyfSA6PSBwYXJzZSBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGRpclxyXG5cdFx0cm9vdFxyXG5cdFx0bFBhcnRzOiBkaXIuc2xpY2Uocm9vdC5sZW5ndGgpLnNwbGl0KC9bXFxcXFxcL10vKVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gU2hvdWxkIGJlIGNhbGxlZCBsaWtlOiBteXNlbGYoaW1wb3J0Lm1ldGEudXJsKVxyXG4jICAgICByZXR1cm5zIHJlbGF0aXZlIHBhdGggb2YgY3VycmVudCBmaWxlXHJcblxyXG5leHBvcnQgbXlzZWxmIDo9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gdG9SZWxQYXRoIGZyb21GaWxlVXJsIHVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gU2hvdWxkIGJlIGNhbGxlZCBsaWtlOiBteVRlc3REaXIoaW1wb3J0Lm1ldGEudXJsKVxyXG5cclxuZXhwb3J0IG15VGVzdERpciA6PSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmVsUGF0aCA6PSBteXNlbGYodXJsKVxyXG5cdHtkaXIsIHN0dWJ9IDo9IHBhcnNlUGF0aCByZWxQYXRoXHJcblx0bmFtZSA6PSBzdHViLnNwbGl0KCcuJylbMF1cclxuXHRyZXR1cm4gJy4vJyArIG1rcGF0aChkaXIsIG5hbWUpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmYgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0Y29udGVudHM6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7YXBwZW5kfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdH1cclxuXHJcblx0bWtEaXJzRm9yRmlsZSBwYXRoXHJcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcclxuXHRpZiBhcHBlbmQgJiYgaXNGaWxlKHBhdGgpXHJcblx0XHRhcHBlbmRGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0ZWxzZVxyXG5cdFx0RGVuby53cml0ZUZpbGVTeW5jIHBhdGgsIGRhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRleHQ6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtleHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZXh0OiAnLmNpdmV0J1xyXG5cdFx0fVxyXG5cdHRlbXBGaWxlUGF0aCA6PSBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeDogZXh0fVxyXG5cdGJhcmYgdGVtcEZpbGVQYXRoLCBjb250ZW50c1xyXG5cdHJldHVybiB0ZW1wRmlsZVBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbW9kVGltZSA6PSAocGF0aDogc3RyaW5nKTogRGF0ZSA9PlxyXG5cclxuXHRtcyA6PSBnZXRGaWxlU3RhdHMocGF0aCkubXRpbWVcclxuXHRhc3NlcnQgZGVmaW5lZChtcyksIFwibXMgbm90IGRlZmluZWQgZm9yICN7cGF0aH1cIlxyXG5cdHJldHVybiBtc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBuZXdlckRlc3RGaWxlRXhpc3RzIDo9IChcclxuXHRcdHNyY1BhdGg6IHN0cmluZyxcclxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxyXG5cdGFzc2VydCBpc0ZpbGUoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje09MKHNyY1BhdGgpfVwiXHJcblxyXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XHJcblx0aWYgZGVzdFBhdGguc3RhcnRzV2l0aCgnLicpXHJcblx0XHRhc3NlcnQgKGZpbGVFeHQoc3JjUGF0aCkgIT0gZGVzdFBhdGgpLCBcIklkZW50aWNhbCBleHRlbnNpb25zXCJcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gbW9kVGltZShkZXN0UGF0aCkgPiBtb2RUaW1lKHNyY1BhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rRGlyIDo9IChcclxuXHRcdGRpclBhdGg6IHN0cmluZyxcclxuXHRcdGNsZWFyOiBib29sZWFuID0gZmFsc2VcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgY2xlYXJcclxuXHRcdCMgLS0tIGNyZWF0ZXMgZGlyIGlmIGl0IGRvZXNuJ3QgZXhpc3RcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0ZW5zdXJlRGlyU3luYyBkaXJQYXRoXHJcblx0YXNzZXJ0IGlzRGlyKGRpclBhdGgpLCBcIkRpciBub3QgY3JlYXRlZDogI3tkaXJQYXRofVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMoZGlyUGF0aCkgJiYgaXNEaXIoZGlyUGF0aClcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0bWtEaXIgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHtyb290LCBsUGFydHN9IDo9IHBhdGhTdWJEaXJzIHBhdGhcclxuXHRsZXQgZGlyID0gcm9vdFxyXG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xyXG5cdFx0ZGlyICs9IFwiLyN7cGFydH1cIlxyXG5cdFx0bWtEaXIgZGlyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZzRXZlbnRIYW5kbGVyID0gKGtpbmQ6IHN0cmluZywgcGF0aDogc3RyaW5nKSA9PiB2b2lkIHwgYm9vbGVhblxyXG4vKipcclxuICogY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxyXG4gKiAgICBoYW5kbGVzIGZpbGUgY2hhbmdlZCBldmVudHMgd2hlbiAuaGFuZGxlKGZzRXZlbnQpIGlzIGNhbGxlZFxyXG4gKiAgICBjYWxsYmFjayBpcyBhIGZ1bmN0aW9uLCBkZWJvdW5jZWQgYnkgMjAwIG1zXHJcbiAqICAgICAgIHRoYXQgdGFrZXMgYW4gRnNFdmVudCBhbmQgcmV0dXJucyBhIFRWb2lkRnVuY1xyXG4gKiAgICAgICB3aGljaCB3aWxsIGJlIGNhbGxlZCBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyBhIGZ1bmN0aW9uIHJlZmVyZW5jZVxyXG4gKiBbdW5pdCB0ZXN0c10oLi4vdGVzdC9mcy50ZXN0LmNpdmV0Izp+OnRleHQ9JTIzJTIwJTJEJTJEJTJEJTIwY2xhc3MlMjBGaWxlRXZlbnRIYW5kbGVyKVxyXG4gKi9cclxuXHJcbmV4cG9ydCBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXHJcblx0aGFuZGxlcjogVEZzRXZlbnRIYW5kbGVyICMgLS0tIGRlYm91bmNlZCBoYW5kbGVyXHJcblx0b25TdG9wOiA9PiB2b2lkID0gcGFzc1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoY2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciwgaE9wdGlvbnM6IGhhc2ggPSB7fSlcclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRvblN0b3A6IFRWb2lkRnVuY1xyXG5cdFx0XHRkZWJvdW5jZUJ5OiBudW1iZXJcclxuXHRcdFx0fVxyXG5cdFx0e29uU3RvcDogb25TdG9wMSwgZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLFxyXG5cdFx0XHRvblN0b3A6IHBhc3NcclxuXHRcdFx0ZGVib3VuY2VCeTogMjAwXHJcblx0XHRAb25TdG9wID0gb25TdG9wMVxyXG5cdFx0aGFuZGxlcjEgOj0gZGVib3VuY2UgY2FsbGJhY2ssIGRlYm91bmNlQnlcclxuXHRcdEBoYW5kbGVyID0gaGFuZGxlcjFcclxuXHRcdERCRyBcIkZpbGVFdmVudEhhbmRsZXIgY29uc3RydWN0b3IoKSBjYWxsZWRcIlxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHQjIC0tLSBDYWxscyBhIFRWb2lkRnVuYywgYnV0IGlzIGRlYm91bmNlZCBieSBAbXMgbXNcclxuXHJcblx0aGFuZGxlKGZzRXZlbnQ6IEZzRXZlbnQpOiB2b2lkXHJcblx0XHR7a2luZCwgcGF0aHN9IDo9IGZzRXZlbnRcclxuXHRcdERCRyBcIkhBTkRMRTogWyN7c2luY2VMb2FkU3RyKCl9XSAje2tpbmR9ICN7T0wocGF0aHMpfVwiXHJcblx0XHRmb3IgcGF0aCBvZiBwYXRoc1xyXG5cdFx0XHRAaGFuZGxlciBraW5kLCBwYXRoXHJcblx0XHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbi8qKlxyXG4gKiBhIGZ1bmN0aW9uIHRoYXQgd2F0Y2hlcyBmb3IgY2hhbmdlcyBvbmUgb3IgbW9yZSBmaWxlcyBvciBkaXJlY3Rvcmllc1xyXG4gKiAgICBhbmQgY2FsbHMgYSBjYWxsYmFjayBmdW5jdGlvbiBmb3IgZWFjaCBjaGFuZ2UuXHJcbiAqIElmIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydWUsIHdhdGNoaW5nIGlzIGhhbHRlZFxyXG4gKlxyXG4gKiBVc2FnZTpcclxuICogICBoYW5kbGVyIDo9IChraW5kLCBwYXRoKSA9PiBjb25zb2xlLmxvZyBwYXRoXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICd0ZW1wLnR4dCcsIGhhbmRsZXJcclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3NyYy9saWInLCAgaGFuZGxlclxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSBbJ3RlbXAudHh0JywgJ3NyYy9saWInXSwgaGFuZGxlclxyXG4gKi9cclxuXHJcbmV4cG9ydCB3YXRjaEZpbGVzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0d2F0Y2hlckNCOiBURnNFdmVudEhhbmRsZXIsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkIC0+XHJcblxyXG5cdCMgLS0tIGRlYm91bmNlQnkgaXMgbWlsbGlzZWNvbmRzIHRvIGRlYm91bmNlIGJ5LCBkZWZhdWx0IGlzIDIwMFxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHR9XHJcblx0e2RlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZGVib3VuY2VCeTogMjAwXHJcblx0XHR9XHJcblxyXG5cdERCRyBcIldBVENIOiAje09MKHBhdGgpfVwiXHJcblx0d2F0Y2hlciA6PSBEZW5vLndhdGNoRnMgcGF0aFxyXG5cdGxldCBkb1N0b3A6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdGZzQ2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciA6PSAoa2luZCwgcGF0aCk6IHZvaWQgPT5cclxuXHRcdHJlc3VsdCA6PSB3YXRjaGVyQ0Iga2luZCwgcGF0aFxyXG5cdFx0REJHIFwiRkNCOiByZXN1bHQgPSAje3Jlc3VsdH1cIlxyXG5cdFx0aWYgcmVzdWx0XHJcblx0XHRcdHdhdGNoZXIuY2xvc2UoKVxyXG5cdFx0cmV0dXJuXHJcblx0aGFuZGxlciA6PSBuZXcgRmlsZUV2ZW50SGFuZGxlcihmc0NhbGxiYWNrLCB7IGRlYm91bmNlQnkgfSlcclxuXHRmb3IgYXdhaXQgaXRlbSBvZiB3YXRjaGVyXHJcblx0XHRmc0V2ZW50OiBGc0V2ZW50IDo9IGl0ZW1cclxuXHRcdERCRyBcIndhdGNoZXIgZXZlbnQgZmlyZWRcIlxyXG5cdFx0aWYgZG9TdG9wXHJcblx0XHRcdERCRyBcImRvU3RvcCA9ICN7ZG9TdG9wfSwgQ2xvc2luZyB3YXRjaGVyXCJcclxuXHRcdFx0YnJlYWtcclxuXHRcdGZvciBwYXRoIG9mIGZzRXZlbnQucGF0aHNcclxuXHRcdFx0IyAtLS0gZnNDYWxsYmFjayB3aWxsIGJlIChldmVudHVhbGx5KSBjYWxsZWRcclxuXHRcdFx0aGFuZGxlci5oYW5kbGUgZnNFdmVudFxyXG5leHBvcnQgd2F0Y2hGaWxlIDo9IHdhdGNoRmlsZXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGF0Y2hGaXJzdExpbmUgOj0gKHBhdGg6IHN0cmluZywgc3RyOiBzdHJpbmcsIG5ld3N0cjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHQjIC0tLSBSZXBsYWNlIHN0ciB3aXRoIG5ld3N0ciwgYnV0IG9ubHkgb24gZmlyc3QgbGluZVxyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0bmxQb3MgOj0gY29udGVudHMuaW5kZXhPZiBcIlxcblwiXHJcblx0c3RyUG9zIDo9IGNvbnRlbnRzLmluZGV4T2Ygc3RyXHJcblx0aWYgKHN0clBvcyAhPSAtMSkgJiYgKChubFBvcyA9PSAtMSkgfHwgKHN0clBvcyA8IG5sUG9zKSlcclxuXHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgY29udGVudHMucmVwbGFjZShzdHIsIG5ld3N0cilcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnJvbUpzb25GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiBoYXNoID0+XHJcblxyXG5cdGlmIGlzRmlsZShwYXRoKVxyXG5cdFx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRcdGlmIGlzRW1wdHkoY29udGVudHMpXHJcblx0XHRcdHJldHVybiB7fVxyXG5cdFx0cmVzdWx0IDo9IHBhcnNlSlNPTkMoY29udGVudHMpXHJcblx0XHRyZXR1cm4gZGVmaW5lZChyZXN1bHQpID8gcmVzdWx0IGFzIGhhc2ggOiB7fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB7fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pzb25GaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0ZGF0YTogaGFzaFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDMpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFkZEpzb25WYWx1ZSA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRoRGF0YSA6PSBmcm9tSnNvbkZpbGUocGF0aClcclxuXHRpZiBkZWZpbmVkKGhEYXRhKSAmJiBpc0hhc2goaERhdGEpXHJcblx0XHRoRGF0YVtrZXldID0gdmFsdWVcclxuXHRcdHRvSnNvbkZpbGUgcGF0aCwgaERhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaW5TYW1lRGlyIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHR7ZGlyfSA6PSBwYXJzZVBhdGgocGF0aClcclxuXHRuZXdwYXRoIDo9IG1rcGF0aChkaXIsIGZpbGVOYW1lKVxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIG5ld3BhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVtb3ZlQ1IgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFxyJywgJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2x1cnAgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXHJcblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycEFzeW5jIDo9IGFzeW5jIChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBwYXRoXHJcblx0cmV0dXJuIGRlZmluZWQoZGF0YSkgPyByZW1vdmVDUihkYXRhKSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhTdHIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRyb290OiBzdHJpbmcgPSAnLidcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZSByb290LCBwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNwbGl0UGF0dGVybnMgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmdbXSxcclxuXHRcdCk6IFtzdHJpbmdbXSwgc3RyaW5nW11dID0+XHJcblxyXG5cdHR5cGUgVEFjY3VtID0gW3N0cmluZ1tdLCBzdHJpbmdbXV1cclxuXHJcblx0YWNjMDogVEFjY3VtIDo9IFtbXSxbXV1cclxuXHRhY2N1bSA6PSBNQVAgbFBhdHRlcm5zLCBhY2MwLCAocGF0OiBzdHJpbmcsIGFjYzogVEFjY3VtKTogVEFjY3VtIC0+XHJcblx0XHRbbFBvcywgbE5lZ10gOj0gYWNjXHJcblx0XHRsTWF0Y2hlcyA6PSBwYXQubWF0Y2ggLy8vXiBcXCEgXFxzKyAoLiopICQvLy9cclxuXHRcdHJldHVybiAoXHJcblx0XHRcdCAgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdFx0PyBbIGxQb3MsICAgICAgICAgICAgICBsTmVnLmNvbmNhdChsTWF0Y2hlc1sxXSldXHJcblx0XHRcdDogWyBsUG9zLmNvbmNhdChwYXQpLCAgbE5lZyAgICAgICAgICAgICAgICAgICAgXVxyXG5cdFx0XHQpXHJcblx0cmV0dXJuIGFjY3VtXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRJdGVyYXRvclxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRmlsZXNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxQYXRocyA6PSBBcnJheS5mcm9tKGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuXHJcbiMgICAgICAgICAgQnkgZGVmYXVsdCwgaWdub3JlcyBhbnl0aGluZyBpbnNpZGUgYSBmb2xkZXJcclxuIyAgICAgICAgICAgICAgICAgICAgICBuYW1lZCAnLnRlbXAnIG9yICcuc2F2ZSdcclxuXHJcbmV4cG9ydCBhbGxGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaFxyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHRpbmNsdWRlRGlyczogYm9vbGVhblxyXG5cdFx0fVxyXG5cclxuXHR7cm9vdCwgaE1vcmVHbG9iT3B0aW9ucywgbElnbm9yZURpcnMsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0bElnbm9yZURpcnM6IFsnLnRlbXAnLCAnLnNhdmUnXVxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnNcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdGxNb3JlUGF0dGVybnMgOj0gKFxyXG5cdFx0ICBkZWZpbmVkKGxJZ25vcmVEaXJzKVxyXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+IFwiISAqKi8je3h9LyoqXCIpXHJcblx0XHQ6IFtdXHJcblx0XHQpXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zLmNvbmNhdChsTW9yZVBhdHRlcm5zLi4uKVxyXG5cdGlmIGlzRW1wdHkobFBvc1BhdHMpXHJcblx0XHRyZXR1cm5cclxuXHRpZiBub25FbXB0eShsTmVnUGF0cylcclxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcclxuXHRpZiBkZWJ1Z2dpbmdcclxuXHRcdExPRyBcIlBBVFRFUk5TOlwiXHJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRcdExPRyBcIiAgIFBPUzogI3twYXR9XCJcclxuXHRcdGZvciBwYXQgb2YgbE5lZ1BhdHNcclxuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxyXG5cdHNldFNraXAgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRmb3IgZW50cnkgb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdHtwYXRofSA6PSBlbnRyeVxyXG5cdFx0XHRpZiBub3Qgc2V0U2tpcC5oYXMocGF0aClcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIlBBVEg6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGhPcHRpb25zIGdldHMgcGFzc2VkIHRvIGFsbEZpbGVzTWF0Y2hpbmcoKVxyXG5cclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdH1cclxuXHR7cm9vdCwgbElnbm9yZURpcnN9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRsSWdub3JlRGlyczogWycudGVtcCcsICcuc2F2ZSddXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHRwYXQgOj0gcm9vdCA/IFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiIDogXCIqKi8je2ZpbGVOYW1lfVwiXHJcblxyXG5cdCMgTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbEZpbGVzTWF0Y2hpbmcgcGF0LCB7XHJcblx0XHRsSWdub3JlRGlyc1xyXG5cdFx0fVxyXG5cdERCR1ZBTFVFICdsUGF0aHMnLCBsUGF0aHNcclxuXHRzd2l0Y2ggbFBhdGhzLmxlbmd0aFxyXG5cdFx0Y2FzZSAxOlxyXG5cdFx0XHRwYXRoIDo9IGxQYXRoc1swXVxyXG5cdFx0XHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vdCBhIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBwYXRoXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEdFTkVSQVRPUlxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRGlyc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbERpcnMgOj0gQXJyYXkuZnJvbShhbGxEaXJzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuL3NyY1xyXG5cclxuZXhwb3J0IGFsbERpcnNNYXRjaGluZyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRpbmNsdWRlRGlyczogdHJ1ZVxyXG5cdFx0Zm9sbG93U3ltbGlua3M6IGZhbHNlXHJcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHQuLi5oTW9yZUdsb2JPcHRpb25zXHJcblx0XHR9XHJcblx0bEFsbFBhdHRlcm5zOiBzdHJpbmdbXSA6PSAoXHJcblx0XHQgIGlzU3RyaW5nKGxQYXR0ZXJucylcclxuXHRcdD8gW2xQYXR0ZXJuc11cclxuXHRcdDogbFBhdHRlcm5zXHJcblx0XHQpXHJcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsQWxsUGF0dGVybnNcclxuXHRpZiBsTmVnUGF0cy5sZW5ndGggPiAwXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpICYmIGlzRGlyKHBhdGgpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJESVI6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aEluZm8gPVxyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGRpcjogc3RyaW5nXHJcblx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdHN0dWI6IHN0cmluZ1xyXG5cdHB1cnBvc2U6IHN0cmluZz9cclxuXHRleHQ6IHN0cmluZz9cclxuXHJcbmV4cG9ydCBwYXJzZVBhdGggOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoSW5mbyA9PlxyXG5cclxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcclxuXHRcdHBhdGggPSBmcm9tRmlsZVVybChwYXRoKVxyXG5cdHtyb290LCBkaXIsIGJhc2V9IDo9IHBhcnNlRmlsZVBhdGggcGF0aFxyXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xyXG5cdG5QYXJ0cyA6PSBsUGFydHMubGVuZ3RoXHJcblx0bGV0IHJlZjFcclxuXHRzd2l0Y2ggblBhcnRzXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBwYXRoOiAje3BhdGh9XCIpXHJcblx0XHR3aGVuIDFcclxuXHRcdFx0cmVmMSA9IGJhc2VcclxuXHRcdHdoZW4gMlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzLnNsaWNlKDAsIC0yKS5qb2luKCcuJylcclxuXHRzdHViIDo9IHJlZjFcclxuXHRyZXR1cm4ge1xyXG5cdFx0cm9vdDogbm9ybWFsaXplUGF0aChyb290KVxyXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcclxuXHRcdGZpbGVOYW1lOiBiYXNlXHJcblx0XHRzdHViXHJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcclxuXHRcdGV4dDogaWYgKG5QYXJ0cyA+IDEpIHRoZW4gXCIuI3tsUGFydHMuYXQoLTEpfVwiIGVsc2UgdW5kZWZcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNGaWxlXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aHJvdyBlcnJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNEaXIgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0dHJ5XHJcblx0XHRzdGF0cyA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdFx0cmV0dXJuIHN0YXRzLmlzRGlyZWN0b3J5XHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aHJvdyBlcnJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcm1GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGlzRmlsZShwYXRoKVxyXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcm1EaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGNsZWFyOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2NsZWFyfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNsZWFyOiBmYWxzZVxyXG5cdFx0fVxyXG5cclxuXHRpZiBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRhc3NlcnQgaXNEaXIocGF0aCksIFwiTm90IGEgZGlyZWN0b3J5OiAje3BhdGh9XCJcclxuXHRcdGlmIGNsZWFyXHJcblx0XHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoLCByZWN1cnNpdmU6IHRydWVcclxuXHRcdGVsc2VcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNWYWxpZFN0dWIgOj0gKHN0dWI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGNoIG9mIFsnLCcsICcvJywgJ1xcXFwnXVxyXG5cdFx0aWYgc3R1Yi5pbmNsdWRlcyhjaClcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIChzdHViICE9ICdhbGwnKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGNvbmZpZ0Zyb21GaWxlIDo9IChcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdCk6IGhhc2ggPT5cclxuXHJcblx0IyAtLS0gY29uZmlnIHNob3VsZCBiZSBhIGhhc2ggbmFtZWQgaENvbmZpZ1xyXG5cclxuXHQjIC0tLSBOT1RFOiBJZiBhIGRlZmluZWQgcGF0aCBpcyByZXR1cm5lZCwgaXQgZGVmaW5pdGVseSBleGlzdHNcclxuXHRwYXRoIDo9IGZpbmRGaWxlIGZpbGVOYW1lXHJcblx0YXNzZXJ0IGRlZmluZWQocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje09MKGZpbGVOYW1lKX1cIlxyXG5cdHtwdXJwb3NlLCBleHR9IDo9IHBhcnNlUGF0aCBwYXRoXHJcblx0YXNzZXJ0IGRlZmluZWQoZXh0KSwgXCJObyBmaWxlIGV4dCBpbiAje09MKHBhdGgpfVwiXHJcblx0YXNzZXJ0IChwdXJwb3NlID09ICdjb25maWcnKSwgXCJOb3QgYSBjb25maWcgZmlsZTogI3tPTChwYXRoKX1cIlxyXG5cdGFzc2VydCBbJy5jaXZldCcsICcudHMnXS5pbmNsdWRlcyhleHQpLCBcIkludmFsaWQgcGF0aDogI3tPTChwYXRoKX1cIlxyXG5cdERCRyBcIkltcG9ydCBjb25maWcgZnJvbSAje09MKHBhdGgpfVwiXHJcblx0dXJsIDo9IChcclxuXHRcdGlmIChleHQgPT0gJy5jaXZldCcpXHJcblx0XHRcdHRzUGF0aCA6PSBhd2FpdCBjaXZldDJ0c0ZpbGUgcGF0aFxyXG5cdFx0XHRwYXRoVG9GaWxlVVJMIHRzUGF0aFxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRwYXRoVG9GaWxlVVJMIHBhdGhcclxuXHRcdClcclxuXHRoIDo9IGF3YWl0IGltcG9ydCB1cmxcclxuXHRyZXR1cm4gaC5oQ29uZmlnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENXcml0YWJsZUZpbGVcclxuXHJcblx0cGF0aDogc3RyaW5nXHJcblx0ZmlsZTogRGVuby5Gc0ZpbGVcclxuXHJcblx0Y29uc3RydWN0b3IoQHBhdGg6IHN0cmluZywgaE9wdGlvbnM6IGhhc2ggPSB7fSlcclxuXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0YXBwZW5kOiBib29sZWFuXHJcblx0XHRcdH1cclxuXHRcdHthcHBlbmR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRhcHBlbmQ6IGZhbHNlXHJcblx0XHRcdH1cclxuXHJcblx0XHRAZmlsZSA9IERlbm8ub3BlblN5bmMgQHBhdGgsIHtcclxuXHRcdFx0d3JpdGU6IHRydWVcclxuXHRcdFx0Y3JlYXRlOiB0cnVlXHJcblx0XHRcdHRydW5jYXRlOiBub3QgYXBwZW5kXHJcblx0XHRcdH1cclxuXHJcblx0d3JpdGUoc3RyOiBzdHJpbmcpXHJcblx0XHRhd2FpdCBAZmlsZS53cml0ZSBlbmNvZGUoc3RyKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdHdyaXRlbG4oc3RyOiBzdHJpbmcpXHJcblx0XHRhd2FpdCBAZmlsZS53cml0ZSBlbmNvZGUoc3RyICsgJ1xcbicpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2xvc2UoKVxyXG5cdFx0QGZpbGUuY2xvc2UoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGFzcyBDUmVhZGFibGVGaWxlXHJcblxyXG5cdHBhdGg6IHN0cmluZ1xyXG5cdGluaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2VcclxuXHRoTWV0YURhdGE6IGhhc2ggPSB7fVxyXG5cdGl0ZXI6IFRBc3luY0l0ZXJhdG9yPHN0cmluZyx2b2lkLHZvaWQ+ID0gZ2V0RW1wdHlBc3luY0l0ZXJhdG9yPHN0cmluZz4oKVxyXG5cdGZpcnN0TGluZTogc3RyaW5nPyA9IHVuZGVmXHJcblxyXG5cdGNvbnN0cnVjdG9yKEBwYXRoOiBzdHJpbmcpXHJcblxyXG5cdGluaXQoKTogdm9pZFxyXG5cclxuXHRcdGFzc2VydCBpc0ZpbGUoQHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tAcGF0aH1cIlxyXG5cdFx0QGl0ZXIgOj0gYWxsTGluZXNJbkZpbGUoQHBhdGgpXHJcblxyXG5cdFx0IyAtLS0gd2UgbmVlZCB0byBnZXQgdGhlIGZpcnN0IGxpbmUgdG8gY2hlY2sgaWZcclxuXHRcdCMgICAgIHRoZXJlJ3MgbWV0YSBkYXRhLiBCdXQgaWYgdGhlcmUgaXMgbm90LFxyXG5cdFx0IyAgICAgd2UgbmVlZCB0byByZXR1cm4gaXQgYnkgdGhlIHJlYWRlclxyXG5cclxuXHRcdGxldCB7dmFsdWUsIGRvbmV9ID0gYXdhaXQgQGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdEBmaXJzdExpbmUgPSB1bmRlZlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh2YWx1ZSlcclxuXHRcdFx0QGZpcnN0TGluZSA9IHZhbHVlXHJcblx0XHRcdCMgLS0tIEdldCBtZXRhIGRhdGEgaWYgcHJlc2VudFxyXG5cdFx0XHRAaE1ldGFEYXRhID0gKFxyXG5cdFx0XHRcdGlmIGlzTWV0YURhdGFTdGFydCh2YWx1ZSlcclxuXHRcdFx0XHRcdGxNZXRhTGluZXM6IHN0cmluZ1tdIDo9IFtdXHJcblx0XHRcdFx0XHR7dmFsdWUsIGRvbmV9ID0gYXdhaXQgQGl0ZXIubmV4dCgpXHJcblx0XHRcdFx0XHR3aGlsZSBub3QgZG9uZSAmJiAodmFsdWUgIT0gQGZpcnN0TGluZSlcclxuXHRcdFx0XHRcdFx0b2J2aW91c2x5IGRlZmluZWQodmFsdWUpXHJcblx0XHRcdFx0XHRcdGxNZXRhTGluZXMucHVzaCB2YWx1ZVxyXG5cdFx0XHRcdFx0XHR7dmFsdWUsIGRvbmV9ID0gYXdhaXQgQGl0ZXIubmV4dCgpXHJcblx0XHRcdFx0XHRpZiAodmFsdWUgPT0gQGZpcnN0TGluZSlcclxuXHRcdFx0XHRcdFx0b2J2aW91c2x5IGRlZmluZWQodmFsdWUpXHJcblx0XHRcdFx0XHRcdEBmaXJzdExpbmUgPSB1bmRlZlxyXG5cdFx0XHRcdFx0XHRnZXRNZXRhRGF0YUhhc2godmFsdWUsIGFycmF5VG9CbG9jayhsTWV0YUxpbmVzKSlcclxuXHRcdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdFx0e31cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHR7fVxyXG5cdFx0XHRcdClcclxuXHRcdEBpbml0aWFsaXplZCA9IHRydWVcclxuXHRcdHJldHVyblxyXG5cclxuXHRtZXRhRGF0YSgpOiBoYXNoXHJcblxyXG5cdFx0aWYgbm90IEBpbml0aWFsaXplZFxyXG5cdFx0XHRhd2FpdCBAaW5pdCgpXHJcblx0XHRyZXR1cm4gQGhNZXRhRGF0YVxyXG5cclxuXHRnZXRMaW5lKCk6IHN0cmluZz9cclxuXHJcblx0XHRpZiBub3QgQGluaXRpYWxpemVkXHJcblx0XHRcdGF3YWl0IEBpbml0KClcclxuXHRcdGlmIGRlZmluZWQoQGZpcnN0TGluZSlcclxuXHRcdFx0c3RyIDo9IEBmaXJzdExpbmVcclxuXHRcdFx0QGZpcnN0TGluZSA9IHVuZGVmXHJcblx0XHRcdHJldHVybiBzdHJcclxuXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGF3YWl0IEBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRyZXR1cm4gdW5kZWZcclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIHZhbHVlIGFzIHN0cmluZ1xyXG5cclxuXHRnZXRDb250ZW50cygpOiBzdHJpbmdcclxuXHJcblx0XHRpZiBub3QgQGluaXRpYWxpemVkXHJcblx0XHRcdGF3YWl0IEBpbml0KClcclxuXHRcdGxMaW5lczogc3RyaW5nW10gOj0gW11cclxuXHRcdGxldCBsaW5lID0gYXdhaXQgQGdldExpbmUoKVxyXG5cdFx0d2hpbGUgZGVmaW5lZChsaW5lKVxyXG5cdFx0XHRsTGluZXMucHVzaCBsaW5lXHJcblx0XHRcdGxpbmUgPSBhd2FpdCBAZ2V0TGluZSgpXHJcblx0XHRyZXR1cm4gbExpbmVzLmpvaW4oJ1xcbicpXHJcbiJdfQ==