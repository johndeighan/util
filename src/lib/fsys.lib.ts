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
	pass, undef, defined, notdefined, matches,
	TIterator, TAsyncIterator, encode,
	croak, assert, obviously, words,
	getEmptyIterator, getEmptyAsyncIterator, getOptions,
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
import {spaces, arrayToBlock, f} from 'llutils'
import {OL, DBGVALUE} from 'nice'
import {isMetaDataStart, getMetaDataHash} from 'meta-data'
import {debugging} from 'cmd-args'

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

export type TFsEventKind = 'create' | 'modify' | 'remove'
export const isEventKind = (x: unknown): x is TFsEventKind => {
	return (
		   (typeof x === 'string')
		&& ['create','modify','remove'].includes(x)
		)
}

export type TFsEventHandler = (
	kind: TFsEventKind,
	path: string
	) => void | boolean

// ---------------------------------------------------------------------------

export const watchFiles = async function(
		path: string | string[],
		watcherCB: TFsEventHandler,
		hOptions: hash = {}
		): AutoPromise<void> {

	type opt = {
		onStop: TVoidFunc
		debounceBy: number
		}
	const {onStop, debounceBy} = getOptions<opt>(hOptions, {
		onStop: pass,
		debounceBy: 300,
	})

	const watcher = Deno.watchFs(path)

	const sEvents = new Set<string>()

	const func = () => {
		for (const eventStr of sEvents) {
			const [kind, path] = eventStr.split(' ', 2)
			assert(isEventKind(kind), `Bad event kind: ${kind}`)
			const retval = watcherCB(kind, toRelPath(path))

			if (retval === true) {
				watcher.close()
				onStop()
			}
		}
		sEvents.clear()
	}

	const trigger = debounce(func, debounceBy)

	for await (const event of watcher) {
		const {kind, paths} = event

		// --- Track unique paths modified during the bounce window
		if (['create','modify','remove'].includes(kind)) {
			for (const path of event.paths) {
				sEvents.add(`${kind} ${path}`)
			}
		}

		// --- Refresh the debounce timer
		trigger()
	}
	return
}

// ---------------------------------------------------------------------------

