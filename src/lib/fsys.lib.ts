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
	pushLogLevel, popLogLevel, LOG, DBG, WARN, ERR,
	INDENT, UNDENT,
	} from 'base'
import {
	isEmpty, nonEmpty, isString, isNonEmptyString,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {MAP} from 'mapper'
import {
	getOptions, encode, spaces,
	sinceLoadStr, arrayToBlock, words, f,
	} from 'llutils'
import {isMetaDataStart, convertMetaData} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, ML, DBGVALUE} from 'to-nice'
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

	// --- config should be a hash named hConfig

	// --- NOTE: If a defined path is returned, it definitely exists
	const path = findFile(fileName)
	assert(defined(path), `No such file: ${OL(fileName)}`)
	const {purpose, ext} = parsePath(path)
	assert(defined(ext), `No file ext in ${OL(path)}`)
	assert((purpose === 'config'), `Not a config file: ${OL(path)}`)
	assert(['.civet', '.ts'].includes(ext), `Invalid path: ${OL(path)}`)
//	assert (ext == '.civet') || (ext == '.ts'), "Invalid path: #{OL(path)}"
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjXFxsaWJcXGZzeXMubGliLnRzIiwic291cmNlcyI6WyJzcmMvbGliL2ZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQzNDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMs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QUFBLEVBQUUsR0FBRyxDQUFDLENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEMsQ0FBQyxDLENBQUssQ0FBQyxLQUFoQyxDQUFxQztBQUMxRCxDQUFDLEM7QUFBQyxDQUFBO0FBQ0YsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQyxDLENBQUMsQUFBQyxNLFksQ0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDNUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFDLEs7Q0FBSyxDQUFBO0FBQ2QsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFBO0FBQ0osQUFBQSxFQUFPLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxZQUFZLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDNUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTTtDQUFNLENBQUE7QUFDckIsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFBO0FBQzFDLEFBQUEsR0FBRyxNQUFNLENBQUMsSztFQUFLLENBQUE7QUFDZixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEdBQUcsS0FBSyxDQUFDLEc7RUFBRyxDO0NBQUEsQztBQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDLEMsQ0FBQyxBQUFDLE0sWSxDQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxNQUFNLENBQUMsSztDQUFLLENBQUE7QUFDZCxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUE7QUFDSixBQUFBLEVBQU8sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLFlBQVksQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUM1QixBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXO0NBQVcsQ0FBQTtBQUMxQixBQUFBLENBQUMsS0FBSyxDQUFDLENBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLO0VBQUssQ0FBQTtBQUNmLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxLQUFLLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDO0NBQUEsQ0FBQTtBQUN0QixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzVELEFBQUE7QUFDQSxBQUFBLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNiLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPO0FBQ2hCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBUSxNQUFQLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUE7QUFDckMsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUssQztDQUFBLENBQUEsQ0FBQTtBQUNkLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2hELEFBQUEsRUFBRSxHQUFHLENBQUEsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQSxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUEsQztFQUFBLENBQUE7QUFDeEMsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUEsQUFBQyxJQUFJLEM7RUFBQSxDO0NBQUEsQ0FBQTtBQUN2QixBQUFBLENB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LE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ3BDLEFBQUEsRyxPQUFHLGFBQWEsQ0FBQSxBQUFDLE1BQU0sQztFQUFBLENBQUE7QUFDdkIsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHLE9BQUcsYUFBYSxDQUFBLEFBQUMsSUFBSSxDO0VBQUEsQyxDLEMsRSxDQUFBO0FBQ3JCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBRSxNQUFELENBQUMsQ0FBQyxDQUFFLENBQUMsS0FBSyxDLE1BQU8sQ0FBQSxBQUFDLEdBQUcsQ0FBQTtBQUN0QixBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPO0FBQU8sQ0FBQTtBQUNqQiIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBmc3lzLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtwYXJzZTogcGFyc2VGaWxlUGF0aH0gZnJvbSAnbm9kZS1wYXRoJ1xyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUpTT05DLCBKc29uVmFsdWV9IGZyb20gJ0BzdGQvanNvbmMnXHJcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJ0BzdGQvYXN5bmMvZGVib3VuY2UnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge2FwcGVuZEZpbGVTeW5jLCBvcGVuU3luYywgY2xvc2VTeW5jfSBmcm9tICdub2RlLWZzJ1xyXG5pbXBvcnQge3BhdGhUb0ZpbGVVUkx9IGZyb20gJ25vZGUtdXJsJ1xyXG5pbXBvcnQge0V2ZW50RW1pdHRlcn0gZnJvbSAnbm9kZS1ldmVudHMnXHJcbmltcG9ydCBOUmVhZExpbmVzIGZyb20gJ25wbS1uLXJlYWRsaW5lcydcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zJ1xyXG5pbXBvcnQge1xyXG5cdHBhcnNlLCByZXNvbHZlLCByZWxhdGl2ZSwgZnJvbUZpbGVVcmwsXHJcblx0fSBmcm9tICdAc3RkL3BhdGgnXHJcblxyXG5pbXBvcnQge1xyXG5cdHBhc3MsIHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBzbGVlcCwgdG9SZWxQYXRoLFxyXG5cdG5vcm1hbGl6ZVBhdGgsIHRvRnVsbFBhdGgsIGFsbExpbmVzSW4sXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgZ2V0RmlsZVN0YXRzLFxyXG5cdGNyb2FrLCBhc3NlcnQsIG9idmlvdXNseSxcclxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLCBMT0csIERCRywgV0FSTiwgRVJSLFxyXG5cdElOREVOVCwgVU5ERU5ULFxyXG5cdH0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtcclxuXHRpc0VtcHR5LCBub25FbXB0eSwgaXNTdHJpbmcsIGlzTm9uRW1wdHlTdHJpbmcsXHJcblx0aXNCb29sZWFuLCBpc051bWJlciwgaXNJbnRlZ2VyLCBpc0FycmF5LCBpc0FycmF5T2ZTdHJpbmdzLFxyXG5cdGlzSGFzaCwgaXNSZWdFeHAsIGludGVnZXIsIGhhc2gsIGhhc2hvZiwgVFZvaWRGdW5jLFxyXG5cdH0gZnJvbSAnZGF0YXR5cGVzJ1xyXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xyXG5pbXBvcnQge1xyXG5cdGdldE9wdGlvbnMsIGVuY29kZSwgc3BhY2VzLFxyXG5cdHNpbmNlTG9hZFN0ciwgYXJyYXlUb0Jsb2NrLCB3b3JkcywgZixcclxuXHR9IGZyb20gJ2xsdXRpbHMnXHJcbmltcG9ydCB7aXNNZXRhRGF0YVN0YXJ0LCBjb252ZXJ0TWV0YURhdGF9IGZyb20gJ21ldGEtZGF0YSdcclxuaW1wb3J0IHtkZWJ1Z2dpbmd9IGZyb20gJ2NtZC1hcmdzJ1xyXG5pbXBvcnQge09MLCBNTCwgREJHVkFMVUV9IGZyb20gJ3RvLW5pY2UnXHJcbmltcG9ydCB7Y2l2ZXQydHNGaWxlfSBmcm9tICdsbGNpdmV0J1xyXG5cclxuZXhwb3J0IHtcclxuXHRub3JtYWxpemVQYXRoLCB0b1JlbFBhdGgsIHRvRnVsbFBhdGgsIGFsbExpbmVzSW4sXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgZ2V0RmlsZVN0YXRzLFxyXG5cdH1cclxuXHJcbiMgLS0tIENyZWF0ZSBhIGZ1bmN0aW9uIGNhcGFibGUgb2Ygc3luY2hyb25vdXNseVxyXG4jICAgICBpbXBvcnRpbmcgRVNNIG1vZHVsZXNcclxuXHJcbkRlbm8gOj0gZ2xvYmFsVGhpcy5EZW5vXHJcbnR5cGUgRnNFdmVudCA9IERlbm8uRnNFdmVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBEZW5vLkZpbGVJbmZvIGhhczpcclxuIyAgICBpc0ZpbGUgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSByZWd1bGFyIGZpbGUuXHJcbiMgICAgaXNEaXJlY3RvcnkgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBkaXJlY3RvcnkuXHJcbiMgICAgaXNTeW1saW5rIChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgc3ltbGluay5cclxuIyAgICBzaXplIChudW1iZXIpOiBGaWxlIHNpemUgaW4gYnl0ZXMuXHJcbiMgICAgbXRpbWUgKERhdGUgfCBudWxsKTogTW9kaWZpY2F0aW9uIHRpbWUuXHJcbiMgICAgYXRpbWUgKERhdGUgfCBudWxsKTogTGFzdCBhY2Nlc3MgdGltZS5cclxuIyAgICBiaXJ0aHRpbWUgKERhdGUgfCBudWxsKTogQ3JlYXRpb24gdGltZSAobm90IGF2YWlsYWJsZSBvbiBhbGwgcGxhdGZvcm1zKS5cclxuIyAgICBtb2RlIChudW1iZXIgfCBudWxsKTogUGVybWlzc2lvbnMgKFBPU0lYIG9ubHkpLlxyXG4jICAgIHVpZCAvIGdpZCAobnVtYmVyIHwgbnVsbCk6IE93bmVyL2dyb3VwIElEIChQT1NJWCBvbmx5KVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vKipcclxuICogcmV0dXJucyBvbmUgb2Y6XHJcbiAqICAgICdtaXNzaW5nJyAgLSBkb2VzIG5vdCBleGlzdFxyXG4gKiAgICAnZGlyJyAgICAgIC0gaXMgYSBkaXJlY3RvcnlcclxuICogICAgJ2ZpbGUnICAgICAtIGlzIGEgZmlsZVxyXG4gKiAgICAnc3ltbGluaycgIC0gaXMgYSBzeW1saW5rXHJcbiAqICAgICd1bmtub3duJyAgLSBleGlzdHMsIGJ1dCBub3QgYSBmaWxlLCBkaXJlY3Rvcnkgb3Igc3ltbGlua1xyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoVHlwZSA9ICdtaXNzaW5nJyB8ICdmaWxlJyB8ICdkaXInIHwgJ3N5bWxpbmsnIHwgJ3Vua25vd24nXHJcblxyXG5leHBvcnQgaXNQYXRoVHlwZSA6PSAoeDogdW5rbm93bik6IHggaXMgVFBhdGhUeXBlID0+XHJcblxyXG5cdHJldHVybiBpc1N0cmluZyh4KSAmJiB3b3JkcygnbWlzc2luZyBmaWxlIGRpciBzeW1saW5rIHVua25vd24nKS5pbmNsdWRlcyh4KVxyXG5cclxuZXhwb3J0IGdldFBhdGhUeXBlIDo9IChwYXRoOiBzdHJpbmcpOiBUUGF0aFR5cGUgPT5cclxuXHJcblx0YXNzZXJ0IGlzU3RyaW5nKHBhdGgpLCBcIm5vdCBhIHN0cmluZzogI3tPTChwYXRoKX1cIlxyXG5cdGlmIG5vdCBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRyZXR1cm4gJ21pc3NpbmcnXHJcblx0aCA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdHJldHVybiAoXHJcblx0XHQgIGguaXNGaWxlICAgICAgICAgPyAnZmlsZSdcclxuXHRcdDogaC5pc0RpcmVjdG9yeSAgICA/ICdkaXInXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAndW5rbm93bidcclxuXHRcdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNTdHViIDo9IChzdHI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gYSBzdHViIGNhbm5vdCBjb250YWluIGFueSBvZiAnXFxcXCcsICcvJ1xyXG5cdHJldHVybiBub3RkZWZpbmVkKHN0ci5tYXRjaCAvW1xcXFxcXC9dLykgJiYgKHN0clswXSAhPSAnLicpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvdWNoIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGZkIDo9IG9wZW5TeW5jKHBhdGgsICdhJylcclxuXHRjbG9zZVN5bmMoZmQpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhUb1VSTCA6PSAoLi4ubFBhcnRzOiBzdHJpbmdbXSk6IHN0cmluZyA9PlxyXG5cclxuXHRwYXRoIDo9IHJlc29sdmUgLi4ubFBhcnRzXHJcblx0cmV0dXJuIG5ldyBVUkwoJ2ZpbGU6JyArIHBhdGgpLmhyZWYucmVwbGFjZUFsbCgnXFxcXCcsICcvJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtwYXRoIDo9ICguLi5sUGFydHM6IHN0cmluZz9bXSk6IHN0cmluZyA9PlxyXG5cclxuXHRsVXNlUGFydHMgOj0gQXJyYXkuZnJvbSBNQVAgbFBhcnRzLCAoeCkgLT5cclxuXHRcdGlmIG5vbkVtcHR5KHgpXHJcblx0XHRcdG9idmlvdXNseSBkZWZpbmVkKHgpXHJcblx0XHRcdCMgLS0tIFJlbW92ZSBhbnkgbGVhZGluZyBvciB0cmFpbGluZyBzbGFzaGVzLFxyXG5cdFx0XHQjICAgICBldmVuIGlmIGxlYWRpbmcgc2xhc2ggaXMgcHJlY2VkZWQgYnkgJy4nXHJcblx0XHRcdGxNYXRjaGVzIDo9IHgubWF0Y2ggLy8vXlxyXG5cdFx0XHRcdCg/OlxyXG5cdFx0XHRcdFx0XFwuPyBbXFxcXFxcL11cclxuXHRcdFx0XHRcdCk/XHJcblx0XHRcdFx0KC4qPylcclxuXHRcdFx0XHRbXFxcXFxcL10/XHJcblx0XHRcdFx0JC8vL1xyXG5cdFx0XHRpZiBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHRcdHlpZWxkIGxNYXRjaGVzWzFdXHJcblx0XHRyZXR1cm5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbFVzZVBhcnRzLmpvaW4oJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoRGVzYyA9IHtcclxuXHRkaXI6IHN0cmluZ1xyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGxQYXJ0czogc3RyaW5nW11cclxuXHR9XHJcblxyXG5leHBvcnQgcGF0aFN1YkRpcnMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVFBhdGhEZXNjID0+XHJcblxyXG5cdHBhdGggPSB0b0Z1bGxQYXRoKHBhdGgpXHJcblx0e3Jvb3QsIGRpcn0gOj0gcGFyc2UgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRkaXJcclxuXHRcdHJvb3RcclxuXHRcdGxQYXJ0czogZGlyLnNsaWNlKHJvb3QubGVuZ3RoKS5zcGxpdCgvW1xcXFxcXC9dLylcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIFNob3VsZCBiZSBjYWxsZWQgbGlrZTogbXlzZWxmKGltcG9ydC5tZXRhLnVybClcclxuIyAgICAgcmV0dXJucyBmdWxsIHBhdGggb2YgY3VycmVudCBmaWxlXHJcblxyXG5leHBvcnQgbXlzZWxmIDo9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gdG9SZWxQYXRoIGZyb21GaWxlVXJsIHVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBiYXJmIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0YXBwZW5kOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRhcHBlbmQ6IGZhbHNlXHJcblx0XHR9XHJcblx0bWtEaXJzRm9yRmlsZSBwYXRoXHJcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcclxuXHRpZiBhcHBlbmQgJiYgaXNGaWxlKHBhdGgpXHJcblx0XHRhcHBlbmRGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0ZWxzZVxyXG5cdFx0RGVuby53cml0ZUZpbGVTeW5jIHBhdGgsIGRhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRleHQ6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtleHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZXh0OiAnLmNpdmV0J1xyXG5cdFx0fVxyXG5cdHRlbXBGaWxlUGF0aCA6PSBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeDogZXh0fVxyXG5cdGJhcmYgdGVtcEZpbGVQYXRoLCBjb250ZW50c1xyXG5cdHJldHVybiB0ZW1wRmlsZVBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXHJcblx0XHRzcmNQYXRoOiBzdHJpbmcsXHJcblx0XHRkZXN0UGF0aDogc3RyaW5nICAgICMgLS0tIGNhbiBiZSBhIGZpbGUgZXh0ZW5zaW9uXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIHNvdXJjZSBmaWxlIG11c3QgZXhpc3RcclxuXHRhc3NlcnQgaXNGaWxlKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChzcmNQYXRoKX1cIlxyXG5cclxuXHQjIC0tLSBhbGxvdyBwYXNzaW5nIGEgZmlsZSBleHRlbnNpb24gZm9yIDJuZCBhcmd1bWVudFxyXG5cdGlmIGRlc3RQYXRoLnN0YXJ0c1dpdGgoJy4nKVxyXG5cdFx0ZGVzdFBhdGggPSB3aXRoRXh0KHNyY1BhdGgsIGRlc3RQYXRoKVxyXG5cclxuXHRpZiBub3QgZXhpc3RzU3luYyhkZXN0UGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdHRyeVxyXG5cdFx0ZGVzdG1zIDo9IGdldEZpbGVTdGF0cyhkZXN0UGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKGRlc3RtcylcclxuXHRcdHNyY21zICA6PSBnZXRGaWxlU3RhdHMoc3JjUGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKHNyY21zKVxyXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcclxuXHRjYXRjaCBlcnJcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpciA6PSAoXHJcblx0XHRkaXJQYXRoOiBzdHJpbmcsXHJcblx0XHRjbGVhcjogYm9vbGVhbiA9IGZhbHNlXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIGNsZWFyXHJcblx0XHQjIC0tLSBjcmVhdGVzIGRpciBpZiBpdCBkb2Vzbid0IGV4aXN0XHJcblx0XHRlbXB0eURpclN5bmMgZGlyUGF0aFxyXG5cdGVsc2VcclxuXHRcdGVuc3VyZURpclN5bmMgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHtyb290LCBsUGFydHN9IDo9IHBhdGhTdWJEaXJzIHBhdGhcclxuXHRsZXQgZGlyID0gcm9vdFxyXG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xyXG5cdFx0ZGlyICs9IFwiLyN7cGFydH1cIlxyXG5cdFx0aWYgbm90IGlzRGlyKGRpcilcclxuXHRcdFx0bWtEaXIgZGlyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMoZGlyUGF0aCkgJiYgaXNEaXIoZGlyUGF0aClcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0bWtEaXIgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGc0V2ZW50SGFuZGxlciA9IChraW5kOiBzdHJpbmcsIHBhdGg6IHN0cmluZykgPT4gdm9pZCB8IGJvb2xlYW5cclxuLyoqXHJcbiAqIGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcclxuICogICAgaGFuZGxlcyBmaWxlIGNoYW5nZWQgZXZlbnRzIHdoZW4gLmhhbmRsZShmc0V2ZW50KSBpcyBjYWxsZWRcclxuICogICAgY2FsbGJhY2sgaXMgYSBmdW5jdGlvbiwgZGVib3VuY2VkIGJ5IDIwMCBtc1xyXG4gKiAgICAgICB0aGF0IHRha2VzIGFuIEZzRXZlbnQgYW5kIHJldHVybnMgYSBUVm9pZEZ1bmNcclxuICogICAgICAgd2hpY2ggd2lsbCBiZSBjYWxsZWQgaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgYSBmdW5jdGlvbiByZWZlcmVuY2VcclxuICogW3VuaXQgdGVzdHNdKC4uL3Rlc3QvZnMudGVzdC5jaXZldCM6fjp0ZXh0PSUyMyUyMCUyRCUyRCUyRCUyMGNsYXNzJTIwRmlsZUV2ZW50SGFuZGxlcilcclxuICovXHJcblxyXG5leHBvcnQgY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxyXG5cdGhhbmRsZXI6IFRGc0V2ZW50SGFuZGxlciAjIC0tLSBkZWJvdW5jZWQgaGFuZGxlclxyXG5cdG9uU3RvcDogPT4gdm9pZCA9IHBhc3NcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKGNhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIsIGhPcHRpb25zOiBoYXNoID0ge30pXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0b25TdG9wOiBUVm9pZEZ1bmNcclxuXHRcdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHRcdH1cclxuXHRcdHtvblN0b3A6IG9uU3RvcDEsIGRlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcclxuXHRcdFx0b25TdG9wOiBwYXNzXHJcblx0XHRcdGRlYm91bmNlQnk6IDIwMFxyXG5cdFx0QG9uU3RvcCA9IG9uU3RvcDFcclxuXHRcdGhhbmRsZXIxIDo9IGRlYm91bmNlIGNhbGxiYWNrLCBkZWJvdW5jZUJ5XHJcblx0XHRAaGFuZGxlciA9IGhhbmRsZXIxXHJcblx0XHREQkcgXCJGaWxlRXZlbnRIYW5kbGVyIGNvbnN0cnVjdG9yKCkgY2FsbGVkXCJcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyAtLS0gQ2FsbHMgYSBUVm9pZEZ1bmMsIGJ1dCBpcyBkZWJvdW5jZWQgYnkgQG1zIG1zXHJcblxyXG5cdGhhbmRsZShmc0V2ZW50OiBGc0V2ZW50KTogdm9pZFxyXG5cdFx0e2tpbmQsIHBhdGhzfSA6PSBmc0V2ZW50XHJcblx0XHREQkcgXCJIQU5ETEU6IFsje3NpbmNlTG9hZFN0cigpfV0gI3traW5kfSAje09MKHBhdGhzKX1cIlxyXG5cdFx0Zm9yIHBhdGggb2YgcGF0aHNcclxuXHRcdFx0QGhhbmRsZXIga2luZCwgcGF0aFxyXG5cdFx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG4vKipcclxuICogYSBmdW5jdGlvbiB0aGF0IHdhdGNoZXMgZm9yIGNoYW5nZXMgb25lIG9yIG1vcmUgZmlsZXMgb3IgZGlyZWN0b3JpZXNcclxuICogICAgYW5kIGNhbGxzIGEgY2FsbGJhY2sgZnVuY3Rpb24gZm9yIGVhY2ggY2hhbmdlLlxyXG4gKiBJZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnVlLCB3YXRjaGluZyBpcyBoYWx0ZWRcclxuICpcclxuICogVXNhZ2U6XHJcbiAqICAgaGFuZGxlciA6PSAoa2luZCwgcGF0aCkgPT4gY29uc29sZS5sb2cgcGF0aFxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSAndGVtcC50eHQnLCBoYW5kbGVyXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICdzcmMvbGliJywgIGhhbmRsZXJcclxuICogICBhd2FpdCB3YXRjaEZpbGUgWyd0ZW1wLnR4dCcsICdzcmMvbGliJ10sIGhhbmRsZXJcclxuICovXHJcblxyXG5leHBvcnQgd2F0Y2hGaWxlcyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdHdhdGNoZXJDQjogVEZzRXZlbnRIYW5kbGVyLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCAtPlxyXG5cclxuXHQjIC0tLSBkZWJvdW5jZUJ5IGlzIG1pbGxpc2Vjb25kcyB0byBkZWJvdW5jZSBieSwgZGVmYXVsdCBpcyAyMDBcclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGRlYm91bmNlQnk6IG51bWJlclxyXG5cdFx0fVxyXG5cdHtkZWJvdW5jZUJ5fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGRlYm91bmNlQnk6IDIwMFxyXG5cdFx0fVxyXG5cclxuXHREQkcgXCJXQVRDSDogI3tPTChwYXRoKX1cIlxyXG5cdHdhdGNoZXIgOj0gRGVuby53YXRjaEZzIHBhdGhcclxuXHRsZXQgZG9TdG9wOiBib29sZWFuID0gZmFsc2VcclxuXHRmc0NhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpOiB2b2lkID0+XHJcblx0XHRyZXN1bHQgOj0gd2F0Y2hlckNCIGtpbmQsIHBhdGhcclxuXHRcdERCRyBcIkZDQjogcmVzdWx0ID0gI3tyZXN1bHR9XCJcclxuXHRcdGlmIHJlc3VsdFxyXG5cdFx0XHR3YXRjaGVyLmNsb3NlKClcclxuXHRcdHJldHVyblxyXG5cdGhhbmRsZXIgOj0gbmV3IEZpbGVFdmVudEhhbmRsZXIoZnNDYWxsYmFjaywgeyBkZWJvdW5jZUJ5IH0pXHJcblx0Zm9yIGF3YWl0IGl0ZW0gb2Ygd2F0Y2hlclxyXG5cdFx0ZnNFdmVudDogRnNFdmVudCA6PSBpdGVtXHJcblx0XHREQkcgXCJ3YXRjaGVyIGV2ZW50IGZpcmVkXCJcclxuXHRcdGlmIGRvU3RvcFxyXG5cdFx0XHREQkcgXCJkb1N0b3AgPSAje2RvU3RvcH0sIENsb3Npbmcgd2F0Y2hlclwiXHJcblx0XHRcdGJyZWFrXHJcblx0XHRmb3IgcGF0aCBvZiBmc0V2ZW50LnBhdGhzXHJcblx0XHRcdCMgLS0tIGZzQ2FsbGJhY2sgd2lsbCBiZSAoZXZlbnR1YWxseSkgY2FsbGVkXHJcblx0XHRcdGhhbmRsZXIuaGFuZGxlIGZzRXZlbnRcclxuZXhwb3J0IHdhdGNoRmlsZSA6PSB3YXRjaEZpbGVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGNoRmlyc3RMaW5lIDo9IChwYXRoOiBzdHJpbmcsIHN0cjogc3RyaW5nLCBuZXdzdHI6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gUmVwbGFjZSBzdHIgd2l0aCBuZXdzdHIsIGJ1dCBvbmx5IG9uIGZpcnN0IGxpbmVcclxuXHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdG5sUG9zIDo9IGNvbnRlbnRzLmluZGV4T2YgXCJcXG5cIlxyXG5cdHN0clBvcyA6PSBjb250ZW50cy5pbmRleE9mIHN0clxyXG5cdGlmIChzdHJQb3MgIT0gLTEpICYmICgobmxQb3MgPT0gLTEpIHx8IChzdHJQb3MgPCBubFBvcykpXHJcblx0XHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIGNvbnRlbnRzLnJlcGxhY2Uoc3RyLCBuZXdzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBFWEFNUExFIFVTQUdFOlxyXG4jXHRcdFx0aERhdGEgOj0gYXdhaXQgZnJvbUpzb25GaWxlKCdkYXRhLmpzb25jJylcclxuI1x0XHRcdGNvbnNvbGUuZGlyIGltcG9ydE1hcFxyXG5cclxuZXhwb3J0IGZyb21Kc29uRmlsZSA6PSAocGF0aDogc3RyaW5nKTogaGFzaCA9PlxyXG5cclxuXHRpZiBpc0ZpbGUocGF0aClcclxuXHRcdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0XHRpZiBpc0VtcHR5KGNvbnRlbnRzKVxyXG5cdFx0XHRyZXR1cm4ge31cclxuXHRcdHJlc3VsdCA6PSBwYXJzZUpTT05DKGNvbnRlbnRzKVxyXG5cdFx0cmV0dXJuIGRlZmluZWQocmVzdWx0KSA/IHJlc3VsdCBhcyBoYXNoIDoge31cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4ge31cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9Kc29uRmlsZSA6PSAoXHJcblx0XHRkYXRhOiBoYXNoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAzKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhZGRKc29uVmFsdWUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRrZXk6IHN0cmluZ1xyXG5cdFx0dmFsdWU6IHVua25vd25cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aERhdGEgOj0gZnJvbUpzb25GaWxlKHBhdGgpXHJcblx0aWYgZGVmaW5lZChoRGF0YSkgJiYgaXNIYXNoKGhEYXRhKVxyXG5cdFx0aERhdGFba2V5XSA9IHZhbHVlXHJcblx0XHR0b0pzb25GaWxlIGhEYXRhLCBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGluU2FtZURpciA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0e2Rpcn0gOj0gcGFyc2VQYXRoKHBhdGgpXHJcblx0bmV3cGF0aCA6PSBta3BhdGgoZGlyLCBmaWxlTmFtZSlcclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlbW92ZUNSIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyLnJlcGxhY2VBbGwgJ1xccicsICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNsdXJwIDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycEFzeW5jIDo9IGFzeW5jIChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0ZGF0YSA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBwYXRoXHJcblx0cmV0dXJuIGRlZmluZWQoZGF0YSkgPyByZW1vdmVDUihkYXRhKSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhTdHIgOj0gKHBhdGg6IHN0cmluZywgcm9vdDogc3RyaW5nID0gJ3NyYycpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUgcm9vdCwgcGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzcGxpdFBhdHRlcm5zIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nW10sXHJcblx0XHQpOiBbc3RyaW5nW10sIHN0cmluZ1tdXSA9PlxyXG5cclxuXHR0eXBlIFRBY2N1bSA9IFtzdHJpbmdbXSwgc3RyaW5nW11dXHJcblxyXG5cdGFjYzA6IFRBY2N1bSA6PSBbW10sW11dXHJcblx0YWNjdW0gOj0gTUFQIGxQYXR0ZXJucywgYWNjMCwgKHBhdDogc3RyaW5nLCBhY2M6IFRBY2N1bSk6IFRBY2N1bSAtPlxyXG5cdFx0W2xQb3MsIGxOZWddIDo9IGFjY1xyXG5cdFx0bE1hdGNoZXMgOj0gcGF0Lm1hdGNoIC8vL14gXFwhIFxccysgKC4qKSAkLy8vXHJcblx0XHRyZXR1cm4gKFxyXG5cdFx0XHQgIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdD8gWyBsUG9zLCAgICAgICAgICAgICAgbE5lZy5jb25jYXQobE1hdGNoZXNbMV0pXVxyXG5cdFx0XHQ6IFsgbFBvcy5jb25jYXQocGF0KSwgIGxOZWcgICAgICAgICAgICAgICAgICAgIF1cclxuXHRcdFx0KVxyXG5cdHJldHVybiBhY2N1bVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpXHJcbiMgICAgICAgICAgT1JcclxuIyAgICAgICBsUGF0aHMgOj0gQXJyYXkuZnJvbShhbGxGaWxlc01hdGNoaW5nKGxQYXRzKSlcclxuI1xyXG4jICAgIE5PVEU6IEJ5IGRlZmF1bHQsIHNlYXJjaGVzIGZyb20gLlxyXG4jICAgICAgICAgIEJ5IGRlZmF1bHQsIGlnbm9yZXMgYW55dGhpbmcgaW5zaWRlIGEgZm9sZGVyXHJcbiMgICAgICAgICAgICAgICAgICAgICAgbmFtZWQgJ3RlbXAnIG9yICdzYXZlJ1xyXG5cclxuZXhwb3J0IGFsbEZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRoTW9yZUdsb2JPcHRpb25zOiBoYXNoXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdGluY2x1ZGVEaXJzOiBib29sZWFuXHJcblx0XHR9XHJcblxyXG5cdHtyb290LCBoTW9yZUdsb2JPcHRpb25zLCBsSWdub3JlRGlycywgaW5jbHVkZURpcnNcclxuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdHJvb3Q6ICcuJ1xyXG5cdFx0XHRoTW9yZUdsb2JPcHRpb25zOiB7fVxyXG5cdFx0XHRsSWdub3JlRGlyczogWyd0ZW1wJywgJ3NhdmUnXVxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnNcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdGxNb3JlUGF0dGVybnMgOj0gKFxyXG5cdFx0ICBkZWZpbmVkKGxJZ25vcmVEaXJzKVxyXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+IFwiISAqKi8je3h9LyoqXCIpXHJcblx0XHQ6IFtdXHJcblx0XHQpXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zLmNvbmNhdChsTW9yZVBhdHRlcm5zLi4uKVxyXG5cdGlmIGlzRW1wdHkobFBvc1BhdHMpXHJcblx0XHRyZXR1cm5cclxuXHRpZiBub25FbXB0eShsTmVnUGF0cylcclxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcclxuXHRpZiBkZWJ1Z2dpbmdcclxuXHRcdExPRyBcIlBBVFRFUk5TOlwiXHJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRcdExPRyBcIiAgIFBPUzogI3twYXR9XCJcclxuXHRcdGZvciBwYXQgb2YgbE5lZ1BhdHNcclxuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxyXG5cdHNldFNraXAgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRmb3IgcGF0IG9mIGxQb3NQYXRzXHJcblx0XHRmb3IgZW50cnkgb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdHtwYXRofSA6PSBlbnRyeVxyXG5cdFx0XHRpZiBub3Qgc2V0U2tpcC5oYXMocGF0aClcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIlBBVEg6ICN7cGF0aH1cIlxyXG5cdFx0XHRcdG5wYXRoIDo9IG5vcm1hbGl6ZVBhdGgocGF0aClcclxuXHRcdFx0XHR5aWVsZCBucGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4jIC0tLSBoT3B0aW9ucyBnZXRzIHBhc3NlZCB0byBhbGxGaWxlc01hdGNoaW5nKClcclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cclxuXHRcdH1cclxuXHR7cm9vdCwgbElnbm9yZURpcnN9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0cm9vdDogJy4nXHJcblx0XHRsSWdub3JlRGlyczogWycudGVtcCcsICcuc2F2ZSddXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHRwYXQgOj0gcm9vdCA/IFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiIDogXCIqKi8je2ZpbGVOYW1lfVwiXHJcblxyXG5cdCMgTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbEZpbGVzTWF0Y2hpbmcgcGF0LCB7XHJcblx0XHRsSWdub3JlRGlyc1xyXG5cdFx0fVxyXG5cdERCR1ZBTFVFICdsUGF0aHMnLCBsUGF0aHNcclxuXHRzd2l0Y2ggbFBhdGhzLmxlbmd0aFxyXG5cdFx0Y2FzZSAxOlxyXG5cdFx0XHRwYXRoIDo9IGxQYXRoc1swXVxyXG5cdFx0XHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vdCBhIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBwYXRoXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEdFTkVSQVRPUlxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRGlyc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbERpcnMgOj0gQXJyYXkuZnJvbShhbGxEaXJzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuL3NyY1xyXG5cclxuZXhwb3J0IGFsbERpcnNNYXRjaGluZyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPiAtPlxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdDogJy4vc3JjJ1xyXG5cdFx0aW5jbHVkZURpcnM6IHRydWVcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gaXNTdHJpbmcobFBhdHRlcm5zKSA/IFtsUGF0dGVybnNdIDogbFBhdHRlcm5zXHJcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsQWxsUGF0dGVybnNcclxuXHRpZiBsTmVnUGF0cy5sZW5ndGggPiAwXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpICYmIGdldEZpbGVTdGF0cyhwYXRoKS5pc0RpcmVjdG9yeVxyXG5cdFx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdFx0TE9HIFwiRElSOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoSW5mbyA9XHJcblx0cm9vdDogc3RyaW5nXHJcblx0ZGlyOiBzdHJpbmdcclxuXHRmaWxlTmFtZTogc3RyaW5nXHJcblx0c3R1Yjogc3RyaW5nXHJcblx0cHVycG9zZTogc3RyaW5nP1xyXG5cdGV4dDogc3RyaW5nP1xyXG5cclxuZXhwb3J0IHBhcnNlUGF0aCA6PSAocGF0aDogc3RyaW5nKTogVFBhdGhJbmZvID0+XHJcblxyXG5cdGlmIGRlZmluZWQocGF0aC5tYXRjaCAvXmZpbGVcXDpcXC9cXC8vKVxyXG5cdFx0cGF0aCA9IGZyb21GaWxlVXJsKHBhdGgpXHJcblx0e3Jvb3QsIGRpciwgYmFzZX0gOj0gcGFyc2VGaWxlUGF0aCBwYXRoXHJcblx0bFBhcnRzIDo9IGJhc2Uuc3BsaXQgJy4nXHJcblx0blBhcnRzIDo9IGxQYXJ0cy5sZW5ndGhcclxuXHRsZXQgcmVmMVxyXG5cdHN3aXRjaCBuUGFydHNcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIHBhdGg6ICN7cGF0aH1cIilcclxuXHRcdHdoZW4gMVxyXG5cdFx0XHRyZWYxID0gYmFzZVxyXG5cdFx0d2hlbiAyXHJcblx0XHRcdHJlZjEgPSBsUGFydHNbMF1cclxuXHRcdGRlZmF1bHQ6XHJcblx0XHRcdHJlZjEgPSBsUGFydHMuc2xpY2UoMCwgLTIpLmpvaW4oJy4nKVxyXG5cdHN0dWIgOj0gcmVmMVxyXG5cdHJldHVybiB7XHJcblx0XHRyb290OiBub3JtYWxpemVQYXRoKHJvb3QpXHJcblx0XHRkaXI6IG5vcm1hbGl6ZVBhdGgoZGlyKVxyXG5cdFx0ZmlsZU5hbWU6IGJhc2VcclxuXHRcdHN0dWJcclxuXHRcdHB1cnBvc2U6IGlmIChuUGFydHMgPiAyKSB0aGVuIGxQYXJ0cy5hdCgtMikgZWxzZSB1bmRlZlxyXG5cdFx0ZXh0OiBpZiAoblBhcnRzID4gMSkgdGhlbiBcIi4je2xQYXJ0cy5hdCgtMSl9XCIgZWxzZSB1bmRlZlxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNGaWxlIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNGaWxlXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aHJvdyBlcnJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNEaXIgOj0gKHBhdGg6IHN0cmluZz8pOiBib29sZWFuID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQocGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdHRyeVxyXG5cdFx0c3RhdHMgOj0gZ2V0RmlsZVN0YXRzIHBhdGhcclxuXHRcdHJldHVybiBzdGF0cy5pc0RpcmVjdG9yeVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhyb3cgZXJyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJtRmlsZSA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRpZiBpc0ZpbGUocGF0aClcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJtRGlyIDo9IChwYXRoOiBzdHJpbmcsIGhPcHRpb25zOiBoYXNoID0ge30pOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7Y2xlYXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcclxuXHRcdGNsZWFyOiBmYWxzZVxyXG5cdGlmIGV4aXN0c1N5bmMocGF0aClcclxuXHRcdGFzc2VydCBpc0RpcihwYXRoKSwgXCJOb3QgYSBkaXJlY3Rvcnk6ICN7cGF0aH1cIlxyXG5cdFx0aWYgY2xlYXJcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGgsIHJlY3Vyc2l2ZTogdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1ZhbGlkU3R1YiA6PSAoc3R1Yjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgY2ggb2YgWycsJywgJy8nLCAnXFxcXCddXHJcblx0XHRpZiBzdHViLmluY2x1ZGVzKGNoKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gKHN0dWIgIT0gJ2FsbCcpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFRleHRGaWxlSW5mbyA9IHtcclxuXHRtZXRhRGF0YTogdW5rbm93blxyXG5cdGNvbnRlbnRzOiBzdHJpbmc/XHJcblx0cmVhZGVyOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPj9cclxuXHRuTGluZXM6IG51bWJlclxyXG5cdH1cclxuXHJcbmV4cG9ydCBvcGVuVGV4dEZpbGUgPSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUVGV4dEZpbGVJbmZvID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZWFnZXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7ZWFnZXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZWFnZXI6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcclxuXHRuUmVhZGVyIDo9IG5ldyBOUmVhZExpbmVzKHBhdGgpXHJcblx0Z2V0TGluZSA6PSAoKTogc3RyaW5nPyA9PlxyXG5cdFx0YnVmZmVyIDo9IG5SZWFkZXIubmV4dCgpXHJcblx0XHRpZiBkZWZpbmVkKGJ1ZmZlcilcclxuXHRcdFx0cmV0dXJuIHJlbW92ZUNSKGJ1ZmZlci50b1N0cmluZygpKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gdW5kZWZcclxuXHJcblx0IyAtLS0gd2UgbmVlZCB0byBnZXQgdGhlIGZpcnN0IGxpbmUgdG8gY2hlY2sgaWZcclxuXHQjICAgICB0aGVyZSdzIG1ldGEgZGF0YS4gQnV0IGlmIHRoZXJlIGlzIG5vdCxcclxuXHQjICAgICB3ZSBuZWVkIHRvIHJldHVybiBpdCBieSB0aGUgcmVhZGVyXHJcblxyXG5cdGZpcnN0TGluZSA6PSBnZXRMaW5lKClcclxuXHRpZiBub3RkZWZpbmVkKGZpcnN0TGluZSlcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdG1ldGFEYXRhOiB1bmRlZlxyXG5cdFx0XHRyZWFkZXI6IHVuZGVmXHJcblx0XHRcdGNvbnRlbnRzOiB1bmRlZlxyXG5cdFx0XHRuTGluZXM6IDBcclxuXHRcdFx0fVxyXG5cclxuXHQjIC0tLSBHZXQgbWV0YSBkYXRhIGlmIHByZXNlbnRcclxuXHRoYXNNZXRhRGF0YSA6PSBpc01ldGFEYXRhU3RhcnQoZmlyc3RMaW5lKVxyXG5cdGxldCBuTWV0YUxpbmVzID0gMFxyXG5cclxuXHRtZXRhRGF0YSA6PSAoXHJcblx0XHRpZiBoYXNNZXRhRGF0YVxyXG5cdFx0XHRsTWV0YUxpbmVzOiBzdHJpbmdbXSA6PSBbXVxyXG5cdFx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxyXG5cdFx0XHR3aGlsZSBsaW5lICYmIChsaW5lICE9IGZpcnN0TGluZSlcclxuXHRcdFx0XHRsTWV0YUxpbmVzLnB1c2ggbGluZVxyXG5cdFx0XHRcdGxpbmUgPSBnZXRMaW5lKClcclxuXHRcdFx0bk1ldGFMaW5lcyA9IGxNZXRhTGluZXMubGVuZ3RoICsgMlxyXG5cdFx0XHRjb252ZXJ0TWV0YURhdGEoZmlyc3RMaW5lLCBhcnJheVRvQmxvY2sobE1ldGFMaW5lcykpXHJcblx0XHRlbHNlXHJcblx0XHRcdHVuZGVmXHJcblx0XHQpXHJcblxyXG5cdCMgLS0tIGdlbmVyYXRvciB0aGF0IGFsbG93cyByZWFkaW5nIGNvbnRlbnRzXHJcblx0cmVhZGVyIDo9ICgpOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPiAtPlxyXG5cdFx0aWYgbm90IGhhc01ldGFEYXRhICYmIGRlZmluZWQoZmlyc3RMaW5lKVxyXG5cdFx0XHR5aWVsZCBmaXJzdExpbmVcclxuXHRcdGxldCBsaW5lID0gZ2V0TGluZSgpXHJcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXHJcblx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0bGluZSA9IGdldExpbmUoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLS0tIG51bWJlciBvZiBsaW5lcyBpbiBmaWxlIHJlYWQgc28gZmFyXHJcblx0aWYgZWFnZXJcclxuXHRcdGxMaW5lcyA6PSBBcnJheS5mcm9tKHJlYWRlcigpKVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0bWV0YURhdGFcclxuXHRcdFx0cmVhZGVyOiB1bmRlZlxyXG5cdFx0XHRjb250ZW50czogYXJyYXlUb0Jsb2NrKGxMaW5lcylcclxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzICsgbExpbmVzLmxlbmd0aFxyXG5cdFx0XHR9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0bWV0YURhdGFcclxuXHRcdFx0cmVhZGVyOiByZWFkZXIoKVxyXG5cdFx0XHRjb250ZW50czogdW5kZWZcclxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzXHJcblx0XHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb25maWdGcm9tRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBoYXNoID0+XHJcblxyXG5cdCMgLS0tIGNvbmZpZyBzaG91bGQgYmUgYSBoYXNoIG5hbWVkIGhDb25maWdcclxuXHJcblx0IyAtLS0gTk9URTogSWYgYSBkZWZpbmVkIHBhdGggaXMgcmV0dXJuZWQsIGl0IGRlZmluaXRlbHkgZXhpc3RzXHJcblx0cGF0aCA6PSBmaW5kRmlsZSBmaWxlTmFtZVxyXG5cdGFzc2VydCBkZWZpbmVkKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChmaWxlTmFtZSl9XCJcclxuXHR7cHVycG9zZSwgZXh0fSA6PSBwYXJzZVBhdGggcGF0aFxyXG5cdGFzc2VydCBkZWZpbmVkKGV4dCksIFwiTm8gZmlsZSBleHQgaW4gI3tPTChwYXRoKX1cIlxyXG5cdGFzc2VydCAocHVycG9zZSA9PSAnY29uZmlnJyksIFwiTm90IGEgY29uZmlnIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRhc3NlcnQgWycuY2l2ZXQnLCAnLnRzJ10uaW5jbHVkZXMoZXh0KSwgXCJJbnZhbGlkIHBhdGg6ICN7T0wocGF0aCl9XCJcclxuI1x0YXNzZXJ0IChleHQgPT0gJy5jaXZldCcpIHx8IChleHQgPT0gJy50cycpLCBcIkludmFsaWQgcGF0aDogI3tPTChwYXRoKX1cIlxyXG5cdERCRyBcIkltcG9ydCBjb25maWcgZnJvbSAje09MKHBhdGgpfVwiXHJcblx0dXJsIDo9IChcclxuXHRcdGlmIChleHQgPT0gJy5jaXZldCcpXHJcblx0XHRcdHRzUGF0aCA6PSBhd2FpdCBjaXZldDJ0c0ZpbGUgcGF0aFxyXG5cdFx0XHRwYXRoVG9GaWxlVVJMIHRzUGF0aFxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRwYXRoVG9GaWxlVVJMIHBhdGhcclxuXHRcdClcclxuXHRoIDo9IGF3YWl0IGltcG9ydCB1cmxcclxuXHRyZXR1cm4gaC5oQ29uZmlnXHJcbiJdfQ==