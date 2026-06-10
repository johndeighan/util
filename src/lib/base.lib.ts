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

export const isAsyncFunction = (fn: Function): boolean => {

	return (fn.constructor.name === 'AsyncFunction') ||
		(fn.constructor.name === 'AsyncGenerator')
}

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
// ASYNC

const execAsync = async (
		asyncFunc: () => void
		): Promise<unknown> => {

	return await asyncFunc()
}

// ---------------------------------------------------------------------------
// --- if passed an async function, will return a promise

export const EXEC = (
		func: () => void
		): void => {

	try {
		if (isAsyncFunction(func)) {
			execAsync(func)
		}
		else {
			func()
		}
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWdCLE1BQWYsZUFBZSxDQUFDLENBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUU7QUFDbkQsQUFBQSxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRSxDQUFDLGdCQUFnQixDO0FBQUMsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM3RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN2RixBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUUsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUEsQ0FBQTtBQUMxQixBQUFBLENBQUMsYUFBWTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLEMsTUFBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDLEMsVyxDQUFDLEFBQUMsSSxDQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUEsQUFBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQSxDQUFDO0FBQ25ELEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUztBQUN6QixBQUFBLEFBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQztBQUNwQyxBQUFBLEFBQUEsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTO0FBQ25DLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLElBQUksQztBQUFDLENBQUE7QUFDbkMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3ZELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxNQUFNLENBQUMsSTtFQUFJLEM7Q0FBQSxDQUFBO0FBQ2QsQUFBQSxDQUFDLE1BQU0sQ0FBQyxLO0FBQUssQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3RELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLElBQUksQztBQUFDLENBQUE7QUFDbkMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFjLE1BQWIsYUFBYSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzFELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3JCLEFBQUEsR0FBRyxNQUFNLENBQUMsSTtFQUFJLEM7Q0FBQSxDQUFBO0FBQ2QsQUFBQSxDQUFDLE1BQU0sQ0FBQyxLO0FBQUssQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSSxNQUFILEdB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QUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEMsQUFBQTtBQUNBLEFBQUEsQUFBTyxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNaLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3pCLEFBQUEsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0QixBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ1QsQUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0IsRUFBRSxDQUFDLHVCQUF1QixDQUFDO0FBQzNCLEVBQUUsQztBQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNyQixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTTtBQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2YsQUFBQTtBQUNBLEFBQUEsQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDM0MsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQTtBQUN0RCxBQUFBLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hDLEFBQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUE7QUFDbkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxpQ0FBZ0M7QUFDbEMsQUFBQSxFQUFLLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BDLEFBQUEsRUFBa0QsTUFBaEQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUNwRSxBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsSUFBSSxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEM7R0FBQyxDQUFBO0FBQzVDLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1YsQUFBQSxJQUFJLEdBQUcsQyxDQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTztHQUFBLENBQUE7QUFDbEIsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxJQUFJLEdBQUcsQyxDQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTztHQUFBLEM7RUFBQSxDO0NBQUEsQ0FBQTtBQUNsQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDJEQUEwRDtBQUMzRCxBQUFBLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUE7QUFDNUIsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQ3ZFLEFBQUEsRUFBRSxHQUFHLENBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3ZDLEFBQUEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDLENBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQztF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RSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSxDQUFtQyxNQUFsQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLO0FBQzVDLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNqQyxBQUFBLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDbEMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxNQUFNLENBQUEsQ0FBQSxDQUFBO0FBQ1YsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUN0RSxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsR0FBRyxDQUFBLEFBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQztDQUFBLENBQUE7QUFDcEQsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVB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QUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNqRCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQTtBQUM5QyxBQUFBLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQSxBQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsQztBQUFBLENBQUE7QUFDOUMiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgYmFzZS5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCBwcm9jZXNzIGZyb20gXCJub2RlOnByb2Nlc3NcIlxyXG5pbXBvcnQge1xyXG5cdGN5YW4sIGJsdWUsIGJsYWNrLCByZWQsIGdyZWVuLCBtYWdlbnRhLCB5ZWxsb3csXHJcblx0c3RyaXBBbnNpQ29kZSxcclxuXHR9IGZyb20gJ0BzdGQvZm10L2NvbG9ycydcclxuaW1wb3J0IHtBc3NlcnRpb25FcnJvcn0gZnJvbSAnQHN0ZC9hc3NlcnQnXHJcbmltcG9ydCB7U291cmNlTWFwQ29uc3VtZXJ9IGZyb20gJ0Btb3ppbGxhL3NvdXJjZS1tYXAnXHJcbmltcG9ydCB7XHJcblx0cmVzb2x2ZSwgcmVsYXRpdmUsIGlzQWJzb2x1dGUsIGZyb21GaWxlVXJsLCBkaXJuYW1lLFxyXG5cdH0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5pbXBvcnQge1RleHRMaW5lU3RyZWFtfSBmcm9tICdAc3RkL3N0cmVhbXMnXHJcbmltcG9ydCBkZWVwRXF1YWwgZnJvbSAnbnBtLWZhc3QtZGVlcC1lcXVhbCdcclxuaW1wb3J0IHtleGlzdHNTeW5jLCBlbXB0eURpclN5bmMsIGVuc3VyZURpclN5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7c3ByaW50Zn0gZnJvbSAnQHN0ZC9mbXQvcHJpbnRmJ1xyXG5pbXBvcnQge2V4cGFuZEdsb2JTeW5jfSBmcm9tICdAc3RkL2ZzL2V4cGFuZC1nbG9iJ1xyXG5cclxuZXhwb3J0IHtkZWVwRXF1YWx9XHJcbmV4cG9ydCBkZWVwQ29weSA9IHN0cnVjdHVyZWRDbG9uZVxyXG5cclxubXlkaXIgOj0gZGlybmFtZShmcm9tRmlsZVVybChpbXBvcnQubWV0YS51cmwpKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc0FzeW5jRnVuY3Rpb24gOj0gKGZuOiBGdW5jdGlvbik6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIChmbi5jb25zdHJ1Y3Rvci5uYW1lID09ICdBc3luY0Z1bmN0aW9uJykgfHxcclxuXHRcdChmbi5jb25zdHJ1Y3Rvci5uYW1lID09ICdBc3luY0dlbmVyYXRvcicpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUU3RyaW5nU291cmNlID0gVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCBCdWZmZXJTb3VyY2UgfCBzdHJpbmdcclxuXHJcbmVuY29kZXIgOj0gbmV3IFRleHRFbmNvZGVyKClcclxuZXhwb3J0IGVuY29kZSA6PSAoeDogc3RyaW5nKTogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gPT5cclxuXHRyZXR1cm4gZW5jb2Rlci5lbmNvZGUgeFxyXG5cclxuZGVjb2RlciA6PSBuZXcgVGV4dERlY29kZXIoKVxyXG5leHBvcnQgZGVjb2RlIDo9ICh4OiBUU3RyaW5nU291cmNlKTogc3RyaW5nID0+XHJcblx0cmV0dXJuICh0eXBlb2YgeCA9PSAnc3RyaW5nJykgPyB4IDogZGVjb2Rlci5kZWNvZGUoeClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUSXRlcmF0b3I8VEluLCBUT3V0PXZvaWQsIFRBY2M9dm9pZD4gPSBHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUQXN5bmNJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEFzeW5jR2VuZXJhdG9yPFRJbiwgVE91dCwgVEFjYz5cclxuZXhwb3J0IHR5cGUgVE5vbkZ1bmN0aW9uPFQ9dW5rbm93bj4gPSBFeGNsdWRlPFQsIEZ1bmN0aW9uPlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiogZW1wdHlJdGVyYXRvcjxUPXVua25vd24+KCk6IFRJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiogZW1wdHlBc3luY0l0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEFzeW5jSXRlcmF0b3I8VD4gPT5cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGFzcyA6PSAoKTogdm9pZCA9PlxyXG5cdCMgZG8gbm90aGluZ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHNsZWVwIDo9IChzZWM6IG51bWJlcik6IHZvaWQgPT5cclxuXHJcblx0YXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQgciwgMTAwMCAqIHNlYylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdW5kZWYgOj0gdW5kZWZpbmVkXHJcbnR5cGUgVERlZmluZWQgPSBOb25OdWxsYWJsZTx1bmtub3duPlxyXG50eXBlIFROb3REZWZpbmVkID0gbnVsbCB8IHVuZGVmaW5lZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBURGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggIT0gdW5kZWYpICYmICh4ICE9IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueURlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbm90ZGVmaW5lZCA6PSAoeDogdW5rbm93bik6IHggaXMgVE5vdERlZmluZWQgPT5cclxuXHJcblx0cmV0dXJuICh4ID09IHVuZGVmKSB8fCAoeCA9PSBudWxsKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlOb3REZWZpbmVkIDo9ICguLi5sSXRlbXM6IHVua25vd25bXSk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBub3RkZWZpbmVkKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1heCA6PSAoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBudW1iZXIgPT5cclxuXHJcblx0cmV0dXJuICh4ID4geSkgPyB4IDogeVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByYW5nZSA6PSAobjogbnVtYmVyKTogVEl0ZXJhdG9yPG51bWJlcj4gLT5cclxuXHJcblx0Zm9yIGkgb2YgWzAuLi5uXVxyXG5cdFx0eWllbGQgaVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxDaGFycyA6PSAoc3RyOiBzdHJpbmcpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbENoYXJzQXN5bmMgOj0gKHN0cjogc3RyaW5nKTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdFx0YXdhaXQgc2xlZXAgMC4xXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgIExPR0dJTkdcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnNldERlYnVnRmlsZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHJcbmxldCBpbmRlbnRMZXZlbCA9IDBcclxubGV0IGxMb2dMaW5lczogc3RyaW5nW10gPSBbXVxyXG5cclxuZXhwb3J0IElOREVOVCA6PSBTeW1ib2wgJ2luZGVudCdcclxuZXhwb3J0IFVOREVOVCA6PSBTeW1ib2wgJ3VuZGVudCdcclxuXHJcbmV4cG9ydCB0eXBlIFRMb2dMZXZlbCA9ICd0ZXN0aW5nJyB8ICdzaWxlbnQnIHwgJ2luZm8nIHwgJ2RlYnVnJ1xyXG5leHBvcnQgbGV0IGxMb2dMZXZlbHM6IFRMb2dMZXZlbFtdID0gWydpbmZvJ11cclxuZXhwb3J0IGdldExvZ0xldmVscyA6PSAoKSA9PiByZXR1cm4gbExvZ0xldmVsc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvcGVuRGVidWdGaWxlIDo9IChcclxuXHRcdHN0dWI6IHN0cmluZ1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwiLi9sb2dzLyN7c3R1Yn0ubG9nXCJcclxuXHRzZXREZWJ1Z0ZpbGVzLmFkZCBwYXRoXHJcblx0aWYgY2xlYXJcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFwcGVuZERlYnVnRmlsZSA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGJsb2NrIDo9ICh0eXBlb2YgaXRlbSA9PSAnc3RyaW5nJykgPyBpdGVtIDogdG9KU09OKGl0ZW0pXHJcblx0XHRmb3IgcGF0aCBvZiBzZXREZWJ1Z0ZpbGVzXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgYmxvY2sgKyBcIlxcblwiLCB7YXBwZW5kOiB0cnVlfVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbG9zZURlYnVnRmlsZSA6PSAoc3R1Yjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwic3JjL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuZGVsZXRlIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY3VyTG9nTGV2ZWwgOj0gKCk6IFRMb2dMZXZlbCA9PlxyXG5cclxuXHRyZXR1cm4gKGxMb2dMZXZlbHMubGVuZ3RoID09IDApID8gJ2luZm8nIDogbExvZ0xldmVsc1tsTG9nTGV2ZWxzLmxlbmd0aC0xXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RMb2dnaW5nIDo9ICgpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiAoY3VyTG9nTGV2ZWwoKSA9PSAnc2lsZW50JykgfHwgKGN1ckxvZ0xldmVsKCkgPT0gJ3Rlc3RpbmcnKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbml0TG9nTGV2ZWwgOj0gKFxyXG5cdFx0bGV2ZWw6IFRMb2dMZXZlbFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGV2ZWxzID0gW2xldmVsXVxyXG5cdGNvbnNvbGUubG9nIFwiTE9HIExFVkVMIHNldCB0byAje2xldmVsfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHB1c2hMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMucHVzaCBsZXZlbFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwb3BMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdGlmIChsTG9nTGV2ZWxzLmxlbmd0aCA9PSAwKVxyXG5cdFx0cmV0dXJuICdpbmZvJ1xyXG5cdGVsc2VcclxuXHRcdHJlc3VsdCA6PSBsTG9nTGV2ZWxzLnBvcCgpXHJcblx0XHRyZXR1cm4gcmVzdWx0IHx8ICdpbmZvJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pTT04gOj0gKGl0ZW06IHVua25vd24pOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGl0ZW0sIG51bGwsIDMpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IExPRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBub3RMb2dnaW5nKClcclxuXHRcdHJldHVyblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgKGl0ZW0gPT0gSU5ERU5UKVxyXG5cdFx0XHRpbmRlbnRMZXZlbCArPSAxXHJcblx0XHRlbHNlIGlmIChpdGVtID09IFVOREVOVClcclxuXHRcdFx0aWYgKGluZGVudExldmVsID4gMClcclxuXHRcdFx0XHRpbmRlbnRMZXZlbCAtPSAxXHJcblx0XHRlbHNlXHJcblx0XHRcdGxvZ0xpbmUgaXRlbVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBEQkcgOj0gKFxyXG5cdFx0Li4ubEl0ZW1zOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gaWYgYW4gYXBwZW5kIGZpbGUgaXMgZGVmaW5lZCwgb3V0cHV0IGV2ZW4gaWZcclxuXHQjICAgICBjdXJyZW50IGxvZyBsZXZlbCBpcyBub3QgJ2RlYnVnJ1xyXG5cdGFwcGVuZERlYnVnRmlsZSAuLi5sSXRlbXNcclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgPT0gJ2RlYnVnJylcclxuXHRcdExPRyAuLi5sSXRlbXNcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgV0FSTiA6PSAoXHJcblx0XHQuLi5sTXNnczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Zm9yIG1zZyBvZiBsTXNnc1xyXG5cdFx0Y29uc29sZS5lcnJvciBcIiN7Y3lhbignV0FSTklORycpfTogI3ttc2d9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgRVJSIDo9IChcclxuXHRcdGVycjogdW5rbm93blxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdFUlInXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdGxMb2dMaW5lcy5wdXNoIGVyck1zZ1xyXG5cdGlmIG5vdExvZ2dpbmcoKVxyXG5cdFx0cmV0dXJuXHJcblx0Y29uc29sZS5lcnJvciByZWQobGFiZWwpICsgJzogJyArIGVyck1zZ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE5ldmVyRnVuYyA9IChlcnI6IHN0cmluZykgPT4gbmV2ZXJcclxuXHJcbmV4cG9ydCBjcm9hazogVE5ldmVyRnVuYyA6PSAoXHJcblx0XHRlcnJNc2c6IHN0cmluZ1xyXG5cdFx0KTogbmV2ZXIgPT5cclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgPT0gJ3Rlc3RpbmcnKVxyXG5cdFx0IyAtLS0gYWxsb3dzIHRoZSBlcnJvciB0byBiZSBjYXVnaHQgYW5kIGhhbmRsZWQgb3IgaWdub3JlZFxyXG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyck1zZylcclxuXHRlbHNlXHJcblx0XHRjb25zb2xlLmVycm9yIHJlZCgnQ1JPQUsnKSArICc6ICcgKyBlcnJNc2dcclxuXHRcdGNvbnNvbGUuZXJyb3IgXCItLS0tLSAgU1RBQ0sgLS0tLS1cIlxyXG5cdFx0Zm9yIGZyYW1lIG9mIGFsbFN0YWNrRnJhbWVzKClcclxuXHRcdFx0ZHVtcEZyYW1lIGZyYW1lXHJcblx0XHREZW5vLmV4aXQoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBtYXRjaGVzIDo9IChcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRyZWdleHA6IFJlZ0V4cFxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRyZXR1cm4gcmVnZXhwLnRlc3Qoc3RyKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bmtub3duVG9TdHJpbmcgOj0gKHg6IHVua25vd24pOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgKHR5cGVvZiB4ID09ICdzdHJpbmcnKSA/IHhcclxuXHRcdDogKHggPT0gdW5kZWYpICAgICAgICAgICA/ICd1bmRlZidcclxuXHRcdDogKHggPT0gbnVsbCkgICAgICAgICAgICA/ICdudWxsJ1xyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoeClcclxuXHRcdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5sb2dMaW5lIDo9IChcclxuXHRcdHg6IHVua25vd24sXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxpbmUgOj0gJ1xcdCcucmVwZWF0KGluZGVudExldmVsKSArIHVua25vd25Ub1N0cmluZyh4KVxyXG5cdGNvbnNvbGUubG9nIGxpbmVcclxuXHRsTG9nTGluZXMucHVzaCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyTG9nIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMaW5lcy5sZW5ndGggPSAwXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExvZyA6PSAoKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBsTG9nTGluZXMuam9pbignXFxuJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgICAgICAgICAgIEZpbGUgU3lzdGVtIFV0aWxzXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZEZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nPyA9PlxyXG5cclxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXHJcblxyXG5cdGxldCBmb3VuZFBhdGg6IHN0cmluZz8gPSB1bmRlZlxyXG5cdGZvciB7cGF0aH0gb2YgZXhwYW5kR2xvYlN5bmMgXCIje3Jvb3R9LyoqLyN7ZmlsZU5hbWV9XCIsIHtcclxuXHRcdFx0cm9vdFxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0XHR9XHJcblx0XHRpZiBkZWZpbmVkKGZvdW5kUGF0aClcclxuXHRcdFx0Y3JvYWsgXCJNdWx0aXBsZSBmaWxlcyBuYW1lZCAje2ZpbGVOYW1lfSBmb3VuZCBpbiAje3Jvb3R9XCJcclxuXHRcdGVsc2VcclxuXHRcdFx0Zm91bmRQYXRoID0gbm9ybWFsaXplUGF0aCBwYXRoXHJcblx0cmV0dXJuIGZvdW5kUGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3JtYWxpemVQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdG5ld3BhdGggOj0gcGF0aC5yZXBsYWNlQWxsICdcXFxcJywgJy8nXHJcblx0aWYgKG5ld3BhdGguY2hhckF0KDEpID09ICc6JylcclxuXHRcdHJldHVybiBuZXdwYXRoLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbmV3cGF0aC5zdWJzdHJpbmcoMSlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gbmV3cGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaWxlRXh0IDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0bE1hdGNoZXMgOj0gcGF0aC5tYXRjaCgvXFwuW15cXC5dKyQvKVxyXG5cdHJldHVybiBsTWF0Y2hlcyA/IGxNYXRjaGVzWzBdIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd2l0aEV4dCA6PSAocGF0aDogc3RyaW5nLCBleHQ6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgZXh0LnN0YXJ0c1dpdGgoJy4nKSwgXCJCYWQgZmlsZSBleHRlbnNpb246ICN7ZXh0fVwiXHJcblx0cG9zIDo9IHBhdGgubGFzdEluZGV4T2YgJy4nXHJcblx0YXNzZXJ0IChwb3MgPj0gMCksIFwicGF0aCBjb250YWlucyBubyBwZXJpb2Q6ICN7cGF0aH1cIlxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHBhdGguc3Vic3RyaW5nKDAsIHBvcykgKyBleHRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9SZWxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdHJvb3Q6IHN0cmluZyA9IERlbm8uY3dkKClcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZShyb290LCBwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Z1bGxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlc29sdmUoJy4nLCBwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc0Z1bGxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRyZXR1cm4gaXNBYnNvbHV0ZShwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBuZXdlckRlc3RGaWxlRXhpc3RzIDo9IChcclxuXHRcdHNyY1BhdGg6IHN0cmluZyxcclxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxyXG5cdGFzc2VydCBleGlzdHNTeW5jKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tzcmNQYXRofVwiXHJcblxyXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XHJcblx0aWYgZGVzdFBhdGguc3RhcnRzV2l0aCgnLicpXHJcblx0XHRkZXN0UGF0aCA9IHdpdGhFeHQoc3JjUGF0aCwgZGVzdFBhdGgpXHJcblxyXG5cdGlmIG5vdCBleGlzdHNTeW5jKGRlc3RQYXRoKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0dHJ5XHJcblx0XHRkZXN0bXMgOj0gZ2V0RmlsZVN0YXRzKGRlc3RQYXRoKS5tdGltZVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQoZGVzdG1zKSwgXCJkZXN0bXMgbm90IGRlZmluZWRcIlxyXG5cdFx0c3JjbXMgIDo9IGdldEZpbGVTdGF0cyhzcmNQYXRoKS5tdGltZVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQoc3JjbXMpLCBcInNyY21zIG5vdCBkZWZpbmVkXCJcclxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVN0YXRzID0ge1xyXG5cdGlzRmlsZTogYm9vbGVhblxyXG5cdGlzRGlyZWN0b3J5OiBib29sZWFuXHJcblx0bXRpbWU6IERhdGU/XHJcblx0fVxyXG5cclxuZXhwb3J0IGdldEZpbGVTdGF0cyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRGaWxlU3RhdHMgPT5cclxuXHJcblx0aFN0YXRzIDo9IERlbm8uc3RhdFN5bmMgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRpc0ZpbGU6ICAgICAgaFN0YXRzLmlzRmlsZVxyXG5cdFx0aXNEaXJlY3Rvcnk6IGhTdGF0cy5pc0RpcmVjdG9yeVxyXG5cdFx0bXRpbWU6ICAgICAgIGhTdGF0cy5tdGltZSB8fCB1bmRlZlxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5GaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmaWxlIDo9IGF3YWl0IERlbm8ub3BlbiBwYXRoXHJcblx0c3RyZWFtIDo9IChmaWxlLnJlYWRhYmxlXHJcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dERlY29kZXJTdHJlYW0oKSlcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0TGluZVN0cmVhbSgpKVxyXG5cdFx0XHQpXHJcblx0Zm9yIGF3YWl0IGxpbmUgb2Ygc3RyZWFtXHJcblx0XHR5aWVsZCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5GaWxlU3luYyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdHRleHQgOj0gRGVuby5yZWFkVGV4dEZpbGVTeW5jKHBhdGgpXHJcblx0Zm9yIGxpbmUgb2YgdGV4dC5zcGxpdCgvXFxyP1xcbi8pXHJcblx0XHR5aWVsZCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZSA6PSAoXHJcblx0XHRzdWZmaXg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBhd2FpdCBEZW5vLm1ha2VUZW1wRmlsZSB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1rVGVtcEZpbGVTeW5jIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIERlbm8ubWFrZVRlbXBGaWxlU3luYyB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRBc3NlcnRGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdG1zZzogc3RyaW5nXHJcblx0XHQpID0+IGFzc2VydHMgY29uZFxyXG5cclxuZXhwb3J0IGFzc2VydDogVEFzc2VydEZ1bmMgOj0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdG1zZzogc3RyaW5nXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIG1zZ1xyXG5cdHJldHVyblxyXG5cclxudHlwZSBUT2J2aW91c2x5RnVuYyA9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRjb25kU3RyPzogc3RyaW5nXHJcblx0XHQpID0+IGFzc2VydHMgY29uZFxyXG5cclxuZXhwb3J0IG9idmlvdXNseTogVE9idmlvdXNseUZ1bmMgOj0gKFxyXG5cdFx0Y29uZDogdW5rbm93blxyXG5cdFx0Y29uZFN0cjogc3RyaW5nID0gJydcclxuXHRcdCk6IGFzc2VydHMgY29uZCA9PlxyXG5cclxuXHRpZiBub3QgY29uZFxyXG5cdFx0Y3JvYWsgXCIje2NvbmRTdHIgfHwgJ2NvbmRpdGlvbid9IG5vdCBvYnZpb3VzbHkgdHJ1ZVwiXHJcblx0XHREZW5vLmV4aXQoKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFJhd1NvdXJjZU1hcCA9IHtcclxuXHR2ZXJzaW9uOiBudW1iZXI7ICAgICAgICAgICAjIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwIHNwZWMgKHVzdWFsbHkgMylcclxuXHRmaWxlOiBzdHJpbmc7ICAgICAgICAgICAgICAjIFRoZSBnZW5lcmF0ZWQgZmlsZSB0aGlzIG1hcCBpcyBhc3NvY2lhdGVkIHdpdGhcclxuXHRzb3VyY2VzOiBzdHJpbmdbXTsgICAgICAgICAjIEFycmF5IG9mIFVSTHMgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlc1xyXG5cdG5hbWVzOiBzdHJpbmdbXTsgICAgICAgICAgICMgQXJyYXkgb2YgaWRlbnRpZmllcnMgKG5hbWVzKSB1c2VkIGluIHRoZSBtYXBwaW5nc1xyXG5cdHNvdXJjZVJvb3Q/OiBzdHJpbmc7ICAgICAgICMgT3B0aW9uYWw6IFVSTCByb290IGZvciB0aGUgc291cmNlc1xyXG5cdHNvdXJjZXNDb250ZW50Pzogc3RyaW5nW107ICMgQ29udGVudCBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzIChvcHRpb25hbClcclxuXHRtYXBwaW5nczogc3RyaW5nOyAgICAgICAgICAjIFRoZSBhY3R1YWwgZW5jb2RlZCBtYXBwaW5ncyAoQmFzZTY0IFZMUSlcclxuXHR9XHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVBvc2l0aW9uID0ge1xyXG5cdHNvdXJjZTogc3RyaW5nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWFwUG9zIDo9IChcclxuXHRmaWxlUG9zOiBURmlsZVBvc2l0aW9uXHJcblx0KTogVEZpbGVQb3NpdGlvbj8gPT5cclxuXHJcblx0e3NvdXJjZSwgbGluZSwgY29sfSA6PSBmaWxlUG9zXHJcblx0Y29udGVudHMgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRjb25zdW1lciA6PSBhd2FpdCBuZXcgU291cmNlTWFwQ29uc3VtZXIoaFNyY01hcClcclxuXHRcdHBvcyA6PSBjb25zdW1lci5vcmlnaW5hbFBvc2l0aW9uRm9yKHtsaW5lLCBjb2x1bW46IGNvbH0pXHJcblx0XHRyZXR1cm4gcG9zIGFzIFRGaWxlUG9zaXRpb25cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWFwUG9zU3luYyA6PSAoXHJcblx0ZmlsZVBvczogVEZpbGVQb3NpdGlvblxyXG5cdCk6IFRGaWxlUG9zaXRpb24/ID0+XHJcblxyXG5cdHtzb3VyY2UsIGxpbmUsIGNvbH0gOj0gZmlsZVBvc1xyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdFtmaWxlTnVtLCBzcmNMaW5lLCBzcmNDb2xdIDo9IGdldE9yZ1BvcyBoU3JjTWFwLCBsaW5lLCBjb2xcclxuXHRcdGZpbGVOYW1lIDo9IGhTcmNNYXAuc291cmNlc1tmaWxlTnVtXVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c291cmNlOiBub3JtYWxpemVQYXRoIFwiI3tkaXJuYW1lKHNvdXJjZSl9LyN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0bGluZTogc3JjTGluZVxyXG5cdFx0XHRjb2w6IHNyY0NvbFxyXG5cdFx0XHR9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGV4dHJhY3RTb3VyY2VNYXAgOj0gKFxyXG5cdFx0Y29udGVudHM6IHN0cmluZ1xyXG5cdFx0KTogW3N0cmluZywgUmF3U291cmNlTWFwP10gPT5cclxuXHJcblx0bE1hdGNoZXMgOj0gY29udGVudHMubWF0Y2ggLy8vXlxyXG5cdFx0XHQoLiopXHJcblx0XHRcdFxcLyBcXC8gXFwjIFxccytcclxuXHRcdFx0c291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uXFwvanNvbjtcclxuXHRcdFx0KD86Y2hhcnNldD11dGYtODspP1xyXG5cdFx0XHRiYXNlNjQsXHJcblx0XHRcdCguKylcclxuXHRcdFx0JC8vL3NcclxuXHRpZiAobE1hdGNoZXMgPT0gbnVsbClcclxuXHRcdHJldHVybiBbY29udGVudHMsIHVuZGVmXVxyXG5cdFtfLCBjb2RlLCBoU3JjTWFwU3RyXSA6PSBsTWF0Y2hlc1xyXG5cdGhTcmNNYXAgOj0gSlNPTi5wYXJzZShhdG9iKGhTcmNNYXBTdHIpKSBhcyBSYXdTb3VyY2VNYXBcclxuXHR7ZmlsZX0gOj0gaFNyY01hcFxyXG5cdGhTcmNNYXAuZmlsZSA9IHRvUmVsUGF0aChmaWxlKVxyXG5cdGhTcmNNYXAuc291cmNlcyA9IGZvciBwYXRoIG9mIGhTcmNNYXAuc291cmNlc1xyXG5cdFx0dG9SZWxQYXRoKHBhdGgpXHJcblx0cmV0dXJuIFtjb2RlLCBoU3JjTWFwXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE9yZ1BvcyA9IFtmaWxlTnVtOiBudW1iZXIsIGxpbmU6IG51bWJlciwgY29sOiBudW1iZXJdXHJcbnR5cGUgVENvbXBhcmVSZXN1bHQgPSAtMSB8IDAgfCAxXHJcblxyXG5jb21wYXJlIDo9IChcclxuXHRcdGZpbmQ6IFtudW1iZXIsIG51bWJlcl0sXHJcblx0XHRnZW46ICBbbnVtYmVyLCBudW1iZXJdXHJcblx0XHQpOiBUQ29tcGFyZVJlc3VsdCA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAoZmluZFswXSA8IGdlblswXSkgPyAtMVxyXG5cdFx0OiAoZmluZFswXSA+IGdlblswXSkgPyAgMVxyXG5cdFx0OiAoZmluZFsxXSA8IGdlblsxXSkgPyAtMVxyXG5cdFx0OiAoZmluZFsxXSA+IGdlblsxXSkgPyAgMVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgICAgMFxyXG5cdFx0KVxyXG5cclxuZXhwb3J0IGdldE9yZ1BvcyA6PSAoXHJcblx0XHRoU3JjTWFwOiBSYXdTb3VyY2VNYXAsXHJcblx0XHRsaW5lOiBudW1iZXIsXHJcblx0XHRjb2w6IG51bWJlclxyXG5cdFx0KTogVE9yZ1BvcyA9PlxyXG5cclxuXHRsTWFwcGluZ3MgOj0gZ2V0TWFwcGluZ3MoaFNyY01hcC5tYXBwaW5ncylcclxuXHRhc3NlcnQgKGxNYXBwaW5ncy5sZW5ndGggPiAwKSwgXCJFbXB0eSBtYXBwaW5ncyBhcnJheVwiXHJcblx0bGV0IHBvcyA9IDAsIGVuZCA9IGxNYXBwaW5ncy5sZW5ndGggLSAxXHJcblx0d2hpbGUgKHBvcyA8PSBlbmQpXHJcblxyXG5cdFx0IyAtLS0gQ2FsY3VsYXRlIHRoZSBtaWRkbGUgaW5kZXhcclxuXHRcdG1pZCA6PSBNYXRoLmZsb29yKChwb3MgKyBlbmQpIC8gMilcclxuXHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA6PSBsTWFwcGluZ3NbbWlkXVxyXG5cdFx0c3dpdGNoIGNvbXBhcmUoW2xpbmUsIGNvbF0sIFt0c0xpbmUsIHRzQ29sXSlcclxuXHRcdFx0d2hlbiAwXHJcblx0XHRcdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cdFx0XHR3aGVuIC0xXHJcblx0XHRcdFx0ZW5kID0gbWlkIC0gMTtcclxuXHRcdFx0d2hlbiAxXHJcblx0XHRcdFx0cG9zID0gbWlkICsgMTtcclxuXHJcblx0IyAtLS0gSWYgdGhlIGxvb3AgZmluaXNoZXMsIHRoZSB0YXJnZXQgaXMgbm90IGluIHRoZSBhcnJheVxyXG5cdGlmIChwb3MgPCBsTWFwcGluZ3MubGVuZ3RoKVxyXG5cdFx0bGV0IFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3NdXHJcblx0XHRpZiAodHNMaW5lICE9IGxpbmUpIHx8ICh0c0NvbCAhPSBjb2wpXHJcblx0XHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3MtMV1cclxuXHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHRlbHNlXHJcblx0XHRsYXN0IDo9IGxNYXBwaW5ncy5hdCgtMSlcclxuXHRcdGFzc2VydCBkZWZpbmVkKGxhc3QpLCBcImxhc3Qgbm90IGRlZmluZWRcIlxyXG5cdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdIDo9IGxhc3RcclxuXHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TWFwcGluZ3MgOj0gKFxyXG5cdFx0ZGF0YTogc3RyaW5nLFxyXG5cdFx0KTogbnVtYmVyW11bXSA9PlxyXG5cclxuXHRsTWFwcGluZ3M6IG51bWJlcltdW10gOj0gW11cclxuXHR2YXIgc3VtOiBudW1iZXJbXSA9IFswLCAwLCAwLCAwXVxyXG5cdGZvciBsaW5lLGxpbmVOdW0gb2YgZGF0YS5zcGxpdChcIjtcIilcclxuXHRcdHN1bVswXSA9IDBcclxuXHRcdGRlY29kZUxpbmUobGluZSkuZm9yRWFjaCAocCkgPT5cclxuXHRcdFx0Zm9yIChpIG9mIFswLi4ucC5sZW5ndGhdKVxyXG5cdFx0XHRcdHN1bVtpXSArPSBwW2ldXHJcblx0XHRcdGxNYXBwaW5ncy5wdXNoIFtsaW5lTnVtLCBzdW1bMF0sIHN1bVsxXSwgc3VtWzJdLCBzdW1bM11dXHJcblx0cmV0dXJuIGxNYXBwaW5nc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWNvZGVMaW5lIDo9IChsaW5lOiBzdHJpbmcpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGlmIChsaW5lID09ICcnKVxyXG5cdFx0cmV0dXJuIFtdXHJcblxyXG5cdHJldHVybiBmb3IgdG9rZW4gb2YgbGluZS5zcGxpdCgnLCcpXHJcblx0XHRsT3V0cHV0OiBudW1iZXJbXSA6PSBbXVxyXG5cdFx0bGV0IGkgPSAwXHJcblx0XHR3aGlsZSAoaSA8IHRva2VuLmxlbmd0aClcclxuXHRcdFx0bGV0IHYgPSAwLCBkID0gYXRvYihcIkFBQVwiICsgdG9rZW5baV0pLmNoYXJDb2RlQXQoMilcclxuXHRcdFx0aSArPSAxXHJcblx0XHRcdHYgfD0gKGQgJiAzMSkgICAgICAgICAgIyBwdXQgbG93ZXN0IDUgYml0cyBvZiBkIGludG8gdlxyXG5cdFx0XHRsZXQgc2hpZnQgPSA1XHJcblx0XHRcdHdoaWxlIChkICYgMzIpICAgICAgICAgIyByZXBlYXQgaWYgaGlnaCBiaXQgb2YgZCBpcyBzZXRcclxuXHRcdFx0XHRkID0gYXRvYihcIkFBQVwiICsgdG9rZW5baV0pLmNoYXJDb2RlQXQoMilcclxuXHRcdFx0XHRpICs9IDFcclxuXHRcdFx0XHR2IHw9IChkICYgMzEpIDw8IHNoaWZ0ICAgIyBwdXQgbG93ZXN0IDUgYml0cyBvZiBkIGludG8gdlxyXG5cdFx0XHRcdHNoaWZ0ICs9IDVcclxuXHRcdFx0bE91dHB1dC5wdXNoKHYgJiAxID8gLSh2ID4+IDEpIDogdiA+PiAxKSAjIGxvdyBiaXQgaXMgc2lnblxyXG5cdFx0bE91dHB1dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGcmFtZVR5cGUgPSAoXHJcblx0J2V2YWwnIHxcclxuXHQnbmF0aXZlJyB8XHJcblx0J2NvbnN0cnVjdG9yJyB8XHJcblx0J21ldGhvZCcgfFxyXG5cdCdmdW5jdGlvbicgfFxyXG5cdCdzY3JpcHQnIHxcclxuXHQndW5rbm93bidcclxuXHQpXHJcblxyXG5leHBvcnQgdHlwZSBUU3RhY2tGcmFtZSA9IHtcclxuXHRpOiBudW1iZXJcclxuXHR0eXBlOiBzdHJpbmdcclxuXHRzb3VyY2U6IHN0cmluZyAgICAgICAgIyByZWxhdGl2ZSBmaWxlIHBhdGggb3IgJ3Vua25vd24nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHRuYW1lOiBzdHJpbmcgICAgICAgICAgIyBuYW1lIG9mIGZ1bmN0aW9uIG9yIG1ldGhvZFxyXG5cdG9yZ1NvdXJjZT86IHN0cmluZ1xyXG5cdG9yZ0xpbmU/OiBudW1iZXJcclxuXHRvcmdDb2w/OiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFN0YWNrRnJhbWVzIDo9IChcclxuXHRcdHRyYWNlID0gZmFsc2VcclxuXHRcdCk6IFRJdGVyYXRvcjxUU3RhY2tGcmFtZT4gLT5cclxuXHJcblx0cHJvY2Vzcy5zZXRTb3VyY2VNYXBzRW5hYmxlZChmYWxzZSlcclxuXHRvcGVuRGVidWdGaWxlICdzdGFjaydcclxuXHRmbXQgOj0gKFxyXG5cdFx0XHRsaW5lOiBudW1iZXIsXHJcblx0XHRcdGNvbDogbnVtYmVyLFxyXG5cdFx0XHRzcmM6IHN0cmluZ1xyXG5cdFx0XHQpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBcIiN7c3ByaW50ZignJTNkJywgbGluZSl9ICN7c3ByaW50ZignJTNkJywgY29sKX0gI3tzcmN9XCJcclxuXHJcblx0dHJ5XHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdG9sZExpbWl0IDo9IEVycm9yLnN0YWNrVHJhY2VMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRQcmVwYXJlciA6PSBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSA5OVxyXG5cclxuXHRcdGxldCBwcmV2RnJhbWU6IFRTdGFja0ZyYW1lPyA9IHVuZGVmaW5lZFxyXG5cclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSAoZXJyb3IsIGxPcmdGcmFtZXMpID0+XHJcblxyXG5cdFx0XHRsZXQgbEZyYW1lczogVFN0YWNrRnJhbWVbXSA9IFtdXHJcblxyXG5cdFx0XHRmb3Igb3JnRnJhbWUsaSBvZiBsT3JnRnJhbWVzXHJcblxyXG5cdFx0XHRcdHNyYyA6PSBvcmdGcmFtZS5nZXRGaWxlTmFtZSgpICAgICMgLS0tIGEgZnVsbCBwYXRoXHJcblx0XHRcdFx0aWYgbm90ZGVmaW5lZChzcmMpIHx8IHNyYy5tYXRjaCgvLy9leHQgXFw6IGNsaSBcXC8gXFxkK190ZXN0XFwuanMvLy8pXHJcblx0XHRcdFx0XHRjb250aW51ZVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBhcmUgY29uc3RhbnRzXHJcblx0XHRcdFx0b3JnU291cmNlIDo9IG5vcm1hbGl6ZVBhdGggc3JjXHJcblx0XHRcdFx0b3JnTGluZSAgIDo9IG9yZ0ZyYW1lLmdldExpbmVOdW1iZXIoKSB8fCAwXHJcblx0XHRcdFx0b3JnQ29sICAgIDo9IG9yZ0ZyYW1lLmdldENvbHVtbk51bWJlcigpIHx8IDBcclxuXHJcblx0XHRcdFx0REJHICctJy5yZXBlYXQgNjRcclxuXHRcdFx0XHREQkcgZm10KG9yZ0xpbmUsIG9yZ0NvbCwgb3JnU291cmNlKVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBjYW4gYmUgb3ZlcndyaXR0ZW4gd2hlbiB1c2luZyBzb3VyY2UgbWFwc1xyXG5cdFx0XHRcdGxldCBzb3VyY2UgPSBvcmdTb3VyY2VcclxuXHRcdFx0XHRsZXQgbGluZSAgID0gb3JnTGluZVxyXG5cdFx0XHRcdGxldCBjb2wgICAgPSBvcmdDb2xcclxuXHJcblx0XHRcdFx0ZnVuY3Rpb25OYW1lIDo9IG9yZ0ZyYW1lLmdldEZ1bmN0aW9uTmFtZSgpXHJcblx0XHRcdFx0bWV0aG9kTmFtZSAgIDo9IG9yZ0ZyYW1lLmdldE1ldGhvZE5hbWUoKVxyXG5cclxuXHRcdFx0XHQjIC0tLSBmb2xsb3cgc291cmNlIG1hcHMgcmVjdXJzaXZlbHlcclxuXHRcdFx0XHRsZXQgbmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMoe3NvdXJjZSwgbGluZSwgY29sfSlcclxuXHRcdFx0XHR3aGlsZSBkZWZpbmVkKG5ld0ZpbGVQb3MpXHJcblx0XHRcdFx0XHRzb3VyY2UgPSBuZXdGaWxlUG9zLnNvdXJjZSAgICMgLS0tIGFscmVhZHkgbm9ybWFsaXplZFxyXG5cdFx0XHRcdFx0bGluZSAgID0gbmV3RmlsZVBvcy5saW5lXHJcblx0XHRcdFx0XHRjb2wgICAgPSBuZXdGaWxlUG9zLmNvbFxyXG5cdFx0XHRcdFx0REJHIGZtdChsaW5lLCBjb2wsIHNvdXJjZSlcclxuXHRcdFx0XHRcdG5ld0ZpbGVQb3MgPSBtYXBQb3NTeW5jKG5ld0ZpbGVQb3MpXHJcblxyXG5cdFx0XHRcdGZyYW1lOiBUU3RhY2tGcmFtZSA6PSB7XHJcblx0XHRcdFx0XHRpXHJcblx0XHRcdFx0XHR0eXBlOiAoXHJcblx0XHRcdFx0XHRcdCAgZnVuY3Rpb25OYW1lICAgICAgICAgICAgID8gJ2Z1bmN0aW9uJ1xyXG5cdFx0XHRcdFx0XHQ6IG1ldGhvZE5hbWUgICAgICAgICAgICAgICA/ICdtZXRob2QnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNUb3BsZXZlbCgpICAgID8gJ3NjcmlwdCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc0V2YWwoKSAgICAgICAgPyAnZXZhbCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc05hdGl2ZSgpICAgICAgPyAnbmF0aXZlJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzQ29uc3RydWN0b3IoKSA/ICdjb25zdHJ1Y3RvcidcclxuXHRcdFx0XHRcdFx0OiAgICAgICAgICAgICAgICAgICAgICAgICAgICAndW5rbm93bidcclxuXHRcdFx0XHRcdFx0KVxyXG5cdFx0XHRcdFx0c291cmNlXHJcblx0XHRcdFx0XHRsaW5lXHJcblx0XHRcdFx0XHRjb2xcclxuXHRcdFx0XHRcdG5hbWU6IGZ1bmN0aW9uTmFtZSB8fCBtZXRob2ROYW1lIHx8ICcnXHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdCMgLS0tIEFkZCBvcmlnaW5hbCBzb3VyY2UsIGxpbmUgJiBjb2wgaWYgbWFwcGVkXHJcblx0XHRcdFx0aWYgKHNvdXJjZSAhPSBvcmdTb3VyY2UpXHJcblx0XHRcdFx0XHRmcmFtZS5vcmdTb3VyY2UgPSBvcmdTb3VyY2VcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0xpbmUgPSBvcmdMaW5lXHJcblx0XHRcdFx0XHRmcmFtZS5vcmdDb2wgPSBvcmdDb2xcclxuXHJcblx0XHRcdFx0IyAtLS0gZml4IGEgYnVnIGluIHRoZSBWOCBlbmdpbmUgd2hlcmUgY2FsbHMgaW5zaWRlIGFcclxuXHRcdFx0XHQjICAgICB0b3AgbGV2ZWwgYW5vbnltb3VzIGZ1bmN0aW9uIGlzIHJlcG9ydGVkIGFzXHJcblx0XHRcdFx0IyAgICAgYmVpbmcgb2YgdHlwZSAnc2NyaXB0J1xyXG5cclxuXHRcdFx0XHRpZiBwcmV2RnJhbWUgJiYgKGZyYW1lLnR5cGUgPT0gJ3NjcmlwdCcpICYmIChwcmV2RnJhbWUudHlwZSA9PSAnc2NyaXB0JylcclxuXHRcdFx0XHRcdHByZXZGcmFtZS50eXBlID0gJ2Z1bmN0aW9uJ1xyXG5cdFx0XHRcdFx0cHJldkZyYW1lLm5hbWUgPSAnPGFub24+J1xyXG5cclxuXHRcdFx0XHRpZiB0cmFjZVxyXG5cdFx0XHRcdFx0ZHVtcEZyYW1lIGZyYW1lLCAnT1JHIEZSQU1FJ1xyXG5cdFx0XHRcdHByZXZGcmFtZSA9IGZyYW1lXHJcblx0XHRcdFx0bEZyYW1lcy5wdXNoIGZyYW1lXHJcblxyXG5cdFx0XHRyZXR1cm4gbEZyYW1lc1xyXG5cclxuXHRcdG9iajogT2JqZWN0IDo9IHt9XHJcblx0XHRFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShvYmopXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdGxTdGFjazogVFN0YWNrRnJhbWVbXSA6PSBvYmouc3RhY2tcclxuXHJcblx0XHQjIC0tLSByZXNldCB0byBwcmV2aW91cyB2YWx1ZXNcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gb2xkTGltaXRcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBvbGRQcmVwYXJlclxyXG5cdFx0Zm9yIGZyYW1lIG9mIGxTdGFja1xyXG5cdFx0XHR5aWVsZCBmcmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y29uc29sZS5lcnJvciBcIiN7cmVkKCdFUlJPUiBpbiBhbGxTdGFja0ZyYW1lczonKX0gI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdFx0cmV0dXJuXHJcblx0ZmluYWxseVxyXG5cdFx0Y2xvc2VEZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNeUNhbGxlciA6PSAoKTogVFN0YWNrRnJhbWU/ID0+XHJcblxyXG5cdGZvciBmcmFtZSxpIG9mIGFsbFN0YWNrRnJhbWVzKClcclxuXHRcdGlmIChpID09IDMpXHJcblx0XHRcdHJldHVybiBmcmFtZVxyXG5cdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkdW1wRnJhbWUgOj0gKFxyXG5cdFx0ZnJhbWU6IFRTdGFja0ZyYW1lLFxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdGUkFNRSdcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0e2ksIHR5cGUsIHNvdXJjZSwgbGluZSwgY29sLCBuYW1lfSA6PSBmcmFtZVxyXG5cdHR5cGVTdHIgOj0gc3ByaW50ZignJS04cycsIHR5cGUpXHJcblx0bmFtZVN0ciA6PSBzcHJpbnRmKCclLTE2cycsIG5hbWUpXHJcblx0aWYgc291cmNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9ICN7c291cmNlfToje2xpbmV9OiN7Y29sfVwiXHJcblx0ZWxzZVxyXG5cdFx0TE9HIFwiI3tsYWJlbH1bI3tpfV06ICN7dHlwZVN0cn0gI3tuYW1lU3RyfSA8bm9uZT5cIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRFcnJTdHIgOj0gKGVycjogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRpZiAodHlwZW9mIGVyciA9PSAnc3RyaW5nJylcclxuXHRcdHJldHVybiBlcnJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBBc3NlcnRpb25FcnJvcilcclxuXHRcdGVycm1zZyA6PSBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRcdHJldHVybiBcIiN7Y29sb3JpemUoJ0Fzc2VydGlvbkVycm9yOiAnLCAncmVkJyl9I3tlcnJtc2d9XCJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcilcclxuXHRcdHJldHVybiBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gXCJTRVJJT1VTIEVSUk9SXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4ZWNBc3luYyA6PSAoXHJcblx0XHRhc3luY0Z1bmM6ICgpID0+IHZvaWRcclxuXHRcdCk6IFByb21pc2U8dW5rbm93bj4gPT5cclxuXHJcblx0cmV0dXJuIGF3YWl0IGFzeW5jRnVuYygpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBpZiBwYXNzZWQgYW4gYXN5bmMgZnVuY3Rpb24sIHdpbGwgcmV0dXJuIGEgcHJvbWlzZVxyXG5cclxuZXhwb3J0IEVYRUMgOj0gKFxyXG5cdFx0ZnVuYzogKCkgPT4gdm9pZFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR0cnlcclxuXHRcdGlmIGlzQXN5bmNGdW5jdGlvbiBmdW5jXHJcblx0XHRcdGV4ZWNBc3luYyBmdW5jXHJcblx0XHRlbHNlXHJcblx0XHRcdGZ1bmMoKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y3JvYWsgXCJpbiBFWEVDKCk6ICN7Z2V0RXJyU3RyKGVycil9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgU0tJUCA6PSAoZnVuYzogKCkgPT4gdm9pZCk6IHZvaWQgPT5cclxuXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFByZWRpY2F0ZTxUPXVua25vd24+ID0gKGl0ZW06IFQpID0+IGJvb2xlYW5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9Cb29sIDo9ICh4OiB1bmtub3duKTogYm9vbGVhbiA9PlxyXG5cclxuXHRyZXR1cm4gbm90IG5vdCB4XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU9mIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdLFxyXG5cdFx0Y2hlY2tGdW5jOiBUUHJlZGljYXRlPFQ+ID0gKHgpID0+IHRvQm9vbCh4KVxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIGNoZWNrRnVuYyhpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxPZiA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSxcclxuXHRcdGNoZWNrRnVuYzogVFByZWRpY2F0ZTxUPiA9ICh4KSA9PiB0b0Jvb2woeClcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBub3QgY2hlY2tGdW5jKGl0ZW0pXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdHJldHVybiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuaXNBc3luY0dlbmVyYXRvckZ1bmN0aW9uIDo9IChcclxuXHRcdHg6IHVua25vd25cclxuXHRcdCk6IHggaXMgQXN5bmNHZW5lcmF0b3JGdW5jdGlvbiA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAgKHR5cGVvZiB4ID09ICdmdW5jdGlvbicpXHJcblx0XHQmJiAoeC50b1N0cmluZygpLm1hdGNoKC9cXGJhc3luY1xccytmdW5jdGlvblxccypcXCovKSAhPSBudWxsKVxyXG5cdFx0KVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFZhbHVlc0Zyb20gOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRJdGVyYXRvcjxUPiAtPlxyXG5cclxuXHRpdGVyIDo9IEFycmF5LmlzQXJyYXkobEl0ZW1zKSA/IGxJdGVtcy52YWx1ZXMoKSA6IGxJdGVtc1xyXG5cdGxvb3BcclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0YnJlYWtcclxuXHRcdGVsc2VcclxuXHRcdFx0eWllbGQgdmFsdWVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbUFzeW5jIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdIHwgVEl0ZXJhdG9yPFQ+IHwgVEFzeW5jSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRBc3luY0l0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBhd2FpdCBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3cml0ZSA6PSAoc3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGUoc3RyKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3cml0ZWxuIDo9IChzdHI6IHN0cmluZyA9ICcnKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBzdHIgKyAnXFxuJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhclNjcmVlbiA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSAnXFx4MWJbSFxceDFiWzJKJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZXNldExpbmUgOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgXCJcXHgxYlsyS1wiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyUHJldmlvdXNMaW5lcyA6PSAobnVtTGluZXM6IG51bWJlcik6IHZvaWQgPT5cclxuXHQjIFxceDFiW25BIG1vdmVzIHRoZSBjdXJzb3IgdXAgJ24nIGxpbmVzXHJcblx0IyBcXHIgbW92ZXMgdGhlIGN1cnNvciB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaW5lXHJcblx0IyBcXHgxYltLIGNsZWFycyB0aGUgbGluZSBmcm9tIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCAob3B0aW9uYWwsIGJ1dCBnb29kIHByYWN0aWNlKVxyXG5cclxuXHREZW5vLnN0ZG91dC53cml0ZVN5bmMgZW5jb2RlKFwiXFx4MWJbI3tudW1MaW5lc31BXFxyXFx4MWJbS1wiKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRDb2xvciA9ICdjeWFuJ3wnYmx1ZSd8J2JsYWNrJ3wncmVkJ3wnZ3JlZW4nfCdtYWdlbnRhJ3wneWVsbG93J1xyXG5cclxuZXhwb3J0IGlzQ29sb3IgOj0gKHN0cjogc3RyaW5nKTogc3RyIGlzIFRDb2xvciA9PlxyXG5cclxuXHRyZXR1cm4gWydjeWFuJywnYmx1ZScsJ2JsYWNrJywncmVkJywnZ3JlZW4nLCdtYWdlbnRhJywneWVsbG93J10uaW5jbHVkZXMgc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNvbG9yaXplIDo9IChcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0Y29sb3I6IHN0cmluZz9cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKGNvbG9yKSB8fCBub3QgaXNDb2xvcihjb2xvcilcclxuXHRcdHJldHVybiBzdHJcclxuXHRzd2l0Y2ggY29sb3JcclxuXHRcdHdoZW4gJ2N5YW4nICAgIHRoZW4gcmV0dXJuIGN5YW4oc3RyKVxyXG5cdFx0d2hlbiAnYmx1ZScgICAgdGhlbiByZXR1cm4gYmx1ZShzdHIpXHJcblx0XHR3aGVuICdibGFjaycgICB0aGVuIHJldHVybiBibGFjayhzdHIpXHJcblx0XHR3aGVuICdyZWQnICAgICB0aGVuIHJldHVybiByZWQoc3RyKVxyXG5cdFx0d2hlbiAnZ3JlZW4nICAgdGhlbiByZXR1cm4gZ3JlZW4oc3RyKVxyXG5cdFx0d2hlbiAnbWFnZW50YScgdGhlbiByZXR1cm4gbWFnZW50YShzdHIpXHJcblx0XHR3aGVuICd5ZWxsb3cnICB0aGVuIHJldHVybiB5ZWxsb3coc3RyKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRyZXR1cm4gc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBoQ29sb3JzIGlzIHs8d29yZD46IDxjb2xvcj4sIC4uLiB9XHJcblxyXG50eXBlIFRDb2xvck1hcCA9IHtcclxuXHRbd29yZDogc3RyaW5nXTogVENvbG9yXHJcblx0fVxyXG5cclxuZXhwb3J0IHdpdGhDb2xvcnMgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmdcclxuXHRcdGhDb2xvcnM6IFRDb2xvck1hcFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGZvciB3b3JkIG9mIE9iamVjdC5rZXlzKGhDb2xvcnMpXHJcblx0XHRjb2xvciA6PSBoQ29sb3JzW3dvcmRdXHJcblx0XHRzdHIgPSBzdHIucmVwbGFjZUFsbCh3b3JkLCBjb2xvcml6ZSh3b3JkLCBjb2xvcikpXHJcblx0cmV0dXJuIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWNvbG9yaXplIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyaXBBbnNpQ29kZShzdHIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzQ2hpbmVzZUNoYXIgOj0gKHN0cjogc3RyaW5nKTogYm9vbGVhbiA9PlxyXG5cclxuXHRhc3NlcnQgKHN0ci5sZW5ndGggPT0gMSksIFwiTm90IGEgc2luZ2xlIGNoYXJcIlxyXG5cdHJldHVybiB0b0Jvb2wgc3RyLm1hdGNoKC9eW1xcdTRlMDAtXFx1OWZmZl0kL3UpXHJcbiJdfQ==