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

import {croak} from 'croak'
import {
	undef, defined, notdefined, assert, obviously,
	isEmpty, nonEmpty, isString, isNonEmptyString,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {MAP} from 'mapper'
import {
	getOptions, pass, encode, spaces,
	sinceLoadStr, sleep, arrayToBlock,
	} from 'llutils'
import {isMetaDataStart, convertMetaData} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, ML} from 'to-nice'
import {
	pushLogLevel, popLogLevel, LOG, DBG, WARN, ERR,
	INDENT, UNDENT, DBGVALUE,
	} from 'logger'

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

export type TFileStats = {
	isFile: boolean
	isDirectory: boolean
	isSymlink: boolean
	mtime: (Date | undefined)
	}

export const getFileStats = (path: string): TFileStats => {

	if (path === 'ext:core/01_core.js') {
		return {
			isFile: false,
			isDirectory: false,
			isSymlink: false,
			mtime: undef
			}
	}
	const hStats = Deno.statSync(path)
	return {
		isFile: hStats.isFile,
		isDirectory: hStats.isDirectory,
		isSymlink: hStats.isSymlink,
		mtime: hStats.mtime || undef
		}
}

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
// ASYNC GENERATOR

export const allLinesIn = async function*(
		path: string
		): AsyncGenerator<string> {

	assert(isFile(path), `No such file: ${OL(path)} (allLinesIn)`)
	const f = await Deno.open(path)
	const readable = (f.readable
			.pipeThrough(new TextDecoderStream())
			.pipeThrough(new TextLineStream())
			)
	for await (const line of readable) {
		yield line
	}
	return
}

// ---------------------------------------------------------------------------

export const pathToURL = (...lParts: string[]): string => {

	const path = resolve(...lParts)
	return new URL('file:' + path).href.replaceAll('\\', '/')
}

// ---------------------------------------------------------------------------

