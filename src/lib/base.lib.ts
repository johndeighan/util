"use strict";
// base.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import process from "node:process"
import {
	cyan, blue, black, red, green, magenta, yellow,
	stripAnsiCode,
	} from '@std/fmt/colors'
import {AssertionError} from '@std/assert'
import {SourceMapConsumer} from '@mozilla/source-map'
import {
	resolve, relative, isAbsolute, fromFileUrl, dirname,
	} from '@std/path'
import {TextLineStream} from '@std/streams'
import deepEqual from 'npm-fast-deep-equal'
import {existsSync, emptyDirSync, ensureDirSync} from '@std/fs'
import {sprintf} from '@std/fmt/printf'
import {expandGlobSync} from '@std/fs/expand-glob'

export {deepEqual}
export var deepCopy = structuredClone

const mydir = dirname(fromFileUrl(import.meta.url))

// ---------------------------------------------------------------------------

type TStringSource = Uint8Array<ArrayBuffer> | BufferSource | string

const encoder = new TextEncoder()
export const encode = (x: string): Uint8Array<ArrayBuffer> => {
	return encoder.encode(x)
}

const decoder = new TextDecoder()
export const decode = (x: TStringSource): string => {
	return (typeof x === 'string') ? x : decoder.decode(x)
}

// ---------------------------------------------------------------------------

export type TIterator<TIn, TOut=void, TAcc=void> = Generator<TIn, TOut, TAcc>
export type TAsyncIterator<TIn, TOut=void, TAcc=void> = AsyncGenerator<TIn, TOut, TAcc>
export type TNonFunction<T=unknown> = Exclude<T, Function>

// ---------------------------------------------------------------------------

export function* emptyIterator<T=unknown>(): TIterator<T> { () => {
	return
} }

// ---------------------------------------------------------------------------

export async function* emptyAsyncIterator<T=unknown>(): TAsyncIterator<T> { () => {
	return
} }

// ---------------------------------------------------------------------------

export const pass = (): void => {}
	// do nothing

// ---------------------------------------------------------------------------
// ASYNC

export const sleep = async (sec: number): AutoPromise<void> => {

	await new Promise((r) => setTimeout(r, 1000 * sec))
	return
}

// ---------------------------------------------------------------------------

export const undef = undefined
type TDefined = NonNullable<unknown>
type TNotDefined = null | undefined

// ---------------------------------------------------------------------------

export const defined = (x: unknown): x is TDefined => {

	return (x !== undef) && (x !== null)
}

// ---------------------------------------------------------------------------

