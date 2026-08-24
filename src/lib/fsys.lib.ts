"use strict";
// fsys.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {parse as parseFilePath} from 'node-path'
import {parse as parseJSONC, JsonValue} from '@std/jsonc'
import {debounce} from '@std/async/debounce'
import {existsSync, emptyDirSync, ensureDirSync, WalkEntry} from '@std/fs'
import {appendFileSync, openSync, closeSync} from 'node-fs'
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
	pass, undef, defined, notdefined, reMatch,
	TIterator, TAsyncIterator, encode,
	croak, assert, obviously, words,
	getEmptyIterator, getEmptyAsyncIterator,
	} from 'base'
import {
	normalizePath, fileExt, withExt, touch, newerDestFileExists,
	TFileStats, getFileStats, modTime, allLinesInFile,
	mkTempFile, mkTempFileSync, toRelPath, isFullPath, toFullPath,
	TPathInfo, parsePath, isFile, isDir,
	} from 'llfs'
import {
	isEmpty, nonEmpty, isString, isNonEmptyString, regexp,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {sinceLoadStr} from 'timer'
import {MAP} from 'mapper'
import {
	getOptions, spaces,
	arrayToBlock, f,
	} from 'llutils'
import {isMetaDataStart, getMetaDataHash} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, DBGVALUE} from 'nice'

export {
	normalizePath, toRelPath, toFullPath, touch,
	allLinesInFile, modTime, newerDestFileExists,
	fileExt, withExt, getFileStats, isFullPath,
	mkTempFile, mkTempFileSync, parsePath, isFile, isDir,
	}