export const patchFirstLine = (
		path: string,
		str: string,
		newstr: string
		): void => {

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
	return matches(h.dir, /\/\./)
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
		filter: TPathFilter     // return true to keep
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

// sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbImZzeXMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUM5QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFFLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQywrQkFBK0I7QUFDNUQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDdkMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDbkIsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsR0FB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QU0sQ0FBQSxDQUFBO0FBQ3RCLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFBLENBQUksSSxDQUFDLFdBQVcsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLEtBQUssQ0FBQyxJLENBQUMsSUFBSSxDQUFDLEM7RUFBQyxDQUFBO0FBQ2hCLEFBQUEsRUFBa0IsTUFBaEIsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQzdCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ25CLEFBQUEsR0FBRyxJQUFJLEMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxJLENBQUMsT0FBTyxDQUFDLEM7RUFBQyxDQUFBO0FBQzFCLEFBQUEsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEM7Q0FBQyxDO0FBQUEsQ0FBQTtBQUMxQiIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBmc3lzLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtwYXJzZTogcGFyc2VGaWxlUGF0aH0gZnJvbSAnbm9kZS1wYXRoJ1xyXG5pbXBvcnQge3BhcnNlOiBwYXJzZUpTT05DLCBKc29uVmFsdWV9IGZyb20gJ0BzdGQvanNvbmMnXHJcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJ0BzdGQvYXN5bmMvZGVib3VuY2UnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jLCBXYWxrRW50cnl9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7YXBwZW5kRmlsZVN5bmMsIG9wZW5TeW5jLCBjbG9zZVN5bmN9IGZyb20gJ25vZGUtZnMnXHJcbmltcG9ydCB7RXZlbnRFbWl0dGVyfSBmcm9tICdub2RlLWV2ZW50cydcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zL3RleHQtbGluZS1zdHJlYW0nXHJcbmltcG9ydCB7XHJcblx0cGFyc2UsIHJlc29sdmUsIHJlbGF0aXZlLCBmcm9tRmlsZVVybCxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuXHJcbmltcG9ydCB7XHJcblx0TE9HLCBEQkcsIFdBUk4sIEVSUiwgSU5ERU5ULCBVTkRFTlQsXHJcblx0cHVzaExvZ0xldmVsLCBwb3BMb2dMZXZlbCxcclxuXHR9IGZyb20gJ2xvZ2dlcidcclxuaW1wb3J0IHtcclxuXHRwYXNzLCB1bmRlZiwgZGVmaW5lZCwgbm90ZGVmaW5lZCwgbWF0Y2hlcyxcclxuXHRUSXRlcmF0b3IsIFRBc3luY0l0ZXJhdG9yLCBlbmNvZGUsXHJcblx0Y3JvYWssIGFzc2VydCwgb2J2aW91c2x5LCB3b3JkcyxcclxuXHRnZXRFbXB0eUl0ZXJhdG9yLCBnZXRFbXB0eUFzeW5jSXRlcmF0b3IsIGdldE9wdGlvbnMsXHJcblx0fSBmcm9tICdiYXNlJ1xyXG5pbXBvcnQge1xyXG5cdG5vcm1hbGl6ZVBhdGgsIGZpbGVFeHQsIHdpdGhFeHQsIHRvdWNoLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxyXG5cdFRGaWxlU3RhdHMsIGdldEZpbGVTdGF0cywgbW9kVGltZSwgYWxsTGluZXNJbkZpbGUsXHJcblx0bWtUZW1wRmlsZSwgbWtUZW1wRmlsZVN5bmMsIHRvUmVsUGF0aCwgaXNGdWxsUGF0aCwgdG9GdWxsUGF0aCxcclxuXHRUUGF0aEluZm8sIHBhcnNlUGF0aCwgaXNGaWxlLCBpc0RpcixcclxuXHR9IGZyb20gJ2xsZnMnXHJcbmltcG9ydCB7XHJcblx0aXNFbXB0eSwgbm9uRW1wdHksIGlzU3RyaW5nLCBpc05vbkVtcHR5U3RyaW5nLCByZWdleHAsXHJcblx0aXNCb29sZWFuLCBpc051bWJlciwgaXNJbnRlZ2VyLCBpc0FycmF5LCBpc0FycmF5T2ZTdHJpbmdzLFxyXG5cdGlzSGFzaCwgaXNSZWdFeHAsIGludGVnZXIsIGhhc2gsIGhhc2hvZiwgVFZvaWRGdW5jLFxyXG5cdH0gZnJvbSAnZGF0YXR5cGVzJ1xyXG5pbXBvcnQge3NpbmNlTG9hZFN0cn0gZnJvbSAndGltZXInXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcbmltcG9ydCB7c3BhY2VzLCBhcnJheVRvQmxvY2ssIGZ9IGZyb20gJ2xsdXRpbHMnXHJcbmltcG9ydCB7T0wsIERCR1ZBTFVFfSBmcm9tICduaWNlJ1xyXG5pbXBvcnQge2lzTWV0YURhdGFTdGFydCwgZ2V0TWV0YURhdGFIYXNofSBmcm9tICdtZXRhLWRhdGEnXHJcbmltcG9ydCB7ZGVidWdnaW5nfSBmcm9tICdjbWQtYXJncydcclxuXHJcbmV4cG9ydCB7XHJcblx0bm9ybWFsaXplUGF0aCwgdG9SZWxQYXRoLCB0b0Z1bGxQYXRoLCB0b3VjaCxcclxuXHRhbGxMaW5lc0luRmlsZSwgbW9kVGltZSwgbmV3ZXJEZXN0RmlsZUV4aXN0cyxcclxuXHRmaWxlRXh0LCB3aXRoRXh0LCBnZXRGaWxlU3RhdHMsIGlzRnVsbFBhdGgsXHJcblx0bWtUZW1wRmlsZSwgbWtUZW1wRmlsZVN5bmMsIHBhcnNlUGF0aCwgaXNGaWxlLCBpc0RpcixcclxuXHR9XHJcbmV4cG9ydCB0eXBlIFRQYXRoSW5mb1xyXG5leHBvcnQgdHlwZSBXYWxrRW50cnlcclxuXHJcbiMgLS0tIENyZWF0ZSBhIGZ1bmN0aW9uIGNhcGFibGUgb2Ygc3luY2hyb25vdXNseVxyXG4jICAgICBpbXBvcnRpbmcgRVNNIG1vZHVsZXNcclxuXHJcbkRlbm8gOj0gZ2xvYmFsVGhpcy5EZW5vXHJcbnR5cGUgRnNFdmVudCA9IERlbm8uRnNFdmVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBEZW5vLkZpbGVJbmZvIGhhczpcclxuIyAgICBpc0ZpbGUgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSByZWd1bGFyIGZpbGUuXHJcbiMgICAgaXNEaXJlY3RvcnkgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBkaXJlY3RvcnkuXHJcbiMgICAgaXNTeW1saW5rIChib29sZWFuKTogVHJ1ZSBpZiBpdCdzIGEgc3ltbGluay5cclxuIyAgICBzaXplIChudW1iZXIpOiBGaWxlIHNpemUgaW4gYnl0ZXMuXHJcbiMgICAgbXRpbWUgKERhdGUgfCBudWxsKTogTW9kaWZpY2F0aW9uIHRpbWUuXHJcbiMgICAgYXRpbWUgKERhdGUgfCBudWxsKTogTGFzdCBhY2Nlc3MgdGltZS5cclxuIyAgICBiaXJ0aHRpbWUgKERhdGUgfCBudWxsKTogQ3JlYXRpb24gdGltZSAobm90IGF2YWlsYWJsZSBvbiBhbGwgcGxhdGZvcm1zKS5cclxuIyAgICBtb2RlIChudW1iZXIgfCBudWxsKTogUGVybWlzc2lvbnMgKFBPU0lYIG9ubHkpLlxyXG4jICAgIHVpZCAvIGdpZCAobnVtYmVyIHwgbnVsbCk6IE93bmVyL2dyb3VwIElEIChQT1NJWCBvbmx5KVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vKipcclxuICogcmV0dXJucyBvbmUgb2Y6XHJcbiAqICAgICdtaXNzaW5nJyAgLSBkb2VzIG5vdCBleGlzdFxyXG4gKiAgICAnZGlyJyAgICAgIC0gaXMgYSBkaXJlY3RvcnlcclxuICogICAgJ2ZpbGUnICAgICAtIGlzIGEgZmlsZVxyXG4gKiAgICAnc3ltbGluaycgIC0gaXMgYSBzeW1saW5rXHJcbiAqICAgICd1bmtub3duJyAgLSBleGlzdHMsIGJ1dCBub3QgYSBmaWxlLCBkaXJlY3Rvcnkgb3Igc3ltbGlua1xyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFRQYXRoVHlwZSA9ICdtaXNzaW5nJyB8ICdmaWxlJyB8ICdkaXInIHwgJ3N5bWxpbmsnIHwgJ3Vua25vd24nXHJcblxyXG5leHBvcnQgaXNQYXRoVHlwZSA6PSAoeDogdW5rbm93bik6IHggaXMgVFBhdGhUeXBlID0+XHJcblxyXG5cdHJldHVybiBpc1N0cmluZyh4KSAmJiB3b3JkcygnbWlzc2luZyBmaWxlIGRpciBzeW1saW5rIHVua25vd24nKS5pbmNsdWRlcyh4KVxyXG5cclxuZXhwb3J0IGdldFBhdGhUeXBlIDo9IChwYXRoOiBzdHJpbmcpOiBUUGF0aFR5cGUgPT5cclxuXHJcblx0YXNzZXJ0IGlzU3RyaW5nKHBhdGgpLCBcIm5vdCBhIHN0cmluZzogI3tPTChwYXRoKX1cIlxyXG5cdGlmIG5vdCBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRyZXR1cm4gJ21pc3NpbmcnXHJcblx0aCA6PSBnZXRGaWxlU3RhdHMgcGF0aFxyXG5cdHJldHVybiAoXHJcblx0XHQgIGguaXNGaWxlICAgICAgICAgPyAnZmlsZSdcclxuXHRcdDogaC5pc0RpcmVjdG9yeSAgICA/ICdkaXInXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAndW5rbm93bidcclxuXHRcdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGF0aFRvVVJMIDo9ICguLi5sUGFydHM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdHBhdGggOj0gcmVzb2x2ZSAuLi5sUGFydHNcclxuXHRyZXR1cm4gbmV3IFVSTCgnZmlsZTonICsgcGF0aCkuaHJlZi5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta3BhdGggOj0gKC4uLmxQYXJ0czogc3RyaW5nP1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGxVc2VQYXJ0cyA6PSBBcnJheS5mcm9tIE1BUCBsUGFydHMsICh4KSAtPlxyXG5cdFx0aWYgbm9uRW1wdHkoeClcclxuXHRcdFx0b2J2aW91c2x5IGRlZmluZWQoeClcclxuXHRcdFx0IyAtLS0gUmVtb3ZlIGFueSBsZWFkaW5nIG9yIHRyYWlsaW5nIHNsYXNoZXMsXHJcblx0XHRcdCMgICAgIGV2ZW4gaWYgbGVhZGluZyBzbGFzaCBpcyBwcmVjZWRlZCBieSAnLidcclxuXHRcdFx0bE1hdGNoZXMgOj0geC5tYXRjaCAvLy9eXHJcblx0XHRcdFx0KD86XHJcblx0XHRcdFx0XHRcXC4/IFtcXFxcXFwvXVxyXG5cdFx0XHRcdFx0KT9cclxuXHRcdFx0XHQoLio/KVxyXG5cdFx0XHRcdFtcXFxcXFwvXT9cclxuXHRcdFx0XHQkLy8vXHJcblx0XHRcdGlmIGRlZmluZWQobE1hdGNoZXMpXHJcblx0XHRcdFx0eWllbGQgbE1hdGNoZXNbMV1cclxuXHRcdHJldHVyblxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBsVXNlUGFydHMuam9pbignLycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFBhdGhEZXNjID0ge1xyXG5cdGRpcjogc3RyaW5nXHJcblx0cm9vdDogc3RyaW5nXHJcblx0bFBhcnRzOiBzdHJpbmdbXVxyXG5cdH1cclxuXHJcbmV4cG9ydCBwYXRoU3ViRGlycyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUUGF0aERlc2MgPT5cclxuXHJcblx0cGF0aCA9IHRvRnVsbFBhdGgocGF0aClcclxuXHR7cm9vdCwgZGlyfSA6PSBwYXJzZSBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGRpclxyXG5cdFx0cm9vdFxyXG5cdFx0bFBhcnRzOiBkaXIuc2xpY2Uocm9vdC5sZW5ndGgpLnNwbGl0KC9bXFxcXFxcL10vKVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gU2hvdWxkIGJlIGNhbGxlZCBsaWtlOiBteXNlbGYoaW1wb3J0Lm1ldGEudXJsKVxyXG4jICAgICByZXR1cm5zIHJlbGF0aXZlIHBhdGggb2YgY3VycmVudCBmaWxlXHJcblxyXG5leHBvcnQgbXlzZWxmIDo9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gdG9SZWxQYXRoIGZyb21GaWxlVXJsIHVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBiYXJmIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0YXBwZW5kOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRhcHBlbmQ6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdG1rRGlyc0ZvckZpbGUgcGF0aFxyXG5cdGRhdGEgOj0gZW5jb2RlIGNvbnRlbnRzXHJcblx0aWYgYXBwZW5kICYmIGlzRmlsZShwYXRoKVxyXG5cdFx0YXBwZW5kRmlsZVN5bmMgcGF0aCwgZGF0YVxyXG5cdGVsc2VcclxuXHRcdERlbm8ud3JpdGVGaWxlU3luYyBwYXRoLCBkYXRhXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJhcmZUZW1wRmlsZSA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZXh0OiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZXh0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGV4dDogJy5jaXZldCdcclxuXHRcdH1cclxuXHR0ZW1wRmlsZVBhdGggOj0gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXg6IGV4dH1cclxuXHRiYXJmIHRlbXBGaWxlUGF0aCwgY29udGVudHNcclxuXHRyZXR1cm4gdGVtcEZpbGVQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rRGlyIDo9IChcclxuXHRcdGRpclBhdGg6IHN0cmluZyxcclxuXHRcdGNsZWFyOiBib29sZWFuID0gZmFsc2VcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgY2xlYXJcclxuXHRcdCMgLS0tIGNyZWF0ZXMgZGlyIGlmIGl0IGRvZXNuJ3QgZXhpc3RcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0ZW5zdXJlRGlyU3luYyBkaXJQYXRoXHJcblx0YXNzZXJ0IGlzRGlyKGRpclBhdGgpLCBcIkRpciBub3QgY3JlYXRlZDogI3tkaXJQYXRofVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGlmIGV4aXN0c1N5bmMoZGlyUGF0aCkgJiYgaXNEaXIoZGlyUGF0aClcclxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXHJcblx0ZWxzZVxyXG5cdFx0bWtEaXIgZGlyUGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHtyb290LCBsUGFydHN9IDo9IHBhdGhTdWJEaXJzIHBhdGhcclxuXHRsZXQgZGlyID0gcm9vdFxyXG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xyXG5cdFx0ZGlyICs9IFwiLyN7cGFydH1cIlxyXG5cdFx0bWtEaXIgZGlyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZzRXZlbnRLaW5kID0gJ2NyZWF0ZScgfCAnbW9kaWZ5JyB8ICdyZW1vdmUnXHJcbmV4cG9ydCBpc0V2ZW50S2luZCA6PSAoeDogdW5rbm93bik6IHggaXMgVEZzRXZlbnRLaW5kID0+XHJcblx0cmV0dXJuIChcclxuXHRcdCAgICh0eXBlb2YgeCA9PSAnc3RyaW5nJylcclxuXHRcdCYmIFsnY3JlYXRlJywnbW9kaWZ5JywncmVtb3ZlJ10uaW5jbHVkZXMgeFxyXG5cdFx0KVxyXG5cclxuZXhwb3J0IHR5cGUgVEZzRXZlbnRIYW5kbGVyID0gKFxyXG5cdGtpbmQ6IFRGc0V2ZW50S2luZCxcclxuXHRwYXRoOiBzdHJpbmdcclxuXHQpID0+IHZvaWQgfCBib29sZWFuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdhdGNoRmlsZXMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHR3YXRjaGVyQ0I6IFRGc0V2ZW50SGFuZGxlcixcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHZvaWQgLT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRvblN0b3A6IFRWb2lkRnVuY1xyXG5cdFx0ZGVib3VuY2VCeTogbnVtYmVyXHJcblx0XHR9XHJcblx0e29uU3RvcCwgZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLFxyXG5cdFx0b25TdG9wOiBwYXNzXHJcblx0XHRkZWJvdW5jZUJ5OiAzMDBcclxuXHJcblx0d2F0Y2hlciA6PSBEZW5vLndhdGNoRnMgcGF0aFxyXG5cclxuXHRzRXZlbnRzIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblxyXG5cdGZ1bmMgOj0gKCkgPT5cclxuXHRcdGZvciBldmVudFN0ciBvZiBzRXZlbnRzXHJcblx0XHRcdFtraW5kLCBwYXRoXSA6PSBldmVudFN0ci5zcGxpdCAnICcsIDJcclxuXHRcdFx0YXNzZXJ0IGlzRXZlbnRLaW5kKGtpbmQpLCBcIkJhZCBldmVudCBraW5kOiAje2tpbmR9XCJcclxuXHRcdFx0cmV0dmFsIDo9IHdhdGNoZXJDQiBraW5kLCB0b1JlbFBhdGgocGF0aClcclxuXHJcblx0XHRcdGlmIChyZXR2YWwgPT0gdHJ1ZSlcclxuXHRcdFx0XHR3YXRjaGVyLmNsb3NlKClcclxuXHRcdFx0XHRvblN0b3AoKVxyXG5cdFx0c0V2ZW50cy5jbGVhcigpXHJcblxyXG5cdHRyaWdnZXIgOj0gZGVib3VuY2UoZnVuYywgZGVib3VuY2VCeSlcclxuXHJcblx0Zm9yIGF3YWl0IGV2ZW50IG9mIHdhdGNoZXJcclxuXHRcdHtraW5kLCBwYXRoc30gOj0gZXZlbnRcclxuXHJcblx0XHQjIC0tLSBUcmFjayB1bmlxdWUgcGF0aHMgbW9kaWZpZWQgZHVyaW5nIHRoZSBib3VuY2Ugd2luZG93XHJcblx0XHRpZiBbJ2NyZWF0ZScsJ21vZGlmeScsJ3JlbW92ZSddLmluY2x1ZGVzIGtpbmRcclxuXHRcdFx0Zm9yIHBhdGggb2YgZXZlbnQucGF0aHNcclxuXHRcdFx0XHRzRXZlbnRzLmFkZCBcIiN7a2luZH0gI3twYXRofVwiXHJcblxyXG5cdFx0IyAtLS0gUmVmcmVzaCB0aGUgZGVib3VuY2UgdGltZXJcclxuXHRcdHRyaWdnZXIoKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXRjaEZpcnN0TGluZSA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRuZXdzdHI6IHN0cmluZ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHQjIC0tLSBSZXBsYWNlIHN0ciB3aXRoIG5ld3N0ciwgYnV0IG9ubHkgb24gZmlyc3QgbGluZVxyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXHJcblx0bmxQb3MgOj0gY29udGVudHMuaW5kZXhPZiBcIlxcblwiXHJcblx0c3RyUG9zIDo9IGNvbnRlbnRzLmluZGV4T2Ygc3RyXHJcblx0aWYgKHN0clBvcyAhPSAtMSkgJiYgKChubFBvcyA9PSAtMSkgfHwgKHN0clBvcyA8IG5sUG9zKSlcclxuXHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgY29udGVudHMucmVwbGFjZShzdHIsIG5ld3N0cilcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnJvbUpzb25GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiBoYXNoID0+XHJcblxyXG5cdGlmIGlzRmlsZShwYXRoKVxyXG5cdFx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcclxuXHRcdGlmIGlzRW1wdHkoY29udGVudHMpXHJcblx0XHRcdHJldHVybiB7fVxyXG5cdFx0cmVzdWx0IDo9IHBhcnNlSlNPTkMoY29udGVudHMpXHJcblx0XHRyZXR1cm4gZGVmaW5lZChyZXN1bHQpID8gcmVzdWx0IGFzIGhhc2ggOiB7fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB7fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pzb25GaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0ZGF0YTogaGFzaFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDMpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFkZEpzb25WYWx1ZSA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRoRGF0YSA6PSBmcm9tSnNvbkZpbGUocGF0aClcclxuXHRpZiBkZWZpbmVkKGhEYXRhKSAmJiBpc0hhc2goaERhdGEpXHJcblx0XHRoRGF0YVtrZXldID0gdmFsdWVcclxuXHRcdHRvSnNvbkZpbGUgcGF0aCwgaERhdGFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaW5TYW1lRGlyIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHR7ZGlyfSA6PSBwYXJzZVBhdGgocGF0aClcclxuXHRuZXdwYXRoIDo9IG1rcGF0aChkaXIsIGZpbGVOYW1lKVxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIG5ld3BhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVtb3ZlQ1IgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFxyJywgJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2x1cnAgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXHJcblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxyXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHNsdXJwQXN5bmMgOj0gYXN5bmMgKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRkYXRhIDo9IGF3YWl0IERlbm8ucmVhZFRleHRGaWxlIHBhdGhcclxuXHRyZXR1cm4gZGVmaW5lZChkYXRhKSA/IHJlbW92ZUNSKGRhdGEpIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3BsaXRQYXR0ZXJucyA6PSAoXHJcblx0XHRsUGF0dGVybnM6IHN0cmluZ1tdLFxyXG5cdFx0KTogW3N0cmluZ1tdLCBzdHJpbmdbXV0gPT5cclxuXHJcblx0dHlwZSBUQWNjdW0gPSBbc3RyaW5nW10sIHN0cmluZ1tdXVxyXG5cclxuXHRhY2MwOiBUQWNjdW0gOj0gW1tdLFtdXVxyXG5cdGFjY3VtIDo9IE1BUCBsUGF0dGVybnMsIGFjYzAsIChwYXQ6IHN0cmluZywgYWNjOiBUQWNjdW0pOiBUQWNjdW0gLT5cclxuXHRcdFtsUG9zLCBsTmVnXSA6PSBhY2NcclxuXHRcdGxNYXRjaGVzIDo9IHBhdC5tYXRjaCAvLy9eIFxcISBcXHMrICguKikgJC8vL1xyXG5cdFx0cmV0dXJuIChcclxuXHRcdFx0ICBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0XHQ/IFsgbFBvcywgICAgICAgICAgICAgIGxOZWcuY29uY2F0KGxNYXRjaGVzWzFdKV1cclxuXHRcdFx0OiBbIGxQb3MuY29uY2F0KHBhdCksICBsTmVnICAgICAgICAgICAgICAgICAgICBdXHJcblx0XHRcdClcclxuXHRyZXR1cm4gYWNjdW1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUGF0aEZpbHRlciA9IChwYXRoOiBzdHJpbmcpID0+IGJvb2xlYW5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaW5IaWRkZW5Gb2xkZXIgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aCA6PSBwYXJzZVBhdGgocGF0aClcclxuXHRyZXR1cm4gbWF0Y2hlcyhoLmRpciwgL1xcL1xcLi8pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRJdGVyYXRvclxyXG4jXHJcbiMgICAgVXNlIGxpa2U6XHJcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRmlsZXNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxQYXRocyA6PSBBcnJheS5mcm9tKGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpKVxyXG4jXHJcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSBEZW5vLmN3ZCgpXHJcbiMgICAgICAgICAgQnkgZGVmYXVsdCwgaWdub3JlcyBhbnkgZGlyZWN0b3JpZXMgc3RhcnRpbmcgd2l0aCAnLidcclxuXHJcbmV4cG9ydCBhbGxGaWxlc01hdGNoaW5nIDo9IChcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10sXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRkZWZhdWx0RmlsdGVyIDo9IChwYXRoOiBzdHJpbmcpOiBib29sZWFuID0+XHJcblx0XHRyZXR1cm4gbm90IGluSGlkZGVuRm9sZGVyKHBhdGgpXHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0cm9vdDogc3RyaW5nXHJcblx0XHRoTW9yZUdsb2JPcHRpb25zOiBoYXNoXHJcblx0XHRmaWx0ZXI6IFRQYXRoRmlsdGVyICAgICAjIHJldHVybiB0cnVlIHRvIGtlZXBcclxuXHRcdGluY2x1ZGVEaXJzOiBib29sZWFuXHJcblx0XHR9XHJcblxyXG5cdHtyb290LCBoTW9yZUdsb2JPcHRpb25zLCBmaWx0ZXIsIGluY2x1ZGVEaXJzXHJcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRyb290OiAnLidcclxuXHRcdFx0aE1vcmVHbG9iT3B0aW9uczoge31cclxuXHRcdFx0ZmlsdGVyOiBkZWZhdWx0RmlsdGVyXHJcblx0XHRcdGluY2x1ZGVEaXJzOiBmYWxzZVxyXG5cdFx0XHR9XHJcblxyXG5cdGhHbG9iT3B0aW9uczogaGFzaCA6PSB7XHJcblx0XHRyb290XHJcblx0XHRpbmNsdWRlRGlyc1xyXG5cdFx0Zm9sbG93U3ltbGlua3M6IGZhbHNlXHJcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHQuLi5oTW9yZUdsb2JPcHRpb25zXHJcblx0XHR9XHJcblxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gaXNTdHJpbmcobFBhdHRlcm5zKSA/IFtsUGF0dGVybnNdIDogbFBhdHRlcm5zXHJcblxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgaXNFbXB0eShsUG9zUGF0cylcclxuXHRcdHJldHVyblxyXG5cdGlmIG5vbkVtcHR5KGxOZWdQYXRzKVxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciBlbnRyeSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0cGF0aCA6PSBub3JtYWxpemVQYXRoKGVudHJ5LnBhdGgpXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRcdCAgIG5vdCBzZXRTa2lwLmhhcyhwYXRoKVxyXG5cdFx0XHRcdFx0JiYgZmlsdGVyKHBhdGgpXHJcblx0XHRcdFx0XHQpXHJcblx0XHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0XHRMT0cgXCJQQVRIOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0cGF0dGVybjogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcclxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxyXG5cdGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcocGF0dGVybiwgaE9wdGlvbnMpXHJcblx0XHRhd2FpdCBEZW5vLnJlbW92ZSBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbmRGaWxlIDo9IChcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHN0cmluZz8gPT5cclxuXHJcblx0IyAtLS0gTk9URTogYWxsRmlsZXNNYXRjaGluZygpIHJldHVybnMgbm9ybWFsaXplZCBwYXRoc1xyXG5cclxuXHRsUGF0aHMgOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nIFwiKiovI3tmaWxlTmFtZX1cIiwgaE9wdGlvbnNcclxuXHREQkdWQUxVRSBsUGF0aHMsICdsUGF0aHMnXHJcblx0c3dpdGNoIGxQYXRocy5sZW5ndGhcclxuXHRcdGNhc2UgMTpcclxuXHRcdFx0cGF0aCA6PSBsUGF0aHNbMF1cclxuXHRcdFx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0wocGF0aCl9XCJcclxuXHRcdFx0cmV0dXJuIHBhdGhcclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRsTGluZXMgOj0gW1wiTXVsdGlwbGUgZmlsZXMgd2l0aCBuYW1lICN7ZmlsZU5hbWV9OlwiXVxyXG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcclxuXHRcdFx0XHRsTGluZXMucHVzaCBwYXRoXHJcblx0XHRcdGNyb2FrIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cdFx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZERpciA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdGxQYXRocyA6PSBBcnJheS5mcm9tIGFsbERpcnNNYXRjaGluZyBcIioqLyN7ZmlsZU5hbWV9XCIsIGhPcHRpb25zXHJcblx0REJHVkFMVUUgbFBhdGhzLCAnbFBhdGhzJ1xyXG5cdHN3aXRjaCBsUGF0aHMubGVuZ3RoXHJcblx0XHRjYXNlIDE6XHJcblx0XHRcdHJldHVybiBsUGF0aHNbMF1cclxuXHRcdGNhc2UgMDpcclxuXHRcdFx0cmV0dXJuIHVuZGVmXHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRsTGluZXMgOj0gW1wiTXVsdGlwbGUgZGlycyB3aXRoIG5hbWUgI3tmaWxlTmFtZX06XCJdXHJcblx0XHRcdGZvciBwYXRoIG9mIGxQYXRoc1xyXG5cdFx0XHRcdGxMaW5lcy5wdXNoIHBhdGhcclxuXHRcdFx0Y3JvYWsgbExpbmVzLmpvaW4oJ1xcbicpXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuI1xyXG4jICAgIFVzZSBsaWtlOlxyXG4jICAgICAgIGZvciBwYXRoIG9mIGFsbERpcnNNYXRjaGluZyhsUGF0cylcclxuIyAgICAgICAgICBPUlxyXG4jICAgICAgIGxEaXJzIDo9IEFycmF5LmZyb20oYWxsRGlyc01hdGNoaW5nKGxQYXRzKSlcclxuXHJcbmV4cG9ydCBhbGxEaXJzTWF0Y2hpbmcgOj0gKFxyXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGRlZmF1bHRGaWx0ZXIgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHRcdHJldHVybiBub3QgaW5IaWRkZW5Gb2xkZXIocGF0aClcclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRyb290OiBzdHJpbmdcclxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2hcclxuXHRcdGZpbHRlcjogVFBhdGhGaWx0ZXJcclxuXHRcdH1cclxuXHJcblx0e3Jvb3QsIGhNb3JlR2xvYk9wdGlvbnMsIGZpbHRlcixcclxuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdHJvb3Q6ICcuJ1xyXG5cdFx0XHRoTW9yZUdsb2JPcHRpb25zOiB7fVxyXG5cdFx0XHRmaWx0ZXI6IGRlZmF1bHRGaWx0ZXJcclxuXHRcdFx0fVxyXG5cclxuXHRoR2xvYk9wdGlvbnM6IGhhc2ggOj0ge1xyXG5cdFx0cm9vdFxyXG5cdFx0aW5jbHVkZURpcnM6IHRydWVcclxuXHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZVxyXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xyXG5cdFx0fVxyXG5cdGxBbGxQYXR0ZXJuczogc3RyaW5nW10gOj0gKFxyXG5cdFx0ICBpc1N0cmluZyhsUGF0dGVybnMpXHJcblx0XHQ/IFtsUGF0dGVybnNdXHJcblx0XHQ6IGxQYXR0ZXJuc1xyXG5cdFx0KVxyXG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbEFsbFBhdHRlcm5zXHJcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxyXG5cdFx0aEdsb2JPcHRpb25zLmV4Y2x1ZGUgPSBsTmVnUGF0c1xyXG5cdGlmIGRlYnVnZ2luZ1xyXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcclxuXHRcdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxyXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xyXG5cdFx0XHRMT0cgXCIgICBORUc6ICN7cGF0fVwiXHJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcclxuXHRcdGZvciBlbnRyeSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcclxuXHRcdFx0cGF0aCA6PSBub3JtYWxpemVQYXRoKGVudHJ5LnBhdGgpXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRcdCAgIG5vdCBzZXRTa2lwLmhhcyhwYXRoKVxyXG5cdFx0XHRcdFx0JiYgZmlsdGVyKHBhdGgpXHJcblx0XHRcdFx0XHQmJiBpc0RpcihwYXRoKVxyXG5cdFx0XHRcdFx0KVxyXG5cdFx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdFx0TE9HIFwiRElSOiAje3BhdGh9XCJcclxuXHRcdFx0XHR5aWVsZCBwYXRoXHJcblx0XHRcdFx0c2V0U2tpcC5hZGQgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gcmV0dXJucyBmYWxzZSBpZiBmaWxlIGRvZXNuJ3QgZXhpc3RcclxuXHJcbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgaXNGaWxlKHBhdGgpXHJcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxyXG5cdFx0cmV0dXJuIHRydWVcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcm1EaXIgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGNsZWFyOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2NsZWFyfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNsZWFyOiBmYWxzZVxyXG5cdFx0fVxyXG5cclxuXHRpZiBleGlzdHNTeW5jKHBhdGgpXHJcblx0XHRhc3NlcnQgaXNEaXIocGF0aCksIFwiTm90IGEgZGlyZWN0b3J5OiAje3BhdGh9XCJcclxuXHRcdGlmIGNsZWFyXHJcblx0XHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoLCByZWN1cnNpdmU6IHRydWVcclxuXHRcdGVsc2VcclxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ1dyaXRhYmxlRmlsZVxyXG5cclxuXHRwYXRoOiBzdHJpbmdcclxuXHRmaWxlOiBEZW5vLkZzRmlsZVxyXG5cclxuXHRjb25zdHJ1Y3RvcihAcGF0aDogc3RyaW5nLCBoT3B0aW9uczogaGFzaCA9IHt9KVxyXG5cclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRhcHBlbmQ6IGJvb2xlYW5cclxuXHRcdFx0fVxyXG5cdFx0e2FwcGVuZH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGFwcGVuZDogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRcdEBmaWxlID0gRGVuby5vcGVuU3luYyBAcGF0aCwge1xyXG5cdFx0XHR3cml0ZTogdHJ1ZVxyXG5cdFx0XHRjcmVhdGU6IHRydWVcclxuXHRcdFx0dHJ1bmNhdGU6IG5vdCBhcHBlbmRcclxuXHRcdFx0fVxyXG5cclxuXHR3cml0ZShzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0d3JpdGVsbihzdHI6IHN0cmluZylcclxuXHRcdGF3YWl0IEBmaWxlLndyaXRlIGVuY29kZShzdHIgKyAnXFxuJylcclxuXHRcdHJldHVyblxyXG5cclxuXHRjbG9zZSgpXHJcblx0XHRAZmlsZS5jbG9zZSgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENSZWFkYWJsZUZpbGVcclxuXHJcblx0cGF0aDogc3RyaW5nXHJcblx0aW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdGhNZXRhRGF0YTogaGFzaCA9IHt9XHJcblx0aXRlcjogVEFzeW5jSXRlcmF0b3I8c3RyaW5nLHZvaWQsdm9pZD4gPSBnZXRFbXB0eUFzeW5jSXRlcmF0b3I8c3RyaW5nPigpXHJcblx0Zmlyc3RMaW5lOiBzdHJpbmc/ID0gdW5kZWZcclxuXHJcblx0Y29uc3RydWN0b3IoQHBhdGg6IHN0cmluZylcclxuXHJcblx0aW5pdCgpOiB2b2lkXHJcblxyXG5cdFx0YXNzZXJ0IGlzRmlsZShAcGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje0BwYXRofVwiXHJcblx0XHRAaXRlciA6PSBhbGxMaW5lc0luRmlsZShAcGF0aClcclxuXHJcblx0XHQjIC0tLSB3ZSBuZWVkIHRvIGdldCB0aGUgZmlyc3QgbGluZSB0byBjaGVjayBpZlxyXG5cdFx0IyAgICAgdGhlcmUncyBtZXRhIGRhdGEuIEJ1dCBpZiB0aGVyZSBpcyBub3QsXHJcblx0XHQjICAgICB3ZSBuZWVkIHRvIHJldHVybiBpdCBieSB0aGUgcmVhZGVyXHJcblxyXG5cdFx0bGV0IHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0QGZpcnN0TGluZSA9IHVuZGVmXHJcblx0XHRlbHNlXHJcblx0XHRcdG9idmlvdXNseSBkZWZpbmVkKHZhbHVlKVxyXG5cdFx0XHRAZmlyc3RMaW5lID0gdmFsdWVcclxuXHRcdFx0IyAtLS0gR2V0IG1ldGEgZGF0YSBpZiBwcmVzZW50XHJcblx0XHRcdEBoTWV0YURhdGEgPSAoXHJcblx0XHRcdFx0aWYgaXNNZXRhRGF0YVN0YXJ0KHZhbHVlKVxyXG5cdFx0XHRcdFx0bE1ldGFMaW5lczogc3RyaW5nW10gOj0gW11cclxuXHRcdFx0XHRcdHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdFx0XHRcdHdoaWxlIG5vdCBkb25lICYmICh2YWx1ZSAhPSBAZmlyc3RMaW5lKVxyXG5cdFx0XHRcdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh2YWx1ZSlcclxuXHRcdFx0XHRcdFx0bE1ldGFMaW5lcy5wdXNoIHZhbHVlXHJcblx0XHRcdFx0XHRcdHt2YWx1ZSwgZG9uZX0gPSBhd2FpdCBAaXRlci5uZXh0KClcclxuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PSBAZmlyc3RMaW5lKVxyXG5cdFx0XHRcdFx0XHRvYnZpb3VzbHkgZGVmaW5lZCh2YWx1ZSlcclxuXHRcdFx0XHRcdFx0QGZpcnN0TGluZSA9IHVuZGVmXHJcblx0XHRcdFx0XHRcdGdldE1ldGFEYXRhSGFzaCh2YWx1ZSwgYXJyYXlUb0Jsb2NrKGxNZXRhTGluZXMpKVxyXG5cdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHR7fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHt9XHJcblx0XHRcdFx0KVxyXG5cdFx0QGluaXRpYWxpemVkID0gdHJ1ZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdG1ldGFEYXRhKCk6IGhhc2hcclxuXHJcblx0XHRpZiBub3QgQGluaXRpYWxpemVkXHJcblx0XHRcdGF3YWl0IEBpbml0KClcclxuXHRcdHJldHVybiBAaE1ldGFEYXRhXHJcblxyXG5cdGdldExpbmUoKTogc3RyaW5nP1xyXG5cclxuXHRcdGlmIG5vdCBAaW5pdGlhbGl6ZWRcclxuXHRcdFx0YXdhaXQgQGluaXQoKVxyXG5cdFx0aWYgZGVmaW5lZChAZmlyc3RMaW5lKVxyXG5cdFx0XHRzdHIgOj0gQGZpcnN0TGluZVxyXG5cdFx0XHRAZmlyc3RMaW5lID0gdW5kZWZcclxuXHRcdFx0cmV0dXJuIHN0clxyXG5cclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gYXdhaXQgQGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdHJldHVybiB1bmRlZlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gdmFsdWUgYXMgc3RyaW5nXHJcblxyXG5cdGdldENvbnRlbnRzKCk6IHN0cmluZ1xyXG5cclxuXHRcdGlmIG5vdCBAaW5pdGlhbGl6ZWRcclxuXHRcdFx0YXdhaXQgQGluaXQoKVxyXG5cdFx0bExpbmVzOiBzdHJpbmdbXSA6PSBbXVxyXG5cdFx0bGV0IGxpbmUgPSBhd2FpdCBAZ2V0TGluZSgpXHJcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXHJcblx0XHRcdGxMaW5lcy5wdXNoIGxpbmVcclxuXHRcdFx0bGluZSA9IGF3YWl0IEBnZXRMaW5lKClcclxuXHRcdHJldHVybiBsTGluZXMuam9pbignXFxuJylcclxuIl19