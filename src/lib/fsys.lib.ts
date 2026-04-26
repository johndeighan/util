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
import NReadLines from 'npm-n-readlines'
import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from '@std/streams'
import {
	parse, resolve, relative, fromFileUrl,
	} from '@std/path'

import {
	pass, undef, defined, notdefined, sleep, toRelPath,
	normalizePath, toFullPath, allLinesIn,
	fileExt, withExt, getFileStats,
	croak, assert, obviously,
	} from 'base'
import {
	isEmpty, nonEmpty, isString, isNonEmptyString,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {MAP} from 'mapper'
import {
	getOptions, encode, spaces,
	sinceLoadStr, arrayToBlock, words,
	} from 'llutils'
import {isMetaDataStart, convertMetaData} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, ML} from 'to-nice'
import {
	pushLogLevel, popLogLevel, LOG, DBG, WARN, ERR,
	INDENT, UNDENT, DBGVALUE,
	} from 'logger'
import {civet2tsFile} from 'llcivet'

export {
	normalizePath, toRelPath, toFullPath, allLinesIn,
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

	debugger
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

export const newerDestFileExists = (
		srcPath: string,
		destPath: string    // --- can be a file extension
		): boolean => {

	// --- source file must exist
	assert(isFile(srcPath), `No such file: ${OL(srcPath)}`)

	// --- allow passing a file extension for 2nd argument
	if (destPath.startsWith('.')) {
		destPath = withExt(srcPath, destPath)
	}

	if (!existsSync(destPath)) {
		return false
	}
	try {
		const destms = getFileStats(destPath).mtime
		assert(defined(destms))
		const srcms  = getFileStats(srcPath).mtime
		assert(defined(srcms))
		return (destms > srcms)
	}
	catch (err) {
		return false
	}
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
	return
}

// ---------------------------------------------------------------------------

export const mkDirsForFile = (path: string): void => {

	const {root, lParts} = pathSubDirs(path)
	let dir = root
	for (const part of lParts) {
		dir += `/${part}`
		if (!isDir(dir)) {
			mkDir(dir)
		}
	}
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
// --- EXAMPLE USAGE:
//			hData := await fromJsonFile('data.jsonc')
//			console.dir importMap

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
		data: hash,
		path: string
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
		toJsonFile(hData, path)
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

	const data = Deno.readTextFileSync(path)
	return defined(data) ? removeCR(data) : ''
}

// ---------------------------------------------------------------------------

export const slurpAsync = async (path: string): AutoPromise<string> => {

	const data = await Deno.readTextFile(path)
	return defined(data) ? removeCR(data) : ''
}

// ---------------------------------------------------------------------------

export const pathStr = (path: string, root: string = 'src'): string => {

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
// GENERATOR
//
//    Use like:
//       for path of allFilesMatching(lPats)
//          OR
//       lPaths := Array.from(allFilesMatching(lPats))
//
//    NOTE: By default, searches from .
//          By default, ignores anything inside a folder
//                      named 'temp' or 'save'

export const allFilesMatching = function*(
		lPatterns: string | string[],
		hOptions: hash = {}
		): Generator<string> {

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
			lIgnoreDirs: ['temp', 'save'],
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
		): Generator<string, void, void> {

	const hGlobOptions: hash = {
		root: './src',
		includeDirs: true,
		followSymlinks: false,
		canonicalize: false,
		...hMoreGlobOptions
		}
	const lAllPatterns: string[] = isString(lPatterns) ? [lPatterns] : lPatterns
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
			if (!setSkip.has(path) && getFileStats(path).isDirectory) {
				if (debugging) {
					LOG(`DIR: ${path}`)
				}
				yield path
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

export const rmDir = (path: string, hOptions: hash = {}): void => {

	type opt = {
		clear: boolean
		}
	const {clear} = getOptions<opt>(hOptions, {
		clear: false,
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

export type TTextFileInfo = {
	metaData: unknown
	contents: (string | undefined)
	reader: (Generator<string, void, void> | undefined)
	nLines: number
	}

export var openTextFile = (
		path: string,
		hOptions: hash = {}
		): TTextFileInfo => {

	type opt = {
		eager: boolean
		}
	const {eager} = getOptions<opt>(hOptions, {
		eager: false
		})

	assert(isFile(path), `No such file: ${path}`)
	const nReader = new NReadLines(path)
	const getLine = (): (string | undefined) => {
		const buffer = nReader.next()
		if (defined(buffer)) {
			return removeCR(buffer.toString())
		}
		else {
			return undef
		}
	}

	// --- we need to get the first line to check if
	//     there's meta data. But if there is not,
	//     we need to return it by the reader

	const firstLine = getLine()
	if (notdefined(firstLine)) {
		return {
			metaData: undef,
			reader: undef,
			contents: undef,
			nLines: 0
			}
	}

	// --- Get meta data if present
	const hasMetaData = isMetaDataStart(firstLine)
	let nMetaLines = 0

	const metaData = (
		(()=>{if (hasMetaData) {
			const lMetaLines: string[] = []
			let line = getLine()
			while (line && (line !== firstLine)) {
				lMetaLines.push(line)
				line = getLine()
			}
			nMetaLines = lMetaLines.length + 2
			return convertMetaData(firstLine, arrayToBlock(lMetaLines))
		}
		else {
			return undef
		}})()
		)

	// --- generator that allows reading contents
	const reader = function*(): Generator<string, void, void> {
		if (!hasMetaData && defined(firstLine)) {
			yield firstLine
		}
		let line = getLine()
		while (defined(line)) {
			yield line
			line = getLine()
		}
		return
	}

	// --- number of lines in file read so far
	if (eager) {
		const lLines = Array.from(reader())
		return {
			metaData,
			reader: undef,
			contents: arrayToBlock(lLines),
			nLines: nMetaLines + lLines.length
			}
	}
	else {
		return {
			metaData,
			reader: reader(),
			contents: undef,
			nLines: nMetaLines
			}
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export const configFromFile = async (
		fileName: string
		): AutoPromise<hash> => {

	const path = findFile(fileName)
	assert(defined(path), `No such file: ${OL(fileName)}`)
	const {purpose, ext} = parsePath(path)
	assert((purpose === 'config'), `Not a config file: ${OL(path)}`)
	if (ext === '.civet') {
		const tsPath = await civet2tsFile(path)
		DBG(`Import config from ${OL(tsPath)}`)
		const url = pathToFileURL(tsPath)
		DBGVALUE('url', url)
		return await import(url)
	}
	else if (ext === '.ts') {
		DBG(`Import config from ${OL(path)}`)
		const url = pathToFileURL(path)
		DBGVALUE('url', url)
		return await import(url)
	}
	else {
		croak(`Not a civet or ts file: ${fileName}`)
	}
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvZnN5cy5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSxpQkFBZ0I7QUFDaEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzlDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUN2RCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUM1QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzNELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUN0QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN4QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNsRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxR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QTtBQUN2QixBQUFBLEVBQUUsR0FBRyxDQUFBLEFBQUMsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3RDLEFBQUEsRUFBSyxNQUFILEdBQUcsQ0FBQyxDQUFFLENBQUMsYUFBYSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQzNCLEFBQUEsRUFBRSxRQUFRLENBQUEsQUFBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUE7QUFDckIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEMsTUFBTyxDQUFBLEFBQUMsR0FBRyxDO0NBQUEsQ0FBQTtBQUN6QixBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsS0FBSyxDQUFBLEFBQUMsQ0FBQyx3QkFBd0IsRUFBRSxRQUFRLENBQUMsQ0FBQyxDO0NBQUEsQztBQUFBLENBQUE7QUFDN0MiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgZnN5cy5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlRmlsZVBhdGh9IGZyb20gJ25vZGUtcGF0aCdcclxuaW1wb3J0IHtwYXJzZTogcGFyc2VKU09OQywgSnNvblZhbHVlfSBmcm9tICdAc3RkL2pzb25jJ1xyXG5pbXBvcnQge2RlYm91bmNlfSBmcm9tICdAc3RkL2FzeW5jL2RlYm91bmNlJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHthcHBlbmRGaWxlU3luYywgb3BlblN5bmMsIGNsb3NlU3luY30gZnJvbSAnbm9kZS1mcydcclxuaW1wb3J0IHtwYXRoVG9GaWxlVVJMfSBmcm9tICdub2RlLXVybCdcclxuaW1wb3J0IHtFdmVudEVtaXR0ZXJ9IGZyb20gJ25vZGUtZXZlbnRzJ1xyXG5pbXBvcnQgTlJlYWRMaW5lcyBmcm9tICducG0tbi1yZWFkbGluZXMnXHJcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXHJcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcydcclxuaW1wb3J0IHtcclxuXHRwYXJzZSwgcmVzb2x2ZSwgcmVsYXRpdmUsIGZyb21GaWxlVXJsLFxyXG5cdH0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5cclxuaW1wb3J0IHtcclxuXHRwYXNzLCB1bmRlZiwgZGVmaW5lZCwgbm90ZGVmaW5lZCwgc2xlZXAsIHRvUmVsUGF0aCxcclxuXHRub3JtYWxpemVQYXRoLCB0b0Z1bGxQYXRoLCBhbGxMaW5lc0luLFxyXG5cdGZpbGVFeHQsIHdpdGhFeHQsIGdldEZpbGVTdGF0cyxcclxuXHRjcm9haywgYXNzZXJ0LCBvYnZpb3VzbHksXHJcblx0fSBmcm9tICdiYXNlJ1xyXG5pbXBvcnQge1xyXG5cdGlzRW1wdHksIG5vbkVtcHR5LCBpc1N0cmluZywgaXNOb25FbXB0eVN0cmluZyxcclxuXHRpc0Jvb2xlYW4sIGlzTnVtYmVyLCBpc0ludGVnZXIsIGlzQXJyYXksIGlzQXJyYXlPZlN0cmluZ3MsXHJcblx0aXNIYXNoLCBpc1JlZ0V4cCwgaW50ZWdlciwgaGFzaCwgaGFzaG9mLCBUVm9pZEZ1bmMsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcbmltcG9ydCB7XHJcblx0Z2V0T3B0aW9ucywgZW5jb2RlLCBzcGFjZXMsXHJcblx0c2luY2VMb2FkU3RyLCBhcnJheVRvQmxvY2ssIHdvcmRzLFxyXG5cdH0gZnJvbSAnbGx1dGlscydcclxuaW1wb3J0IHtpc01ldGFEYXRhU3RhcnQsIGNvbnZlcnRNZXRhRGF0YX0gZnJvbSAnbWV0YS1kYXRhJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7T0wsIE1MfSBmcm9tICd0by1uaWNlJ1xyXG5pbXBvcnQge1xyXG5cdHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsIExPRywgREJHLCBXQVJOLCBFUlIsXHJcblx0SU5ERU5ULCBVTkRFTlQsIERCR1ZBTFVFLFxyXG5cdH0gZnJvbSAnbG9nZ2VyJ1xyXG5pbXBvcnQge2NpdmV0MnRzRmlsZX0gZnJvbSAnbGxjaXZldCdcclxuXHJcbmV4cG9ydCB7XHJcblx0bm9ybWFsaXplUGF0aCwgdG9SZWxQYXRoLCB0b0Z1bGxQYXRoLCBhbGxMaW5lc0luLFxyXG5cdGZpbGVFeHQsIHdpdGhFeHQsIGdldEZpbGVTdGF0cyxcclxuXHR9XHJcblxyXG4jIC0tLSBDcmVhdGUgYSBmdW5jdGlvbiBjYXBhYmxlIG9mIHN5bmNocm9ub3VzbHlcclxuIyAgICAgaW1wb3J0aW5nIEVTTSBtb2R1bGVzXHJcblxyXG5EZW5vIDo9IGdsb2JhbFRoaXMuRGVub1xyXG50eXBlIEZzRXZlbnQgPSBEZW5vLkZzRXZlbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgRGVuby5GaWxlSW5mbyBoYXM6XHJcbiMgICAgaXNGaWxlIChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgcmVndWxhciBmaWxlLlxyXG4jICAgIGlzRGlyZWN0b3J5IChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgZGlyZWN0b3J5LlxyXG4jICAgIGlzU3ltbGluayAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHN5bWxpbmsuXHJcbiMgICAgc2l6ZSAobnVtYmVyKTogRmlsZSBzaXplIGluIGJ5dGVzLlxyXG4jICAgIG10aW1lIChEYXRlIHwgbnVsbCk6IE1vZGlmaWNhdGlvbiB0aW1lLlxyXG4jICAgIGF0aW1lIChEYXRlIHwgbnVsbCk6IExhc3QgYWNjZXNzIHRpbWUuXHJcbiMgICAgYmlydGh0aW1lIChEYXRlIHwgbnVsbCk6IENyZWF0aW9uIHRpbWUgKG5vdCBhdmFpbGFibGUgb24gYWxsIHBsYXRmb3JtcykuXHJcbiMgICAgbW9kZSAobnVtYmVyIHwgbnVsbCk6IFBlcm1pc3Npb25zIChQT1NJWCBvbmx5KS5cclxuIyAgICB1aWQgLyBnaWQgKG51bWJlciB8IG51bGwpOiBPd25lci9ncm91cCBJRCAoUE9TSVggb25seSlcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuLyoqXHJcbiAqIHJldHVybnMgb25lIG9mOlxyXG4gKiAgICAnbWlzc2luZycgIC0gZG9lcyBub3QgZXhpc3RcclxuICogICAgJ2RpcicgICAgICAtIGlzIGEgZGlyZWN0b3J5XHJcbiAqICAgICdmaWxlJyAgICAgLSBpcyBhIGZpbGVcclxuICogICAgJ3N5bWxpbmsnICAtIGlzIGEgc3ltbGlua1xyXG4gKiAgICAndW5rbm93bicgIC0gZXhpc3RzLCBidXQgbm90IGEgZmlsZSwgZGlyZWN0b3J5IG9yIHN5bWxpbmtcclxuICovXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aFR5cGUgPSAnbWlzc2luZycgfCAnZmlsZScgfCAnZGlyJyB8ICdzeW1saW5rJyB8ICd1bmtub3duJ1xyXG5cclxuZXhwb3J0IGlzUGF0aFR5cGUgOj0gKHg6IHVua25vd24pOiB4IGlzIFRQYXRoVHlwZSA9PlxyXG5cclxuXHRyZXR1cm4gaXNTdHJpbmcoeCkgJiYgd29yZHMoJ21pc3NpbmcgZmlsZSBkaXIgc3ltbGluayB1bmtub3duJykuaW5jbHVkZXMoeClcclxuXHJcbmV4cG9ydCBnZXRQYXRoVHlwZSA6PSAocGF0aDogc3RyaW5nKTogVFBhdGhUeXBlID0+XHJcblxyXG5cdGFzc2VydCBpc1N0cmluZyhwYXRoKSwgXCJub3QgYSBzdHJpbmc6ICN7T0wocGF0aCl9XCJcclxuXHRpZiBub3QgZXhpc3RzU3luYyhwYXRoKVxyXG5cdFx0cmV0dXJuICdtaXNzaW5nJ1xyXG5cdGggOj0gZ2V0RmlsZVN0YXRzIHBhdGhcclxuXHRyZXR1cm4gKFxyXG5cdFx0ICBoLmlzRmlsZSAgICAgICAgID8gJ2ZpbGUnXHJcblx0XHQ6IGguaXNEaXJlY3RvcnkgICAgPyAnZGlyJ1xyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgJ3Vua25vd24nXHJcblx0XHQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzU3R1YiA6PSAoc3RyOiBzdHJpbmcpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIGEgc3R1YiBjYW5ub3QgY29udGFpbiBhbnkgb2YgJ1xcXFwnLCAnLydcclxuXHRyZXR1cm4gbm90ZGVmaW5lZChzdHIubWF0Y2ggL1tcXFxcXFwvXS8pICYmIChzdHJbMF0gIT0gJy4nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b3VjaCA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRmZCA6PSBvcGVuU3luYyhwYXRoLCAnYScpXHJcblx0Y2xvc2VTeW5jKGZkKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoVG9VUkwgOj0gKC4uLmxQYXJ0czogc3RyaW5nW10pOiBzdHJpbmcgPT5cclxuXHJcblx0cGF0aCA6PSByZXNvbHZlIC4uLmxQYXJ0c1xyXG5cdHJldHVybiBuZXcgVVJMKCdmaWxlOicgKyBwYXRoKS5ocmVmLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rcGF0aCA6PSAoLi4ubFBhcnRzOiBzdHJpbmc/W10pOiBzdHJpbmcgPT5cclxuXHJcblx0ZGVidWdnZXJcclxuXHRsVXNlUGFydHMgOj0gQXJyYXkuZnJvbSBNQVAgbFBhcnRzLCAoeCkgLT5cclxuXHRcdGlmIG5vbkVtcHR5KHgpXHJcblx0XHRcdG9idmlvdXNseSBkZWZpbmVkKHgpXHJcblx0XHRcdCMgLS0tIFJlbW92ZSBhbnkgbGVhZGluZyBvciB0cmFpbGluZyBzbGFzaGVzLFxyXG5cdFx0XHQjICAgICBldmVuIGlmIGxlYWRpbmcgc2xhc2ggaXMgcHJlY2VkZWQgYnkgJy4nXHJcblx0XHRcdGxNYXRjaGVzIDo9IHgubWF0Y2ggLy8vXlxyXG5cdFx0XHRcdCg/OlxyXG5cdFx0XHRcdFx0XFwuPyBbXFxcXFxcL11cclxuXHRcdFx0XHRcdCk/XHJcblx0XHRcdFx0KC4qPylcclxuXHRcdFx0XHRbXFxcXFxcL10/XHJcblx0XHRcdFx0JC8vL1xyXG5cdFx0XHRpZiBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHRcdHlpZWxkIGxNYXRjaGVzWzFdXHJcblx0XHRyZXR1cm5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbFVzZVBhcnRzLmpvaW4oJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoRGVzYyA9IHtcclxuXHRkaXI6IHN0cmluZ1xyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGxQYXJ0czogc3RyaW5nW11cclxuXHR9XHJcblxyXG5leHBvcnQgcGF0aFN1YkRpcnMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVFBhdGhEZXNjID0+XHJcblxyXG5cdHBhdGggPSB0b0Z1bGxQYXRoKHBhdGgpXHJcblx0e3Jvb3QsIGRpcn0gOj0gcGFyc2UgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRkaXJcclxuXHRcdHJvb3RcclxuXHRcdGxQYXJ0czogZGlyLnNsaWNlKHJvb3QubGVuZ3RoKS5zcGxpdCgvW1xcXFxcXC9dLylcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIFNob3VsZCBiZSBjYWxsZWQgbGlrZTogbXlzZWxmKGltcG9ydC5tZXRhLnVybClcclxuIyAgICAgcmV0dXJucyBmdWxsIHBhdGggb2YgY3VycmVudCBmaWxlXHJcblxyXG5leHBvcnQgbXlzZWxmIDo9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gdG9SZWxQYXRoIGZyb21GaWxlVXJsIHVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBiYXJmIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0YXBwZW5kOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRhcHBlbmQ6IGZhbHNlXHJcblx0XHR9XHJcblx0bWtEaXJzRm9yRmlsZSBwYXRoXHJcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcclxuXHRpZiBhcHBlbmQgJiYgaXNGaWxlKHBhdGgpXHJcblx0XHRhcHBlbmRGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0ZWxzZVxyXG5cdFx0RGVuby53cml0ZUZpbGVTeW5jIHBhdGgsIGRhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRleHQ6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtleHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZXh0OiAnLmNpdmV0J1xyXG5cdFx0fVxyXG5cdHRlbXBGaWxlUGF0aCA6PSBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeDogZXh0fVxyXG5cdGJhcmYgdGVtcEZpbGVQYXRoLCBjb250ZW50c1xyXG5cdHJldHVybiB0ZW1wRmlsZVBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXHJcblx0XHRzcmNQYXRoOiBzdHJpbmcsXHJcblx0XHRkZXN0UGF0aDogc3RyaW5nICAgICMgLS0tIGNhbiBiZSBhIGZpbGUgZXh0ZW5zaW9uXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIHNvdXJjZSBmaWxlIG11c3QgZXhpc3RcclxuXHRhc3NlcnQgaXNGaWxlKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChzcmNQYXRoKX1cIlxyXG5cclxuXHQjIC0tLSBhbGxvdyBwYXNzaW5nIGEgZmlsZSBleHRlbnNpb24gZm9yIDJuZCBhcmd1bWVudFxyXG5cdGlmIGRlc3RQYXRoLnN0YXJ0c1dpdGgoJy4nKVxyXG5cdFx0ZGVzdFBhdGggPSB3aXRoRXh0KHNyY1BhdGgsIGRlc3RQYXRoKVxyXG5cclxuXHRpZiBub3QgZXhpc3RzU3luYyhkZXN0UGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdHRyeVxyXG5cdFx0ZGVzdG1zIDo9IGdldEZpbGVTdGF0cyhkZXN0UGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKGRlc3RtcylcclxuXHRcdHNyY21zICA6PSBnZXRGaWxlU3RhdHMoc3JjUGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKHNyY21zKVxyXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcclxuXHRjYXRjaCBlcnJcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpciA6PSAoXHJcblx0XHRkaXJQYXRoOiBzdHJpbmcsXHJcblx0XHRjbGVhcjogYm9vbGVhbiA9IGZhbHNlXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIGNsZWFyXHJcblx0XHQjIC0tLSBjcmVhdGVzIGRpciBpZiBpdCBkb2Vzbid0IGV4aXN0XHJcblx0XHRlbXB0eURpclN5bmMgZGlyUGF0aFxyXG5cdGVsc2VcclxuXHRcdGVuc3VyZURpclN5bmMgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHtyb290LCBsUGFydHN9IDo9IHBhdGhTdWJEaXJzIHBhdGhcclxuXHRsZXQgZGlyID0gcm9vdFxyXG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xyXG5cdFx0ZGlyICs9IFwiLyN7cGFydH1cIlxyXG5cdFx0aWYgbm90IGlzRGlyKGRpcilcclxuXHRcdFx0bWtEaXIgZGlyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMoZGlyUGF0aCkgJiYgaXNEaXIoZGlyUGF0aClcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0bWtEaXIgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGc0V2ZW50SGFuZGxlciA9IChraW5kOiBzdHJpbmcsIHBhdGg6IHN0cmluZykgPT4gdm9pZCB8IGJvb2xlYW5cclxuLyoqXHJcbiAqIGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcclxuICogICAgaGFuZGxlcyBmaWxlIGNoYW5nZWQgZXZlbnRzIHdoZW4gLmhhbmRsZShmc0V2ZW50KSBpcyBjYWxsZWRcclxuICogICAgY2FsbGJhY2sgaXMgYSBmdW5jdGlvbiwgZGVib3VuY2VkIGJ5IDIwMCBtc1xyXG4gKiAgICAgICB0aGF0IHRha2VzIGFuIEZzRXZlbnQgYW5kIHJldHVybnMgYSBUVm9pZEZ1bmNcclxuICogICAgICAgd2hpY2ggd2lsbCBiZSBjYWxsZWQgaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgYSBmdW5jdGlvbiByZWZlcmVuY2VcclxuICogW3VuaXQgdGVzdHNdKC4uL3Rlc3QvZnMudGVzdC5jaXZldCM6fjp0ZXh0PSUyMyUyMCUyRCUyRCUyRCUyMGNsYXNzJTIwRmlsZUV2ZW50SGFuZGxlcilcclxuICovXHJcblxyXG5leHBvcnQgY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxyXG5cdGhhbmRsZXI6IFRGc0V2ZW50SGFuZGxlciAjIC0tLSBkZWJvdW5jZWQgaGFuZGxlclxyXG5cdG9uU3RvcDogPT4gdm9pZCA9IHBhc3NcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKGNhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIsIGhPcHRpb25zOiBoYXNoID0ge30pXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0b25TdG9wOiBUVm9pZEZ1bmNcclxuXHRcdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHRcdH1cclxuXHRcdHtvblN0b3A6IG9uU3RvcDEsIGRlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcclxuXHRcdFx0b25TdG9wOiBwYXNzXHJcblx0XHRcdGRlYm91bmNlQnk6IDIwMFxyXG5cdFx0QG9uU3RvcCA9IG9uU3RvcDFcclxuXHRcdGhhbmRsZXIxIDo9IGRlYm91bmNlIGNhbGxiYWNrLCBkZWJvdW5jZUJ5XHJcblx0XHRAaGFuZGxlciA9IGhhbmRsZXIxXHJcblx0XHREQkcgXCJGaWxlRXZlbnRIYW5kbGVyIGNvbnN0cnVjdG9yKCkgY2FsbGVkXCJcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyAtLS0gQ2FsbHMgYSBUVm9pZEZ1bmMsIGJ1dCBpcyBkZWJvdW5jZWQgYnkgQG1zIG1zXHJcblxyXG5cdGhhbmRsZShmc0V2ZW50OiBGc0V2ZW50KTogdm9pZFxyXG5cdFx0e2tpbmQsIHBhdGhzfSA6PSBmc0V2ZW50XHJcblx0XHREQkcgXCJIQU5ETEU6IFsje3NpbmNlTG9hZFN0cigpfV0gI3traW5kfSAje09MKHBhdGhzKX1cIlxyXG5cdFx0Zm9yIHBhdGggb2YgcGF0aHNcclxuXHRcdFx0QGhhbmRsZXIga2luZCwgcGF0aFxyXG5cdFx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG4vKipcclxuICogYSBmdW5jdGlvbiB0aGF0IHdhdGNoZXMgZm9yIGNoYW5nZXMgb25lIG9yIG1vcmUgZmlsZXMgb3IgZGlyZWN0b3JpZXNcclxuICogICAgYW5kIGNhbGxzIGEgY2FsbGJhY2sgZnVuY3Rpb24gZm9yIGVhY2ggY2hhbmdlLlxyXG4gKiBJZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnVlLCB3YXRjaGluZyBpcyBoYWx0ZWRcclxuICpcclxuICogVXNhZ2U6XHJcbiAqICAgaGFuZGxlciA6PSAoa2luZCwgcGF0aCkgPT4gY29uc29sZS5sb2cgcGF0aFxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSAndGVtcC50eHQnLCBoYW5kbGVyXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICdzcmMvbGliJywgIGhhbmRsZXJcclxuICogICBhd2FpdCB3YXRjaEZpbGUgWyd0ZW1wLnR4dCcsICdzcmMvbGliJ10sIGhhbmRsZXJcclxuICovXHJcblxyXG5leHBvcnQgd2F0Y2hGaWxlcyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdHdhdGNoZXJDQjogVEZzRXZlbnRIYW5kbGVyLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCAtPlxyXG5cclxuXHQjIC0tLSBkZWJvdW5jZUJ5IGlzIG1pbGxpc2Vjb25kcyB0byBkZWJvdW5jZSBieSwgZGVmYXVsdCBpcyAyMDBcclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGRlYm91bmNlQnk6IG51bWJlclxyXG5cdFx0fVxyXG5cdHtkZWJvdW5jZUJ5fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGRlYm91bmNlQnk6IDIwMFxyXG5cdFx0fVxyXG5cclxuXHREQkcgXCJXQVRDSDogI3tPTChwYXRoKX1cIlxyXG5cdHdhdGNoZXIgOj0gRGVuby53YXRjaEZzIHBhdGhcclxuXHRsZXQgZG9TdG9wOiBib29sZWFuID0gZmFsc2VcclxuXHRmc0NhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpOiB2b2lkID0+XHJcblx0XHRyZXN1bHQgOj0gd2F0Y2hlckNCIGtpbmQsIHBhdGhcclxuXHRcdERCRyBcIkZDQjogcmVzdWx0ID0gI3tyZXN1bHR9XCJcclxuXHRcdGlmIHJlc3VsdFxyXG5cdFx0XHR3YXRjaGVyLmNsb3NlKClcclxuXHRcdHJldHVyblxyXG5cdGhhbmRsZXIgOj0gbmV3IEZpbGVFdmVudEhhbmRsZXIoZnNDYWxsYmFjaywgeyBkZWJvdW5jZUJ5IH0pXHJcblx0Zm9yIGF3YWl0IGl0ZW0gb2Ygd2F0Y2hlclxyXG5cdFx0ZnNFdmVudDogRnNFdmVudCA6PSBpdGVtXHJcblx0XHREQkcgXCJ3YXRjaGVyIGV2ZW50IGZpcmVkXCJcclxuXHRcdGlmIGRvU3RvcFxyXG5cdFx0XHREQkcgXCJkb1N0b3AgPSAje2RvU3RvcH0sIENsb3Npbmcgd2F0Y2hlclwiXHJcblx0XHRcdGJyZWFrXHJcblx0XHRmb3IgcGF0aCBvZiBmc0V2ZW50LnBhdGhzXHJcblx0XHRcdCMgLS0tIGZzQ2FsbGJhY2sgd2lsbCBiZSAoZXZlbnR1YWxseSkgY2FsbGVkXHJcblx0XHRcdGhhbmRsZXIuaGFuZGxlIGZzRXZlbnRcclxuZXhwb3J0IHdhdGNoRmlsZSA6PSB3YXRjaEZpbGVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGNoRmlyc3RMaW5lIDo9IChwYXRoOiBzdHJpbmcsIHN0cjogc3RyaW5nLCBuZXdzdHI6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gUmVwbGFjZSBzdHIgd2l0aCBuZXdzdHIsIGJ1dCBvbmx5IG9uIGZpcnN0IGxpbmVcclxuXHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdG5sUG9zIDo9IGNvbnRlbnRzLmluZGV4T2YgXCJcXG5cIlxyXG5cdHN0clBvcyA6PSBjb250ZW50cy5pbmRleE9mIHN0clxyXG5cdGlmIChzdHJQb3MgIT0gLTEpICYmICgobmxQb3MgPT0gLTEpIHx8IChzdHJQb3MgPCBubFBvcykpXHJcblx0XHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIGNvbnRlbnRzLnJlcGxhY2Uoc3RyLCBuZXdzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBFWEFNUExFIFVTQUdFOlxyXG4jXHRcdFx0aERhdGEgOj0gYXdhaXQgZnJvbUpzb25GaWxlKCdkYXRhLmpzb25jJylcclxuI1x0XHRcdGNvbnNvbGUuZGlyIGltcG9ydE1hcFxyXG5cclxuZXhwb3J0IGZyb21Kc29uRmlsZSA6PSAocGF0aDogc3RyaW5nKTogaGFzaCA9PlxyXG5cclxuXHRpZiBpc0ZpbGUocGF0aClcclxuXHRcdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0XHRpZiBpc0VtcHR5KGNvbnRlbnRzKVxyXG5cdFx0XHRyZXR1cm4ge31cclxuXHRcdHJlc3VsdCA6PSBwYXJzZUpTT05DKGNvbnRlbnRzKVxyXG5cdFx0cmV0dXJuIGRlZmluZWQocmVzdWx0KSA/IHJlc3VsdCBhcyBoYXNoIDoge31cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4ge31cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9Kc29uRmlsZSA6PSAoXHJcblx0XHRkYXRhOiBoYXNoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAzKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhZGRKc29uVmFsdWUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRrZXk6IHN0cmluZ1xyXG5cdFx0dmFsdWU6IHVua25vd25cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aERhdGEgOj0gZnJvbUpzb25GaWxlKHBhdGgpXHJcblx0aWYgZGVmaW5lZChoRGF0YSkgJiYgaXNIYXNoKGhEYXRhKVxyXG5cdFx0aERhdGFba2V5XSA9IHZhbHVlXHJcblx0XHR0b0pzb25GaWxlIGhEYXRhLCBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGluU2FtZURpciA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0e2Rpcn0gOj0gcGFyc2VQYXRoKHBhdGgpXHJcblx0bmV3cGF0aCA6PSBta3BhdGgoZGlyLCBmaWxlTmFtZSlcclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlbW92ZUNSIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyLnJlcGxhY2VBbGwgJ1xccicsICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNsdXJwIDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycEFzeW5jIDo9IGFzeW5jIChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBwYXRoXHJcblx0cmV0dXJuIGRlZmluZWQoZGF0YSkgPyByZW1vdmVDUihkYXRhKSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhTdHIgOj0gKHBhdGg6IHN0cmluZywgcm9vdDogc3RyaW5nID0gJ3NyYycpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUgcm9vdCwgcGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzcGxpdFBhdHRlcm5zIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nW10sXHJcblx0XHQpOiBbc3RyaW5nW10sIHN0cmluZ1tdXSA9PlxyXG5cclxuXHR0eXBlIFRBY2N1bSA9IFtzdHJpbmdbXSwgc3RyaW5nW11dXHJcblxyXG5cdGFjYzA6IFRBY2N1bSA6PSBbW10sW11dXHJcblx0YWNjdW0gOj0gTUFQIGxQYXR0ZXJucywgYWNjMCwgKHBhdDogc3RyaW5nLCBhY2M6IFRBY2N1bSk6IFRBY2N1bSAtPlxyXG5cdFx0W2xQb3MsIGxOZWddIDo9IGFjY1xyXG5cdFx0bE1hdGNoZXMgOj0gcGF0Lm1hdGNoIC8vL14gXFwhIFxccysgKC4qKSAkLy8vXHJcblx0XHRyZXR1cm4gKFxyXG5cdFx0XHQgIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdD8gWyBsUG9zLCAgICAgICAgICAgICAgbE5lZy5jb25jYXQobE1hdGNoZXNbMV0pXVxyXG5cdFx0XHQ6IFsgbFBvcy5jb25jYXQocGF0KSwgIGxOZWcgICAgICAgICAgICAgICAgICAgIF1cclxuXHRcdFx0KVxyXG5cdHJldHVybiBhY2N1bVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpXHJcbiMgICAgICAgICAgT1JcclxuIyAgICAgICBsUGF0aHMgOj0gQXJyYXkuZnJvbShhbGxGaWxlc01hdGNoaW5nKGxQYXRzKSlcclxuI1xyXG4jICAgIE5PVEU6IEJ5IGRlZmF1bHQsIHNlYXJjaGVzIGZyb20gLlxyXG4jICAgICAgICAgIEJ5IGRlZmF1bHQsIGlnbm9yZXMgYW55dGhpbmcgaW5zaWRlIGEgZm9sZGVyXHJcbiMgICAgICAgICAgICAgICAgICAgICAgbmFtZWQgJ3RlbXAnIG9yICdzYXZlJ1xyXG5cclxuZXhwb3J0IGFsbEZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRoTW9yZUdsb2JPcHRpb25zOiBoYXNoXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdGluY2x1ZGVEaXJzOiBib29sZWFuXHJcblx0XHR9XHJcblxyXG5cdHtyb290LCBoTW9yZUdsb2JPcHRpb25zLCBsSWdub3JlRGlycywgaW5jbHVkZURpcnNcclxuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdHJvb3Q6ICcuJ1xyXG5cdFx0XHRoTW9yZUdsb2JPcHRpb25zOiB7fVxyXG5cdFx0XHRsSWdub3JlRGlyczogWyd0ZW1wJywgJ3NhdmUnXVxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnNcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdGxNb3JlUGF0dGVybnMgOj0gKFxyXG5cdFx0ICBkZWZpbmVkKGxJZ25vcmVEaXJzKVxyXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+IFwiISAqKi8je3h9LyoqXCIpXHJcblx0XHQ6IFtdXHJcblx0XHQpXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zLmNvbmNhdChsTW9yZVBhdHRlcm5zLi4uKVxyXG5cdGlmIGlzRW1wdHkobFBvc1BhdHMpXHJcblx0XHRyZXR1cm5cclxuXHRpZiBub25FbXB0eShsTmVnUGF0cylcclxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcclxuXHRpZiBkZWJ1Z2dpbmdcclxuXHRcdExPRyBcIlBBVFRFUk5TOlwiXHJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRcdExPRyBcIiAgIFBPUzogI3twYXR9XCJcclxuXHRcdGZvciBwYXQgb2YgbE5lZ1BhdHNcclxuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxyXG5cdHNldFNraXAgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRmb3IgZW50cnkgb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdHtwYXRofSA6PSBlbnRyeVxyXG5cdFx0XHRpZiBub3Qgc2V0U2tpcC5oYXMocGF0aClcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIlBBVEg6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4jIC0tLSBoT3B0aW9ucyBnZXRzIHBhc3NlZCB0byBhbGxGaWxlc01hdGNoaW5nKClcclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdH1cclxuXHR7cm9vdCwgbElnbm9yZURpcnN9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRsSWdub3JlRGlyczogWycudGVtcCcsICcuc2F2ZSddXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHRwYXQgOj0gcm9vdCA/IFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiIDogXCIqKi8je2ZpbGVOYW1lfVwiXHJcblxyXG5cdCMgTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbEZpbGVzTWF0Y2hpbmcgcGF0LCB7XHJcblx0XHRsSWdub3JlRGlyc1xyXG5cdFx0fVxyXG5cdERCR1ZBTFVFICdsUGF0aHMnLCBsUGF0aHNcclxuXHRzd2l0Y2ggbFBhdGhzLmxlbmd0aFxyXG5cdFx0Y2FzZSAxOlxyXG5cdFx0XHRwYXRoIDo9IGxQYXRoc1swXVxyXG5cdFx0XHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vdCBhIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBwYXRoXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEdFTkVSQVRPUlxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRGlyc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbERpcnMgOj0gQXJyYXkuZnJvbShhbGxEaXJzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuL3NyY1xyXG5cclxuZXhwb3J0IGFsbERpcnNNYXRjaGluZyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPiAtPlxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdDogJy4vc3JjJ1xyXG5cdFx0aW5jbHVkZURpcnM6IHRydWVcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gaXNTdHJpbmcobFBhdHRlcm5zKSA/IFtsUGF0dGVybnNdIDogbFBhdHRlcm5zXHJcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsQWxsUGF0dGVybnNcclxuXHRpZiBsTmVnUGF0cy5sZW5ndGggPiAwXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpICYmIGdldEZpbGVTdGF0cyhwYXRoKS5pc0RpcmVjdG9yeVxyXG5cdFx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdFx0TE9HIFwiRElSOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoSW5mbyA9XHJcblx0cm9vdDogc3RyaW5nXHJcblx0ZGlyOiBzdHJpbmdcclxuXHRmaWxlTmFtZTogc3RyaW5nXHJcblx0c3R1Yjogc3RyaW5nXHJcblx0cHVycG9zZTogc3RyaW5nP1xyXG5cdGV4dDogc3RyaW5nP1xyXG5cclxuZXhwb3J0IHBhcnNlUGF0aCA6PSAocGF0aDogc3RyaW5nKTogVFBhdGhJbmZvID0+XHJcblxyXG5cdGlmIGRlZmluZWQocGF0aC5tYXRjaCAvXmZpbGVcXDpcXC9cXC8vKVxyXG5cdFx0cGF0aCA9IGZyb21GaWxlVXJsKHBhdGgpXHJcblx0e3Jvb3QsIGRpciwgYmFzZX0gOj0gcGFyc2VGaWxlUGF0aCBwYXRoXHJcblx0bFBhcnRzIDo9IGJhc2Uuc3BsaXQgJy4nXHJcblx0blBhcnRzIDo9IGxQYXJ0cy5sZW5ndGhcclxuXHRsZXQgcmVmMVxyXG5cdHN3aXRjaCBuUGFydHNcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIHBhdGg6ICN7cGF0aH1cIilcclxuXHRcdHdoZW4gMVxyXG5cdFx0XHRyZWYxID0gYmFzZVxyXG5cdFx0d2hlbiAyXHJcblx0XHRcdHJlZjEgPSBsUGFydHNbMF1cclxuXHRcdGRlZmF1bHQ6XHJcblx0XHRcdHJlZjEgPSBsUGFydHMuc2xpY2UoMCwgLTIpLmpvaW4oJy4nKVxyXG5cdHN0dWIgOj0gcmVmMVxyXG5cdHJldHVybiB7XHJcblx0XHRyb290OiBub3JtYWxpemVQYXRoKHJvb3QpXHJcblx0XHRkaXI6IG5vcm1hbGl6ZVBhdGgoZGlyKVxyXG5cdFx0ZmlsZU5hbWU6IGJhc2VcclxuXHRcdHN0dWJcclxuXHRcdHB1cnBvc2U6IGlmIChuUGFydHMgPiAyKSB0aGVuIGxQYXJ0cy5hdCgtMikgZWxzZSB1bmRlZlxyXG5cdFx0ZXh0OiBpZiAoblBhcnRzID4gMSkgdGhlbiBcIi4je2xQYXJ0cy5hdCgtMSl9XCIgZWxzZSB1bmRlZlxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNGaWxlIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNGaWxlXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aHJvdyBlcnJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNEaXIgOj0gKHBhdGg6IHN0cmluZz8pOiBib29sZWFuID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQocGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdHRyeVxyXG5cdFx0c3RhdHMgOj0gZ2V0RmlsZVN0YXRzIHBhdGhcclxuXHRcdHJldHVybiBzdGF0cy5pc0RpcmVjdG9yeVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhyb3cgZXJyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJtRmlsZSA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRpZiBpc0ZpbGUocGF0aClcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJtRGlyIDo9IChwYXRoOiBzdHJpbmcsIGhPcHRpb25zOiBoYXNoID0ge30pOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7Y2xlYXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcclxuXHRcdGNsZWFyOiBmYWxzZVxyXG5cdGlmIGV4aXN0c1N5bmMocGF0aClcclxuXHRcdGFzc2VydCBpc0RpcihwYXRoKSwgXCJOb3QgYSBkaXJlY3Rvcnk6ICN7cGF0aH1cIlxyXG5cdFx0aWYgY2xlYXJcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGgsIHJlY3Vyc2l2ZTogdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1ZhbGlkU3R1YiA6PSAoc3R1Yjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgY2ggb2YgWycsJywgJy8nLCAnXFxcXCddXHJcblx0XHRpZiBzdHViLmluY2x1ZGVzKGNoKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gKHN0dWIgIT0gJ2FsbCcpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFRleHRGaWxlSW5mbyA9IHtcclxuXHRtZXRhRGF0YTogdW5rbm93blxyXG5cdGNvbnRlbnRzOiBzdHJpbmc/XHJcblx0cmVhZGVyOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPj9cclxuXHRuTGluZXM6IG51bWJlclxyXG5cdH1cclxuXHJcbmV4cG9ydCBvcGVuVGV4dEZpbGUgPSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUVGV4dEZpbGVJbmZvID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZWFnZXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7ZWFnZXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZWFnZXI6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcclxuXHRuUmVhZGVyIDo9IG5ldyBOUmVhZExpbmVzKHBhdGgpXHJcblx0Z2V0TGluZSA6PSAoKTogc3RyaW5nPyA9PlxyXG5cdFx0YnVmZmVyIDo9IG5SZWFkZXIubmV4dCgpXHJcblx0XHRpZiBkZWZpbmVkKGJ1ZmZlcilcclxuXHRcdFx0cmV0dXJuIHJlbW92ZUNSKGJ1ZmZlci50b1N0cmluZygpKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gdW5kZWZcclxuXHJcblx0IyAtLS0gd2UgbmVlZCB0byBnZXQgdGhlIGZpcnN0IGxpbmUgdG8gY2hlY2sgaWZcclxuXHQjICAgICB0aGVyZSdzIG1ldGEgZGF0YS4gQnV0IGlmIHRoZXJlIGlzIG5vdCxcclxuXHQjICAgICB3ZSBuZWVkIHRvIHJldHVybiBpdCBieSB0aGUgcmVhZGVyXHJcblxyXG5cdGZpcnN0TGluZSA6PSBnZXRMaW5lKClcclxuXHRpZiBub3RkZWZpbmVkKGZpcnN0TGluZSlcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdG1ldGFEYXRhOiB1bmRlZlxyXG5cdFx0XHRyZWFkZXI6IHVuZGVmXHJcblx0XHRcdGNvbnRlbnRzOiB1bmRlZlxyXG5cdFx0XHRuTGluZXM6IDBcclxuXHRcdFx0fVxyXG5cclxuXHQjIC0tLSBHZXQgbWV0YSBkYXRhIGlmIHByZXNlbnRcclxuXHRoYXNNZXRhRGF0YSA6PSBpc01ldGFEYXRhU3RhcnQoZmlyc3RMaW5lKVxyXG5cdGxldCBuTWV0YUxpbmVzID0gMFxyXG5cclxuXHRtZXRhRGF0YSA6PSAoXHJcblx0XHRpZiBoYXNNZXRhRGF0YVxyXG5cdFx0XHRsTWV0YUxpbmVzOiBzdHJpbmdbXSA6PSBbXVxyXG5cdFx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxyXG5cdFx0XHR3aGlsZSBsaW5lICYmIChsaW5lICE9IGZpcnN0TGluZSlcclxuXHRcdFx0XHRsTWV0YUxpbmVzLnB1c2ggbGluZVxyXG5cdFx0XHRcdGxpbmUgPSBnZXRMaW5lKClcclxuXHRcdFx0bk1ldGFMaW5lcyA9IGxNZXRhTGluZXMubGVuZ3RoICsgMlxyXG5cdFx0XHRjb252ZXJ0TWV0YURhdGEoZmlyc3RMaW5lLCBhcnJheVRvQmxvY2sobE1ldGFMaW5lcykpXHJcblx0XHRlbHNlXHJcblx0XHRcdHVuZGVmXHJcblx0XHQpXHJcblxyXG5cdCMgLS0tIGdlbmVyYXRvciB0aGF0IGFsbG93cyByZWFkaW5nIGNvbnRlbnRzXHJcblx0cmVhZGVyIDo9ICgpOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPiAtPlxyXG5cdFx0aWYgbm90IGhhc01ldGFEYXRhICYmIGRlZmluZWQoZmlyc3RMaW5lKVxyXG5cdFx0XHR5aWVsZCBmaXJzdExpbmVcclxuXHRcdGxldCBsaW5lID0gZ2V0TGluZSgpXHJcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXHJcblx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0bGluZSA9IGdldExpbmUoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLS0tIG51bWJlciBvZiBsaW5lcyBpbiBmaWxlIHJlYWQgc28gZmFyXHJcblx0aWYgZWFnZXJcclxuXHRcdGxMaW5lcyA6PSBBcnJheS5mcm9tKHJlYWRlcigpKVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0bWV0YURhdGFcclxuXHRcdFx0cmVhZGVyOiB1bmRlZlxyXG5cdFx0XHRjb250ZW50czogYXJyYXlUb0Jsb2NrKGxMaW5lcylcclxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzICsgbExpbmVzLmxlbmd0aFxyXG5cdFx0XHR9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0bWV0YURhdGFcclxuXHRcdFx0cmVhZGVyOiByZWFkZXIoKVxyXG5cdFx0XHRjb250ZW50czogdW5kZWZcclxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzXHJcblx0XHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb25maWdGcm9tRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBoYXNoID0+XHJcblxyXG5cdHBhdGggOj0gZmluZEZpbGUgZmlsZU5hbWVcclxuXHRhc3NlcnQgZGVmaW5lZChwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0woZmlsZU5hbWUpfVwiXHJcblx0e3B1cnBvc2UsIGV4dH0gOj0gcGFyc2VQYXRoIHBhdGhcclxuXHRhc3NlcnQgKHB1cnBvc2UgPT0gJ2NvbmZpZycpLCBcIk5vdCBhIGNvbmZpZyBmaWxlOiAje09MKHBhdGgpfVwiXHJcblx0aWYgKGV4dCA9PSAnLmNpdmV0JylcclxuXHRcdHRzUGF0aCA6PSBhd2FpdCBjaXZldDJ0c0ZpbGUgcGF0aFxyXG5cdFx0REJHIFwiSW1wb3J0IGNvbmZpZyBmcm9tICN7T0wodHNQYXRoKX1cIlxyXG5cdFx0dXJsIDo9IHBhdGhUb0ZpbGVVUkwgdHNQYXRoXHJcblx0XHREQkdWQUxVRSAndXJsJywgdXJsXHJcblx0XHRyZXR1cm4gYXdhaXQgaW1wb3J0IHVybFxyXG5cdGVsc2UgaWYgKGV4dCA9PSAnLnRzJylcclxuXHRcdERCRyBcIkltcG9ydCBjb25maWcgZnJvbSAje09MKHBhdGgpfVwiXHJcblx0XHR1cmwgOj0gcGF0aFRvRmlsZVVSTCBwYXRoXHJcblx0XHREQkdWQUxVRSAndXJsJywgdXJsXHJcblx0XHRyZXR1cm4gYXdhaXQgaW1wb3J0IHVybFxyXG5cdGVsc2VcclxuXHRcdGNyb2FrIFwiTm90IGEgY2l2ZXQgb3IgdHMgZmlsZTogI3tmaWxlTmFtZX1cIlxyXG4iXX0=