export const normalizePath = (path: string): string => {

	if (isEmpty(path)) {
		return ''
	}

	const npath = path.replaceAll('\\', '/')
	if (npath.charAt(1) === ':') {
		return npath.charAt(0).toUpperCase() + npath.substring(1)
	}
	else {
		return npath
	}
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

	return relpath(fromFileUrl(url))
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

export const isExt = (str: string): boolean => {

	return /^\.[A-Za-z0-9_]+$/.test(str)
}

// ---------------------------------------------------------------------------

export const newerDestFileExists = (
		srcPath: string,
		destPath: string    // --- can be a file extension
		): boolean => {

	// --- source file must exist
	assert(isFile(srcPath), `No such file: ${OL(srcPath)}`)

	// --- allow passing a file extension for 2nd argument
	if (isExt(destPath)) {
		destPath = withExt(srcPath, destPath)
	}

	try {
		assert(existsSync(destPath))
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

export const fileExt = (path: string): string => {

	const lMatches = path.match(/\.[^\.]+$/)
	return lMatches ? lMatches[0] : ''
}

// ---------------------------------------------------------------------------

export const withExt = (path: string, ext: string): string => {

	assert(ext.startsWith('.'), `Bad file extension: ${ext}`)
	const pos = path.lastIndexOf('.')
	assert((pos >= 0), `path contains no period: ${path}`)
	return normalizePath(path.substring(0, pos) + ext)
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
		root: './src',
		lIgnoreDirs: ['temp']
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

export const relpath = (
		path: string,
		root: string = Deno.cwd()
		): string => {

	return normalizePath(relative(root, path))
}

// ---------------------------------------------------------------------------

export const toFullPath = (path: string): string => {

	return normalizePath(resolve('.', path))
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

export const configFromFile = async (fileName: string): AutoPromise<hash> => {

	const path = findFile(fileName)
	assert(defined(path), `No such file: ${OL(fileName)}`)
	const {purpose, ext} = parsePath(path)
	assert((purpose === 'config'), `Not a config file: ${OL(path)}`)
	assert((ext === '.ts'), `Config file not TypeScript: ${OL(path)}`)
	DBG(`Import config from ${OL(path)}`)
	const url = pathToFileURL(path)
	DBGVALUE('url', url)
	return await import(url)
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvZnN5cy5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSxpQkFBZ0I7QUFDaEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzlDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUN2RCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUM1QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzNELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUN0QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN4QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNsRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxR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QUFHLENBQUEsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNqQixBQUFBLEVBQUUsTUFBTSxDQUFDLEU7Q0FBRSxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUNuQyxBQUFBLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUE7QUFDNUIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDO0NBQUMsQ0FBQTtBQUMzRCxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsTUFBTSxDQUFDLEs7Q0FBSyxDO0FBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLE1BQU0sQyxDLENBQUMsQUFBQyxNLFksQ0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLENBQUMsUUFBUTtBQUNULEFBQUEsQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEdBQUcsQ0FBQSxBQUFDLE1BQU0sQ0FBQyxDQUFLLFEsQ0FBSixDQUFDLENBQUMsQ0FBQyxDQUFHLENBQUE7QUFDM0MsQUFBQSxFQUFFLEdBQUcsQ0FBQSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsR0FBRyxTQUFTLENBQUEsQUFB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USxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxJQUFJLENBQUE7QUFDTixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQyxDQUFLLENBQUMsS0FBMUIsQ0FBK0IsQ0FBQTtBQUN4RCxBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEMsQ0FBQyxDLENBQUssQ0FBQyxLQUFoQyxDQUFxQztBQUMxRCxDQUFDLEM7QUFBQyxDQUFBO0FBQ0YsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFRLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ25CLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUEsQUFBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEM7QUFBQSxDQUFBO0FBQzFDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUM5QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0s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LENBQWUsTUFBZCxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDakMsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsT0FBTyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMvRCxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2pFLEFBQUEsQ0FBQyxHQUFHLENBQUEsQUFBQyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDckMsQUFBQSxDQUFJLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxhQUFhLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDMUIsQUFBQSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUNwQixBQUFBLENBQUMsTUFBTSxDQUFDLEtBQUssQyxNQUFPLENBQUEsQUFBQyxHQUFHLEM7QUFBQSxDQUFBO0FBQ3hCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGZzeXMubGliLmNpdmV0XG5cbmltcG9ydCB7cGFyc2U6IHBhcnNlRmlsZVBhdGh9IGZyb20gJ25vZGUtcGF0aCdcbmltcG9ydCB7cGFyc2U6IHBhcnNlSlNPTkMsIEpzb25WYWx1ZX0gZnJvbSAnQHN0ZC9qc29uYydcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJ0BzdGQvYXN5bmMvZGVib3VuY2UnXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcbmltcG9ydCB7YXBwZW5kRmlsZVN5bmMsIG9wZW5TeW5jLCBjbG9zZVN5bmN9IGZyb20gJ25vZGUtZnMnXG5pbXBvcnQge3BhdGhUb0ZpbGVVUkx9IGZyb20gJ25vZGUtdXJsJ1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJ9IGZyb20gJ25vZGUtZXZlbnRzJ1xuaW1wb3J0IE5SZWFkTGluZXMgZnJvbSAnbnBtLW4tcmVhZGxpbmVzJ1xuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcydcbmltcG9ydCB7XG5cdHBhcnNlLCByZXNvbHZlLCByZWxhdGl2ZSwgZnJvbUZpbGVVcmwsXG5cdH0gZnJvbSAnQHN0ZC9wYXRoJ1xuXG5pbXBvcnQge2Nyb2FrfSBmcm9tICdjcm9haydcbmltcG9ydCB7XG5cdHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBhc3NlcnQsIG9idmlvdXNseSxcblx0aXNFbXB0eSwgbm9uRW1wdHksIGlzU3RyaW5nLCBpc05vbkVtcHR5U3RyaW5nLFxuXHRpc0Jvb2xlYW4sIGlzTnVtYmVyLCBpc0ludGVnZXIsIGlzQXJyYXksIGlzQXJyYXlPZlN0cmluZ3MsXG5cdGlzSGFzaCwgaXNSZWdFeHAsIGludGVnZXIsIGhhc2gsIGhhc2hvZiwgVFZvaWRGdW5jLFxuXHR9IGZyb20gJ2RhdGF0eXBlcydcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXG5pbXBvcnQge1xuXHRnZXRPcHRpb25zLCBwYXNzLCBlbmNvZGUsIHNwYWNlcyxcblx0c2luY2VMb2FkU3RyLCBzbGVlcCwgYXJyYXlUb0Jsb2NrLFxuXHR9IGZyb20gJ2xsdXRpbHMnXG5pbXBvcnQge2lzTWV0YURhdGFTdGFydCwgY29udmVydE1ldGFEYXRhfSBmcm9tICdtZXRhLWRhdGEnXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXG5pbXBvcnQge09MLCBNTH0gZnJvbSAndG8tbmljZSdcbmltcG9ydCB7XG5cdHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsIExPRywgREJHLCBXQVJOLCBFUlIsXG5cdElOREVOVCwgVU5ERU5ULCBEQkdWQUxVRSxcblx0fSBmcm9tICdsb2dnZXInXG5cbiMgLS0tIENyZWF0ZSBhIGZ1bmN0aW9uIGNhcGFibGUgb2Ygc3luY2hyb25vdXNseVxuIyAgICAgaW1wb3J0aW5nIEVTTSBtb2R1bGVzXG5cbkRlbm8gOj0gZ2xvYmFsVGhpcy5EZW5vXG50eXBlIEZzRXZlbnQgPSBEZW5vLkZzRXZlbnRcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgRGVuby5GaWxlSW5mbyBoYXM6XG4jICAgIGlzRmlsZSAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHJlZ3VsYXIgZmlsZS5cbiMgICAgaXNEaXJlY3RvcnkgKGJvb2xlYW4pOiBUcnVlIGlmIGl0J3MgYSBkaXJlY3RvcnkuXG4jICAgIGlzU3ltbGluayAoYm9vbGVhbik6IFRydWUgaWYgaXQncyBhIHN5bWxpbmsuXG4jICAgIHNpemUgKG51bWJlcik6IEZpbGUgc2l6ZSBpbiBieXRlcy5cbiMgICAgbXRpbWUgKERhdGUgfCBudWxsKTogTW9kaWZpY2F0aW9uIHRpbWUuXG4jICAgIGF0aW1lIChEYXRlIHwgbnVsbCk6IExhc3QgYWNjZXNzIHRpbWUuXG4jICAgIGJpcnRodGltZSAoRGF0ZSB8IG51bGwpOiBDcmVhdGlvbiB0aW1lIChub3QgYXZhaWxhYmxlIG9uIGFsbCBwbGF0Zm9ybXMpLlxuIyAgICBtb2RlIChudW1iZXIgfCBudWxsKTogUGVybWlzc2lvbnMgKFBPU0lYIG9ubHkpLlxuIyAgICB1aWQgLyBnaWQgKG51bWJlciB8IG51bGwpOiBPd25lci9ncm91cCBJRCAoUE9TSVggb25seSlcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIFRGaWxlU3RhdHMgPSB7XG5cdGlzRmlsZTogYm9vbGVhblxuXHRpc0RpcmVjdG9yeTogYm9vbGVhblxuXHRpc1N5bWxpbms6IGJvb2xlYW5cblx0bXRpbWU6IERhdGU/XG5cdH1cblxuZXhwb3J0IGdldEZpbGVTdGF0cyA6PSAocGF0aDogc3RyaW5nKTogVEZpbGVTdGF0cyA9PlxuXG5cdGlmIChwYXRoID09ICdleHQ6Y29yZS8wMV9jb3JlLmpzJylcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNGaWxlOiBmYWxzZVxuXHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlXG5cdFx0XHRpc1N5bWxpbms6IGZhbHNlXG5cdFx0XHRtdGltZTogdW5kZWZcblx0XHRcdH1cblx0aFN0YXRzIDo9IERlbm8uc3RhdFN5bmMgcGF0aFxuXHRyZXR1cm4ge1xuXHRcdGlzRmlsZTogaFN0YXRzLmlzRmlsZVxuXHRcdGlzRGlyZWN0b3J5OiBoU3RhdHMuaXNEaXJlY3Rvcnlcblx0XHRpc1N5bWxpbms6IGhTdGF0cy5pc1N5bWxpbmtcblx0XHRtdGltZTogaFN0YXRzLm10aW1lIHx8IHVuZGVmXG5cdFx0fVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLyoqXG4gKiByZXR1cm5zIG9uZSBvZjpcbiAqICAgICdtaXNzaW5nJyAgLSBkb2VzIG5vdCBleGlzdFxuICogICAgJ2RpcicgICAgICAtIGlzIGEgZGlyZWN0b3J5XG4gKiAgICAnZmlsZScgICAgIC0gaXMgYSBmaWxlXG4gKiAgICAnc3ltbGluaycgIC0gaXMgYSBzeW1saW5rXG4gKiAgICAndW5rbm93bicgIC0gZXhpc3RzLCBidXQgbm90IGEgZmlsZSwgZGlyZWN0b3J5IG9yIHN5bWxpbmtcbiAqL1xuXG5leHBvcnQgdHlwZSBUUGF0aFR5cGUgPSAnbWlzc2luZycgfCAnZmlsZScgfCAnZGlyJyB8ICdzeW1saW5rJyB8ICd1bmtub3duJ1xuXG5leHBvcnQgZ2V0UGF0aFR5cGUgOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoVHlwZSA9PlxuXG5cdGFzc2VydCBpc1N0cmluZyhwYXRoKSwgXCJub3QgYSBzdHJpbmc6ICN7T0wocGF0aCl9XCJcblx0aWYgbm90IGV4aXN0c1N5bmMocGF0aClcblx0XHRyZXR1cm4gJ21pc3NpbmcnXG5cdGggOj0gZ2V0RmlsZVN0YXRzIHBhdGhcblx0cmV0dXJuIChcblx0XHQgIGguaXNGaWxlICAgICAgICAgPyAnZmlsZSdcblx0XHQ6IGguaXNEaXJlY3RvcnkgICAgPyAnZGlyJ1xuXHRcdDogICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xuXHRcdClcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGlzU3R1YiA6PSAoc3RyOiBzdHJpbmcpOiBib29sZWFuID0+XG5cblx0IyAtLS0gYSBzdHViIGNhbm5vdCBjb250YWluIGFueSBvZiAnXFxcXCcsICcvJ1xuXHRyZXR1cm4gbm90ZGVmaW5lZChzdHIubWF0Y2ggL1tcXFxcXFwvXS8pICYmIChzdHJbMF0gIT0gJy4nKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgdG91Y2ggOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cblxuXHRmZCA6PSBvcGVuU3luYyhwYXRoLCAnYScpXG5cdGNsb3NlU3luYyhmZClcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEFTWU5DIEdFTkVSQVRPUlxuXG5leHBvcnQgYWxsTGluZXNJbiA6PSAoXG5cdFx0cGF0aDogc3RyaW5nXG5cdFx0KTogQXN5bmNHZW5lcmF0b3I8c3RyaW5nPiAtPlxuXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje09MKHBhdGgpfSAoYWxsTGluZXNJbilcIlxuXHRmIDo9IGF3YWl0IERlbm8ub3BlbiBwYXRoXG5cdHJlYWRhYmxlIDo9IChmLnJlYWRhYmxlXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHREZWNvZGVyU3RyZWFtKCkpXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHRMaW5lU3RyZWFtKCkpXG5cdFx0XHQpXG5cdGZvciBhd2FpdCBsaW5lIG9mIHJlYWRhYmxlXG5cdFx0eWllbGQgbGluZVxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHBhdGhUb1VSTCA6PSAoLi4ubFBhcnRzOiBzdHJpbmdbXSk6IHN0cmluZyA9PlxuXG5cdHBhdGggOj0gcmVzb2x2ZSAuLi5sUGFydHNcblx0cmV0dXJuIG5ldyBVUkwoJ2ZpbGU6JyArIHBhdGgpLmhyZWYucmVwbGFjZUFsbCgnXFxcXCcsICcvJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IG5vcm1hbGl6ZVBhdGggOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxuXG5cdGlmIGlzRW1wdHkocGF0aClcblx0XHRyZXR1cm4gJydcblxuXHRucGF0aCA6PSBwYXRoLnJlcGxhY2VBbGwgJ1xcXFwnLCAnLydcblx0aWYgKG5wYXRoLmNoYXJBdCgxKSA9PSAnOicpXG5cdFx0cmV0dXJuIG5wYXRoLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbnBhdGguc3Vic3RyaW5nKDEpXG5cdGVsc2Vcblx0XHRyZXR1cm4gbnBhdGhcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IG1rcGF0aCA6PSAoLi4ubFBhcnRzOiBzdHJpbmc/W10pOiBzdHJpbmcgPT5cblxuXHRkZWJ1Z2dlclxuXHRsVXNlUGFydHMgOj0gQXJyYXkuZnJvbSBNQVAgbFBhcnRzLCAoeCkgLT5cblx0XHRpZiBub25FbXB0eSh4KVxuXHRcdFx0b2J2aW91c2x5IGRlZmluZWQoeClcblx0XHRcdCMgLS0tIFJlbW92ZSBhbnkgbGVhZGluZyBvciB0cmFpbGluZyBzbGFzaGVzLFxuXHRcdFx0IyAgICAgZXZlbiBpZiBsZWFkaW5nIHNsYXNoIGlzIHByZWNlZGVkIGJ5ICcuJ1xuXHRcdFx0bE1hdGNoZXMgOj0geC5tYXRjaCAvLy9eXG5cdFx0XHRcdCg/OlxuXHRcdFx0XHRcdFxcLj8gW1xcXFxcXC9dXG5cdFx0XHRcdFx0KT9cblx0XHRcdFx0KC4qPylcblx0XHRcdFx0W1xcXFxcXC9dP1xuXHRcdFx0XHQkLy8vXG5cdFx0XHRpZiBkZWZpbmVkKGxNYXRjaGVzKVxuXHRcdFx0XHR5aWVsZCBsTWF0Y2hlc1sxXVxuXHRcdHJldHVyblxuXG5cdHJldHVybiBub3JtYWxpemVQYXRoIGxVc2VQYXJ0cy5qb2luKCcvJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgVFBhdGhEZXNjID0ge1xuXHRkaXI6IHN0cmluZ1xuXHRyb290OiBzdHJpbmdcblx0bFBhcnRzOiBzdHJpbmdbXVxuXHR9XG5cbmV4cG9ydCBwYXRoU3ViRGlycyA6PSAoXG5cdFx0cGF0aDogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBUUGF0aERlc2MgPT5cblxuXHRwYXRoID0gdG9GdWxsUGF0aChwYXRoKVxuXHR7cm9vdCwgZGlyfSA6PSBwYXJzZSBwYXRoXG5cdHJldHVybiB7XG5cdFx0ZGlyXG5cdFx0cm9vdFxuXHRcdGxQYXJ0czogZGlyLnNsaWNlKHJvb3QubGVuZ3RoKS5zcGxpdCgvW1xcXFxcXC9dLylcblx0XHR9XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIC0tLSBTaG91bGQgYmUgY2FsbGVkIGxpa2U6IG15c2VsZihpbXBvcnQubWV0YS51cmwpXG4jICAgICByZXR1cm5zIGZ1bGwgcGF0aCBvZiBjdXJyZW50IGZpbGVcblxuZXhwb3J0IG15c2VsZiA6PSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gcmVscGF0aCBmcm9tRmlsZVVybCB1cmxcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGJhcmYgOj0gKFxuXHRcdHBhdGg6IHN0cmluZyxcblx0XHRjb250ZW50czogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiB2b2lkID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0YXBwZW5kOiBib29sZWFuXG5cdFx0fVxuXHR7YXBwZW5kfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0fVxuXHRta0RpcnNGb3JGaWxlIHBhdGhcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcblx0aWYgYXBwZW5kICYmIGlzRmlsZShwYXRoKVxuXHRcdGFwcGVuZEZpbGVTeW5jIHBhdGgsIGRhdGFcblx0ZWxzZVxuXHRcdERlbm8ud3JpdGVGaWxlU3luYyBwYXRoLCBkYXRhXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcblx0XHRjb250ZW50czogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBzdHJpbmcgPT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRleHQ6IHN0cmluZ1xuXHRcdH1cblx0e2V4dH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0ZXh0OiAnLmNpdmV0J1xuXHRcdH1cblx0dGVtcEZpbGVQYXRoIDo9IERlbm8ubWFrZVRlbXBGaWxlU3luYyBzdWZmaXg6IGV4dFxuXHRiYXJmIHRlbXBGaWxlUGF0aCwgY29udGVudHNcblx0cmV0dXJuIHRlbXBGaWxlUGF0aFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaXNFeHQgOj0gKHN0cjogc3RyaW5nKTogYm9vbGVhbiA9PlxuXG5cdHJldHVybiAvXlxcLltBLVphLXowLTlfXSskLy50ZXN0IHN0clxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cblx0XHQpOiBib29sZWFuID0+XG5cblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxuXHRhc3NlcnQgaXNGaWxlKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChzcmNQYXRoKX1cIlxuXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XG5cdGlmIGlzRXh0KGRlc3RQYXRoKVxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcblxuXHR0cnlcblx0XHRhc3NlcnQgZXhpc3RzU3luYyhkZXN0UGF0aClcblx0XHRkZXN0bXMgOj0gZ2V0RmlsZVN0YXRzKGRlc3RQYXRoKS5tdGltZVxuXHRcdGFzc2VydCBkZWZpbmVkKGRlc3Rtcylcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXG5cdFx0YXNzZXJ0IGRlZmluZWQoc3JjbXMpXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcblx0Y2F0Y2ggZXJyXG5cdFx0cmV0dXJuIGZhbHNlXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBta0RpciA6PSAoXG5cdFx0ZGlyUGF0aDogc3RyaW5nLFxuXHRcdGNsZWFyOiBib29sZWFuID0gZmFsc2Vcblx0XHQpOiB2b2lkID0+XG5cblx0aWYgY2xlYXJcblx0XHQjIC0tLSBjcmVhdGVzIGRpciBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcblx0ZWxzZVxuXHRcdGVuc3VyZURpclN5bmMgZGlyUGF0aFxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IG1rRGlyc0ZvckZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cblxuXHR7cm9vdCwgbFBhcnRzfSA6PSBwYXRoU3ViRGlycyBwYXRoXG5cdGxldCBkaXIgPSByb290XG5cdGZvciBwYXJ0IG9mIGxQYXJ0c1xuXHRcdGRpciArPSBcIi8je3BhcnR9XCJcblx0XHRpZiBub3QgaXNEaXIoZGlyKVxuXHRcdFx0bWtEaXIgZGlyXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY2xlYXJEaXIgOj0gKGRpclBhdGg6IHN0cmluZyk6IHZvaWQgPT5cblxuXHRpZiBleGlzdHNTeW5jKGRpclBhdGgpICYmIGlzRGlyKGRpclBhdGgpXG5cdFx0ZW1wdHlEaXJTeW5jIGRpclBhdGhcblx0ZWxzZVxuXHRcdG1rRGlyIGRpclBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIFRGc0V2ZW50SGFuZGxlciA9IChraW5kOiBzdHJpbmcsIHBhdGg6IHN0cmluZykgPT4gdm9pZCB8IGJvb2xlYW5cbi8qKlxuICogY2xhc3MgRmlsZUV2ZW50SGFuZGxlclxuICogICAgaGFuZGxlcyBmaWxlIGNoYW5nZWQgZXZlbnRzIHdoZW4gLmhhbmRsZShmc0V2ZW50KSBpcyBjYWxsZWRcbiAqICAgIGNhbGxiYWNrIGlzIGEgZnVuY3Rpb24sIGRlYm91bmNlZCBieSAyMDAgbXNcbiAqICAgICAgIHRoYXQgdGFrZXMgYW4gRnNFdmVudCBhbmQgcmV0dXJucyBhIFRWb2lkRnVuY1xuICogICAgICAgd2hpY2ggd2lsbCBiZSBjYWxsZWQgaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgYSBmdW5jdGlvbiByZWZlcmVuY2VcbiAqIFt1bml0IHRlc3RzXSguLi90ZXN0L2ZzLnRlc3QuY2l2ZXQjOn46dGV4dD0lMjMlMjAlMkQlMkQlMkQlMjBjbGFzcyUyMEZpbGVFdmVudEhhbmRsZXIpXG4gKi9cblxuZXhwb3J0IGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcblx0aGFuZGxlcjogVEZzRXZlbnRIYW5kbGVyICMgLS0tIGRlYm91bmNlZCBoYW5kbGVyXG5cdG9uU3RvcDogPT4gdm9pZCA9IHBhc3NcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRjb25zdHJ1Y3RvcihjYWxsYmFjazogVEZzRXZlbnRIYW5kbGVyLCBoT3B0aW9uczogaGFzaCA9IHt9KVxuXHRcdHR5cGUgb3B0ID0ge1xuXHRcdFx0b25TdG9wOiBUVm9pZEZ1bmNcblx0XHRcdGRlYm91bmNlQnk6IG51bWJlclxuXHRcdFx0fVxuXHRcdHtvblN0b3A6IG9uU3RvcDEsIGRlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcblx0XHRcdG9uU3RvcDogcGFzc1xuXHRcdFx0ZGVib3VuY2VCeTogMjAwXG5cdFx0QG9uU3RvcCA9IG9uU3RvcDFcblx0XHRoYW5kbGVyMSA6PSBkZWJvdW5jZSBjYWxsYmFjaywgZGVib3VuY2VCeVxuXHRcdEBoYW5kbGVyID0gaGFuZGxlcjFcblx0XHREQkcgXCJGaWxlRXZlbnRIYW5kbGVyIGNvbnN0cnVjdG9yKCkgY2FsbGVkXCJcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblx0IyAtLS0gQ2FsbHMgYSBUVm9pZEZ1bmMsIGJ1dCBpcyBkZWJvdW5jZWQgYnkgQG1zIG1zXG5cblx0aGFuZGxlKGZzRXZlbnQ6IEZzRXZlbnQpOiB2b2lkXG5cdFx0e2tpbmQsIHBhdGhzfSA6PSBmc0V2ZW50XG5cdFx0REJHIFwiSEFORExFOiBbI3tzaW5jZUxvYWRTdHIoKX1dICN7a2luZH0gI3tPTChwYXRocyl9XCJcblx0XHRmb3IgcGF0aCBvZiBwYXRoc1xuXHRcdFx0QGhhbmRsZXIga2luZCwgcGF0aFxuXHRcdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBBU1lOQ1xuXG4vKipcbiAqIGEgZnVuY3Rpb24gdGhhdCB3YXRjaGVzIGZvciBjaGFuZ2VzIG9uZSBvciBtb3JlIGZpbGVzIG9yIGRpcmVjdG9yaWVzXG4gKiAgICBhbmQgY2FsbHMgYSBjYWxsYmFjayBmdW5jdGlvbiBmb3IgZWFjaCBjaGFuZ2UuXG4gKiBJZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnVlLCB3YXRjaGluZyBpcyBoYWx0ZWRcbiAqXG4gKiBVc2FnZTpcbiAqICAgaGFuZGxlciA6PSAoa2luZCwgcGF0aCkgPT4gY29uc29sZS5sb2cgcGF0aFxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3RlbXAudHh0JywgaGFuZGxlclxuICogICBhd2FpdCB3YXRjaEZpbGUgJ3NyYy9saWInLCAgaGFuZGxlclxuICogICBhd2FpdCB3YXRjaEZpbGUgWyd0ZW1wLnR4dCcsICdzcmMvbGliJ10sIGhhbmRsZXJcbiAqL1xuXG5leHBvcnQgd2F0Y2hGaWxlcyA6PSAoXG5cdFx0cGF0aDogc3RyaW5nIHwgc3RyaW5nW10sXG5cdFx0d2F0Y2hlckNCOiBURnNFdmVudEhhbmRsZXIsXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IHZvaWQgLT5cblxuXHQjIC0tLSBkZWJvdW5jZUJ5IGlzIG1pbGxpc2Vjb25kcyB0byBkZWJvdW5jZSBieSwgZGVmYXVsdCBpcyAyMDBcblx0dHlwZSBvcHQgPSB7XG5cdFx0ZGVib3VuY2VCeTogbnVtYmVyXG5cdFx0fVxuXHR7ZGVib3VuY2VCeX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0ZGVib3VuY2VCeTogMjAwXG5cdFx0fVxuXG5cdERCRyBcIldBVENIOiAje09MKHBhdGgpfVwiXG5cdHdhdGNoZXIgOj0gRGVuby53YXRjaEZzIHBhdGhcblx0bGV0IGRvU3RvcDogYm9vbGVhbiA9IGZhbHNlXG5cdGZzQ2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciA6PSAoa2luZCwgcGF0aCk6IHZvaWQgPT5cblx0XHRyZXN1bHQgOj0gd2F0Y2hlckNCIGtpbmQsIHBhdGhcblx0XHREQkcgXCJGQ0I6IHJlc3VsdCA9ICN7cmVzdWx0fVwiXG5cdFx0aWYgcmVzdWx0XG5cdFx0XHR3YXRjaGVyLmNsb3NlKClcblx0XHRyZXR1cm5cblx0aGFuZGxlciA6PSBuZXcgRmlsZUV2ZW50SGFuZGxlcihmc0NhbGxiYWNrLCB7IGRlYm91bmNlQnkgfSlcblx0Zm9yIGF3YWl0IGl0ZW0gb2Ygd2F0Y2hlclxuXHRcdGZzRXZlbnQ6IEZzRXZlbnQgOj0gaXRlbVxuXHRcdERCRyBcIndhdGNoZXIgZXZlbnQgZmlyZWRcIlxuXHRcdGlmIGRvU3RvcFxuXHRcdFx0REJHIFwiZG9TdG9wID0gI3tkb1N0b3B9LCBDbG9zaW5nIHdhdGNoZXJcIlxuXHRcdFx0YnJlYWtcblx0XHRmb3IgcGF0aCBvZiBmc0V2ZW50LnBhdGhzXG5cdFx0XHQjIC0tLSBmc0NhbGxiYWNrIHdpbGwgYmUgKGV2ZW50dWFsbHkpIGNhbGxlZFxuXHRcdFx0aGFuZGxlci5oYW5kbGUgZnNFdmVudFxuZXhwb3J0IHdhdGNoRmlsZSA6PSB3YXRjaEZpbGVzXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBwYXRjaEZpcnN0TGluZSA6PSAocGF0aDogc3RyaW5nLCBzdHI6IHN0cmluZywgbmV3c3RyOiBzdHJpbmcpOiB2b2lkID0+XG5cblx0IyAtLS0gUmVwbGFjZSBzdHIgd2l0aCBuZXdzdHIsIGJ1dCBvbmx5IG9uIGZpcnN0IGxpbmVcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcblx0bmxQb3MgOj0gY29udGVudHMuaW5kZXhPZiBcIlxcblwiXG5cdHN0clBvcyA6PSBjb250ZW50cy5pbmRleE9mIHN0clxuXHRpZiAoc3RyUG9zICE9IC0xKSAmJiAoKG5sUG9zID09IC0xKSB8fCAoc3RyUG9zIDwgbmxQb3MpKVxuXHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgY29udGVudHMucmVwbGFjZShzdHIsIG5ld3N0cilcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIC0tLSBFWEFNUExFIFVTQUdFOlxuI1x0XHRcdGhEYXRhIDo9IGF3YWl0IGZyb21Kc29uRmlsZSgnZGF0YS5qc29uYycpXG4jXHRcdFx0Y29uc29sZS5kaXIgaW1wb3J0TWFwXG5cbmV4cG9ydCBmcm9tSnNvbkZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IGhhc2ggPT5cblxuXHRpZiBpc0ZpbGUocGF0aClcblx0XHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxuXHRcdGlmIGlzRW1wdHkoY29udGVudHMpXG5cdFx0XHRyZXR1cm4ge31cblx0XHRyZXN1bHQgOj0gcGFyc2VKU09OQyhjb250ZW50cylcblx0XHRyZXR1cm4gZGVmaW5lZChyZXN1bHQpID8gcmVzdWx0IGFzIGhhc2ggOiB7fVxuXHRlbHNlXG5cdFx0cmV0dXJuIHt9XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0b0pzb25GaWxlIDo9IChcblx0XHRkYXRhOiBoYXNoXG5cdFx0cGF0aDogc3RyaW5nXG5cdFx0KTogdm9pZCA9PlxuXG5cdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMylcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhZGRKc29uVmFsdWUgOj0gKFxuXHRcdHBhdGg6IHN0cmluZ1xuXHRcdGtleTogc3RyaW5nXG5cdFx0dmFsdWU6IHVua25vd25cblx0XHQpOiB2b2lkID0+XG5cblx0aERhdGEgOj0gZnJvbUpzb25GaWxlKHBhdGgpXG5cdGlmIGRlZmluZWQoaERhdGEpICYmIGlzSGFzaChoRGF0YSlcblx0XHRoRGF0YVtrZXldID0gdmFsdWVcblx0XHR0b0pzb25GaWxlIGhEYXRhLCBwYXRoXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgZmlsZUV4dCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0bE1hdGNoZXMgOj0gcGF0aC5tYXRjaCgvXFwuW15cXC5dKyQvKVxuXHRyZXR1cm4gbE1hdGNoZXMgPyBsTWF0Y2hlc1swXSA6ICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0YXNzZXJ0IGV4dC5zdGFydHNXaXRoKCcuJyksIFwiQmFkIGZpbGUgZXh0ZW5zaW9uOiAje2V4dH1cIlxuXHRwb3MgOj0gcGF0aC5sYXN0SW5kZXhPZiAnLidcblx0YXNzZXJ0IChwb3MgPj0gMCksIFwicGF0aCBjb250YWlucyBubyBwZXJpb2Q6ICN7cGF0aH1cIlxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aChwYXRoLnN1YnN0cmluZygwLCBwb3MpICsgZXh0KVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaW5TYW1lRGlyIDo9IChcblx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xuXHRcdCk6IHN0cmluZyA9PlxuXG5cdHtkaXJ9IDo9IHBhcnNlUGF0aChwYXRoKVxuXHRuZXdwYXRoIDo9IG1rcGF0aChkaXIsIGZpbGVOYW1lKVxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBuZXdwYXRoXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCByZW1vdmVDUiA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gc3RyLnJlcGxhY2VBbGwgJ1xccicsICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBzbHVycCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0ZGF0YSA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgcGF0aFxuXHRyZXR1cm4gZGVmaW5lZChkYXRhKSA/IHJlbW92ZUNSKGRhdGEpIDogJydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHNsdXJwQXN5bmMgOj0gYXN5bmMgKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxuXG5cdGRhdGEgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgcGF0aFxuXHRyZXR1cm4gZGVmaW5lZChkYXRhKSA/IHJlbW92ZUNSKGRhdGEpIDogJydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHBhdGhTdHIgOj0gKHBhdGg6IHN0cmluZywgcm9vdDogc3RyaW5nID0gJ3NyYycpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZSByb290LCBwYXRoXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBzcGxpdFBhdHRlcm5zIDo9IChcblx0XHRsUGF0dGVybnM6IHN0cmluZ1tdLFxuXHRcdCk6IFtzdHJpbmdbXSwgc3RyaW5nW11dID0+XG5cblx0dHlwZSBUQWNjdW0gPSBbc3RyaW5nW10sIHN0cmluZ1tdXVxuXG5cdGFjYzA6IFRBY2N1bSA6PSBbW10sW11dXG5cdGFjY3VtIDo9IE1BUCBsUGF0dGVybnMsIGFjYzAsIChwYXQ6IHN0cmluZywgYWNjOiBUQWNjdW0pOiBUQWNjdW0gLT5cblx0XHRbbFBvcywgbE5lZ10gOj0gYWNjXG5cdFx0bE1hdGNoZXMgOj0gcGF0Lm1hdGNoIC8vL14gXFwhIFxccysgKC4qKSAkLy8vXG5cdFx0cmV0dXJuIChcblx0XHRcdCAgZGVmaW5lZChsTWF0Y2hlcylcblx0XHRcdD8gWyBsUG9zLCAgICAgICAgICAgICAgbE5lZy5jb25jYXQobE1hdGNoZXNbMV0pXVxuXHRcdFx0OiBbIGxQb3MuY29uY2F0KHBhdCksICBsTmVnICAgICAgICAgICAgICAgICAgICBdXG5cdFx0XHQpXG5cdHJldHVybiBhY2N1bVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBHRU5FUkFUT1JcbiNcbiMgICAgVXNlIGxpa2U6XG4jICAgICAgIGZvciBwYXRoIG9mIGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpXG4jICAgICAgICAgIE9SXG4jICAgICAgIGxQYXRocyA6PSBBcnJheS5mcm9tKGFsbEZpbGVzTWF0Y2hpbmcobFBhdHMpKVxuI1xuIyAgICBOT1RFOiBCeSBkZWZhdWx0LCBzZWFyY2hlcyBmcm9tIC5cbiMgICAgICAgICAgQnkgZGVmYXVsdCwgaWdub3JlcyBhbnl0aGluZyBpbnNpZGUgYSBmb2xkZXJcbiMgICAgICAgICAgICAgICAgICAgICAgbmFtZWQgJ3RlbXAnIG9yICdzYXZlJ1xuXG5leHBvcnQgYWxsRmlsZXNNYXRjaGluZyA6PSAoXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogR2VuZXJhdG9yPHN0cmluZz4gLT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRyb290OiBzdHJpbmdcblx0XHRoTW9yZUdsb2JPcHRpb25zOiBoYXNoXG5cdFx0bElnbm9yZURpcnM6IHN0cmluZ1tdXG5cdFx0aW5jbHVkZURpcnM6IGJvb2xlYW5cblx0XHR9XG5cblx0e3Jvb3QsIGhNb3JlR2xvYk9wdGlvbnMsIGxJZ25vcmVEaXJzLCBpbmNsdWRlRGlyc1xuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0XHRyb290OiAnLidcblx0XHRcdGhNb3JlR2xvYk9wdGlvbnM6IHt9XG5cdFx0XHRsSWdub3JlRGlyczogWyd0ZW1wJywgJ3NhdmUnXVxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXG5cdFx0XHR9XG5cblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcblx0XHRyb290XG5cdFx0aW5jbHVkZURpcnNcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2Vcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xuXHRcdH1cblxuXHRsQWxsUGF0dGVybnM6IHN0cmluZ1tdIDo9IGlzU3RyaW5nKGxQYXR0ZXJucykgPyBbbFBhdHRlcm5zXSA6IGxQYXR0ZXJuc1xuXHRsTW9yZVBhdHRlcm5zIDo9IChcblx0XHQgIGRlZmluZWQobElnbm9yZURpcnMpXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+IFwiISAqKi8je3h9LyoqXCIpXG5cdFx0OiBbXVxuXHRcdClcblxuXHRbbFBvc1BhdHMsIGxOZWdQYXRzXSA6PSBzcGxpdFBhdHRlcm5zIGxBbGxQYXR0ZXJucy5jb25jYXQobE1vcmVQYXR0ZXJucy4uLilcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcblx0aWYgZGVidWdnaW5nXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcblx0XHRmb3IgZW50cnkgb2YgZXhwYW5kR2xvYlN5bmMocGF0LCBoR2xvYk9wdGlvbnMpXG5cdFx0XHR7cGF0aH0gOj0gZW50cnlcblx0XHRcdGlmIG5vdCBzZXRTa2lwLmhhcyhwYXRoKVxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcblx0XHRcdFx0XHRMT0cgXCJQQVRIOiAje3BhdGh9XCJcblx0XHRcdFx0bnBhdGggOj0gbm9ybWFsaXplUGF0aChwYXRoKVxuXHRcdFx0XHR5aWVsZCBucGF0aFxuXHRcdFx0XHRzZXRTa2lwLmFkZCBwYXRoXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4jIC0tLSBoT3B0aW9ucyBnZXRzIHBhc3NlZCB0byBhbGxGaWxlc01hdGNoaW5nKClcbmV4cG9ydCByZW1vdmVGaWxlc01hdGNoaW5nIDo9IChcblx0XHRwYXR0ZXJuOiBzdHJpbmcsXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IHZvaWQgPT5cblxuXHRhc3NlcnQgKHBhdHRlcm4gIT0gJyonKSAmJiAocGF0dGVybiAhPSAnKionKSxcblx0XHRcdFwiQ2FuJ3QgZGVsZXRlIGZpbGVzIG1hdGNoaW5nICN7T0wocGF0dGVybil9XCJcblx0Zm9yIHBhdGggb2YgYWxsRmlsZXNNYXRjaGluZyhwYXR0ZXJuLCBoT3B0aW9ucylcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGZpbmRGaWxlIDo9IChcblx0XHRmaWxlTmFtZTogc3RyaW5nXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IHN0cmluZz8gPT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRyb290OiBzdHJpbmdcblx0XHRsSWdub3JlRGlyczogc3RyaW5nW11cblx0XHR9XG5cdHtyb290LCBsSWdub3JlRGlyc30gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0cm9vdDogJy4vc3JjJ1xuXHRcdGxJZ25vcmVEaXJzOiBbJ3RlbXAnXVxuXHRcdH1cblxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXG5cdHBhdCA6PSByb290ID8gXCIje3Jvb3R9LyoqLyN7ZmlsZU5hbWV9XCIgOiBcIioqLyN7ZmlsZU5hbWV9XCJcblxuXHQjIE5PVEU6IGFsbEZpbGVzTWF0Y2hpbmcoKSByZXR1cm5zIG5vcm1hbGl6ZWQgcGF0aHNcblx0bFBhdGhzIDo9IEFycmF5LmZyb20gYWxsRmlsZXNNYXRjaGluZyBwYXQsIHtcblx0XHRsSWdub3JlRGlyc1xuXHRcdH1cblx0REJHVkFMVUUgJ2xQYXRocycsIGxQYXRoc1xuXHRzd2l0Y2ggbFBhdGhzLmxlbmd0aFxuXHRcdGNhc2UgMTpcblx0XHRcdHBhdGggOj0gbFBhdGhzWzBdXG5cdFx0XHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vdCBhIGZpbGU6ICN7T0wocGF0aCl9XCJcblx0XHRcdHJldHVybiBwYXRoXG5cdFx0Y2FzZSAwOlxuXHRcdFx0cmV0dXJuIHVuZGVmXG5cdFx0ZGVmYXVsdDpcblx0XHRcdGZvciBwYXRoIG9mIGxQYXRoc1xuXHRcdFx0XHRjb25zb2xlLmxvZyBwYXRoXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIHdpdGggbmFtZSAje2ZpbGVOYW1lfVwiXG5cdFx0XHRyZXR1cm4gJydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgR0VORVJBVE9SXG4jXG4jICAgIFVzZSBsaWtlOlxuIyAgICAgICBmb3IgcGF0aCBvZiBhbGxEaXJzTWF0Y2hpbmcobFBhdHMpXG4jICAgICAgICAgIE9SXG4jICAgICAgIGxEaXJzIDo9IEFycmF5LmZyb20oYWxsRGlyc01hdGNoaW5nKGxQYXRzKSlcbiNcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuL3NyY1xuXG5leHBvcnQgYWxsRGlyc01hdGNoaW5nIDo9IChcblx0XHRsUGF0dGVybnM6IHN0cmluZyB8IHN0cmluZ1tdLFxuXHRcdGhNb3JlR2xvYk9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmcsIHZvaWQsIHZvaWQ+IC0+XG5cblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcblx0XHRyb290OiAnLi9zcmMnXG5cdFx0aW5jbHVkZURpcnM6IHRydWVcblx0XHRmb2xsb3dTeW1saW5rczogZmFsc2Vcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xuXHRcdH1cblx0bEFsbFBhdHRlcm5zOiBzdHJpbmdbXSA6PSBpc1N0cmluZyhsUGF0dGVybnMpID8gW2xQYXR0ZXJuc10gOiBsUGF0dGVybnNcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsQWxsUGF0dGVybnNcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcblx0aWYgZGVidWdnaW5nXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcblx0XHRmb3Ige3BhdGh9IG9mIGV4cGFuZEdsb2JTeW5jKHBhdCwgaEdsb2JPcHRpb25zKVxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpICYmIGdldEZpbGVTdGF0cyhwYXRoKS5pc0RpcmVjdG9yeVxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcblx0XHRcdFx0XHRMT0cgXCJESVI6ICN7cGF0aH1cIlxuXHRcdFx0XHR5aWVsZCBwYXRoXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIFRQYXRoSW5mbyA9XG5cdHJvb3Q6IHN0cmluZ1xuXHRkaXI6IHN0cmluZ1xuXHRmaWxlTmFtZTogc3RyaW5nXG5cdHN0dWI6IHN0cmluZ1xuXHRwdXJwb3NlOiBzdHJpbmc/XG5cdGV4dDogc3RyaW5nP1xuXG5leHBvcnQgcGFyc2VQYXRoIDo9IChwYXRoOiBzdHJpbmcpOiBUUGF0aEluZm8gPT5cblxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcblx0XHRwYXRoID0gZnJvbUZpbGVVcmwocGF0aClcblx0e3Jvb3QsIGRpciwgYmFzZX0gOj0gcGFyc2VGaWxlUGF0aCBwYXRoXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xuXHRuUGFydHMgOj0gbFBhcnRzLmxlbmd0aFxuXHRsZXQgcmVmMVxuXHRzd2l0Y2ggblBhcnRzXG5cdFx0Y2FzZSAwOlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIHBhdGg6ICN7cGF0aH1cIilcblx0XHR3aGVuIDFcblx0XHRcdHJlZjEgPSBiYXNlXG5cdFx0d2hlbiAyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJlZjEgPSBsUGFydHMuc2xpY2UoMCwgLTIpLmpvaW4oJy4nKVxuXHRzdHViIDo9IHJlZjFcblx0cmV0dXJuIHtcblx0XHRyb290OiBub3JtYWxpemVQYXRoKHJvb3QpXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcblx0XHRmaWxlTmFtZTogYmFzZVxuXHRcdHN0dWJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcblx0XHRleHQ6IGlmIChuUGFydHMgPiAxKSB0aGVuIFwiLiN7bFBhcnRzLmF0KC0xKX1cIiBlbHNlIHVuZGVmXG5cdH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHJlbHBhdGggOj0gKFxuXHRcdHBhdGg6IHN0cmluZyxcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXG5cdFx0KTogc3RyaW5nID0+XG5cblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUocm9vdCwgcGF0aClcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxuXG5cdHJldHVybiBub3JtYWxpemVQYXRoKHJlc29sdmUoJy4nLCBwYXRoKSlcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nPyk6IGJvb2xlYW4gPT5cblxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXG5cdFx0cmV0dXJuIGZhbHNlXG5cdHRyeVxuXHRcdHN0YXRzIDo9IGdldEZpbGVTdGF0cyBwYXRoXG5cdFx0cmV0dXJuIHN0YXRzLmlzRmlsZVxuXHRjYXRjaCBlcnJcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpXG5cdFx0XHRyZXR1cm4gZmFsc2Vcblx0XHRlbHNlXG5cdFx0XHR0aHJvdyBlcnJcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGlzRGlyIDo9IChwYXRoOiBzdHJpbmc/KTogYm9vbGVhbiA9PlxuXG5cdGlmIG5vdGRlZmluZWQocGF0aClcblx0XHRyZXR1cm4gZmFsc2Vcblx0dHJ5XG5cdFx0c3RhdHMgOj0gZ2V0RmlsZVN0YXRzIHBhdGhcblx0XHRyZXR1cm4gc3RhdHMuaXNEaXJlY3Rvcnlcblx0Y2F0Y2ggZXJyXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKVxuXHRcdFx0cmV0dXJuIGZhbHNlXG5cdFx0ZWxzZVxuXHRcdFx0dGhyb3cgZXJyXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBybUZpbGUgOj0gKHBhdGg6IHN0cmluZyk6IHZvaWQgPT5cblxuXHRpZiBpc0ZpbGUocGF0aClcblx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHJtRGlyIDo9IChwYXRoOiBzdHJpbmcsIGhPcHRpb25zOiBoYXNoID0ge30pOiB2b2lkID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0Y2xlYXI6IGJvb2xlYW5cblx0XHR9XG5cdHtjbGVhcn0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLFxuXHRcdGNsZWFyOiBmYWxzZVxuXHRpZiBleGlzdHNTeW5jKHBhdGgpXG5cdFx0YXNzZXJ0IGlzRGlyKHBhdGgpLCBcIk5vdCBhIGRpcmVjdG9yeTogI3twYXRofVwiXG5cdFx0aWYgY2xlYXJcblx0XHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoLCByZWN1cnNpdmU6IHRydWVcblx0XHRlbHNlXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aFxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGlzVmFsaWRTdHViIDo9IChzdHViOiBzdHJpbmcpOiBib29sZWFuID0+XG5cblx0Zm9yIGNoIG9mIFsnLCcsICcvJywgJ1xcXFwnXVxuXHRcdGlmIHN0dWIuaW5jbHVkZXMoY2gpXG5cdFx0XHRyZXR1cm4gZmFsc2Vcblx0cmV0dXJuIChzdHViICE9ICdhbGwnKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgdHlwZSBUVGV4dEZpbGVJbmZvID0ge1xuXHRtZXRhRGF0YTogdW5rbm93blxuXHRjb250ZW50czogc3RyaW5nP1xuXHRyZWFkZXI6IEdlbmVyYXRvcjxzdHJpbmcsIHZvaWQsIHZvaWQ+P1xuXHRuTGluZXM6IG51bWJlclxuXHR9XG5cbmV4cG9ydCBvcGVuVGV4dEZpbGUgPSAoXG5cdFx0cGF0aDogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBUVGV4dEZpbGVJbmZvID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0ZWFnZXI6IGJvb2xlYW5cblx0XHR9XG5cdHtlYWdlcn0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0ZWFnZXI6IGZhbHNlXG5cdFx0fVxuXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcblx0blJlYWRlciA6PSBuZXcgTlJlYWRMaW5lcyhwYXRoKVxuXHRnZXRMaW5lIDo9ICgpOiBzdHJpbmc/ID0+XG5cdFx0YnVmZmVyIDo9IG5SZWFkZXIubmV4dCgpXG5cdFx0aWYgZGVmaW5lZChidWZmZXIpXG5cdFx0XHRyZXR1cm4gcmVtb3ZlQ1IoYnVmZmVyLnRvU3RyaW5nKCkpXG5cdFx0ZWxzZVxuXHRcdFx0cmV0dXJuIHVuZGVmXG5cblx0IyAtLS0gd2UgbmVlZCB0byBnZXQgdGhlIGZpcnN0IGxpbmUgdG8gY2hlY2sgaWZcblx0IyAgICAgdGhlcmUncyBtZXRhIGRhdGEuIEJ1dCBpZiB0aGVyZSBpcyBub3QsXG5cdCMgICAgIHdlIG5lZWQgdG8gcmV0dXJuIGl0IGJ5IHRoZSByZWFkZXJcblxuXHRmaXJzdExpbmUgOj0gZ2V0TGluZSgpXG5cdGlmIG5vdGRlZmluZWQoZmlyc3RMaW5lKVxuXHRcdHJldHVybiB7XG5cdFx0XHRtZXRhRGF0YTogdW5kZWZcblx0XHRcdHJlYWRlcjogdW5kZWZcblx0XHRcdGNvbnRlbnRzOiB1bmRlZlxuXHRcdFx0bkxpbmVzOiAwXG5cdFx0XHR9XG5cblx0IyAtLS0gR2V0IG1ldGEgZGF0YSBpZiBwcmVzZW50XG5cdGhhc01ldGFEYXRhIDo9IGlzTWV0YURhdGFTdGFydChmaXJzdExpbmUpXG5cdGxldCBuTWV0YUxpbmVzID0gMFxuXG5cdG1ldGFEYXRhIDo9IChcblx0XHRpZiBoYXNNZXRhRGF0YVxuXHRcdFx0bE1ldGFMaW5lczogc3RyaW5nW10gOj0gW11cblx0XHRcdGxldCBsaW5lID0gZ2V0TGluZSgpXG5cdFx0XHR3aGlsZSBsaW5lICYmIChsaW5lICE9IGZpcnN0TGluZSlcblx0XHRcdFx0bE1ldGFMaW5lcy5wdXNoIGxpbmVcblx0XHRcdFx0bGluZSA9IGdldExpbmUoKVxuXHRcdFx0bk1ldGFMaW5lcyA9IGxNZXRhTGluZXMubGVuZ3RoICsgMlxuXHRcdFx0Y29udmVydE1ldGFEYXRhKGZpcnN0TGluZSwgYXJyYXlUb0Jsb2NrKGxNZXRhTGluZXMpKVxuXHRcdGVsc2Vcblx0XHRcdHVuZGVmXG5cdFx0KVxuXG5cdCMgLS0tIGdlbmVyYXRvciB0aGF0IGFsbG93cyByZWFkaW5nIGNvbnRlbnRzXG5cdHJlYWRlciA6PSAoKTogR2VuZXJhdG9yPHN0cmluZywgdm9pZCwgdm9pZD4gLT5cblx0XHRpZiBub3QgaGFzTWV0YURhdGEgJiYgZGVmaW5lZChmaXJzdExpbmUpXG5cdFx0XHR5aWVsZCBmaXJzdExpbmVcblx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxuXHRcdHdoaWxlIGRlZmluZWQobGluZSlcblx0XHRcdHlpZWxkIGxpbmVcblx0XHRcdGxpbmUgPSBnZXRMaW5lKClcblx0XHRyZXR1cm5cblxuXHQjIC0tLSBudW1iZXIgb2YgbGluZXMgaW4gZmlsZSByZWFkIHNvIGZhclxuXHRpZiBlYWdlclxuXHRcdGxMaW5lcyA6PSBBcnJheS5mcm9tKHJlYWRlcigpKVxuXHRcdHJldHVybiB7XG5cdFx0XHRtZXRhRGF0YVxuXHRcdFx0cmVhZGVyOiB1bmRlZlxuXHRcdFx0Y29udGVudHM6IGFycmF5VG9CbG9jayhsTGluZXMpXG5cdFx0XHRuTGluZXM6IG5NZXRhTGluZXMgKyBsTGluZXMubGVuZ3RoXG5cdFx0XHR9XG5cdGVsc2Vcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWV0YURhdGFcblx0XHRcdHJlYWRlcjogcmVhZGVyKClcblx0XHRcdGNvbnRlbnRzOiB1bmRlZlxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzXG5cdFx0XHR9XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEFTWU5DXG5cbmV4cG9ydCBjb25maWdGcm9tRmlsZSA6PSAoZmlsZU5hbWU6IHN0cmluZyk6IGhhc2ggPT5cblxuXHRwYXRoIDo9IGZpbmRGaWxlIGZpbGVOYW1lXG5cdGFzc2VydCBkZWZpbmVkKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChmaWxlTmFtZSl9XCJcblx0e3B1cnBvc2UsIGV4dH0gOj0gcGFyc2VQYXRoIHBhdGhcblx0YXNzZXJ0IChwdXJwb3NlID09ICdjb25maWcnKSwgXCJOb3QgYSBjb25maWcgZmlsZTogI3tPTChwYXRoKX1cIlxuXHRhc3NlcnQgKGV4dCA9PSAnLnRzJyksIFwiQ29uZmlnIGZpbGUgbm90IFR5cGVTY3JpcHQ6ICN7T0wocGF0aCl9XCJcblx0REJHIFwiSW1wb3J0IGNvbmZpZyBmcm9tICN7T0wocGF0aCl9XCJcblx0dXJsIDo9IHBhdGhUb0ZpbGVVUkwgcGF0aFxuXHREQkdWQUxVRSAndXJsJywgdXJsXG5cdHJldHVybiBhd2FpdCBpbXBvcnQgdXJsXG4iXX0=