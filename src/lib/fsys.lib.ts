"use strict";
// fsys.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {parse as parseFilePath} from 'node-path'
import {parse as parseJSONC, JsonValue} from '@std/jsonc'
import {debounce} from '@std/async/debounce'
import {existsSync, emptyDirSync, ensureDirSync} from '@std/fs'
import {appendFileSync, openSync, closeSync} from 'node-fs'
import {EventEmitter} from 'node-events'
import NReadLines from 'npm-n-readlines'
import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from '@std/streams'
import {
	parse, resolve, relative, fromFileUrl,
	} from '@std/path'

import {
	undef, defined, notdefined, assert, croak,
	isEmpty, nonEmpty, isString, isNonEmptyString,
	isBoolean, isNumber, isInteger, isArray, isArrayOfStrings,
	isHash, isRegExp, integer, hash, hashof, TVoidFunc,
	} from 'datatypes'
import {
	getOptions, pass, encode, spaces,
	sinceLoadStr, sleep, arrayToBlock,
	} from 'llutils'
import {isMetaDataStart, convertMetaData} from 'meta-data'
import {debugging} from 'cmd-args'
import {OL, ML} from 'to-nice'
import {
	pushLogLevel, popLogLevel, LOG, DBG,
	INDENT, UNDENT, DBGVALUE,
	} from 'logger'

// --- Create a function capable of synchronously
//     importing ESM modules

const Deno = globalThis.Deno
export type FsEvent = Deno.FsEvent
export var statSync = Deno.statSync

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
	const h = statSync(path)
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

