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

export const matches = (
		str: string,
		regexp: RegExp
		): boolean => {

	return regexp.test(str)
}

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
	const fmt = (
			line: number,
			col: number,
			src: string
			): string => {
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
				const orgLine   = orgFrame.getLineNumber() || 0
				const orgCol    = orgFrame.getColumnNumber() || 0

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

export const EXEC = (
		func: () => void
		): void => {

	try {
		func()
	}
	catch (err) {
		croak(`in EXEC(): ${getErrStr(err)}`)
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

// ---------------------------------------------------------------------------

export const isChineseChar = (str: string): boolean => {

	assert((str.length === 1), "Not a single char")
	return toBool(str.match(/^[\u4e00-\u9fff]$/u))
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM3RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN2RixBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENB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LENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0IsRUFBRSxDQUFDLHVCQUF1QixDQUFDO0FBQzNCLEVBQUUsQztBQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNyQixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTTtBQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2YsQUFBQTtBQUNBLEFBQUEsQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDM0MsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQTtBQUN0RCxBQUFBLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hDLEFBQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUE7QUFDbkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxpQ0FBZ0M7QUFDbEMsQUFBQSxFQUFLLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BDLEFBQUEsRUFBa0QsTUFBaEQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUNwRSxBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsSUFBSSxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEM7R0FBQyxDQUFBO0FBQzVDLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1YsQUFBQSxJQUFJLEdBQUcsQyxDQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTztHQUFBLENBQUE7QUFDbEIsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxJQUFJLEdBQUcsQyxDQUFF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Q0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzNDLEFBQUEsRUFBRSxNQUFNLENBQUMsRztDQUFHLENBQUE7QUFDWixBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNiLEFBQUEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN0QyxBQUFBLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdEMsQUFBQSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQSxDQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3ZDLEFBQUEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUNyQyxBQUFBLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFBLENBQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdkMsQUFBQSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUEsQ0FBQSxDQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3pDLEFBQUEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN4QyxBQUFBLEVBQUUsT0FBSSxDQUFBLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxNQUFNLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLHlDQUF3QztBQUN4QyxBQUFBO0FBQ0EsQUFBQSxBQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQUFBQSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQ3ZCLENBQUMsQ0FBQztBQUNGLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDYixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsU0FBUztBQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2pDLEFBQUEsRUFBTyxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN4QixBQUFBLEVBQUUsR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQztDQUFDLENBQUE7QUFDbkQsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHO0FBQUcsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUM3QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDO0FBQUMsQ0FBQTtBQUMxQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWMsTUFBYixhQUFhLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDakQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUE7QUFDOUMsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQUFBQyxHQUFHLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLEM7QUFBQSxDQUFBO0FBQzlDIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGJhc2UubGliLmNpdmV0XHJcblxyXG5pbXBvcnQgcHJvY2VzcyBmcm9tIFwibm9kZTpwcm9jZXNzXCJcclxuaW1wb3J0IHtcclxuXHRjeWFuLCBibHVlLCBibGFjaywgcmVkLCBncmVlbiwgbWFnZW50YSwgeWVsbG93LFxyXG5cdHN0cmlwQW5zaUNvZGUsXHJcblx0fSBmcm9tICdAc3RkL2ZtdC9jb2xvcnMnXHJcbmltcG9ydCB7QXNzZXJ0aW9uRXJyb3J9IGZyb20gJ0BzdGQvYXNzZXJ0J1xyXG5pbXBvcnQge1NvdXJjZU1hcENvbnN1bWVyfSBmcm9tICdAbW96aWxsYS9zb3VyY2UtbWFwJ1xyXG5pbXBvcnQge1xyXG5cdHJlc29sdmUsIHJlbGF0aXZlLCBpc0Fic29sdXRlLCBmcm9tRmlsZVVybCwgZGlybmFtZSxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zJ1xyXG5pbXBvcnQgZGVlcEVxdWFsIGZyb20gJ25wbS1mYXN0LWRlZXAtZXF1YWwnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5leHBvcnQgZGVlcENvcHkgPSBzdHJ1Y3R1cmVkQ2xvbmVcclxuXHJcbm15ZGlyIDo9IGRpcm5hbWUoZnJvbUZpbGVVcmwoaW1wb3J0Lm1ldGEudXJsKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRTdHJpbmdTb3VyY2UgPSBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IEJ1ZmZlclNvdXJjZSB8IHN0cmluZ1xyXG5cclxuZW5jb2RlciA6PSBuZXcgVGV4dEVuY29kZXIoKVxyXG5leHBvcnQgZW5jb2RlIDo9ICh4OiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiA9PlxyXG5cdHJldHVybiBlbmNvZGVyLmVuY29kZSB4XHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlcigpXHJcbmV4cG9ydCBkZWNvZGUgOj0gKHg6IFRTdHJpbmdTb3VyY2UpOiBzdHJpbmcgPT5cclxuXHRyZXR1cm4gKHR5cGVvZiB4ID09ICdzdHJpbmcnKSA/IHggOiBkZWNvZGVyLmRlY29kZSh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEdlbmVyYXRvcjxUSW4sIFRPdXQsIFRBY2M+XHJcbmV4cG9ydCB0eXBlIFRBc3luY0l0ZXJhdG9yPFRJbiwgVE91dD12b2lkLCBUQWNjPXZvaWQ+ID0gQXN5bmNHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUTm9uRnVuY3Rpb248VD11bmtub3duPiA9IEV4Y2x1ZGU8VCwgRnVuY3Rpb24+XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uKiBlbXB0eUl0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEl0ZXJhdG9yPFQ+ID0+XHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uKiBlbXB0eUFzeW5jSXRlcmF0b3I8VD11bmtub3duPigpOiBUQXN5bmNJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXNzIDo9ICgpOiB2b2lkID0+XHJcblx0IyBkbyBub3RoaW5nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgc2xlZXAgOj0gKHNlYzogbnVtYmVyKTogdm9pZCA9PlxyXG5cclxuXHRhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dCByLCAxMDAwICogc2VjKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bmRlZiA6PSB1bmRlZmluZWRcclxudHlwZSBURGVmaW5lZCA9IE5vbk51bGxhYmxlPHVua25vd24+XHJcbnR5cGUgVE5vdERlZmluZWQgPSBudWxsIHwgdW5kZWZpbmVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlZmluZWQgOj0gKHg6IHVua25vd24pOiB4IGlzIFREZWZpbmVkID0+XHJcblxyXG5cdHJldHVybiAoeCAhPSB1bmRlZikgJiYgKHggIT0gbnVsbClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55RGVmaW5lZCA6PSAoLi4ubEl0ZW1zOiB1bmtub3duW10pOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgZGVmaW5lZChpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBUTm90RGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggPT0gdW5kZWYpIHx8ICh4ID09IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU5vdERlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWF4IDo9ICh4OiBudW1iZXIsIHk6IG51bWJlcik6IG51bWJlciA9PlxyXG5cclxuXHRyZXR1cm4gKHggPiB5KSA/IHggOiB5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJhbmdlIDo9IChuOiBudW1iZXIpOiBUSXRlcmF0b3I8bnVtYmVyPiAtPlxyXG5cclxuXHRmb3IgaSBvZiBbMC4uLm5dXHJcblx0XHR5aWVsZCBpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbENoYXJzIDo9IChzdHI6IHN0cmluZyk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZvciBjaCBvZiBzdHJcclxuXHRcdHlpZWxkIGNoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgYWxsQ2hhcnNBc3luYyA6PSAoc3RyOiBzdHJpbmcpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZvciBjaCBvZiBzdHJcclxuXHRcdHlpZWxkIGNoXHJcblx0XHRhd2FpdCBzbGVlcCAwLjFcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgICAgICAgICAgTE9HR0lOR1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuc2V0RGVidWdGaWxlcyA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cclxubGV0IGluZGVudExldmVsID0gMFxyXG5sZXQgbExvZ0xpbmVzOiBzdHJpbmdbXSA9IFtdXHJcblxyXG5leHBvcnQgSU5ERU5UIDo9IFN5bWJvbCAnaW5kZW50J1xyXG5leHBvcnQgVU5ERU5UIDo9IFN5bWJvbCAndW5kZW50J1xyXG5cclxuZXhwb3J0IHR5cGUgVExvZ0xldmVsID0gJ3Rlc3RpbmcnIHwgJ3NpbGVudCcgfCAnaW5mbycgfCAnZGVidWcnXHJcbmV4cG9ydCBsZXQgbExvZ0xldmVsczogVExvZ0xldmVsW10gPSBbJ2luZm8nXVxyXG5leHBvcnQgZ2V0TG9nTGV2ZWxzIDo9ICgpID0+IHJldHVybiBsTG9nTGV2ZWxzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG9wZW5EZWJ1Z0ZpbGUgOj0gKFxyXG5cdFx0c3R1Yjogc3RyaW5nXHJcblx0XHRjbGVhcjogYm9vbGVhbiA9IGZhbHNlXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHBhdGggOj0gXCIuL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuYWRkIHBhdGhcclxuXHRpZiBjbGVhclxyXG5cdFx0RGVuby5yZW1vdmVTeW5jIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXBwZW5kRGVidWdGaWxlIDo9IChcclxuXHRcdC4uLmxJdGVtczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0YmxvY2sgOj0gKHR5cGVvZiBpdGVtID09ICdzdHJpbmcnKSA/IGl0ZW0gOiB0b0pTT04oaXRlbSlcclxuXHRcdGZvciBwYXRoIG9mIHNldERlYnVnRmlsZXNcclxuXHRcdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBwYXRoLCBibG9jayArIFwiXFxuXCIsIHthcHBlbmQ6IHRydWV9XHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsb3NlRGVidWdGaWxlIDo9IChzdHViOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdHBhdGggOj0gXCJzcmMvbG9ncy8je3N0dWJ9LmxvZ1wiXHJcblx0c2V0RGVidWdGaWxlcy5kZWxldGUgcGF0aFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjdXJMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdHJldHVybiAobExvZ0xldmVscy5sZW5ndGggPT0gMCkgPyAnaW5mbycgOiBsTG9nTGV2ZWxzW2xMb2dMZXZlbHMubGVuZ3RoLTFdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vdExvZ2dpbmcgOj0gKCk6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIChjdXJMb2dMZXZlbCgpID09ICdzaWxlbnQnKSB8fCAoY3VyTG9nTGV2ZWwoKSA9PSAndGVzdGluZycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGluaXRMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMgPSBbbGV2ZWxdXHJcblx0Y29uc29sZS5sb2cgXCJMT0cgTEVWRUwgc2V0IHRvICN7bGV2ZWx9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcHVzaExvZ0xldmVsIDo9IChcclxuXHRcdGxldmVsOiBUTG9nTGV2ZWxcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0bExvZ0xldmVscy5wdXNoIGxldmVsXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHBvcExvZ0xldmVsIDo9ICgpOiBUTG9nTGV2ZWwgPT5cclxuXHJcblx0aWYgKGxMb2dMZXZlbHMubGVuZ3RoID09IDApXHJcblx0XHRyZXR1cm4gJ2luZm8nXHJcblx0ZWxzZVxyXG5cdFx0cmVzdWx0IDo9IGxMb2dMZXZlbHMucG9wKClcclxuXHRcdHJldHVybiByZXN1bHQgfHwgJ2luZm8nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvSlNPTiA6PSAoaXRlbTogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoaXRlbSwgbnVsbCwgMylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgTE9HIDo9IChcclxuXHRcdC4uLmxJdGVtczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiAoaXRlbSA9PSBJTkRFTlQpXHJcblx0XHRcdGluZGVudExldmVsICs9IDFcclxuXHRcdGVsc2UgaWYgKGl0ZW0gPT0gVU5ERU5UKVxyXG5cdFx0XHRpZiAoaW5kZW50TGV2ZWwgPiAwKVxyXG5cdFx0XHRcdGluZGVudExldmVsIC09IDFcclxuXHRcdGVsc2VcclxuXHRcdFx0bG9nTGluZSBpdGVtXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IERCRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHQjIC0tLSBpZiBhbiBhcHBlbmQgZmlsZSBpcyBkZWZpbmVkLCBvdXRwdXQgZXZlbiBpZlxyXG5cdCMgICAgIGN1cnJlbnQgbG9nIGxldmVsIGlzIG5vdCAnZGVidWcnXHJcblx0YXBwZW5kRGVidWdGaWxlIC4uLmxJdGVtc1xyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAnZGVidWcnKVxyXG5cdFx0TE9HIC4uLmxJdGVtc1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBXQVJOIDo9IChcclxuXHRcdC4uLmxNc2dzOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgbm90TG9nZ2luZygpXHJcblx0XHRyZXR1cm5cclxuXHRmb3IgbXNnIG9mIGxNc2dzXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tjeWFuKCdXQVJOSU5HJyl9OiAje21zZ31cIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBFUlIgOj0gKFxyXG5cdFx0ZXJyOiB1bmtub3duXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0VSUidcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0ZXJyTXNnIDo9IGdldEVyclN0cihlcnIpXHJcblx0bExvZ0xpbmVzLnB1c2ggZXJyTXNnXHJcblx0aWYgbm90TG9nZ2luZygpXHJcblx0XHRyZXR1cm5cclxuXHRjb25zb2xlLmVycm9yIHJlZChsYWJlbCkgKyAnOiAnICsgZXJyTXNnXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUTmV2ZXJGdW5jID0gKGVycjogc3RyaW5nKSA9PiBuZXZlclxyXG5cclxuZXhwb3J0IGNyb2FrOiBUTmV2ZXJGdW5jIDo9IChcclxuXHRcdGVyck1zZzogc3RyaW5nXHJcblx0XHQpOiBuZXZlciA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAndGVzdGluZycpXHJcblx0XHQjIC0tLSBhbGxvd3MgdGhlIGVycm9yIHRvIGJlIGNhdWdodCBhbmQgaGFuZGxlZCBvciBpZ25vcmVkXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyTXNnKVxyXG5cdGVsc2VcclxuXHRcdGNvbnNvbGUuZXJyb3IgcmVkKCdDUk9BSycpICsgJzogJyArIGVyck1zZ1xyXG5cdFx0Y29uc29sZS5lcnJvciBcIi0tLS0tICBTVEFDSyAtLS0tLVwiXHJcblx0XHRmb3IgZnJhbWUgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0XHRkdW1wRnJhbWUgZnJhbWVcclxuXHRcdERlbm8uZXhpdCgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1hdGNoZXMgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmdcclxuXHRcdHJlZ2V4cDogUmVnRXhwXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiByZWdleHAudGVzdChzdHIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHVua25vd25Ub1N0cmluZyA6PSAoeDogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAodHlwZW9mIHggPT0gJ3N0cmluZycpID8geFxyXG5cdFx0OiAoeCA9PSB1bmRlZikgICAgICAgICAgID8gJ3VuZGVmJ1xyXG5cdFx0OiAoeCA9PSBudWxsKSAgICAgICAgICAgID8gJ251bGwnXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh4KVxyXG5cdFx0KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmxvZ0xpbmUgOj0gKFxyXG5cdFx0eDogdW5rbm93bixcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0bGluZSA6PSAnXFx0Jy5yZXBlYXQoaW5kZW50TGV2ZWwpICsgdW5rbm93blRvU3RyaW5nKHgpXHJcblx0Y29uc29sZS5sb2cgbGluZVxyXG5cdGxMb2dMaW5lcy5wdXNoIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJMb2cgOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0bExvZ0xpbmVzLmxlbmd0aCA9IDBcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TG9nIDo9ICgpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGxMb2dMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICAgICAgICAgRmlsZSBTeXN0ZW0gVXRpbHNcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaW5kRmlsZSA6PSAoXHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXHJcblx0XHQpOiBzdHJpbmc/ID0+XHJcblxyXG5cdGFzc2VydCBub3Qgcm9vdC5lbmRzV2l0aCgnLycpLCBcIkJhZCByb290OiAje3Jvb3R9XCJcclxuXHJcblx0bGV0IGZvdW5kUGF0aDogc3RyaW5nPyA9IHVuZGVmXHJcblx0Zm9yIHtwYXRofSBvZiBleHBhbmRHbG9iU3luYyBcIiN7cm9vdH0vKiovI3tmaWxlTmFtZX1cIiwge1xyXG5cdFx0XHRyb290XHJcblx0XHRcdGluY2x1ZGVEaXJzOiBmYWxzZVxyXG5cdFx0XHRjYW5vbmljYWxpemU6IGZhbHNlXHJcblx0XHRcdH1cclxuXHRcdGlmIGRlZmluZWQoZm91bmRQYXRoKVxyXG5cdFx0XHRjcm9hayBcIk11bHRpcGxlIGZpbGVzIG5hbWVkICN7ZmlsZU5hbWV9IGZvdW5kIGluICN7cm9vdH1cIlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRmb3VuZFBhdGggPSBub3JtYWxpemVQYXRoIHBhdGhcclxuXHRyZXR1cm4gZm91bmRQYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vcm1hbGl6ZVBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0bmV3cGF0aCA6PSBwYXRoLnJlcGxhY2VBbGwgJ1xcXFwnLCAnLydcclxuXHRpZiAobmV3cGF0aC5jaGFyQXQoMSkgPT0gJzonKVxyXG5cdFx0cmV0dXJuIG5ld3BhdGguY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuZXdwYXRoLnN1YnN0cmluZygxKVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbGVFeHQgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBwYXRoLm1hdGNoKC9cXC5bXlxcLl0rJC8pXHJcblx0cmV0dXJuIGxNYXRjaGVzID8gbE1hdGNoZXNbMF0gOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBleHQuc3RhcnRzV2l0aCgnLicpLCBcIkJhZCBmaWxlIGV4dGVuc2lvbjogI3tleHR9XCJcclxuXHRwb3MgOj0gcGF0aC5sYXN0SW5kZXhPZiAnLidcclxuXHRhc3NlcnQgKHBvcyA+PSAwKSwgXCJwYXRoIGNvbnRhaW5zIG5vIHBlcmlvZDogI3twYXRofVwiXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcGF0aC5zdWJzdHJpbmcoMCwgcG9zKSArIGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b1JlbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlKHJvb3QsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVzb2x2ZSgnLicsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBpc0Fic29sdXRlKHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGV4aXN0c1N5bmMoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3NyY1BhdGh9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpLCBcImRlc3RtcyBub3QgZGVmaW5lZFwiXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcyksIFwic3JjbXMgbm90IGRlZmluZWRcIlxyXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcclxuXHRjYXRjaCBlcnJcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlU3RhdHMgPSB7XHJcblx0aXNGaWxlOiBib29sZWFuXHJcblx0aXNEaXJlY3Rvcnk6IGJvb2xlYW5cclxuXHRtdGltZTogRGF0ZT9cclxuXHR9XHJcblxyXG5leHBvcnQgZ2V0RmlsZVN0YXRzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEZpbGVTdGF0cyA9PlxyXG5cclxuXHRoU3RhdHMgOj0gRGVuby5zdGF0U3luYyBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGlzRmlsZTogICAgICBoU3RhdHMuaXNGaWxlXHJcblx0XHRpc0RpcmVjdG9yeTogaFN0YXRzLmlzRGlyZWN0b3J5XHJcblx0XHRtdGltZTogICAgICAgaFN0YXRzLm10aW1lIHx8IHVuZGVmXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZpbGUgOj0gYXdhaXQgRGVuby5vcGVuIHBhdGhcclxuXHRzdHJlYW0gOj0gKGZpbGUucmVhZGFibGVcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0RGVjb2RlclN0cmVhbSgpKVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHRMaW5lU3RyZWFtKCkpXHJcblx0XHRcdClcclxuXHRmb3IgYXdhaXQgbGluZSBvZiBzdHJlYW1cclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGVTeW5jIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0dGV4dCA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMocGF0aClcclxuXHRmb3IgbGluZSBvZiB0ZXh0LnNwbGl0KC9cXHI/XFxuLylcclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBta1RlbXBGaWxlIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGF3YWl0IERlbm8ubWFrZVRlbXBGaWxlIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZVN5bmMgOj0gKFxyXG5cdFx0c3VmZml4OiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEFzc2VydEZ1bmMgPSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0bXNnOiBzdHJpbmdcclxuXHRcdCkgPT4gYXNzZXJ0cyBjb25kXHJcblxyXG5leHBvcnQgYXNzZXJ0OiBUQXNzZXJ0RnVuYyA6PSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0bXNnOiBzdHJpbmdcclxuXHRcdCk6IGFzc2VydHMgY29uZCA9PlxyXG5cclxuXHRpZiBub3QgY29uZFxyXG5cdFx0Y3JvYWsgbXNnXHJcblx0cmV0dXJuXHJcblxyXG50eXBlIFRPYnZpb3VzbHlGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdGNvbmRTdHI/OiBzdHJpbmdcclxuXHRcdCkgPT4gYXNzZXJ0cyBjb25kXHJcblxyXG5leHBvcnQgb2J2aW91c2x5OiBUT2J2aW91c2x5RnVuYyA6PSAoXHJcblx0XHRjb25kOiB1bmtub3duXHJcblx0XHRjb25kU3RyOiBzdHJpbmcgPSAnJ1xyXG5cdFx0KTogYXNzZXJ0cyBjb25kID0+XHJcblxyXG5cdGlmIG5vdCBjb25kXHJcblx0XHRjcm9hayBcIiN7Y29uZFN0ciB8fCAnY29uZGl0aW9uJ30gbm90IG9idmlvdXNseSB0cnVlXCJcclxuXHRcdERlbm8uZXhpdCgpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgUmF3U291cmNlTWFwID0ge1xyXG5cdHZlcnNpb246IG51bWJlcjsgICAgICAgICAgICMgVGhlIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXAgc3BlYyAodXN1YWxseSAzKVxyXG5cdGZpbGU6IHN0cmluZzsgICAgICAgICAgICAgICMgVGhlIGdlbmVyYXRlZCBmaWxlIHRoaXMgbWFwIGlzIGFzc29jaWF0ZWQgd2l0aFxyXG5cdHNvdXJjZXM6IHN0cmluZ1tdOyAgICAgICAgICMgQXJyYXkgb2YgVVJMcyB0byB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzXHJcblx0bmFtZXM6IHN0cmluZ1tdOyAgICAgICAgICAgIyBBcnJheSBvZiBpZGVudGlmaWVycyAobmFtZXMpIHVzZWQgaW4gdGhlIG1hcHBpbmdzXHJcblx0c291cmNlUm9vdD86IHN0cmluZzsgICAgICAgIyBPcHRpb25hbDogVVJMIHJvb3QgZm9yIHRoZSBzb3VyY2VzXHJcblx0c291cmNlc0NvbnRlbnQ/OiBzdHJpbmdbXTsgIyBDb250ZW50IG9mIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMgKG9wdGlvbmFsKVxyXG5cdG1hcHBpbmdzOiBzdHJpbmc7ICAgICAgICAgICMgVGhlIGFjdHVhbCBlbmNvZGVkIG1hcHBpbmdzIChCYXNlNjQgVkxRKVxyXG5cdH1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlUG9zaXRpb24gPSB7XHJcblx0c291cmNlOiBzdHJpbmdcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBtYXBQb3MgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdGNvbnN1bWVyIDo9IGF3YWl0IG5ldyBTb3VyY2VNYXBDb25zdW1lcihoU3JjTWFwKVxyXG5cdFx0cG9zIDo9IGNvbnN1bWVyLm9yaWdpbmFsUG9zaXRpb25Gb3Ioe2xpbmUsIGNvbHVtbjogY29sfSlcclxuXHRcdHJldHVybiBwb3MgYXMgVEZpbGVQb3NpdGlvblxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBtYXBQb3NTeW5jIDo9IChcclxuXHRmaWxlUG9zOiBURmlsZVBvc2l0aW9uXHJcblx0KTogVEZpbGVQb3NpdGlvbj8gPT5cclxuXHJcblx0e3NvdXJjZSwgbGluZSwgY29sfSA6PSBmaWxlUG9zXHJcblx0Y29udGVudHMgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jIHNvdXJjZVxyXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwIGNvbnRlbnRzXHJcblx0aWYgZGVmaW5lZChoU3JjTWFwKVxyXG5cdFx0W2ZpbGVOdW0sIHNyY0xpbmUsIHNyY0NvbF0gOj0gZ2V0T3JnUG9zIGhTcmNNYXAsIGxpbmUsIGNvbFxyXG5cdFx0ZmlsZU5hbWUgOj0gaFNyY01hcC5zb3VyY2VzW2ZpbGVOdW1dXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzb3VyY2U6IG5vcm1hbGl6ZVBhdGggXCIje2Rpcm5hbWUoc291cmNlKX0vI3tmaWxlTmFtZX1cIlxyXG5cdFx0XHRsaW5lOiBzcmNMaW5lXHJcblx0XHRcdGNvbDogc3JjQ29sXHJcblx0XHRcdH1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZXh0cmFjdFNvdXJjZU1hcCA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nXHJcblx0XHQpOiBbc3RyaW5nLCBSYXdTb3VyY2VNYXA/XSA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBjb250ZW50cy5tYXRjaCAvLy9eXHJcblx0XHRcdCguKilcclxuXHRcdFx0XFwvIFxcLyBcXCMgXFxzK1xyXG5cdFx0XHRzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb25cXC9qc29uO1xyXG5cdFx0XHQoPzpjaGFyc2V0PXV0Zi04Oyk/XHJcblx0XHRcdGJhc2U2NCxcclxuXHRcdFx0KC4rKVxyXG5cdFx0XHQkLy8vc1xyXG5cdGlmIChsTWF0Y2hlcyA9PSBudWxsKVxyXG5cdFx0cmV0dXJuIFtjb250ZW50cywgdW5kZWZdXHJcblx0W18sIGNvZGUsIGhTcmNNYXBTdHJdIDo9IGxNYXRjaGVzXHJcblx0aFNyY01hcCA6PSBKU09OLnBhcnNlKGF0b2IoaFNyY01hcFN0cikpIGFzIFJhd1NvdXJjZU1hcFxyXG5cdHtmaWxlfSA6PSBoU3JjTWFwXHJcblx0aFNyY01hcC5maWxlID0gdG9SZWxQYXRoKGZpbGUpXHJcblx0aFNyY01hcC5zb3VyY2VzID0gZm9yIHBhdGggb2YgaFNyY01hcC5zb3VyY2VzXHJcblx0XHR0b1JlbFBhdGgocGF0aClcclxuXHRyZXR1cm4gW2NvZGUsIGhTcmNNYXBdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUT3JnUG9zID0gW2ZpbGVOdW06IG51bWJlciwgbGluZTogbnVtYmVyLCBjb2w6IG51bWJlcl1cclxudHlwZSBUQ29tcGFyZVJlc3VsdCA9IC0xIHwgMCB8IDFcclxuXHJcbmNvbXBhcmUgOj0gKFxyXG5cdFx0ZmluZDogW251bWJlciwgbnVtYmVyXSxcclxuXHRcdGdlbjogIFtudW1iZXIsIG51bWJlcl1cclxuXHRcdCk6IFRDb21wYXJlUmVzdWx0ID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgIChmaW5kWzBdIDwgZ2VuWzBdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzBdID4gZ2VuWzBdKSA/ICAxXHJcblx0XHQ6IChmaW5kWzFdIDwgZ2VuWzFdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzFdID4gZ2VuWzFdKSA/ICAxXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAwXHJcblx0XHQpXHJcblxyXG5leHBvcnQgZ2V0T3JnUG9zIDo9IChcclxuXHRcdGhTcmNNYXA6IFJhd1NvdXJjZU1hcCxcclxuXHRcdGxpbmU6IG51bWJlcixcclxuXHRcdGNvbDogbnVtYmVyXHJcblx0XHQpOiBUT3JnUG9zID0+XHJcblxyXG5cdGxNYXBwaW5ncyA6PSBnZXRNYXBwaW5ncyhoU3JjTWFwLm1hcHBpbmdzKVxyXG5cdGFzc2VydCAobE1hcHBpbmdzLmxlbmd0aCA+IDApLCBcIkVtcHR5IG1hcHBpbmdzIGFycmF5XCJcclxuXHRsZXQgcG9zID0gMCwgZW5kID0gbE1hcHBpbmdzLmxlbmd0aCAtIDFcclxuXHR3aGlsZSAocG9zIDw9IGVuZClcclxuXHJcblx0XHQjIC0tLSBDYWxjdWxhdGUgdGhlIG1pZGRsZSBpbmRleFxyXG5cdFx0bWlkIDo9IE1hdGguZmxvb3IoKHBvcyArIGVuZCkgLyAyKVxyXG5cdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdIDo9IGxNYXBwaW5nc1ttaWRdXHJcblx0XHRzd2l0Y2ggY29tcGFyZShbbGluZSwgY29sXSwgW3RzTGluZSwgdHNDb2xdKVxyXG5cdFx0XHR3aGVuIDBcclxuXHRcdFx0XHRyZXR1cm4gW29yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdXHJcblx0XHRcdHdoZW4gLTFcclxuXHRcdFx0XHRlbmQgPSBtaWQgLSAxO1xyXG5cdFx0XHR3aGVuIDFcclxuXHRcdFx0XHRwb3MgPSBtaWQgKyAxO1xyXG5cclxuXHQjIC0tLSBJZiB0aGUgbG9vcCBmaW5pc2hlcywgdGhlIHRhcmdldCBpcyBub3QgaW4gdGhlIGFycmF5XHJcblx0aWYgKHBvcyA8IGxNYXBwaW5ncy5sZW5ndGgpXHJcblx0XHRsZXQgW3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdID0gbE1hcHBpbmdzW3Bvc11cclxuXHRcdGlmICh0c0xpbmUgIT0gbGluZSkgfHwgKHRzQ29sICE9IGNvbClcclxuXHRcdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdID0gbE1hcHBpbmdzW3Bvcy0xXVxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cdGVsc2VcclxuXHRcdGxhc3QgOj0gbE1hcHBpbmdzLmF0KC0xKVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQobGFzdCksIFwibGFzdCBub3QgZGVmaW5lZFwiXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbGFzdFxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNYXBwaW5ncyA6PSAoXHJcblx0XHRkYXRhOiBzdHJpbmcsXHJcblx0XHQpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGxNYXBwaW5nczogbnVtYmVyW11bXSA6PSBbXVxyXG5cdHZhciBzdW06IG51bWJlcltdID0gWzAsIDAsIDAsIDBdXHJcblx0Zm9yIGxpbmUsbGluZU51bSBvZiBkYXRhLnNwbGl0KFwiO1wiKVxyXG5cdFx0c3VtWzBdID0gMFxyXG5cdFx0ZGVjb2RlTGluZShsaW5lKS5mb3JFYWNoIChwKSA9PlxyXG5cdFx0XHRmb3IgKGkgb2YgWzAuLi5wLmxlbmd0aF0pXHJcblx0XHRcdFx0c3VtW2ldICs9IHBbaV1cclxuXHRcdFx0bE1hcHBpbmdzLnB1c2ggW2xpbmVOdW0sIHN1bVswXSwgc3VtWzFdLCBzdW1bMl0sIHN1bVszXV1cclxuXHRyZXR1cm4gbE1hcHBpbmdzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29kZUxpbmUgOj0gKGxpbmU6IHN0cmluZyk6IG51bWJlcltdW10gPT5cclxuXHJcblx0aWYgKGxpbmUgPT0gJycpXHJcblx0XHRyZXR1cm4gW11cclxuXHJcblx0cmV0dXJuIGZvciB0b2tlbiBvZiBsaW5lLnNwbGl0KCcsJylcclxuXHRcdGxPdXRwdXQ6IG51bWJlcltdIDo9IFtdXHJcblx0XHRsZXQgaSA9IDBcclxuXHRcdHdoaWxlIChpIDwgdG9rZW4ubGVuZ3RoKVxyXG5cdFx0XHRsZXQgdiA9IDAsIGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRpICs9IDFcclxuXHRcdFx0diB8PSAoZCAmIDMxKSAgICAgICAgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdGxldCBzaGlmdCA9IDVcclxuXHRcdFx0d2hpbGUgKGQgJiAzMikgICAgICAgICAjIHJlcGVhdCBpZiBoaWdoIGJpdCBvZiBkIGlzIHNldFxyXG5cdFx0XHRcdGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRcdGkgKz0gMVxyXG5cdFx0XHRcdHYgfD0gKGQgJiAzMSkgPDwgc2hpZnQgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdFx0c2hpZnQgKz0gNVxyXG5cdFx0XHRsT3V0cHV0LnB1c2godiAmIDEgPyAtKHYgPj4gMSkgOiB2ID4+IDEpICMgbG93IGJpdCBpcyBzaWduXHJcblx0XHRsT3V0cHV0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZyYW1lVHlwZSA9IChcclxuXHQnZXZhbCcgfFxyXG5cdCduYXRpdmUnIHxcclxuXHQnY29uc3RydWN0b3InIHxcclxuXHQnbWV0aG9kJyB8XHJcblx0J2Z1bmN0aW9uJyB8XHJcblx0J3NjcmlwdCcgfFxyXG5cdCd1bmtub3duJ1xyXG5cdClcclxuXHJcbmV4cG9ydCB0eXBlIFRTdGFja0ZyYW1lID0ge1xyXG5cdGk6IG51bWJlclxyXG5cdHR5cGU6IHN0cmluZ1xyXG5cdHNvdXJjZTogc3RyaW5nICAgICAgICAjIHJlbGF0aXZlIGZpbGUgcGF0aCBvciAndW5rbm93bidcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdG5hbWU6IHN0cmluZyAgICAgICAgICAjIG5hbWUgb2YgZnVuY3Rpb24gb3IgbWV0aG9kXHJcblx0b3JnU291cmNlPzogc3RyaW5nXHJcblx0b3JnTGluZT86IG51bWJlclxyXG5cdG9yZ0NvbD86IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsU3RhY2tGcmFtZXMgOj0gKFxyXG5cdFx0dHJhY2UgPSBmYWxzZVxyXG5cdFx0KTogVEl0ZXJhdG9yPFRTdGFja0ZyYW1lPiAtPlxyXG5cclxuXHRwcm9jZXNzLnNldFNvdXJjZU1hcHNFbmFibGVkKGZhbHNlKVxyXG5cdG9wZW5EZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cdGZtdCA6PSAoXHJcblx0XHRcdGxpbmU6IG51bWJlcixcclxuXHRcdFx0Y29sOiBudW1iZXIsXHJcblx0XHRcdHNyYzogc3RyaW5nXHJcblx0XHRcdCk6IHN0cmluZyA9PlxyXG5cdFx0cmV0dXJuIFwiI3tzcHJpbnRmKCclM2QnLCBsaW5lKX0gI3tzcHJpbnRmKCclM2QnLCBjb2wpfSAje3NyY31cIlxyXG5cclxuXHR0cnlcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0b2xkTGltaXQgOj0gRXJyb3Iuc3RhY2tUcmFjZUxpbWl0XHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdG9sZFByZXBhcmVyIDo9IEVycm9yLnByZXBhcmVTdGFja1RyYWNlXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDk5XHJcblxyXG5cdFx0bGV0IHByZXZGcmFtZTogVFN0YWNrRnJhbWU/ID0gdW5kZWZpbmVkXHJcblxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IChlcnJvciwgbE9yZ0ZyYW1lcykgPT5cclxuXHJcblx0XHRcdGxldCBsRnJhbWVzOiBUU3RhY2tGcmFtZVtdID0gW11cclxuXHJcblx0XHRcdGZvciBvcmdGcmFtZSxpIG9mIGxPcmdGcmFtZXNcclxuXHJcblx0XHRcdFx0c3JjIDo9IG9yZ0ZyYW1lLmdldEZpbGVOYW1lKCkgICAgIyAtLS0gYSBmdWxsIHBhdGhcclxuXHRcdFx0XHRpZiBub3RkZWZpbmVkKHNyYykgfHwgc3JjLm1hdGNoKC8vL2V4dCBcXDogY2xpIFxcLyBcXGQrX3Rlc3RcXC5qcy8vLylcclxuXHRcdFx0XHRcdGNvbnRpbnVlXHJcblxyXG5cdFx0XHRcdCMgLS0tIFRoZXNlIGFyZSBjb25zdGFudHNcclxuXHRcdFx0XHRvcmdTb3VyY2UgOj0gbm9ybWFsaXplUGF0aCBzcmNcclxuXHRcdFx0XHRvcmdMaW5lICAgOj0gb3JnRnJhbWUuZ2V0TGluZU51bWJlcigpIHx8IDBcclxuXHRcdFx0XHRvcmdDb2wgICAgOj0gb3JnRnJhbWUuZ2V0Q29sdW1uTnVtYmVyKCkgfHwgMFxyXG5cclxuXHRcdFx0XHREQkcgJy0nLnJlcGVhdCA2NFxyXG5cdFx0XHRcdERCRyBmbXQob3JnTGluZSwgb3JnQ29sLCBvcmdTb3VyY2UpXHJcblxyXG5cdFx0XHRcdCMgLS0tIFRoZXNlIGNhbiBiZSBvdmVyd3JpdHRlbiB3aGVuIHVzaW5nIHNvdXJjZSBtYXBzXHJcblx0XHRcdFx0bGV0IHNvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdGxldCBsaW5lICAgPSBvcmdMaW5lXHJcblx0XHRcdFx0bGV0IGNvbCAgICA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHRmdW5jdGlvbk5hbWUgOj0gb3JnRnJhbWUuZ2V0RnVuY3Rpb25OYW1lKClcclxuXHRcdFx0XHRtZXRob2ROYW1lICAgOj0gb3JnRnJhbWUuZ2V0TWV0aG9kTmFtZSgpXHJcblxyXG5cdFx0XHRcdCMgLS0tIGZvbGxvdyBzb3VyY2UgbWFwcyByZWN1cnNpdmVseVxyXG5cdFx0XHRcdGxldCBuZXdGaWxlUG9zID0gbWFwUG9zU3luYyh7c291cmNlLCBsaW5lLCBjb2x9KVxyXG5cdFx0XHRcdHdoaWxlIGRlZmluZWQobmV3RmlsZVBvcylcclxuXHRcdFx0XHRcdHNvdXJjZSA9IG5ld0ZpbGVQb3Muc291cmNlICAgIyAtLS0gYWxyZWFkeSBub3JtYWxpemVkXHJcblx0XHRcdFx0XHRsaW5lICAgPSBuZXdGaWxlUG9zLmxpbmVcclxuXHRcdFx0XHRcdGNvbCAgICA9IG5ld0ZpbGVQb3MuY29sXHJcblx0XHRcdFx0XHREQkcgZm10KGxpbmUsIGNvbCwgc291cmNlKVxyXG5cdFx0XHRcdFx0bmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMobmV3RmlsZVBvcylcclxuXHJcblx0XHRcdFx0ZnJhbWU6IFRTdGFja0ZyYW1lIDo9IHtcclxuXHRcdFx0XHRcdGlcclxuXHRcdFx0XHRcdHR5cGU6IChcclxuXHRcdFx0XHRcdFx0ICBmdW5jdGlvbk5hbWUgICAgICAgICAgICAgPyAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRcdDogbWV0aG9kTmFtZSAgICAgICAgICAgICAgID8gJ21ldGhvZCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc1RvcGxldmVsKCkgICAgPyAnc2NyaXB0J1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzRXZhbCgpICAgICAgICA/ICdldmFsJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzTmF0aXZlKCkgICAgICA/ICduYXRpdmUnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNDb25zdHJ1Y3RvcigpID8gJ2NvbnN0cnVjdG9yJ1xyXG5cdFx0XHRcdFx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0XHRcdFx0XHQpXHJcblx0XHRcdFx0XHRzb3VyY2VcclxuXHRcdFx0XHRcdGxpbmVcclxuXHRcdFx0XHRcdGNvbFxyXG5cdFx0XHRcdFx0bmFtZTogZnVuY3Rpb25OYW1lIHx8IG1ldGhvZE5hbWUgfHwgJydcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0IyAtLS0gQWRkIG9yaWdpbmFsIHNvdXJjZSwgbGluZSAmIGNvbCBpZiBtYXBwZWRcclxuXHRcdFx0XHRpZiAoc291cmNlICE9IG9yZ1NvdXJjZSlcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ1NvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnTGluZSA9IG9yZ0xpbmVcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0NvbCA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHQjIC0tLSBmaXggYSBidWcgaW4gdGhlIFY4IGVuZ2luZSB3aGVyZSBjYWxscyBpbnNpZGUgYVxyXG5cdFx0XHRcdCMgICAgIHRvcCBsZXZlbCBhbm9ueW1vdXMgZnVuY3Rpb24gaXMgcmVwb3J0ZWQgYXNcclxuXHRcdFx0XHQjICAgICBiZWluZyBvZiB0eXBlICdzY3JpcHQnXHJcblxyXG5cdFx0XHRcdGlmIHByZXZGcmFtZSAmJiAoZnJhbWUudHlwZSA9PSAnc2NyaXB0JykgJiYgKHByZXZGcmFtZS50eXBlID09ICdzY3JpcHQnKVxyXG5cdFx0XHRcdFx0cHJldkZyYW1lLnR5cGUgPSAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUubmFtZSA9ICc8YW5vbj4nXHJcblxyXG5cdFx0XHRcdGlmIHRyYWNlXHJcblx0XHRcdFx0XHRkdW1wRnJhbWUgZnJhbWUsICdPUkcgRlJBTUUnXHJcblx0XHRcdFx0cHJldkZyYW1lID0gZnJhbWVcclxuXHRcdFx0XHRsRnJhbWVzLnB1c2ggZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblx0XHRmb3IgZnJhbWUgb2YgbFN0YWNrXHJcblx0XHRcdHlpZWxkIGZyYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tyZWQoJ0VSUk9SIGluIGFsbFN0YWNrRnJhbWVzOicpfSAje2dldEVyclN0cihlcnIpfVwiXHJcblx0XHRyZXR1cm5cclxuXHRmaW5hbGx5XHJcblx0XHRjbG9zZURlYnVnRmlsZSAnc3RhY2snXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE15Q2FsbGVyIDo9ICgpOiBUU3RhY2tGcmFtZT8gPT5cclxuXHJcblx0Zm9yIGZyYW1lLGkgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0aWYgKGkgPT0gMylcclxuXHRcdFx0cmV0dXJuIGZyYW1lXHJcblx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGR1bXBGcmFtZSA6PSAoXHJcblx0XHRmcmFtZTogVFN0YWNrRnJhbWUsXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0ZSQU1FJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7aSwgdHlwZSwgc291cmNlLCBsaW5lLCBjb2wsIG5hbWV9IDo9IGZyYW1lXHJcblx0dHlwZVN0ciA6PSBzcHJpbnRmKCclLThzJywgdHlwZSlcclxuXHRuYW1lU3RyIDo9IHNwcmludGYoJyUtMTZzJywgbmFtZSlcclxuXHRpZiBzb3VyY2VcclxuXHRcdExPRyBcIiN7bGFiZWx9WyN7aX1dOiAje3R5cGVTdHJ9ICN7bmFtZVN0cn0gI3tzb3VyY2V9OiN7bGluZX06I3tjb2x9XCJcclxuXHRlbHNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9IDxub25lPlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEVyclN0ciA6PSAoZXJyOiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG5cdFx0cmV0dXJuIGVyclxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yKVxyXG5cdFx0ZXJybXNnIDo9IGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdFx0cmV0dXJuIFwiI3tjb2xvcml6ZSgnQXNzZXJ0aW9uRXJyb3I6ICcsICdyZWQnKX0je2Vycm1zZ31cIlxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKVxyXG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiBcIlNFUklPVVMgRVJST1JcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBFWEVDIDo9IChcclxuXHRcdGZ1bmM6ICgpID0+IHZvaWRcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0dHJ5XHJcblx0XHRmdW5jKClcclxuXHRjYXRjaCBlcnJcclxuXHRcdGNyb2FrIFwiaW4gRVhFQygpOiAje2dldEVyclN0cihlcnIpfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IFNLSVAgOj0gKGZ1bmM6ICgpID0+IHZvaWQpOiB2b2lkID0+XHJcblxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQcmVkaWNhdGU8VD11bmtub3duPiA9IChpdGVtOiBUKSA9PiBib29sZWFuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvQm9vbCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIG5vdCBub3QgeFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlPZiA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSxcclxuXHRcdGNoZWNrRnVuYzogVFByZWRpY2F0ZTxUPiA9ICh4KSA9PiB0b0Jvb2woeClcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsT2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgbm90IGNoZWNrRnVuYyhpdGVtKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmlzQXN5bmNHZW5lcmF0b3JGdW5jdGlvbiA6PSAoXHJcblx0XHR4OiB1bmtub3duXHJcblx0XHQpOiB4IGlzIEFzeW5jR2VuZXJhdG9yRnVuY3Rpb24gPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgICh0eXBlb2YgeCA9PSAnZnVuY3Rpb24nKVxyXG5cdFx0JiYgKHgudG9TdHJpbmcoKS5tYXRjaCgvXFxiYXN5bmNcXHMrZnVuY3Rpb25cXHMqXFwqLykgIT0gbnVsbClcclxuXHRcdClcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxWYWx1ZXNGcm9tIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdIHwgVEl0ZXJhdG9yPFQ+XHJcblx0XHQpOiBUSXRlcmF0b3I8VD4gLT5cclxuXHJcblx0aXRlciA6PSBBcnJheS5pc0FycmF5KGxJdGVtcykgPyBsSXRlbXMudmFsdWVzKCkgOiBsSXRlbXNcclxuXHRsb29wXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdGJyZWFrXHJcblx0XHRlbHNlXHJcblx0XHRcdHlpZWxkIHZhbHVlXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFZhbHVlc0Zyb21Bc3luYyA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSB8IFRJdGVyYXRvcjxUPiB8IFRBc3luY0l0ZXJhdG9yPFQ+XHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxUPiAtPlxyXG5cclxuXHRpdGVyIDo9IEFycmF5LmlzQXJyYXkobEl0ZW1zKSA/IGxJdGVtcy52YWx1ZXMoKSA6IGxJdGVtc1xyXG5cdGxvb3BcclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gYXdhaXQgaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0YnJlYWtcclxuXHRcdGVsc2VcclxuXHRcdFx0eWllbGQgdmFsdWVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd3JpdGUgOj0gKHN0cjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHREZW5vLnN0ZG91dC53cml0ZVN5bmMgZW5jb2RlKHN0cilcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd3JpdGVsbiA6PSAoc3RyOiBzdHJpbmcgPSAnJyk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgc3RyICsgJ1xcbidcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJTY3JlZW4gOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgJ1xceDFiW0hcXHgxYlsySidcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVzZXRMaW5lIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIFwiXFx4MWJbMktcIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhclByZXZpb3VzTGluZXMgOj0gKG51bUxpbmVzOiBudW1iZXIpOiB2b2lkID0+XHJcblx0IyBcXHgxYltuQSBtb3ZlcyB0aGUgY3Vyc29yIHVwICduJyBsaW5lc1xyXG5cdCMgXFxyIG1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgbGluZVxyXG5cdCMgXFx4MWJbSyBjbGVhcnMgdGhlIGxpbmUgZnJvbSB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgKG9wdGlvbmFsLCBidXQgZ29vZCBwcmFjdGljZSlcclxuXHJcblx0RGVuby5zdGRvdXQud3JpdGVTeW5jIGVuY29kZShcIlxceDFiWyN7bnVtTGluZXN9QVxcclxceDFiW0tcIilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQ29sb3IgPSAnY3lhbid8J2JsdWUnfCdibGFjayd8J3JlZCd8J2dyZWVuJ3wnbWFnZW50YSd8J3llbGxvdydcclxuXHJcbmV4cG9ydCBpc0NvbG9yIDo9IChzdHI6IHN0cmluZyk6IHN0ciBpcyBUQ29sb3IgPT5cclxuXHJcblx0cmV0dXJuIFsnY3lhbicsJ2JsdWUnLCdibGFjaycsJ3JlZCcsJ2dyZWVuJywnbWFnZW50YScsJ3llbGxvdyddLmluY2x1ZGVzIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjb2xvcml6ZSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChjb2xvcikgfHwgbm90IGlzQ29sb3IoY29sb3IpXHJcblx0XHRyZXR1cm4gc3RyXHJcblx0c3dpdGNoIGNvbG9yXHJcblx0XHR3aGVuICdjeWFuJyAgICB0aGVuIHJldHVybiBjeWFuKHN0cilcclxuXHRcdHdoZW4gJ2JsdWUnICAgIHRoZW4gcmV0dXJuIGJsdWUoc3RyKVxyXG5cdFx0d2hlbiAnYmxhY2snICAgdGhlbiByZXR1cm4gYmxhY2soc3RyKVxyXG5cdFx0d2hlbiAncmVkJyAgICAgdGhlbiByZXR1cm4gcmVkKHN0cilcclxuXHRcdHdoZW4gJ2dyZWVuJyAgIHRoZW4gcmV0dXJuIGdyZWVuKHN0cilcclxuXHRcdHdoZW4gJ21hZ2VudGEnIHRoZW4gcmV0dXJuIG1hZ2VudGEoc3RyKVxyXG5cdFx0d2hlbiAneWVsbG93JyAgdGhlbiByZXR1cm4geWVsbG93KHN0cilcclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gaENvbG9ycyBpcyB7PHdvcmQ+OiA8Y29sb3I+LCAuLi4gfVxyXG5cclxudHlwZSBUQ29sb3JNYXAgPSB7XHJcblx0W3dvcmQ6IHN0cmluZ106IFRDb2xvclxyXG5cdH1cclxuXHJcbmV4cG9ydCB3aXRoQ29sb3JzIDo9IChcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRoQ29sb3JzOiBUQ29sb3JNYXBcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRmb3Igd29yZCBvZiBPYmplY3Qua2V5cyhoQ29sb3JzKVxyXG5cdFx0Y29sb3IgOj0gaENvbG9yc1t3b3JkXVxyXG5cdFx0c3RyID0gc3RyLnJlcGxhY2VBbGwod29yZCwgY29sb3JpemUod29yZCwgY29sb3IpKVxyXG5cdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGVjb2xvcml6ZSA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0cmlwQW5zaUNvZGUoc3RyKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc0NoaW5lc2VDaGFyIDo9IChzdHI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0YXNzZXJ0IChzdHIubGVuZ3RoID09IDEpLCBcIk5vdCBhIHNpbmdsZSBjaGFyXCJcclxuXHRyZXR1cm4gdG9Cb29sIHN0ci5tYXRjaCgvXltcXHU0ZTAwLVxcdTlmZmZdJC91KVxyXG4iXX0=