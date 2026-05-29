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

type TNeverFunc = (err: string) => never

export const croak: TNeverFunc = (
		errMsg: string
		): never => {

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
		assert(defined(destms), "destms not defined")
		const srcms  = getFileStats(srcPath).mtime
		assert(defined(srcms), "srcms not defined")
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
		msg: string
		) => asserts cond

export const assert: TAssertFunc = (
		cond: unknown,
		msg: string
		): asserts cond => {

	if (!cond) {
		croak(msg)
	}
	return
}

type TObviouslyFunc = (
		cond: unknown,
		condStr?: string
		) => asserts cond

export const obviously: TObviouslyFunc = (
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
		assert(defined(last), "last not defined")
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
		return "SERIOUS ERROR"
	}
}

// ---------------------------------------------------------------------------

export const TRY = (
		func: () => void
		): void => {

	try {
		func()
	}
	catch (err) {
		croak(`in TRY(): ${getErrStr(err)}`)
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM3RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN2RixBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENB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O0FBQ0EsQUFBQSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQ3RELEFBQUEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ2pCLEFBQUEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ3BCLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDOUIsQUFBQTtBQUNBLEFBQUEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDLENBQUUsQ0FBQyxDQUFDO0FBQ3JCLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDOUIsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLEM7QUFBQyxDQUFBO0FBQzVCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLGlDQUFnQztBQUNoQyxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNwQixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFBO0FBQ2xCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFD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QUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQyxBQUFBLEVBQWtELE1BQWhELENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7QUFDcEUsQUFBQSxFQUFFLE1BQU0sQ0FBQSxBQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM5QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0dBQUMsQ0FBQTtBQUM1QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDO0VBQUEsQztDQUFBLENBQUE7QUFDbEIsQUFBQTtBQUNBLEFBQUEsQ0FBQywyREFBMEQ7QUFDM0QsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQzVCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxD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Q0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBLEM7Q0FBQSxDQUFBO0FBQzNELEFBQUEsQ0FBQyxNQUFNLENBQUMsUztBQUFTLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDO0NBQUMsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDLEMsQyxDLEUsQyxLLEMsUSxHLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BDLEFBQUEsRUFBbUIsTUFBakIsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3pCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ1gsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUE7QUFDMUIsQUFBQSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMs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QUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFJLENBQUksQztBQUFDLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxDQUFDLEMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDZCxBQUFBLEVBQUUsU0FBUyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2YsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNuQixBQUFBLEVBQUUsR0FBRyxDQUFBLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDcEIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxJO0VBQUksQztDQUFBLENBQUE7QUFDZCxBQUFBLENBQUMsTUFBTSxDQUFDLEs7QUFBSyxDQUFBO0FBQ2IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxDQUFDLEMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDZCxBQUFBLEVBQUUsU0FBUyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdDLEVBQUUsQ0FBQyxDQUFDLENBQUMs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O0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDakMsQUFBQSxFQUFPLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDO0NBQUMsQ0FBQTtBQUNuRCxBQUFBLENBQUMsTUFBTSxDQUFDLEc7QUFBRyxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEM7QUFBQyxDQUFBO0FBQzFCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGJhc2UubGliLmNpdmV0XHJcblxyXG5pbXBvcnQgcHJvY2VzcyBmcm9tIFwibm9kZTpwcm9jZXNzXCJcclxuaW1wb3J0IHtcclxuXHRjeWFuLCBibHVlLCBibGFjaywgcmVkLCBncmVlbiwgbWFnZW50YSwgeWVsbG93LFxyXG5cdHN0cmlwQW5zaUNvZGUsXHJcblx0fSBmcm9tICdAc3RkL2ZtdC9jb2xvcnMnXHJcbmltcG9ydCB7QXNzZXJ0aW9uRXJyb3J9IGZyb20gJ0BzdGQvYXNzZXJ0J1xyXG5pbXBvcnQge1NvdXJjZU1hcENvbnN1bWVyfSBmcm9tICdAbW96aWxsYS9zb3VyY2UtbWFwJ1xyXG5pbXBvcnQge1xyXG5cdHJlc29sdmUsIHJlbGF0aXZlLCBpc0Fic29sdXRlLCBmcm9tRmlsZVVybCwgZGlybmFtZSxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zJ1xyXG5pbXBvcnQgZGVlcEVxdWFsIGZyb20gJ25wbS1mYXN0LWRlZXAtZXF1YWwnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5leHBvcnQgZGVlcENvcHkgPSBzdHJ1Y3R1cmVkQ2xvbmVcclxuXHJcbm15ZGlyIDo9IGRpcm5hbWUoZnJvbUZpbGVVcmwoaW1wb3J0Lm1ldGEudXJsKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRTdHJpbmdTb3VyY2UgPSBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IEJ1ZmZlclNvdXJjZSB8IHN0cmluZ1xyXG5cclxuZW5jb2RlciA6PSBuZXcgVGV4dEVuY29kZXIoKVxyXG5leHBvcnQgZW5jb2RlIDo9ICh4OiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiA9PlxyXG5cdHJldHVybiBlbmNvZGVyLmVuY29kZSB4XHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlcigpXHJcbmV4cG9ydCBkZWNvZGUgOj0gKHg6IFRTdHJpbmdTb3VyY2UpOiBzdHJpbmcgPT5cclxuXHRyZXR1cm4gKHR5cGVvZiB4ID09ICdzdHJpbmcnKSA/IHggOiBkZWNvZGVyLmRlY29kZSh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEdlbmVyYXRvcjxUSW4sIFRPdXQsIFRBY2M+XHJcbmV4cG9ydCB0eXBlIFRBc3luY0l0ZXJhdG9yPFRJbiwgVE91dD12b2lkLCBUQWNjPXZvaWQ+ID0gQXN5bmNHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUTm9uRnVuY3Rpb248VD11bmtub3duPiA9IEV4Y2x1ZGU8VCwgRnVuY3Rpb24+XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uKiBlbXB0eUl0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEl0ZXJhdG9yPFQ+ID0+XHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uKiBlbXB0eUFzeW5jSXRlcmF0b3I8VD11bmtub3duPigpOiBUQXN5bmNJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXNzIDo9ICgpOiB2b2lkID0+XHJcblx0IyBkbyBub3RoaW5nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgc2xlZXAgOj0gKHNlYzogbnVtYmVyKTogdm9pZCA9PlxyXG5cclxuXHRhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dCByLCAxMDAwICogc2VjKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bmRlZiA6PSB1bmRlZmluZWRcclxudHlwZSBURGVmaW5lZCA9IE5vbk51bGxhYmxlPHVua25vd24+XHJcbnR5cGUgVE5vdERlZmluZWQgPSBudWxsIHwgdW5kZWZpbmVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlZmluZWQgOj0gKHg6IHVua25vd24pOiB4IGlzIFREZWZpbmVkID0+XHJcblxyXG5cdHJldHVybiAoeCAhPSB1bmRlZikgJiYgKHggIT0gbnVsbClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55RGVmaW5lZCA6PSAoLi4ubEl0ZW1zOiB1bmtub3duW10pOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgZGVmaW5lZChpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBUTm90RGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggPT0gdW5kZWYpIHx8ICh4ID09IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU5vdERlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWF4IDo9ICh4OiBudW1iZXIsIHk6IG51bWJlcik6IG51bWJlciA9PlxyXG5cclxuXHRyZXR1cm4gKHggPiB5KSA/IHggOiB5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJhbmdlIDo9IChuOiBudW1iZXIpOiBUSXRlcmF0b3I8bnVtYmVyPiAtPlxyXG5cclxuXHRmb3IgaSBvZiBbMC4uLm5dXHJcblx0XHR5aWVsZCBpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbENoYXJzIDo9IChzdHI6IHN0cmluZyk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZvciBjaCBvZiBzdHJcclxuXHRcdHlpZWxkIGNoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgYWxsQ2hhcnNBc3luYyA6PSAoc3RyOiBzdHJpbmcpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZvciBjaCBvZiBzdHJcclxuXHRcdHlpZWxkIGNoXHJcblx0XHRhd2FpdCBzbGVlcCAwLjFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgICAgICAgICAgTE9HR0lOR1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuc2V0RGVidWdGaWxlcyA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cclxubGV0IGluZGVudExldmVsID0gMFxyXG5sZXQgbExvZ0xpbmVzOiBzdHJpbmdbXSA9IFtdXHJcblxyXG5leHBvcnQgSU5ERU5UIDo9IFN5bWJvbCAnaW5kZW50J1xyXG5leHBvcnQgVU5ERU5UIDo9IFN5bWJvbCAndW5kZW50J1xyXG5cclxuZXhwb3J0IHR5cGUgVExvZ0xldmVsID0gJ3Rlc3RpbmcnIHwgJ3NpbGVudCcgfCAnaW5mbycgfCAnZGVidWcnXHJcbmV4cG9ydCBsZXQgbExvZ0xldmVsczogVExvZ0xldmVsW10gPSBbJ2luZm8nXVxyXG5leHBvcnQgZ2V0TG9nTGV2ZWxzIDo9ICgpID0+IHJldHVybiBsTG9nTGV2ZWxzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG9wZW5EZWJ1Z0ZpbGUgOj0gKFxyXG5cdFx0c3R1Yjogc3RyaW5nXHJcblx0XHRjbGVhcjogYm9vbGVhbiA9IGZhbHNlXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHBhdGggOj0gXCIuL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuYWRkIHBhdGhcclxuXHRpZiBjbGVhclxyXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXBwZW5kRGVidWdGaWxlIDo9IChcclxuXHRcdC4uLmxJdGVtczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0YmxvY2sgOj0gKHR5cGVvZiBpdGVtID09ICdzdHJpbmcnKSA/IGl0ZW0gOiB0b0pTT04oaXRlbSlcclxuXHRcdGZvciBwYXRoIG9mIHNldERlYnVnRmlsZXNcclxuXHRcdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBibG9jayArIFwiXFxuXCIsIHthcHBlbmQ6IHRydWV9XHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsb3NlRGVidWdGaWxlIDo9IChzdHViOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHBhdGggOj0gXCJzcmMvbG9ncy8je3N0dWJ9LmxvZ1wiXHJcblx0c2V0RGVidWdGaWxlcy5kZWxldGUgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjdXJMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdHJldHVybiAobExvZ0xldmVscy5sZW5ndGggPT0gMCkgPyAnaW5mbycgOiBsTG9nTGV2ZWxzW2xMb2dMZXZlbHMubGVuZ3RoLTFdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vdExvZ2dpbmcgOj0gKCk6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIChjdXJMb2dMZXZlbCgpID09ICdzaWxlbnQnKSB8fCAoY3VyTG9nTGV2ZWwoKSA9PSAndGVzdGluZycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGluaXRMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMgPSBbbGV2ZWxdXHJcblx0Y29uc29sZS5sb2cgXCJMT0cgTEVWRUwgc2V0IHRvICN7bGV2ZWx9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcHVzaExvZ0xldmVsIDo9IChcclxuXHRcdGxldmVsOiBUTG9nTGV2ZWxcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0bExvZ0xldmVscy5wdXNoIGxldmVsXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBvcExvZ0xldmVsIDo9ICgpOiBUTG9nTGV2ZWwgPT5cclxuXHJcblx0aWYgKGxMb2dMZXZlbHMubGVuZ3RoID09IDApXHJcblx0XHRyZXR1cm4gJ2luZm8nXHJcblx0ZWxzZVxyXG5cdFx0cmVzdWx0IDo9IGxMb2dMZXZlbHMucG9wKClcclxuXHRcdHJldHVybiByZXN1bHQgfHwgJ2luZm8nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvSlNPTiA6PSAoaXRlbTogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoaXRlbSwgbnVsbCwgMylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgTE9HIDo9IChcclxuXHRcdC4uLmxJdGVtczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiAoaXRlbSA9PSBJTkRFTlQpXHJcblx0XHRcdGluZGVudExldmVsICs9IDFcclxuXHRcdGVsc2UgaWYgKGl0ZW0gPT0gVU5ERU5UKVxyXG5cdFx0XHRpZiAoaW5kZW50TGV2ZWwgPiAwKVxyXG5cdFx0XHRcdGluZGVudExldmVsIC09IDFcclxuXHRcdGVsc2VcclxuXHRcdFx0bG9nTGluZSBpdGVtXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IERCRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHQjIC0tLSBpZiBhbiBhcHBlbmQgZmlsZSBpcyBkZWZpbmVkLCBvdXRwdXQgZXZlbiBpZlxyXG5cdCMgICAgIGN1cnJlbnQgbG9nIGxldmVsIGlzIG5vdCAnZGVidWcnXHJcblx0YXBwZW5kRGVidWdGaWxlIC4uLmxJdGVtc1xyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAnZGVidWcnKVxyXG5cdFx0TE9HIC4uLmxJdGVtc1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBXQVJOIDo9IChcclxuXHRcdC4uLmxNc2dzOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgbm90TG9nZ2luZygpXHJcblx0XHRyZXR1cm5cclxuXHRmb3IgbXNnIG9mIGxNc2dzXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tjeWFuKCdXQVJOSU5HJyl9OiAje21zZ31cIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBFUlIgOj0gKFxyXG5cdFx0ZXJyOiB1bmtub3duXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0VSUidcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0ZXJyTXNnIDo9IGdldEVyclN0cihlcnIpXHJcblx0bExvZ0xpbmVzLnB1c2ggZXJyTXNnXHJcblx0aWYgbm90TG9nZ2luZygpXHJcblx0XHRyZXR1cm5cclxuXHRjb25zb2xlLmVycm9yIHJlZChsYWJlbCkgKyAnOiAnICsgZXJyTXNnXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUTmV2ZXJGdW5jID0gKGVycjogc3RyaW5nKSA9PiBuZXZlclxyXG5cclxuZXhwb3J0IGNyb2FrOiBUTmV2ZXJGdW5jIDo9IChcclxuXHRcdGVyck1zZzogc3RyaW5nXHJcblx0XHQpOiBuZXZlciA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAndGVzdGluZycpXHJcblx0XHQjIC0tLSBhbGxvd3MgdGhlIGVycm9yIHRvIGJlIGNhdWdodCBhbmQgaGFuZGxlZCBvciBpZ25vcmVkXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyTXNnKVxyXG5cdGVsc2VcclxuXHRcdGNvbnNvbGUuZXJyb3IgcmVkKCdDUk9BSycpICsgJzogJyArIGVyck1zZ1xyXG5cdFx0Y29uc29sZS5lcnJvciBcIi0tLS0tICBTVEFDSyAtLS0tLVwiXHJcblx0XHRmb3IgZnJhbWUgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0XHRkdW1wRnJhbWUgZnJhbWVcclxuXHRcdERlbm8uZXhpdCgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHVua25vd25Ub1N0cmluZyA6PSAoeDogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAodHlwZW9mIHggPT0gJ3N0cmluZycpID8geFxyXG5cdFx0OiAoeCA9PSB1bmRlZikgICAgICAgICAgID8gJ3VuZGVmJ1xyXG5cdFx0OiAoeCA9PSBudWxsKSAgICAgICAgICAgID8gJ251bGwnXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh4KVxyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmxvZ0xpbmUgOj0gKFxyXG5cdFx0eDogdW5rbm93bixcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0bGluZSA6PSAnXFx0Jy5yZXBlYXQoaW5kZW50TGV2ZWwpICsgdW5rbm93blRvU3RyaW5nKHgpXHJcblx0Y29uc29sZS5sb2cgbGluZVxyXG5cdGxMb2dMaW5lcy5wdXNoIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJMb2cgOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0bExvZ0xpbmVzLmxlbmd0aCA9IDBcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TG9nIDo9ICgpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGxMb2dMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICAgICAgICAgRmlsZSBTeXN0ZW0gVXRpbHNcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHJcblx0bGV0IGZvdW5kUGF0aDogc3RyaW5nPyA9IHVuZGVmXHJcblx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiwge1xyXG5cdFx0XHRyb290XHJcblx0XHRcdGluY2x1ZGVEaXJzOiBmYWxzZVxyXG5cdFx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHRcdH1cclxuXHRcdGlmIGRlZmluZWQoZm91bmRQYXRoKVxyXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIG5hbWVkICN7ZmlsZU5hbWV9IGZvdW5kIGluICN7cm9vdH1cIlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRmb3VuZFBhdGggPSBub3JtYWxpemVQYXRoIHBhdGhcclxuXHRyZXR1cm4gZm91bmRQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vcm1hbGl6ZVBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0bmV3cGF0aCA6PSBwYXRoLnJlcGxhY2VBbGwgJ1xcXFwnLCAnLydcclxuXHRpZiAobmV3cGF0aC5jaGFyQXQoMSkgPT0gJzonKVxyXG5cdFx0cmV0dXJuIG5ld3BhdGguY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuZXdwYXRoLnN1YnN0cmluZygxKVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbGVFeHQgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBwYXRoLm1hdGNoKC9cXC5bXlxcLl0rJC8pXHJcblx0cmV0dXJuIGxNYXRjaGVzID8gbE1hdGNoZXNbMF0gOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBleHQuc3RhcnRzV2l0aCgnLicpLCBcIkJhZCBmaWxlIGV4dGVuc2lvbjogI3tleHR9XCJcclxuXHRwb3MgOj0gcGF0aC5sYXN0SW5kZXhPZiAnLidcclxuXHRhc3NlcnQgKHBvcyA+PSAwKSwgXCJwYXRoIGNvbnRhaW5zIG5vIHBlcmlvZDogI3twYXRofVwiXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcGF0aC5zdWJzdHJpbmcoMCwgcG9zKSArIGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b1JlbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlKHJvb3QsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVzb2x2ZSgnLicsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBpc0Fic29sdXRlKHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGV4aXN0c1N5bmMoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3NyY1BhdGh9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpLCBcImRlc3RtcyBub3QgZGVmaW5lZFwiXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcyksIFwic3JjbXMgbm90IGRlZmluZWRcIlxyXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcclxuXHRjYXRjaCBlcnJcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlU3RhdHMgPSB7XHJcblx0aXNGaWxlOiBib29sZWFuXHJcblx0aXNEaXJlY3Rvcnk6IGJvb2xlYW5cclxuXHRtdGltZTogRGF0ZT9cclxuXHR9XHJcblxyXG5leHBvcnQgZ2V0RmlsZVN0YXRzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEZpbGVTdGF0cyA9PlxyXG5cclxuXHRoU3RhdHMgOj0gRGVuby5zdGF0U3luYyBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGlzRmlsZTogICAgICBoU3RhdHMuaXNGaWxlXHJcblx0XHRpc0RpcmVjdG9yeTogaFN0YXRzLmlzRGlyZWN0b3J5XHJcblx0XHRtdGltZTogICAgICAgaFN0YXRzLm10aW1lIHx8IHVuZGVmXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZpbGUgOj0gYXdhaXQgRGVuby5vcGVuIHBhdGhcclxuXHRzdHJlYW0gOj0gKGZpbGUucmVhZGFibGVcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0RGVjb2RlclN0cmVhbSgpKVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHRMaW5lU3RyZWFtKCkpXHJcblx0XHRcdClcclxuXHRmb3IgYXdhaXQgbGluZSBvZiBzdHJlYW1cclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGVTeW5jIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0dGV4dCA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMocGF0aClcclxuXHRmb3IgbGluZSBvZiB0ZXh0LnNwbGl0KC9cXHI/XFxuLylcclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBta1RlbXBGaWxlIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGF3YWl0IERlbm8ubWFrZVRlbXBGaWxlIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZVN5bmMgOj0gKFxyXG5cdFx0c3VmZml4OiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEFzc2VydEZ1bmMgPSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0bXNnOiBzdHJpbmdcclxuXHRcdCkgPT4gYXNzZXJ0cyBjb25kXHJcblxyXG5leHBvcnQgYXNzZXJ0OiBUQXNzZXJ0RnVuYyA6PSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0bXNnOiBzdHJpbmdcclxuXHRcdCk6IGFzc2VydHMgY29uZCA9PlxyXG5cclxuXHRpZiBub3QgY29uZFxyXG5cdFx0Y3JvYWsgbXNnXHJcblx0cmV0dXJuXHJcblxyXG50eXBlIFRPYnZpb3VzbHlGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdGNvbmRTdHI/OiBzdHJpbmdcclxuXHRcdCkgPT4gYXNzZXJ0cyBjb25kXHJcblxyXG5leHBvcnQgb2J2aW91c2x5OiBUT2J2aW91c2x5RnVuYyA6PSAoXHJcblx0XHRjb25kOiB1bmtub3duXHJcblx0XHRjb25kU3RyOiBzdHJpbmcgPSAnJ1xyXG5cdFx0KTogYXNzZXJ0cyBjb25kID0+XHJcblxyXG5cdGlmIG5vdCBjb25kXHJcblx0XHRjcm9hayBcIiN7Y29uZFN0ciB8fCAnY29uZGl0aW9uJ30gbm90IG9idmlvdXNseSB0cnVlXCJcclxuXHRcdERlbm8uZXhpdCgpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgUmF3U291cmNlTWFwID0ge1xyXG5cdHZlcnNpb246IG51bWJlcjsgICAgICAgICAgICMgVGhlIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXAgc3BlYyAodXN1YWxseSAzKVxyXG5cdGZpbGU6IHN0cmluZzsgICAgICAgICAgICAgICMgVGhlIGdlbmVyYXRlZCBmaWxlIHRoaXMgbWFwIGlzIGFzc29jaWF0ZWQgd2l0aFxyXG5cdHNvdXJjZXM6IHN0cmluZ1tdOyAgICAgICAgICMgQXJyYXkgb2YgVVJMcyB0byB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzXHJcblx0bmFtZXM6IHN0cmluZ1tdOyAgICAgICAgICAgIyBBcnJheSBvZiBpZGVudGlmaWVycyAobmFtZXMpIHVzZWQgaW4gdGhlIG1hcHBpbmdzXHJcblx0c291cmNlUm9vdD86IHN0cmluZzsgICAgICAgIyBPcHRpb25hbDogVVJMIHJvb3QgZm9yIHRoZSBzb3VyY2VzXHJcblx0c291cmNlc0NvbnRlbnQ/OiBzdHJpbmdbXTsgIyBDb250ZW50IG9mIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMgKG9wdGlvbmFsKVxyXG5cdG1hcHBpbmdzOiBzdHJpbmc7ICAgICAgICAgICMgVGhlIGFjdHVhbCBlbmNvZGVkIG1hcHBpbmdzIChCYXNlNjQgVkxRKVxyXG5cdH1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlUG9zaXRpb24gPSB7XHJcblx0c291cmNlOiBzdHJpbmdcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBtYXBQb3MgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdGNvbnN1bWVyIDo9IGF3YWl0IG5ldyBTb3VyY2VNYXBDb25zdW1lcihoU3JjTWFwKVxyXG5cdFx0cG9zIDo9IGNvbnN1bWVyLm9yaWdpbmFsUG9zaXRpb25Gb3Ioe2xpbmUsIGNvbHVtbjogY29sfSlcclxuXHRcdHJldHVybiBwb3MgYXMgVEZpbGVQb3NpdGlvblxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBtYXBQb3NTeW5jIDo9IChcclxuXHRmaWxlUG9zOiBURmlsZVBvc2l0aW9uXHJcblx0KTogVEZpbGVQb3NpdGlvbj8gPT5cclxuXHJcblx0e3NvdXJjZSwgbGluZSwgY29sfSA6PSBmaWxlUG9zXHJcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHNvdXJjZVxyXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwIGNvbnRlbnRzXHJcblx0aWYgZGVmaW5lZChoU3JjTWFwKVxyXG5cdFx0W2ZpbGVOdW0sIHNyY0xpbmUsIHNyY0NvbF0gOj0gZ2V0T3JnUG9zIGhTcmNNYXAsIGxpbmUsIGNvbFxyXG5cdFx0ZmlsZU5hbWUgOj0gaFNyY01hcC5zb3VyY2VzW2ZpbGVOdW1dXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzb3VyY2U6IG5vcm1hbGl6ZVBhdGggXCIje2Rpcm5hbWUoc291cmNlKX0vI3tmaWxlTmFtZX1cIlxyXG5cdFx0XHRsaW5lOiBzcmNMaW5lXHJcblx0XHRcdGNvbDogc3JjQ29sXHJcblx0XHRcdH1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZXh0cmFjdFNvdXJjZU1hcCA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nXHJcblx0XHQpOiBbc3RyaW5nLCBSYXdTb3VyY2VNYXA/XSA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBjb250ZW50cy5tYXRjaCAvLy9eXHJcblx0XHRcdCguKilcclxuXHRcdFx0XFwvIFxcLyBcXCMgXFxzK1xyXG5cdFx0XHRzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb25cXC9qc29uO1xyXG5cdFx0XHQoPzpjaGFyc2V0PXV0Zi04Oyk/XHJcblx0XHRcdGJhc2U2NCxcclxuXHRcdFx0KC4rKVxyXG5cdFx0XHQkLy8vc1xyXG5cdGlmIChsTWF0Y2hlcyA9PSBudWxsKVxyXG5cdFx0cmV0dXJuIFtjb250ZW50cywgdW5kZWZdXHJcblx0W18sIGNvZGUsIGhTcmNNYXBTdHJdIDo9IGxNYXRjaGVzXHJcblx0aFNyY01hcCA6PSBKU09OLnBhcnNlKGF0b2IoaFNyY01hcFN0cikpIGFzIFJhd1NvdXJjZU1hcFxyXG5cdHtmaWxlfSA6PSBoU3JjTWFwXHJcblx0aFNyY01hcC5maWxlID0gdG9SZWxQYXRoKGZpbGUpXHJcblx0aFNyY01hcC5zb3VyY2VzID0gZm9yIHBhdGggb2YgaFNyY01hcC5zb3VyY2VzXHJcblx0XHR0b1JlbFBhdGgocGF0aClcclxuXHRyZXR1cm4gW2NvZGUsIGhTcmNNYXBdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUT3JnUG9zID0gW2ZpbGVOdW06IG51bWJlciwgbGluZTogbnVtYmVyLCBjb2w6IG51bWJlcl1cclxudHlwZSBUQ29tcGFyZVJlc3VsdCA9IC0xIHwgMCB8IDFcclxuXHJcbmNvbXBhcmUgOj0gKFxyXG5cdFx0ZmluZDogW251bWJlciwgbnVtYmVyXSxcclxuXHRcdGdlbjogIFtudW1iZXIsIG51bWJlcl1cclxuXHRcdCk6IFRDb21wYXJlUmVzdWx0ID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgIChmaW5kWzBdIDwgZ2VuWzBdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzBdID4gZ2VuWzBdKSA/ICAxXHJcblx0XHQ6IChmaW5kWzFdIDwgZ2VuWzFdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzFdID4gZ2VuWzFdKSA/ICAxXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAwXHJcblx0XHQpXHJcblxyXG5leHBvcnQgZ2V0T3JnUG9zIDo9IChcclxuXHRcdGhTcmNNYXA6IFJhd1NvdXJjZU1hcCxcclxuXHRcdGxpbmU6IG51bWJlcixcclxuXHRcdGNvbDogbnVtYmVyXHJcblx0XHQpOiBUT3JnUG9zID0+XHJcblxyXG5cdGxNYXBwaW5ncyA6PSBnZXRNYXBwaW5ncyhoU3JjTWFwLm1hcHBpbmdzKVxyXG5cdGFzc2VydCAobE1hcHBpbmdzLmxlbmd0aCA+IDApLCBcIkVtcHR5IG1hcHBpbmdzIGFycmF5XCJcclxuXHRsZXQgcG9zID0gMCwgZW5kID0gbE1hcHBpbmdzLmxlbmd0aCAtIDFcclxuXHR3aGlsZSAocG9zIDw9IGVuZClcclxuXHJcblx0XHQjIC0tLSBDYWxjdWxhdGUgdGhlIG1pZGRsZSBpbmRleFxyXG5cdFx0bWlkIDo9IE1hdGguZmxvb3IoKHBvcyArIGVuZCkgLyAyKVxyXG5cdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdIDo9IGxNYXBwaW5nc1ttaWRdXHJcblx0XHRzd2l0Y2ggY29tcGFyZShbbGluZSwgY29sXSwgW3RzTGluZSwgdHNDb2xdKVxyXG5cdFx0XHR3aGVuIDBcclxuXHRcdFx0XHRyZXR1cm4gW29yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdXHJcblx0XHRcdHdoZW4gLTFcclxuXHRcdFx0XHRlbmQgPSBtaWQgLSAxO1xyXG5cdFx0XHR3aGVuIDFcclxuXHRcdFx0XHRwb3MgPSBtaWQgKyAxO1xyXG5cclxuXHQjIC0tLSBJZiB0aGUgbG9vcCBmaW5pc2hlcywgdGhlIHRhcmdldCBpcyBub3QgaW4gdGhlIGFycmF5XHJcblx0aWYgKHBvcyA8IGxNYXBwaW5ncy5sZW5ndGgpXHJcblx0XHRsZXQgW3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdID0gbE1hcHBpbmdzW3Bvc11cclxuXHRcdGlmICh0c0xpbmUgIT0gbGluZSkgfHwgKHRzQ29sICE9IGNvbClcclxuXHRcdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdID0gbE1hcHBpbmdzW3Bvcy0xXVxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cdGVsc2VcclxuXHRcdGxhc3QgOj0gbE1hcHBpbmdzLmF0KC0xKVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQobGFzdCksIFwibGFzdCBub3QgZGVmaW5lZFwiXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbGFzdFxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNYXBwaW5ncyA6PSAoXHJcblx0XHRkYXRhOiBzdHJpbmcsXHJcblx0XHQpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGxNYXBwaW5nczogbnVtYmVyW11bXSA6PSBbXVxyXG5cdHZhciBzdW06IG51bWJlcltdID0gWzAsIDAsIDAsIDBdXHJcblx0Zm9yIGxpbmUsbGluZU51bSBvZiBkYXRhLnNwbGl0KFwiO1wiKVxyXG5cdFx0c3VtWzBdID0gMFxyXG5cdFx0ZGVjb2RlTGluZShsaW5lKS5mb3JFYWNoIChwKSA9PlxyXG5cdFx0XHRmb3IgKGkgb2YgWzAuLi5wLmxlbmd0aF0pXHJcblx0XHRcdFx0c3VtW2ldICs9IHBbaV1cclxuXHRcdFx0bE1hcHBpbmdzLnB1c2ggW2xpbmVOdW0sIHN1bVswXSwgc3VtWzFdLCBzdW1bMl0sIHN1bVszXV1cclxuXHRyZXR1cm4gbE1hcHBpbmdzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29kZUxpbmUgOj0gKGxpbmU6IHN0cmluZyk6IG51bWJlcltdW10gPT5cclxuXHJcblx0aWYgKGxpbmUgPT0gJycpXHJcblx0XHRyZXR1cm4gW11cclxuXHJcblx0cmV0dXJuIGZvciB0b2tlbiBvZiBsaW5lLnNwbGl0KCcsJylcclxuXHRcdGxPdXRwdXQ6IG51bWJlcltdIDo9IFtdXHJcblx0XHRsZXQgaSA9IDBcclxuXHRcdHdoaWxlIChpIDwgdG9rZW4ubGVuZ3RoKVxyXG5cdFx0XHRsZXQgdiA9IDAsIGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRpICs9IDFcclxuXHRcdFx0diB8PSAoZCAmIDMxKSAgICAgICAgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdGxldCBzaGlmdCA9IDVcclxuXHRcdFx0d2hpbGUgKGQgJiAzMikgICAgICAgICAjIHJlcGVhdCBpZiBoaWdoIGJpdCBvZiBkIGlzIHNldFxyXG5cdFx0XHRcdGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRcdGkgKz0gMVxyXG5cdFx0XHRcdHYgfD0gKGQgJiAzMSkgPDwgc2hpZnQgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdFx0c2hpZnQgKz0gNVxyXG5cdFx0XHRsT3V0cHV0LnB1c2godiAmIDEgPyAtKHYgPj4gMSkgOiB2ID4+IDEpICMgbG93IGJpdCBpcyBzaWduXHJcblx0XHRsT3V0cHV0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZyYW1lVHlwZSA9IChcclxuXHQnZXZhbCcgfFxyXG5cdCduYXRpdmUnIHxcclxuXHQnY29uc3RydWN0b3InIHxcclxuXHQnbWV0aG9kJyB8XHJcblx0J2Z1bmN0aW9uJyB8XHJcblx0J3NjcmlwdCcgfFxyXG5cdCd1bmtub3duJ1xyXG5cdClcclxuXHJcbmV4cG9ydCB0eXBlIFRTdGFja0ZyYW1lID0ge1xyXG5cdGk6IG51bWJlclxyXG5cdHR5cGU6IHN0cmluZ1xyXG5cdHNvdXJjZTogc3RyaW5nICAgICAgICAjIHJlbGF0aXZlIGZpbGUgcGF0aCBvciAndW5rbm93bidcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdG5hbWU6IHN0cmluZyAgICAgICAgICAjIG5hbWUgb2YgZnVuY3Rpb24gb3IgbWV0aG9kXHJcblx0b3JnU291cmNlPzogc3RyaW5nXHJcblx0b3JnTGluZT86IG51bWJlclxyXG5cdG9yZ0NvbD86IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsU3RhY2tGcmFtZXMgOj0gKFxyXG5cdFx0dHJhY2UgPSBmYWxzZVxyXG5cdFx0KTogVEl0ZXJhdG9yPFRTdGFja0ZyYW1lPiAtPlxyXG5cclxuXHRwcm9jZXNzLnNldFNvdXJjZU1hcHNFbmFibGVkKGZhbHNlKVxyXG5cdG9wZW5EZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cdGZtdCA6PSAobGluZTogbnVtYmVyLCBjb2w6IG51bWJlciwgc3JjOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBcIiN7c3ByaW50ZignJTNkJywgbGluZSl9ICN7c3ByaW50ZignJTNkJywgY29sKX0gI3tzcmN9XCJcclxuXHJcblx0dHJ5XHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdG9sZExpbWl0IDo9IEVycm9yLnN0YWNrVHJhY2VMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRQcmVwYXJlciA6PSBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSA5OVxyXG5cclxuXHRcdGxldCBwcmV2RnJhbWU6IFRTdGFja0ZyYW1lPyA9IHVuZGVmaW5lZFxyXG5cclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSAoZXJyb3IsIGxPcmdGcmFtZXMpID0+XHJcblxyXG5cdFx0XHRsZXQgbEZyYW1lczogVFN0YWNrRnJhbWVbXSA9IFtdXHJcblxyXG5cdFx0XHRmb3Igb3JnRnJhbWUsaSBvZiBsT3JnRnJhbWVzXHJcblxyXG5cdFx0XHRcdHNyYyA6PSBvcmdGcmFtZS5nZXRGaWxlTmFtZSgpICAgICMgLS0tIGEgZnVsbCBwYXRoXHJcblx0XHRcdFx0aWYgbm90ZGVmaW5lZChzcmMpIHx8IHNyYy5tYXRjaCgvLy9leHQgXFw6IGNsaSBcXC8gXFxkK190ZXN0XFwuanMvLy8pXHJcblx0XHRcdFx0XHRjb250aW51ZVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBhcmUgY29uc3RhbnRzXHJcblx0XHRcdFx0b3JnU291cmNlIDo9IG5vcm1hbGl6ZVBhdGggc3JjXHJcblx0XHRcdFx0b3JnTGluZSAgIDo9IG9yZ0ZyYW1lLmdldExpbmVOdW1iZXIoKVxyXG5cdFx0XHRcdG9yZ0NvbCAgICA6PSBvcmdGcmFtZS5nZXRDb2x1bW5OdW1iZXIoKVxyXG5cclxuXHRcdFx0XHREQkcgJy0nLnJlcGVhdCA2NFxyXG5cdFx0XHRcdERCRyBmbXQob3JnTGluZSwgb3JnQ29sLCBvcmdTb3VyY2UpXHJcblxyXG5cdFx0XHRcdCMgLS0tIFRoZXNlIGNhbiBiZSBvdmVyd3JpdHRlbiB3aGVuIHVzaW5nIHNvdXJjZSBtYXBzXHJcblx0XHRcdFx0bGV0IHNvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdGxldCBsaW5lICAgPSBvcmdMaW5lXHJcblx0XHRcdFx0bGV0IGNvbCAgICA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHRmdW5jdGlvbk5hbWUgOj0gb3JnRnJhbWUuZ2V0RnVuY3Rpb25OYW1lKClcclxuXHRcdFx0XHRtZXRob2ROYW1lICAgOj0gb3JnRnJhbWUuZ2V0TWV0aG9kTmFtZSgpXHJcblxyXG5cdFx0XHRcdCMgLS0tIGZvbGxvdyBzb3VyY2UgbWFwcyByZWN1cnNpdmVseVxyXG5cdFx0XHRcdGxldCBuZXdGaWxlUG9zID0gbWFwUG9zU3luYyh7c291cmNlLCBsaW5lLCBjb2x9KVxyXG5cdFx0XHRcdHdoaWxlIGRlZmluZWQobmV3RmlsZVBvcylcclxuXHRcdFx0XHRcdHNvdXJjZSA9IG5ld0ZpbGVQb3Muc291cmNlICAgIyAtLS0gYWxyZWFkeSBub3JtYWxpemVkXHJcblx0XHRcdFx0XHRsaW5lICAgPSBuZXdGaWxlUG9zLmxpbmVcclxuXHRcdFx0XHRcdGNvbCAgICA9IG5ld0ZpbGVQb3MuY29sXHJcblx0XHRcdFx0XHREQkcgZm10KGxpbmUsIGNvbCwgc291cmNlKVxyXG5cdFx0XHRcdFx0bmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMobmV3RmlsZVBvcylcclxuXHJcblx0XHRcdFx0ZnJhbWU6IFRTdGFja0ZyYW1lIDo9IHtcclxuXHRcdFx0XHRcdGlcclxuXHRcdFx0XHRcdHR5cGU6IChcclxuXHRcdFx0XHRcdFx0ICBmdW5jdGlvbk5hbWUgICAgICAgICAgICAgPyAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRcdDogbWV0aG9kTmFtZSAgICAgICAgICAgICAgID8gJ21ldGhvZCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc1RvcGxldmVsKCkgICAgPyAnc2NyaXB0J1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzRXZhbCgpICAgICAgICA/ICdldmFsJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzTmF0aXZlKCkgICAgICA/ICduYXRpdmUnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNDb25zdHJ1Y3RvcigpID8gJ2NvbnN0cnVjdG9yJ1xyXG5cdFx0XHRcdFx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0XHRcdFx0XHQpXHJcblx0XHRcdFx0XHRzb3VyY2VcclxuXHRcdFx0XHRcdGxpbmVcclxuXHRcdFx0XHRcdGNvbFxyXG5cdFx0XHRcdFx0bmFtZTogZnVuY3Rpb25OYW1lIHx8IG1ldGhvZE5hbWUgfHwgJydcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0IyAtLS0gQWRkIG9yaWdpbmFsIHNvdXJjZSwgbGluZSAmIGNvbCBpZiBtYXBwZWRcclxuXHRcdFx0XHRpZiAoc291cmNlICE9IG9yZ1NvdXJjZSlcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ1NvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnTGluZSA9IG9yZ0xpbmVcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0NvbCA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHQjIC0tLSBmaXggYSBidWcgaW4gdGhlIFY4IGVuZ2luZSB3aGVyZSBjYWxscyBpbnNpZGUgYVxyXG5cdFx0XHRcdCMgICAgIHRvcCBsZXZlbCBhbm9ueW1vdXMgZnVuY3Rpb24gaXMgcmVwb3J0ZWQgYXNcclxuXHRcdFx0XHQjICAgICBiZWluZyBvZiB0eXBlICdzY3JpcHQnXHJcblxyXG5cdFx0XHRcdGlmIHByZXZGcmFtZSAmJiAoZnJhbWUudHlwZSA9PSAnc2NyaXB0JykgJiYgKHByZXZGcmFtZS50eXBlID09ICdzY3JpcHQnKVxyXG5cdFx0XHRcdFx0cHJldkZyYW1lLnR5cGUgPSAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUubmFtZSA9ICc8YW5vbj4nXHJcblxyXG5cdFx0XHRcdGlmIHRyYWNlXHJcblx0XHRcdFx0XHRkdW1wRnJhbWUgZnJhbWUsICdPUkcgRlJBTUUnXHJcblx0XHRcdFx0cHJldkZyYW1lID0gZnJhbWVcclxuXHRcdFx0XHRsRnJhbWVzLnB1c2ggZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblx0XHRmb3IgZnJhbWUgb2YgbFN0YWNrXHJcblx0XHRcdHlpZWxkIGZyYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tyZWQoJ0VSUk9SIGluIGFsbFN0YWNrRnJhbWVzOicpfSAje2dldEVyclN0cihlcnIpfVwiXHJcblx0XHRyZXR1cm5cclxuXHRmaW5hbGx5XHJcblx0XHRjbG9zZURlYnVnRmlsZSAnc3RhY2snXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE15Q2FsbGVyIDo9ICgpOiBUU3RhY2tGcmFtZT8gPT5cclxuXHJcblx0Zm9yIGZyYW1lLGkgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0aWYgKGkgPT0gMylcclxuXHRcdFx0cmV0dXJuIGZyYW1lXHJcblx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGR1bXBGcmFtZSA6PSAoXHJcblx0XHRmcmFtZTogVFN0YWNrRnJhbWUsXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0ZSQU1FJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7aSwgdHlwZSwgc291cmNlLCBsaW5lLCBjb2wsIG5hbWV9IDo9IGZyYW1lXHJcblx0dHlwZVN0ciA6PSBzcHJpbnRmKCclLThzJywgdHlwZSlcclxuXHRuYW1lU3RyIDo9IHNwcmludGYoJyUtMTZzJywgbmFtZSlcclxuXHRpZiBzb3VyY2VcclxuXHRcdExPRyBcIiN7bGFiZWx9WyN7aX1dOiAje3R5cGVTdHJ9ICN7bmFtZVN0cn0gI3tzb3VyY2V9OiN7bGluZX06I3tjb2x9XCJcclxuXHRlbHNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9IDxub25lPlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEVyclN0ciA6PSAoZXJyOiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG5cdFx0cmV0dXJuIGVyclxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yKVxyXG5cdFx0ZXJybXNnIDo9IGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdFx0cmV0dXJuIFwiI3tjb2xvcml6ZSgnQXNzZXJ0aW9uRXJyb3I6ICcsICdyZWQnKX0je2Vycm1zZ31cIlxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKVxyXG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiBcIlNFUklPVVMgRVJST1JcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBUUlkgOj0gKFxyXG5cdFx0ZnVuYzogKCkgPT4gdm9pZFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0cnlcclxuXHRcdGZ1bmMoKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y3JvYWsgXCJpbiBUUlkoKTogI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBTS0lQIDo9IChmdW5jOiAoKSA9PiB2b2lkKTogdm9pZCA9PlxyXG5cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUHJlZGljYXRlPFQ9dW5rbm93bj4gPSAoaXRlbTogVCkgPT4gYm9vbGVhblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Jvb2wgOj0gKHg6IHVua25vd24pOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBub3Qgbm90IHhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55T2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgY2hlY2tGdW5jKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbE9mIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdLFxyXG5cdFx0Y2hlY2tGdW5jOiBUUHJlZGljYXRlPFQ+ID0gKHgpID0+IHRvQm9vbCh4KVxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdCBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5pc0FzeW5jR2VuZXJhdG9yRnVuY3Rpb24gOj0gKFxyXG5cdFx0eDogdW5rbm93blxyXG5cdFx0KTogeCBpcyBBc3luY0dlbmVyYXRvckZ1bmN0aW9uID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgICAodHlwZW9mIHggPT0gJ2Z1bmN0aW9uJylcclxuXHRcdCYmICh4LnRvU3RyaW5nKCkubWF0Y2goL1xcYmFzeW5jXFxzK2Z1bmN0aW9uXFxzKlxcKi8pICE9IG51bGwpXHJcblx0XHQpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbSA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSB8IFRJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEl0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxWYWx1ZXNGcm9tQXN5bmMgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD4gfCBUQXN5bmNJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8VD4gLT5cclxuXHJcblx0aXRlciA6PSBBcnJheS5pc0FycmF5KGxJdGVtcykgPyBsSXRlbXMudmFsdWVzKCkgOiBsSXRlbXNcclxuXHRsb29wXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGF3YWl0IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdGJyZWFrXHJcblx0XHRlbHNlXHJcblx0XHRcdHlpZWxkIHZhbHVlXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlIDo9IChzdHI6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0RGVuby5zdGRvdXQud3JpdGVTeW5jIGVuY29kZShzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlbG4gOj0gKHN0cjogc3RyaW5nID0gJycpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIHN0ciArICdcXG4nXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyU2NyZWVuIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlICdcXHgxYltIXFx4MWJbMkonXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlc2V0TGluZSA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBcIlxceDFiWzJLXCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJQcmV2aW91c0xpbmVzIDo9IChudW1MaW5lczogbnVtYmVyKTogdm9pZCA9PlxyXG5cdCMgXFx4MWJbbkEgbW92ZXMgdGhlIGN1cnNvciB1cCAnbicgbGluZXNcclxuXHQjIFxcciBtb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmVcclxuXHQjIFxceDFiW0sgY2xlYXJzIHRoZSBsaW5lIGZyb20gdGhlIGN1cnNvciB0byB0aGUgZW5kIChvcHRpb25hbCwgYnV0IGdvb2QgcHJhY3RpY2UpXHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGUoXCJcXHgxYlsje251bUxpbmVzfUFcXHJcXHgxYltLXCIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVENvbG9yID0gJ2N5YW4nfCdibHVlJ3wnYmxhY2snfCdyZWQnfCdncmVlbid8J21hZ2VudGEnfCd5ZWxsb3cnXHJcblxyXG5leHBvcnQgaXNDb2xvciA6PSAoc3RyOiBzdHJpbmcpOiBzdHIgaXMgVENvbG9yID0+XHJcblxyXG5cdHJldHVybiBbJ2N5YW4nLCdibHVlJywnYmxhY2snLCdyZWQnLCdncmVlbicsJ21hZ2VudGEnLCd5ZWxsb3cnXS5pbmNsdWRlcyBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY29sb3JpemUgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRjb2xvcjogc3RyaW5nP1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQoY29sb3IpIHx8IG5vdCBpc0NvbG9yKGNvbG9yKVxyXG5cdFx0cmV0dXJuIHN0clxyXG5cdHN3aXRjaCBjb2xvclxyXG5cdFx0d2hlbiAnY3lhbicgICAgdGhlbiByZXR1cm4gY3lhbihzdHIpXHJcblx0XHR3aGVuICdibHVlJyAgICB0aGVuIHJldHVybiBibHVlKHN0cilcclxuXHRcdHdoZW4gJ2JsYWNrJyAgIHRoZW4gcmV0dXJuIGJsYWNrKHN0cilcclxuXHRcdHdoZW4gJ3JlZCcgICAgIHRoZW4gcmV0dXJuIHJlZChzdHIpXHJcblx0XHR3aGVuICdncmVlbicgICB0aGVuIHJldHVybiBncmVlbihzdHIpXHJcblx0XHR3aGVuICdtYWdlbnRhJyB0aGVuIHJldHVybiBtYWdlbnRhKHN0cilcclxuXHRcdHdoZW4gJ3llbGxvdycgIHRoZW4gcmV0dXJuIHllbGxvdyhzdHIpXHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGhDb2xvcnMgaXMgezx3b3JkPjogPGNvbG9yPiwgLi4uIH1cclxuXHJcbnR5cGUgVENvbG9yTWFwID0ge1xyXG5cdFt3b3JkOiBzdHJpbmddOiBUQ29sb3JcclxuXHR9XHJcblxyXG5leHBvcnQgd2l0aENvbG9ycyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZ1xyXG5cdFx0aENvbG9yczogVENvbG9yTWFwXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0Zm9yIHdvcmQgb2YgT2JqZWN0LmtleXMoaENvbG9ycylcclxuXHRcdGNvbG9yIDo9IGhDb2xvcnNbd29yZF1cclxuXHRcdHN0ciA9IHN0ci5yZXBsYWNlQWxsKHdvcmQsIGNvbG9yaXplKHdvcmQsIGNvbG9yKSlcclxuXHRyZXR1cm4gc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29sb3JpemUgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHJpcEFuc2lDb2RlKHN0cilcclxuIl19