export const allLinesIn = async function*(path: string): AsyncGenerator<string, void, void> {

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

export const mkpath = (...lParts: (string | undefined)[]): string => {

	const lUseParts = lParts.filter((x) => nonEmpty(x))
	const path = lUseParts.join('/').replaceAll(/[\\\/]+/g, '/')
	return normalizePath(path)
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
		const destms = statSync(destPath).mtime
		assert(defined(destms))
		const srcms  = statSync(srcPath).mtime
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
	let ref
	if (ref = path.match(/\.[^\.]+$/)) {
		const lMatches = ref
		return lMatches[0]
	}
	else {
		return ''
	}
}

// ---------------------------------------------------------------------------

export const withExt = (path: string, ext: string): string => {
	assert(ext.startsWith('.'), `Bad file extension: ${ext}`)
	const pos = path.lastIndexOf('.')
	assert((pos >= 0), `path contains no period: ${path}`)
	return path.substring(0, pos) + ext
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

export const normalizePath = (path: string): string => {

	if (notdefined(path)) {
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

export const pathStr = (path: string, root: string = 'src'): string => {

	return normalizePath(relative(root, path))
}

// ---------------------------------------------------------------------------

export const splitPatterns = (
		lAllPats: string | (string | undefined)[],
		lMorePats: (string | undefined)[] = []
		): [string[], string[]] => {

	const lPosPats: string[] = []
	const lNegPats: string[] = []
	if (typeof lAllPats === 'string') {
		// --- A single string can't be a negative pattern
		assert(!lAllPats.match(/^\!/), `Bad glob pattern: ${lAllPats}`)
		lPosPats.push(lAllPats)
	}
	else {
		for (const pat of lAllPats) {
			if (!defined(pat)) {
				continue
			}
			const lMatches = pat.match(/^(\!\s+)?(.*)$/)
			if (lMatches) {
				if (lMatches[1]) {
					lNegPats.push(lMatches[2])
				}
				else {
					lPosPats.push(lMatches[2])
				}
			}
		}
	}
	if (defined(lMorePats)) {
		for (const pat of lMorePats) {
			if (!defined(pat)) {
				continue
			}
			const lMatches = pat.match(/^(\!\s+)?(.*)$/)
			if (lMatches) {
				if (lMatches[1]) {
					lNegPats.push(lMatches[2])
				}
				else {
					lPosPats.push(lMatches[2])
				}
			}
		}
	}
	return [lPosPats, lNegPats]
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
//                      named 'temp', 'hide' or 'save'

export const allFilesMatching = function*(
		lPatterns: string | (string | undefined)[],
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
			lIgnoreDirs: ['temp', 'hide', 'save'],
			includeDirs: false
			})

	const hGlobOptions: hash = {
		root,
		includeDirs,
		followSymLinks: false,
		canonicalize: false,
		...hMoreGlobOptions
		}

	const lMorePatterns = (
		  defined(lIgnoreDirs)
		? lIgnoreDirs.map((x) => '! **/' + x + '/**')
		: []
		)
	const [lPosPats, lNegPats] = splitPatterns(lPatterns, lMorePatterns)
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
			if (!setSkip.has(path)) {
				if (debugging) {
					LOG(`PATH: ${path}`)
				}
				yield normalizePath(path)
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
		lIgnoreDirs: []
		})

	assert(!root.endsWith('/'), `Bad root: ${root}`)
	const pat = root ? `${root}/**/${fileName}` : `**/${fileName}`
	const lPaths = Array.from(allFilesMatching(pat, {
		lIgnoreDirs
		}))
	DBGVALUE('lPaths', lPaths)
	switch(lPaths.length) {
		case 1:
			const path = normalizePath(lPaths[0])
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
		followSymLinks: false,
		canonicalize: false,
		...hMoreGlobOptions
		}
	const [lPosPats, lNegPats] = splitPatterns(lPatterns)
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
			if (!setSkip.has(path) && statSync(path).isDirectory) {
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
		const stats = statSync(path)
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
		const stats = statSync(path)
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



//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcZnN5cy5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvZnN5cy5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSxpQkFBZ0I7QUFDaEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzlDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUEsR0FBRSxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUN2RCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUM1QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzNELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYTtBQUN4QyxBQUFBLEFBQUEsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3hDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCO0FBQ2xELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYztBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUN2QyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztB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QyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUMvQyxBQUFBLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBcUIsTUFBcEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsYUFBYSxDQUFBLEFBQUMsU0FBUyxDQUFDLENBQUMsYUFBYSxDQUFBO0FBQy9ELEFBQUEsQ0FBQyxHQUFHLENBQUEsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QixBQUFBLEVBQUUsWUFBWSxDQUFDLE9BQU8sQyxDQUFFLENBQUMsUTtDQUFRLENBQUE7QUFDakMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxTQUFTLENBQUEsQ0FBQSxDQUFBO0FBQ2IsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLFdBQVcsQ0FBQTtBQUNqQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdCLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBQTtB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QyxPQUFPLENBQUMsQztFQUFDLENBQUE7QUFDbkIsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQywwQ0FBeUM7QUFDMUMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxLQUFLLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxFQUFRLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDaEMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ1YsQUFBQSxHQUFHLFFBQVEsQ0FBQTtBQUNYLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDaEIsQUFBQSxHQUFHLFFBQVEsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQTtBQUNqQyxBQUFBLEdBQUcsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTTtBQUNyQyxHQUFHLEM7Q0FBQyxDQUFBO0FBQ0osQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ1YsQUFBQSxHQUFHLFFBQVEsQ0FBQTtBQUNYLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBO0FBQ25CLEFBQUEsR0FBRyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDbEIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxDQUFDLFVBQVU7QUFDckIsR0FBRyxDO0NBQUMsQztBQUFBLENBQUE7QUFDSjtBQUNBO0FBQ0EiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgZnN5cy5saWIuY2l2ZXRcblxuaW1wb3J0IHtwYXJzZTogcGFyc2VGaWxlUGF0aH0gZnJvbSAnbm9kZS1wYXRoJ1xuaW1wb3J0IHtwYXJzZTogcGFyc2VKU09OQywgSnNvblZhbHVlfSBmcm9tICdAc3RkL2pzb25jJ1xuaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnQHN0ZC9hc3luYy9kZWJvdW5jZSdcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xuaW1wb3J0IHthcHBlbmRGaWxlU3luYywgb3BlblN5bmMsIGNsb3NlU3luY30gZnJvbSAnbm9kZS1mcydcbmltcG9ydCB7RXZlbnRFbWl0dGVyfSBmcm9tICdub2RlLWV2ZW50cydcbmltcG9ydCBOUmVhZExpbmVzIGZyb20gJ25wbS1uLXJlYWRsaW5lcydcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMnXG5pbXBvcnQge1xuXHRwYXJzZSwgcmVzb2x2ZSwgcmVsYXRpdmUsIGZyb21GaWxlVXJsLFxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcblxuaW1wb3J0IHtcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGFzc2VydCwgY3JvYWssXG5cdGlzRW1wdHksIG5vbkVtcHR5LCBpc1N0cmluZywgaXNOb25FbXB0eVN0cmluZyxcblx0aXNCb29sZWFuLCBpc051bWJlciwgaXNJbnRlZ2VyLCBpc0FycmF5LCBpc0FycmF5T2ZTdHJpbmdzLFxuXHRpc0hhc2gsIGlzUmVnRXhwLCBpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIFRWb2lkRnVuYyxcblx0fSBmcm9tICdkYXRhdHlwZXMnXG5pbXBvcnQge1xuXHRnZXRPcHRpb25zLCBwYXNzLCBlbmNvZGUsIHNwYWNlcyxcblx0c2luY2VMb2FkU3RyLCBzbGVlcCwgYXJyYXlUb0Jsb2NrLFxuXHR9IGZyb20gJ2xsdXRpbHMnXG5pbXBvcnQge2lzTWV0YURhdGFTdGFydCwgY29udmVydE1ldGFEYXRhfSBmcm9tICdtZXRhLWRhdGEnXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXG5pbXBvcnQge09MLCBNTH0gZnJvbSAndG8tbmljZSdcbmltcG9ydCB7XG5cdHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsIExPRywgREJHLFxuXHRJTkRFTlQsIFVOREVOVCwgREJHVkFMVUUsXG5cdH0gZnJvbSAnbG9nZ2VyJ1xuXG4jIC0tLSBDcmVhdGUgYSBmdW5jdGlvbiBjYXBhYmxlIG9mIHN5bmNocm9ub3VzbHlcbiMgICAgIGltcG9ydGluZyBFU00gbW9kdWxlc1xuXG5EZW5vIDo9IGdsb2JhbFRoaXMuRGVub1xuZXhwb3J0IHR5cGUgRnNFdmVudCA9IERlbm8uRnNFdmVudFxuZXhwb3J0IHN0YXRTeW5jID0gRGVuby5zdGF0U3luY1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLyoqXG4gKiByZXR1cm5zIG9uZSBvZjpcbiAqICAgICdtaXNzaW5nJyAgLSBkb2VzIG5vdCBleGlzdFxuICogICAgJ2RpcicgICAgICAtIGlzIGEgZGlyZWN0b3J5XG4gKiAgICAnZmlsZScgICAgIC0gaXMgYSBmaWxlXG4gKiAgICAnc3ltbGluaycgIC0gaXMgYSBzeW1saW5rXG4gKiAgICAndW5rbm93bicgIC0gZXhpc3RzLCBidXQgbm90IGEgZmlsZSwgZGlyZWN0b3J5IG9yIHN5bWxpbmtcbiAqL1xuXG5leHBvcnQgdHlwZSBUUGF0aFR5cGUgPSAnbWlzc2luZycgfCAnZmlsZScgfCAnZGlyJyB8ICdzeW1saW5rJyB8ICd1bmtub3duJ1xuXG5leHBvcnQgZ2V0UGF0aFR5cGUgOj0gKHBhdGg6IHN0cmluZyk6IFRQYXRoVHlwZSA9PlxuXG5cdGFzc2VydCBpc1N0cmluZyhwYXRoKSwgXCJub3QgYSBzdHJpbmc6ICN7T0wocGF0aCl9XCJcblx0aWYgbm90IGV4aXN0c1N5bmMocGF0aClcblx0XHRyZXR1cm4gJ21pc3NpbmcnXG5cdGggOj0gc3RhdFN5bmMgcGF0aFxuXHRyZXR1cm4gKFxuXHRcdCAgaC5pc0ZpbGUgICAgICAgICA/ICdmaWxlJ1xuXHRcdDogaC5pc0RpcmVjdG9yeSAgICA/ICdkaXInXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgJ3Vua25vd24nXG5cdFx0KVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaXNTdHViIDo9IChzdHI6IHN0cmluZyk6IGJvb2xlYW4gPT5cblxuXHQjIC0tLSBhIHN0dWIgY2Fubm90IGNvbnRhaW4gYW55IG9mICdcXFxcJywgJy8nXG5cdHJldHVybiBub3RkZWZpbmVkKHN0ci5tYXRjaCAvW1xcXFxcXC9dLykgJiYgKHN0clswXSAhPSAnLicpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0b3VjaCA6PSAocGF0aDogc3RyaW5nKTogdm9pZCA9PlxuXG5cdGZkIDo9IG9wZW5TeW5jKHBhdGgsICdhJylcblx0Y2xvc2VTeW5jKGZkKVxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQVNZTkMgR0VORVJBVE9SXG5cbmV4cG9ydCBhbGxMaW5lc0luIDo9IChwYXRoOiBzdHJpbmcpOiBBc3luY0dlbmVyYXRvcjxzdHJpbmcsIHZvaWQsIHZvaWQ+IC0+XG5cblx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7T0wocGF0aCl9IChhbGxMaW5lc0luKVwiXG5cdGYgOj0gYXdhaXQgRGVuby5vcGVuIHBhdGhcblx0cmVhZGFibGUgOj0gKGYucmVhZGFibGVcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dERlY29kZXJTdHJlYW0oKSlcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dExpbmVTdHJlYW0oKSlcblx0XHRcdClcblx0Zm9yIGF3YWl0IGxpbmUgb2YgcmVhZGFibGVcblx0XHR5aWVsZCBsaW5lXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgcGF0aFRvVVJMIDo9ICguLi5sUGFydHM6IHN0cmluZ1tdKTogc3RyaW5nID0+XG5cblx0cGF0aCA6PSByZXNvbHZlIC4uLmxQYXJ0c1xuXHRyZXR1cm4gbmV3IFVSTCgnZmlsZTonICsgcGF0aCkuaHJlZi5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgbWtwYXRoIDo9ICguLi5sUGFydHM6IHN0cmluZz9bXSk6IHN0cmluZyA9PlxuXG5cdGxVc2VQYXJ0cyA6PSBsUGFydHMuZmlsdGVyICh4KSA9PiBub25FbXB0eSh4KVxuXHRwYXRoIDo9IGxVc2VQYXJ0cy5qb2luKCcvJykucmVwbGFjZUFsbCgvW1xcXFxcXC9dKy9nLCAnLycpXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHBhdGhcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgVFBhdGhEZXNjID0ge1xuXHRkaXI6IHN0cmluZ1xuXHRyb290OiBzdHJpbmdcblx0bFBhcnRzOiBzdHJpbmdbXVxuXHR9XG5cbmV4cG9ydCBwYXRoU3ViRGlycyA6PSAoXG5cdFx0cGF0aDogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBUUGF0aERlc2MgPT5cblxuXHRwYXRoID0gdG9GdWxsUGF0aChwYXRoKVxuXHR7cm9vdCwgZGlyfSA6PSBwYXJzZSBwYXRoXG5cdHJldHVybiB7XG5cdFx0ZGlyXG5cdFx0cm9vdFxuXHRcdGxQYXJ0czogZGlyLnNsaWNlKHJvb3QubGVuZ3RoKS5zcGxpdCgvW1xcXFxcXC9dLylcblx0XHR9XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIC0tLSBTaG91bGQgYmUgY2FsbGVkIGxpa2U6IG15c2VsZihpbXBvcnQubWV0YS51cmwpXG4jICAgICByZXR1cm5zIGZ1bGwgcGF0aCBvZiBjdXJyZW50IGZpbGVcblxuZXhwb3J0IG15c2VsZiA6PSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gcmVscGF0aCBmcm9tRmlsZVVybCB1cmxcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGJhcmYgOj0gKFxuXHRcdHBhdGg6IHN0cmluZyxcblx0XHRjb250ZW50czogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiB2b2lkID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0YXBwZW5kOiBib29sZWFuXG5cdFx0fVxuXHR7YXBwZW5kfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0fVxuXHRta0RpcnNGb3JGaWxlIHBhdGhcblx0ZGF0YSA6PSBlbmNvZGUgY29udGVudHNcblx0aWYgYXBwZW5kICYmIGlzRmlsZShwYXRoKVxuXHRcdGFwcGVuZEZpbGVTeW5jIHBhdGgsIGRhdGFcblx0ZWxzZVxuXHRcdERlbm8ud3JpdGVGaWxlU3luYyBwYXRoLCBkYXRhXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYmFyZlRlbXBGaWxlIDo9IChcblx0XHRjb250ZW50czogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBzdHJpbmcgPT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRleHQ6IHN0cmluZ1xuXHRcdH1cblx0e2V4dH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0ZXh0OiAnLmNpdmV0J1xuXHRcdH1cblx0dGVtcEZpbGVQYXRoIDo9IERlbm8ubWFrZVRlbXBGaWxlU3luYyBzdWZmaXg6IGV4dFxuXHRiYXJmIHRlbXBGaWxlUGF0aCwgY29udGVudHNcblx0cmV0dXJuIHRlbXBGaWxlUGF0aFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaXNFeHQgOj0gKHN0cjogc3RyaW5nKTogYm9vbGVhbiA9PlxuXG5cdHJldHVybiAvXlxcLltBLVphLXowLTlfXSskLy50ZXN0IHN0clxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cblx0XHQpOiBib29sZWFuID0+XG5cblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxuXHRhc3NlcnQgaXNGaWxlKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tPTChzcmNQYXRoKX1cIlxuXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XG5cdGlmIGlzRXh0KGRlc3RQYXRoKVxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcblxuXHR0cnlcblx0XHRhc3NlcnQgZXhpc3RzU3luYyhkZXN0UGF0aClcblx0XHRkZXN0bXMgOj0gc3RhdFN5bmMoZGVzdFBhdGgpLm10aW1lXG5cdFx0YXNzZXJ0IGRlZmluZWQoZGVzdG1zKVxuXHRcdHNyY21zICA6PSBzdGF0U3luYyhzcmNQYXRoKS5tdGltZVxuXHRcdGFzc2VydCBkZWZpbmVkKHNyY21zKVxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXG5cdGNhdGNoIGVyclxuXHRcdHJldHVybiBmYWxzZVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgbWtEaXIgOj0gKFxuXHRcdGRpclBhdGg6IHN0cmluZyxcblx0XHRjbGVhcjogYm9vbGVhbiA9IGZhbHNlXG5cdFx0KTogdm9pZCA9PlxuXG5cdGlmIGNsZWFyXG5cdFx0IyAtLS0gY3JlYXRlcyBkaXIgaWYgaXQgZG9lc24ndCBleGlzdFxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXG5cdGVsc2Vcblx0XHRlbnN1cmVEaXJTeW5jIGRpclBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBta0RpcnNGb3JGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XG5cblx0e3Jvb3QsIGxQYXJ0c30gOj0gcGF0aFN1YkRpcnMgcGF0aFxuXHRsZXQgZGlyID0gcm9vdFxuXHRmb3IgcGFydCBvZiBsUGFydHNcblx0XHRkaXIgKz0gXCIvI3twYXJ0fVwiXG5cdFx0aWYgbm90IGlzRGlyKGRpcilcblx0XHRcdG1rRGlyIGRpclxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNsZWFyRGlyIDo9IChkaXJQYXRoOiBzdHJpbmcpOiB2b2lkID0+XG5cblx0aWYgZXhpc3RzU3luYyhkaXJQYXRoKSAmJiBpc0RpcihkaXJQYXRoKVxuXHRcdGVtcHR5RGlyU3luYyBkaXJQYXRoXG5cdGVsc2Vcblx0XHRta0RpciBkaXJQYXRoXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgdHlwZSBURnNFdmVudEhhbmRsZXIgPSAoa2luZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IHZvaWQgfCBib29sZWFuXG4vKipcbiAqIGNsYXNzIEZpbGVFdmVudEhhbmRsZXJcbiAqICAgIGhhbmRsZXMgZmlsZSBjaGFuZ2VkIGV2ZW50cyB3aGVuIC5oYW5kbGUoZnNFdmVudCkgaXMgY2FsbGVkXG4gKiAgICBjYWxsYmFjayBpcyBhIGZ1bmN0aW9uLCBkZWJvdW5jZWQgYnkgMjAwIG1zXG4gKiAgICAgICB0aGF0IHRha2VzIGFuIEZzRXZlbnQgYW5kIHJldHVybnMgYSBUVm9pZEZ1bmNcbiAqICAgICAgIHdoaWNoIHdpbGwgYmUgY2FsbGVkIGlmIHRoZSBjYWxsYmFjayByZXR1cm5zIGEgZnVuY3Rpb24gcmVmZXJlbmNlXG4gKiBbdW5pdCB0ZXN0c10oLi4vdGVzdC9mcy50ZXN0LmNpdmV0Izp+OnRleHQ9JTIzJTIwJTJEJTJEJTJEJTIwY2xhc3MlMjBGaWxlRXZlbnRIYW5kbGVyKVxuICovXG5cbmV4cG9ydCBjbGFzcyBGaWxlRXZlbnRIYW5kbGVyXG5cdGhhbmRsZXI6IFRGc0V2ZW50SGFuZGxlciAjIC0tLSBkZWJvdW5jZWQgaGFuZGxlclxuXHRvblN0b3A6ID0+IHZvaWQgPSBwYXNzXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Y29uc3RydWN0b3IoY2FsbGJhY2s6IFRGc0V2ZW50SGFuZGxlciwgaE9wdGlvbnM6IGhhc2ggPSB7fSlcblx0XHR0eXBlIG9wdCA9IHtcblx0XHRcdG9uU3RvcDogVFZvaWRGdW5jXG5cdFx0XHRkZWJvdW5jZUJ5OiBudW1iZXJcblx0XHRcdH1cblx0XHR7b25TdG9wOiBvblN0b3AxLCBkZWJvdW5jZUJ5fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsXG5cdFx0XHRvblN0b3A6IHBhc3Ncblx0XHRcdGRlYm91bmNlQnk6IDIwMFxuXHRcdEBvblN0b3AgPSBvblN0b3AxXG5cdFx0aGFuZGxlcjEgOj0gZGVib3VuY2UgY2FsbGJhY2ssIGRlYm91bmNlQnlcblx0XHRAaGFuZGxlciA9IGhhbmRsZXIxXG5cdFx0REJHIFwiRmlsZUV2ZW50SGFuZGxlciBjb25zdHJ1Y3RvcigpIGNhbGxlZFwiXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cdCMgLS0tIENhbGxzIGEgVFZvaWRGdW5jLCBidXQgaXMgZGVib3VuY2VkIGJ5IEBtcyBtc1xuXG5cdGhhbmRsZShmc0V2ZW50OiBGc0V2ZW50KTogdm9pZFxuXHRcdHtraW5kLCBwYXRoc30gOj0gZnNFdmVudFxuXHRcdERCRyBcIkhBTkRMRTogWyN7c2luY2VMb2FkU3RyKCl9XSAje2tpbmR9ICN7T0wocGF0aHMpfVwiXG5cdFx0Zm9yIHBhdGggb2YgcGF0aHNcblx0XHRcdEBoYW5kbGVyIGtpbmQsIHBhdGhcblx0XHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQVNZTkNcblxuLyoqXG4gKiBhIGZ1bmN0aW9uIHRoYXQgd2F0Y2hlcyBmb3IgY2hhbmdlcyBvbmUgb3IgbW9yZSBmaWxlcyBvciBkaXJlY3Rvcmllc1xuICogICAgYW5kIGNhbGxzIGEgY2FsbGJhY2sgZnVuY3Rpb24gZm9yIGVhY2ggY2hhbmdlLlxuICogSWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1ZSwgd2F0Y2hpbmcgaXMgaGFsdGVkXG4gKlxuICogVXNhZ2U6XG4gKiAgIGhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpID0+IGNvbnNvbGUubG9nIHBhdGhcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICd0ZW1wLnR4dCcsIGhhbmRsZXJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlICdzcmMvbGliJywgIGhhbmRsZXJcbiAqICAgYXdhaXQgd2F0Y2hGaWxlIFsndGVtcC50eHQnLCAnc3JjL2xpYiddLCBoYW5kbGVyXG4gKi9cblxuZXhwb3J0IHdhdGNoRmlsZXMgOj0gKFxuXHRcdHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLFxuXHRcdHdhdGNoZXJDQjogVEZzRXZlbnRIYW5kbGVyLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiB2b2lkIC0+XG5cblx0IyAtLS0gZGVib3VuY2VCeSBpcyBtaWxsaXNlY29uZHMgdG8gZGVib3VuY2UgYnksIGRlZmF1bHQgaXMgMjAwXG5cdHR5cGUgb3B0ID0ge1xuXHRcdGRlYm91bmNlQnk6IG51bWJlclxuXHRcdH1cblx0e2RlYm91bmNlQnl9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGRlYm91bmNlQnk6IDIwMFxuXHRcdH1cblxuXHREQkcgXCJXQVRDSDogI3tPTChwYXRoKX1cIlxuXHR3YXRjaGVyIDo9IERlbm8ud2F0Y2hGcyBwYXRoXG5cdGxldCBkb1N0b3A6IGJvb2xlYW4gPSBmYWxzZVxuXHRmc0NhbGxiYWNrOiBURnNFdmVudEhhbmRsZXIgOj0gKGtpbmQsIHBhdGgpOiB2b2lkID0+XG5cdFx0cmVzdWx0IDo9IHdhdGNoZXJDQiBraW5kLCBwYXRoXG5cdFx0REJHIFwiRkNCOiByZXN1bHQgPSAje3Jlc3VsdH1cIlxuXHRcdGlmIHJlc3VsdFxuXHRcdFx0d2F0Y2hlci5jbG9zZSgpXG5cdFx0cmV0dXJuXG5cdGhhbmRsZXIgOj0gbmV3IEZpbGVFdmVudEhhbmRsZXIoZnNDYWxsYmFjaywgeyBkZWJvdW5jZUJ5IH0pXG5cdGZvciBhd2FpdCBpdGVtIG9mIHdhdGNoZXJcblx0XHRmc0V2ZW50OiBGc0V2ZW50IDo9IGl0ZW1cblx0XHREQkcgXCJ3YXRjaGVyIGV2ZW50IGZpcmVkXCJcblx0XHRpZiBkb1N0b3Bcblx0XHRcdERCRyBcImRvU3RvcCA9ICN7ZG9TdG9wfSwgQ2xvc2luZyB3YXRjaGVyXCJcblx0XHRcdGJyZWFrXG5cdFx0Zm9yIHBhdGggb2YgZnNFdmVudC5wYXRoc1xuXHRcdFx0IyAtLS0gZnNDYWxsYmFjayB3aWxsIGJlIChldmVudHVhbGx5KSBjYWxsZWRcblx0XHRcdGhhbmRsZXIuaGFuZGxlIGZzRXZlbnRcbmV4cG9ydCB3YXRjaEZpbGUgOj0gd2F0Y2hGaWxlc1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgcGF0Y2hGaXJzdExpbmUgOj0gKHBhdGg6IHN0cmluZywgc3RyOiBzdHJpbmcsIG5ld3N0cjogc3RyaW5nKTogdm9pZCA9PlxuXG5cdCMgLS0tIFJlcGxhY2Ugc3RyIHdpdGggbmV3c3RyLCBidXQgb25seSBvbiBmaXJzdCBsaW5lXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXG5cdG5sUG9zIDo9IGNvbnRlbnRzLmluZGV4T2YgXCJcXG5cIlxuXHRzdHJQb3MgOj0gY29udGVudHMuaW5kZXhPZiBzdHJcblx0aWYgKHN0clBvcyAhPSAtMSkgJiYgKChubFBvcyA9PSAtMSkgfHwgKHN0clBvcyA8IG5sUG9zKSlcblx0XHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIGNvbnRlbnRzLnJlcGxhY2Uoc3RyLCBuZXdzdHIpXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyAtLS0gRVhBTVBMRSBVU0FHRTpcbiNcdFx0XHRoRGF0YSA6PSBhd2FpdCBmcm9tSnNvbkZpbGUoJ2RhdGEuanNvbmMnKVxuI1x0XHRcdGNvbnNvbGUuZGlyIGltcG9ydE1hcFxuXG5leHBvcnQgZnJvbUpzb25GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiBoYXNoID0+XG5cblx0aWYgaXNGaWxlKHBhdGgpXG5cdFx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHBhdGhcblx0XHRpZiBpc0VtcHR5KGNvbnRlbnRzKVxuXHRcdFx0cmV0dXJuIHt9XG5cdFx0cmVzdWx0IDo9IHBhcnNlSlNPTkMoY29udGVudHMpXG5cdFx0cmV0dXJuIGRlZmluZWQocmVzdWx0KSA/IHJlc3VsdCBhcyBoYXNoIDoge31cblx0ZWxzZVxuXHRcdHJldHVybiB7fVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgdG9Kc29uRmlsZSA6PSAoXG5cdFx0ZGF0YTogaGFzaFxuXHRcdHBhdGg6IHN0cmluZ1xuXHRcdCk6IHZvaWQgPT5cblxuXHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIHBhdGgsIEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDMpXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYWRkSnNvblZhbHVlIDo9IChcblx0XHRwYXRoOiBzdHJpbmdcblx0XHRrZXk6IHN0cmluZ1xuXHRcdHZhbHVlOiB1bmtub3duXG5cdFx0KTogdm9pZCA9PlxuXG5cdGhEYXRhIDo9IGZyb21Kc29uRmlsZShwYXRoKVxuXHRpZiBkZWZpbmVkKGhEYXRhKSAmJiBpc0hhc2goaERhdGEpXG5cdFx0aERhdGFba2V5XSA9IHZhbHVlXG5cdFx0dG9Kc29uRmlsZSBoRGF0YSwgcGF0aFxuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGZpbGVFeHQgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxuXHRsZXQgcmVmXG5cdGlmIChyZWYgPSBwYXRoLm1hdGNoKC9cXC5bXlxcLl0rJC8pKVxuXHRcdGxNYXRjaGVzIDo9IHJlZlxuXHRcdHJldHVybiBsTWF0Y2hlc1swXVxuXHRlbHNlXG5cdFx0cmV0dXJuICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XG5cdGFzc2VydCBleHQuc3RhcnRzV2l0aCgnLicpLCBcIkJhZCBmaWxlIGV4dGVuc2lvbjogI3tleHR9XCJcblx0cG9zIDo9IHBhdGgubGFzdEluZGV4T2YgJy4nXG5cdGFzc2VydCAocG9zID49IDApLCBcInBhdGggY29udGFpbnMgbm8gcGVyaW9kOiAje3BhdGh9XCJcblx0cmV0dXJuIHBhdGguc3Vic3RyaW5nKDAsIHBvcykgKyBleHRcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHJlbW92ZUNSIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxuXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFxyJywgJydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHNsdXJwIDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHRkYXRhIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBwYXRoXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgc2x1cnBBc3luYyA6PSBhc3luYyAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0ZGF0YSA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBwYXRoXG5cdHJldHVybiBkZWZpbmVkKGRhdGEpID8gcmVtb3ZlQ1IoZGF0YSkgOiAnJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgbm9ybWFsaXplUGF0aCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0aWYgbm90ZGVmaW5lZChwYXRoKVxuXHRcdHJldHVybiAnJ1xuXG5cdG5wYXRoIDo9IHBhdGgucmVwbGFjZUFsbCAnXFxcXCcsICcvJ1xuXHRpZiBucGF0aC5jaGFyQXQoMSkgPT0gJzonXG5cdFx0cmV0dXJuIG5wYXRoLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbnBhdGguc3Vic3RyaW5nKDEpXG5cdGVsc2Vcblx0XHRyZXR1cm4gbnBhdGhcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHBhdGhTdHIgOj0gKHBhdGg6IHN0cmluZywgcm9vdDogc3RyaW5nID0gJ3NyYycpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZSByb290LCBwYXRoXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBzcGxpdFBhdHRlcm5zIDo9IChcblx0XHRsQWxsUGF0czogc3RyaW5nIHwgc3RyaW5nP1tdLFxuXHRcdGxNb3JlUGF0czogc3RyaW5nP1tdID0gW11cblx0XHQpOiBbc3RyaW5nW10sIHN0cmluZ1tdXSA9PlxuXG5cdGxQb3NQYXRzOiBzdHJpbmdbXSA6PSBbXVxuXHRsTmVnUGF0czogc3RyaW5nW10gOj0gW11cblx0aWYgKHR5cGVvZiBsQWxsUGF0cyA9PSAnc3RyaW5nJylcblx0XHQjIC0tLSBBIHNpbmdsZSBzdHJpbmcgY2FuJ3QgYmUgYSBuZWdhdGl2ZSBwYXR0ZXJuXG5cdFx0YXNzZXJ0IG5vdCBsQWxsUGF0cy5tYXRjaCgvXlxcIS8pLCBcIkJhZCBnbG9iIHBhdHRlcm46ICN7bEFsbFBhdHN9XCJcblx0XHRsUG9zUGF0cy5wdXNoIGxBbGxQYXRzXG5cdGVsc2Vcblx0XHRmb3IgcGF0IG9mIGxBbGxQYXRzXG5cdFx0XHRpZiBub3QgZGVmaW5lZChwYXQpXG5cdFx0XHRcdGNvbnRpbnVlXG5cdFx0XHRsTWF0Y2hlcyA6PSBwYXQubWF0Y2ggL14oXFwhXFxzKyk/KC4qKSQvXG5cdFx0XHRpZiBsTWF0Y2hlc1xuXHRcdFx0XHRpZiBsTWF0Y2hlc1sxXVxuXHRcdFx0XHRcdGxOZWdQYXRzLnB1c2ggbE1hdGNoZXNbMl1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGxQb3NQYXRzLnB1c2ggbE1hdGNoZXNbMl1cblx0aWYgZGVmaW5lZChsTW9yZVBhdHMpXG5cdFx0Zm9yIHBhdCBvZiBsTW9yZVBhdHNcblx0XHRcdGlmIG5vdCBkZWZpbmVkKHBhdClcblx0XHRcdFx0Y29udGludWVcblx0XHRcdGxNYXRjaGVzIDo9IHBhdC5tYXRjaCAvXihcXCFcXHMrKT8oLiopJC9cblx0XHRcdGlmIGxNYXRjaGVzXG5cdFx0XHRcdGlmIGxNYXRjaGVzWzFdXG5cdFx0XHRcdFx0bE5lZ1BhdHMucHVzaCBsTWF0Y2hlc1syXVxuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0bFBvc1BhdHMucHVzaCBsTWF0Y2hlc1syXVxuXHRyZXR1cm4gW2xQb3NQYXRzLCBsTmVnUGF0c11cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgR0VORVJBVE9SXG4jXG4jICAgIFVzZSBsaWtlOlxuIyAgICAgICBmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKGxQYXRzKVxuIyAgICAgICAgICBPUlxuIyAgICAgICBsUGF0aHMgOj0gQXJyYXkuZnJvbShhbGxGaWxlc01hdGNoaW5nKGxQYXRzKSlcbiNcbiMgICAgTk9URTogQnkgZGVmYXVsdCwgc2VhcmNoZXMgZnJvbSAuXG4jICAgICAgICAgIEJ5IGRlZmF1bHQsIGlnbm9yZXMgYW55dGhpbmcgaW5zaWRlIGEgZm9sZGVyXG4jICAgICAgICAgICAgICAgICAgICAgIG5hbWVkICd0ZW1wJywgJ2hpZGUnIG9yICdzYXZlJ1xuXG5leHBvcnQgYWxsRmlsZXNNYXRjaGluZyA6PSAoXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmc/W10sXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmc+IC0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0cm9vdDogc3RyaW5nXG5cdFx0aE1vcmVHbG9iT3B0aW9uczogaGFzaFxuXHRcdGxJZ25vcmVEaXJzOiBzdHJpbmdbXVxuXHRcdGluY2x1ZGVEaXJzOiBib29sZWFuXG5cdFx0fVxuXG5cdHtyb290LCBoTW9yZUdsb2JPcHRpb25zLCBsSWdub3JlRGlycywgaW5jbHVkZURpcnNcblx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdFx0cm9vdDogJy4nXG5cdFx0XHRoTW9yZUdsb2JPcHRpb25zOiB7fVxuXHRcdFx0bElnbm9yZURpcnM6IFsndGVtcCcsICdoaWRlJywgJ3NhdmUnXVxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXG5cdFx0XHR9XG5cblx0aEdsb2JPcHRpb25zOiBoYXNoIDo9IHtcblx0XHRyb290XG5cdFx0aW5jbHVkZURpcnNcblx0XHRmb2xsb3dTeW1MaW5rczogZmFsc2Vcblx0XHRjYW5vbmljYWxpemU6IGZhbHNlXG5cdFx0Li4uaE1vcmVHbG9iT3B0aW9uc1xuXHRcdH1cblxuXHRsTW9yZVBhdHRlcm5zIDo9IChcblx0XHQgIGRlZmluZWQobElnbm9yZURpcnMpXG5cdFx0PyBsSWdub3JlRGlycy5tYXAoKHgpID0+ICchICoqLycgKyB4ICsgJy8qKicpXG5cdFx0OiBbXVxuXHRcdClcblx0W2xQb3NQYXRzLCBsTmVnUGF0c10gOj0gc3BsaXRQYXR0ZXJucyBsUGF0dGVybnMsIGxNb3JlUGF0dGVybnNcblx0aWYgbE5lZ1BhdHMubGVuZ3RoID4gMFxuXHRcdGhHbG9iT3B0aW9ucy5leGNsdWRlID0gbE5lZ1BhdHNcblx0aWYgZGVidWdnaW5nXG5cdFx0TE9HIFwiUEFUVEVSTlM6XCJcblx0XHRmb3IgcGF0IG9mIGxQb3NQYXRzXG5cdFx0XHRMT0cgXCIgICBQT1M6ICN7cGF0fVwiXG5cdFx0Zm9yIHBhdCBvZiBsTmVnUGF0c1xuXHRcdFx0TE9HIFwiICAgTkVHOiAje3BhdH1cIlxuXHRzZXRTa2lwIDo9IG5ldyBTZXQ8c3RyaW5nPigpXG5cdGZvciBwYXQgb2YgbFBvc1BhdHNcblx0XHRmb3Ige3BhdGh9IG9mIGV4cGFuZEdsb2JTeW5jKHBhdCwgaEdsb2JPcHRpb25zKVxuXHRcdFx0aWYgbm90IHNldFNraXAuaGFzKHBhdGgpXG5cdFx0XHRcdGlmIGRlYnVnZ2luZ1xuXHRcdFx0XHRcdExPRyBcIlBBVEg6ICN7cGF0aH1cIlxuXHRcdFx0XHR5aWVsZCBub3JtYWxpemVQYXRoKHBhdGgpXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiMgLS0tIGhPcHRpb25zIGdldHMgcGFzc2VkIHRvIGFsbEZpbGVzTWF0Y2hpbmcoKVxuZXhwb3J0IHJlbW92ZUZpbGVzTWF0Y2hpbmcgOj0gKFxuXHRcdHBhdHRlcm46IHN0cmluZyxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogdm9pZCA9PlxuXG5cdGFzc2VydCAocGF0dGVybiAhPSAnKicpICYmIChwYXR0ZXJuICE9ICcqKicpLFxuXHRcdFx0XCJDYW4ndCBkZWxldGUgZmlsZXMgbWF0Y2hpbmcgI3tPTChwYXR0ZXJuKX1cIlxuXHRmb3IgcGF0aCBvZiBhbGxGaWxlc01hdGNoaW5nKHBhdHRlcm4sIGhPcHRpb25zKVxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXG5cdHJldHVyblxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgZmluZEZpbGUgOj0gKFxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogc3RyaW5nPyA9PlxuXG5cdHR5cGUgb3B0ID0ge1xuXHRcdHJvb3Q6IHN0cmluZ1xuXHRcdGxJZ25vcmVEaXJzOiBzdHJpbmdbXVxuXHRcdH1cblx0e3Jvb3QsIGxJZ25vcmVEaXJzfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRyb290OiAnLi9zcmMnXG5cdFx0bElnbm9yZURpcnM6IFtdXG5cdFx0fVxuXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcblx0cGF0IDo9IHJvb3QgPyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiA6IFwiKiovI3tmaWxlTmFtZX1cIlxuXHRsUGF0aHMgOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nIHBhdCwge1xuXHRcdGxJZ25vcmVEaXJzXG5cdFx0fVxuXHREQkdWQUxVRSAnbFBhdGhzJywgbFBhdGhzXG5cdHN3aXRjaCBsUGF0aHMubGVuZ3RoXG5cdFx0Y2FzZSAxOlxuXHRcdFx0cGF0aCA6PSBub3JtYWxpemVQYXRoIGxQYXRoc1swXVxuXHRcdFx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJOb3QgYSBmaWxlOiAje09MKHBhdGgpfVwiXG5cdFx0XHRyZXR1cm4gcGF0aFxuXHRcdGNhc2UgMDpcblx0XHRcdHJldHVybiB1bmRlZlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRmb3IgcGF0aCBvZiBsUGF0aHNcblx0XHRcdFx0Y29uc29sZS5sb2cgcGF0aFxuXHRcdFx0Y3JvYWsgXCJNdWx0aXBsZSBmaWxlcyB3aXRoIG5hbWUgI3tmaWxlTmFtZX1cIlxuXHRcdFx0cmV0dXJuICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEdFTkVSQVRPUlxuI1xuIyAgICBVc2UgbGlrZTpcbiMgICAgICAgZm9yIHBhdGggb2YgYWxsRGlyc01hdGNoaW5nKGxQYXRzKVxuIyAgICAgICAgICBPUlxuIyAgICAgICBsRGlycyA6PSBBcnJheS5mcm9tKGFsbERpcnNNYXRjaGluZyhsUGF0cykpXG4jXG4jICAgIE5PVEU6IEJ5IGRlZmF1bHQsIHNlYXJjaGVzIGZyb20gLi9zcmNcblxuZXhwb3J0IGFsbERpcnNNYXRjaGluZyA6PSAoXG5cdFx0bFBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSxcblx0XHRoTW9yZUdsb2JPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPiAtPlxuXG5cdGhHbG9iT3B0aW9uczogaGFzaCA6PSB7XG5cdFx0cm9vdDogJy4vc3JjJ1xuXHRcdGluY2x1ZGVEaXJzOiB0cnVlXG5cdFx0Zm9sbG93U3ltTGlua3M6IGZhbHNlXG5cdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxuXHRcdC4uLmhNb3JlR2xvYk9wdGlvbnNcblx0XHR9XG5cdFtsUG9zUGF0cywgbE5lZ1BhdHNdIDo9IHNwbGl0UGF0dGVybnMgbFBhdHRlcm5zXG5cdGlmIGxOZWdQYXRzLmxlbmd0aCA+IDBcblx0XHRoR2xvYk9wdGlvbnMuZXhjbHVkZSA9IGxOZWdQYXRzXG5cdGlmIGRlYnVnZ2luZ1xuXHRcdExPRyBcIlBBVFRFUk5TOlwiXG5cdFx0Zm9yIHBhdCBvZiBsUG9zUGF0c1xuXHRcdFx0TE9HIFwiICAgUE9TOiAje3BhdH1cIlxuXHRcdGZvciBwYXQgb2YgbE5lZ1BhdHNcblx0XHRcdExPRyBcIiAgIE5FRzogI3twYXR9XCJcblx0c2V0U2tpcCA6PSBuZXcgU2V0PHN0cmluZz4oKVxuXHRmb3IgcGF0IG9mIGxQb3NQYXRzXG5cdFx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyhwYXQsIGhHbG9iT3B0aW9ucylcblx0XHRcdGlmIG5vdCBzZXRTa2lwLmhhcyhwYXRoKSAmJiBzdGF0U3luYyhwYXRoKS5pc0RpcmVjdG9yeVxuXHRcdFx0XHRpZiBkZWJ1Z2dpbmdcblx0XHRcdFx0XHRMT0cgXCJESVI6ICN7cGF0aH1cIlxuXHRcdFx0XHR5aWVsZCBwYXRoXG5cdFx0XHRcdHNldFNraXAuYWRkIHBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIFRQYXRoSW5mbyA9XG5cdHJvb3Q6IHN0cmluZ1xuXHRkaXI6IHN0cmluZ1xuXHRmaWxlTmFtZTogc3RyaW5nXG5cdHN0dWI6IHN0cmluZ1xuXHRwdXJwb3NlOiBzdHJpbmc/XG5cdGV4dDogc3RyaW5nP1xuXG5leHBvcnQgcGFyc2VQYXRoIDo9IChwYXRoOiBzdHJpbmcpOiBUUGF0aEluZm8gPT5cblxuXHRpZiBkZWZpbmVkKHBhdGgubWF0Y2ggL15maWxlXFw6XFwvXFwvLylcblx0XHRwYXRoID0gZnJvbUZpbGVVcmwocGF0aClcblx0e3Jvb3QsIGRpciwgYmFzZX0gOj0gcGFyc2VGaWxlUGF0aCBwYXRoXG5cdGxQYXJ0cyA6PSBiYXNlLnNwbGl0ICcuJ1xuXHRuUGFydHMgOj0gbFBhcnRzLmxlbmd0aFxuXHRsZXQgcmVmMVxuXHRzd2l0Y2ggblBhcnRzXG5cdFx0Y2FzZSAwOlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIHBhdGg6ICN7cGF0aH1cIilcblx0XHR3aGVuIDFcblx0XHRcdHJlZjEgPSBiYXNlXG5cdFx0d2hlbiAyXG5cdFx0XHRyZWYxID0gbFBhcnRzWzBdXG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJlZjEgPSBsUGFydHMuc2xpY2UoMCwgLTIpLmpvaW4oJy4nKVxuXHRzdHViIDo9IHJlZjFcblx0cmV0dXJuIHtcblx0XHRyb290OiBub3JtYWxpemVQYXRoKHJvb3QpXG5cdFx0ZGlyOiBub3JtYWxpemVQYXRoKGRpcilcblx0XHRmaWxlTmFtZTogYmFzZVxuXHRcdHN0dWJcblx0XHRwdXJwb3NlOiBpZiAoblBhcnRzID4gMikgdGhlbiBsUGFydHMuYXQoLTIpIGVsc2UgdW5kZWZcblx0XHRleHQ6IGlmIChuUGFydHMgPiAxKSB0aGVuIFwiLiN7bFBhcnRzLmF0KC0xKX1cIiBlbHNlIHVuZGVmXG5cdH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHJlbHBhdGggOj0gKFxuXHRcdHBhdGg6IHN0cmluZyxcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXG5cdFx0KTogc3RyaW5nID0+XG5cblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUocm9vdCwgcGF0aClcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxuXG5cdHJldHVybiBub3JtYWxpemVQYXRoKHJlc29sdmUoJy4nLCBwYXRoKSlcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGlzRmlsZSA6PSAocGF0aDogc3RyaW5nPyk6IGJvb2xlYW4gPT5cblxuXHRpZiBub3RkZWZpbmVkKHBhdGgpXG5cdFx0cmV0dXJuIGZhbHNlXG5cdHRyeVxuXHRcdHN0YXRzIDo9IHN0YXRTeW5jIHBhdGhcblx0XHRyZXR1cm4gc3RhdHMuaXNGaWxlXG5cdGNhdGNoIGVyclxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZClcblx0XHRcdHJldHVybiBmYWxzZVxuXHRcdGVsc2Vcblx0XHRcdHRocm93IGVyclxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaXNEaXIgOj0gKHBhdGg6IHN0cmluZz8pOiBib29sZWFuID0+XG5cblx0aWYgbm90ZGVmaW5lZChwYXRoKVxuXHRcdHJldHVybiBmYWxzZVxuXHR0cnlcblx0XHRzdGF0cyA6PSBzdGF0U3luYyBwYXRoXG5cdFx0cmV0dXJuIHN0YXRzLmlzRGlyZWN0b3J5XG5cdGNhdGNoIGVyclxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZClcblx0XHRcdHJldHVybiBmYWxzZVxuXHRcdGVsc2Vcblx0XHRcdHRocm93IGVyclxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgcm1GaWxlIDo9IChwYXRoOiBzdHJpbmcpOiB2b2lkID0+XG5cblx0aWYgaXNGaWxlKHBhdGgpXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBybURpciA6PSAocGF0aDogc3RyaW5nLCBoT3B0aW9uczogaGFzaCA9IHt9KTogdm9pZCA9PlxuXG5cdHR5cGUgb3B0ID0ge1xuXHRcdGNsZWFyOiBib29sZWFuXG5cdFx0fVxuXHR7Y2xlYXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucyxcblx0XHRjbGVhcjogZmFsc2Vcblx0aWYgZXhpc3RzU3luYyhwYXRoKVxuXHRcdGFzc2VydCBpc0RpcihwYXRoKSwgXCJOb3QgYSBkaXJlY3Rvcnk6ICN7cGF0aH1cIlxuXHRcdGlmIGNsZWFyXG5cdFx0XHREZW5vLnJlbW92ZVN5bmMgcGF0aCwgcmVjdXJzaXZlOiB0cnVlXG5cdFx0ZWxzZVxuXHRcdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpc1ZhbGlkU3R1YiA6PSAoc3R1Yjogc3RyaW5nKTogYm9vbGVhbiA9PlxuXG5cdGZvciBjaCBvZiBbJywnLCAnLycsICdcXFxcJ11cblx0XHRpZiBzdHViLmluY2x1ZGVzKGNoKVxuXHRcdFx0cmV0dXJuIGZhbHNlXG5cdHJldHVybiAoc3R1YiAhPSAnYWxsJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgVFRleHRGaWxlSW5mbyA9IHtcblx0bWV0YURhdGE6IHVua25vd25cblx0Y29udGVudHM6IHN0cmluZz9cblx0cmVhZGVyOiBHZW5lcmF0b3I8c3RyaW5nLCB2b2lkLCB2b2lkPj9cblx0bkxpbmVzOiBudW1iZXJcblx0fVxuXG5leHBvcnQgb3BlblRleHRGaWxlID0gKFxuXHRcdHBhdGg6IHN0cmluZyxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogVFRleHRGaWxlSW5mbyA9PlxuXG5cdHR5cGUgb3B0ID0ge1xuXHRcdGVhZ2VyOiBib29sZWFuXG5cdFx0fVxuXHR7ZWFnZXJ9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGVhZ2VyOiBmYWxzZVxuXHRcdH1cblxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXG5cdG5SZWFkZXIgOj0gbmV3IE5SZWFkTGluZXMocGF0aClcblx0Z2V0TGluZSA6PSAoKTogc3RyaW5nPyA9PlxuXHRcdGJ1ZmZlciA6PSBuUmVhZGVyLm5leHQoKVxuXHRcdGlmIGRlZmluZWQoYnVmZmVyKVxuXHRcdFx0cmV0dXJuIHJlbW92ZUNSKGJ1ZmZlci50b1N0cmluZygpKVxuXHRcdGVsc2Vcblx0XHRcdHJldHVybiB1bmRlZlxuXG5cdCMgLS0tIHdlIG5lZWQgdG8gZ2V0IHRoZSBmaXJzdCBsaW5lIHRvIGNoZWNrIGlmXG5cdCMgICAgIHRoZXJlJ3MgbWV0YSBkYXRhLiBCdXQgaWYgdGhlcmUgaXMgbm90LFxuXHQjICAgICB3ZSBuZWVkIHRvIHJldHVybiBpdCBieSB0aGUgcmVhZGVyXG5cblx0Zmlyc3RMaW5lIDo9IGdldExpbmUoKVxuXHRpZiBub3RkZWZpbmVkKGZpcnN0TGluZSlcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWV0YURhdGE6IHVuZGVmXG5cdFx0XHRyZWFkZXI6IHVuZGVmXG5cdFx0XHRjb250ZW50czogdW5kZWZcblx0XHRcdG5MaW5lczogMFxuXHRcdFx0fVxuXG5cdCMgLS0tIEdldCBtZXRhIGRhdGEgaWYgcHJlc2VudFxuXHRoYXNNZXRhRGF0YSA6PSBpc01ldGFEYXRhU3RhcnQoZmlyc3RMaW5lKVxuXHRsZXQgbk1ldGFMaW5lcyA9IDBcblxuXHRtZXRhRGF0YSA6PSAoXG5cdFx0aWYgaGFzTWV0YURhdGFcblx0XHRcdGxNZXRhTGluZXM6IHN0cmluZ1tdIDo9IFtdXG5cdFx0XHRsZXQgbGluZSA9IGdldExpbmUoKVxuXHRcdFx0d2hpbGUgbGluZSAmJiAobGluZSAhPSBmaXJzdExpbmUpXG5cdFx0XHRcdGxNZXRhTGluZXMucHVzaCBsaW5lXG5cdFx0XHRcdGxpbmUgPSBnZXRMaW5lKClcblx0XHRcdG5NZXRhTGluZXMgPSBsTWV0YUxpbmVzLmxlbmd0aCArIDJcblx0XHRcdGNvbnZlcnRNZXRhRGF0YShmaXJzdExpbmUsIGFycmF5VG9CbG9jayhsTWV0YUxpbmVzKSlcblx0XHRlbHNlXG5cdFx0XHR1bmRlZlxuXHRcdClcblxuXHQjIC0tLSBnZW5lcmF0b3IgdGhhdCBhbGxvd3MgcmVhZGluZyBjb250ZW50c1xuXHRyZWFkZXIgOj0gKCk6IEdlbmVyYXRvcjxzdHJpbmcsIHZvaWQsIHZvaWQ+IC0+XG5cdFx0aWYgbm90IGhhc01ldGFEYXRhICYmIGRlZmluZWQoZmlyc3RMaW5lKVxuXHRcdFx0eWllbGQgZmlyc3RMaW5lXG5cdFx0bGV0IGxpbmUgPSBnZXRMaW5lKClcblx0XHR3aGlsZSBkZWZpbmVkKGxpbmUpXG5cdFx0XHR5aWVsZCBsaW5lXG5cdFx0XHRsaW5lID0gZ2V0TGluZSgpXG5cdFx0cmV0dXJuXG5cblx0IyAtLS0gbnVtYmVyIG9mIGxpbmVzIGluIGZpbGUgcmVhZCBzbyBmYXJcblx0aWYgZWFnZXJcblx0XHRsTGluZXMgOj0gQXJyYXkuZnJvbShyZWFkZXIoKSlcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWV0YURhdGFcblx0XHRcdHJlYWRlcjogdW5kZWZcblx0XHRcdGNvbnRlbnRzOiBhcnJheVRvQmxvY2sobExpbmVzKVxuXHRcdFx0bkxpbmVzOiBuTWV0YUxpbmVzICsgbExpbmVzLmxlbmd0aFxuXHRcdFx0fVxuXHRlbHNlXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1ldGFEYXRhXG5cdFx0XHRyZWFkZXI6IHJlYWRlcigpXG5cdFx0XHRjb250ZW50czogdW5kZWZcblx0XHRcdG5MaW5lczogbk1ldGFMaW5lc1xuXHRcdFx0fVxuXG5cbiJdfQ==