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
	getOptions, removeEmptyKeys, pass, encode, spaces,
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

const lDirs: string[] = []

// ---------------------------------------------------------------------------

export const pushWD = (dir: string): void => {

	lDirs.push(Deno.cwd())
	Deno.chdir(dir)
	return
}

// ---------------------------------------------------------------------------

export const popWD = (): void => {

	const dir = lDirs.pop()
	if (defined(dir)) {
		Deno.chdir(dir)
	}
	else {
		croak("directory stack is empty")
	}
	return
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

/**
 * An async iterable - yields every line in the given file
 *
 * Usage:
 *   for await line of allLinesIn('src/lib/temp.civet')
 * 	  console.log "LINE: #{line}"
 *   console.log "DONE"
 */

export const allLinesIn = async function*(path: string): AsyncGenerator<string, void, void> {

	assert(isFile(path), `No such file: ${OL(path)} (allLinesIn)`)
	const f = await Deno.open(path)
	const readable = f.readable.pipeThrough(new TextDecoderStream()).pipeThrough(new TextLineStream())
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



