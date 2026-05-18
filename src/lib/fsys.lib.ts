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
	normalizePath, toFullPath, allLinesInFile, TIterator,
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
	normalizePath, toRelPath, toFullPath, allLinesInFile,
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQzNDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsV0FB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LENBQUMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDcEMsQUFBQSxHLE9BQUcsYUFBYSxDQUFBLEFBQUMsTUFBTSxDO0VBQUEsQ0FBQTtBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEcsT0FBRyxhQUFhLENBQUEsQUFBQyxJQUFJLEM7RUFBQSxDLEMsQyxFLENBQUE7QUFDckIsRUFBRSxDQUFDO0FBQ0gsQUFBQSxDQUFFLE1BQUQsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLEMsTUFBTyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ3RCLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE87QUFBTyxDQUFBO0FBQ2pCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGZzeXMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUZpbGVQYXRofSBmcm9tICdub2RlLXBhdGgnXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlSlNPTkMsIEpzb25WYWx1ZX0gZnJvbSAnQHN0ZC9qc29uYydcclxuaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnQHN0ZC9hc3luYy9kZWJvdW5jZSdcclxuaW1wb3J0IHtleGlzdHNTeW5jLCBlbXB0eURpclN5bmMsIGVuc3VyZURpclN5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7YXBwZW5kRmlsZVN5bmMsIG9wZW5TeW5jLCBjbG9zZVN5bmN9IGZyb20gJ25vZGUtZnMnXHJcbmltcG9ydCB7cGF0aFRvRmlsZVVSTH0gZnJvbSAnbm9kZS11cmwnXHJcbmltcG9ydCB7RXZlbnRFbWl0dGVyfSBmcm9tICdub2RlLWV2ZW50cydcclxuaW1wb3J0IE5SZWFkTGluZXMgZnJvbSAnbnBtLW4tcmVhZGxpbmVzJ1xyXG5pbXBvcnQge2V4cGFuZEdsb2JTeW5jfSBmcm9tICdAc3RkL2ZzL2V4cGFuZC1nbG9iJ1xyXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMnXHJcbmltcG9ydCB7XHJcblx0cGFyc2UsIHJlc29sdmUsIHJlbGF0aXZlLCBmcm9tRmlsZVVybCxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuXHJcbmltcG9ydCB7XHJcblx0cGFzcywgdW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIHNsZWVwLCB0b1JlbFBhdGgsXHJcblx0bm9ybWFsaXplUGF0aCwgdG9GdWxsUGF0aCwgYWxsTGluZXNJbkZpbGUsIFRJdGVyYXRvcixcclxuXHRmaWxlRXh0LCB3aXRoRXh0LCBnZXRGaWxlU3RhdHMsIGVuY29kZSxcclxuXHRjcm9haywgYXNzZXJ0LCBvYnZpb3VzbHksIGVtcHR5SXRlcmF0b3IsXHJcblx0cHVzaExvZ0xldmVsLCBwb3BMb2dMZXZlbCwgTE9HLCBEQkcsIFdBUk4sIEVSUixcclxuXHRJTkRFTlQsIFVOREVOVCxcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0aXNFbXB0eSwgbm9uRW1wdHksIGlzU3RyaW5nLCBpc05vbkVtcHR5U3RyaW5nLFxyXG5cdGlzQm9vbGVhbiwgaXNOdW1iZXIsIGlzSW50ZWdlciwgaXNBcnJheSwgaXNBcnJheU9mU3RyaW5ncyxcclxuXHRpc0hhc2gsIGlzUmVnRXhwLCBpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIFRWb2lkRnVuYyxcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsXHJcblx0c2luY2VMb2FkU3RyLCBhcnJheVRvQmxvY2ssIHdvcmRzLCBmLFxyXG5cdH0gZnJvbSAnbGx1dGlscydcclxuaW1wb3J0IHtpc01ldGFEYXRhU3RhcnQsIGNvbnZlcnRNZXRhRGF0YX0gZnJvbSAnbWV0YS1kYXRhJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7T0wsIE1MLCBEQkdWQUxVRX0gZnJvbSAndG8tbmljZSdcclxuaW1wb3J0IHtjaXZldDJ0c0ZpbGV9IGZyb20gJ2xsY2l2ZXQnXHJcblxyXG5leHBvcnQge1xyXG5cdG5vcm1hbGl6ZVBhdGgsIHRvUmVsUGF0aCwgdG9GdWxsUGF0aCwgYWxsTGluZXNJbkZpbGUsXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgZ2V0RmlsZVN0YXRzLFxyXG5cdH1cclxuXHJcbiMgLS0tIENyZWF0ZSBhIGZ1bmN0aW9uIGNhcGFibGUgb2Ygc3luY2hyb25vdXNseVxyXG4jICAgICBpbXBvcnRpbmcgRVNNIG1vZHVsZXNcclxuXHJcbkRlbm8gOj0gZ2xvYmFsVGhpcy5EZW5vXHJcbnR5cGUgRnNFdmVudCA9IERlbm8uRnNFdmVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBEZW5vLkZpbGVJbmZvIGhhczpcclxuIyAgICBpc0ZpbGUgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSByZWd1bGFyIGZpbGUuXHJcbiMgICAgaXNEaXJlY3RvcnkgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBkaXJlY3RvcnkuXHJcbiMgICAgaXNTeW1saW5rIChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgc3ltbGluay5cclxuIyAgICBzaXplIChudW1iZXIpOiBGaWxlIHNpemUgaW4gYnl0ZXMuXHJcbiMgICAgbXRpbWUgKERhdGUgfCBudWxsKTogTW9kaWZpY2F0aW9uIHRpbWUuXHJcbiMgICAgYXRpbWUgKERhdGUgfCBudWxsKTogTGFzdCBhY2Nlc3MgdGltZS5cclxuIyAgICBiaXJ0aHRpbWUgKERhdGUgfCBudWxsKTogQ3JlYXRpb24gdGltZSAobm90IGF2YWlsYWJsZSBvbiBhbGwgcGxhdGZvcm1zKS5cclxuIyAgICBtb2RlIChudW1iZXIgfCBudWxsKTogUGVybWlzc2lvbnMgKFBPU0lYIG9ubHkpLlxyXG4jICAgIHVpZCAvIGdpZCAobnVtYmVyIHwgbnVsbCk6IE93bmVyL2dyb3VwIElEIChQT1NJWCBvbmx5KVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vKipcclxuICogcmV0dXJucyBvbmUgb2Y6XHJcbiAqICAgICdtaXNzaW5nJyAgLSBkb2VzIG5vdCBleGlzdFxyXG4gKiAgICAnZGlyJyAgICAgIC0gaXMgYSBkaXJlY3RvcnlcclxuICogICAgJ2ZpbGUnICAgICAtIGlzIGEgZmlsZVxyXG4gKiAgICAnc3ltbGluaycgIC0gaXMgYSBzeW1saW5rXHJcbiAqICAgICd1bmtub3duJyAgLSBleGlzdHMsIGJ1dCBub3QgYSBmaWxlLCBkaXJlY3Rvcnkgb3Igc3ltbGlua1xyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoVHlwZSA9ICdtaXNzaW5nJyB8ICdmaWxlJyB8ICdkaXInIHwgJ3N5bWxpbmsnIHwgJ3Vua25vd24nXHJcblxyXG5leHBvcnQgaXNQYXRoVHlwZSA6PSAoeDogdW5rbm93bik6IHggaXMgVFBhdGhUeXBlID0+XHJcblxyXG5cdHJldHVybiBpc1N0cmluZyh4KSAmJiB3b3JkcygnbWlzc2luZyBmaWxlIGRpciBzeW1saW5rIHVua25vd24nKS5pbmNsdWRlcyh4KVxyXG5cclxuZXhwb3J0IGdldFBhdGhUeXBlIDo9IChwYXRoOiBzdHJpbmcpOiBUUGF0aFR5cGUgPT5cclxuXHJcblx0YXNzZXJ0IGlzU3RyaW5nKHBhdGgpLCBcIm5vdCBhIHN0cmluZzogI3tPTChwYXRoKX1cIlxyXG5cdGlmIG5vdCBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRyZXR1cm4gJ21pc3NpbmcnXHJcblx0aCA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdHJldHVybiAoXHJcblx0XHQgIGguaXNGaWxlICAgICAgICAgPyAnZmlsZSdcclxuXHRcdDogaC5pc0RpcmVjdG9yeSAgICA/ICdkaXInXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAndW5rbm93bidcclxuXHRcdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNTdHViIDo9IChzdHI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gYSBzdHViIGNhbm5vdCBjb250YWluIGFueSBvZiAnXFxcXCcsICcvJ1xyXG5cdHJldHVybiBub3RkZWZpbmVkKHN0ci5tYXRjaCAvW1xcXFxcXC9dLykgJiYgKHN0clswXSAhPSAnLicpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvdWNoIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGZkIDo9IG9wZW5TeW5jKHBhdGgsICdhJylcclxuXHRjbG9zZVN5bmMoZmQpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBhdGhUb1VSTCA6PSAoLi4ubFBhcnRzOiBzdHJpbmdbXSk6IHN0cmluZyA9PlxyXG5cclxuXHRwYXRoIDo9IHJlc29sdmUgLi4ubFBhcnRzXHJcblx0cmV0dXJuIG5ldyBVUkwoJ2ZpbGU6JyArIHBhdGgpLmhyZWYucmVwbGFjZUFsbCgnXFxcXCcsICcvJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtwYXRoIDo9ICguLi5sUGFydHM6IHN0cmluZz9bXSk6IHN0cmluZyA9PlxyXG5cclxuXHRsVXNlUGFydHMgOj0gQXJyYXkuZnJvbSBNQVAgbFBhcnRzLCAoeCkgLT5cclxuXHRcdGlmIG5vbkVtcHR5KHgpXHJcblx0XHRcdG9idmlvdXNseSBkZWZpbmVkKHgpXHJcblx0XHRcdCMgLS0tIFJlbW92ZSBhbnkgbGVhZGluZyBvciB0cmFpbGluZyBzbGFzaGVzLFxyXG5cdFx0XHQjICAgICBldmVuIGlmIGxlYWRpbmcgc2xhc2ggaXMgcHJlY2VkZWQgYnkgJy4nXHJcblx0XHRcdGxNYXRjaGVzIDo9IHgubWF0Y2ggLy8vXlxyXG5cdFx0XHRcdCg/OlxyXG5cdFx0XHRcdFx0XFwuPyBbXFxcXFxcL11cclxuXHRcdFx0XHRcdCk/XHJcblx0XHRcdFx0KC4qPylcclxuXHRcdFx0XHRbXFxcXFxcL10/XHJcblx0XHRcdFx0JC8vL1xyXG5cdFx0XHRpZiBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHRcdHlpZWxkIGxNYXRjaGVzWzFdXHJcblx0XHRyZXR1cm5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbFVzZVBhcnRzLmpvaW4oJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoRGVzYyA9IHtcclxuXHRkaXI6IHN0cmluZ1xyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGxQYXJ0czogc3RyaW5nW11cclxuXHR9XHJcblxyXG5leHBvcnQgcGF0aFN1YkRpcnMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVFBhdGhEZXNjID0+XHJcblxyXG5cdHBhdGggPSB0b0Z1bGxQYXRoKHBhdGgpXHJcblx0e3Jvb3QsIGRpcn0gOj0gcGFyc2UgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRkaXJcclxuXHRcdHJvb3RcclxuXHRcdGxQYXJ0czogZGlyLnNsaWNlKHJvb3QubGVuZ3RoKS5zcGxpdCgvW1xcXFxcXC9dLylcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIFNob3VsZCBiZSBjYWxsZWQgbGlrZTogbXlzZWxmKGltcG9ydC5tZXRhLnVybClcclxuIyAgICAgcmV0dXJucyBmdWxsIHBhdGggb2YgY3VycmVudCBmaWxlXHJcblxyXG5leHBvcnQgbXlzZWxmIDo9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gdG9SZWxQYXRoIGZyb21GaWxlVXJsIHVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBiYXJmIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0YXBwZW5kOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRhcHBlbmQ6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdG1rRGlyc0ZvckZpbGUgcGF0aFxyXG5cdGRhdGEgOj0gZW5jb2RlIGNvbnRlbnRzXHJcblx0aWYgYXBwZW5kICYmIGlzRmlsZShwYXRoKVxyXG5cdFx0YXBwZW5kRmlsZVN5bmMgcGF0aCwgZGF0YVxyXG5cdGVsc2VcclxuXHRcdERlbm8ud3JpdGVGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmZUZW1wRmlsZSA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZXh0OiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZXh0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGV4dDogJy5jaXZldCdcclxuXHRcdH1cclxuXHR0ZW1wRmlsZVBhdGggOj0gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXg6IGV4dH1cclxuXHRiYXJmIHRlbXBGaWxlUGF0aCwgY29udGVudHNcclxuXHRyZXR1cm4gdGVtcEZpbGVQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGlzRmlsZShzcmNQYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0woc3JjUGF0aCl9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcylcclxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtEaXIgOj0gKFxyXG5cdFx0ZGlyUGF0aDogc3RyaW5nLFxyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBjbGVhclxyXG5cdFx0IyAtLS0gY3JlYXRlcyBkaXIgaWYgaXQgZG9lc24ndCBleGlzdFxyXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcclxuXHRlbHNlXHJcblx0XHRlbnN1cmVEaXJTeW5jIGRpclBhdGhcclxuXHRhc3NlcnQgaXNEaXIoZGlyUGF0aCksIFwiRGlyIG5vdCBjcmVhdGVkOiAje2RpclBhdGh9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJEaXIgOj0gKGRpclBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0aWYgZXhpc3RzU3luYyhkaXJQYXRoKSAmJiBpc0RpcihkaXJQYXRoKVxyXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcclxuXHRlbHNlXHJcblx0XHRta0RpciBkaXJQYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rRGlyc0ZvckZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0e3Jvb3QsIGxQYXJ0c30gOj0gcGF0aFN1YkRpcnMgcGF0aFxyXG5cdGxldCBkaXIgPSByb290XHJcblx0Zm9yIHBhcnQgb2YgbFBhcnRzXHJcblx0XHRkaXIgKz0gXCIvI3twYXJ0fVwiXHJcblx0XHRta0RpciBkaXJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURnNFdmVudEhhbmRsZXIgPSAoa2luZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IHZvaWQgfCBib29sZWFuXHJcbi8qKlxyXG4gKiBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXHJcbiAqICAgIGhhbmRsZXMgZmlsZSBjaGFuZ2VkIGV2ZW50cyB3aGVuIC5oYW5kbGUoZnNFdmVudCkgaXMgY2FsbGVkXHJcbiAqICAgIGNhbGxiYWNrIGlzIGEgZnVuY3Rpb24sIGRlYm91bmNlZCBieSAyMDAgbXNcclxuICogICAgICAgdGhhdCB0YWtlcyBhbiBGc0V2ZW50IGFuZCByZXR1cm5zIGEgVFZvaWRGdW5jXHJcbiAqICAgICAgIHdoaWNoIHdpbGwgYmUgY2FsbGVkIGlmIHRoZSBjYWxsYmFjayByZXR1cm5zIGEgZnVuY3Rpb24gcmVmZXJlbmNlXHJcbiAqIFt1bml0IHRlc3RzXSguLi90ZXN0L2ZzLnRlc3QuY2l2ZXQjOn46dGV4dD0lMjMlMjAlMkQlMkQlMkQlMjBjbGFzcyUyMEZpbGVFdmVudEhhbmRsZXIpXHJcbiAqL1xyXG5cclxuZXhwb3J0IGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcclxuXHRoYW5kbGVyOiBURnNFdmVudEhhbmRsZXIgIyAtLS0gZGVib3VuY2VkIGhhbmRsZXJcclxuXHRvblN0b3A6ID0+IHZvaWQgPSBwYXNzXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihjYWxsYmFjazogVEZzRXZlbnRIYW5kbGVyLCBoT3B0aW9uczogaGFzaCA9IHt9KVxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdG9uU3RvcDogVFZvaWRGdW5jXHJcblx0XHRcdGRlYm91bmNlQnk6IG51bWJlclxyXG5cdFx0XHR9XHJcblx0XHR7b25TdG9wOiBvblN0b3AxLCBkZWJvdW5jZUJ5fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsXHJcblx0XHRcdG9uU3RvcDogcGFzc1xyXG5cdFx0XHRkZWJvdW5jZUJ5OiAyMDBcclxuXHRcdEBvblN0b3AgPSBvblN0b3AxXHJcblx0XHRoYW5kbGVyMSA6PSBkZWJvdW5jZSBjYWxsYmFjaywgZGVib3VuY2VCeVxyXG5cdFx0QGhhbmRsZXIgPSBoYW5kbGVyMVxyXG5cdFx0REJHIFwiRmlsZUV2ZW50SGFuZGxlciBjb25zdHJ1Y3RvcigpIGNhbGxlZFwiXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgLS0tIENhbGxzIGEgVFZvaWRGdW5jLCBidXQgaXMgZGVib3VuY2VkIGJ5IEBtcyBtc1xyXG5cclxuXHRoYW5kbGUoZnNFdmVudDogRnNFdmVudCk6IHZvaWRcclxuXHRcdHtraW5kLCBwYXRoc30gOj0gZnNFdmVudFxyXG5cdFx0REJHIFwiSEFORExFOiBbI3tzaW5jZUxvYWRTdHIoKX1dICN7a2luZH0gI3tPTChwYXRocyl9XCJcclxuXHRcdGZvciBwYXRoIG9mIHBhdGhzXHJcblx0XHRcdEBoYW5kbGVyIGtpbmQsIHBhdGhcclxuXHRcdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuLyoqXHJcbiAqIGEgZnVuY3Rpb24gdGhhdCB3YXRjaGVzIGZvciBjaGFuZ2VzIG9uZSBvciBtb3JlIGZpbGVzIG9yIGRpcmVjdG9yaWVzXHJcbiAqICAgIGFuZCBjYWxscyBhIGNhbGxiYWNrIGZ1bmN0aW9uIGZvciBlYWNoIGNoYW5nZS5cclxuICogSWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1ZSwgd2F0Y2hpbmcgaXMgaGFsdGVkXHJcbiAqXHJcbiAqIFVzYWdlOlxyXG4gKiAgIGhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpID0+IGNvbnNvbGUubG9nIHBhdGhcclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3RlbXAudHh0JywgaGFuZGxlclxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSAnc3JjL2xpYicsICBoYW5kbGVyXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlIFsndGVtcC50eHQnLCAnc3JjL2xpYiddLCBoYW5kbGVyXHJcbiAqL1xyXG5cclxuZXhwb3J0IHdhdGNoRmlsZXMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHR3YXRjaGVyQ0I6IFRGc0V2ZW50SGFuZGxlcixcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgLT5cclxuXHJcblx0IyAtLS0gZGVib3VuY2VCeSBpcyBtaWxsaXNlY29uZHMgdG8gZGVib3VuY2UgYnksIGRlZmF1bHQgaXMgMjAwXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRkZWJvdW5jZUJ5OiBudW1iZXJcclxuXHRcdH1cclxuXHR7ZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRkZWJvdW5jZUJ5OiAyMDBcclxuXHRcdH1cclxuXHJcblx0REJHIFwiV0FUQ0g6ICN7T0wocGF0aCl9XCJcclxuXHR3YXRjaGVyIDo9IERlbm8ud2F0Y2hGcyBwYXRoXHJcblx0bGV0IGRvU3RvcDogYm9vbGVhbiA9IGZhbHNlXHJcblx0ZnNDYWxsYmFjazogVEZzRXZlbnRIYW5kbGVyIDo9IChraW5kLCBwYXRoKTogdm9pZCA9PlxyXG5cdFx0cmVzdWx0IDo9IHdhdGNoZXJDQiBraW5kLCBwYXRoXHJcblx0XHREQkcgXCJGQ0I6IHJlc3VsdCA9ICN7cmVzdWx0fVwiXHJcblx0XHRpZiByZXN1bHRcclxuXHRcdFx0d2F0Y2hlci5jbG9zZSgpXHJcblx0XHRyZXR1cm5cclxuXHRoYW5kbGVyIDo9IG5ldyBGaWxlRXZlbnRIYW5kbGVyKGZzQ2FsbGJhY2ssIHsgZGVib3VuY2VCeSB9KVxyXG5cdGZvciBhd2FpdCBpdGVtIG9mIHdhdGNoZXJcclxuXHRcdGZzRXZlbnQ6IEZzRXZlbnQgOj0gaXRlbVxyXG5cdFx0REJHIFwid2F0Y2hlciBldmVudCBmaXJlZFwiXHJcblx0XHRpZiBkb1N0b3BcclxuXHRcdFx0REJHIFwiZG9TdG9wID0gI3tkb1N0b3B9LCBDbG9zaW5nIHdhdGNoZXJcIlxyXG5cdFx0XHRicmVha1xyXG5cdFx0Zm9yIHBhdGggb2YgZnNFdmVudC5wYXRoc1xyXG5cdFx0XHQjIC0tLSBmc0NhbGxiYWNrIHdpbGwgYmUgKGV2ZW50dWFsbHkpIGNhbGxlZFxyXG5cdFx0XHRoYW5kbGVyLmhhbmRsZSBmc0V2ZW50XHJcbmV4cG9ydCB3YXRjaEZpbGUgOj0gd2F0Y2hGaWxlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRjaEZpcnN0TGluZSA6PSAocGF0aDogc3RyaW5nLCBzdHI6IHN0cmluZywgbmV3c3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdCMgLS0tIFJlcGxhY2Ugc3RyIHdpdGggbmV3c3RyLCBidXQgb25seSBvbiBmaXJzdCBsaW5lXHJcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRubFBvcyA6PSBjb250ZW50cy5pbmRleE9mIFwiXFxuXCJcclxuXHRzdHJQb3MgOj0gY29udGVudHMuaW5kZXhPZiBzdHJcclxuXHRpZiAoc3RyUG9zICE9IC0xKSAmJiAoKG5sUG9zID09IC0xKSB8fCAoc3RyUG9zIDwgbmxQb3MpKVxyXG5cdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBjb250ZW50cy5yZXBsYWNlKHN0ciwgbmV3c3RyKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmcm9tSnNvbkZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGhhc2ggPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdFx0aWYgaXNFbXB0eShjb250ZW50cylcclxuXHRcdFx0cmV0dXJuIHt9XHJcblx0XHRyZXN1bHQgOj0gcGFyc2VKU09OQyhjb250ZW50cylcclxuXHRcdHJldHVybiBkZWZpbmVkKHJlc3VsdCkgPyByZXN1bHQgYXMgaGFzaCA6IHt9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHt9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvSnNvbkZpbGUgOj0gKFxyXG5cdFx0ZGF0YTogaGFzaFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWRkSnNvblZhbHVlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0a2V5OiBzdHJpbmdcclxuXHRcdHZhbHVlOiB1bmtub3duXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGhEYXRhIDo9IGZyb21Kc29uRmlsZShwYXRoKVxyXG5cdGlmIGRlZmluZWQoaERhdGEpICYmIGlzSGFzaChoRGF0YSlcclxuXHRcdGhEYXRhW2tleV0gPSB2YWx1ZVxyXG5cdFx0dG9Kc29uRmlsZSBoRGF0YSwgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpblNhbWVEaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHtkaXJ9IDo9IHBhcnNlUGF0aChwYXRoKVxyXG5cdG5ld3BhdGggOj0gbWtwYXRoKGRpciwgZmlsZU5hbWUpXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbmV3cGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZW1vdmVDUiA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsICdcXHInLCAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGRhdGEgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRyZXR1cm4gZGVmaW5lZChkYXRhKSA/IHJlbW92ZUNSKGRhdGEpIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2x1cnBBc3luYyA6PSBhc3luYyAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGRhdGEgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoU3RyIDo9IChwYXRoOiBzdHJpbmcsIHJvb3Q6IHN0cmluZyA9ICdzcmMnKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlIHJvb3QsIHBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3BsaXRQYXR0ZXJucyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZ1tdLFxyXG5cdFx0KTogW3N0cmluZ1tdLCBzdHJpbmdbXV0gPT5cclxuXHJcblx0dHlwZSBUQWNjdW0gPSBbc3RyaW5nW10sIHN0cmluZ1tdXVxyXG5cclxuXHRhY2MwOiBUQWNjdW0gOj0gW1tdLFtdXVxyXG5cdGFjY3VtIDo9IE1BUCBsUGF0dGVybnMsIGFjYzAsIChwYXQ6IHN0cmluZywgYWNjOiBUQWNjdW0pOiBUQWNjdW0gLT5cclxuXHRcdFtsUG9zLCBsTmVnXSA6PSBhY2NcclxuXHRcdGxNYXRjaGVzIDo9IHBhdC5tYXRjaCAvLy9eIFxcISBcXHMrICguKikgJC8vL1xyXG5cdFx0cmV0dXJuIChcclxuXHRcdFx0ICBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHQ/IFsgbFBvcywgICAgICAgICAgICAgIGxOZWcuY29uY2F0KGxNYXRjaGVzWzFdKV1cclxuXHRcdFx0OiBbIGxQb3MuY29uY2F0KHBhdCksICBsTmVnICAgICAgICAgICAgICAgICAgICBdXHJcblx0XHRcdClcclxuXHRyZXR1cm4gYWNjdW1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgR0VORVJBVE9SXHJcbiNcclxuIyAgICBVc2UgbGlrZTpcclxuIyAgICAgICBmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbFBhdGhzIDo9IEFycmF5LmZyb20oYWxsRmlsZXNNYXRjaGluZyhsUGF0cykpXHJcbiNcclxuIyAgICBOT1RFOiBCeSBkZWZhdWx0LCBzZWFyY2hlcyBmcm9tIC5cclxuIyAgICAgICAgICBCeSBkZWZhdWx0LCBpZ25vcmVzIGFueXRoaW5nIGluc2lkZSBhIGZvbGRlclxyXG4jICAgICAgICAgICAgICAgICAgICAgIG5hbWVkICd0ZW1wJyBvciAnc2F2ZSdcclxuXHJcbmV4cG9ydCBhbGxGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaFxyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHRpbmNsdWRlRGlyczogYm9vbGVhblxyXG5cdFx0fVxyXG5cclxuXHR7cm9vdCwgaE1vcmVHbG9iT3B0aW9ucywgbElnbm9yZURpcnMsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0bElnbm9yZURpcnM6IFsndGVtcCcsICdzYXZlJ11cclxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXHJcblx0XHRcdH1cclxuXHJcblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcclxuXHRcdHJvb3RcclxuXHRcdGluY2x1ZGVEaXJzXHJcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2VcclxuXHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdC4uLmhNb3JlR2xvYk9wdGlvbnNcclxuXHRcdH1cclxuXHJcblx0bEFsbFBhdHRlcm5zOiBzdHJpbmdbXSA6PSBpc1N0cmluZyhsUGF0dGVybnMpID8gW2xQYXR0ZXJuc10gOiBsUGF0dGVybnNcclxuXHRsTW9yZVBhdHRlcm5zIDo9IChcclxuXHRcdCAgZGVmaW5lZChsSWdub3JlRGlycylcclxuXHRcdD8gbElnbm9yZURpcnMubWFwKCh4KSA9PiBcIiEgKiovI3t4fS8qKlwiKVxyXG5cdFx0OiBbXVxyXG5cdFx0KVxyXG5cclxuXHRbbFBvc1BhdHMsIGxOZWdQYXRzXSA6PSBzcGxpdFBhdHRlcm5zIGxBbGxQYXR0ZXJucy5jb25jYXQobE1vcmVQYXR0ZXJucy4uLilcclxuXHRpZiBpc0VtcHR5KGxQb3NQYXRzKVxyXG5cdFx0cmV0dXJuXHJcblx0aWYgbm9uRW1wdHkobE5lZ1BhdHMpXHJcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXHJcblx0aWYgZGVidWdnaW5nXHJcblx0XHRMT0cgXCJQQVRURVJOUzpcIlxyXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXHJcblx0XHRmb3IgcGF0IG9mIGxOZWdQYXRzXHJcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcclxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xyXG5cdFx0Zm9yIGVudHJ5IG9mIGV4cGFuZEdsb2JTeW5jKHBhdCwgaEdsb2JPcHRpb25zKVxyXG5cdFx0XHR7cGF0aH0gOj0gZW50cnlcclxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJQQVRIOiAje3BhdGh9XCJcclxuXHRcdFx0XHRucGF0aCA6PSBub3JtYWxpemVQYXRoKHBhdGgpXHJcblx0XHRcdFx0eWllbGQgbnBhdGhcclxuXHRcdFx0XHRzZXRTa2lwLmFkZCBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuIyAtLS0gaE9wdGlvbnMgZ2V0cyBwYXNzZWQgdG8gYWxsRmlsZXNNYXRjaGluZygpXHJcbmV4cG9ydCByZW1vdmVGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdHBhdHRlcm46IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0YXNzZXJ0IChwYXR0ZXJuICE9ICcqJykgJiYgKHBhdHRlcm4gIT0gJyoqJyksXHJcblx0XHRcdFwiQ2FuJ3QgZGVsZXRlIGZpbGVzIG1hdGNoaW5nICN7T0wocGF0dGVybil9XCJcclxuXHRmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKHBhdHRlcm4sIGhPcHRpb25zKVxyXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZEZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nPyA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHJvb3Q6IHN0cmluZ1xyXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXHJcblx0XHR9XHJcblx0e3Jvb3QsIGxJZ25vcmVEaXJzfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdHJvb3Q6ICcuJ1xyXG5cdFx0bElnbm9yZURpcnM6IFsnLnRlbXAnLCAnLnNhdmUnXVxyXG5cdFx0fVxyXG5cclxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXHJcblx0cGF0IDo9IHJvb3QgPyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiA6IFwiKiovI3tmaWxlTmFtZX1cIlxyXG5cclxuXHQjIE5PVEU6IGFsbEZpbGVzTWF0Y2hpbmcoKSByZXR1cm5zIG5vcm1hbGl6ZWQgcGF0aHNcclxuXHRsUGF0aHMgOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nIHBhdCwge1xyXG5cdFx0bElnbm9yZURpcnNcclxuXHRcdH1cclxuXHREQkdWQUxVRSAnbFBhdGhzJywgbFBhdGhzXHJcblx0c3dpdGNoIGxQYXRocy5sZW5ndGhcclxuXHRcdGNhc2UgMTpcclxuXHRcdFx0cGF0aCA6PSBsUGF0aHNbMF1cclxuXHRcdFx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJOb3QgYSBmaWxlOiAje09MKHBhdGgpfVwiXHJcblx0XHRcdHJldHVybiBwYXRoXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0Zm9yIHBhdGggb2YgbFBhdGhzXHJcblx0XHRcdFx0Y29uc29sZS5sb2cgcGF0aFxyXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIHdpdGggbmFtZSAje2ZpbGVOYW1lfVwiXHJcblx0XHRcdHJldHVybiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbERpcnNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxEaXJzIDo9IEFycmF5LmZyb20oYWxsRGlyc01hdGNoaW5nKGxQYXRzKSlcclxuI1xyXG4jICAgIE5PVEU6IEJ5IGRlZmF1bHQsIHNlYXJjaGVzIGZyb20gLi9zcmNcclxuXHJcbmV4cG9ydCBhbGxEaXJzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcclxuXHRcdHJvb3Q6ICcuL3NyYydcclxuXHRcdGluY2x1ZGVEaXJzOiB0cnVlXHJcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2VcclxuXHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdC4uLmhNb3JlR2xvYk9wdGlvbnNcclxuXHRcdH1cclxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciB7cGF0aH0gb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXHJcblx0XHRcdGlmIG5vdCBzZXRTa2lwLmhhcyhwYXRoKSAmJiBnZXRGaWxlU3RhdHMocGF0aCkuaXNEaXJlY3RvcnlcclxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcclxuXHRcdFx0XHRcdExPRyBcIkRJUjogI3twYXRofVwiXHJcblx0XHRcdFx0eWllbGQgcGF0aFxyXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aEluZm8gPVxyXG5cdHJvb3Q6IHN0cmluZ1xyXG5cdGRpcjogc3RyaW5nXHJcblx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdHN0dWI6IHN0cmluZ1xyXG5cdHB1cnBvc2U6IHN0cmluZz9cclxuXHRleHQ6IHN0cmluZz9cclxuXHJcbmV4cG9ydCBwYXJzZVBhdGggOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoSW5mbyA9PlxyXG5cclxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcclxuXHRcdHBhdGggPSBmcm9tRmlsZVVybChwYXRoKVxyXG5cdHtyb290LCBkaXIsIGJhc2V9IDo9IHBhcnNlRmlsZVBhdGggcGF0aFxyXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xyXG5cdG5QYXJ0cyA6PSBsUGFydHMubGVuZ3RoXHJcblx0bGV0IHJlZjFcclxuXHRzd2l0Y2ggblBhcnRzXHJcblx0XHRjYXNlIDA6XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBwYXRoOiAje3BhdGh9XCIpXHJcblx0XHR3aGVuIDFcclxuXHRcdFx0cmVmMSA9IGJhc2VcclxuXHRcdHdoZW4gMlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRyZWYxID0gbFBhcnRzLnNsaWNlKDAsIC0yKS5qb2luKCcuJylcclxuXHRzdHViIDo9IHJlZjFcclxuXHRyZXR1cm4ge1xyXG5cdFx0cm9vdDogbm9ybWFsaXplUGF0aChyb290KVxyXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcclxuXHRcdGZpbGVOYW1lOiBiYXNlXHJcblx0XHRzdHViXHJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcclxuXHRcdGV4dDogaWYgKG5QYXJ0cyA+IDEpIHRoZW4gXCIuI3tsUGFydHMuYXQoLTEpfVwiIGVsc2UgdW5kZWZcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nPyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChwYXRoKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0dHJ5XHJcblx0XHRzdGF0cyA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdFx0cmV0dXJuIHN0YXRzLmlzRmlsZVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhyb3cgZXJyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRGlyIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0XHRyZXR1cm4gc3RhdHMuaXNEaXJlY3RvcnlcclxuXHRjYXRjaCBlcnJcclxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZClcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0XHRlbHNlXHJcblx0XHRcdHRocm93IGVyclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBybURpciA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7Y2xlYXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0Y2xlYXI6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMocGF0aClcclxuXHRcdGFzc2VydCBpc0RpcihwYXRoKSwgXCJOb3QgYSBkaXJlY3Rvcnk6ICN7cGF0aH1cIlxyXG5cdFx0aWYgY2xlYXJcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGgsIHJlY3Vyc2l2ZTogdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc1ZhbGlkU3R1YiA6PSAoc3R1Yjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgY2ggb2YgWycsJywgJy8nLCAnXFxcXCddXHJcblx0XHRpZiBzdHViLmluY2x1ZGVzKGNoKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gKHN0dWIgIT0gJ2FsbCcpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZpbGVSZWFkZXIgPSB7XHJcblx0aE1ldGFEYXRhOiBoYXNoXHJcblx0cmVhZGVyOiBUSXRlcmF0b3I8c3RyaW5nPlxyXG5cdH1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlQ29udGVudHMgPSB7XHJcblx0aE1ldGFEYXRhOiBoYXNoXHJcblx0Y29udGVudHM6IHN0cmluZ1xyXG5cdH1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvcGVuVGV4dEZpbGUoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGVhZ2VyPzogZmFsc2VcclxuXHRcdCk6IFRGaWxlUmVhZGVyXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb3BlblRleHRGaWxlKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRlYWdlcjogdHJ1ZVxyXG5cdFx0KTogVEZpbGVDb250ZW50c1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5UZXh0RmlsZShcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGVhZ2VyOiBib29sZWFuID0gZmFsc2VcclxuXHRcdCk6IFRGaWxlUmVhZGVyIHwgVEZpbGVDb250ZW50c1xyXG5cclxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXHJcblx0blJlYWRlciA6PSBuZXcgTlJlYWRMaW5lcyhwYXRoKVxyXG5cdGdldExpbmUgOj0gKCk6IHN0cmluZz8gPT5cclxuXHRcdGJ1ZmZlciA6PSBuUmVhZGVyLm5leHQoKVxyXG5cdFx0aWYgZGVmaW5lZChidWZmZXIpXHJcblx0XHRcdHJldHVybiByZW1vdmVDUihidWZmZXIudG9TdHJpbmcoKSlcclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblxyXG5cdCMgLS0tIHdlIG5lZWQgdG8gZ2V0IHRoZSBmaXJzdCBsaW5lIHRvIGNoZWNrIGlmXHJcblx0IyAgICAgdGhlcmUncyBtZXRhIGRhdGEuIEJ1dCBpZiB0aGVyZSBpcyBub3QsXHJcblx0IyAgICAgd2UgbmVlZCB0byByZXR1cm4gaXQgYnkgdGhlIHJlYWRlclxyXG5cclxuXHRmaXJzdExpbmUgOj0gZ2V0TGluZSgpXHJcblx0aWYgbm90ZGVmaW5lZChmaXJzdExpbmUpXHJcblx0XHRpZiBlYWdlclxyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdGhNZXRhRGF0YToge31cclxuXHRcdFx0XHRjb250ZW50czogJydcclxuXHRcdFx0XHR9XHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0aE1ldGFEYXRhOiB7fVxyXG5cdFx0XHRcdHJlYWRlcjogZW1wdHlJdGVyYXRvcjxzdHJpbmc+KClcclxuXHRcdFx0XHR9XHJcblxyXG5cdCMgLS0tIEdldCBtZXRhIGRhdGEgaWYgcHJlc2VudFxyXG5cdGhhc01ldGFEYXRhIDo9IGlzTWV0YURhdGFTdGFydChmaXJzdExpbmUpXHJcblx0bGV0IG5NZXRhTGluZXMgPSAwXHJcblxyXG5cdGhNZXRhRGF0YTogaGFzaCA6PSAoXHJcblx0XHRpZiBoYXNNZXRhRGF0YVxyXG5cdFx0XHRsTWV0YUxpbmVzOiBzdHJpbmdbXSA6PSBbXVxyXG5cdFx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxyXG5cdFx0XHR3aGlsZSBsaW5lICYmIChsaW5lICE9IGZpcnN0TGluZSlcclxuXHRcdFx0XHRsTWV0YUxpbmVzLnB1c2ggbGluZVxyXG5cdFx0XHRcdGxpbmUgPSBnZXRMaW5lKClcclxuXHRcdFx0bk1ldGFMaW5lcyA9IGxNZXRhTGluZXMubGVuZ3RoICsgMlxyXG5cdFx0XHRjb252ZXJ0TWV0YURhdGEoZmlyc3RMaW5lLCBhcnJheVRvQmxvY2sobE1ldGFMaW5lcykpXHJcblx0XHRlbHNlXHJcblx0XHRcdHt9XHJcblx0XHQpXHJcblxyXG5cdCMgLS0tIGdlbmVyYXRvciB0aGF0IGFsbG93cyByZWFkaW5nIGNvbnRlbnRzXHJcblx0cmVhZGVyIDo9ICgpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cdFx0aWYgbm90IGhhc01ldGFEYXRhICYmIGRlZmluZWQoZmlyc3RMaW5lKVxyXG5cdFx0XHR5aWVsZCBmaXJzdExpbmVcclxuXHRcdGxldCBsaW5lID0gZ2V0TGluZSgpXHJcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXHJcblx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0bGluZSA9IGdldExpbmUoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdGlmIGVhZ2VyXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRoTWV0YURhdGFcclxuXHRcdFx0Y29udGVudHM6IGFycmF5VG9CbG9jayhBcnJheS5mcm9tKHJlYWRlcigpKSlcclxuXHRcdFx0fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdGhNZXRhRGF0YVxyXG5cdFx0XHRyZWFkZXI6IHJlYWRlcigpXHJcblx0XHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb25maWdGcm9tRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHQpOiBoYXNoID0+XHJcblxyXG5cdCMgLS0tIGNvbmZpZyBzaG91bGQgYmUgYSBoYXNoIG5hbWVkIGhDb25maWdcclxuXHJcblx0IyAtLS0gTk9URTogSWYgYSBkZWZpbmVkIHBhdGggaXMgcmV0dXJuZWQsIGl0IGRlZmluaXRlbHkgZXhpc3RzXHJcblx0cGF0aCA6PSBmaW5kRmlsZSBmaWxlTmFtZVxyXG5cdGFzc2VydCBkZWZpbmVkKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChmaWxlTmFtZSl9XCJcclxuXHR7cHVycG9zZSwgZXh0fSA6PSBwYXJzZVBhdGggcGF0aFxyXG5cdGFzc2VydCBkZWZpbmVkKGV4dCksIFwiTm8gZmlsZSBleHQgaW4gI3tPTChwYXRoKX1cIlxyXG5cdGFzc2VydCAocHVycG9zZSA9PSAnY29uZmlnJyksIFwiTm90IGEgY29uZmlnIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRhc3NlcnQgWycuY2l2ZXQnLCAnLnRzJ10uaW5jbHVkZXMoZXh0KSwgXCJJbnZhbGlkIHBhdGg6ICN7T0wocGF0aCl9XCJcclxuXHREQkcgXCJJbXBvcnQgY29uZmlnIGZyb20gI3tPTChwYXRoKX1cIlxyXG5cdHVybCA6PSAoXHJcblx0XHRpZiAoZXh0ID09ICcuY2l2ZXQnKVxyXG5cdFx0XHR0c1BhdGggOj0gYXdhaXQgY2l2ZXQydHNGaWxlIHBhdGhcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCB0c1BhdGhcclxuXHRcdGVsc2VcclxuXHRcdFx0cGF0aFRvRmlsZVVSTCBwYXRoXHJcblx0XHQpXHJcblx0aCA6PSBhd2FpdCBpbXBvcnQgdXJsXHJcblx0cmV0dXJuIGguaENvbmZpZ1xyXG4iXX0=