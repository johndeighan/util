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
	normalizePath, toFullPath, allLinesIn, TIterator,
	fileExt, withExt, getFileStats, encode,
	croak, assert, obviously, emptyIterator,
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
	getOptions, spaces,
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
		): TIterator<string> {

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

export type TFileReader = {
	hMetaData: hash
	reader: TIterator<string>
	}

export type TFileContents = {
	hMetaData: hash
	contents: string
	}

export function openTextFile(
		path: string,
		eager?: false
		): TFileReader

export function openTextFile(
		path: string,
		eager: true
		): TFileContents

export function openTextFile(
		path: string,
		eager: boolean = false
		): TFileReader | TFileContents {

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
		if (eager) {
			return {
				hMetaData: {},
				contents: ''
				}
		}
		else {
			return {
				hMetaData: {},
				reader: emptyIterator<string>()
				}
		}
	}

	// --- Get meta data if present
	const hasMetaData = isMetaDataStart(firstLine)
	let nMetaLines = 0

	const hMetaData: hash = (
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
			return ({})
		}})()
		)

	// --- generator that allows reading contents
	const reader = function*(): TIterator<string> {
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

	if (eager) {
		return {
			hMetaData,
			contents: arrayToBlock(Array.from(reader()))
			}
	}
	else {
		return {
			hMetaData,
			reader: reader()
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQzNDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsV0FB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LENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEMsQ0FBQyxDLENBQUssQ0FBQyxLQUFoQyxDQUFxQztBQUMxRCxDQUFDLEM7QUFBQyxDQUFBO0FBQ0YsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQyxDLENBQUMsQUFBQyxNLFksQ0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDNUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFDLEs7Q0FBSyxDQUFBO0FBQ2QsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFBO0FBQ0osQUFBQSxFQUFPLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxZQUFZLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDNUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTTtDQUFNLENBQUE7QUFDckIsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFBO0FBQzFDLEFBQUEsR0FBRyxNQUFNLENBQUMsSztFQUFLLENBQUE7QUFDZixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEdBQUcsS0FBSyxDQUFDLEc7RUFBRyxDO0NBQUEsQztBQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDLEMsQ0FBQyxBQUFDLE0sWSxDQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxNQUFNLENBQUMsSztDQUFLLENBQUE7QUFDZCxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUE7QUFDSixBQUFBLEVBQU8sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLFlBQVksQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUM1QixBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXO0NBQVcsQ0FBQTtBQUMxQixBQUFBLENBQUMsS0FBSyxDQUFDLENBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLO0VBQUssQ0FBQTtBQUNmLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxLQUFLLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDO0NBQUEsQ0FBQTtBQUN0QixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzVELEFBQUE7QUFDQSxBQUFBLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNiLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPO0FBQ2hCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBUSxNQUFQLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUE7QUFDckMsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUssQztDQUFBLENBQUEsQ0FBQTtBQUNkLEFBQUEsQ0FBQyxHQUFHLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2hELEFBQUEsRUFBRSxHQUFHLENBQUEsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQSxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUEsQztFQUFBLENBQUE7QUFDeEMsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUEsQUFBQyxJQUFJLEM7RUFBQSxDO0NBQUEsQ0FBQTtBQUN2QixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFD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QUFDLEtBQUssQ0FBQyxZQUFZLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDcEMsQUFBQSxHLE9BQUcsYUFBYSxDQUFBLEFBQUMsTUFBTSxDO0VBQUEsQ0FBQTtBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEcsT0FBRyxhQUFhLENBQUEsQUFBQyxJQUFJLEM7RUFBQSxDLEMsQyxFLENBQUE7QUFDckIsRUFBRSxDQUFDO0FBQ0gsQUFBQSxDQUFFLE1BQUQsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLEMsTUFBTyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ3RCLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE87QUFBTyxDQUFBO0FBQ2pCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGZzeXMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUZpbGVQYXRofSBmcm9tICdub2RlLXBhdGgnXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlSlNPTkMsIEpzb25WYWx1ZX0gZnJvbSAnQHN0ZC9qc29uYydcclxuaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnQHN0ZC9hc3luYy9kZWJvdW5jZSdcclxuaW1wb3J0IHtleGlzdHNTeW5jLCBlbXB0eURpclN5bmMsIGVuc3VyZURpclN5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7YXBwZW5kRmlsZVN5bmMsIG9wZW5TeW5jLCBjbG9zZVN5bmN9IGZyb20gJ25vZGUtZnMnXHJcbmltcG9ydCB7cGF0aFRvRmlsZVVSTH0gZnJvbSAnbm9kZS11cmwnXHJcbmltcG9ydCB7RXZlbnRFbWl0dGVyfSBmcm9tICdub2RlLWV2ZW50cydcclxuaW1wb3J0IE5SZWFkTGluZXMgZnJvbSAnbnBtLW4tcmVhZGxpbmVzJ1xyXG5pbXBvcnQge2V4cGFuZEdsb2JTeW5jfSBmcm9tICdAc3RkL2ZzL2V4cGFuZC1nbG9iJ1xyXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMnXHJcbmltcG9ydCB7XHJcblx0cGFyc2UsIHJlc29sdmUsIHJlbGF0aXZlLCBmcm9tRmlsZVVybCxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuXHJcbmltcG9ydCB7XHJcblx0cGFzcywgdW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIHNsZWVwLCB0b1JlbFBhdGgsXHJcblx0bm9ybWFsaXplUGF0aCwgdG9GdWxsUGF0aCwgYWxsTGluZXNJbiwgVEl0ZXJhdG9yLFxyXG5cdGZpbGVFeHQsIHdpdGhFeHQsIGdldEZpbGVTdGF0cywgZW5jb2RlLFxyXG5cdGNyb2FrLCBhc3NlcnQsIG9idmlvdXNseSwgZW1wdHlJdGVyYXRvcixcclxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLCBMT0csIERCRywgV0FSTiwgRVJSLFxyXG5cdElOREVOVCwgVU5ERU5ULFxyXG5cdH0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtcclxuXHRpc0VtcHR5LCBub25FbXB0eSwgaXNTdHJpbmcsIGlzTm9uRW1wdHlTdHJpbmcsXHJcblx0aXNCb29sZWFuLCBpc051bWJlciwgaXNJbnRlZ2VyLCBpc0FycmF5LCBpc0FycmF5T2ZTdHJpbmdzLFxyXG5cdGlzSGFzaCwgaXNSZWdFeHAsIGludGVnZXIsIGhhc2gsIGhhc2hvZiwgVFZvaWRGdW5jLFxyXG5cdH0gZnJvbSAnZGF0YXR5cGVzJ1xyXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xyXG5pbXBvcnQge1xyXG5cdGdldE9wdGlvbnMsIHNwYWNlcyxcclxuXHRzaW5jZUxvYWRTdHIsIGFycmF5VG9CbG9jaywgd29yZHMsIGYsXHJcblx0fSBmcm9tICdsbHV0aWxzJ1xyXG5pbXBvcnQge2lzTWV0YURhdGFTdGFydCwgY29udmVydE1ldGFEYXRhfSBmcm9tICdtZXRhLWRhdGEnXHJcbmltcG9ydCB7ZGVidWdnaW5nfSBmcm9tICdjbWQtYXJncydcclxuaW1wb3J0IHtPTCwgTUwsIERCR1ZBTFVFfSBmcm9tICd0by1uaWNlJ1xyXG5pbXBvcnQge2NpdmV0MnRzRmlsZX0gZnJvbSAnbGxjaXZldCdcclxuXHJcbmV4cG9ydCB7XHJcblx0bm9ybWFsaXplUGF0aCwgdG9SZWxQYXRoLCB0b0Z1bGxQYXRoLCBhbGxMaW5lc0luLFxyXG5cdGZpbGVFeHQsIHdpdGhFeHQsIGdldEZpbGVTdGF0cyxcclxuXHR9XHJcblxyXG4jIC0tLSBDcmVhdGUgYSBmdW5jdGlvbiBjYXBhYmxlIG9mIHN5bmNocm9ub3VzbHlcclxuIyAgICAgaW1wb3J0aW5nIEVTTSBtb2R1bGVzXHJcblxyXG5EZW5vIDo9IGdsb2JhbFRoaXMuRGVub1xyXG50eXBlIEZzRXZlbnQgPSBEZW5vLkZzRXZlbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgRGVuby5GaWxlSW5mbyBoYXM6XHJcbiMgICAgaXNGaWxlIChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgcmVndWxhciBmaWxlLlxyXG4jICAgIGlzRGlyZWN0b3J5IChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgZGlyZWN0b3J5LlxyXG4jICAgIGlzU3ltbGluayAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHN5bWxpbmsuXHJcbiMgICAgc2l6ZSAobnVtYmVyKTogRmlsZSBzaXplIGluIGJ5dGVzLlxyXG4jICAgIG10aW1lIChEYXRlIHwgbnVsbCk6IE1vZGlmaWNhdGlvbiB0aW1lLlxyXG4jICAgIGF0aW1lIChEYXRlIHwgbnVsbCk6IExhc3QgYWNjZXNzIHRpbWUuXHJcbiMgICAgYmlydGh0aW1lIChEYXRlIHwgbnVsbCk6IENyZWF0aW9uIHRpbWUgKG5vdCBhdmFpbGFibGUgb24gYWxsIHBsYXRmb3JtcykuXHJcbiMgICAgbW9kZSAobnVtYmVyIHwgbnVsbCk6IFBlcm1pc3Npb25zIChQT1NJWCBvbmx5KS5cclxuIyAgICB1aWQgLyBnaWQgKG51bWJlciB8IG51bGwpOiBPd25lci9ncm91cCBJRCAoUE9TSVggb25seSlcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuLyoqXHJcbiAqIHJldHVybnMgb25lIG9mOlxyXG4gKiAgICAnbWlzc2luZycgIC0gZG9lcyBub3QgZXhpc3RcclxuICogICAgJ2RpcicgICAgICAtIGlzIGEgZGlyZWN0b3J5XHJcbiAqICAgICdmaWxlJyAgICAgLSBpcyBhIGZpbGVcclxuICogICAgJ3N5bWxpbmsnICAtIGlzIGEgc3ltbGlua1xyXG4gKiAgICAndW5rbm93bicgIC0gZXhpc3RzLCBidXQgbm90IGEgZmlsZSwgZGlyZWN0b3J5IG9yIHN5bWxpbmtcclxuICovXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aFR5cGUgPSAnbWlzc2luZycgfCAnZmlsZScgfCAnZGlyJyB8ICdzeW1saW5rJyB8ICd1bmtub3duJ1xyXG5cclxuZXhwb3J0IGlzUGF0aFR5cGUgOj0gKHg6IHVua25vd24pOiB4IGlzIFRQYXRoVHlwZSA9PlxyXG5cclxuXHRyZXR1cm4gaXNTdHJpbmcoeCkgJiYgd29yZHMoJ21pc3NpbmcgZmlsZSBkaXIgc3ltbGluayB1bmtub3duJykuaW5jbHVkZXMoeClcclxuXHJcbmV4cG9ydCBnZXRQYXRoVHlwZSA6PSAocGF0aDogc3RyaW5nKTogVFBhdGhUeXBlID0+XHJcblxyXG5cdGFzc2VydCBpc1N0cmluZyhwYXRoKSwgXCJub3QgYSBzdHJpbmc6ICN7T0wocGF0aCl9XCJcclxuXHRpZiBub3QgZXhpc3RzU3luYyhwYXRoKVxyXG5cdFx0cmV0dXJuICdtaXNzaW5nJ1xyXG5cdGggOj0gZ2V0RmlsZVN0YXRzIHBhdGhcclxuXHRyZXR1cm4gKFxyXG5cdFx0ICBoLmlzRmlsZSAgICAgICAgID8gJ2ZpbGUnXHJcblx0XHQ6IGguaXNEaXJlY3RvcnkgICAgPyAnZGlyJ1xyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgJ3Vua25vd24nXHJcblx0XHQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzU3R1YiA6PSAoc3RyOiBzdHJpbmcpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIGEgc3R1YiBjYW5ub3QgY29udGFpbiBhbnkgb2YgJ1xcXFwnLCAnLydcclxuXHRyZXR1cm4gbm90ZGVmaW5lZChzdHIubWF0Y2ggL1tcXFxcXFwvXS8pICYmIChzdHJbMF0gIT0gJy4nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b3VjaCA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRmZCA6PSBvcGVuU3luYyhwYXRoLCAnYScpXHJcblx0Y2xvc2VTeW5jKGZkKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoVG9VUkwgOj0gKC4uLmxQYXJ0czogc3RyaW5nW10pOiBzdHJpbmcgPT5cclxuXHJcblx0cGF0aCA6PSByZXNvbHZlIC4uLmxQYXJ0c1xyXG5cdHJldHVybiBuZXcgVVJMKCdmaWxlOicgKyBwYXRoKS5ocmVmLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rcGF0aCA6PSAoLi4ubFBhcnRzOiBzdHJpbmc/W10pOiBzdHJpbmcgPT5cclxuXHJcblx0bFVzZVBhcnRzIDo9IEFycmF5LmZyb20gTUFQIGxQYXJ0cywgKHgpIC0+XHJcblx0XHRpZiBub25FbXB0eSh4KVxyXG5cdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh4KVxyXG5cdFx0XHQjIC0tLSBSZW1vdmUgYW55IGxlYWRpbmcgb3IgdHJhaWxpbmcgc2xhc2hlcyxcclxuXHRcdFx0IyAgICAgZXZlbiBpZiBsZWFkaW5nIHNsYXNoIGlzIHByZWNlZGVkIGJ5ICcuJ1xyXG5cdFx0XHRsTWF0Y2hlcyA6PSB4Lm1hdGNoIC8vL15cclxuXHRcdFx0XHQoPzpcclxuXHRcdFx0XHRcdFxcLj8gW1xcXFxcXC9dXHJcblx0XHRcdFx0XHQpP1xyXG5cdFx0XHRcdCguKj8pXHJcblx0XHRcdFx0W1xcXFxcXC9dP1xyXG5cdFx0XHRcdCQvLy9cclxuXHRcdFx0aWYgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdFx0XHR5aWVsZCBsTWF0Y2hlc1sxXVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIGxVc2VQYXJ0cy5qb2luKCcvJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aERlc2MgPSB7XHJcblx0ZGlyOiBzdHJpbmdcclxuXHRyb290OiBzdHJpbmdcclxuXHRsUGFydHM6IHN0cmluZ1tdXHJcblx0fVxyXG5cclxuZXhwb3J0IHBhdGhTdWJEaXJzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRQYXRoRGVzYyA9PlxyXG5cclxuXHRwYXRoID0gdG9GdWxsUGF0aChwYXRoKVxyXG5cdHtyb290LCBkaXJ9IDo9IHBhcnNlIHBhdGhcclxuXHRyZXR1cm4ge1xyXG5cdFx0ZGlyXHJcblx0XHRyb290XHJcblx0XHRsUGFydHM6IGRpci5zbGljZShyb290Lmxlbmd0aCkuc3BsaXQoL1tcXFxcXFwvXS8pXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBTaG91bGQgYmUgY2FsbGVkIGxpa2U6IG15c2VsZihpbXBvcnQubWV0YS51cmwpXHJcbiMgICAgIHJldHVybnMgZnVsbCBwYXRoIG9mIGN1cnJlbnQgZmlsZVxyXG5cclxuZXhwb3J0IG15c2VsZiA6PSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHRvUmVsUGF0aCBmcm9tRmlsZVVybCB1cmxcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZiA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRjb250ZW50czogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGFwcGVuZDogYm9vbGVhblxyXG5cdFx0fVxyXG5cdHthcHBlbmR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0YXBwZW5kOiBmYWxzZVxyXG5cdFx0fVxyXG5cdG1rRGlyc0ZvckZpbGUgcGF0aFxyXG5cdGRhdGEgOj0gZW5jb2RlIGNvbnRlbnRzXHJcblx0aWYgYXBwZW5kICYmIGlzRmlsZShwYXRoKVxyXG5cdFx0YXBwZW5kRmlsZVN5bmMgcGF0aCwgZGF0YVxyXG5cdGVsc2VcclxuXHRcdERlbm8ud3JpdGVGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmZUZW1wRmlsZSA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZXh0OiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZXh0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGV4dDogJy5jaXZldCdcclxuXHRcdH1cclxuXHR0ZW1wRmlsZVBhdGggOj0gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXg6IGV4dH1cclxuXHRiYXJmIHRlbXBGaWxlUGF0aCwgY29udGVudHNcclxuXHRyZXR1cm4gdGVtcEZpbGVQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGlzRmlsZShzcmNQYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0woc3JjUGF0aCl9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcylcclxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtEaXIgOj0gKFxyXG5cdFx0ZGlyUGF0aDogc3RyaW5nLFxyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBjbGVhclxyXG5cdFx0IyAtLS0gY3JlYXRlcyBkaXIgaWYgaXQgZG9lc24ndCBleGlzdFxyXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcclxuXHRlbHNlXHJcblx0XHRlbnN1cmVEaXJTeW5jIGRpclBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtEaXJzRm9yRmlsZSA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHR7cm9vdCwgbFBhcnRzfSA6PSBwYXRoU3ViRGlycyBwYXRoXHJcblx0bGV0IGRpciA9IHJvb3RcclxuXHRmb3IgcGFydCBvZiBsUGFydHNcclxuXHRcdGRpciArPSBcIi8je3BhcnR9XCJcclxuXHRcdGlmIG5vdCBpc0RpcihkaXIpXHJcblx0XHRcdG1rRGlyIGRpclxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhckRpciA6PSAoZGlyUGF0aDogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRpZiBleGlzdHNTeW5jKGRpclBhdGgpICYmIGlzRGlyKGRpclBhdGgpXHJcblx0XHRlbXB0eURpclN5bmMgZGlyUGF0aFxyXG5cdGVsc2VcclxuXHRcdG1rRGlyIGRpclBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURnNFdmVudEhhbmRsZXIgPSAoa2luZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IHZvaWQgfCBib29sZWFuXHJcbi8qKlxyXG4gKiBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXHJcbiAqICAgIGhhbmRsZXMgZmlsZSBjaGFuZ2VkIGV2ZW50cyB3aGVuIC5oYW5kbGUoZnNFdmVudCkgaXMgY2FsbGVkXHJcbiAqICAgIGNhbGxiYWNrIGlzIGEgZnVuY3Rpb24sIGRlYm91bmNlZCBieSAyMDAgbXNcclxuICogICAgICAgdGhhdCB0YWtlcyBhbiBGc0V2ZW50IGFuZCByZXR1cm5zIGEgVFZvaWRGdW5jXHJcbiAqICAgICAgIHdoaWNoIHdpbGwgYmUgY2FsbGVkIGlmIHRoZSBjYWxsYmFjayByZXR1cm5zIGEgZnVuY3Rpb24gcmVmZXJlbmNlXHJcbiAqIFt1bml0IHRlc3RzXSguLi90ZXN0L2ZzLnRlc3QuY2l2ZXQjOn46dGV4dD0lMjMlMjAlMkQlMkQlMkQlMjBjbGFzcyUyMEZpbGVFdmVudEhhbmRsZXIpXHJcbiAqL1xyXG5cclxuZXhwb3J0IGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcclxuXHRoYW5kbGVyOiBURnNFdmVudEhhbmRsZXIgIyAtLS0gZGVib3VuY2VkIGhhbmRsZXJcclxuXHRvblN0b3A6ID0+IHZvaWQgPSBwYXNzXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihjYWxsYmFjazogVEZzRXZlbnRIYW5kbGVyLCBoT3B0aW9uczogaGFzaCA9IHt9KVxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdG9uU3RvcDogVFZvaWRGdW5jXHJcblx0XHRcdGRlYm91bmNlQnk6IG51bWJlclxyXG5cdFx0XHR9XHJcblx0XHR7b25TdG9wOiBvblN0b3AxLCBkZWJvdW5jZUJ5fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsXHJcblx0XHRcdG9uU3RvcDogcGFzc1xyXG5cdFx0XHRkZWJvdW5jZUJ5OiAyMDBcclxuXHRcdEBvblN0b3AgPSBvblN0b3AxXHJcblx0XHRoYW5kbGVyMSA6PSBkZWJvdW5jZSBjYWxsYmFjaywgZGVib3VuY2VCeVxyXG5cdFx0QGhhbmRsZXIgPSBoYW5kbGVyMVxyXG5cdFx0REJHIFwiRmlsZUV2ZW50SGFuZGxlciBjb25zdHJ1Y3RvcigpIGNhbGxlZFwiXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgLS0tIENhbGxzIGEgVFZvaWRGdW5jLCBidXQgaXMgZGVib3VuY2VkIGJ5IEBtcyBtc1xyXG5cclxuXHRoYW5kbGUoZnNFdmVudDogRnNFdmVudCk6IHZvaWRcclxuXHRcdHtraW5kLCBwYXRoc30gOj0gZnNFdmVudFxyXG5cdFx0REJHIFwiSEFORExFOiBbI3tzaW5jZUxvYWRTdHIoKX1dICN7a2luZH0gI3tPTChwYXRocyl9XCJcclxuXHRcdGZvciBwYXRoIG9mIHBhdGhzXHJcblx0XHRcdEBoYW5kbGVyIGtpbmQsIHBhdGhcclxuXHRcdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuLyoqXHJcbiAqIGEgZnVuY3Rpb24gdGhhdCB3YXRjaGVzIGZvciBjaGFuZ2VzIG9uZSBvciBtb3JlIGZpbGVzIG9yIGRpcmVjdG9yaWVzXHJcbiAqICAgIGFuZCBjYWxscyBhIGNhbGxiYWNrIGZ1bmN0aW9uIGZvciBlYWNoIGNoYW5nZS5cclxuICogSWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1ZSwgd2F0Y2hpbmcgaXMgaGFsdGVkXHJcbiAqXHJcbiAqIFVzYWdlOlxyXG4gKiAgIGhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpID0+IGNvbnNvbGUubG9nIHBhdGhcclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3RlbXAudHh0JywgaGFuZGxlclxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSAnc3JjL2xpYicsICBoYW5kbGVyXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlIFsndGVtcC50eHQnLCAnc3JjL2xpYiddLCBoYW5kbGVyXHJcbiAqL1xyXG5cclxuZXhwb3J0IHdhdGNoRmlsZXMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHR3YXRjaGVyQ0I6IFRGc0V2ZW50SGFuZGxlcixcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgLT5cclxuXHJcblx0IyAtLS0gZGVib3VuY2VCeSBpcyBtaWxsaXNlY29uZHMgdG8gZGVib3VuY2UgYnksIGRlZmF1bHQgaXMgMjAwXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRkZWJvdW5jZUJ5OiBudW1iZXJcclxuXHRcdH1cclxuXHR7ZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRkZWJvdW5jZUJ5OiAyMDBcclxuXHRcdH1cclxuXHJcblx0REJHIFwiV0FUQ0g6ICN7T0wocGF0aCl9XCJcclxuXHR3YXRjaGVyIDo9IERlbm8ud2F0Y2hGcyBwYXRoXHJcblx0bGV0IGRvU3RvcDogYm9vbGVhbiA9IGZhbHNlXHJcblx0ZnNDYWxsYmFjazogVEZzRXZlbnRIYW5kbGVyIDo9IChraW5kLCBwYXRoKTogdm9pZCA9PlxyXG5cdFx0cmVzdWx0IDo9IHdhdGNoZXJDQiBraW5kLCBwYXRoXHJcblx0XHREQkcgXCJGQ0I6IHJlc3VsdCA9ICN7cmVzdWx0fVwiXHJcblx0XHRpZiByZXN1bHRcclxuXHRcdFx0d2F0Y2hlci5jbG9zZSgpXHJcblx0XHRyZXR1cm5cclxuXHRoYW5kbGVyIDo9IG5ldyBGaWxlRXZlbnRIYW5kbGVyKGZzQ2FsbGJhY2ssIHsgZGVib3VuY2VCeSB9KVxyXG5cdGZvciBhd2FpdCBpdGVtIG9mIHdhdGNoZXJcclxuXHRcdGZzRXZlbnQ6IEZzRXZlbnQgOj0gaXRlbVxyXG5cdFx0REJHIFwid2F0Y2hlciBldmVudCBmaXJlZFwiXHJcblx0XHRpZiBkb1N0b3BcclxuXHRcdFx0REJHIFwiZG9TdG9wID0gI3tkb1N0b3B9LCBDbG9zaW5nIHdhdGNoZXJcIlxyXG5cdFx0XHRicmVha1xyXG5cdFx0Zm9yIHBhdGggb2YgZnNFdmVudC5wYXRoc1xyXG5cdFx0XHQjIC0tLSBmc0NhbGxiYWNrIHdpbGwgYmUgKGV2ZW50dWFsbHkpIGNhbGxlZFxyXG5cdFx0XHRoYW5kbGVyLmhhbmRsZSBmc0V2ZW50XHJcbmV4cG9ydCB3YXRjaEZpbGUgOj0gd2F0Y2hGaWxlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRjaEZpcnN0TGluZSA6PSAocGF0aDogc3RyaW5nLCBzdHI6IHN0cmluZywgbmV3c3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdCMgLS0tIFJlcGxhY2Ugc3RyIHdpdGggbmV3c3RyLCBidXQgb25seSBvbiBmaXJzdCBsaW5lXHJcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRubFBvcyA6PSBjb250ZW50cy5pbmRleE9mIFwiXFxuXCJcclxuXHRzdHJQb3MgOj0gY29udGVudHMuaW5kZXhPZiBzdHJcclxuXHRpZiAoc3RyUG9zICE9IC0xKSAmJiAoKG5sUG9zID09IC0xKSB8fCAoc3RyUG9zIDwgbmxQb3MpKVxyXG5cdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBjb250ZW50cy5yZXBsYWNlKHN0ciwgbmV3c3RyKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gRVhBTVBMRSBVU0FHRTpcclxuI1x0XHRcdGhEYXRhIDo9IGF3YWl0IGZyb21Kc29uRmlsZSgnZGF0YS5qc29uYycpXHJcbiNcdFx0XHRjb25zb2xlLmRpciBpbXBvcnRNYXBcclxuXHJcbmV4cG9ydCBmcm9tSnNvbkZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGhhc2ggPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdFx0aWYgaXNFbXB0eShjb250ZW50cylcclxuXHRcdFx0cmV0dXJuIHt9XHJcblx0XHRyZXN1bHQgOj0gcGFyc2VKU09OQyhjb250ZW50cylcclxuXHRcdHJldHVybiBkZWZpbmVkKHJlc3VsdCkgPyByZXN1bHQgYXMgaGFzaCA6IHt9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHt9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvSnNvbkZpbGUgOj0gKFxyXG5cdFx0ZGF0YTogaGFzaFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWRkSnNvblZhbHVlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0a2V5OiBzdHJpbmdcclxuXHRcdHZhbHVlOiB1bmtub3duXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGhEYXRhIDo9IGZyb21Kc29uRmlsZShwYXRoKVxyXG5cdGlmIGRlZmluZWQoaERhdGEpICYmIGlzSGFzaChoRGF0YSlcclxuXHRcdGhEYXRhW2tleV0gPSB2YWx1ZVxyXG5cdFx0dG9Kc29uRmlsZSBoRGF0YSwgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpblNhbWVEaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHtkaXJ9IDo9IHBhcnNlUGF0aChwYXRoKVxyXG5cdG5ld3BhdGggOj0gbWtwYXRoKGRpciwgZmlsZU5hbWUpXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbmV3cGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZW1vdmVDUiA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsICdcXHInLCAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGRhdGEgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRyZXR1cm4gZGVmaW5lZChkYXRhKSA/IHJlbW92ZUNSKGRhdGEpIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2x1cnBBc3luYyA6PSBhc3luYyAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGRhdGEgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoU3RyIDo9IChwYXRoOiBzdHJpbmcsIHJvb3Q6IHN0cmluZyA9ICdzcmMnKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlIHJvb3QsIHBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3BsaXRQYXR0ZXJucyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZ1tdLFxyXG5cdFx0KTogW3N0cmluZ1tdLCBzdHJpbmdbXV0gPT5cclxuXHJcblx0dHlwZSBUQWNjdW0gPSBbc3RyaW5nW10sIHN0cmluZ1tdXVxyXG5cclxuXHRhY2MwOiBUQWNjdW0gOj0gW1tdLFtdXVxyXG5cdGFjY3VtIDo9IE1BUCBsUGF0dGVybnMsIGFjYzAsIChwYXQ6IHN0cmluZywgYWNjOiBUQWNjdW0pOiBUQWNjdW0gLT5cclxuXHRcdFtsUG9zLCBsTmVnXSA6PSBhY2NcclxuXHRcdGxNYXRjaGVzIDo9IHBhdC5tYXRjaCAvLy9eIFxcISBcXHMrICguKikgJC8vL1xyXG5cdFx0cmV0dXJuIChcclxuXHRcdFx0ICBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHQ/IFsgbFBvcywgICAgICAgICAgICAgIGxOZWcuY29uY2F0KGxNYXRjaGVzWzFdKV1cclxuXHRcdFx0OiBbIGxQb3MuY29uY2F0KHBhdCksICBsTmVnICAgICAgICAgICAgICAgICAgICBdXHJcblx0XHRcdClcclxuXHRyZXR1cm4gYWNjdW1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgR0VORVJBVE9SXHJcbiNcclxuIyAgICBVc2UgbGlrZTpcclxuIyAgICAgICBmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbFBhdGhzIDo9IEFycmF5LmZyb20oYWxsRmlsZXNNYXRjaGluZyhsUGF0cykpXHJcbiNcclxuIyAgICBOT1RFOiBCeSBkZWZhdWx0LCBzZWFyY2hlcyBmcm9tIC5cclxuIyAgICAgICAgICBCeSBkZWZhdWx0LCBpZ25vcmVzIGFueXRoaW5nIGluc2lkZSBhIGZvbGRlclxyXG4jICAgICAgICAgICAgICAgICAgICAgIG5hbWVkICd0ZW1wJyBvciAnc2F2ZSdcclxuXHJcbmV4cG9ydCBhbGxGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaFxyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHRpbmNsdWRlRGlyczogYm9vbGVhblxyXG5cdFx0fVxyXG5cclxuXHR7cm9vdCwgaE1vcmVHbG9iT3B0aW9ucywgbElnbm9yZURpcnMsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0bElnbm9yZURpcnM6IFsndGVtcCcsICdzYXZlJ11cclxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXHJcblx0XHRcdH1cclxuXHJcblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcclxuXHRcdHJvb3RcclxuXHRcdGluY2x1ZGVEaXJzXHJcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2VcclxuXHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdC4uLmhNb3JlR2xvYk9wdGlvbnNcclxuXHRcdH1cclxuXHJcblx0bEFsbFBhdHRlcm5zOiBzdHJpbmdbXSA6PSBpc1N0cmluZyhsUGF0dGVybnMpID8gW2xQYXR0ZXJuc10gOiBsUGF0dGVybnNcclxuXHRsTW9yZVBhdHRlcm5zIDo9IChcclxuXHRcdCAgZGVmaW5lZChsSWdub3JlRGlycylcclxuXHRcdD8gbElnbm9yZURpcnMubWFwKCh4KSA9PiBcIiEgKiovI3t4fS8qKlwiKVxyXG5cdFx0OiBbXVxyXG5cdFx0KVxyXG5cclxuXHRbbFBvc1BhdHMsIGxOZWdQYXRzXSA6PSBzcGxpdFBhdHRlcm5zIGxBbGxQYXR0ZXJucy5jb25jYXQobE1vcmVQYXR0ZXJucy4uLilcclxuXHRpZiBpc0VtcHR5KGxQb3NQYXRzKVxyXG5cdFx0cmV0dXJuXHJcblx0aWYgbm9uRW1wdHkobE5lZ1BhdHMpXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIGVudHJ5IG9mIGV4cGFuZEdsb2JTeW5jKHBhdCwgaEdsb2JPcHRpb25zKVxyXG5cdFx0XHR7cGF0aH0gOj0gZW50cnlcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJQQVRIOiAje3BhdGh9XCJcclxuXHRcdFx0XHRucGF0aCA6PSBub3JtYWxpemVQYXRoKHBhdGgpXHJcblx0XHRcdFx0eWllbGQgbnBhdGhcclxuXHRcdFx0XHRzZXRTa2lwLmFkZCBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuIyAtLS0gaE9wdGlvbnMgZ2V0cyBwYXNzZWQgdG8gYWxsRmlsZXNNYXRjaGluZygpXHJcbmV4cG9ydCByZW1vdmVGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdHBhdHRlcm46IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0YXNzZXJ0IChwYXR0ZXJuICE9ICcqJykgJiYgKHBhdHRlcm4gIT0gJyoqJyksXHJcblx0XHRcdFwiQ2FuJ3QgZGVsZXRlIGZpbGVzIG1hdGNoaW5nICN7T0wocGF0dGVybil9XCJcclxuXHRmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKHBhdHRlcm4sIGhPcHRpb25zKVxyXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZEZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nPyA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHR9XHJcblx0e3Jvb3QsIGxJZ25vcmVEaXJzfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdHJvb3Q6ICcuJ1xyXG5cdFx0bElnbm9yZURpcnM6IFsnLnRlbXAnLCAnLnNhdmUnXVxyXG5cdFx0fVxyXG5cclxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXHJcblx0cGF0IDo9IHJvb3QgPyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiA6IFwiKiovI3tmaWxlTmFtZX1cIlxyXG5cclxuXHQjIE5PVEU6IGFsbEZpbGVzTWF0Y2hpbmcoKSByZXR1cm5zIG5vcm1hbGl6ZWQgcGF0aHNcclxuXHRsUGF0aHMgOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nIHBhdCwge1xyXG5cdFx0bElnbm9yZURpcnNcclxuXHRcdH1cclxuXHREQkdWQUxVRSAnbFBhdGhzJywgbFBhdGhzXHJcblx0c3dpdGNoIGxQYXRocy5sZW5ndGhcclxuXHRcdGNhc2UgMTpcclxuXHRcdFx0cGF0aCA6PSBsUGF0aHNbMF1cclxuXHRcdFx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJOb3QgYSBmaWxlOiAje09MKHBhdGgpfVwiXHJcblx0XHRcdHJldHVybiBwYXRoXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0Zm9yIHBhdGggb2YgbFBhdGhzXHJcblx0XHRcdFx0Y29uc29sZS5sb2cgcGF0aFxyXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIHdpdGggbmFtZSAje2ZpbGVOYW1lfVwiXHJcblx0XHRcdHJldHVybiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbERpcnNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxEaXJzIDo9IEFycmF5LmZyb20oYWxsRGlyc01hdGNoaW5nKGxQYXRzKSlcclxuI1xyXG4jICAgIE5PVEU6IEJ5IGRlZmF1bHQsIHNlYXJjaGVzIGZyb20gLi9zcmNcclxuXHJcbmV4cG9ydCBhbGxEaXJzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcclxuXHRcdHJvb3Q6ICcuL3NyYydcclxuXHRcdGluY2x1ZGVEaXJzOiB0cnVlXHJcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2VcclxuXHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdC4uLmhNb3JlR2xvYk9wdGlvbnNcclxuXHRcdH1cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciB7cGF0aH0gb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdGlmIG5vdCBzZXRTa2lwLmhhcyhwYXRoKSAmJiBnZXRGaWxlU3RhdHMocGF0aCkuaXNEaXJlY3RvcnlcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIkRJUjogI3twYXRofVwiXHJcblx0XHRcdFx0eWllbGQgcGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aEluZm8gPVxyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGRpcjogc3RyaW5nXHJcblx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdHN0dWI6IHN0cmluZ1xyXG5cdHB1cnBvc2U6IHN0cmluZz9cclxuXHRleHQ6IHN0cmluZz9cclxuXHJcbmV4cG9ydCBwYXJzZVBhdGggOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoSW5mbyA9PlxyXG5cclxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcclxuXHRcdHBhdGggPSBmcm9tRmlsZVVybChwYXRoKVxyXG5cdHtyb290LCBkaXIsIGJhc2V9IDo9IHBhcnNlRmlsZVBhdGggcGF0aFxyXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xyXG5cdG5QYXJ0cyA6PSBsUGFydHMubGVuZ3RoXHJcblx0bGV0IHJlZjFcclxuXHRzd2l0Y2ggblBhcnRzXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBwYXRoOiAje3BhdGh9XCIpXHJcblx0XHR3aGVuIDFcclxuXHRcdFx0cmVmMSA9IGJhc2VcclxuXHRcdHdoZW4gMlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzLnNsaWNlKDAsIC0yKS5qb2luKCcuJylcclxuXHRzdHViIDo9IHJlZjFcclxuXHRyZXR1cm4ge1xyXG5cdFx0cm9vdDogbm9ybWFsaXplUGF0aChyb290KVxyXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcclxuXHRcdGZpbGVOYW1lOiBiYXNlXHJcblx0XHRzdHViXHJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcclxuXHRcdGV4dDogaWYgKG5QYXJ0cyA+IDEpIHRoZW4gXCIuI3tsUGFydHMuYXQoLTEpfVwiIGVsc2UgdW5kZWZcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nPyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChwYXRoKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0dHJ5XHJcblx0XHRzdGF0cyA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdFx0cmV0dXJuIHN0YXRzLmlzRmlsZVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhyb3cgZXJyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRGlyIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNEaXJlY3RvcnlcclxuXHRjYXRjaCBlcnJcclxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZClcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0XHRlbHNlXHJcblx0XHRcdHRocm93IGVyclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybURpciA6PSAocGF0aDogc3RyaW5nLCBoT3B0aW9uczogaGFzaCA9IHt9KTogdm9pZCA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGNsZWFyOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2NsZWFyfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsXHJcblx0XHRjbGVhcjogZmFsc2VcclxuXHRpZiBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRhc3NlcnQgaXNEaXIocGF0aCksIFwiTm90IGEgZGlyZWN0b3J5OiAje3BhdGh9XCJcclxuXHRcdGlmIGNsZWFyXHJcblx0XHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoLCByZWN1cnNpdmU6IHRydWVcclxuXHRcdGVsc2VcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNWYWxpZFN0dWIgOj0gKHN0dWI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGNoIG9mIFsnLCcsICcvJywgJ1xcXFwnXVxyXG5cdFx0aWYgc3R1Yi5pbmNsdWRlcyhjaClcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIChzdHViICE9ICdhbGwnKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlUmVhZGVyID0ge1xyXG5cdGhNZXRhRGF0YTogaGFzaFxyXG5cdHJlYWRlcjogVEl0ZXJhdG9yPHN0cmluZz5cclxuXHR9XHJcblxyXG5leHBvcnQgdHlwZSBURmlsZUNvbnRlbnRzID0ge1xyXG5cdGhNZXRhRGF0YTogaGFzaFxyXG5cdGNvbnRlbnRzOiBzdHJpbmdcclxuXHR9XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb3BlblRleHRGaWxlKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRlYWdlcj86IGZhbHNlXHJcblx0XHQpOiBURmlsZVJlYWRlclxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5UZXh0RmlsZShcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0ZWFnZXI6IHRydWVcclxuXHRcdCk6IFRGaWxlQ29udGVudHNcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvcGVuVGV4dEZpbGUoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRlYWdlcjogYm9vbGVhbiA9IGZhbHNlXHJcblx0XHQpOiBURmlsZVJlYWRlciB8IFRGaWxlQ29udGVudHNcclxuXHJcblx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7cGF0aH1cIlxyXG5cdG5SZWFkZXIgOj0gbmV3IE5SZWFkTGluZXMocGF0aClcclxuXHRnZXRMaW5lIDo9ICgpOiBzdHJpbmc/ID0+XHJcblx0XHRidWZmZXIgOj0gblJlYWRlci5uZXh0KClcclxuXHRcdGlmIGRlZmluZWQoYnVmZmVyKVxyXG5cdFx0XHRyZXR1cm4gcmVtb3ZlQ1IoYnVmZmVyLnRvU3RyaW5nKCkpXHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cclxuXHQjIC0tLSB3ZSBuZWVkIHRvIGdldCB0aGUgZmlyc3QgbGluZSB0byBjaGVjayBpZlxyXG5cdCMgICAgIHRoZXJlJ3MgbWV0YSBkYXRhLiBCdXQgaWYgdGhlcmUgaXMgbm90LFxyXG5cdCMgICAgIHdlIG5lZWQgdG8gcmV0dXJuIGl0IGJ5IHRoZSByZWFkZXJcclxuXHJcblx0Zmlyc3RMaW5lIDo9IGdldExpbmUoKVxyXG5cdGlmIG5vdGRlZmluZWQoZmlyc3RMaW5lKVxyXG5cdFx0aWYgZWFnZXJcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRoTWV0YURhdGE6IHt9XHJcblx0XHRcdFx0Y29udGVudHM6ICcnXHJcblx0XHRcdFx0fVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdGhNZXRhRGF0YToge31cclxuXHRcdFx0XHRyZWFkZXI6IGVtcHR5SXRlcmF0b3I8c3RyaW5nPigpXHJcblx0XHRcdFx0fVxyXG5cclxuXHQjIC0tLSBHZXQgbWV0YSBkYXRhIGlmIHByZXNlbnRcclxuXHRoYXNNZXRhRGF0YSA6PSBpc01ldGFEYXRhU3RhcnQoZmlyc3RMaW5lKVxyXG5cdGxldCBuTWV0YUxpbmVzID0gMFxyXG5cclxuXHRoTWV0YURhdGE6IGhhc2ggOj0gKFxyXG5cdFx0aWYgaGFzTWV0YURhdGFcclxuXHRcdFx0bE1ldGFMaW5lczogc3RyaW5nW10gOj0gW11cclxuXHRcdFx0bGV0IGxpbmUgPSBnZXRMaW5lKClcclxuXHRcdFx0d2hpbGUgbGluZSAmJiAobGluZSAhPSBmaXJzdExpbmUpXHJcblx0XHRcdFx0bE1ldGFMaW5lcy5wdXNoIGxpbmVcclxuXHRcdFx0XHRsaW5lID0gZ2V0TGluZSgpXHJcblx0XHRcdG5NZXRhTGluZXMgPSBsTWV0YUxpbmVzLmxlbmd0aCArIDJcclxuXHRcdFx0Y29udmVydE1ldGFEYXRhKGZpcnN0TGluZSwgYXJyYXlUb0Jsb2NrKGxNZXRhTGluZXMpKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR7fVxyXG5cdFx0KVxyXG5cclxuXHQjIC0tLSBnZW5lcmF0b3IgdGhhdCBhbGxvd3MgcmVhZGluZyBjb250ZW50c1xyXG5cdHJlYWRlciA6PSAoKTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHRcdGlmIG5vdCBoYXNNZXRhRGF0YSAmJiBkZWZpbmVkKGZpcnN0TGluZSlcclxuXHRcdFx0eWllbGQgZmlyc3RMaW5lXHJcblx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxyXG5cdFx0d2hpbGUgZGVmaW5lZChsaW5lKVxyXG5cdFx0XHR5aWVsZCBsaW5lXHJcblx0XHRcdGxpbmUgPSBnZXRMaW5lKClcclxuXHRcdHJldHVyblxyXG5cclxuXHRpZiBlYWdlclxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0aE1ldGFEYXRhXHJcblx0XHRcdGNvbnRlbnRzOiBhcnJheVRvQmxvY2soQXJyYXkuZnJvbShyZWFkZXIoKSkpXHJcblx0XHRcdH1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRoTWV0YURhdGFcclxuXHRcdFx0cmVhZGVyOiByZWFkZXIoKVxyXG5cdFx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgY29uZmlnRnJvbUZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0KTogaGFzaCA9PlxyXG5cclxuXHQjIC0tLSBjb25maWcgc2hvdWxkIGJlIGEgaGFzaCBuYW1lZCBoQ29uZmlnXHJcblxyXG5cdCMgLS0tIE5PVEU6IElmIGEgZGVmaW5lZCBwYXRoIGlzIHJldHVybmVkLCBpdCBkZWZpbml0ZWx5IGV4aXN0c1xyXG5cdHBhdGggOj0gZmluZEZpbGUgZmlsZU5hbWVcclxuXHRhc3NlcnQgZGVmaW5lZChwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0woZmlsZU5hbWUpfVwiXHJcblx0e3B1cnBvc2UsIGV4dH0gOj0gcGFyc2VQYXRoIHBhdGhcclxuXHRhc3NlcnQgZGVmaW5lZChleHQpLCBcIk5vIGZpbGUgZXh0IGluICN7T0wocGF0aCl9XCJcclxuXHRhc3NlcnQgKHB1cnBvc2UgPT0gJ2NvbmZpZycpLCBcIk5vdCBhIGNvbmZpZyBmaWxlOiAje09MKHBhdGgpfVwiXHJcblx0YXNzZXJ0IFsnLmNpdmV0JywgJy50cyddLmluY2x1ZGVzKGV4dCksIFwiSW52YWxpZCBwYXRoOiAje09MKHBhdGgpfVwiXHJcbiNcdGFzc2VydCAoZXh0ID09ICcuY2l2ZXQnKSB8fCAoZXh0ID09ICcudHMnKSwgXCJJbnZhbGlkIHBhdGg6ICN7T0wocGF0aCl9XCJcclxuXHREQkcgXCJJbXBvcnQgY29uZmlnIGZyb20gI3tPTChwYXRoKX1cIlxyXG5cdHVybCA6PSAoXHJcblx0XHRpZiAoZXh0ID09ICcuY2l2ZXQnKVxyXG5cdFx0XHR0c1BhdGggOj0gYXdhaXQgY2l2ZXQydHNGaWxlIHBhdGhcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCB0c1BhdGhcclxuXHRcdGVsc2VcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCBwYXRoXHJcblx0XHQpXHJcblx0aCA6PSBhd2FpdCBpbXBvcnQgdXJsXHJcblx0cmV0dXJuIGguaENvbmZpZ1xyXG4iXX0=