export type {TPathInfo}
export type {WalkEntry}

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
 *    handles file changed events when .handleEvent(fsEvent) is called
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

	handleEvent(fsEvent: FsEvent): void {
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
			await handler.handleEvent(fsEvent)
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
// ASYNC

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

export type TPathFilter = (path: string) => boolean

// ---------------------------------------------------------------------------

export const inHiddenFolder = (path: string): boolean => {

	const h = parsePath(path)
	return reMatch(h.dir, /\/\./)
}

// ---------------------------------------------------------------------------
// TIterator
//
//    Use like:
//       for path of allFilesMatching(lPats)
//          OR
//       lPaths := Array.from(allFilesMatching(lPats))
//
//    NOTE: By default, searches from Deno.cwd()
//          By default, ignores any directories starting with '.'

export const allFilesMatching = function*(
		lPatterns: string | string[],
		hOptions: hash = {}
		): TIterator<string> {

	const defaultFilter = (path: string): boolean => {
		return !inHiddenFolder(path)
	}

	type opt = {
		root: string
		hMoreGlobOptions: hash
		filter: TPathFilter
		includeDirs: boolean
		}

	const {root, hMoreGlobOptions, filter, includeDirs
		} = getOptions<opt>(hOptions, {
			root: '.',
			hMoreGlobOptions: {},
			filter: defaultFilter,
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

	const [lPosPats, lNegPats] = splitPatterns(lAllPatterns)
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
			const path = normalizePath(entry.path)
			if (
					   !setSkip.has(path)
					&& filter(path)
					) {
				if (debugging) {
					LOG(`PATH: ${path}`)
				}
				yield path
				setSkip.add(path)
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const removeFilesMatching = async (
		pattern: string,
		hOptions: hash = {}
		): AutoPromise<void> => {

	assert((pattern !== '*') && (pattern !== '**'),
			`Can't delete files matching ${OL(pattern)}`)
	for (const path of allFilesMatching(pattern, hOptions)) {
		await Deno.remove(path)
	}
	return
}

// ---------------------------------------------------------------------------

export const findFile = (
		fileName: string,
		hOptions: hash = {}
		): (string | undefined) => {

	// --- NOTE: allFilesMatching() returns normalized paths

	const lPaths = Array.from(allFilesMatching(`**/${fileName}`, hOptions))
	DBGVALUE(lPaths, 'lPaths')
	switch(lPaths.length) {
		case 1:
			const path = lPaths[0]
			assert(isFile(path), `No such file: ${OL(path)}`)
			return path
		case 0:
			return undef
		default:
			const lLines = [`Multiple files with name ${fileName}:`]
			for (const path of lPaths) {
				lLines.push(path)
			}
			croak(lLines.join('\n'))
			return undef
	}
}

// ---------------------------------------------------------------------------

export const findDir = (
		fileName: string,
		hOptions: hash = {}
		): (string | undefined) => {

	const lPaths = Array.from(allDirsMatching(`**/${fileName}`, hOptions))
	DBGVALUE(lPaths, 'lPaths')
	switch(lPaths.length) {
		case 1:
			return lPaths[0]
		case 0:
			return undef
		default:
			const lLines = [`Multiple dirs with name ${fileName}:`]
			for (const path of lPaths) {
				lLines.push(path)
			}
			croak(lLines.join('\n'))
			return undef
	}
}

// ---------------------------------------------------------------------------
// GENERATOR
//
//    Use like:
//       for path of allDirsMatching(lPats)
//          OR
//       lDirs := Array.from(allDirsMatching(lPats))

export const allDirsMatching = function*(
		lPatterns: string | string[],
		hOptions: hash = {}
		): TIterator<string> {

	const defaultFilter = (path: string): boolean => {
		return !inHiddenFolder(path)
	}

	type opt = {
		root: string
		hMoreGlobOptions: hash
		filter: TPathFilter
		}

	const {root, hMoreGlobOptions, filter,
		} = getOptions<opt>(hOptions, {
			root: '.',
			hMoreGlobOptions: {},
			filter: defaultFilter
			})

	const hGlobOptions: hash = {
		root,
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
		for (const entry of expandGlobSync(pat, hGlobOptions)) {
			const path = normalizePath(entry.path)
			if (
					   !setSkip.has(path)
					&& filter(path)
					&& isDir(path)
					) {
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
// --- returns false if file doesn't exist

export const rmFile = (path: string): boolean => {

	if (isFile(path)) {
		Deno.removeSync(path)
		return true
	}
	else {
		return false
	}
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFFLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQywrQkFBK0I7QUFDNUQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDdkMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDbkIsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsR0FB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Q0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM3QixBQUFBLEtBQXlCLE1BQXBCLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUMsQyxDQUFDO0FBQy9CLEFBQUEsSyxDQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDLENBQUM7QUFDdkMsQUFBQSxLQUFLLEtBQUssQ0FBQyxDQUFBLENBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsSSxDQUFDLFNBQVMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM1QyxBQUFBLE1BQU0sU0FBUyxDQUFBLEFBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQzlCLEFBQUEsTUFBTSxVQUFVLENBQUMsSUFBSSxDQUFBLEFBQUMsS0FBSyxDLENBQUE7QUFDM0IsQUFBQSxNLENBQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQyxDQUFFLENBQUMsS0FBSyxDQUFDLEksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEMsQztLQUFDLENBQUE7QUFDeEMsQUFBQSxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRSxDQUFDLEksQ0FBQyxTQUFTLENBQUMsQ0FBQSxDQUFBO0FBQzdCLEFBQUEsTUFBTSxTQUFTLENBQUEsQUFBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDOUIsQUFBQSxNQUFNLEksQ0FBQyxTQUFTLEMsQ0FBRSxDQUFDLEtBQUs7QUFDeEIsQUFBQSxNLE9BQU0sZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQztLQUFDLENBQUE7QUFDdEQsQUFBQSxLQUFLLElBQUksQ0FBQSxDQUFBO0FBQ1QsQUFBQSxNLE8sQ0FBTSxDQUFDLEMsQztLQUFDLEM7SUFBQSxDQUFBO0FBQ1IsQUFBQSxJQUFJLElBQUksQ0FBQSxDQUFBO0FBQ1IsQUFBQSxLLE8sQ0FBSyxDQUFDLEMsQztJQUFDLEMsQyxDLEUsQ0FBQTtBQUNQLElBQUksQztFQUFDLENBQUE7QUFDTCxBQUFBLEVBQUUsSSxDQUFDLFdBQVcsQyxDQUFFLENBQUMsSUFBSTtBQUNyQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDLE0sUUFBUyxDQUFDLENBQUMsQyxDLFcsQ0FBQyxBQUFDLEksQ0FBSSxDQUFBLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUEsQ0FBSSxJLENBQUMsV0FBVyxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsS0FBSyxDQUFDLEksQ0FBQyxJQUFJLENBQUMsQztFQUFDLENBQUE7QUFDaEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxJLENBQUMsUztDQUFTLENBQUE7QUFDbkIsQUFBQTtBQUNBLEFBQUEsQyxNLE9BQVEsQ0FBQyxDQUFDLEMsVyxDLENBQUMsQUFBQyxNLFksQyxDQUFPLENBQUEsQ0FBQTtBQUNuQixBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQSxDQUFJLEksQ0FBQyxXQUFXLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsR0FBRyxLQUFLLENBQUMsSSxDQUFDLElBQUksQ0FBQyxDO0VBQUMsQ0FBQTtBQUNoQixBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FBQyxJLENBQUMsU0FBUyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3hCLEFBQUEsR0FBTSxNQUFILEdBQUcsQ0FBQyxDQUFFLENBQUMsSSxDQUFDLFNBQVM7QUFDcEIsQUFBQSxHQUFHLEksQ0FBQyxTQUFTLEMsQ0FBRSxDQUFDLEtBQUs7QUFDckIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxHO0VBQUcsQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLEVBQWUsTUFBYixDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyQyxBQUFBLEVBQUUsR0FBRyxDQUFBLElBQUksQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLEdBQUcsTUFBTSxDQUFDLEs7RUFBSyxDQUFBO0FBQ2YsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLE07RUFBTSxDO0NBQUEsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSxDLE0sV0FBWSxDQUFDLENBQUMsQyxDLFcsQ0FBQyxBQUFDLE0sQ0FBTSxDQUFBLENBQUE7QUFDdEIsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUEsQ0FBSSxJLENBQUMsV0FBVyxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsS0FBSyxDQUFDLEksQ0FBQyxJQUFJLENBQUMsQztFQUFDLENBQUE7QUFDaEIsQUFBQSxFQUFrQixNQUFoQixNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDeEIsQUFBQSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDN0IsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFBLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDbkIsQUFBQSxHQUFHLElBQUksQyxDQUFFLENBQUMsS0FBSyxDQUFDLEksQ0FBQyxPQUFPLENBQUMsQztFQUFDLENBQUE7QUFDMUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQztDQUFDLEM7QUFBQSxDQUFBO0FBQzFCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGZzeXMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUZpbGVQYXRofSBmcm9tICdub2RlLXBhdGgnXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlSlNPTkMsIEpzb25WYWx1ZX0gZnJvbSAnQHN0ZC9qc29uYydcclxuaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnQHN0ZC9hc3luYy9kZWJvdW5jZSdcclxuaW1wb3J0IHtleGlzdHNTeW5jLCBlbXB0eURpclN5bmMsIGVuc3VyZURpclN5bmMsIFdhbGtFbnRyeX0gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHthcHBlbmRGaWxlU3luYywgb3BlblN5bmMsIGNsb3NlU3luY30gZnJvbSAnbm9kZS1mcydcclxuaW1wb3J0IHtFdmVudEVtaXR0ZXJ9IGZyb20gJ25vZGUtZXZlbnRzJ1xyXG5pbXBvcnQge2V4cGFuZEdsb2JTeW5jfSBmcm9tICdAc3RkL2ZzL2V4cGFuZC1nbG9iJ1xyXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMvdGV4dC1saW5lLXN0cmVhbSdcclxuaW1wb3J0IHtcclxuXHRwYXJzZSwgcmVzb2x2ZSwgcmVsYXRpdmUsIGZyb21GaWxlVXJsLFxyXG5cdH0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5cclxuaW1wb3J0IHtcclxuXHRMT0csIERCRywgV0FSTiwgRVJSLCBJTkRFTlQsIFVOREVOVCxcclxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLFxyXG5cdH0gZnJvbSAnbG9nZ2VyJ1xyXG5pbXBvcnQge1xyXG5cdHBhc3MsIHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCByZU1hdGNoLFxyXG5cdFRJdGVyYXRvciwgVEFzeW5jSXRlcmF0b3IsIGVuY29kZSxcclxuXHRjcm9haywgYXNzZXJ0LCBvYnZpb3VzbHksIHdvcmRzLFxyXG5cdGdldEVtcHR5SXRlcmF0b3IsIGdldEVtcHR5QXN5bmNJdGVyYXRvcixcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0bm9ybWFsaXplUGF0aCwgZmlsZUV4dCwgd2l0aEV4dCwgdG91Y2gsIG5ld2VyRGVzdEZpbGVFeGlzdHMsXHJcblx0VEZpbGVTdGF0cywgZ2V0RmlsZVN0YXRzLCBtb2RUaW1lLCBhbGxMaW5lc0luRmlsZSxcclxuXHRta1RlbXBGaWxlLCBta1RlbXBGaWxlU3luYywgdG9SZWxQYXRoLCBpc0Z1bGxQYXRoLCB0b0Z1bGxQYXRoLFxyXG5cdFRQYXRoSW5mbywgcGFyc2VQYXRoLCBpc0ZpbGUsIGlzRGlyLFxyXG5cdH0gZnJvbSAnbGxmcydcclxuaW1wb3J0IHtcclxuXHRpc0VtcHR5LCBub25FbXB0eSwgaXNTdHJpbmcsIGlzTm9uRW1wdHlTdHJpbmcsIHJlZ2V4cCxcclxuXHRpc0Jvb2xlYW4sIGlzTnVtYmVyLCBpc0ludGVnZXIsIGlzQXJyYXksIGlzQXJyYXlPZlN0cmluZ3MsXHJcblx0aXNIYXNoLCBpc1JlZ0V4cCwgaW50ZWdlciwgaGFzaCwgaGFzaG9mLCBUVm9pZEZ1bmMsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7c2luY2VMb2FkU3RyfSBmcm9tICd0aW1lcidcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsXHJcblx0YXJyYXlUb0Jsb2NrLCBmLFxyXG5cdH0gZnJvbSAnbGx1dGlscydcclxuaW1wb3J0IHtpc01ldGFEYXRhU3RhcnQsIGdldE1ldGFEYXRhSGFzaH0gZnJvbSAnbWV0YS1kYXRhJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7T0wsIERCR1ZBTFVFfSBmcm9tICduaWNlJ1xyXG5cclxuZXhwb3J0IHtcclxuXHRub3JtYWxpemVQYXRoLCB0b1JlbFBhdGgsIHRvRnVsbFBhdGgsIHRvdWNoLFxyXG5cdGFsbExpbmVzSW5GaWxlLCBtb2RUaW1lLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxyXG5cdGZpbGVFeHQsIHdpdGhFeHQsIGdldEZpbGVTdGF0cywgaXNGdWxsUGF0aCxcclxuXHRta1RlbXBGaWxlLCBta1RlbXBGaWxlU3luYywgcGFyc2VQYXRoLCBpc0ZpbGUsIGlzRGlyLFxyXG5cdH1cclxuZXhwb3J0IHR5cGUgVFBhdGhJbmZvXHJcbmV4cG9ydCB0eXBlIFdhbGtFbnRyeVxyXG5cclxuIyAtLS0gQ3JlYXRlIGEgZnVuY3Rpb24gY2FwYWJsZSBvZiBzeW5jaHJvbm91c2x5XHJcbiMgICAgIGltcG9ydGluZyBFU00gbW9kdWxlc1xyXG5cclxuRGVubyA6PSBnbG9iYWxUaGlzLkRlbm9cclxudHlwZSBGc0V2ZW50ID0gRGVuby5Gc0V2ZW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIERlbm8uRmlsZUluZm8gaGFzOlxyXG4jICAgIGlzRmlsZSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHJlZ3VsYXIgZmlsZS5cclxuIyAgICBpc0RpcmVjdG9yeSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIGRpcmVjdG9yeS5cclxuIyAgICBpc1N5bWxpbmsgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBzeW1saW5rLlxyXG4jICAgIHNpemUgKG51bWJlcik6IEZpbGUgc2l6ZSBpbiBieXRlcy5cclxuIyAgICBtdGltZSAoRGF0ZSB8IG51bGwpOiBNb2RpZmljYXRpb24gdGltZS5cclxuIyAgICBhdGltZSAoRGF0ZSB8IG51bGwpOiBMYXN0IGFjY2VzcyB0aW1lLlxyXG4jICAgIGJpcnRodGltZSAoRGF0ZSB8IG51bGwpOiBDcmVhdGlvbiB0aW1lIChub3QgYXZhaWxhYmxlIG9uIGFsbCBwbGF0Zm9ybXMpLlxyXG4jICAgIG1vZGUgKG51bWJlciB8IG51bGwpOiBQZXJtaXNzaW9ucyAoUE9TSVggb25seSkuXHJcbiMgICAgdWlkIC8gZ2lkIChudW1iZXIgfCBudWxsKTogT3duZXIvZ3JvdXAgSUQgKFBPU0lYIG9ubHkpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8qKlxyXG4gKiByZXR1cm5zIG9uZSBvZjpcclxuICogICAgJ21pc3NpbmcnICAtIGRvZXMgbm90IGV4aXN0XHJcbiAqICAgICdkaXInICAgICAgLSBpcyBhIGRpcmVjdG9yeVxyXG4gKiAgICAnZmlsZScgICAgIC0gaXMgYSBmaWxlXHJcbiAqICAgICdzeW1saW5rJyAgLSBpcyBhIHN5bWxpbmtcclxuICogICAgJ3Vua25vd24nICAtIGV4aXN0cywgYnV0IG5vdCBhIGZpbGUsIGRpcmVjdG9yeSBvciBzeW1saW5rXHJcbiAqL1xyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhUeXBlID0gJ21pc3NpbmcnIHwgJ2ZpbGUnIHwgJ2RpcicgfCAnc3ltbGluaycgfCAndW5rbm93bidcclxuXHJcbmV4cG9ydCBpc1BhdGhUeXBlIDo9ICh4OiB1bmtub3duKTogeCBpcyBUUGF0aFR5cGUgPT5cclxuXHJcblx0cmV0dXJuIGlzU3RyaW5nKHgpICYmIHdvcmRzKCdtaXNzaW5nIGZpbGUgZGlyIHN5bWxpbmsgdW5rbm93bicpLmluY2x1ZGVzKHgpXHJcblxyXG5leHBvcnQgZ2V0UGF0aFR5cGUgOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoVHlwZSA9PlxyXG5cclxuXHRhc3NlcnQgaXNTdHJpbmcocGF0aCksIFwibm90IGEgc3RyaW5nOiAje09MKHBhdGgpfVwiXHJcblx0aWYgbm90IGV4aXN0c1N5bmMocGF0aClcclxuXHRcdHJldHVybiAnbWlzc2luZydcclxuXHRoIDo9IGdldEZpbGVTdGF0cyBwYXRoXHJcblx0cmV0dXJuIChcclxuXHRcdCAgaC5pc0ZpbGUgICAgICAgICA/ICdmaWxlJ1xyXG5cdFx0OiBoLmlzRGlyZWN0b3J5ICAgID8gJ2RpcidcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoVG9VUkwgOj0gKC4uLmxQYXJ0czogc3RyaW5nW10pOiBzdHJpbmcgPT5cclxuXHJcblx0cGF0aCA6PSByZXNvbHZlIC4uLmxQYXJ0c1xyXG5cdHJldHVybiBuZXcgVVJMKCdmaWxlOicgKyBwYXRoKS5ocmVmLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rcGF0aCA6PSAoLi4ubFBhcnRzOiBzdHJpbmc/W10pOiBzdHJpbmcgPT5cclxuXHJcblx0bFVzZVBhcnRzIDo9IEFycmF5LmZyb20gTUFQIGxQYXJ0cywgKHgpIC0+XHJcblx0XHRpZiBub25FbXB0eSh4KVxyXG5cdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh4KVxyXG5cdFx0XHQjIC0tLSBSZW1vdmUgYW55IGxlYWRpbmcgb3IgdHJhaWxpbmcgc2xhc2hlcyxcclxuXHRcdFx0IyAgICAgZXZlbiBpZiBsZWFkaW5nIHNsYXNoIGlzIHByZWNlZGVkIGJ5ICcuJ1xyXG5cdFx0XHRsTWF0Y2hlcyA6PSB4Lm1hdGNoIC8vL15cclxuXHRcdFx0XHQoPzpcclxuXHRcdFx0XHRcdFxcLj8gW1xcXFxcXC9dXHJcblx0XHRcdFx0XHQpP1xyXG5cdFx0XHRcdCguKj8pXHJcblx0XHRcdFx0W1xcXFxcXC9dP1xyXG5cdFx0XHRcdCQvLy9cclxuXHRcdFx0aWYgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdFx0XHR5aWVsZCBsTWF0Y2hlc1sxXVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIGxVc2VQYXJ0cy5qb2luKCcvJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aERlc2MgPSB7XHJcblx0ZGlyOiBzdHJpbmdcclxuXHRyb290OiBzdHJpbmdcclxuXHRsUGFydHM6IHN0cmluZ1tdXHJcblx0fVxyXG5cclxuZXhwb3J0IHBhdGhTdWJEaXJzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRQYXRoRGVzYyA9PlxyXG5cclxuXHRwYXRoID0gdG9GdWxsUGF0aChwYXRoKVxyXG5cdHtyb290LCBkaXJ9IDo9IHBhcnNlIHBhdGhcclxuXHRyZXR1cm4ge1xyXG5cdFx0ZGlyXHJcblx0XHRyb290XHJcblx0XHRsUGFydHM6IGRpci5zbGljZShyb290Lmxlbmd0aCkuc3BsaXQoL1tcXFxcXFwvXS8pXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBTaG91bGQgYmUgY2FsbGVkIGxpa2U6IG15c2VsZihpbXBvcnQubWV0YS51cmwpXHJcbiMgICAgIHJldHVybnMgcmVsYXRpdmUgcGF0aCBvZiBjdXJyZW50IGZpbGVcclxuXHJcbmV4cG9ydCBteXNlbGYgOj0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiB0b1JlbFBhdGggZnJvbUZpbGVVcmwgdXJsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmYgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0Y29udGVudHM6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7YXBwZW5kfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdH1cclxuXHJcblx0bWtEaXJzRm9yRmlsZSBwYXRoXHJcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcclxuXHRpZiBhcHBlbmQgJiYgaXNGaWxlKHBhdGgpXHJcblx0XHRhcHBlbmRGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0ZWxzZVxyXG5cdFx0RGVuby53cml0ZUZpbGVTeW5jIHBhdGgsIGRhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRleHQ6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtleHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZXh0OiAnLmNpdmV0J1xyXG5cdFx0fVxyXG5cdHRlbXBGaWxlUGF0aCA6PSBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeDogZXh0fVxyXG5cdGJhcmYgdGVtcEZpbGVQYXRoLCBjb250ZW50c1xyXG5cdHJldHVybiB0ZW1wRmlsZVBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWtEaXIgOj0gKFxyXG5cdFx0ZGlyUGF0aDogc3RyaW5nLFxyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBjbGVhclxyXG5cdFx0IyAtLS0gY3JlYXRlcyBkaXIgaWYgaXQgZG9lc24ndCBleGlzdFxyXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcclxuXHRlbHNlXHJcblx0XHRlbnN1cmVEaXJTeW5jIGRpclBhdGhcclxuXHRhc3NlcnQgaXNEaXIoZGlyUGF0aCksIFwiRGlyIG5vdCBjcmVhdGVkOiAje2RpclBhdGh9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJEaXIgOj0gKGRpclBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0aWYgZXhpc3RzU3luYyhkaXJQYXRoKSAmJiBpc0RpcihkaXJQYXRoKVxyXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcclxuXHRlbHNlXHJcblx0XHRta0RpciBkaXJQYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rRGlyc0ZvckZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0e3Jvb3QsIGxQYXJ0c30gOj0gcGF0aFN1YkRpcnMgcGF0aFxyXG5cdGxldCBkaXIgPSByb290XHJcblx0Zm9yIHBhcnQgb2YgbFBhcnRzXHJcblx0XHRkaXIgKz0gXCIvI3twYXJ0fVwiXHJcblx0XHRta0RpciBkaXJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURnNFdmVudEhhbmRsZXIgPSAoa2luZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IHZvaWQgfCBib29sZWFuXHJcbi8qKlxyXG4gKiBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXHJcbiAqICAgIGhhbmRsZXMgZmlsZSBjaGFuZ2VkIGV2ZW50cyB3aGVuIC5oYW5kbGVFdmVudChmc0V2ZW50KSBpcyBjYWxsZWRcclxuICogICAgY2FsbGJhY2sgaXMgYSBmdW5jdGlvbiwgZGVib3VuY2VkIGJ5IDIwMCBtc1xyXG4gKiAgICAgICB0aGF0IHRha2VzIGFuIEZzRXZlbnQgYW5kIHJldHVybnMgYSBUVm9pZEZ1bmNcclxuICogICAgICAgd2hpY2ggd2lsbCBiZSBjYWxsZWQgaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgYSBmdW5jdGlvbiByZWZlcmVuY2VcclxuICogW3VuaXQgdGVzdHNdKC4uL3Rlc3QvZnMudGVzdC5jaXZldCM6fjp0ZXh0PSUyMyUyMCUyRCUyRCUyRCUyMGNsYXNzJTIwRmlsZUV2ZW50SGFuZGxlcilcclxuICovXHJcblxyXG5leHBvcnQgY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxyXG5cdGhhbmRsZXI6IFRGc0V2ZW50SGFuZGxlciAjIC0tLSBkZWJvdW5jZWQgaGFuZGxlclxyXG5cdG9uU3RvcDogPT4gdm9pZCA9IHBhc3NcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKGNhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIsIGhPcHRpb25zOiBoYXNoID0ge30pXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0b25TdG9wOiBUVm9pZEZ1bmNcclxuXHRcdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHRcdH1cclxuXHRcdHtvblN0b3A6IG9uU3RvcDEsIGRlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcclxuXHRcdFx0b25TdG9wOiBwYXNzXHJcblx0XHRcdGRlYm91bmNlQnk6IDIwMFxyXG5cdFx0QG9uU3RvcCA9IG9uU3RvcDFcclxuXHRcdGhhbmRsZXIxIDo9IGRlYm91bmNlIGNhbGxiYWNrLCBkZWJvdW5jZUJ5XHJcblx0XHRAaGFuZGxlciA9IGhhbmRsZXIxXHJcblx0XHREQkcgXCJGaWxlRXZlbnRIYW5kbGVyIGNvbnN0cnVjdG9yKCkgY2FsbGVkXCJcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyAtLS0gQ2FsbHMgYSBUVm9pZEZ1bmMsIGJ1dCBpcyBkZWJvdW5jZWQgYnkgQG1zIG1zXHJcblxyXG5cdGhhbmRsZUV2ZW50KGZzRXZlbnQ6IEZzRXZlbnQpOiB2b2lkXHJcblx0XHR7a2luZCwgcGF0aHN9IDo9IGZzRXZlbnRcclxuXHRcdERCRyBcIkhBTkRMRTogWyN7c2luY2VMb2FkU3RyKCl9XSAje2tpbmR9ICN7T0wocGF0aHMpfVwiXHJcblx0XHRmb3IgcGF0aCBvZiBwYXRoc1xyXG5cdFx0XHRAaGFuZGxlciBraW5kLCBwYXRoXHJcblx0XHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbi8qKlxyXG4gKiBhIGZ1bmN0aW9uIHRoYXQgd2F0Y2hlcyBmb3IgY2hhbmdlcyBvbmUgb3IgbW9yZSBmaWxlcyBvciBkaXJlY3Rvcmllc1xyXG4gKiAgICBhbmQgY2FsbHMgYSBjYWxsYmFjayBmdW5jdGlvbiBmb3IgZWFjaCBjaGFuZ2UuXHJcbiAqIElmIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydWUsIHdhdGNoaW5nIGlzIGhhbHRlZFxyXG4gKlxyXG4gKiBVc2FnZTpcclxuICogICBoYW5kbGVyIDo9IChraW5kLCBwYXRoKSA9PiBjb25zb2xlLmxvZyBwYXRoXHJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICd0ZW1wLnR4dCcsIGhhbmRsZXJcclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3NyYy9saWInLCAgaGFuZGxlclxyXG4gKiAgIGF3YWl0IHdhdGNoRmlsZSBbJ3RlbXAudHh0JywgJ3NyYy9saWInXSwgaGFuZGxlclxyXG4gKi9cclxuXHJcbmV4cG9ydCB3YXRjaEZpbGVzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLFxyXG5cdFx0d2F0Y2hlckNCOiBURnNFdmVudEhhbmRsZXIsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkIC0+XHJcblxyXG5cdCMgLS0tIGRlYm91bmNlQnkgaXMgbWlsbGlzZWNvbmRzIHRvIGRlYm91bmNlIGJ5LCBkZWZhdWx0IGlzIDIwMFxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHR9XHJcblx0e2RlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZGVib3VuY2VCeTogMjAwXHJcblx0XHR9XHJcblxyXG5cdERCRyBcIldBVENIOiAje09MKHBhdGgpfVwiXHJcblx0d2F0Y2hlciA6PSBEZW5vLndhdGNoRnMgcGF0aFxyXG5cdGxldCBkb1N0b3A6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdGZzQ2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciA6PSAoa2luZCwgcGF0aCk6IHZvaWQgPT5cclxuXHRcdHJlc3VsdCA6PSB3YXRjaGVyQ0Iga2luZCwgcGF0aFxyXG5cdFx0REJHIFwiRkNCOiByZXN1bHQgPSAje3Jlc3VsdH1cIlxyXG5cdFx0aWYgcmVzdWx0XHJcblx0XHRcdHdhdGNoZXIuY2xvc2UoKVxyXG5cdFx0cmV0dXJuXHJcblx0aGFuZGxlciA6PSBuZXcgRmlsZUV2ZW50SGFuZGxlcihmc0NhbGxiYWNrLCB7IGRlYm91bmNlQnkgfSlcclxuXHRmb3IgYXdhaXQgaXRlbSBvZiB3YXRjaGVyXHJcblx0XHRmc0V2ZW50OiBGc0V2ZW50IDo9IGl0ZW1cclxuXHRcdERCRyBcIndhdGNoZXIgZXZlbnQgZmlyZWRcIlxyXG5cdFx0aWYgZG9TdG9wXHJcblx0XHRcdERCRyBcImRvU3RvcCA9ICN7ZG9TdG9wfSwgQ2xvc2luZyB3YXRjaGVyXCJcclxuXHRcdFx0YnJlYWtcclxuXHRcdGZvciBwYXRoIG9mIGZzRXZlbnQucGF0aHNcclxuXHRcdFx0IyAtLS0gZnNDYWxsYmFjayB3aWxsIGJlIChldmVudHVhbGx5KSBjYWxsZWRcclxuXHRcdFx0YXdhaXQgaGFuZGxlci5oYW5kbGVFdmVudCBmc0V2ZW50XHJcbmV4cG9ydCB3YXRjaEZpbGUgOj0gd2F0Y2hGaWxlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRjaEZpcnN0TGluZSA6PSAocGF0aDogc3RyaW5nLCBzdHI6IHN0cmluZywgbmV3c3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdCMgLS0tIFJlcGxhY2Ugc3RyIHdpdGggbmV3c3RyLCBidXQgb25seSBvbiBmaXJzdCBsaW5lXHJcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRubFBvcyA6PSBjb250ZW50cy5pbmRleE9mIFwiXFxuXCJcclxuXHRzdHJQb3MgOj0gY29udGVudHMuaW5kZXhPZiBzdHJcclxuXHRpZiAoc3RyUG9zICE9IC0xKSAmJiAoKG5sUG9zID09IC0xKSB8fCAoc3RyUG9zIDwgbmxQb3MpKVxyXG5cdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBjb250ZW50cy5yZXBsYWNlKHN0ciwgbmV3c3RyKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmcm9tSnNvbkZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGhhc2ggPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdFx0aWYgaXNFbXB0eShjb250ZW50cylcclxuXHRcdFx0cmV0dXJuIHt9XHJcblx0XHRyZXN1bHQgOj0gcGFyc2VKU09OQyhjb250ZW50cylcclxuXHRcdHJldHVybiBkZWZpbmVkKHJlc3VsdCkgPyByZXN1bHQgYXMgaGFzaCA6IHt9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHt9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvSnNvbkZpbGUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRkYXRhOiBoYXNoXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWRkSnNvblZhbHVlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0a2V5OiBzdHJpbmdcclxuXHRcdHZhbHVlOiB1bmtub3duXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGhEYXRhIDo9IGZyb21Kc29uRmlsZShwYXRoKVxyXG5cdGlmIGRlZmluZWQoaERhdGEpICYmIGlzSGFzaChoRGF0YSlcclxuXHRcdGhEYXRhW2tleV0gPSB2YWx1ZVxyXG5cdFx0dG9Kc29uRmlsZSBwYXRoLCBoRGF0YVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpblNhbWVEaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHtkaXJ9IDo9IHBhcnNlUGF0aChwYXRoKVxyXG5cdG5ld3BhdGggOj0gbWtwYXRoKGRpciwgZmlsZU5hbWUpXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggbmV3cGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZW1vdmVDUiA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsICdcXHInLCAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbHVycCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcclxuXHRkYXRhIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0cmV0dXJuIGRlZmluZWQoZGF0YSkgPyByZW1vdmVDUihkYXRhKSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgc2x1cnBBc3luYyA6PSBhc3luYyAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGRhdGEgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRoU3RyIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0cm9vdDogc3RyaW5nID0gJy4nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUgcm9vdCwgcGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzcGxpdFBhdHRlcm5zIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nW10sXHJcblx0XHQpOiBbc3RyaW5nW10sIHN0cmluZ1tdXSA9PlxyXG5cclxuXHR0eXBlIFRBY2N1bSA9IFtzdHJpbmdbXSwgc3RyaW5nW11dXHJcblxyXG5cdGFjYzA6IFRBY2N1bSA6PSBbW10sW11dXHJcblx0YWNjdW0gOj0gTUFQIGxQYXR0ZXJucywgYWNjMCwgKHBhdDogc3RyaW5nLCBhY2M6IFRBY2N1bSk6IFRBY2N1bSAtPlxyXG5cdFx0W2xQb3MsIGxOZWddIDo9IGFjY1xyXG5cdFx0bE1hdGNoZXMgOj0gcGF0Lm1hdGNoIC8vL14gXFwhIFxccysgKC4qKSAkLy8vXHJcblx0XHRyZXR1cm4gKFxyXG5cdFx0XHQgIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdD8gWyBsUG9zLCAgICAgICAgICAgICAgbE5lZy5jb25jYXQobE1hdGNoZXNbMV0pXVxyXG5cdFx0XHQ6IFsgbFBvcy5jb25jYXQocGF0KSwgIGxOZWcgICAgICAgICAgICAgICAgICAgIF1cclxuXHRcdFx0KVxyXG5cdHJldHVybiBhY2N1bVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoRmlsdGVyID0gKHBhdGg6IHN0cmluZykgPT4gYm9vbGVhblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbkhpZGRlbkZvbGRlciA6PSAocGF0aDogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRoIDo9IHBhcnNlUGF0aChwYXRoKVxyXG5cdHJldHVybiByZU1hdGNoKGguZGlyLCAvXFwvXFwuLylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgVEl0ZXJhdG9yXHJcbiNcclxuIyAgICBVc2UgbGlrZTpcclxuIyAgICAgICBmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKGxQYXRzKVxyXG4jICAgICAgICAgIE9SXHJcbiMgICAgICAgbFBhdGhzIDo9IEFycmF5LmZyb20oYWxsRmlsZXNNYXRjaGluZyhsUGF0cykpXHJcbiNcclxuIyAgICBOT1RFOiBCeSBkZWZhdWx0LCBzZWFyY2hlcyBmcm9tIERlbm8uY3dkKClcclxuIyAgICAgICAgICBCeSBkZWZhdWx0LCBpZ25vcmVzIGFueSBkaXJlY3RvcmllcyBzdGFydGluZyB3aXRoICcuJ1xyXG5cclxuZXhwb3J0IGFsbEZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGRlZmF1bHRGaWx0ZXIgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHRcdHJldHVybiBub3QgaW5IaWRkZW5Gb2xkZXIocGF0aClcclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRyb290OiBzdHJpbmdcclxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2hcclxuXHRcdGZpbHRlcjogVFBhdGhGaWx0ZXJcclxuXHRcdGluY2x1ZGVEaXJzOiBib29sZWFuXHJcblx0XHR9XHJcblxyXG5cdHtyb290LCBoTW9yZUdsb2JPcHRpb25zLCBmaWx0ZXIsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0ZmlsdGVyOiBkZWZhdWx0RmlsdGVyXHJcblx0XHRcdGluY2x1ZGVEaXJzOiBmYWxzZVxyXG5cdFx0XHR9XHJcblxyXG5cdGhHbG9iT3B0aW9uczogaGFzaCA6PSB7XHJcblx0XHRyb290XHJcblx0XHRpbmNsdWRlRGlyc1xyXG5cdFx0Zm9sbG93U3ltbGlua3M6IGZhbHNlXHJcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHQuLi5oTW9yZUdsb2JPcHRpb25zXHJcblx0XHR9XHJcblxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gaXNTdHJpbmcobFBhdHRlcm5zKSA/IFtsUGF0dGVybnNdIDogbFBhdHRlcm5zXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgaXNFbXB0eShsUG9zUGF0cylcclxuXHRcdHJldHVyblxyXG5cdGlmIG5vbkVtcHR5KGxOZWdQYXRzKVxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciBlbnRyeSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0cGF0aCA6PSBub3JtYWxpemVQYXRoKGVudHJ5LnBhdGgpXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRcdCAgIG5vdCBzZXRTa2lwLmhhcyhwYXRoKVxyXG5cdFx0XHRcdFx0JiYgZmlsdGVyKHBhdGgpXHJcblx0XHRcdFx0XHQpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJQQVRIOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHRhd2FpdCBEZW5vLnJlbW92ZSBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbmRGaWxlIDo9IChcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHN0cmluZz8gPT5cclxuXHJcblx0IyAtLS0gTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cclxuXHRsUGF0aHMgOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nIFwiKiovI3tmaWxlTmFtZX1cIiwgaE9wdGlvbnNcclxuXHREQkdWQUxVRSBsUGF0aHMsICdsUGF0aHMnXHJcblx0c3dpdGNoIGxQYXRocy5sZW5ndGhcclxuXHRcdGNhc2UgMTpcclxuXHRcdFx0cGF0aCA6PSBsUGF0aHNbMF1cclxuXHRcdFx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRsTGluZXMgOj0gW1wiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9OlwiXVxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRsTGluZXMucHVzaCBwYXRoXHJcblx0XHRcdGNyb2FrIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cdFx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZERpciA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbERpcnNNYXRjaGluZyBcIioqLyN7ZmlsZU5hbWV9XCIsIGhPcHRpb25zXHJcblx0REJHVkFMVUUgbFBhdGhzLCAnbFBhdGhzJ1xyXG5cdHN3aXRjaCBsUGF0aHMubGVuZ3RoXHJcblx0XHRjYXNlIDE6XHJcblx0XHRcdHJldHVybiBsUGF0aHNbMF1cclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRsTGluZXMgOj0gW1wiTXVsdGlwbGUgZGlycyB3aXRoIG5hbWUgI3tmaWxlTmFtZX06XCJdXHJcblx0XHRcdGZvciBwYXRoIG9mIGxQYXRoc1xyXG5cdFx0XHRcdGxMaW5lcy5wdXNoIHBhdGhcclxuXHRcdFx0Y3JvYWsgbExpbmVzLmpvaW4oJ1xcbicpXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbERpcnNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxEaXJzIDo9IEFycmF5LmZyb20oYWxsRGlyc01hdGNoaW5nKGxQYXRzKSlcclxuXHJcbmV4cG9ydCBhbGxEaXJzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGRlZmF1bHRGaWx0ZXIgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHRcdHJldHVybiBub3QgaW5IaWRkZW5Gb2xkZXIocGF0aClcclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRyb290OiBzdHJpbmdcclxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2hcclxuXHRcdGZpbHRlcjogVFBhdGhGaWx0ZXJcclxuXHRcdH1cclxuXHJcblx0e3Jvb3QsIGhNb3JlR2xvYk9wdGlvbnMsIGZpbHRlcixcclxuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdHJvb3Q6ICcuJ1xyXG5cdFx0XHRoTW9yZUdsb2JPcHRpb25zOiB7fVxyXG5cdFx0XHRmaWx0ZXI6IGRlZmF1bHRGaWx0ZXJcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnM6IHRydWVcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gKFxyXG5cdFx0ICBpc1N0cmluZyhsUGF0dGVybnMpXHJcblx0XHQ/IFtsUGF0dGVybnNdXHJcblx0XHQ6IGxQYXR0ZXJuc1xyXG5cdFx0KVxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciBlbnRyeSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0cGF0aCA6PSBub3JtYWxpemVQYXRoKGVudHJ5LnBhdGgpXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRcdCAgIG5vdCBzZXRTa2lwLmhhcyhwYXRoKVxyXG5cdFx0XHRcdFx0JiYgZmlsdGVyKHBhdGgpXHJcblx0XHRcdFx0XHQmJiBpc0RpcihwYXRoKVxyXG5cdFx0XHRcdFx0KVxyXG5cdFx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdFx0TE9HIFwiRElSOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gcmV0dXJucyBmYWxzZSBpZiBmaWxlIGRvZXNuJ3QgZXhpc3RcclxuXHJcbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdFx0cmV0dXJuIHRydWVcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcm1EaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGNsZWFyOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2NsZWFyfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNsZWFyOiBmYWxzZVxyXG5cdFx0fVxyXG5cclxuXHRpZiBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRhc3NlcnQgaXNEaXIocGF0aCksIFwiTm90IGEgZGlyZWN0b3J5OiAje3BhdGh9XCJcclxuXHRcdGlmIGNsZWFyXHJcblx0XHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoLCByZWN1cnNpdmU6IHRydWVcclxuXHRcdGVsc2VcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ1dyaXRhYmxlRmlsZVxyXG5cclxuXHRwYXRoOiBzdHJpbmdcclxuXHRmaWxlOiBEZW5vLkZzRmlsZVxyXG5cclxuXHRjb25zdHJ1Y3RvcihAcGF0aDogc3RyaW5nLCBoT3B0aW9uczogaGFzaCA9IHt9KVxyXG5cclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdFx0fVxyXG5cdFx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRcdEBmaWxlID0gRGVuby5vcGVuU3luYyBAcGF0aCwge1xyXG5cdFx0XHR3cml0ZTogdHJ1ZVxyXG5cdFx0XHRjcmVhdGU6IHRydWVcclxuXHRcdFx0dHJ1bmNhdGU6IG5vdCBhcHBlbmRcclxuXHRcdFx0fVxyXG5cclxuXHR3cml0ZShzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0d3JpdGVsbihzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIgKyAnXFxuJylcclxuXHRcdHJldHVyblxyXG5cclxuXHRjbG9zZSgpXHJcblx0XHRAZmlsZS5jbG9zZSgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENSZWFkYWJsZUZpbGVcclxuXHJcblx0cGF0aDogc3RyaW5nXHJcblx0aW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdGhNZXRhRGF0YTogaGFzaCA9IHt9XHJcblx0aXRlcjogVEFzeW5jSXRlcmF0b3I8c3RyaW5nLHZvaWQsdm9pZD4gPSBnZXRFbXB0eUFzeW5jSXRlcmF0b3I8c3RyaW5nPigpXHJcblx0Zmlyc3RMaW5lOiBzdHJpbmc/ID0gdW5kZWZcclxuXHJcblx0Y29uc3RydWN0b3IoQHBhdGg6IHN0cmluZylcclxuXHJcblx0aW5pdCgpOiB2b2lkXHJcblxyXG5cdFx0YXNzZXJ0IGlzRmlsZShAcGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje0BwYXRofVwiXHJcblx0XHRAaXRlciA6PSBhbGxMaW5lc0luRmlsZShAcGF0aClcclxuXHJcblx0XHQjIC0tLSB3ZSBuZWVkIHRvIGdldCB0aGUgZmlyc3QgbGluZSB0byBjaGVjayBpZlxyXG5cdFx0IyAgICAgdGhlcmUncyBtZXRhIGRhdGEuIEJ1dCBpZiB0aGVyZSBpcyBub3QsXHJcblx0XHQjICAgICB3ZSBuZWVkIHRvIHJldHVybiBpdCBieSB0aGUgcmVhZGVyXHJcblxyXG5cdFx0bGV0IHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0QGZpcnN0TGluZSA9IHVuZGVmXHJcblx0XHRlbHNlXHJcblx0XHRcdG9idmlvdXNseSBkZWZpbmVkKHZhbHVlKVxyXG5cdFx0XHRAZmlyc3RMaW5lID0gdmFsdWVcclxuXHRcdFx0IyAtLS0gR2V0IG1ldGEgZGF0YSBpZiBwcmVzZW50XHJcblx0XHRcdEBoTWV0YURhdGEgPSAoXHJcblx0XHRcdFx0aWYgaXNNZXRhRGF0YVN0YXJ0KHZhbHVlKVxyXG5cdFx0XHRcdFx0bE1ldGFMaW5lczogc3RyaW5nW10gOj0gW11cclxuXHRcdFx0XHRcdHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdFx0XHRcdHdoaWxlIG5vdCBkb25lICYmICh2YWx1ZSAhPSBAZmlyc3RMaW5lKVxyXG5cdFx0XHRcdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh2YWx1ZSlcclxuXHRcdFx0XHRcdFx0bE1ldGFMaW5lcy5wdXNoIHZhbHVlXHJcblx0XHRcdFx0XHRcdHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PSBAZmlyc3RMaW5lKVxyXG5cdFx0XHRcdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh2YWx1ZSlcclxuXHRcdFx0XHRcdFx0QGZpcnN0TGluZSA9IHVuZGVmXHJcblx0XHRcdFx0XHRcdGdldE1ldGFEYXRhSGFzaCh2YWx1ZSwgYXJyYXlUb0Jsb2NrKGxNZXRhTGluZXMpKVxyXG5cdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHR7fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHt9XHJcblx0XHRcdFx0KVxyXG5cdFx0QGluaXRpYWxpemVkID0gdHJ1ZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdG1ldGFEYXRhKCk6IGhhc2hcclxuXHJcblx0XHRpZiBub3QgQGluaXRpYWxpemVkXHJcblx0XHRcdGF3YWl0IEBpbml0KClcclxuXHRcdHJldHVybiBAaE1ldGFEYXRhXHJcblxyXG5cdGdldExpbmUoKTogc3RyaW5nP1xyXG5cclxuXHRcdGlmIG5vdCBAaW5pdGlhbGl6ZWRcclxuXHRcdFx0YXdhaXQgQGluaXQoKVxyXG5cdFx0aWYgZGVmaW5lZChAZmlyc3RMaW5lKVxyXG5cdFx0XHRzdHIgOj0gQGZpcnN0TGluZVxyXG5cdFx0XHRAZmlyc3RMaW5lID0gdW5kZWZcclxuXHRcdFx0cmV0dXJuIHN0clxyXG5cclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gYXdhaXQgQGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gdmFsdWUgYXMgc3RyaW5nXHJcblxyXG5cdGdldENvbnRlbnRzKCk6IHN0cmluZ1xyXG5cclxuXHRcdGlmIG5vdCBAaW5pdGlhbGl6ZWRcclxuXHRcdFx0YXdhaXQgQGluaXQoKVxyXG5cdFx0bExpbmVzOiBzdHJpbmdbXSA6PSBbXVxyXG5cdFx0bGV0IGxpbmUgPSBhd2FpdCBAZ2V0TGluZSgpXHJcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXHJcblx0XHRcdGxMaW5lcy5wdXNoIGxpbmVcclxuXHRcdFx0bGluZSA9IGF3YWl0IEBnZXRMaW5lKClcclxuXHRcdHJldHVybiBsTGluZXMuam9pbignXFxuJylcclxuIl19