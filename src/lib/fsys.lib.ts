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
	allLinesInFile, allLinesInFileSync,
	TIterator, TAsyncIterator,
	fileExt, withExt, getFileStats, encode,
	croak, assert, obviously, emptyIterator, emptyAsyncIterator,
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
	allLinesInFile, allLinesInFileSync,
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
//     returns full path of current file

export const myself = (url: string): string => {

	return toRelPath(fromFileUrl(url))
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

export const isFile = (path: (string | undefined)): boolean => {

	if (notdefined(path)) {
		return false
	}
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

export const isDir = (path: (string | undefined)): boolean => {

	if (notdefined(path)) {
		return false
	}
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

export async function openTextFile(
		path: string,
		eager: true
		): AutoPromise<[hash, string]>

export async function openTextFile(
		path: string,
		eager?: false
		): AutoPromise<[hash, TAsyncIterator<string>]>

export async function openTextFile(
		path: string,
		eager: boolean = false
		): AutoPromise<[hash, string | TAsyncIterator<string>]> {

	assert(isFile(path), `No such file: ${path}`)
	const iter = allLinesInFile(path)

	// --- ASYNC ---
	const getLine = async ():AutoPromise<(string | undefined)> => {
		const {value, done} = await iter.next()
		if (done) {
			return undef
		}
		else {
			return value as string
		}
	}

	// --- we need to get the first line to check if
	//     there's meta data. But if there is not,
	//     we need to return it by the reader

	const firstLine = await getLine()
	if (notdefined(firstLine)) {
		return [{}, (eager ? '' : emptyAsyncIterator<string>())]
	}

	// --- Get meta data if present
	const hasMetaData = isMetaDataStart(firstLine)

	const hMetaData: hash = (
		(await (async ()=>{if (hasMetaData) {
			const lMetaLines: string[] = []
			let line = await getLine()
			while (line && (line !== firstLine)) {
				lMetaLines.push(line)
				line = await getLine()
			}
			return getMetaDataHash(firstLine, arrayToBlock(lMetaLines))
		}
		else {
			return ({})
		}})())
		)

	if (eager) {
		// --- Get all the rest of the lines and join with '\n'
		const lLines = await Array.fromAsync(iter)
		if (hasMetaData) {
			return [hMetaData, lLines.join('\n')]
		}
		else {
			return [{}, [firstLine, ...lLines].join('\n')]
		}
	}
	else {
		// --- generator that allows reading contents
		const reader = async function*(): TAsyncIterator<string> {
			if (!hasMetaData) {
				yield firstLine
			}
			let line = await getLine()
			while (defined(line)) {
				yield line
				line = await getLine()
			}
			return
		}
		return [hMetaData, reader()]
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export const openAndReadTextFile = async function(
		path: string
		): AutoPromise<[hash, string]> {

	const [hMetaData, reader] = await openTextFile(path)
	const lLines = await Array.fromAsync(reader)
	return [hMetaData, lLines.join('\n')]
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
// ASYNC

export const openForWrite = async (path: string): AutoPromise<Deno.FsFile> => {

	return await Deno.open(path, {
		write: true,
		create: true,
		truncate: true
		})
}

// ---------------------------------------------------------------------------
// ASYNC

export const writeLine = async (file: Deno.FsFile, str: string): AutoPromise<void> => {

	await file.write(encode(str + '\n'))
	return
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
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCO0FBQ2xELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsK0JBQStCO0FBQzVELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ3ZDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQ25CLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNyQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUMzQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtBQUNoQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM3QyxDQUFDLGFBQWEsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUMzQixDQUFDLGNBQWMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDO0FBQ3BDLENBQUMsU0FBUyxDQUFDLENBQUMsY0FBYyxDQUFDO0FBQzNCLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3hDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsa0JBQWtCLENBQUM7QUFDN0QsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU07QUFDZCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO0FBQy9DLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsZ0JBQWdCLENBQUM7QUFDM0QsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDcEQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDbkIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtBQUMxQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNwQixDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN4QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUNqQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDMUQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNyQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDcEMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3RDLENBQUMsY0FBYyxDQUFDLENBQUMsa0JBQWtCLENBQUM7QUFDcEMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxZQUFZLENBQUM7QUFDaEMsQ0FBQyxDQUFDO0FBQ0YsQUFBQTtBQUNBLEFBQUEsaURBQWdEO0FBQ2hELEFBQUEsNEJBQTJCO0FBQzNCLEFBQUE7QUFDQSxBQUFBLEFBQUksTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJO0FBQ3ZCLEFBQUEsQUFBQSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTztBQUMzQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSxxQkFBb0I7QUFDcEIsQUFBQSxvREFBbUQ7QUFDbkQsQUFBQSxzREFBcUQ7QUFDckQsQUFBQSxrREFBaUQ7QUFDakQsQUFBQSx3Q0FBdUM7QUFDdkMsQUFBQSw2Q0FBNEM7QUFDNUMsQUFBQSw0Q0FBMkM7QUFDM0MsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSxxREFBb0Q7QUFDcEQsQUFBQSw0REFBMkQ7QUFDM0QsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVM7QUFDMUUsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNwRCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEM7QUFBQyxDQUFBO0FBQzVFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNuRCxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN4QixBQUFBLEVBQUUsTUFBTSxDQUFDLFM7Q0FBUyxDQUFBO0FBQ2xCLEFBQUEsQ0FBRSxNQUFELENBQUMsQ0FBQyxDQUFFLENBQUMsWUFBWSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNULEFBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxTQUFTLENBQUMsQ0FBQyxNQUFNO0FBQzdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEtBQUs7QUFDNUIsRUFBRSxDQUFDLG9CQUFvQixTQUFTO0FBQ2hDLEVBQUUsQztBQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2Q0FBNEM7QUFDN0MsQUFBQSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQSxBQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxHQUFHLEM7QUFBQyxDQUFBO0FBQ3pELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN2QyxBQUFBO0FBQ0EsQUFBQSxDQUFHLE1BQUYsRUFBRSxDQUFDLENBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQzFCLEFBQUEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO0FBQ2QsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLE9BQU8sQ0FBQSxBQUFDLEdBQUcsTUFBTSxDQUFBO0FBQzFCLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDO0FBQUMsQ0FBQTtBQUMxRCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxNQUFNLEMsQyxDQUFDLEFBQUMsTSxZLENBQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNsRCxBQUFBO0FBQ0EsQUFBQSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsR0FBRyxDQUFBLEFBQUMsTUFBTSxDQUFDLENBQUssUSxDQUFKLENBQUMsQ0FBQyxDQUFDLENBQUcsQ0FBQTtBQUMzQyxBQUFBLEVBQUUsR0FBRyxDQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDaEIsQUFBQSxHQUFHLFNBQVMsQ0FBQSxBQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN2QixBQUFBLEdBQUcsOENBQTZDO0FBQ2hELEFBQUEsR0FBRywrQ0FBOEM7QUFDakQsQUFBQSxHQUFXLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFBLEFBQUMsQ0FBRyxDQUFDLEFBQ3ZCLEdBQUcsQUFDRixFQUFFLENBQUMsQUFBQyxNQUFNLEFBQ1YsRUFBRSxBQUNILEtBQUssQUFDTCxNQUFNLENBQUMsQUFDUCxDQUFDLENBQUcsQ0FBQTtBQUNSLEFBQUEsR0FBRyxHQUFHLENBQUEsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QixBQUFBLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEM7R0FBQyxDO0VBQUEsQ0FBQTtBQUNyQixBQUFBLEVBQUUsTTtDQUFNLENBQUEsQ0FBQSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFBLEFBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQztBQUFBLENBQUE7QUFDekMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDekIsQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU07QUFDWixBQUFBLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtBQUNiLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNqQixDQUFDLENBQUM7QUFDRixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBWSxNQUFYLFdBQVcsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLENBQUMsSUFBSSxDLENBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0FBQ3hCLEFBQUEsQ0FBWSxNQUFYLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBRSxDQUFDLEtBQUssQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUMxQixBQUFBLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDVCxBQUFBLEVBQUUsR0FBRyxDQUFBO0FBQ0wsQUFBQSxFQUFFLElBQUksQ0FBQTtBQUNOLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO0FBQ2hELEVBQUUsQztBQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSxxREFBb0Q7QUFDcEQsQUFBQSx3Q0FBdUM7QUFDdkMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDekMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFBLEFBQUMsV0FBVyxDQUFBLEFBQUMsR0FBRyxDQUFBLEM7QUFBQSxDQUFBO0FBQ2pDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNoQixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNuQixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTztBQUNqQixFQUFFLENBQUM7QUFDSCxBQUFBLENBQVMsTUFBUixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQ3hDLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxLQUFLO0FBQ2YsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxDQUFDLGFBQWEsQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUNuQixBQUFBLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLE1BQU0sQ0FBQSxBQUFDLFFBQVEsQ0FBQTtBQUN4QixBQUFBLENBQUMsR0FBRyxDQUFBLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQixBQUFBLEVBQUUsY0FBYyxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDO0NBQUEsQ0FBQTtBQUMzQixBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQztDQUFBLENBQUE7QUFDL0IsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFhLE1BQVosWUFBWSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDbkIsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU07QUFDYixFQUFFLENBQUM7QUFDSCxBQUFBLENBQU0sTUFBTCxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxRQUFRO0FBQ2YsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQSxBQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDcEQsQUFBQSxDQUFDLElBQUksQ0FBQSxBQUFDLFlBQVksQ0FBQyxDQUFDLFFBQVEsQ0FBQTtBQUM1QixBQUFBLENBQUMsTUFBTSxDQUFDLFk7QUFBWSxDQUFBO0FBQ3BCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN6QyxBQUFBO0FBQ0EsQUFBQSxDQUFHLE1BQUYsRUFBRSxDQUFDLENBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSztBQUMvQixBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2pELEFBQUEsQ0FBQyxNQUFNLENBQUMsRTtBQUFFLENBQUE7QUFDVixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQW9CLE1BQW5CLG1CQUFtQixDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQy9CLEFBQUEsRUFBRSxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDbEIsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLE1BQU0sSUFBSSw4QkFBNkI7QUFDbkQsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZCQUE0QjtBQUM3QixBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN2RCxBQUFBO0FBQ0EsQUFBQSxDQUFDLHNEQUFxRDtBQUN0RCxBQUFBLENBQUMsR0FBRyxDQUFBLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzVCLEFBQUEsRUFBRSxNQUFNLENBQUEsQUFBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQTtBQUMvRCxBQUFBLEVBQUUsUUFBUSxDLENBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQ0FBQTtBQUN2QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDNUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLO0NBQUssQ0FBQTtBQUNkLEFBQUEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDO0FBQUMsQ0FBQTtBQUM1QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDakIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNsQixBQUFBLEVBQUUsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLO0FBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsRUFBRSxzQ0FBcUM7QUFDdkMsQUFBQSxFQUFFLFlBQVksQ0FBQSxBQUFDLE9BQU8sQztDQUFBLENBQUE7QUFDdEIsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLGFBQWEsQ0FBQSxBQUFDLE9BQU8sQztDQUFBLENBQUE7QUFDdkIsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQTtBQUNyRCxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDN0MsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3pDLEFBQUEsRUFBRSxZQUFZLENBQUEsQUFBQyxPQUFPLEM7Q0FBQSxDQUFBO0FBQ3RCLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBRSxLQUFLLENBQUEsQUFBQyxPQUFPLEM7Q0FBQSxDQUFBO0FBQ2YsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFjLE1BQWIsYUFBYSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQy9DLEFBQUE7QUFDQSxBQUFBLENBQWUsTUFBZCxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUUsQ0FBQyxXQUFXLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDbkMsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUk7QUFDZixBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQyxFQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkIsQUFBQSxFQUFFLEtBQUssQ0FBQSxBQUFDLEdBQUcsQztDQUFBLENBQUE7QUFDWCxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPO0FBQzVFLEFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0gsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFBLENBQUE7QUFDN0IsQUFBQSxDQUFDLE9BQU8sQ0FBQyxDQUFDLGVBQWUsQ0FBQyx3QkFBdUI7QUFDakQsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEMsQ0FBQSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJO0FBQ3ZCLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsV0FBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQzVELEFBQUEsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2QsQUFBQSxHQUFHLE1BQU0sQ0FBQyxDQUFDLFNBQVM7QUFDcEIsQUFBQSxHQUFHLFVBQVUsQ0FBQyxDQUFDLE1BQU07QUFDckIsR0FBRyxDQUFDO0FBQ0osQUFBQSxFQUErQixNQUE3QixDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQSxDQUFBO0FBQzVELEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDZixBQUFBLEdBQUcsVUFBVSxDQUFDLENBQUMsR0FBRyxDO0VBQUEsQ0FBQSxDQUFBO0FBQ2xCLEFBQUEsRUFBRSxJLENBQUMsTUFBTSxDLENBQUUsQ0FBQyxPQUFPO0FBQ25CLEFBQUEsRUFBVSxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsUUFBUSxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsVUFBVSxDQUFBO0FBQzNDLEFBQUEsRUFBRSxJLENBQUMsT0FBTyxDLENBQUUsQ0FBQyxRQUFRO0FBQ3JCLEFBQUEsRUFBRSxHQUFHLENBQUEsQUFBQyx1Q0FBdUMsQztDQUFBLENBQUE7QUFDN0MsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQSxDQUFDLG9EQUFtRDtBQUNwRCxBQUFBO0FBQ0EsQUFBQSxDLE1BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQy9CLEFBQUEsRUFBZSxNQUFiLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLE9BQU87QUFDMUIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN4RCxBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxHQUFHLEksQ0FBQyxPQUFPLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEM7RUFBQSxDQUFBO0FBQ3RCLEFBQUEsRUFBRSxNO0NBQU0sQztBQUFBLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSxRQUFPO0FBQ1AsQUFBQTtBQUNBLEFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0gsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDLE1BSVYsUUFKVyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDMUIsQUFBQSxFQUFFLFNBQVMsQ0FBQyxDQUFDLGVBQWUsQ0FBQztBQUM3QixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckIsRUFBRSxDQUFDLEMsQyxXLENBQUMsQUFBQyxJLENBQUksQ0FBRyxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsQ0FBQyxnRUFBK0Q7QUFDaEUsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsVUFBVSxDQUFDLENBQUMsTUFBTTtBQUNwQixFQUFFLENBQUM7QUFDSCxBQUFBLENBQWEsTUFBWixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQzVDLEFBQUEsRUFBRSxVQUFVLENBQUMsQ0FBQyxHQUFHO0FBQ2pCLEVBQUUsQ0FBQyxDQUFBO0FBQ0gsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsQUFBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3pCLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUM3QixBQUFBLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSztBQUM1QixBQUFBLENBQTRCLE1BQTNCLFVBQVUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNyRCxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUNoQyxBQUFBLEVBQUUsR0FBRyxDQUFBLEFBQUMsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQTtBQUMvQixBQUFBLEVBQUUsR0FBRyxDQUFBLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDO0VBQUMsQ0FBQTtBQUNsQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUM1RCxBQUFBLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUEsQ0FBQSxDQUFBO0FBQzFCLEFBQUEsRUFBa0IsTUFBaEIsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQyxJQUFJO0FBQzFCLEFBQUEsRUFBRSxHQUFHLENBQUEsQUFBQyxxQkFBcUIsQ0FBQTtBQUMzQixBQUFBLEVBQUUsR0FBRyxDQUFBLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUE7QUFDNUMsQUFBQSxHQUFHLEs7RUFBSyxDQUFBO0FBQ1IsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUMzQixBQUFBLEdBQUcsNkNBQTRDO0FBQy9DLEFBQUEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDO0VBQUEsQztDQUFBLEM7QUFBQSxDQUFBO0FBQ3pCLEFBQUEsQUFBQSxNQUFNLENBQVUsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLFVBQVU7QUFDOUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFlLE1BQWQsY0FBYyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdFLEFBQUE7QUFDQSxBQUFBLENBQUMsc0RBQXFEO0FBQ3RELEFBQUEsQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ3ZDLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUMvQixBQUFBLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUEsQUFBQyxHQUFHLENBQUE7QUFDL0IsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3pELEFBQUEsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDO0NBQUEsQ0FBQTtBQUM1RCxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDOUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNoQixBQUFBLEVBQVUsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUN4QyxBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdEIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEM7RUFBQyxDQUFBO0FBQ1osQUFBQSxFQUFRLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO0FBQ2hDLEFBQUEsRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDO0NBQUMsQ0FBQTtBQUM5QyxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsQztDQUFDLEM7QUFBQSxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDZCxBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSTtBQUNaLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQzNELEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBYSxNQUFaLFlBQVksQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN4QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFBO0FBQ2QsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtBQUNiLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPO0FBQ2hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztBQUM1QixBQUFBLENBQUMsR0FBRyxDQUFBLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNuQyxBQUFBLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDLENBQUUsQ0FBQyxLQUFLO0FBQ3BCLEFBQUEsRUFBRSxVQUFVLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEM7Q0FBQSxDQUFBO0FBQ3hCLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNyQixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLE1BQU07QUFDbEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFNLE1BQUwsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQztBQUN6QixBQUFBLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDakMsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUEsQUFBQyxPQUFPLEM7QUFBQSxDQUFBO0FBQzdCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDO0FBQUEsQ0FBQTtBQUMvQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDekMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQzdDLEFBQUEsQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ25DLEFBQUEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEU7QUFBRSxDQUFBO0FBQzNDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEMsQyxXLENBQUMsQUFBQyxNLENBQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNwRCxBQUFBO0FBQ0EsQUFBQSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUNyQyxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFO0FBQUUsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDbkIsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQTtBQUNkLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUc7QUFDcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUEsQUFBQyxRQUFRLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUEsQztBQUFBLENBQUE7QUFDekMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFjLE1BQWIsYUFBYSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3pCLEFBQUEsRUFBRSxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3RCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzVCLEFBQUE7QUFDQSxBQUFBLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNuQyxBQUFBO0FBQ0EsQUFBQSxDQUFhLE1BQVosSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFBLEFBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQW9DLFFBQW5DLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUcsQ0FBQTtBQUNwRSxBQUFBLEVBQWMsTUFBWixDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxHQUFHO0FBQ3JCLEFBQUEsRUFBVSxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQSxBQUFDLENBQUcsQ0FBQyxBQUFDLEVBQUUsQUFBQyxFQUFFLENBQUMsQUFBQyxJQUFJLEFBQUMsQ0FBQyxDQUFHLENBQUE7QUFDN0MsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ1YsQUFBQSxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDdEIsQUFBQSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNuRCxBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQztBQUNuRCxHQUFHLEM7Q0FBQyxDQUFBLENBQUE7QUFDSixBQUFBLENBQUMsTUFBTSxDQUFDLEs7QUFBSyxDQUFBO0FBQ2IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUEsWUFBVztBQUNYLEFBQUEsRUFBQztBQUNELEFBQUEsZUFBYztBQUNkLEFBQUEsNENBQTJDO0FBQzNDLEFBQUEsY0FBYTtBQUNiLEFBQUEsc0RBQXFEO0FBQ3JELEFBQUEsRUFBQztBQUNELEFBQUEsdUNBQXNDO0FBQ3RDLEFBQUEsd0RBQXVEO0FBQ3ZELEFBQUEsZ0RBQStDO0FBQy9DLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFpQixNQUFoQixnQkFBZ0IsQ0FBQyxDQUFFLENBR0gsUSxDQUhJLENBQUM7QUFDNUIsQUFBQSxFQUFFLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUMvQixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUcsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTTtBQUNkLEFBQUEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLElBQUk7QUFDeEIsQUFBQSxFQUFFLFdBQVcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZCLEFBQUEsRUFBRSxXQUFXLENBQUMsQ0FBQyxPQUFPO0FBQ3RCLEVBQUUsQ0FBQztBQUNILEFBQUE7QUFDQSxBQUFBLENBQ0csTUFERixDQUFDLElBQUksQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsV0FBVztBQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUNsQyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQ1osQUFBQSxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDdkIsQUFBQSxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUE7QUFDbEMsQUFBQSxHQUFHLFdBQVcsQ0FBQyxDQUFDLEtBQUs7QUFDckIsR0FBRyxDQUFDLENBQUE7QUFDSixBQUFBO0FBQ0EsQUFBQSxDQUFtQixNQUFsQixZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDeEIsQUFBQSxFQUFFLElBQUksQ0FBQTtBQUNOLEFBQUEsRUFBRSxXQUFXLENBQUE7QUFDYixBQUFBLEVBQUUsY0FBYyxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDckIsQUFBQSxFQUFFLEdBQUcsZ0JBQWdCO0FBQ3JCLEVBQUUsQ0FBQztBQUNILEFBQUE7QUFDQSxBQUFBLENBQXVCLE1BQXRCLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztBQUN4RSxBQUFBLENBQWMsTUFBYixhQUFhLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDbkIsQUFBQSxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDeEIsQUFBQSxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxQyxBQUFBLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLEVBQUUsQ0FBQztBQUNILEFBQUE7QUFDQSxBQUFBLENBQXFCLE1BQXBCLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLGFBQWEsQ0FBQSxBQUFDLFlBQVksQ0FBQyxNQUFNLENBQWMsR0FBYixhQUFnQixDQUFDLENBQUE7QUFDNUUsQUFBQSxDQUFDLEdBQUcsQ0FBQSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUEsQ0FBQyxHQUFHLENBQUEsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN0QixBQUFBLEVBQUUsWUFBWSxDQUFDLE9BQU8sQyxDQUFFLENBQUMsUTtDQUFRLENBQUE7QUFDakMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxTQUFTLENBQUEsQ0FBQSxDQUFBO0FBQ2IsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLFdBQVcsQ0FBQTtBQUNqQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdCLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxLQUFLLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDaEQsQUFBQSxHQUFTLE1BQU4sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLENBQUMsS0FBSztBQUNsQixBQUFBLEdBQUcsR0FBRyxDQUFBLENBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDM0IsQUFBQSxJQUFJLEdBQUcsQ0FBQSxTQUFTLENBQUEsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsS0FBSyxHQUFHLENBQUEsQUFBQyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxDO0lBQUEsQ0FBQTtBQUN4QixBQUFBLElBQVMsTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUM7QUFDaEMsQUFBQSxJQUFJLEtBQUssQ0FBQyxLQUFLO0FBQ2YsQUFBQSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUEsQUFBQyxJQUFJLEM7R0FBQSxDO0VBQUEsQztDQUFBLENBQUE7QUFDcEIsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUEsaURBQWdEO0FBQ2hELEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFvQixNQUFuQixtQkFBbUIsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUMvQixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2xCLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDOUMsQUFBQSxHQUFHLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMvQyxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNoRCxBQUFBLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQSxBQUFDLElBQUksQztDQUFBLENBQUE7QUFDdEIsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDbEIsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDLEMsQ0FBQyxBQUFDLE0sWSxDQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZixBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTTtBQUNkLEFBQUEsRUFBRSxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN2QixFQUFFLENBQUM7QUFDSCxBQUFBLENBQW9CLE1BQW5CLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDbkQsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUNYLEFBQUEsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNqQyxFQUFFLENBQUMsQ0FBQTtBQUNILEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQTtBQUNuRCxBQUFBLENBQUksTUFBSCxHQUFHLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxvREFBbUQ7QUFDcEQsQUFBQSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsZ0JBQWdCLENBQUEsQUFBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzdDLEFBQUEsRUFBRSxXQUFXO0FBQ2IsRUFBRSxDQUFDLENBQUEsQ0FBQTtBQUNILEFBQUEsQ0FBQyxRQUFRLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDMUIsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ1QsQUFBQSxHQUFPLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsR0FBRyxNQUFNLENBQUEsQUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2pELEFBQUEsR0FBRyxNQUFNLENBQUMsSUFBSTtBQUNkLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ1QsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLQUFLO0FBQ2YsQUFBQSxFQUFFLE9BQU8sQ0FBQztBQUNWLEFBQUEsR0FBRyxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQSxBQUFDLElBQUksQztHQUFBLENBQUE7QUFDcEIsQUFBQSxHQUFHLEtBQUssQ0FBQSxBQUFDLENBQUMseUJBQXlCLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQTtBQUMvQyxBQUFBLEdBQUcsTUFBTSxDQUFDLEU7Q0FBRSxDO0FBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFlBQVc7QUFDWCxBQUFBLEVBQUM7QUFDRCxBQUFBLGVBQWM7QUFDZCxBQUFBLDJDQUEwQztBQUMxQyxBQUFBLGNBQWE7QUFDYixBQUFBLG9EQUFtRDtBQUNuRCxBQUFBLEVBQUM7QUFDRCxBQUFBLDJDQUEwQztBQUMxQyxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBZ0IsTUFBZixlQUFlLENBQUMsQ0FBRSxDQUdGLFEsQ0FIRyxDQUFDO0FBQzNCLEFBQUEsRUFBRSxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDL0IsQUFBQSxFQUFFLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUcsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSxDQUFtQixNQUFsQixZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDeEIsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUNYLEFBQUEsRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDbkIsQUFBQSxFQUFFLGNBQWMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUN2QixBQUFBLEVBQUUsWUFBWSxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3JCLEFBQUEsRUFBRSxHQUFHLGdCQUFnQjtBQUNyQixFQUFFLENBQUM7QUFDSCxBQUFBLENBQXVCLE1BQXRCLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDNUIsQUFBQSxJQUFJLFFBQVEsQ0FBQyxTQUFTLENBQUM7QUFDdkIsQUFBQSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUNmLEFBQUEsRUFBRSxDQUFDLENBQUMsU0FBUztBQUNiLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBcUIsTUFBcEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsYUFBYSxDQUFBLEFBQUMsWUFBWSxDQUFBO0FBQ25ELEFBQUEsQ0FBQyxHQUFHLENBQUEsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QixBQUFBLEVBQUUsWUFBWSxDQUFDLE9BQU8sQyxDQUFFLENBQUMsUTtDQUFRLENBQUE7QUFDakMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxTQUFTLENBQUEsQ0FBQSxDQUFBO0FBQ2IsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLFdBQVcsQ0FBQTtBQUNqQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdCLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2pELEFBQUEsR0FBRyxHQUFHLENBQUEsQ0FBSSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzFDLEFBQUEsSUFBSSxHQUFHLENBQUEsU0FBUyxDQUFBLENBQUEsQ0FBQTtBQUNoQixBQUFBLEtBQUssR0FBRyxDQUFBLEFBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsQztJQUFBLENBQUE7QUFDdkIsQUFBQSxJQUFTLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO0FBQ2hDLEFBQUEsSUFBSSxLQUFLLENBQUMsS0FBSztBQUNmLEFBQUEsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFBLEFBQUMsSUFBSSxDO0dBQUEsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ3BCLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNO0FBQ2IsQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU07QUFDWixBQUFBLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTTtBQUNqQixBQUFBLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtBQUNiLEFBQUEsQ0FBQyxPQUFPLEMsQyxDQUFDLEFBQUMsTSxZLENBQU87QUFDakIsQUFBQSxDQUFDLEdBQUcsQyxDLENBQUMsQUFBQyxNLFksQztBQUFPLENBQUE7QUFDYixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNoRCxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQSxBQUFDLGFBQWEsQ0FBQSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3JDLEFBQUEsRUFBRSxJQUFJLEMsQ0FBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEM7Q0FBQyxDQUFBO0FBQzFCLEFBQUEsQ0FBa0IsTUFBakIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLENBQUMsYUFBYSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ3hDLEFBQUEsQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQSxBQUFDLEdBQUcsQ0FBQTtBQUN6QixBQUFBLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNO0FBQ3hCLEFBQUEsQ0FBQyxHQUFHLENBQUMsSUFBSTtBQUNULEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxNQUFNLENBQUEsQ0FBQSxDQUFBO0FBQ2QsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDVCxBQUFBLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUN2QyxBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDUixBQUFBLEdBQUcsSUFBSSxDLENBQUUsQ0FBQyxJQUFJLE87RUFBQSxDQUFBO0FBQ2QsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1IsQUFBQSxHQUFHLElBQUksQyxDQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPO0VBQUEsQ0FBQTtBQUNuQixBQUFBLEVBQUUsT0FBTyxDQUFDO0FBQ1YsQUFBQSxHQUFHLElBQUksQyxDQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEM7Q0FBQyxDQUFBO0FBQ3ZDLEFBQUEsQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUNiLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNULEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDM0IsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUN6QixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxJQUFJLENBQUE7QUFDTixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQyxDQUFLLENBQUMsS0FBMUIsQ0FBK0IsQ0FBQTtBQUN4RCxBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEMsQ0FBQyxDLENBQUssQ0FBQyxLQUFoQyxDQUFxQztBQUMxRCxDQUFDLEM7QUFBQyxDQUFBO0FBQ0YsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQyxDLENBQUMsQUFBQyxNLFksQ0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDNUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFDLEs7Q0FBSyxDQUFBO0FBQ2QsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFBO0FBQ0osQUFBQSxFQUFPLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxZQUFZLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDNUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTTtDQUFNLENBQUE7QUFDckIsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFBO0FBQzFDLEFBQUEsR0FBRyxNQUFNLENBQUMsSztFQUFLLENBQUE7QUFDZixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEdBQUcsS0FBSyxDQUFDLEc7RUFBRyxDO0NBQUEsQztBQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDLEMsQ0FBQyxBQUFDLE0sWSxDQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxNQUFNLENBQUMsSztDQUFLLENBQUE7QUFDZCxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUE7QUFDSixBQUFBLEVBQU8sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLFlBQVksQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUM1QixBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXO0NBQVcsQ0FBQTtBQUMxQixBQUFBLENBQUMsS0FBSyxDQUFDLENBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLO0VBQUssQ0FBQTtBQUNmLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxLQUFLLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDO0NBQUEsQ0FBQTtBQUN0QixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDakIsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNmLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNiLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPO0FBQ2hCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBUSxNQUFQLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFD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QUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQ25CLEFBQUEsRUFBRSxLQUFLLENBQUMsSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDL0IsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQyxNLE9BQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsRUFBRSxLQUFLLENBQUMsSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUN0QyxBQUFBLEVBQUUsTTtDQUFNLEM7QUFBQSxDQUFBO0FBQ1IiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgZnN5cy5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlRmlsZVBhdGh9IGZyb20gJ25vZGUtcGF0aCdcclxuaW1wb3J0IHtwYXJzZTogcGFyc2VKU09OQywgSnNvblZhbHVlfSBmcm9tICdAc3RkL2pzb25jJ1xyXG5pbXBvcnQge2RlYm91bmNlfSBmcm9tICdAc3RkL2FzeW5jL2RlYm91bmNlJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHthcHBlbmRGaWxlU3luYywgb3BlblN5bmMsIGNsb3NlU3luY30gZnJvbSAnbm9kZS1mcydcclxuaW1wb3J0IHtwYXRoVG9GaWxlVVJMfSBmcm9tICdub2RlLXVybCdcclxuaW1wb3J0IHtFdmVudEVtaXR0ZXJ9IGZyb20gJ25vZGUtZXZlbnRzJ1xyXG5pbXBvcnQge2V4cGFuZEdsb2JTeW5jfSBmcm9tICdAc3RkL2ZzL2V4cGFuZC1nbG9iJ1xyXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMvdGV4dC1saW5lLXN0cmVhbSdcclxuaW1wb3J0IHtcclxuXHRwYXJzZSwgcmVzb2x2ZSwgcmVsYXRpdmUsIGZyb21GaWxlVXJsLFxyXG5cdH0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5cclxuaW1wb3J0IHtcclxuXHRMT0csIERCRywgV0FSTiwgRVJSLCBJTkRFTlQsIFVOREVOVCxcclxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLFxyXG5cdH0gZnJvbSAnbG9nZ2VyJ1xyXG5pbXBvcnQge1xyXG5cdHBhc3MsIHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCB0b1JlbFBhdGgsXHJcblx0bm9ybWFsaXplUGF0aCwgdG9GdWxsUGF0aCxcclxuXHRhbGxMaW5lc0luRmlsZSwgYWxsTGluZXNJbkZpbGVTeW5jLFxyXG5cdFRJdGVyYXRvciwgVEFzeW5jSXRlcmF0b3IsXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgZ2V0RmlsZVN0YXRzLCBlbmNvZGUsXHJcblx0Y3JvYWssIGFzc2VydCwgb2J2aW91c2x5LCBlbXB0eUl0ZXJhdG9yLCBlbXB0eUFzeW5jSXRlcmF0b3IsXHJcblx0fSBmcm9tICdiYXNlJ1xyXG5pbXBvcnQge1xyXG5cdGlzRW1wdHksIG5vbkVtcHR5LCBpc1N0cmluZywgaXNOb25FbXB0eVN0cmluZyxcclxuXHRpc0Jvb2xlYW4sIGlzTnVtYmVyLCBpc0ludGVnZXIsIGlzQXJyYXksIGlzQXJyYXlPZlN0cmluZ3MsXHJcblx0aXNIYXNoLCBpc1JlZ0V4cCwgaW50ZWdlciwgaGFzaCwgaGFzaG9mLCBUVm9pZEZ1bmMsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7c2luY2VMb2FkU3RyfSBmcm9tICd0aW1lcidcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsXHJcblx0YXJyYXlUb0Jsb2NrLCB3b3JkcywgZixcclxuXHR9IGZyb20gJ2xsdXRpbHMnXHJcbmltcG9ydCB7aXNNZXRhRGF0YVN0YXJ0LCBnZXRNZXRhRGF0YUhhc2h9IGZyb20gJ21ldGEtZGF0YSdcclxuaW1wb3J0IHtkZWJ1Z2dpbmd9IGZyb20gJ2NtZC1hcmdzJ1xyXG5pbXBvcnQge09MLCBNTCwgREJHVkFMVUV9IGZyb20gJ25pY2UnXHJcbmltcG9ydCB7Y2l2ZXQydHNGaWxlfSBmcm9tICdsbGNpdmV0J1xyXG5cclxuZXhwb3J0IHtcclxuXHRub3JtYWxpemVQYXRoLCB0b1JlbFBhdGgsIHRvRnVsbFBhdGgsXHJcblx0YWxsTGluZXNJbkZpbGUsIGFsbExpbmVzSW5GaWxlU3luYyxcclxuXHRmaWxlRXh0LCB3aXRoRXh0LCBnZXRGaWxlU3RhdHMsXHJcblx0fVxyXG5cclxuIyAtLS0gQ3JlYXRlIGEgZnVuY3Rpb24gY2FwYWJsZSBvZiBzeW5jaHJvbm91c2x5XHJcbiMgICAgIGltcG9ydGluZyBFU00gbW9kdWxlc1xyXG5cclxuRGVubyA6PSBnbG9iYWxUaGlzLkRlbm9cclxudHlwZSBGc0V2ZW50ID0gRGVuby5Gc0V2ZW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIERlbm8uRmlsZUluZm8gaGFzOlxyXG4jICAgIGlzRmlsZSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHJlZ3VsYXIgZmlsZS5cclxuIyAgICBpc0RpcmVjdG9yeSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIGRpcmVjdG9yeS5cclxuIyAgICBpc1N5bWxpbmsgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBzeW1saW5rLlxyXG4jICAgIHNpemUgKG51bWJlcik6IEZpbGUgc2l6ZSBpbiBieXRlcy5cclxuIyAgICBtdGltZSAoRGF0ZSB8IG51bGwpOiBNb2RpZmljYXRpb24gdGltZS5cclxuIyAgICBhdGltZSAoRGF0ZSB8IG51bGwpOiBMYXN0IGFjY2VzcyB0aW1lLlxyXG4jICAgIGJpcnRodGltZSAoRGF0ZSB8IG51bGwpOiBDcmVhdGlvbiB0aW1lIChub3QgYXZhaWxhYmxlIG9uIGFsbCBwbGF0Zm9ybXMpLlxyXG4jICAgIG1vZGUgKG51bWJlciB8IG51bGwpOiBQZXJtaXNzaW9ucyAoUE9TSVggb25seSkuXHJcbiMgICAgdWlkIC8gZ2lkIChudW1iZXIgfCBudWxsKTogT3duZXIvZ3JvdXAgSUQgKFBPU0lYIG9ubHkpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8qKlxyXG4gKiByZXR1cm5zIG9uZSBvZjpcclxuICogICAgJ21pc3NpbmcnICAtIGRvZXMgbm90IGV4aXN0XHJcbiAqICAgICdkaXInICAgICAgLSBpcyBhIGRpcmVjdG9yeVxyXG4gKiAgICAnZmlsZScgICAgIC0gaXMgYSBmaWxlXHJcbiAqICAgICdzeW1saW5rJyAgLSBpcyBhIHN5bWxpbmtcclxuICogICAgJ3Vua25vd24nICAtIGV4aXN0cywgYnV0IG5vdCBhIGZpbGUsIGRpcmVjdG9yeSBvciBzeW1saW5rXHJcbiAqL1xyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhUeXBlID0gJ21pc3NpbmcnIHwgJ2ZpbGUnIHwgJ2RpcicgfCAnc3ltbGluaycgfCAndW5rbm93bidcclxuXHJcbmV4cG9ydCBpc1BhdGhUeXBlIDo9ICh4OiB1bmtub3duKTogeCBpcyBUUGF0aFR5cGUgPT5cclxuXHJcblx0cmV0dXJuIGlzU3RyaW5nKHgpICYmIHdvcmRzKCdtaXNzaW5nIGZpbGUgZGlyIHN5bWxpbmsgdW5rbm93bicpLmluY2x1ZGVzKHgpXHJcblxyXG5leHBvcnQgZ2V0UGF0aFR5cGUgOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoVHlwZSA9PlxyXG5cclxuXHRhc3NlcnQgaXNTdHJpbmcocGF0aCksIFwibm90IGEgc3RyaW5nOiAje09MKHBhdGgpfVwiXHJcblx0aWYgbm90IGV4aXN0c1N5bmMocGF0aClcclxuXHRcdHJldHVybiAnbWlzc2luZydcclxuXHRoIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0cmV0dXJuIChcclxuXHRcdCAgaC5pc0ZpbGUgICAgICAgICA/ICdmaWxlJ1xyXG5cdFx0OiBoLmlzRGlyZWN0b3J5ICAgID8gJ2RpcidcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1N0dWIgOj0gKHN0cjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBhIHN0dWIgY2Fubm90IGNvbnRhaW4gYW55IG9mICdcXFxcJywgJy8nXHJcblx0cmV0dXJuIG5vdGRlZmluZWQoc3RyLm1hdGNoIC9bXFxcXFxcL10vKSAmJiAoc3RyWzBdICE9ICcuJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG91Y2ggOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0ZmQgOj0gb3BlblN5bmMocGF0aCwgJ2EnKVxyXG5cdGNsb3NlU3luYyhmZClcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGF0aFRvVVJMIDo9ICguLi5sUGFydHM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdHBhdGggOj0gcmVzb2x2ZSAuLi5sUGFydHNcclxuXHRyZXR1cm4gbmV3IFVSTCgnZmlsZTonICsgcGF0aCkuaHJlZi5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta3BhdGggOj0gKC4uLmxQYXJ0czogc3RyaW5nP1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGxVc2VQYXJ0cyA6PSBBcnJheS5mcm9tIE1BUCBsUGFydHMsICh4KSAtPlxyXG5cdFx0aWYgbm9uRW1wdHkoeClcclxuXHRcdFx0b2J2aW91c2x5IGRlZmluZWQoeClcclxuXHRcdFx0IyAtLS0gUmVtb3ZlIGFueSBsZWFkaW5nIG9yIHRyYWlsaW5nIHNsYXNoZXMsXHJcblx0XHRcdCMgICAgIGV2ZW4gaWYgbGVhZGluZyBzbGFzaCBpcyBwcmVjZWRlZCBieSAnLidcclxuXHRcdFx0bE1hdGNoZXMgOj0geC5tYXRjaCAvLy9eXHJcblx0XHRcdFx0KD86XHJcblx0XHRcdFx0XHRcXC4/IFtcXFxcXFwvXVxyXG5cdFx0XHRcdFx0KT9cclxuXHRcdFx0XHQoLio/KVxyXG5cdFx0XHRcdFtcXFxcXFwvXT9cclxuXHRcdFx0XHQkLy8vXHJcblx0XHRcdGlmIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdFx0eWllbGQgbE1hdGNoZXNbMV1cclxuXHRcdHJldHVyblxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBsVXNlUGFydHMuam9pbignLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhEZXNjID0ge1xyXG5cdGRpcjogc3RyaW5nXHJcblx0cm9vdDogc3RyaW5nXHJcblx0bFBhcnRzOiBzdHJpbmdbXVxyXG5cdH1cclxuXHJcbmV4cG9ydCBwYXRoU3ViRGlycyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUUGF0aERlc2MgPT5cclxuXHJcblx0cGF0aCA9IHRvRnVsbFBhdGgocGF0aClcclxuXHR7cm9vdCwgZGlyfSA6PSBwYXJzZSBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGRpclxyXG5cdFx0cm9vdFxyXG5cdFx0bFBhcnRzOiBkaXIuc2xpY2Uocm9vdC5sZW5ndGgpLnNwbGl0KC9bXFxcXFxcL10vKVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gU2hvdWxkIGJlIGNhbGxlZCBsaWtlOiBteXNlbGYoaW1wb3J0Lm1ldGEudXJsKVxyXG4jICAgICByZXR1cm5zIGZ1bGwgcGF0aCBvZiBjdXJyZW50IGZpbGVcclxuXHJcbmV4cG9ydCBteXNlbGYgOj0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiB0b1JlbFBhdGggZnJvbUZpbGVVcmwgdXJsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmYgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0Y29udGVudHM6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7YXBwZW5kfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdH1cclxuXHJcblx0bWtEaXJzRm9yRmlsZSBwYXRoXHJcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcclxuXHRpZiBhcHBlbmQgJiYgaXNGaWxlKHBhdGgpXHJcblx0XHRhcHBlbmRGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0ZWxzZVxyXG5cdFx0RGVuby53cml0ZUZpbGVTeW5jIHBhdGgsIGRhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRleHQ6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtleHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZXh0OiAnLmNpdmV0J1xyXG5cdFx0fVxyXG5cdHRlbXBGaWxlUGF0aCA6PSBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeDogZXh0fVxyXG5cdGJhcmYgdGVtcEZpbGVQYXRoLCBjb250ZW50c1xyXG5cdHJldHVybiB0ZW1wRmlsZVBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbW9kVGltZSA6PSAocGF0aDogc3RyaW5nKTogRGF0ZSA9PlxyXG5cclxuXHRtcyA6PSBnZXRGaWxlU3RhdHMocGF0aCkubXRpbWVcclxuXHRhc3NlcnQgZGVmaW5lZChtcyksIFwibXMgbm90IGRlZmluZWQgZm9yICN7cGF0aH1cIlxyXG5cdHJldHVybiBtc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBuZXdlckRlc3RGaWxlRXhpc3RzIDo9IChcclxuXHRcdHNyY1BhdGg6IHN0cmluZyxcclxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxyXG5cdGFzc2VydCBpc0ZpbGUoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje09MKHNyY1BhdGgpfVwiXHJcblxyXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XHJcblx0aWYgZGVzdFBhdGguc3RhcnRzV2l0aCgnLicpXHJcblx0XHRhc3NlcnQgKGZpbGVFeHQoc3JjUGF0aCkgIT0gZGVzdFBhdGgpLCBcIklkZW50aWNhbCBleHRlbnNpb25zXCJcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gbW9kVGltZShkZXN0UGF0aCkgPiBtb2RUaW1lKHNyY1BhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rRGlyIDo9IChcclxuXHRcdGRpclBhdGg6IHN0cmluZyxcclxuXHRcdGNsZWFyOiBib29sZWFuID0gZmFsc2VcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgY2xlYXJcclxuXHRcdCMgLS0tIGNyZWF0ZXMgZGlyIGlmIGl0IGRvZXNuJ3QgZXhpc3RcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0ZW5zdXJlRGlyU3luYyBkaXJQYXRoXHJcblx0YXNzZXJ0IGlzRGlyKGRpclBhdGgpLCBcIkRpciBub3QgY3JlYXRlZDogI3tkaXJQYXRofVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMoZGlyUGF0aCkgJiYgaXNEaXIoZGlyUGF0aClcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0bWtEaXIgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHtyb290LCBsUGFydHN9IDo9IHBhdGhTdWJEaXJzIHBhdGhcclxuXHRsZXQgZGlyID0gcm9vdFxyXG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xyXG5cdFx0ZGlyICs9IFwiLyN7cGFydH1cIlxyXG5cdFx0bWtEaXIgZGlyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZzRXZlbnRIYW5kbGVyID0gKGtpbmQ6IHN0cmluZywgcGF0aDogc3RyaW5nKSA9PiB2b2lkIHwgYm9vbGVhblxyXG4vKipcclxuICogY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxyXG4gKiAgICBoYW5kbGVzIGZpbGUgY2hhbmdlZCBldmVudHMgd2hlbiAuaGFuZGxlKGZzRXZlbnQpIGlzIGNhbGxlZFxyXG4gKiAgICBjYWxsYmFjayBpcyBhIGZ1bmN0aW9uLCBkZWJvdW5jZWQgYnkgMjAwIG1zXHJcbiAqICAgICAgIHRoYXQgdGFrZXMgYW4gRnNFdmVudCBhbmQgcmV0dXJucyBhIFRWb2lkRnVuY1xyXG4gKiAgICAgICB3aGljaCB3aWxsIGJlIGNhbGxlZCBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyBhIGZ1bmN0aW9uIHJlZmVyZW5jZVxyXG4gKiBbdW5pdCB0ZXN0c10oLi4vdGVzdC9mcy50ZXN0LmNpdmV0Izp+OnRleHQ9JTIzJTIwJTJEJTJEJTJEJTIwY2xhc3MlMjBGaWxlRXZlbnRIYW5kbGVyKVxyXG4gKi9cclxuXHJcbmV4cG9ydCBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXHJcblx0aGFuZGxlcjogVEZzRXZlbnRIYW5kbGVyICMgLS0tIGRlYm91bmNlZCBoYW5kbGVyXHJcblx0b25TdG9wOiA9PiB2b2lkID0gcGFzc1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoY2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciwgaE9wdGlvbnM6IGhhc2ggPSB7fSlcclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRvblN0b3A6IFRWb2lkRnVuY1xyXG5cdFx0XHRkZWJvdW5jZUJ5OiBudW1iZXJcclxuXHRcdFx0fVxyXG5cdFx0e29uU3RvcDogb25TdG9wMSwgZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLFxyXG5cdFx0XHRvblN0b3A6IHBhc3NcclxuXHRcdFx0ZGVib3VuY2VCeTogMjAwXHJcblx0XHRAb25TdG9wID0gb25TdG9wMVxyXG5cdFx0aGFuZGxlcjEgOj0gZGVib3VuY2UgY2FsbGJhY2ssIGRlYm91bmNlQnlcclxuXHRcdEBoYW5kbGVyID0gaGFuZGxlcjFcclxuXHRcdERCRyBcIkZpbGVFdmVudEhhbmRsZXIgY29uc3RydWN0b3IoKSBjYWxsZWRcIlxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHQjIC0tLSBDYWxscyBhIFRWb2lkRnVuYywgYnV0IGlzIGRlYm91bmNlZCBieSBAbXMgbXNcclxuXHJcblx0aGFuZGxlKGZzRXZlbnQ6IEZzRXZlbnQpOiB2b2lkXHJcblx0XHR7a2luZCwgcGF0aHN9IDo9IGZzRXZlbnRcclxuXHRcdERCRyBcIkhBTkRMRTogWyN7c2luY2VMb2FkU3RyKCl9XSAje2tpbmR9ICN7T0wocGF0aHMpfVwiXHJcblx0XHRmb3IgcGF0aCBvZiBwYXRoc1xyXG5cdFx0XHRAaGFuZGxlciBraW5kLCBwYXRoXHJcblx0XHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbi8qKlxyXG4gKiBhIGZ1bmN0aW9uIHRoYXQgd2F0Y2hlcyBmb3IgY2hhbmdlcyBvbmUgb3IgbW9yZSBmaWxlcyBvciBkaXJlY3Rvcmllc1xyXG4gKiAgICBhbmQgY2FsbHMgYSBjYWxsYmFjayBmdW5jdGlvbiBmb3IgZWFjaCBjaGFuZ2UuXHJcbiAqIElmIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydWUsIHdhdGNoaW5nIGlzIGhhbHRlZFxyXG4gKlxyXG4gKiBVc2FnZTpcclxuICogICBoYW5kbGVyIDo9IChraW5kLCBwYXRoKSA9PiBjb25zb2xlLmxvZyBwYXRoXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICd0ZW1wLnR4dCcsIGhhbmRsZXJcclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3NyYy9saWInLCAgaGFuZGxlclxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSBbJ3RlbXAudHh0JywgJ3NyYy9saWInXSwgaGFuZGxlclxyXG4gKi9cclxuXHJcbmV4cG9ydCB3YXRjaEZpbGVzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0d2F0Y2hlckNCOiBURnNFdmVudEhhbmRsZXIsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkIC0+XHJcblxyXG5cdCMgLS0tIGRlYm91bmNlQnkgaXMgbWlsbGlzZWNvbmRzIHRvIGRlYm91bmNlIGJ5LCBkZWZhdWx0IGlzIDIwMFxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHR9XHJcblx0e2RlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZGVib3VuY2VCeTogMjAwXHJcblx0XHR9XHJcblxyXG5cdERCRyBcIldBVENIOiAje09MKHBhdGgpfVwiXHJcblx0d2F0Y2hlciA6PSBEZW5vLndhdGNoRnMgcGF0aFxyXG5cdGxldCBkb1N0b3A6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdGZzQ2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciA6PSAoa2luZCwgcGF0aCk6IHZvaWQgPT5cclxuXHRcdHJlc3VsdCA6PSB3YXRjaGVyQ0Iga2luZCwgcGF0aFxyXG5cdFx0REJHIFwiRkNCOiByZXN1bHQgPSAje3Jlc3VsdH1cIlxyXG5cdFx0aWYgcmVzdWx0XHJcblx0XHRcdHdhdGNoZXIuY2xvc2UoKVxyXG5cdFx0cmV0dXJuXHJcblx0aGFuZGxlciA6PSBuZXcgRmlsZUV2ZW50SGFuZGxlcihmc0NhbGxiYWNrLCB7IGRlYm91bmNlQnkgfSlcclxuXHRmb3IgYXdhaXQgaXRlbSBvZiB3YXRjaGVyXHJcblx0XHRmc0V2ZW50OiBGc0V2ZW50IDo9IGl0ZW1cclxuXHRcdERCRyBcIndhdGNoZXIgZXZlbnQgZmlyZWRcIlxyXG5cdFx0aWYgZG9TdG9wXHJcblx0XHRcdERCRyBcImRvU3RvcCA9ICN7ZG9TdG9wfSwgQ2xvc2luZyB3YXRjaGVyXCJcclxuXHRcdFx0YnJlYWtcclxuXHRcdGZvciBwYXRoIG9mIGZzRXZlbnQucGF0aHNcclxuXHRcdFx0IyAtLS0gZnNDYWxsYmFjayB3aWxsIGJlIChldmVudHVhbGx5KSBjYWxsZWRcclxuXHRcdFx0aGFuZGxlci5oYW5kbGUgZnNFdmVudFxyXG5leHBvcnQgd2F0Y2hGaWxlIDo9IHdhdGNoRmlsZXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGF0Y2hGaXJzdExpbmUgOj0gKHBhdGg6IHN0cmluZywgc3RyOiBzdHJpbmcsIG5ld3N0cjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHQjIC0tLSBSZXBsYWNlIHN0ciB3aXRoIG5ld3N0ciwgYnV0IG9ubHkgb24gZmlyc3QgbGluZVxyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0bmxQb3MgOj0gY29udGVudHMuaW5kZXhPZiBcIlxcblwiXHJcblx0c3RyUG9zIDo9IGNvbnRlbnRzLmluZGV4T2Ygc3RyXHJcblx0aWYgKHN0clBvcyAhPSAtMSkgJiYgKChubFBvcyA9PSAtMSkgfHwgKHN0clBvcyA8IG5sUG9zKSlcclxuXHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgY29udGVudHMucmVwbGFjZShzdHIsIG5ld3N0cilcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnJvbUpzb25GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiBoYXNoID0+XHJcblxyXG5cdGlmIGlzRmlsZShwYXRoKVxyXG5cdFx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRcdGlmIGlzRW1wdHkoY29udGVudHMpXHJcblx0XHRcdHJldHVybiB7fVxyXG5cdFx0cmVzdWx0IDo9IHBhcnNlSlNPTkMoY29udGVudHMpXHJcblx0XHRyZXR1cm4gZGVmaW5lZChyZXN1bHQpID8gcmVzdWx0IGFzIGhhc2ggOiB7fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB7fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pzb25GaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0ZGF0YTogaGFzaFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDMpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFkZEpzb25WYWx1ZSA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRoRGF0YSA6PSBmcm9tSnNvbkZpbGUocGF0aClcclxuXHRpZiBkZWZpbmVkKGhEYXRhKSAmJiBpc0hhc2goaERhdGEpXHJcblx0XHRoRGF0YVtrZXldID0gdmFsdWVcclxuXHRcdHRvSnNvbkZpbGUgcGF0aCwgaERhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaW5TYW1lRGlyIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHR7ZGlyfSA6PSBwYXJzZVBhdGgocGF0aClcclxuXHRuZXdwYXRoIDo9IG1rcGF0aChkaXIsIGZpbGVOYW1lKVxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIG5ld3BhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVtb3ZlQ1IgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFxyJywgJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2x1cnAgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXHJcblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycEFzeW5jIDo9IGFzeW5jIChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBwYXRoXHJcblx0cmV0dXJuIGRlZmluZWQoZGF0YSkgPyByZW1vdmVDUihkYXRhKSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhTdHIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRyb290OiBzdHJpbmcgPSAnLidcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZSByb290LCBwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNwbGl0UGF0dGVybnMgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmdbXSxcclxuXHRcdCk6IFtzdHJpbmdbXSwgc3RyaW5nW11dID0+XHJcblxyXG5cdHR5cGUgVEFjY3VtID0gW3N0cmluZ1tdLCBzdHJpbmdbXV1cclxuXHJcblx0YWNjMDogVEFjY3VtIDo9IFtbXSxbXV1cclxuXHRhY2N1bSA6PSBNQVAgbFBhdHRlcm5zLCBhY2MwLCAocGF0OiBzdHJpbmcsIGFjYzogVEFjY3VtKTogVEFjY3VtIC0+XHJcblx0XHRbbFBvcywgbE5lZ10gOj0gYWNjXHJcblx0XHRsTWF0Y2hlcyA6PSBwYXQubWF0Y2ggLy8vXiBcXCEgXFxzKyAoLiopICQvLy9cclxuXHRcdHJldHVybiAoXHJcblx0XHRcdCAgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdFx0PyBbIGxQb3MsICAgICAgICAgICAgICBsTmVnLmNvbmNhdChsTWF0Y2hlc1sxXSldXHJcblx0XHRcdDogWyBsUG9zLmNvbmNhdChwYXQpLCAgbE5lZyAgICAgICAgICAgICAgICAgICAgXVxyXG5cdFx0XHQpXHJcblx0cmV0dXJuIGFjY3VtXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRJdGVyYXRvclxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRmlsZXNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxQYXRocyA6PSBBcnJheS5mcm9tKGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuXHJcbiMgICAgICAgICAgQnkgZGVmYXVsdCwgaWdub3JlcyBhbnl0aGluZyBpbnNpZGUgYSBmb2xkZXJcclxuIyAgICAgICAgICAgICAgICAgICAgICBuYW1lZCAnLnRlbXAnIG9yICcuc2F2ZSdcclxuXHJcbmV4cG9ydCBhbGxGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaFxyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHRpbmNsdWRlRGlyczogYm9vbGVhblxyXG5cdFx0fVxyXG5cclxuXHR7cm9vdCwgaE1vcmVHbG9iT3B0aW9ucywgbElnbm9yZURpcnMsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0bElnbm9yZURpcnM6IFsnLnRlbXAnLCAnLnNhdmUnXVxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnNcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdGxNb3JlUGF0dGVybnMgOj0gKFxyXG5cdFx0ICBkZWZpbmVkKGxJZ25vcmVEaXJzKVxyXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+IFwiISAqKi8je3h9LyoqXCIpXHJcblx0XHQ6IFtdXHJcblx0XHQpXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zLmNvbmNhdChsTW9yZVBhdHRlcm5zLi4uKVxyXG5cdGlmIGlzRW1wdHkobFBvc1BhdHMpXHJcblx0XHRyZXR1cm5cclxuXHRpZiBub25FbXB0eShsTmVnUGF0cylcclxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcclxuXHRpZiBkZWJ1Z2dpbmdcclxuXHRcdExPRyBcIlBBVFRFUk5TOlwiXHJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRcdExPRyBcIiAgIFBPUzogI3twYXR9XCJcclxuXHRcdGZvciBwYXQgb2YgbE5lZ1BhdHNcclxuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxyXG5cdHNldFNraXAgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRmb3IgZW50cnkgb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdHtwYXRofSA6PSBlbnRyeVxyXG5cdFx0XHRpZiBub3Qgc2V0U2tpcC5oYXMocGF0aClcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIlBBVEg6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGhPcHRpb25zIGdldHMgcGFzc2VkIHRvIGFsbEZpbGVzTWF0Y2hpbmcoKVxyXG5cclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdH1cclxuXHR7cm9vdCwgbElnbm9yZURpcnN9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRsSWdub3JlRGlyczogWycudGVtcCcsICcuc2F2ZSddXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHRwYXQgOj0gcm9vdCA/IFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiIDogXCIqKi8je2ZpbGVOYW1lfVwiXHJcblxyXG5cdCMgTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbEZpbGVzTWF0Y2hpbmcgcGF0LCB7XHJcblx0XHRsSWdub3JlRGlyc1xyXG5cdFx0fVxyXG5cdERCR1ZBTFVFICdsUGF0aHMnLCBsUGF0aHNcclxuXHRzd2l0Y2ggbFBhdGhzLmxlbmd0aFxyXG5cdFx0Y2FzZSAxOlxyXG5cdFx0XHRwYXRoIDo9IGxQYXRoc1swXVxyXG5cdFx0XHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vdCBhIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBwYXRoXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEdFTkVSQVRPUlxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRGlyc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbERpcnMgOj0gQXJyYXkuZnJvbShhbGxEaXJzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuL3NyY1xyXG5cclxuZXhwb3J0IGFsbERpcnNNYXRjaGluZyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRpbmNsdWRlRGlyczogdHJ1ZVxyXG5cdFx0Zm9sbG93U3ltbGlua3M6IGZhbHNlXHJcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHQuLi5oTW9yZUdsb2JPcHRpb25zXHJcblx0XHR9XHJcblx0bEFsbFBhdHRlcm5zOiBzdHJpbmdbXSA6PSAoXHJcblx0XHQgIGlzU3RyaW5nKGxQYXR0ZXJucylcclxuXHRcdD8gW2xQYXR0ZXJuc11cclxuXHRcdDogbFBhdHRlcm5zXHJcblx0XHQpXHJcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsQWxsUGF0dGVybnNcclxuXHRpZiBsTmVnUGF0cy5sZW5ndGggPiAwXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpICYmIGlzRGlyKHBhdGgpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJESVI6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aEluZm8gPVxyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGRpcjogc3RyaW5nXHJcblx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdHN0dWI6IHN0cmluZ1xyXG5cdHB1cnBvc2U6IHN0cmluZz9cclxuXHRleHQ6IHN0cmluZz9cclxuXHJcbmV4cG9ydCBwYXJzZVBhdGggOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoSW5mbyA9PlxyXG5cclxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcclxuXHRcdHBhdGggPSBmcm9tRmlsZVVybChwYXRoKVxyXG5cdHtyb290LCBkaXIsIGJhc2V9IDo9IHBhcnNlRmlsZVBhdGggcGF0aFxyXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xyXG5cdG5QYXJ0cyA6PSBsUGFydHMubGVuZ3RoXHJcblx0bGV0IHJlZjFcclxuXHRzd2l0Y2ggblBhcnRzXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBwYXRoOiAje3BhdGh9XCIpXHJcblx0XHR3aGVuIDFcclxuXHRcdFx0cmVmMSA9IGJhc2VcclxuXHRcdHdoZW4gMlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzLnNsaWNlKDAsIC0yKS5qb2luKCcuJylcclxuXHRzdHViIDo9IHJlZjFcclxuXHRyZXR1cm4ge1xyXG5cdFx0cm9vdDogbm9ybWFsaXplUGF0aChyb290KVxyXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcclxuXHRcdGZpbGVOYW1lOiBiYXNlXHJcblx0XHRzdHViXHJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcclxuXHRcdGV4dDogaWYgKG5QYXJ0cyA+IDEpIHRoZW4gXCIuI3tsUGFydHMuYXQoLTEpfVwiIGVsc2UgdW5kZWZcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nPyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChwYXRoKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0dHJ5XHJcblx0XHRzdGF0cyA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdFx0cmV0dXJuIHN0YXRzLmlzRmlsZVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhyb3cgZXJyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRGlyIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNEaXJlY3RvcnlcclxuXHRjYXRjaCBlcnJcclxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZClcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0XHRlbHNlXHJcblx0XHRcdHRocm93IGVyclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybURpciA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7Y2xlYXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0Y2xlYXI6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMocGF0aClcclxuXHRcdGFzc2VydCBpc0RpcihwYXRoKSwgXCJOb3QgYSBkaXJlY3Rvcnk6ICN7cGF0aH1cIlxyXG5cdFx0aWYgY2xlYXJcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGgsIHJlY3Vyc2l2ZTogdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1ZhbGlkU3R1YiA6PSAoc3R1Yjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgY2ggb2YgWycsJywgJy8nLCAnXFxcXCddXHJcblx0XHRpZiBzdHViLmluY2x1ZGVzKGNoKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gKHN0dWIgIT0gJ2FsbCcpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb3BlblRleHRGaWxlKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRlYWdlcjogdHJ1ZVxyXG5cdFx0KTogW2hhc2gsIHN0cmluZ11cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvcGVuVGV4dEZpbGUoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGVhZ2VyPzogZmFsc2VcclxuXHRcdCk6IFtoYXNoLCBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+XVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5UZXh0RmlsZShcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGVhZ2VyOiBib29sZWFuID0gZmFsc2VcclxuXHRcdCk6IFtoYXNoLCBzdHJpbmcgfCBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+XVxyXG5cclxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXHJcblx0aXRlciA6PSBhbGxMaW5lc0luRmlsZShwYXRoKVxyXG5cclxuXHQjIC0tLSBBU1lOQyAtLS1cclxuXHRnZXRMaW5lIDo9ICgpOiBzdHJpbmc/ID0+XHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGF3YWl0IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gdmFsdWUgYXMgc3RyaW5nXHJcblxyXG5cdCMgLS0tIHdlIG5lZWQgdG8gZ2V0IHRoZSBmaXJzdCBsaW5lIHRvIGNoZWNrIGlmXHJcblx0IyAgICAgdGhlcmUncyBtZXRhIGRhdGEuIEJ1dCBpZiB0aGVyZSBpcyBub3QsXHJcblx0IyAgICAgd2UgbmVlZCB0byByZXR1cm4gaXQgYnkgdGhlIHJlYWRlclxyXG5cclxuXHRmaXJzdExpbmUgOj0gYXdhaXQgZ2V0TGluZSgpXHJcblx0aWYgbm90ZGVmaW5lZChmaXJzdExpbmUpXHJcblx0XHRyZXR1cm4gW3t9LCAoZWFnZXIgPyAnJyA6IGVtcHR5QXN5bmNJdGVyYXRvcjxzdHJpbmc+KCkpXVxyXG5cclxuXHQjIC0tLSBHZXQgbWV0YSBkYXRhIGlmIHByZXNlbnRcclxuXHRoYXNNZXRhRGF0YSA6PSBpc01ldGFEYXRhU3RhcnQoZmlyc3RMaW5lKVxyXG5cclxuXHRoTWV0YURhdGE6IGhhc2ggOj0gKFxyXG5cdFx0aWYgaGFzTWV0YURhdGFcclxuXHRcdFx0bE1ldGFMaW5lczogc3RyaW5nW10gOj0gW11cclxuXHRcdFx0bGV0IGxpbmUgPSBhd2FpdCBnZXRMaW5lKClcclxuXHRcdFx0d2hpbGUgbGluZSAmJiAobGluZSAhPSBmaXJzdExpbmUpXHJcblx0XHRcdFx0bE1ldGFMaW5lcy5wdXNoIGxpbmVcclxuXHRcdFx0XHRsaW5lID0gYXdhaXQgZ2V0TGluZSgpXHJcblx0XHRcdGdldE1ldGFEYXRhSGFzaChmaXJzdExpbmUsIGFycmF5VG9CbG9jayhsTWV0YUxpbmVzKSlcclxuXHRcdGVsc2VcclxuXHRcdFx0e31cclxuXHRcdClcclxuXHJcblx0aWYgZWFnZXJcclxuXHRcdCMgLS0tIEdldCBhbGwgdGhlIHJlc3Qgb2YgdGhlIGxpbmVzIGFuZCBqb2luIHdpdGggJ1xcbidcclxuXHRcdGxMaW5lcyA6PSBhd2FpdCBBcnJheS5mcm9tQXN5bmMoaXRlcilcclxuXHRcdGlmIGhhc01ldGFEYXRhXHJcblx0XHRcdHJldHVybiBbaE1ldGFEYXRhLCBsTGluZXMuam9pbignXFxuJyldXHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiBbe30sIFtmaXJzdExpbmUsIC4uLmxMaW5lc10uam9pbignXFxuJyldXHJcblx0ZWxzZVxyXG5cdFx0IyAtLS0gZ2VuZXJhdG9yIHRoYXQgYWxsb3dzIHJlYWRpbmcgY29udGVudHNcclxuXHRcdHJlYWRlciA6PSAoKTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cdFx0XHRpZiBub3QgaGFzTWV0YURhdGFcclxuXHRcdFx0XHR5aWVsZCBmaXJzdExpbmVcclxuXHRcdFx0bGV0IGxpbmUgPSBhd2FpdCBnZXRMaW5lKClcclxuXHRcdFx0d2hpbGUgZGVmaW5lZChsaW5lKVxyXG5cdFx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0XHRsaW5lID0gYXdhaXQgZ2V0TGluZSgpXHJcblx0XHRcdHJldHVyblxyXG5cdFx0cmV0dXJuIFtoTWV0YURhdGEsIHJlYWRlcigpXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG9wZW5BbmRSZWFkVGV4dEZpbGUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBbaGFzaCwgc3RyaW5nXSAtPlxyXG5cclxuXHRbaE1ldGFEYXRhLCByZWFkZXJdIDo9IGF3YWl0IG9wZW5UZXh0RmlsZSBwYXRoXHJcblx0bExpbmVzIDo9IGF3YWl0IEFycmF5LmZyb21Bc3luYyhyZWFkZXIpXHJcblx0cmV0dXJuIFtoTWV0YURhdGEsIGxMaW5lcy5qb2luKCdcXG4nKV1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb25maWdGcm9tRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBoYXNoID0+XHJcblxyXG5cdCMgLS0tIGNvbmZpZyBzaG91bGQgYmUgYSBoYXNoIG5hbWVkIGhDb25maWdcclxuXHJcblx0IyAtLS0gTk9URTogSWYgYSBkZWZpbmVkIHBhdGggaXMgcmV0dXJuZWQsIGl0IGRlZmluaXRlbHkgZXhpc3RzXHJcblx0cGF0aCA6PSBmaW5kRmlsZSBmaWxlTmFtZVxyXG5cdGFzc2VydCBkZWZpbmVkKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChmaWxlTmFtZSl9XCJcclxuXHR7cHVycG9zZSwgZXh0fSA6PSBwYXJzZVBhdGggcGF0aFxyXG5cdGFzc2VydCBkZWZpbmVkKGV4dCksIFwiTm8gZmlsZSBleHQgaW4gI3tPTChwYXRoKX1cIlxyXG5cdGFzc2VydCAocHVycG9zZSA9PSAnY29uZmlnJyksIFwiTm90IGEgY29uZmlnIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRhc3NlcnQgWycuY2l2ZXQnLCAnLnRzJ10uaW5jbHVkZXMoZXh0KSwgXCJJbnZhbGlkIHBhdGg6ICN7T0wocGF0aCl9XCJcclxuXHREQkcgXCJJbXBvcnQgY29uZmlnIGZyb20gI3tPTChwYXRoKX1cIlxyXG5cdHVybCA6PSAoXHJcblx0XHRpZiAoZXh0ID09ICcuY2l2ZXQnKVxyXG5cdFx0XHR0c1BhdGggOj0gYXdhaXQgY2l2ZXQydHNGaWxlIHBhdGhcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCB0c1BhdGhcclxuXHRcdGVsc2VcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCBwYXRoXHJcblx0XHQpXHJcblx0aCA6PSBhd2FpdCBpbXBvcnQgdXJsXHJcblx0cmV0dXJuIGguaENvbmZpZ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG9wZW5Gb3JXcml0ZSA6PSAocGF0aDogc3RyaW5nKTogRGVuby5Gc0ZpbGUgPT5cclxuXHJcblx0cmV0dXJuIGF3YWl0IERlbm8ub3BlbiBwYXRoLCB7XHJcblx0XHR3cml0ZTogdHJ1ZVxyXG5cdFx0Y3JlYXRlOiB0cnVlXHJcblx0XHR0cnVuY2F0ZTogdHJ1ZVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHdyaXRlTGluZSA6PSAoZmlsZTogRGVuby5Gc0ZpbGUsIHN0cjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRhd2FpdCBmaWxlLndyaXRlIGVuY29kZShzdHIgKyAnXFxuJylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ1dyaXRhYmxlRmlsZVxyXG5cclxuXHRwYXRoOiBzdHJpbmdcclxuXHRmaWxlOiBEZW5vLkZzRmlsZVxyXG5cclxuXHRjb25zdHJ1Y3RvcihAcGF0aDogc3RyaW5nLCBoT3B0aW9uczogaGFzaCA9IHt9KVxyXG5cclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdFx0fVxyXG5cdFx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRcdEBmaWxlID0gRGVuby5vcGVuU3luYyBAcGF0aCwge1xyXG5cdFx0XHR3cml0ZTogdHJ1ZVxyXG5cdFx0XHRjcmVhdGU6IHRydWVcclxuXHRcdFx0dHJ1bmNhdGU6IG5vdCBhcHBlbmRcclxuXHRcdFx0fVxyXG5cclxuXHR3cml0ZShzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0d3JpdGVsbihzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIgKyAnXFxuJylcclxuXHRcdHJldHVyblxyXG4iXX0=