export const anyDefined = (...lItems: unknown[]): boolean => {

	for (const item of lItems) {
		if (defined(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

export const notdefined = (x: unknown): x is TNotDefined => {

	return (x === undef) || (x === null)
}

// ---------------------------------------------------------------------------

export const anyNotDefined = (...lItems: unknown[]): boolean => {

	for (const item of lItems) {
		if (notdefined(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

export const max = (x: number, y: number): number => {

	return (x > y) ? x : y
}

// ---------------------------------------------------------------------------

export const range = function*(n: number): TIterator<number> {

	for (let i1 = 0, asc = 0 <= n; asc ? i1 < n : i1 > n; asc ? ++i1 : --i1) {const i = i1;
		yield i
	}
	return
}

// ---------------------------------------------------------------------------

export const allChars = function*(str: string): TIterator<string> {

	for (const ch of str) {
		yield ch
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const allCharsAsync = async function*(str: string): TAsyncIterator<string> {

	for (const ch of str) {
		yield ch
		await sleep(0.1)
	}
	return
}

// ---------------------------------------------------------------------------
//             LOGGING
// ---------------------------------------------------------------------------

const setDebugFiles = new Set<string>()

let indentLevel = 0
let lLogLines: string[] = []

export const INDENT = Symbol('indent')
export const UNDENT = Symbol('undent')

export type TLogLevel = 'testing' | 'silent' | 'info' | 'debug'
export let lLogLevels: TLogLevel[] = ['info']
export const getLogLevels = () => { return lLogLevels }

// ---------------------------------------------------------------------------

export const openDebugFile = (
		stub: string,
		clear: boolean = false
		): void => {

	const path = `./logs/${stub}.log`
	setDebugFiles.add(path)
	if (clear) {
		Deno.removeSync(path)
	}
	return
}

// ---------------------------------------------------------------------------

export const appendDebugFile = (
		...lItems: unknown[]
		): void => {

	for (const item of lItems) {
		const block = (typeof item === 'string') ? item : toJSON(item)
		for (const path of setDebugFiles) {
			Deno.writeTextFileSync(path, block + "\n", {append: true})
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const closeDebugFile = (stub: string): void => {

	const path = `src/logs/${stub}.log`
	setDebugFiles.delete(path)
	return
}

// ---------------------------------------------------------------------------

export const curLogLevel = (): TLogLevel => {

	return (lLogLevels.length === 0) ? 'info' : lLogLevels[lLogLevels.length-1]
}

// ---------------------------------------------------------------------------

export const notLogging = (): boolean => {

	return (curLogLevel() === 'silent') || (curLogLevel() === 'testing')
}

// ---------------------------------------------------------------------------

export const initLogLevel = (
		level: TLogLevel
		): void => {

	lLogLevels = [level]
	console.log(`LOG LEVEL set to ${level}`)
	return
}

// ---------------------------------------------------------------------------

export const pushLogLevel = (
		level: TLogLevel
		): void => {

	lLogLevels.push(level)
	return
}

// ---------------------------------------------------------------------------

export const popLogLevel = (): TLogLevel => {

	if (lLogLevels.length === 0) {
		return 'info'
	}
	else {
		const result = lLogLevels.pop()
		return result || 'info'
	}
}

// ---------------------------------------------------------------------------

export const toJSON = (item: unknown): string => {

	return JSON.stringify(item, null, 3)
}

// ---------------------------------------------------------------------------

export const LOG = (
		...lItems: unknown[]
		): void => {

	if (notLogging()) {
		return
	}
	for (const item of lItems) {
		if (item === INDENT) {
			indentLevel += 1
		}
		else if (item === UNDENT) {
			if (indentLevel > 0) {
				indentLevel -= 1
			}
		}
		else {
			logLine(item)
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const DBG = (
		...lItems: unknown[]
		): void => {

	// --- if an append file is defined, output even if
	//     current log level is not 'debug'
	appendDebugFile(...lItems)

	if (curLogLevel() === 'debug') {
		LOG(...lItems)
	}
	return
}

// ---------------------------------------------------------------------------

export const WARN = (
		...lMsgs: unknown[]
		): void => {

	if (notLogging()) {
		return
	}
	for (const msg of lMsgs) {
		console.error(`${cyan('WARNING')}: ${msg}`)
	}
	return
}

// ---------------------------------------------------------------------------

export const ERR = (
		err: unknown,
		label: string = 'ERR'
		): void => {

	const errMsg = getErrStr(err)
	lLogLines.push(errMsg)
	if (notLogging()) {
		return
	}
	console.error(red(label) + ': ' + errMsg)
	return
}

// ---------------------------------------------------------------------------

type TNeverFunc = (err: unknown) => never

export const croak: TNeverFunc = (
		err: unknown
		): never => {

	const errMsg = getErrStr(err)
	if (curLogLevel() === 'testing') {
		// --- allows the error to be caught and handled or ignored
		throw new Error(errMsg)
	}
	else {
		console.error(red('CROAK') + ': ' + errMsg)
		console.error("-----  STACK -----")
		for (const frame of allStackFrames()) {
			dumpFrame(frame)
		}
		Deno.exit()
	}
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export const unknownToString = (x: unknown): string => {

	return (
		  (typeof x === 'string') ? x
		: (x === undef)           ? 'undef'
		: (x === null)            ? 'null'
		:                          JSON.stringify(x)
		)
}

// ---------------------------------------------------------------------------

const logLine = (
		x: unknown,
		): void => {

	const line = '\t'.repeat(indentLevel) + unknownToString(x)
	console.log(line)
	lLogLines.push(line)
	return
}

// ---------------------------------------------------------------------------

export const clearLog = (): void => {

	lLogLines.length = 0
	return
}

// ---------------------------------------------------------------------------

export const getLog = (): string => {

	return lLogLines.join('\n')
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//              File System Utils
// ---------------------------------------------------------------------------

export const findFile = (
		fileName: string,
		root: string = Deno.cwd()
		): (string | undefined) => {

	assert(!root.endsWith('/'), `Bad root: ${root}`)

	let foundPath: (string | undefined) = undef
	for (const {path} of expandGlobSync(`${root}/**/${fileName}`, {
			root,
			includeDirs: false,
			canonicalize: false
			})) {
		if (defined(foundPath)) {
			croak(`Multiple files named ${fileName} found in ${root}`)
		}
		else {
			foundPath = normalizePath(path)
		}
	}
	return foundPath
}

// ---------------------------------------------------------------------------

export const normalizePath = (
		path: string
		): string => {

	const newpath = path.replaceAll('\\', '/')
	if (newpath.charAt(1) === ':') {
		return newpath.charAt(0).toUpperCase() + newpath.substring(1)
	}
	else {
		return newpath
	}
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

export const toRelPath = (
		path: string,
		root: string = Deno.cwd()
		): string => {

	return normalizePath(relative(root, path))
}

// ---------------------------------------------------------------------------

export const toFullPath = (
		path: string
		): string => {

	return normalizePath(resolve('.', path))
}

// ---------------------------------------------------------------------------

export const isFullPath = (
		path: string
		): boolean => {

	return isAbsolute(path)
}

// ---------------------------------------------------------------------------

export const newerDestFileExists = (
		srcPath: string,
		destPath: string    // --- can be a file extension
		): boolean => {

	// --- source file must exist
	assert(existsSync(srcPath), `No such file: ${srcPath}`)

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

export type TFileStats = {
	isFile: boolean
	isDirectory: boolean
	mtime: (Date | undefined)
	}

export const getFileStats = (
		path: string
		): TFileStats => {

	const hStats = Deno.statSync(path)
	return {
		isFile:      hStats.isFile,
		isDirectory: hStats.isDirectory,
		mtime:       hStats.mtime || undef
		}
}

// ---------------------------------------------------------------------------
// ASYNC

export const allLinesInFile = async function*(
		path: string
		): TAsyncIterator<string> {

	const file = await Deno.open(path)
	const stream = (file.readable
			.pipeThrough(new TextDecoderStream())
			.pipeThrough(new TextLineStream())
			)
	for await (const line of stream) {
		yield line
	}
	return
}

// ---------------------------------------------------------------------------

export const allLinesInFileSync = function*(
		path: string
		): TIterator<string> {

	const text = Deno.readTextFileSync(path)
	for (const line of text.split(/\r?\n/)) {
		yield line
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const mkTempFile = async (
		suffix: string
		): AutoPromise<string> => {

	return await Deno.makeTempFile({suffix})
}

// ---------------------------------------------------------------------------
// ASYNC

export const mkTempFileSync = (
		suffix: string
		): string => {

	return Deno.makeTempFileSync({suffix})
}

// ---------------------------------------------------------------------------

export type TAssertFunc = (
		cond: unknown,
		msg?: string
		) => asserts cond

export const assert: TAssertFunc = (
		cond: unknown,
		msg: string = "An unknown error occurred"
		): asserts cond => {

	if (!cond) {
		croak(msg)
	}
	return
}

export const obviously: TAssertFunc = (
		cond: unknown,
		condStr: string = ''
		): asserts cond => {

	if (!cond) {
		croak(`${condStr || 'condition'} not obviously true`)
		Deno.exit()
	}
	return
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export type RawSourceMap = {
	version: number;           // The version of the source map spec (usually 3)
	file: string;              // The generated file this map is associated with
	sources: string[];         // Array of URLs to the original source files
	names: string[];           // Array of identifiers (names) used in the mappings
	sourceRoot?: string;       // Optional: URL root for the sources
	sourcesContent?: string[]; // Content of the original source files (optional)
	mappings: string;          // The actual encoded mappings (Base64 VLQ)
	}

export type TFilePosition = {
	source: string
	line: number
	col: number
	}

// ---------------------------------------------------------------------------
// ASYNC

export const mapPos = async (
	filePos: TFilePosition
	):AutoPromise<(TFilePosition | undefined)> => {

	const {source, line, col} = filePos
	const contents = await Deno.readTextFile(source)
	const [code, hSrcMap] = extractSourceMap(contents)
	if (defined(hSrcMap)) {
		const consumer = await new SourceMapConsumer(hSrcMap)
		const pos = consumer.originalPositionFor({line, column: col})
		return pos as TFilePosition
	}
	else {
		return undef
	}
}

// ---------------------------------------------------------------------------

export const mapPosSync = (
	filePos: TFilePosition
	): (TFilePosition | undefined) => {

	const {source, line, col} = filePos
	const contents = Deno.readTextFileSync(source)
	const [code, hSrcMap] = extractSourceMap(contents)
	if (defined(hSrcMap)) {
		const [fileNum, srcLine, srcCol] = getOrgPos(hSrcMap, line, col)
		const fileName = hSrcMap.sources[fileNum]
		return {
			source: normalizePath(`${dirname(source)}/${fileName}`),
			line: srcLine,
			col: srcCol
			}
	}
	else {
		return undef
	}
}

// ---------------------------------------------------------------------------

export const extractSourceMap = (
		contents: string
		): [string, RawSourceMap?] => {

	const lMatches = contents.match(/^(.*)\/\/\#\s+sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/s)
	if (lMatches === null) {
		return [contents, undef]
	}
	const [_, code, hSrcMapStr] = lMatches
	const hSrcMap = JSON.parse(atob(hSrcMapStr)) as RawSourceMap
	const {file} = hSrcMap
	hSrcMap.file = toRelPath(file)
	const results=[];for (const path of hSrcMap.sources) {
		results.push(toRelPath(path))
	};hSrcMap.sources = results
	return [code, hSrcMap]
}

// ---------------------------------------------------------------------------

type TOrgPos = [fileNum: number, line: number, col: number]
type TCompareResult = -1 | 0 | 1

const compare = (
		find: [number, number],
		gen:  [number, number]
		): TCompareResult => {

	return (
		  (find[0] < gen[0]) ? -1
		: (find[0] > gen[0]) ?  1
		: (find[1] < gen[1]) ? -1
		: (find[1] > gen[1]) ?  1
		:                       0
		)
}

export const getOrgPos = (
		hSrcMap: RawSourceMap,
		line: number,
		col: number
		): TOrgPos => {

	const lMappings = getMappings(hSrcMap.mappings)
	assert((lMappings.length > 0), "Empty mappings array")
	let pos = 0, end = lMappings.length - 1
	while (pos <= end) {

		// --- Calculate the middle index
		const mid = Math.floor((pos + end) / 2)
		const [tsLine, tsCol, orgFileNum, civetLine, civetCol] = lMappings[mid]
		switch(compare([line, col], [tsLine, tsCol])) {
			case 0: {
				return [orgFileNum, civetLine, civetCol]
			}
			case -1: {
				end = mid - 1;;break;
			}
			case 1: {
				pos = mid + 1;;break;
			}
		}
	}

	// --- If the loop finishes, the target is not in the array
	if (pos < lMappings.length) {
		let [tsLine, tsCol, orgFileNum, civetLine, civetCol] = lMappings[pos]
		if ((tsLine !== line) || (tsCol !== col)) {
			[tsLine, tsCol, orgFileNum, civetLine, civetCol] = lMappings[pos-1]
		}
		return [orgFileNum, civetLine, civetCol]
	}
	else {
		const last = lMappings.at(-1)
		assert(defined(last))
		const [tsLine, tsCol, orgFileNum, civetLine, civetCol] = last
		return [orgFileNum, civetLine, civetCol]
	}
}

// ---------------------------------------------------------------------------

export const getMappings = (
		data: string,
		): number[][] => {

	const lMappings: number[][] = []
	var sum: number[] = [0, 0, 0, 0]
	let i2 = 0;for (const line of data.split(";")) {const lineNum = i2++;
		sum[0] = 0
		decodeLine(line).forEach((p) => {
			for (let end1 = p.length, i3 = 0, asc1 = 0 <= end1; asc1 ? i3 < end1 : i3 > end1; asc1 ? ++i3 : --i3) {const i = i3;
				sum[i] += p[i]
			}
			lMappings.push([lineNum, sum[0], sum[1], sum[2], sum[3]])
		})
	}
	return lMappings
}

// ---------------------------------------------------------------------------

export const decodeLine = (line: string): number[][] => {

	if (line === '') {
		return []
	}

	return (()=>{const results1=[];for (const token of line.split(',')) {
		const lOutput: number[] = []
		let i = 0
		while (i < token.length) {
			let v = 0, d = atob("AAA" + token[i]).charCodeAt(2)
			i += 1
			v |= (d & 31)          // put lowest 5 bits of d into v
			let shift = 5
			while (d & 32) {         // repeat if high bit of d is set
				d = atob("AAA" + token[i]).charCodeAt(2)
				i += 1
				v |= (d & 31) << shift   // put lowest 5 bits of d into v
				shift += 5
			}
			lOutput.push(v & 1 ? -(v >> 1) : v >> 1)
		} // low bit is sign
		results1.push(lOutput)
	}return results1})()
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export type TFrameType = (
	'eval' |
	'native' |
	'constructor' |
	'method' |
	'function' |
	'script' |
	'unknown'
	)

export type TStackFrame = {
	i: number
	type: string
	source: string        // relative file path or 'unknown'
	line: number
	col: number
	name: string          // name of function or method
	orgSource?: string
	orgLine?: number
	orgCol?: number
	}

// ---------------------------------------------------------------------------

export const allStackFrames = function*(
		trace = false
		): TIterator<TStackFrame> {

	process.setSourceMapsEnabled(false)
	openDebugFile('stack')
	const fmt = (line: number, col: number, src: string): string => {
		return `${sprintf('%3d', line)} ${sprintf('%3d', col)} ${src}`
	}

	try {
		// @ts-ignore
		const oldLimit = Error.stackTraceLimit
		// @ts-ignore
		const oldPreparer = Error.prepareStackTrace
		// @ts-ignore
		Error.stackTraceLimit = 99

		let prevFrame: (TStackFrame | undefined) = undefined

		// @ts-ignore
		Error.prepareStackTrace = (error, lOrgFrames) => {

			let lFrames: TStackFrame[] = []

			let i4 = 0;for (const orgFrame of lOrgFrames) {const i = i4++;

				const src = orgFrame.getFileName()    // --- a full path
				if (notdefined(src) || src.match(/ext\:cli\/\d+_test\.js/)) {
					continue
				}

				// --- These are constants
				const orgSource = normalizePath(src)
				const orgLine   = orgFrame.getLineNumber()
				const orgCol    = orgFrame.getColumnNumber()

				DBG('-'.repeat(64))
				DBG(fmt(orgLine, orgCol, orgSource))

				// --- These can be overwritten when using source maps
				let source = orgSource
				let line   = orgLine
				let col    = orgCol

				const functionName = orgFrame.getFunctionName()
				const methodName   = orgFrame.getMethodName()

				// --- follow source maps recursively
				let newFilePos = mapPosSync({source, line, col})
				while (defined(newFilePos)) {
					source = newFilePos.source   // --- already normalized
					line   = newFilePos.line
					col    = newFilePos.col
					DBG(fmt(line, col, source))
					newFilePos = mapPosSync(newFilePos)
				}

				const frame: TStackFrame = {
					i,
					type: (
						  functionName             ? 'function'
						: methodName               ? 'method'
						: orgFrame.isToplevel()    ? 'script'
						: orgFrame.isEval()        ? 'eval'
						: orgFrame.isNative()      ? 'native'
						: orgFrame.isConstructor() ? 'constructor'
						:                            'unknown'
						),
					source,
					line,
					col,
					name: functionName || methodName || ''
					}

				// --- Add original source, line & col if mapped
				if (source !== orgSource) {
					frame.orgSource = orgSource
					frame.orgLine = orgLine
					frame.orgCol = orgCol
				}

				// --- fix a bug in the V8 engine where calls inside a
				//     top level anonymous function is reported as
				//     being of type 'script'

				if (prevFrame && (frame.type === 'script') && (prevFrame.type === 'script')) {
					prevFrame.type = 'function'
					prevFrame.name = '<anon>'
				}

				if (trace) {
					dumpFrame(frame, 'ORG FRAME')
				}
				prevFrame = frame
				lFrames.push(frame)
			}

			return lFrames
		}

		const obj: Object = {}
		Error.captureStackTrace(obj)
		// @ts-ignore
		const lStack: TStackFrame[] = obj.stack

		// --- reset to previous values
		// @ts-ignore
		Error.stackTraceLimit = oldLimit
		// @ts-ignore
		Error.prepareStackTrace = oldPreparer
		for (const frame of lStack) {
			yield frame
		}
		return
	}

	catch (err) {
		console.error(`${red('ERROR in allStackFrames:')} ${getErrStr(err)}`)
		return
	}
	finally {
		closeDebugFile('stack')
	}
}

// ---------------------------------------------------------------------------

export const getMyCaller = (): (TStackFrame | undefined) => {

	let i5 = 0;for (const frame of allStackFrames()) {const i = i5++;
		if (i === 3) {
			return frame
		}
	}
	return undef
}

// ---------------------------------------------------------------------------

export const dumpFrame = (
		frame: TStackFrame,
		label: string = 'FRAME'
		): void => {

	const {i, type, source, line, col, name} = frame
	const typeStr = sprintf('%-8s', type)
	const nameStr = sprintf('%-16s', name)
	if (source) {
		LOG(`${label}[${i}]: ${typeStr} ${nameStr} ${source}:${line}:${col}`)
	}
	else {
		LOG(`${label}[${i}]: ${typeStr} ${nameStr} <none>`)
	}
	return
}

// ---------------------------------------------------------------------------

export const getErrStr = (err: unknown): string => {

	if (typeof err === 'string') {
		return err
	}
	else if (err instanceof AssertionError) {
		const errmsg = err.message || '<No message in Error object>'
		return `${colorize('AssertionError: ', 'red')}${errmsg}`
	}
	else if (err instanceof Error) {
		return err.message || '<No message in Error object>'
	}
	else {
		return "Serious Error"
	}
}

// ---------------------------------------------------------------------------

export const TRY = (func: () => void): void => {

	try {
		func()
	}
	catch (err) {
		croak(err)
	}
	return
}

// ---------------------------------------------------------------------------

export const SKIP = (func: () => void): void => {

	return
}

// ---------------------------------------------------------------------------

export type TPredicate<T=unknown> = (item: T) => boolean

// ---------------------------------------------------------------------------

export const toBool = (x: unknown): boolean => {

	return !!x
}

// ---------------------------------------------------------------------------

export const anyOf = <T,>(
		lItems: T[],
		checkFunc: TPredicate<T> = (x) => toBool(x)
		): boolean => {

	for (const item of lItems) {
		if (checkFunc(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

export const allOf = <T,>(
		lItems: T[],
		checkFunc: TPredicate<T> = (x) => toBool(x)
		): boolean => {

	for (const item of lItems) {
		if (!checkFunc(item)) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const isAsyncGeneratorFunction = (
		x: unknown
		): x is AsyncGeneratorFunction => {

	return (
		   (typeof x === 'function')
		&& (x.toString().match(/\basync\s+function\s*\*/) !== null)
		)
}
// ---------------------------------------------------------------------------

export const allValuesFrom = function*<T>(
		lItems: T[] | TIterator<T>
		): TIterator<T> {

	const iter = Array.isArray(lItems) ? lItems.values() : lItems
	while(true) {
		const {value, done} = iter.next()
		if (done) {
			break
		}
		else {
			yield value
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const allValuesFromAsync = async function*<T>(
		lItems: T[] | TIterator<T> | TAsyncIterator<T>
		): TAsyncIterator<T> {

	const iter = Array.isArray(lItems) ? lItems.values() : lItems
	while(true) {
		const {value, done} = await iter.next()
		if (done) {
			break
		}
		else {
			yield value
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const write = (str: string): void => {

	Deno.stdout.writeSync(encode(str))
	return
}

// ---------------------------------------------------------------------------

export const writeln = (str: string = ''): void => {

	write(str + '\n')
	return
}

// ---------------------------------------------------------------------------

export const clearScreen = (): void => {

	write('\x1b[H\x1b[2J')
	return
}

// ---------------------------------------------------------------------------

export const resetLine = (): void => {

	write("\x1b[2K")
	return
}

// ---------------------------------------------------------------------------

export const clearPreviousLines = (numLines: number): void => {
	// \x1b[nA moves the cursor up 'n' lines
	// \r moves the cursor to the beginning of the line
	// \x1b[K clears the line from the cursor to the end (optional, but good practice)

	Deno.stdout.writeSync(encode(`\x1b[${numLines}A\r\x1b[K`))
}

// ---------------------------------------------------------------------------

export type TColor = 'cyan'|'blue'|'black'|'red'|'green'|'magenta'|'yellow'

export const isColor = (str: string): str is TColor => {

	return ['cyan','blue','black','red','green','magenta','yellow'].includes(str)
}

// ---------------------------------------------------------------------------

export const colorize = (
		str: string,
		color: (string | undefined)
		): string => {

	if (notdefined(color) || !isColor(color)) {
		return str
	}
	switch(color) {
		case 'cyan': { return cyan(str)
		}
		case 'blue': { return blue(str)
		}
		case 'black': { return black(str)
		}
		case 'red': { return red(str)
		}
		case 'green': { return green(str)
		}
		case 'magenta': { return magenta(str)
		}
		case 'yellow': { return yellow(str)
		}
		default: {
			return str
		}
	}
}

// ---------------------------------------------------------------------------
// --- hColors is {<word>: <color>, ... }

type TColorMap = {
	[word: string]: TColor
	}

export const withColors = (
		str: string,
		hColors: TColorMap
		): string => {

	for (const word of Object.keys(hColors)) {
		const color = hColors[word]
		str = str.replaceAll(word, colorize(word, color))
	}
	return str
}

// ---------------------------------------------------------------------------

export const decolorize = (str: string): string => {

	return stripAnsiCode(str)
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM3RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN2RixBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENB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QUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQzNELEFBQUEsQUFBQSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hDLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDWixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6QixBQUFBLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDeEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEIsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNULEFBQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQzNCLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQztBQUMzQixFQUFFLEM7QUFBQyxDQUFBO0FBQ0gsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVUsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDckIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN4QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU07QUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNmLEFBQUE7QUFDQSxBQUFBLENBQVUsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO0FBQzNDLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUE7QUFDdEQsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN4QyxBQUFBLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBO0FBQ25CLEFBQUE7QUFDQSxBQUFBLEVBQUUsaUNBQWdDO0FBQ2xDLEFBQUEsRUFBSyxNQUFILEdBQUcsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQyxBQUFBLEVBQWtELE1BQWhELENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7QUFDcEUsQUFBQSxFQUFFLE1BQU0sQ0FBQSxBQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM5QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0dBQUMsQ0FBQTtBQUM1QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDO0VBQUEsQztDQUFBLENBQUE7QUFDbEIsQUFBQTtBQUNBLEFBQUEsQ0FBQywyREFBMEQ7QUFDM0QsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQzVCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUN2RSxBQUFBLEVBQUUsR0FBRyxDQUFBLENBQUMsTUFBTSxDQUFDLEdBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QyxBQUFBLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQyxDQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEM7RUFBQyxDQUFBO0FBQ3RFLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEM7Q0FBQyxDQUFBO0FBQzFDLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBTSxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxQixBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3RCLEFBQUEsRUFBa0QsTUFBaEQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUMxRCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQztBQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3ZCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xCLEFBQUE7QUFDQSxBQUFBLENBQXNCLE1BQXJCLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDNUIs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QUFFLFNBQVMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM3QyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNmLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BCLEFBQUEsR0FBRyxNQUFNLENBQUMsSTtFQUFJLEM7Q0FBQSxDQUFBO0FBQ2QsQUFBQSxDQUFDLE1BQU0sQ0FBQyxLO0FBQUssQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsQ0FBQyxDLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2QsQUFBQSxFQUFFLFNBQVMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM3QyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNmLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxDQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDeEIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxLO0VBQUssQztDQUFB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Q0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUEsQUFBQyxHQUFHLEM7QUFBQSxDQUFBO0FBQzdFLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNwQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLEtBQUssQyxDLENBQUMsQUFBQyxNLFksQ0FBTztBQUNoQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzNDLEFBQUEsRUFBRSxNQUFNLENBQUMsRztDQUFHLENBQUE7QUFDWixBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNiLEFBQUEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN0QyxBQUFBLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdEMsQUFBQSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQSxDQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3ZDLEFBQUEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUNyQyxBQUFBLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFBLENBQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdkMsQUFBQSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUEsQ0FBQSxDQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3pDLEFBQUEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN4QyxBQUFBLEVBQUUsT0FBSSxDQUFBLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxNQUFNLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLHlDQUF3QztBQUN4QyxBQUFBO0FBQ0EsQUFBQSxBQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQUFBQSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQ3ZCLENBQUMsQ0FBQztBQUNGLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDYixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsU0FBUztBQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2pDLEFBQUEsRUFBTyxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN4QixBQUFBLEVBQUUsR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQztDQUFDLENBQUE7QUFDbkQsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHO0FBQUcsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUM3QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDO0FBQUMsQ0FBQTtBQUMxQiIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBiYXNlLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHByb2Nlc3MgZnJvbSBcIm5vZGU6cHJvY2Vzc1wiXHJcbmltcG9ydCB7XHJcblx0Y3lhbiwgYmx1ZSwgYmxhY2ssIHJlZCwgZ3JlZW4sIG1hZ2VudGEsIHllbGxvdyxcclxuXHRzdHJpcEFuc2lDb2RlLFxyXG5cdH0gZnJvbSAnQHN0ZC9mbXQvY29sb3JzJ1xyXG5pbXBvcnQge0Fzc2VydGlvbkVycm9yfSBmcm9tICdAc3RkL2Fzc2VydCdcclxuaW1wb3J0IHtTb3VyY2VNYXBDb25zdW1lcn0gZnJvbSAnQG1vemlsbGEvc291cmNlLW1hcCdcclxuaW1wb3J0IHtcclxuXHRyZXNvbHZlLCByZWxhdGl2ZSwgaXNBYnNvbHV0ZSwgZnJvbUZpbGVVcmwsIGRpcm5hbWUsXHJcblx0fSBmcm9tICdAc3RkL3BhdGgnXHJcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcydcclxuaW1wb3J0IGRlZXBFcXVhbCBmcm9tICducG0tZmFzdC1kZWVwLWVxdWFsJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtzcHJpbnRmfSBmcm9tICdAc3RkL2ZtdC9wcmludGYnXHJcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXHJcblxyXG5leHBvcnQge2RlZXBFcXVhbH1cclxuZXhwb3J0IGRlZXBDb3B5ID0gc3RydWN0dXJlZENsb25lXHJcblxyXG5teWRpciA6PSBkaXJuYW1lKGZyb21GaWxlVXJsKGltcG9ydC5tZXRhLnVybCkpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUU3RyaW5nU291cmNlID0gVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCBCdWZmZXJTb3VyY2UgfCBzdHJpbmdcclxuXHJcbmVuY29kZXIgOj0gbmV3IFRleHRFbmNvZGVyKClcclxuZXhwb3J0IGVuY29kZSA6PSAoeDogc3RyaW5nKTogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gPT5cclxuXHRyZXR1cm4gZW5jb2Rlci5lbmNvZGUgeFxyXG5cclxuZGVjb2RlciA6PSBuZXcgVGV4dERlY29kZXIoKVxyXG5leHBvcnQgZGVjb2RlIDo9ICh4OiBUU3RyaW5nU291cmNlKTogc3RyaW5nID0+XHJcblx0cmV0dXJuICh0eXBlb2YgeCA9PSAnc3RyaW5nJykgPyB4IDogZGVjb2Rlci5kZWNvZGUoeClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUSXRlcmF0b3I8VEluLCBUT3V0PXZvaWQsIFRBY2M9dm9pZD4gPSBHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUQXN5bmNJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEFzeW5jR2VuZXJhdG9yPFRJbiwgVE91dCwgVEFjYz5cclxuZXhwb3J0IHR5cGUgVE5vbkZ1bmN0aW9uPFQ9dW5rbm93bj4gPSBFeGNsdWRlPFQsIEZ1bmN0aW9uPlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiogZW1wdHlJdGVyYXRvcjxUPXVua25vd24+KCk6IFRJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiogZW1wdHlBc3luY0l0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEFzeW5jSXRlcmF0b3I8VD4gPT5cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGFzcyA6PSAoKTogdm9pZCA9PlxyXG5cdCMgZG8gbm90aGluZ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHNsZWVwIDo9IChzZWM6IG51bWJlcik6IHZvaWQgPT5cclxuXHJcblx0YXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQgciwgMTAwMCAqIHNlYylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdW5kZWYgOj0gdW5kZWZpbmVkXHJcbnR5cGUgVERlZmluZWQgPSBOb25OdWxsYWJsZTx1bmtub3duPlxyXG50eXBlIFROb3REZWZpbmVkID0gbnVsbCB8IHVuZGVmaW5lZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBURGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggIT0gdW5kZWYpICYmICh4ICE9IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueURlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbm90ZGVmaW5lZCA6PSAoeDogdW5rbm93bik6IHggaXMgVE5vdERlZmluZWQgPT5cclxuXHJcblx0cmV0dXJuICh4ID09IHVuZGVmKSB8fCAoeCA9PSBudWxsKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlOb3REZWZpbmVkIDo9ICguLi5sSXRlbXM6IHVua25vd25bXSk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBub3RkZWZpbmVkKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1heCA6PSAoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBudW1iZXIgPT5cclxuXHJcblx0cmV0dXJuICh4ID4geSkgPyB4IDogeVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByYW5nZSA6PSAobjogbnVtYmVyKTogVEl0ZXJhdG9yPG51bWJlcj4gLT5cclxuXHJcblx0Zm9yIGkgb2YgWzAuLi5uXVxyXG5cdFx0eWllbGQgaVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxDaGFycyA6PSAoc3RyOiBzdHJpbmcpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbENoYXJzQXN5bmMgOj0gKHN0cjogc3RyaW5nKTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdFx0YXdhaXQgc2xlZXAgMC4xXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgIExPR0dJTkdcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnNldERlYnVnRmlsZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHJcbmxldCBpbmRlbnRMZXZlbCA9IDBcclxubGV0IGxMb2dMaW5lczogc3RyaW5nW10gPSBbXVxyXG5cclxuZXhwb3J0IElOREVOVCA6PSBTeW1ib2wgJ2luZGVudCdcclxuZXhwb3J0IFVOREVOVCA6PSBTeW1ib2wgJ3VuZGVudCdcclxuXHJcbmV4cG9ydCB0eXBlIFRMb2dMZXZlbCA9ICd0ZXN0aW5nJyB8ICdzaWxlbnQnIHwgJ2luZm8nIHwgJ2RlYnVnJ1xyXG5leHBvcnQgbGV0IGxMb2dMZXZlbHM6IFRMb2dMZXZlbFtdID0gWydpbmZvJ11cclxuZXhwb3J0IGdldExvZ0xldmVscyA6PSAoKSA9PiByZXR1cm4gbExvZ0xldmVsc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvcGVuRGVidWdGaWxlIDo9IChcclxuXHRcdHN0dWI6IHN0cmluZ1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwiLi9sb2dzLyN7c3R1Yn0ubG9nXCJcclxuXHRzZXREZWJ1Z0ZpbGVzLmFkZCBwYXRoXHJcblx0aWYgY2xlYXJcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFwcGVuZERlYnVnRmlsZSA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGJsb2NrIDo9ICh0eXBlb2YgaXRlbSA9PSAnc3RyaW5nJykgPyBpdGVtIDogdG9KU09OKGl0ZW0pXHJcblx0XHRmb3IgcGF0aCBvZiBzZXREZWJ1Z0ZpbGVzXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgYmxvY2sgKyBcIlxcblwiLCB7YXBwZW5kOiB0cnVlfVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbG9zZURlYnVnRmlsZSA6PSAoc3R1Yjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwic3JjL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuZGVsZXRlIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY3VyTG9nTGV2ZWwgOj0gKCk6IFRMb2dMZXZlbCA9PlxyXG5cclxuXHRyZXR1cm4gKGxMb2dMZXZlbHMubGVuZ3RoID09IDApID8gJ2luZm8nIDogbExvZ0xldmVsc1tsTG9nTGV2ZWxzLmxlbmd0aC0xXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RMb2dnaW5nIDo9ICgpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiAoY3VyTG9nTGV2ZWwoKSA9PSAnc2lsZW50JykgfHwgKGN1ckxvZ0xldmVsKCkgPT0gJ3Rlc3RpbmcnKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbml0TG9nTGV2ZWwgOj0gKFxyXG5cdFx0bGV2ZWw6IFRMb2dMZXZlbFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGV2ZWxzID0gW2xldmVsXVxyXG5cdGNvbnNvbGUubG9nIFwiTE9HIExFVkVMIHNldCB0byAje2xldmVsfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHB1c2hMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMucHVzaCBsZXZlbFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwb3BMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdGlmIChsTG9nTGV2ZWxzLmxlbmd0aCA9PSAwKVxyXG5cdFx0cmV0dXJuICdpbmZvJ1xyXG5cdGVsc2VcclxuXHRcdHJlc3VsdCA6PSBsTG9nTGV2ZWxzLnBvcCgpXHJcblx0XHRyZXR1cm4gcmVzdWx0IHx8ICdpbmZvJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pTT04gOj0gKGl0ZW06IHVua25vd24pOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGl0ZW0sIG51bGwsIDMpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IExPRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBub3RMb2dnaW5nKClcclxuXHRcdHJldHVyblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgKGl0ZW0gPT0gSU5ERU5UKVxyXG5cdFx0XHRpbmRlbnRMZXZlbCArPSAxXHJcblx0XHRlbHNlIGlmIChpdGVtID09IFVOREVOVClcclxuXHRcdFx0aWYgKGluZGVudExldmVsID4gMClcclxuXHRcdFx0XHRpbmRlbnRMZXZlbCAtPSAxXHJcblx0XHRlbHNlXHJcblx0XHRcdGxvZ0xpbmUgaXRlbVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBEQkcgOj0gKFxyXG5cdFx0Li4ubEl0ZW1zOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gaWYgYW4gYXBwZW5kIGZpbGUgaXMgZGVmaW5lZCwgb3V0cHV0IGV2ZW4gaWZcclxuXHQjICAgICBjdXJyZW50IGxvZyBsZXZlbCBpcyBub3QgJ2RlYnVnJ1xyXG5cdGFwcGVuZERlYnVnRmlsZSAuLi5sSXRlbXNcclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgPT0gJ2RlYnVnJylcclxuXHRcdExPRyAuLi5sSXRlbXNcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgV0FSTiA6PSAoXHJcblx0XHQuLi5sTXNnczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Zm9yIG1zZyBvZiBsTXNnc1xyXG5cdFx0Y29uc29sZS5lcnJvciBcIiN7Y3lhbignV0FSTklORycpfTogI3ttc2d9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgRVJSIDo9IChcclxuXHRcdGVycjogdW5rbm93blxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdFUlInXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdGxMb2dMaW5lcy5wdXNoIGVyck1zZ1xyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Y29uc29sZS5lcnJvciByZWQobGFiZWwpICsgJzogJyArIGVyck1zZ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE5ldmVyRnVuYyA9IChlcnI6IHVua25vd24pID0+IG5ldmVyXHJcblxyXG5leHBvcnQgY3JvYWs6IFROZXZlckZ1bmMgOj0gKFxyXG5cdFx0ZXJyOiB1bmtub3duXHJcblx0XHQpOiBuZXZlciA9PlxyXG5cclxuXHRlcnJNc2cgOj0gZ2V0RXJyU3RyKGVycilcclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAndGVzdGluZycpXHJcblx0XHQjIC0tLSBhbGxvd3MgdGhlIGVycm9yIHRvIGJlIGNhdWdodCBhbmQgaGFuZGxlZCBvciBpZ25vcmVkXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyTXNnKVxyXG5cdGVsc2VcclxuXHRcdGNvbnNvbGUuZXJyb3IgcmVkKCdDUk9BSycpICsgJzogJyArIGVyck1zZ1xyXG5cdFx0Y29uc29sZS5lcnJvciBcIi0tLS0tICBTVEFDSyAtLS0tLVwiXHJcblx0XHRmb3IgZnJhbWUgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0XHRkdW1wRnJhbWUgZnJhbWVcclxuXHRcdERlbm8uZXhpdCgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHVua25vd25Ub1N0cmluZyA6PSAoeDogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAodHlwZW9mIHggPT0gJ3N0cmluZycpID8geFxyXG5cdFx0OiAoeCA9PSB1bmRlZikgICAgICAgICAgID8gJ3VuZGVmJ1xyXG5cdFx0OiAoeCA9PSBudWxsKSAgICAgICAgICAgID8gJ251bGwnXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh4KVxyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmxvZ0xpbmUgOj0gKFxyXG5cdFx0eDogdW5rbm93bixcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0bGluZSA6PSAnXFx0Jy5yZXBlYXQoaW5kZW50TGV2ZWwpICsgdW5rbm93blRvU3RyaW5nKHgpXHJcblx0Y29uc29sZS5sb2cgbGluZVxyXG5cdGxMb2dMaW5lcy5wdXNoIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJMb2cgOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0bExvZ0xpbmVzLmxlbmd0aCA9IDBcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TG9nIDo9ICgpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGxMb2dMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICAgICAgICAgRmlsZSBTeXN0ZW0gVXRpbHNcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHJcblx0bGV0IGZvdW5kUGF0aDogc3RyaW5nPyA9IHVuZGVmXHJcblx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiwge1xyXG5cdFx0XHRyb290XHJcblx0XHRcdGluY2x1ZGVEaXJzOiBmYWxzZVxyXG5cdFx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHRcdH1cclxuXHRcdGlmIGRlZmluZWQoZm91bmRQYXRoKVxyXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIG5hbWVkICN7ZmlsZU5hbWV9IGZvdW5kIGluICN7cm9vdH1cIlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRmb3VuZFBhdGggPSBub3JtYWxpemVQYXRoIHBhdGhcclxuXHRyZXR1cm4gZm91bmRQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vcm1hbGl6ZVBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0bmV3cGF0aCA6PSBwYXRoLnJlcGxhY2VBbGwgJ1xcXFwnLCAnLydcclxuXHRpZiAobmV3cGF0aC5jaGFyQXQoMSkgPT0gJzonKVxyXG5cdFx0cmV0dXJuIG5ld3BhdGguY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuZXdwYXRoLnN1YnN0cmluZygxKVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbGVFeHQgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBwYXRoLm1hdGNoKC9cXC5bXlxcLl0rJC8pXHJcblx0cmV0dXJuIGxNYXRjaGVzID8gbE1hdGNoZXNbMF0gOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBleHQuc3RhcnRzV2l0aCgnLicpLCBcIkJhZCBmaWxlIGV4dGVuc2lvbjogI3tleHR9XCJcclxuXHRwb3MgOj0gcGF0aC5sYXN0SW5kZXhPZiAnLidcclxuXHRhc3NlcnQgKHBvcyA+PSAwKSwgXCJwYXRoIGNvbnRhaW5zIG5vIHBlcmlvZDogI3twYXRofVwiXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcGF0aC5zdWJzdHJpbmcoMCwgcG9zKSArIGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b1JlbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlKHJvb3QsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVzb2x2ZSgnLicsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBpc0Fic29sdXRlKHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGV4aXN0c1N5bmMoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3NyY1BhdGh9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcylcclxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVN0YXRzID0ge1xyXG5cdGlzRmlsZTogYm9vbGVhblxyXG5cdGlzRGlyZWN0b3J5OiBib29sZWFuXHJcblx0bXRpbWU6IERhdGU/XHJcblx0fVxyXG5cclxuZXhwb3J0IGdldEZpbGVTdGF0cyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRGaWxlU3RhdHMgPT5cclxuXHJcblx0aFN0YXRzIDo9IERlbm8uc3RhdFN5bmMgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRpc0ZpbGU6ICAgICAgaFN0YXRzLmlzRmlsZVxyXG5cdFx0aXNEaXJlY3Rvcnk6IGhTdGF0cy5pc0RpcmVjdG9yeVxyXG5cdFx0bXRpbWU6ICAgICAgIGhTdGF0cy5tdGltZSB8fCB1bmRlZlxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5GaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmaWxlIDo9IGF3YWl0IERlbm8ub3BlbiBwYXRoXHJcblx0c3RyZWFtIDo9IChmaWxlLnJlYWRhYmxlXHJcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dERlY29kZXJTdHJlYW0oKSlcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0TGluZVN0cmVhbSgpKVxyXG5cdFx0XHQpXHJcblx0Zm9yIGF3YWl0IGxpbmUgb2Ygc3RyZWFtXHJcblx0XHR5aWVsZCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5GaWxlU3luYyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdHRleHQgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jKHBhdGgpXHJcblx0Zm9yIGxpbmUgb2YgdGV4dC5zcGxpdCgvXFxyP1xcbi8pXHJcblx0XHR5aWVsZCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZSA6PSAoXHJcblx0XHRzdWZmaXg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBhd2FpdCBEZW5vLm1ha2VUZW1wRmlsZSB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1rVGVtcEZpbGVTeW5jIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIERlbm8ubWFrZVRlbXBGaWxlU3luYyB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRBc3NlcnRGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdG1zZz86IHN0cmluZ1xyXG5cdFx0KSA9PiBhc3NlcnRzIGNvbmRcclxuXHJcbmV4cG9ydCBhc3NlcnQ6IFRBc3NlcnRGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c6IHN0cmluZyA9IFwiQW4gdW5rbm93biBlcnJvciBvY2N1cnJlZFwiXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIG1zZ1xyXG5cdHJldHVyblxyXG5cclxuZXhwb3J0IG9idmlvdXNseTogVEFzc2VydEZ1bmMgOj0gKFxyXG5cdFx0Y29uZDogdW5rbm93blxyXG5cdFx0Y29uZFN0cjogc3RyaW5nID0gJydcclxuXHRcdCk6IGFzc2VydHMgY29uZCA9PlxyXG5cclxuXHRpZiBub3QgY29uZFxyXG5cdFx0Y3JvYWsgXCIje2NvbmRTdHIgfHwgJ2NvbmRpdGlvbid9IG5vdCBvYnZpb3VzbHkgdHJ1ZVwiXHJcblx0XHREZW5vLmV4aXQoKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFJhd1NvdXJjZU1hcCA9IHtcclxuXHR2ZXJzaW9uOiBudW1iZXI7ICAgICAgICAgICAjIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwIHNwZWMgKHVzdWFsbHkgMylcclxuXHRmaWxlOiBzdHJpbmc7ICAgICAgICAgICAgICAjIFRoZSBnZW5lcmF0ZWQgZmlsZSB0aGlzIG1hcCBpcyBhc3NvY2lhdGVkIHdpdGhcclxuXHRzb3VyY2VzOiBzdHJpbmdbXTsgICAgICAgICAjIEFycmF5IG9mIFVSTHMgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlc1xyXG5cdG5hbWVzOiBzdHJpbmdbXTsgICAgICAgICAgICMgQXJyYXkgb2YgaWRlbnRpZmllcnMgKG5hbWVzKSB1c2VkIGluIHRoZSBtYXBwaW5nc1xyXG5cdHNvdXJjZVJvb3Q/OiBzdHJpbmc7ICAgICAgICMgT3B0aW9uYWw6IFVSTCByb290IGZvciB0aGUgc291cmNlc1xyXG5cdHNvdXJjZXNDb250ZW50Pzogc3RyaW5nW107ICMgQ29udGVudCBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzIChvcHRpb25hbClcclxuXHRtYXBwaW5nczogc3RyaW5nOyAgICAgICAgICAjIFRoZSBhY3R1YWwgZW5jb2RlZCBtYXBwaW5ncyAoQmFzZTY0IFZMUSlcclxuXHR9XHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVBvc2l0aW9uID0ge1xyXG5cdHNvdXJjZTogc3RyaW5nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWFwUG9zIDo9IChcclxuXHRmaWxlUG9zOiBURmlsZVBvc2l0aW9uXHJcblx0KTogVEZpbGVQb3NpdGlvbj8gPT5cclxuXHJcblx0e3NvdXJjZSwgbGluZSwgY29sfSA6PSBmaWxlUG9zXHJcblx0Y29udGVudHMgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRjb25zdW1lciA6PSBhd2FpdCBuZXcgU291cmNlTWFwQ29uc3VtZXIoaFNyY01hcClcclxuXHRcdHBvcyA6PSBjb25zdW1lci5vcmlnaW5hbFBvc2l0aW9uRm9yKHtsaW5lLCBjb2x1bW46IGNvbH0pXHJcblx0XHRyZXR1cm4gcG9zIGFzIFRGaWxlUG9zaXRpb25cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWFwUG9zU3luYyA6PSAoXHJcblx0ZmlsZVBvczogVEZpbGVQb3NpdGlvblxyXG5cdCk6IFRGaWxlUG9zaXRpb24/ID0+XHJcblxyXG5cdHtzb3VyY2UsIGxpbmUsIGNvbH0gOj0gZmlsZVBvc1xyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdFtmaWxlTnVtLCBzcmNMaW5lLCBzcmNDb2xdIDo9IGdldE9yZ1BvcyBoU3JjTWFwLCBsaW5lLCBjb2xcclxuXHRcdGZpbGVOYW1lIDo9IGhTcmNNYXAuc291cmNlc1tmaWxlTnVtXVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c291cmNlOiBub3JtYWxpemVQYXRoIFwiI3tkaXJuYW1lKHNvdXJjZSl9LyN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0bGluZTogc3JjTGluZVxyXG5cdFx0XHRjb2w6IHNyY0NvbFxyXG5cdFx0XHR9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGV4dHJhY3RTb3VyY2VNYXAgOj0gKFxyXG5cdFx0Y29udGVudHM6IHN0cmluZ1xyXG5cdFx0KTogW3N0cmluZywgUmF3U291cmNlTWFwP10gPT5cclxuXHJcblx0bE1hdGNoZXMgOj0gY29udGVudHMubWF0Y2ggLy8vXlxyXG5cdFx0XHQoLiopXHJcblx0XHRcdFxcLyBcXC8gXFwjIFxccytcclxuXHRcdFx0c291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uXFwvanNvbjtcclxuXHRcdFx0KD86Y2hhcnNldD11dGYtODspP1xyXG5cdFx0XHRiYXNlNjQsXHJcblx0XHRcdCguKylcclxuXHRcdFx0JC8vL3NcclxuXHRpZiAobE1hdGNoZXMgPT0gbnVsbClcclxuXHRcdHJldHVybiBbY29udGVudHMsIHVuZGVmXVxyXG5cdFtfLCBjb2RlLCBoU3JjTWFwU3RyXSA6PSBsTWF0Y2hlc1xyXG5cdGhTcmNNYXAgOj0gSlNPTi5wYXJzZShhdG9iKGhTcmNNYXBTdHIpKSBhcyBSYXdTb3VyY2VNYXBcclxuXHR7ZmlsZX0gOj0gaFNyY01hcFxyXG5cdGhTcmNNYXAuZmlsZSA9IHRvUmVsUGF0aChmaWxlKVxyXG5cdGhTcmNNYXAuc291cmNlcyA9IGZvciBwYXRoIG9mIGhTcmNNYXAuc291cmNlc1xyXG5cdFx0dG9SZWxQYXRoKHBhdGgpXHJcblx0cmV0dXJuIFtjb2RlLCBoU3JjTWFwXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE9yZ1BvcyA9IFtmaWxlTnVtOiBudW1iZXIsIGxpbmU6IG51bWJlciwgY29sOiBudW1iZXJdXHJcbnR5cGUgVENvbXBhcmVSZXN1bHQgPSAtMSB8IDAgfCAxXHJcblxyXG5jb21wYXJlIDo9IChcclxuXHRcdGZpbmQ6IFtudW1iZXIsIG51bWJlcl0sXHJcblx0XHRnZW46ICBbbnVtYmVyLCBudW1iZXJdXHJcblx0XHQpOiBUQ29tcGFyZVJlc3VsdCA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAoZmluZFswXSA8IGdlblswXSkgPyAtMVxyXG5cdFx0OiAoZmluZFswXSA+IGdlblswXSkgPyAgMVxyXG5cdFx0OiAoZmluZFsxXSA8IGdlblsxXSkgPyAtMVxyXG5cdFx0OiAoZmluZFsxXSA+IGdlblsxXSkgPyAgMVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgICAgMFxyXG5cdFx0KVxyXG5cclxuZXhwb3J0IGdldE9yZ1BvcyA6PSAoXHJcblx0XHRoU3JjTWFwOiBSYXdTb3VyY2VNYXAsXHJcblx0XHRsaW5lOiBudW1iZXIsXHJcblx0XHRjb2w6IG51bWJlclxyXG5cdFx0KTogVE9yZ1BvcyA9PlxyXG5cclxuXHRsTWFwcGluZ3MgOj0gZ2V0TWFwcGluZ3MoaFNyY01hcC5tYXBwaW5ncylcclxuXHRhc3NlcnQgKGxNYXBwaW5ncy5sZW5ndGggPiAwKSwgXCJFbXB0eSBtYXBwaW5ncyBhcnJheVwiXHJcblx0bGV0IHBvcyA9IDAsIGVuZCA9IGxNYXBwaW5ncy5sZW5ndGggLSAxXHJcblx0d2hpbGUgKHBvcyA8PSBlbmQpXHJcblxyXG5cdFx0IyAtLS0gQ2FsY3VsYXRlIHRoZSBtaWRkbGUgaW5kZXhcclxuXHRcdG1pZCA6PSBNYXRoLmZsb29yKChwb3MgKyBlbmQpIC8gMilcclxuXHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA6PSBsTWFwcGluZ3NbbWlkXVxyXG5cdFx0c3dpdGNoIGNvbXBhcmUoW2xpbmUsIGNvbF0sIFt0c0xpbmUsIHRzQ29sXSlcclxuXHRcdFx0d2hlbiAwXHJcblx0XHRcdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cdFx0XHR3aGVuIC0xXHJcblx0XHRcdFx0ZW5kID0gbWlkIC0gMTtcclxuXHRcdFx0d2hlbiAxXHJcblx0XHRcdFx0cG9zID0gbWlkICsgMTtcclxuXHJcblx0IyAtLS0gSWYgdGhlIGxvb3AgZmluaXNoZXMsIHRoZSB0YXJnZXQgaXMgbm90IGluIHRoZSBhcnJheVxyXG5cdGlmIChwb3MgPCBsTWFwcGluZ3MubGVuZ3RoKVxyXG5cdFx0bGV0IFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3NdXHJcblx0XHRpZiAodHNMaW5lICE9IGxpbmUpIHx8ICh0c0NvbCAhPSBjb2wpXHJcblx0XHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3MtMV1cclxuXHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHRlbHNlXHJcblx0XHRsYXN0IDo9IGxNYXBwaW5ncy5hdCgtMSlcclxuXHRcdGFzc2VydCBkZWZpbmVkKGxhc3QpXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbGFzdFxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNYXBwaW5ncyA6PSAoXHJcblx0XHRkYXRhOiBzdHJpbmcsXHJcblx0XHQpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGxNYXBwaW5nczogbnVtYmVyW11bXSA6PSBbXVxyXG5cdHZhciBzdW06IG51bWJlcltdID0gWzAsIDAsIDAsIDBdXHJcblx0Zm9yIGxpbmUsbGluZU51bSBvZiBkYXRhLnNwbGl0KFwiO1wiKVxyXG5cdFx0c3VtWzBdID0gMFxyXG5cdFx0ZGVjb2RlTGluZShsaW5lKS5mb3JFYWNoIChwKSA9PlxyXG5cdFx0XHRmb3IgKGkgb2YgWzAuLi5wLmxlbmd0aF0pXHJcblx0XHRcdFx0c3VtW2ldICs9IHBbaV1cclxuXHRcdFx0bE1hcHBpbmdzLnB1c2ggW2xpbmVOdW0sIHN1bVswXSwgc3VtWzFdLCBzdW1bMl0sIHN1bVszXV1cclxuXHRyZXR1cm4gbE1hcHBpbmdzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29kZUxpbmUgOj0gKGxpbmU6IHN0cmluZyk6IG51bWJlcltdW10gPT5cclxuXHJcblx0aWYgKGxpbmUgPT0gJycpXHJcblx0XHRyZXR1cm4gW11cclxuXHJcblx0cmV0dXJuIGZvciB0b2tlbiBvZiBsaW5lLnNwbGl0KCcsJylcclxuXHRcdGxPdXRwdXQ6IG51bWJlcltdIDo9IFtdXHJcblx0XHRsZXQgaSA9IDBcclxuXHRcdHdoaWxlIChpIDwgdG9rZW4ubGVuZ3RoKVxyXG5cdFx0XHRsZXQgdiA9IDAsIGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRpICs9IDFcclxuXHRcdFx0diB8PSAoZCAmIDMxKSAgICAgICAgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdGxldCBzaGlmdCA9IDVcclxuXHRcdFx0d2hpbGUgKGQgJiAzMikgICAgICAgICAjIHJlcGVhdCBpZiBoaWdoIGJpdCBvZiBkIGlzIHNldFxyXG5cdFx0XHRcdGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRcdGkgKz0gMVxyXG5cdFx0XHRcdHYgfD0gKGQgJiAzMSkgPDwgc2hpZnQgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdFx0c2hpZnQgKz0gNVxyXG5cdFx0XHRsT3V0cHV0LnB1c2godiAmIDEgPyAtKHYgPj4gMSkgOiB2ID4+IDEpICMgbG93IGJpdCBpcyBzaWduXHJcblx0XHRsT3V0cHV0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZyYW1lVHlwZSA9IChcclxuXHQnZXZhbCcgfFxyXG5cdCduYXRpdmUnIHxcclxuXHQnY29uc3RydWN0b3InIHxcclxuXHQnbWV0aG9kJyB8XHJcblx0J2Z1bmN0aW9uJyB8XHJcblx0J3NjcmlwdCcgfFxyXG5cdCd1bmtub3duJ1xyXG5cdClcclxuXHJcbmV4cG9ydCB0eXBlIFRTdGFja0ZyYW1lID0ge1xyXG5cdGk6IG51bWJlclxyXG5cdHR5cGU6IHN0cmluZ1xyXG5cdHNvdXJjZTogc3RyaW5nICAgICAgICAjIHJlbGF0aXZlIGZpbGUgcGF0aCBvciAndW5rbm93bidcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdG5hbWU6IHN0cmluZyAgICAgICAgICAjIG5hbWUgb2YgZnVuY3Rpb24gb3IgbWV0aG9kXHJcblx0b3JnU291cmNlPzogc3RyaW5nXHJcblx0b3JnTGluZT86IG51bWJlclxyXG5cdG9yZ0NvbD86IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsU3RhY2tGcmFtZXMgOj0gKFxyXG5cdFx0dHJhY2UgPSBmYWxzZVxyXG5cdFx0KTogVEl0ZXJhdG9yPFRTdGFja0ZyYW1lPiAtPlxyXG5cclxuXHRwcm9jZXNzLnNldFNvdXJjZU1hcHNFbmFibGVkKGZhbHNlKVxyXG5cdG9wZW5EZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cdGZtdCA6PSAobGluZTogbnVtYmVyLCBjb2w6IG51bWJlciwgc3JjOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBcIiN7c3ByaW50ZignJTNkJywgbGluZSl9ICN7c3ByaW50ZignJTNkJywgY29sKX0gI3tzcmN9XCJcclxuXHJcblx0dHJ5XHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdG9sZExpbWl0IDo9IEVycm9yLnN0YWNrVHJhY2VMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRQcmVwYXJlciA6PSBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSA5OVxyXG5cclxuXHRcdGxldCBwcmV2RnJhbWU6IFRTdGFja0ZyYW1lPyA9IHVuZGVmaW5lZFxyXG5cclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSAoZXJyb3IsIGxPcmdGcmFtZXMpID0+XHJcblxyXG5cdFx0XHRsZXQgbEZyYW1lczogVFN0YWNrRnJhbWVbXSA9IFtdXHJcblxyXG5cdFx0XHRmb3Igb3JnRnJhbWUsaSBvZiBsT3JnRnJhbWVzXHJcblxyXG5cdFx0XHRcdHNyYyA6PSBvcmdGcmFtZS5nZXRGaWxlTmFtZSgpICAgICMgLS0tIGEgZnVsbCBwYXRoXHJcblx0XHRcdFx0aWYgbm90ZGVmaW5lZChzcmMpIHx8IHNyYy5tYXRjaCgvLy9leHQgXFw6IGNsaSBcXC8gXFxkK190ZXN0XFwuanMvLy8pXHJcblx0XHRcdFx0XHRjb250aW51ZVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBhcmUgY29uc3RhbnRzXHJcblx0XHRcdFx0b3JnU291cmNlIDo9IG5vcm1hbGl6ZVBhdGggc3JjXHJcblx0XHRcdFx0b3JnTGluZSAgIDo9IG9yZ0ZyYW1lLmdldExpbmVOdW1iZXIoKVxyXG5cdFx0XHRcdG9yZ0NvbCAgICA6PSBvcmdGcmFtZS5nZXRDb2x1bW5OdW1iZXIoKVxyXG5cclxuXHRcdFx0XHREQkcgJy0nLnJlcGVhdCA2NFxyXG5cdFx0XHRcdERCRyBmbXQob3JnTGluZSwgb3JnQ29sLCBvcmdTb3VyY2UpXHJcblxyXG5cdFx0XHRcdCMgLS0tIFRoZXNlIGNhbiBiZSBvdmVyd3JpdHRlbiB3aGVuIHVzaW5nIHNvdXJjZSBtYXBzXHJcblx0XHRcdFx0bGV0IHNvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdGxldCBsaW5lICAgPSBvcmdMaW5lXHJcblx0XHRcdFx0bGV0IGNvbCAgICA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHRmdW5jdGlvbk5hbWUgOj0gb3JnRnJhbWUuZ2V0RnVuY3Rpb25OYW1lKClcclxuXHRcdFx0XHRtZXRob2ROYW1lICAgOj0gb3JnRnJhbWUuZ2V0TWV0aG9kTmFtZSgpXHJcblxyXG5cdFx0XHRcdCMgLS0tIGZvbGxvdyBzb3VyY2UgbWFwcyByZWN1cnNpdmVseVxyXG5cdFx0XHRcdGxldCBuZXdGaWxlUG9zID0gbWFwUG9zU3luYyh7c291cmNlLCBsaW5lLCBjb2x9KVxyXG5cdFx0XHRcdHdoaWxlIGRlZmluZWQobmV3RmlsZVBvcylcclxuXHRcdFx0XHRcdHNvdXJjZSA9IG5ld0ZpbGVQb3Muc291cmNlICAgIyAtLS0gYWxyZWFkeSBub3JtYWxpemVkXHJcblx0XHRcdFx0XHRsaW5lICAgPSBuZXdGaWxlUG9zLmxpbmVcclxuXHRcdFx0XHRcdGNvbCAgICA9IG5ld0ZpbGVQb3MuY29sXHJcblx0XHRcdFx0XHREQkcgZm10KGxpbmUsIGNvbCwgc291cmNlKVxyXG5cdFx0XHRcdFx0bmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMobmV3RmlsZVBvcylcclxuXHJcblx0XHRcdFx0ZnJhbWU6IFRTdGFja0ZyYW1lIDo9IHtcclxuXHRcdFx0XHRcdGlcclxuXHRcdFx0XHRcdHR5cGU6IChcclxuXHRcdFx0XHRcdFx0ICBmdW5jdGlvbk5hbWUgICAgICAgICAgICAgPyAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRcdDogbWV0aG9kTmFtZSAgICAgICAgICAgICAgID8gJ21ldGhvZCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc1RvcGxldmVsKCkgICAgPyAnc2NyaXB0J1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzRXZhbCgpICAgICAgICA/ICdldmFsJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzTmF0aXZlKCkgICAgICA/ICduYXRpdmUnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNDb25zdHJ1Y3RvcigpID8gJ2NvbnN0cnVjdG9yJ1xyXG5cdFx0XHRcdFx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0XHRcdFx0XHQpXHJcblx0XHRcdFx0XHRzb3VyY2VcclxuXHRcdFx0XHRcdGxpbmVcclxuXHRcdFx0XHRcdGNvbFxyXG5cdFx0XHRcdFx0bmFtZTogZnVuY3Rpb25OYW1lIHx8IG1ldGhvZE5hbWUgfHwgJydcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0IyAtLS0gQWRkIG9yaWdpbmFsIHNvdXJjZSwgbGluZSAmIGNvbCBpZiBtYXBwZWRcclxuXHRcdFx0XHRpZiAoc291cmNlICE9IG9yZ1NvdXJjZSlcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ1NvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnTGluZSA9IG9yZ0xpbmVcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0NvbCA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHQjIC0tLSBmaXggYSBidWcgaW4gdGhlIFY4IGVuZ2luZSB3aGVyZSBjYWxscyBpbnNpZGUgYVxyXG5cdFx0XHRcdCMgICAgIHRvcCBsZXZlbCBhbm9ueW1vdXMgZnVuY3Rpb24gaXMgcmVwb3J0ZWQgYXNcclxuXHRcdFx0XHQjICAgICBiZWluZyBvZiB0eXBlICdzY3JpcHQnXHJcblxyXG5cdFx0XHRcdGlmIHByZXZGcmFtZSAmJiAoZnJhbWUudHlwZSA9PSAnc2NyaXB0JykgJiYgKHByZXZGcmFtZS50eXBlID09ICdzY3JpcHQnKVxyXG5cdFx0XHRcdFx0cHJldkZyYW1lLnR5cGUgPSAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUubmFtZSA9ICc8YW5vbj4nXHJcblxyXG5cdFx0XHRcdGlmIHRyYWNlXHJcblx0XHRcdFx0XHRkdW1wRnJhbWUgZnJhbWUsICdPUkcgRlJBTUUnXHJcblx0XHRcdFx0cHJldkZyYW1lID0gZnJhbWVcclxuXHRcdFx0XHRsRnJhbWVzLnB1c2ggZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblx0XHRmb3IgZnJhbWUgb2YgbFN0YWNrXHJcblx0XHRcdHlpZWxkIGZyYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tyZWQoJ0VSUk9SIGluIGFsbFN0YWNrRnJhbWVzOicpfSAje2dldEVyclN0cihlcnIpfVwiXHJcblx0XHRyZXR1cm5cclxuXHRmaW5hbGx5XHJcblx0XHRjbG9zZURlYnVnRmlsZSAnc3RhY2snXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE15Q2FsbGVyIDo9ICgpOiBUU3RhY2tGcmFtZT8gPT5cclxuXHJcblx0Zm9yIGZyYW1lLGkgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0aWYgKGkgPT0gMylcclxuXHRcdFx0cmV0dXJuIGZyYW1lXHJcblx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGR1bXBGcmFtZSA6PSAoXHJcblx0XHRmcmFtZTogVFN0YWNrRnJhbWUsXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0ZSQU1FJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7aSwgdHlwZSwgc291cmNlLCBsaW5lLCBjb2wsIG5hbWV9IDo9IGZyYW1lXHJcblx0dHlwZVN0ciA6PSBzcHJpbnRmKCclLThzJywgdHlwZSlcclxuXHRuYW1lU3RyIDo9IHNwcmludGYoJyUtMTZzJywgbmFtZSlcclxuXHRpZiBzb3VyY2VcclxuXHRcdExPRyBcIiN7bGFiZWx9WyN7aX1dOiAje3R5cGVTdHJ9ICN7bmFtZVN0cn0gI3tzb3VyY2V9OiN7bGluZX06I3tjb2x9XCJcclxuXHRlbHNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9IDxub25lPlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEVyclN0ciA6PSAoZXJyOiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG5cdFx0cmV0dXJuIGVyclxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yKVxyXG5cdFx0ZXJybXNnIDo9IGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdFx0cmV0dXJuIFwiI3tjb2xvcml6ZSgnQXNzZXJ0aW9uRXJyb3I6ICcsICdyZWQnKX0je2Vycm1zZ31cIlxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKVxyXG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiBcIlNlcmlvdXMgRXJyb3JcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBUUlkgOj0gKGZ1bmM6ICgpID0+IHZvaWQpOiB2b2lkID0+XHJcblxyXG5cdHRyeVxyXG5cdFx0ZnVuYygpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjcm9hayBlcnJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgU0tJUCA6PSAoZnVuYzogKCkgPT4gdm9pZCk6IHZvaWQgPT5cclxuXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFByZWRpY2F0ZTxUPXVua25vd24+ID0gKGl0ZW06IFQpID0+IGJvb2xlYW5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9Cb29sIDo9ICh4OiB1bmtub3duKTogYm9vbGVhbiA9PlxyXG5cclxuXHRyZXR1cm4gbm90IG5vdCB4XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU9mIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdLFxyXG5cdFx0Y2hlY2tGdW5jOiBUUHJlZGljYXRlPFQ+ID0gKHgpID0+IHRvQm9vbCh4KVxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIGNoZWNrRnVuYyhpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxPZiA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSxcclxuXHRcdGNoZWNrRnVuYzogVFByZWRpY2F0ZTxUPiA9ICh4KSA9PiB0b0Jvb2woeClcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBub3QgY2hlY2tGdW5jKGl0ZW0pXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdHJldHVybiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuaXNBc3luY0dlbmVyYXRvckZ1bmN0aW9uIDo9IChcclxuXHRcdHg6IHVua25vd25cclxuXHRcdCk6IHggaXMgQXN5bmNHZW5lcmF0b3JGdW5jdGlvbiA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAgKHR5cGVvZiB4ID09ICdmdW5jdGlvbicpXHJcblx0XHQmJiAoeC50b1N0cmluZygpLm1hdGNoKC9cXGJhc3luY1xccytmdW5jdGlvblxccypcXCovKSAhPSBudWxsKVxyXG5cdFx0KVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFZhbHVlc0Zyb20gOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRJdGVyYXRvcjxUPiAtPlxyXG5cclxuXHRpdGVyIDo9IEFycmF5LmlzQXJyYXkobEl0ZW1zKSA/IGxJdGVtcy52YWx1ZXMoKSA6IGxJdGVtc1xyXG5cdGxvb3BcclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0YnJlYWtcclxuXHRcdGVsc2VcclxuXHRcdFx0eWllbGQgdmFsdWVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbUFzeW5jIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdIHwgVEl0ZXJhdG9yPFQ+IHwgVEFzeW5jSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRBc3luY0l0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBhd2FpdCBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3cml0ZSA6PSAoc3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGUoc3RyKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3cml0ZWxuIDo9IChzdHI6IHN0cmluZyA9ICcnKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBzdHIgKyAnXFxuJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhclNjcmVlbiA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSAnXFx4MWJbSFxceDFiWzJKJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZXNldExpbmUgOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgXCJcXHgxYlsyS1wiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyUHJldmlvdXNMaW5lcyA6PSAobnVtTGluZXM6IG51bWJlcik6IHZvaWQgPT5cclxuXHQjIFxceDFiW25BIG1vdmVzIHRoZSBjdXJzb3IgdXAgJ24nIGxpbmVzXHJcblx0IyBcXHIgbW92ZXMgdGhlIGN1cnNvciB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaW5lXHJcblx0IyBcXHgxYltLIGNsZWFycyB0aGUgbGluZSBmcm9tIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCAob3B0aW9uYWwsIGJ1dCBnb29kIHByYWN0aWNlKVxyXG5cclxuXHREZW5vLnN0ZG91dC53cml0ZVN5bmMgZW5jb2RlKFwiXFx4MWJbI3tudW1MaW5lc31BXFxyXFx4MWJbS1wiKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRDb2xvciA9ICdjeWFuJ3wnYmx1ZSd8J2JsYWNrJ3wncmVkJ3wnZ3JlZW4nfCdtYWdlbnRhJ3wneWVsbG93J1xyXG5cclxuZXhwb3J0IGlzQ29sb3IgOj0gKHN0cjogc3RyaW5nKTogc3RyIGlzIFRDb2xvciA9PlxyXG5cclxuXHRyZXR1cm4gWydjeWFuJywnYmx1ZScsJ2JsYWNrJywncmVkJywnZ3JlZW4nLCdtYWdlbnRhJywneWVsbG93J10uaW5jbHVkZXMgc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNvbG9yaXplIDo9IChcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0Y29sb3I6IHN0cmluZz9cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKGNvbG9yKSB8fCBub3QgaXNDb2xvcihjb2xvcilcclxuXHRcdHJldHVybiBzdHJcclxuXHRzd2l0Y2ggY29sb3JcclxuXHRcdHdoZW4gJ2N5YW4nICAgIHRoZW4gcmV0dXJuIGN5YW4oc3RyKVxyXG5cdFx0d2hlbiAnYmx1ZScgICAgdGhlbiByZXR1cm4gYmx1ZShzdHIpXHJcblx0XHR3aGVuICdibGFjaycgICB0aGVuIHJldHVybiBibGFjayhzdHIpXHJcblx0XHR3aGVuICdyZWQnICAgICB0aGVuIHJldHVybiByZWQoc3RyKVxyXG5cdFx0d2hlbiAnZ3JlZW4nICAgdGhlbiByZXR1cm4gZ3JlZW4oc3RyKVxyXG5cdFx0d2hlbiAnbWFnZW50YScgdGhlbiByZXR1cm4gbWFnZW50YShzdHIpXHJcblx0XHR3aGVuICd5ZWxsb3cnICB0aGVuIHJldHVybiB5ZWxsb3coc3RyKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBoQ29sb3JzIGlzIHs8d29yZD46IDxjb2xvcj4sIC4uLiB9XHJcblxyXG50eXBlIFRDb2xvck1hcCA9IHtcclxuXHRbd29yZDogc3RyaW5nXTogVENvbG9yXHJcblx0fVxyXG5cclxuZXhwb3J0IHdpdGhDb2xvcnMgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmdcclxuXHRcdGhDb2xvcnM6IFRDb2xvck1hcFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGZvciB3b3JkIG9mIE9iamVjdC5rZXlzKGhDb2xvcnMpXHJcblx0XHRjb2xvciA6PSBoQ29sb3JzW3dvcmRdXHJcblx0XHRzdHIgPSBzdHIucmVwbGFjZUFsbCh3b3JkLCBjb2xvcml6ZSh3b3JkLCBjb2xvcikpXHJcblx0cmV0dXJuIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWNvbG9yaXplIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyaXBBbnNpQ29kZShzdHIpXHJcbiJdfQ==