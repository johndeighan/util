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

export type TLogLevel = 'silent' | 'info' | 'debug'
let lLogLevels: TLogLevel[] = ['info']

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

	if (curLogLevel() === 'silent') {
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
		msg: string,
		label: string = 'WARNING'
		): void => {

	if (curLogLevel() !== 'silent') {
		console.error(`${cyan(label)}: ${msg}`)
	}
	return
}

// ---------------------------------------------------------------------------

export const ERR = (
		err: unknown,
		label: string = 'ERR'
		): void => {

	const errMsg = getErrStr(err)
	console.error(red(label) + ': ' + errMsg)
	lLogLines.push(errMsg)
	return
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
// ---------------------------------------------------------------------------

export let onlyThrow = false

export const justThrow = (flag: boolean=true): void => {

	onlyThrow = flag
	return
}

// ---------------------------------------------------------------------------

type TNeverFunc = (err?: unknown) => never

export const croak: TNeverFunc = (
		err: unknown = undef
		): never => {

	if (notdefined(err)) {
		throw new Error()
	}
	else {
		const errMsg = getErrStr(err)
		if (onlyThrow) {
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM3RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsSSxDQUFLLElBQUksQ0FBQyxDQUFDLEksQ0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN2RixBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENB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QUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDO0VBQUEsQztDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFlLE1BQWQsY0FBYyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hELEFBQUE7QUFDQSxBQUFBLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDL0IsQUFBQSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDMUIsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDM0UsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFhLE1BQVosWUFBWSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxTQUFTO0FBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1os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QyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM5QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0dBQUMsQ0FBQTtBQUM1QyxBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNULEFBQUEsSUFBSSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE87R0FBQSxDO0VBQUEsQztDQUFBLENBQUE7QUFDbEIsQUFBQTtBQUNBLEFBQUEsQ0FBQywyREFBMEQ7QUFDM0QsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQzVCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUN2RSxBQUFBLEVBQUUsR0FBRyxDQUFBLENBQUMsTUFBTSxDQUFDLEdBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QyxBQUFBLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQyxDQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEM7RUFBQyxDQUFBO0FBQ3RFLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEM7Q0FBQyxDQUFBO0FBQzFDLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBTSxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxQixBQUFBLEVBQUUsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3RCLEFBQUEsRUFBa0QsTUFBaEQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUMxRCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQztBQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3ZCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xCLEFBQUE7QUFDQSxBQUFBLENBQXNCLE1BQXJCLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDNUIsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FB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VixBQUFBLEVBQUUsS0FBSyxDQUFBLEFBQUMsR0FBRyxDO0NBQUEsQ0FBQTtBQUNYLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEMsQ0FBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTztBQUN4RCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDekMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBSSxDQUFJLEM7QUFBQyxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsQ0FBQyxDLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2QsQUFBQSxFQUFFLFNBQVMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFD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QyxHQUFHLEM7QUFBQSxDQUFBO0FBQzdFLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNwQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLEtBQUssQyxDLENBQUMsQUFBQyxNLFksQ0FBTztBQUNoQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzNDLEFBQUEsRUFBRSxNQUFNLENBQUMsRztDQUFHLENBQUE7QUFDWixBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNiLEFBQUEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN0QyxBQUFBLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdEMsQUFBQSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQSxDQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3ZDLEFBQUEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUNyQyxBQUFBLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFBLENBQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQztFQUFDLENBQUE7QUFDdkMsQUFBQSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUEsQ0FBQSxDQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEM7RUFBQyxDQUFBO0FBQ3pDLEFBQUEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUEsQ0FBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDO0VBQUMsQ0FBQTtBQUN4QyxBQUFBLEVBQUUsT0FBSSxDQUFBLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxNQUFNLENBQUMsRztFQUFHLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLHlDQUF3QztBQUN4QyxBQUFBO0FBQ0EsQUFBQSxBQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQUFBQSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQ3ZCLENBQUMsQ0FBQztBQUNGLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDYixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsU0FBUztBQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2pDLEFBQUEsRUFBTyxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN4QixBQUFBLEVBQUUsR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQztDQUFDLENBQUE7QUFDbkQsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHO0FBQUcsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUM3QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDO0FBQUMsQ0FBQTtBQUMxQiIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBiYXNlLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHByb2Nlc3MgZnJvbSBcIm5vZGU6cHJvY2Vzc1wiXHJcbmltcG9ydCB7XHJcblx0Y3lhbiwgYmx1ZSwgYmxhY2ssIHJlZCwgZ3JlZW4sIG1hZ2VudGEsIHllbGxvdyxcclxuXHRzdHJpcEFuc2lDb2RlLFxyXG5cdH0gZnJvbSAnQHN0ZC9mbXQvY29sb3JzJ1xyXG5pbXBvcnQge0Fzc2VydGlvbkVycm9yfSBmcm9tICdAc3RkL2Fzc2VydCdcclxuaW1wb3J0IHtTb3VyY2VNYXBDb25zdW1lcn0gZnJvbSAnQG1vemlsbGEvc291cmNlLW1hcCdcclxuaW1wb3J0IHtcclxuXHRyZXNvbHZlLCByZWxhdGl2ZSwgaXNBYnNvbHV0ZSwgZnJvbUZpbGVVcmwsIGRpcm5hbWUsXHJcblx0fSBmcm9tICdAc3RkL3BhdGgnXHJcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcydcclxuaW1wb3J0IGRlZXBFcXVhbCBmcm9tICducG0tZmFzdC1kZWVwLWVxdWFsJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtzcHJpbnRmfSBmcm9tICdAc3RkL2ZtdC9wcmludGYnXHJcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXHJcblxyXG5leHBvcnQge2RlZXBFcXVhbH1cclxuZXhwb3J0IGRlZXBDb3B5ID0gc3RydWN0dXJlZENsb25lXHJcblxyXG5teWRpciA6PSBkaXJuYW1lKGZyb21GaWxlVXJsKGltcG9ydC5tZXRhLnVybCkpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUU3RyaW5nU291cmNlID0gVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCBCdWZmZXJTb3VyY2UgfCBzdHJpbmdcclxuXHJcbmVuY29kZXIgOj0gbmV3IFRleHRFbmNvZGVyKClcclxuZXhwb3J0IGVuY29kZSA6PSAoeDogc3RyaW5nKTogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gPT5cclxuXHRyZXR1cm4gZW5jb2Rlci5lbmNvZGUgeFxyXG5cclxuZGVjb2RlciA6PSBuZXcgVGV4dERlY29kZXIoKVxyXG5leHBvcnQgZGVjb2RlIDo9ICh4OiBUU3RyaW5nU291cmNlKTogc3RyaW5nID0+XHJcblx0cmV0dXJuICh0eXBlb2YgeCA9PSAnc3RyaW5nJykgPyB4IDogZGVjb2Rlci5kZWNvZGUoeClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUSXRlcmF0b3I8VEluLCBUT3V0PXZvaWQsIFRBY2M9dm9pZD4gPSBHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUQXN5bmNJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEFzeW5jR2VuZXJhdG9yPFRJbiwgVE91dCwgVEFjYz5cclxuZXhwb3J0IHR5cGUgVE5vbkZ1bmN0aW9uPFQ9dW5rbm93bj4gPSBFeGNsdWRlPFQsIEZ1bmN0aW9uPlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiogZW1wdHlJdGVyYXRvcjxUPXVua25vd24+KCk6IFRJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiogZW1wdHlBc3luY0l0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEFzeW5jSXRlcmF0b3I8VD4gPT5cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcGFzcyA6PSAoKTogdm9pZCA9PlxyXG5cdCMgZG8gbm90aGluZ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHNsZWVwIDo9IChzZWM6IG51bWJlcik6IHZvaWQgPT5cclxuXHJcblx0YXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQgciwgMTAwMCAqIHNlYylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdW5kZWYgOj0gdW5kZWZpbmVkXHJcbnR5cGUgVERlZmluZWQgPSBOb25OdWxsYWJsZTx1bmtub3duPlxyXG50eXBlIFROb3REZWZpbmVkID0gbnVsbCB8IHVuZGVmaW5lZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBURGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggIT0gdW5kZWYpICYmICh4ICE9IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueURlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbm90ZGVmaW5lZCA6PSAoeDogdW5rbm93bik6IHggaXMgVE5vdERlZmluZWQgPT5cclxuXHJcblx0cmV0dXJuICh4ID09IHVuZGVmKSB8fCAoeCA9PSBudWxsKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlOb3REZWZpbmVkIDo9ICguLi5sSXRlbXM6IHVua25vd25bXSk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBub3RkZWZpbmVkKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1heCA6PSAoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBudW1iZXIgPT5cclxuXHJcblx0cmV0dXJuICh4ID4geSkgPyB4IDogeVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByYW5nZSA6PSAobjogbnVtYmVyKTogVEl0ZXJhdG9yPG51bWJlcj4gLT5cclxuXHJcblx0Zm9yIGkgb2YgWzAuLi5uXVxyXG5cdFx0eWllbGQgaVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxDaGFycyA6PSAoc3RyOiBzdHJpbmcpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbENoYXJzQXN5bmMgOj0gKHN0cjogc3RyaW5nKTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmb3IgY2ggb2Ygc3RyXHJcblx0XHR5aWVsZCBjaFxyXG5cdFx0YXdhaXQgc2xlZXAgMC4xXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgIExPR0dJTkdcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnNldERlYnVnRmlsZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHJcbmxldCBpbmRlbnRMZXZlbCA9IDBcclxubGV0IGxMb2dMaW5lczogc3RyaW5nW10gPSBbXVxyXG5cclxuZXhwb3J0IElOREVOVCA6PSBTeW1ib2wgJ2luZGVudCdcclxuZXhwb3J0IFVOREVOVCA6PSBTeW1ib2wgJ3VuZGVudCdcclxuXHJcbmV4cG9ydCB0eXBlIFRMb2dMZXZlbCA9ICdzaWxlbnQnIHwgJ2luZm8nIHwgJ2RlYnVnJ1xyXG5sZXQgbExvZ0xldmVsczogVExvZ0xldmVsW10gPSBbJ2luZm8nXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvcGVuRGVidWdGaWxlIDo9IChcclxuXHRcdHN0dWI6IHN0cmluZ1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwiLi9sb2dzLyN7c3R1Yn0ubG9nXCJcclxuXHRzZXREZWJ1Z0ZpbGVzLmFkZCBwYXRoXHJcblx0aWYgY2xlYXJcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFwcGVuZERlYnVnRmlsZSA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGJsb2NrIDo9ICh0eXBlb2YgaXRlbSA9PSAnc3RyaW5nJykgPyBpdGVtIDogdG9KU09OKGl0ZW0pXHJcblx0XHRmb3IgcGF0aCBvZiBzZXREZWJ1Z0ZpbGVzXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgYmxvY2sgKyBcIlxcblwiLCB7YXBwZW5kOiB0cnVlfVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbG9zZURlYnVnRmlsZSA6PSAoc3R1Yjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwic3JjL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuZGVsZXRlIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY3VyTG9nTGV2ZWwgOj0gKCk6IFRMb2dMZXZlbCA9PlxyXG5cclxuXHRyZXR1cm4gKGxMb2dMZXZlbHMubGVuZ3RoID09IDApID8gJ2luZm8nIDogbExvZ0xldmVsc1tsTG9nTGV2ZWxzLmxlbmd0aC0xXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbml0TG9nTGV2ZWwgOj0gKFxyXG5cdFx0bGV2ZWw6IFRMb2dMZXZlbFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGV2ZWxzID0gW2xldmVsXVxyXG5cdGNvbnNvbGUubG9nIFwiTE9HIExFVkVMIHNldCB0byAje2xldmVsfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHB1c2hMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMucHVzaCBsZXZlbFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwb3BMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdGlmIChsTG9nTGV2ZWxzLmxlbmd0aCA9PSAwKVxyXG5cdFx0cmV0dXJuICdpbmZvJ1xyXG5cdGVsc2VcclxuXHRcdHJlc3VsdCA6PSBsTG9nTGV2ZWxzLnBvcCgpXHJcblx0XHRyZXR1cm4gcmVzdWx0IHx8ICdpbmZvJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pTT04gOj0gKGl0ZW06IHVua25vd24pOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGl0ZW0sIG51bGwsIDMpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IExPRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAnc2lsZW50JylcclxuXHRcdHJldHVyblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgKGl0ZW0gPT0gSU5ERU5UKVxyXG5cdFx0XHRpbmRlbnRMZXZlbCArPSAxXHJcblx0XHRlbHNlIGlmIChpdGVtID09IFVOREVOVClcclxuXHRcdFx0aWYgKGluZGVudExldmVsID4gMClcclxuXHRcdFx0XHRpbmRlbnRMZXZlbCAtPSAxXHJcblx0XHRlbHNlXHJcblx0XHRcdGxvZ0xpbmUgaXRlbVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBEQkcgOj0gKFxyXG5cdFx0Li4ubEl0ZW1zOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gaWYgYW4gYXBwZW5kIGZpbGUgaXMgZGVmaW5lZCwgb3V0cHV0IGV2ZW4gaWZcclxuXHQjICAgICBjdXJyZW50IGxvZyBsZXZlbCBpcyBub3QgJ2RlYnVnJ1xyXG5cdGFwcGVuZERlYnVnRmlsZSAuLi5sSXRlbXNcclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgPT0gJ2RlYnVnJylcclxuXHRcdExPRyAuLi5sSXRlbXNcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgV0FSTiA6PSAoXHJcblx0XHRtc2c6IHN0cmluZ1xyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdXQVJOSU5HJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSAhPSAnc2lsZW50JylcclxuXHRcdGNvbnNvbGUuZXJyb3IgXCIje2N5YW4obGFiZWwpfTogI3ttc2d9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgRVJSIDo9IChcclxuXHRcdGVycjogdW5rbm93blxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdFUlInXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdGNvbnNvbGUuZXJyb3IgcmVkKGxhYmVsKSArICc6ICcgKyBlcnJNc2dcclxuXHRsTG9nTGluZXMucHVzaCBlcnJNc2dcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdW5rbm93blRvU3RyaW5nIDo9ICh4OiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgICh0eXBlb2YgeCA9PSAnc3RyaW5nJykgPyB4XHJcblx0XHQ6ICh4ID09IHVuZGVmKSAgICAgICAgICAgPyAndW5kZWYnXHJcblx0XHQ6ICh4ID09IG51bGwpICAgICAgICAgICAgPyAnbnVsbCdcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHgpXHJcblx0XHQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxubG9nTGluZSA6PSAoXHJcblx0XHR4OiB1bmtub3duLFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsaW5lIDo9ICdcXHQnLnJlcGVhdChpbmRlbnRMZXZlbCkgKyB1bmtub3duVG9TdHJpbmcoeClcclxuXHRjb25zb2xlLmxvZyBsaW5lXHJcblx0bExvZ0xpbmVzLnB1c2ggbGluZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhckxvZyA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGluZXMubGVuZ3RoID0gMFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRMb2cgOj0gKCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbExvZ0xpbmVzLmpvaW4oJ1xcbicpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgICBGaWxlIFN5c3RlbSBVdGlsc1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbmRGaWxlIDo9IChcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdHJvb3Q6IHN0cmluZyA9IERlbm8uY3dkKClcclxuXHRcdCk6IHN0cmluZz8gPT5cclxuXHJcblx0YXNzZXJ0IG5vdCByb290LmVuZHNXaXRoKCcvJyksIFwiQmFkIHJvb3Q6ICN7cm9vdH1cIlxyXG5cclxuXHRsZXQgZm91bmRQYXRoOiBzdHJpbmc/ID0gdW5kZWZcclxuXHRmb3Ige3BhdGh9IG9mIGV4cGFuZEdsb2JTeW5jIFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiLCB7XHJcblx0XHRcdHJvb3RcclxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXHJcblx0XHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdFx0fVxyXG5cdFx0aWYgZGVmaW5lZChmb3VuZFBhdGgpXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgbmFtZWQgI3tmaWxlTmFtZX0gZm91bmQgaW4gI3tyb290fVwiXHJcblx0XHRlbHNlXHJcblx0XHRcdGZvdW5kUGF0aCA9IG5vcm1hbGl6ZVBhdGggcGF0aFxyXG5cdHJldHVybiBmb3VuZFBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbm9ybWFsaXplUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRuZXdwYXRoIDo9IHBhdGgucmVwbGFjZUFsbCAnXFxcXCcsICcvJ1xyXG5cdGlmIChuZXdwYXRoLmNoYXJBdCgxKSA9PSAnOicpXHJcblx0XHRyZXR1cm4gbmV3cGF0aC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5ld3BhdGguc3Vic3RyaW5nKDEpXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIG5ld3BhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmlsZUV4dCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGxNYXRjaGVzIDo9IHBhdGgubWF0Y2goL1xcLlteXFwuXSskLylcclxuXHRyZXR1cm4gbE1hdGNoZXMgPyBsTWF0Y2hlc1swXSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdpdGhFeHQgOj0gKHBhdGg6IHN0cmluZywgZXh0OiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IGV4dC5zdGFydHNXaXRoKCcuJyksIFwiQmFkIGZpbGUgZXh0ZW5zaW9uOiAje2V4dH1cIlxyXG5cdHBvcyA6PSBwYXRoLmxhc3RJbmRleE9mICcuJ1xyXG5cdGFzc2VydCAocG9zID49IDApLCBcInBhdGggY29udGFpbnMgbm8gcGVyaW9kOiAje3BhdGh9XCJcclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBwYXRoLnN1YnN0cmluZygwLCBwb3MpICsgZXh0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvUmVsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUocm9vdCwgcGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9GdWxsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZXNvbHZlKCcuJywgcGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNGdWxsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIGlzQWJzb2x1dGUocGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXHJcblx0XHRzcmNQYXRoOiBzdHJpbmcsXHJcblx0XHRkZXN0UGF0aDogc3RyaW5nICAgICMgLS0tIGNhbiBiZSBhIGZpbGUgZXh0ZW5zaW9uXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIHNvdXJjZSBmaWxlIG11c3QgZXhpc3RcclxuXHRhc3NlcnQgZXhpc3RzU3luYyhzcmNQYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7c3JjUGF0aH1cIlxyXG5cclxuXHQjIC0tLSBhbGxvdyBwYXNzaW5nIGEgZmlsZSBleHRlbnNpb24gZm9yIDJuZCBhcmd1bWVudFxyXG5cdGlmIGRlc3RQYXRoLnN0YXJ0c1dpdGgoJy4nKVxyXG5cdFx0ZGVzdFBhdGggPSB3aXRoRXh0KHNyY1BhdGgsIGRlc3RQYXRoKVxyXG5cclxuXHRpZiBub3QgZXhpc3RzU3luYyhkZXN0UGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdHRyeVxyXG5cdFx0ZGVzdG1zIDo9IGdldEZpbGVTdGF0cyhkZXN0UGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKGRlc3RtcylcclxuXHRcdHNyY21zICA6PSBnZXRGaWxlU3RhdHMoc3JjUGF0aCkubXRpbWVcclxuXHRcdGFzc2VydCBkZWZpbmVkKHNyY21zKVxyXG5cdFx0cmV0dXJuIChkZXN0bXMgPiBzcmNtcylcclxuXHRjYXRjaCBlcnJcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGaWxlU3RhdHMgPSB7XHJcblx0aXNGaWxlOiBib29sZWFuXHJcblx0aXNEaXJlY3Rvcnk6IGJvb2xlYW5cclxuXHRtdGltZTogRGF0ZT9cclxuXHR9XHJcblxyXG5leHBvcnQgZ2V0RmlsZVN0YXRzIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEZpbGVTdGF0cyA9PlxyXG5cclxuXHRoU3RhdHMgOj0gRGVuby5zdGF0U3luYyBwYXRoXHJcblx0cmV0dXJuIHtcclxuXHRcdGlzRmlsZTogICAgICBoU3RhdHMuaXNGaWxlXHJcblx0XHRpc0RpcmVjdG9yeTogaFN0YXRzLmlzRGlyZWN0b3J5XHJcblx0XHRtdGltZTogICAgICAgaFN0YXRzLm10aW1lIHx8IHVuZGVmXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGUgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZpbGUgOj0gYXdhaXQgRGVuby5vcGVuIHBhdGhcclxuXHRzdHJlYW0gOj0gKGZpbGUucmVhZGFibGVcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0RGVjb2RlclN0cmVhbSgpKVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHRMaW5lU3RyZWFtKCkpXHJcblx0XHRcdClcclxuXHRmb3IgYXdhaXQgbGluZSBvZiBzdHJlYW1cclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkZpbGVTeW5jIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0dGV4dCA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMocGF0aClcclxuXHRmb3IgbGluZSBvZiB0ZXh0LnNwbGl0KC9cXHI/XFxuLylcclxuXHRcdHlpZWxkIGxpbmVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBta1RlbXBGaWxlIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGF3YWl0IERlbm8ubWFrZVRlbXBGaWxlIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZVN5bmMgOj0gKFxyXG5cdFx0c3VmZml4OiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gRGVuby5tYWtlVGVtcEZpbGVTeW5jIHtzdWZmaXh9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGxldCBvbmx5VGhyb3cgPSBmYWxzZVxyXG5cclxuZXhwb3J0IGp1c3RUaHJvdyA6PSAoZmxhZzogYm9vbGVhbj10cnVlKTogdm9pZCA9PlxyXG5cclxuXHRvbmx5VGhyb3cgPSBmbGFnXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUTmV2ZXJGdW5jID0gKGVycj86IHVua25vd24pID0+IG5ldmVyXHJcblxyXG5leHBvcnQgY3JvYWs6IFROZXZlckZ1bmMgOj0gKFxyXG5cdFx0ZXJyOiB1bmtub3duID0gdW5kZWZcclxuXHRcdCk6IG5ldmVyID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQoZXJyKVxyXG5cdFx0dGhyb3cgbmV3IEVycm9yKClcclxuXHRlbHNlXHJcblx0XHRlcnJNc2cgOj0gZ2V0RXJyU3RyKGVycilcclxuXHRcdGlmIG9ubHlUaHJvd1xyXG5cdFx0XHQjIC0tLSBhbGxvd3MgdGhlIGVycm9yIHRvIGJlIGNhdWdodCBhbmQgaGFuZGxlZCBvciBpZ25vcmVkXHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihlcnJNc2cpXHJcblx0XHRlbHNlXHJcblx0XHRcdGNvbnNvbGUuZXJyb3IgcmVkKCdDUk9BSycpICsgJzogJyArIGVyck1zZ1xyXG5cdFx0XHRjb25zb2xlLmVycm9yIFwiLS0tLS0gIFNUQUNLIC0tLS0tXCJcclxuXHRcdFx0Zm9yIGZyYW1lIG9mIGFsbFN0YWNrRnJhbWVzKClcclxuXHRcdFx0XHRkdW1wRnJhbWUgZnJhbWVcclxuXHRcdFx0RGVuby5leGl0KClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQXNzZXJ0RnVuYyA9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c/OiBzdHJpbmdcclxuXHRcdCkgPT4gYXNzZXJ0cyBjb25kXHJcblxyXG5leHBvcnQgYXNzZXJ0OiBUQXNzZXJ0RnVuYyA6PSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0bXNnOiBzdHJpbmcgPSBcIkFuIHVua25vd24gZXJyb3Igb2NjdXJyZWRcIlxyXG5cdFx0KTogYXNzZXJ0cyBjb25kID0+XHJcblxyXG5cdGlmIG5vdCBjb25kXHJcblx0XHRjcm9hayBtc2dcclxuXHRyZXR1cm5cclxuXHJcbmV4cG9ydCBvYnZpb3VzbHk6IFRBc3NlcnRGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd25cclxuXHRcdGNvbmRTdHI6IHN0cmluZyA9ICcnXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIFwiI3tjb25kU3RyIHx8ICdjb25kaXRpb24nfSBub3Qgb2J2aW91c2x5IHRydWVcIlxyXG5cdFx0RGVuby5leGl0KClcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBSYXdTb3VyY2VNYXAgPSB7XHJcblx0dmVyc2lvbjogbnVtYmVyOyAgICAgICAgICAgIyBUaGUgdmVyc2lvbiBvZiB0aGUgc291cmNlIG1hcCBzcGVjICh1c3VhbGx5IDMpXHJcblx0ZmlsZTogc3RyaW5nOyAgICAgICAgICAgICAgIyBUaGUgZ2VuZXJhdGVkIGZpbGUgdGhpcyBtYXAgaXMgYXNzb2NpYXRlZCB3aXRoXHJcblx0c291cmNlczogc3RyaW5nW107ICAgICAgICAgIyBBcnJheSBvZiBVUkxzIHRvIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXNcclxuXHRuYW1lczogc3RyaW5nW107ICAgICAgICAgICAjIEFycmF5IG9mIGlkZW50aWZpZXJzIChuYW1lcykgdXNlZCBpbiB0aGUgbWFwcGluZ3NcclxuXHRzb3VyY2VSb290Pzogc3RyaW5nOyAgICAgICAjIE9wdGlvbmFsOiBVUkwgcm9vdCBmb3IgdGhlIHNvdXJjZXNcclxuXHRzb3VyY2VzQ29udGVudD86IHN0cmluZ1tdOyAjIENvbnRlbnQgb2YgdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlcyAob3B0aW9uYWwpXHJcblx0bWFwcGluZ3M6IHN0cmluZzsgICAgICAgICAgIyBUaGUgYWN0dWFsIGVuY29kZWQgbWFwcGluZ3MgKEJhc2U2NCBWTFEpXHJcblx0fVxyXG5cclxuZXhwb3J0IHR5cGUgVEZpbGVQb3NpdGlvbiA9IHtcclxuXHRzb3VyY2U6IHN0cmluZ1xyXG5cdGxpbmU6IG51bWJlclxyXG5cdGNvbDogbnVtYmVyXHJcblx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1hcFBvcyA6PSAoXHJcblx0ZmlsZVBvczogVEZpbGVQb3NpdGlvblxyXG5cdCk6IFRGaWxlUG9zaXRpb24/ID0+XHJcblxyXG5cdHtzb3VyY2UsIGxpbmUsIGNvbH0gOj0gZmlsZVBvc1xyXG5cdGNvbnRlbnRzIDo9IGF3YWl0IERlbm8ucmVhZFRleHRGaWxlIHNvdXJjZVxyXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwIGNvbnRlbnRzXHJcblx0aWYgZGVmaW5lZChoU3JjTWFwKVxyXG5cdFx0Y29uc3VtZXIgOj0gYXdhaXQgbmV3IFNvdXJjZU1hcENvbnN1bWVyKGhTcmNNYXApXHJcblx0XHRwb3MgOj0gY29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7bGluZSwgY29sdW1uOiBjb2x9KVxyXG5cdFx0cmV0dXJuIHBvcyBhcyBURmlsZVBvc2l0aW9uXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1hcFBvc1N5bmMgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRbZmlsZU51bSwgc3JjTGluZSwgc3JjQ29sXSA6PSBnZXRPcmdQb3MgaFNyY01hcCwgbGluZSwgY29sXHJcblx0XHRmaWxlTmFtZSA6PSBoU3JjTWFwLnNvdXJjZXNbZmlsZU51bV1cclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHNvdXJjZTogbm9ybWFsaXplUGF0aCBcIiN7ZGlybmFtZShzb3VyY2UpfS8je2ZpbGVOYW1lfVwiXHJcblx0XHRcdGxpbmU6IHNyY0xpbmVcclxuXHRcdFx0Y29sOiBzcmNDb2xcclxuXHRcdFx0fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBleHRyYWN0U291cmNlTWFwIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmdcclxuXHRcdCk6IFtzdHJpbmcsIFJhd1NvdXJjZU1hcD9dID0+XHJcblxyXG5cdGxNYXRjaGVzIDo9IGNvbnRlbnRzLm1hdGNoIC8vL15cclxuXHRcdFx0KC4qKVxyXG5cdFx0XHRcXC8gXFwvIFxcIyBcXHMrXHJcblx0XHRcdHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvblxcL2pzb247XHJcblx0XHRcdCg/OmNoYXJzZXQ9dXRmLTg7KT9cclxuXHRcdFx0YmFzZTY0LFxyXG5cdFx0XHQoLispXHJcblx0XHRcdCQvLy9zXHJcblx0aWYgKGxNYXRjaGVzID09IG51bGwpXHJcblx0XHRyZXR1cm4gW2NvbnRlbnRzLCB1bmRlZl1cclxuXHRbXywgY29kZSwgaFNyY01hcFN0cl0gOj0gbE1hdGNoZXNcclxuXHRoU3JjTWFwIDo9IEpTT04ucGFyc2UoYXRvYihoU3JjTWFwU3RyKSkgYXMgUmF3U291cmNlTWFwXHJcblx0e2ZpbGV9IDo9IGhTcmNNYXBcclxuXHRoU3JjTWFwLmZpbGUgPSB0b1JlbFBhdGgoZmlsZSlcclxuXHRoU3JjTWFwLnNvdXJjZXMgPSBmb3IgcGF0aCBvZiBoU3JjTWFwLnNvdXJjZXNcclxuXHRcdHRvUmVsUGF0aChwYXRoKVxyXG5cdHJldHVybiBbY29kZSwgaFNyY01hcF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRPcmdQb3MgPSBbZmlsZU51bTogbnVtYmVyLCBsaW5lOiBudW1iZXIsIGNvbDogbnVtYmVyXVxyXG50eXBlIFRDb21wYXJlUmVzdWx0ID0gLTEgfCAwIHwgMVxyXG5cclxuY29tcGFyZSA6PSAoXHJcblx0XHRmaW5kOiBbbnVtYmVyLCBudW1iZXJdLFxyXG5cdFx0Z2VuOiAgW251bWJlciwgbnVtYmVyXVxyXG5cdFx0KTogVENvbXBhcmVSZXN1bHQgPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgKGZpbmRbMF0gPCBnZW5bMF0pID8gLTFcclxuXHRcdDogKGZpbmRbMF0gPiBnZW5bMF0pID8gIDFcclxuXHRcdDogKGZpbmRbMV0gPCBnZW5bMV0pID8gLTFcclxuXHRcdDogKGZpbmRbMV0gPiBnZW5bMV0pID8gIDFcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICAgIDBcclxuXHRcdClcclxuXHJcbmV4cG9ydCBnZXRPcmdQb3MgOj0gKFxyXG5cdFx0aFNyY01hcDogUmF3U291cmNlTWFwLFxyXG5cdFx0bGluZTogbnVtYmVyLFxyXG5cdFx0Y29sOiBudW1iZXJcclxuXHRcdCk6IFRPcmdQb3MgPT5cclxuXHJcblx0bE1hcHBpbmdzIDo9IGdldE1hcHBpbmdzKGhTcmNNYXAubWFwcGluZ3MpXHJcblx0YXNzZXJ0IChsTWFwcGluZ3MubGVuZ3RoID4gMCksIFwiRW1wdHkgbWFwcGluZ3MgYXJyYXlcIlxyXG5cdGxldCBwb3MgPSAwLCBlbmQgPSBsTWFwcGluZ3MubGVuZ3RoIC0gMVxyXG5cdHdoaWxlIChwb3MgPD0gZW5kKVxyXG5cclxuXHRcdCMgLS0tIENhbGN1bGF0ZSB0aGUgbWlkZGxlIGluZGV4XHJcblx0XHRtaWQgOj0gTWF0aC5mbG9vcigocG9zICsgZW5kKSAvIDIpXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbE1hcHBpbmdzW21pZF1cclxuXHRcdHN3aXRjaCBjb21wYXJlKFtsaW5lLCBjb2xdLCBbdHNMaW5lLCB0c0NvbF0pXHJcblx0XHRcdHdoZW4gMFxyXG5cdFx0XHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHRcdFx0d2hlbiAtMVxyXG5cdFx0XHRcdGVuZCA9IG1pZCAtIDE7XHJcblx0XHRcdHdoZW4gMVxyXG5cdFx0XHRcdHBvcyA9IG1pZCArIDE7XHJcblxyXG5cdCMgLS0tIElmIHRoZSBsb29wIGZpbmlzaGVzLCB0aGUgdGFyZ2V0IGlzIG5vdCBpbiB0aGUgYXJyYXlcclxuXHRpZiAocG9zIDwgbE1hcHBpbmdzLmxlbmd0aClcclxuXHRcdGxldCBbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gPSBsTWFwcGluZ3NbcG9zXVxyXG5cdFx0aWYgKHRzTGluZSAhPSBsaW5lKSB8fCAodHNDb2wgIT0gY29sKVxyXG5cdFx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gPSBsTWFwcGluZ3NbcG9zLTFdXHJcblx0XHRyZXR1cm4gW29yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdXHJcblx0ZWxzZVxyXG5cdFx0bGFzdCA6PSBsTWFwcGluZ3MuYXQoLTEpXHJcblx0XHRhc3NlcnQgZGVmaW5lZChsYXN0KVxyXG5cdFx0W3RzTGluZSwgdHNDb2wsIG9yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdIDo9IGxhc3RcclxuXHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TWFwcGluZ3MgOj0gKFxyXG5cdFx0ZGF0YTogc3RyaW5nLFxyXG5cdFx0KTogbnVtYmVyW11bXSA9PlxyXG5cclxuXHRsTWFwcGluZ3M6IG51bWJlcltdW10gOj0gW11cclxuXHR2YXIgc3VtOiBudW1iZXJbXSA9IFswLCAwLCAwLCAwXVxyXG5cdGZvciBsaW5lLGxpbmVOdW0gb2YgZGF0YS5zcGxpdChcIjtcIilcclxuXHRcdHN1bVswXSA9IDBcclxuXHRcdGRlY29kZUxpbmUobGluZSkuZm9yRWFjaCAocCkgPT5cclxuXHRcdFx0Zm9yIChpIG9mIFswLi4ucC5sZW5ndGhdKVxyXG5cdFx0XHRcdHN1bVtpXSArPSBwW2ldXHJcblx0XHRcdGxNYXBwaW5ncy5wdXNoIFtsaW5lTnVtLCBzdW1bMF0sIHN1bVsxXSwgc3VtWzJdLCBzdW1bM11dXHJcblx0cmV0dXJuIGxNYXBwaW5nc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkZWNvZGVMaW5lIDo9IChsaW5lOiBzdHJpbmcpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGlmIChsaW5lID09ICcnKVxyXG5cdFx0cmV0dXJuIFtdXHJcblxyXG5cdHJldHVybiBmb3IgdG9rZW4gb2YgbGluZS5zcGxpdCgnLCcpXHJcblx0XHRsT3V0cHV0OiBudW1iZXJbXSA6PSBbXVxyXG5cdFx0bGV0IGkgPSAwXHJcblx0XHR3aGlsZSAoaSA8IHRva2VuLmxlbmd0aClcclxuXHRcdFx0bGV0IHYgPSAwLCBkID0gYXRvYihcIkFBQVwiICsgdG9rZW5baV0pLmNoYXJDb2RlQXQoMilcclxuXHRcdFx0aSArPSAxXHJcblx0XHRcdHYgfD0gKGQgJiAzMSkgICAgICAgICAgIyBwdXQgbG93ZXN0IDUgYml0cyBvZiBkIGludG8gdlxyXG5cdFx0XHRsZXQgc2hpZnQgPSA1XHJcblx0XHRcdHdoaWxlIChkICYgMzIpICAgICAgICAgIyByZXBlYXQgaWYgaGlnaCBiaXQgb2YgZCBpcyBzZXRcclxuXHRcdFx0XHRkID0gYXRvYihcIkFBQVwiICsgdG9rZW5baV0pLmNoYXJDb2RlQXQoMilcclxuXHRcdFx0XHRpICs9IDFcclxuXHRcdFx0XHR2IHw9IChkICYgMzEpIDw8IHNoaWZ0ICAgIyBwdXQgbG93ZXN0IDUgYml0cyBvZiBkIGludG8gdlxyXG5cdFx0XHRcdHNoaWZ0ICs9IDVcclxuXHRcdFx0bE91dHB1dC5wdXNoKHYgJiAxID8gLSh2ID4+IDEpIDogdiA+PiAxKSAjIGxvdyBiaXQgaXMgc2lnblxyXG5cdFx0bE91dHB1dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRGcmFtZVR5cGUgPSAoXHJcblx0J2V2YWwnIHxcclxuXHQnbmF0aXZlJyB8XHJcblx0J2NvbnN0cnVjdG9yJyB8XHJcblx0J21ldGhvZCcgfFxyXG5cdCdmdW5jdGlvbicgfFxyXG5cdCdzY3JpcHQnIHxcclxuXHQndW5rbm93bidcclxuXHQpXHJcblxyXG5leHBvcnQgdHlwZSBUU3RhY2tGcmFtZSA9IHtcclxuXHRpOiBudW1iZXJcclxuXHR0eXBlOiBzdHJpbmdcclxuXHRzb3VyY2U6IHN0cmluZyAgICAgICAgIyByZWxhdGl2ZSBmaWxlIHBhdGggb3IgJ3Vua25vd24nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHRuYW1lOiBzdHJpbmcgICAgICAgICAgIyBuYW1lIG9mIGZ1bmN0aW9uIG9yIG1ldGhvZFxyXG5cdG9yZ1NvdXJjZT86IHN0cmluZ1xyXG5cdG9yZ0xpbmU/OiBudW1iZXJcclxuXHRvcmdDb2w/OiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFN0YWNrRnJhbWVzIDo9IChcclxuXHRcdHRyYWNlID0gZmFsc2VcclxuXHRcdCk6IFRJdGVyYXRvcjxUU3RhY2tGcmFtZT4gLT5cclxuXHJcblx0cHJvY2Vzcy5zZXRTb3VyY2VNYXBzRW5hYmxlZChmYWxzZSlcclxuXHRvcGVuRGVidWdGaWxlICdzdGFjaydcclxuXHRmbXQgOj0gKGxpbmU6IG51bWJlciwgY29sOiBudW1iZXIsIHNyYzogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gXCIje3NwcmludGYoJyUzZCcsIGxpbmUpfSAje3NwcmludGYoJyUzZCcsIGNvbCl9ICN7c3JjfVwiXHJcblxyXG5cdHRyeVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRMaW1pdCA6PSBFcnJvci5zdGFja1RyYWNlTGltaXRcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0b2xkUHJlcGFyZXIgOj0gRXJyb3IucHJlcGFyZVN0YWNrVHJhY2VcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gOTlcclxuXHJcblx0XHRsZXQgcHJldkZyYW1lOiBUU3RhY2tGcmFtZT8gPSB1bmRlZmluZWRcclxuXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdEVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gKGVycm9yLCBsT3JnRnJhbWVzKSA9PlxyXG5cclxuXHRcdFx0bGV0IGxGcmFtZXM6IFRTdGFja0ZyYW1lW10gPSBbXVxyXG5cclxuXHRcdFx0Zm9yIG9yZ0ZyYW1lLGkgb2YgbE9yZ0ZyYW1lc1xyXG5cclxuXHRcdFx0XHRzcmMgOj0gb3JnRnJhbWUuZ2V0RmlsZU5hbWUoKSAgICAjIC0tLSBhIGZ1bGwgcGF0aFxyXG5cdFx0XHRcdGlmIG5vdGRlZmluZWQoc3JjKSB8fCBzcmMubWF0Y2goLy8vZXh0IFxcOiBjbGkgXFwvIFxcZCtfdGVzdFxcLmpzLy8vKVxyXG5cdFx0XHRcdFx0Y29udGludWVcclxuXHJcblx0XHRcdFx0IyAtLS0gVGhlc2UgYXJlIGNvbnN0YW50c1xyXG5cdFx0XHRcdG9yZ1NvdXJjZSA6PSBub3JtYWxpemVQYXRoIHNyY1xyXG5cdFx0XHRcdG9yZ0xpbmUgICA6PSBvcmdGcmFtZS5nZXRMaW5lTnVtYmVyKClcclxuXHRcdFx0XHRvcmdDb2wgICAgOj0gb3JnRnJhbWUuZ2V0Q29sdW1uTnVtYmVyKClcclxuXHJcblx0XHRcdFx0REJHICctJy5yZXBlYXQgNjRcclxuXHRcdFx0XHREQkcgZm10KG9yZ0xpbmUsIG9yZ0NvbCwgb3JnU291cmNlKVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBjYW4gYmUgb3ZlcndyaXR0ZW4gd2hlbiB1c2luZyBzb3VyY2UgbWFwc1xyXG5cdFx0XHRcdGxldCBzb3VyY2UgPSBvcmdTb3VyY2VcclxuXHRcdFx0XHRsZXQgbGluZSAgID0gb3JnTGluZVxyXG5cdFx0XHRcdGxldCBjb2wgICAgPSBvcmdDb2xcclxuXHJcblx0XHRcdFx0ZnVuY3Rpb25OYW1lIDo9IG9yZ0ZyYW1lLmdldEZ1bmN0aW9uTmFtZSgpXHJcblx0XHRcdFx0bWV0aG9kTmFtZSAgIDo9IG9yZ0ZyYW1lLmdldE1ldGhvZE5hbWUoKVxyXG5cclxuXHRcdFx0XHQjIC0tLSBmb2xsb3cgc291cmNlIG1hcHMgcmVjdXJzaXZlbHlcclxuXHRcdFx0XHRsZXQgbmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMoe3NvdXJjZSwgbGluZSwgY29sfSlcclxuXHRcdFx0XHR3aGlsZSBkZWZpbmVkKG5ld0ZpbGVQb3MpXHJcblx0XHRcdFx0XHRzb3VyY2UgPSBuZXdGaWxlUG9zLnNvdXJjZSAgICMgLS0tIGFscmVhZHkgbm9ybWFsaXplZFxyXG5cdFx0XHRcdFx0bGluZSAgID0gbmV3RmlsZVBvcy5saW5lXHJcblx0XHRcdFx0XHRjb2wgICAgPSBuZXdGaWxlUG9zLmNvbFxyXG5cdFx0XHRcdFx0REJHIGZtdChsaW5lLCBjb2wsIHNvdXJjZSlcclxuXHRcdFx0XHRcdG5ld0ZpbGVQb3MgPSBtYXBQb3NTeW5jKG5ld0ZpbGVQb3MpXHJcblxyXG5cdFx0XHRcdGZyYW1lOiBUU3RhY2tGcmFtZSA6PSB7XHJcblx0XHRcdFx0XHRpXHJcblx0XHRcdFx0XHR0eXBlOiAoXHJcblx0XHRcdFx0XHRcdCAgZnVuY3Rpb25OYW1lICAgICAgICAgICAgID8gJ2Z1bmN0aW9uJ1xyXG5cdFx0XHRcdFx0XHQ6IG1ldGhvZE5hbWUgICAgICAgICAgICAgICA/ICdtZXRob2QnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNUb3BsZXZlbCgpICAgID8gJ3NjcmlwdCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc0V2YWwoKSAgICAgICAgPyAnZXZhbCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc05hdGl2ZSgpICAgICAgPyAnbmF0aXZlJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzQ29uc3RydWN0b3IoKSA/ICdjb25zdHJ1Y3RvcidcclxuXHRcdFx0XHRcdFx0OiAgICAgICAgICAgICAgICAgICAgICAgICAgICAndW5rbm93bidcclxuXHRcdFx0XHRcdFx0KVxyXG5cdFx0XHRcdFx0c291cmNlXHJcblx0XHRcdFx0XHRsaW5lXHJcblx0XHRcdFx0XHRjb2xcclxuXHRcdFx0XHRcdG5hbWU6IGZ1bmN0aW9uTmFtZSB8fCBtZXRob2ROYW1lIHx8ICcnXHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdCMgLS0tIEFkZCBvcmlnaW5hbCBzb3VyY2UsIGxpbmUgJiBjb2wgaWYgbWFwcGVkXHJcblx0XHRcdFx0aWYgKHNvdXJjZSAhPSBvcmdTb3VyY2UpXHJcblx0XHRcdFx0XHRmcmFtZS5vcmdTb3VyY2UgPSBvcmdTb3VyY2VcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0xpbmUgPSBvcmdMaW5lXHJcblx0XHRcdFx0XHRmcmFtZS5vcmdDb2wgPSBvcmdDb2xcclxuXHJcblx0XHRcdFx0IyAtLS0gZml4IGEgYnVnIGluIHRoZSBWOCBlbmdpbmUgd2hlcmUgY2FsbHMgaW5zaWRlIGFcclxuXHRcdFx0XHQjICAgICB0b3AgbGV2ZWwgYW5vbnltb3VzIGZ1bmN0aW9uIGlzIHJlcG9ydGVkIGFzXHJcblx0XHRcdFx0IyAgICAgYmVpbmcgb2YgdHlwZSAnc2NyaXB0J1xyXG5cclxuXHRcdFx0XHRpZiBwcmV2RnJhbWUgJiYgKGZyYW1lLnR5cGUgPT0gJ3NjcmlwdCcpICYmIChwcmV2RnJhbWUudHlwZSA9PSAnc2NyaXB0JylcclxuXHRcdFx0XHRcdHByZXZGcmFtZS50eXBlID0gJ2Z1bmN0aW9uJ1xyXG5cdFx0XHRcdFx0cHJldkZyYW1lLm5hbWUgPSAnPGFub24+J1xyXG5cclxuXHRcdFx0XHRpZiB0cmFjZVxyXG5cdFx0XHRcdFx0ZHVtcEZyYW1lIGZyYW1lLCAnT1JHIEZSQU1FJ1xyXG5cdFx0XHRcdHByZXZGcmFtZSA9IGZyYW1lXHJcblx0XHRcdFx0bEZyYW1lcy5wdXNoIGZyYW1lXHJcblxyXG5cdFx0XHRyZXR1cm4gbEZyYW1lc1xyXG5cclxuXHRcdG9iajogT2JqZWN0IDo9IHt9XHJcblx0XHRFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShvYmopXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdGxTdGFjazogVFN0YWNrRnJhbWVbXSA6PSBvYmouc3RhY2tcclxuXHJcblx0XHQjIC0tLSByZXNldCB0byBwcmV2aW91cyB2YWx1ZXNcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gb2xkTGltaXRcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBvbGRQcmVwYXJlclxyXG5cdFx0Zm9yIGZyYW1lIG9mIGxTdGFja1xyXG5cdFx0XHR5aWVsZCBmcmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y29uc29sZS5lcnJvciBcIiN7cmVkKCdFUlJPUiBpbiBhbGxTdGFja0ZyYW1lczonKX0gI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdFx0cmV0dXJuXHJcblx0ZmluYWxseVxyXG5cdFx0Y2xvc2VEZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNeUNhbGxlciA6PSAoKTogVFN0YWNrRnJhbWU/ID0+XHJcblxyXG5cdGZvciBmcmFtZSxpIG9mIGFsbFN0YWNrRnJhbWVzKClcclxuXHRcdGlmIChpID09IDMpXHJcblx0XHRcdHJldHVybiBmcmFtZVxyXG5cdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBkdW1wRnJhbWUgOj0gKFxyXG5cdFx0ZnJhbWU6IFRTdGFja0ZyYW1lLFxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdGUkFNRSdcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0e2ksIHR5cGUsIHNvdXJjZSwgbGluZSwgY29sLCBuYW1lfSA6PSBmcmFtZVxyXG5cdHR5cGVTdHIgOj0gc3ByaW50ZignJS04cycsIHR5cGUpXHJcblx0bmFtZVN0ciA6PSBzcHJpbnRmKCclLTE2cycsIG5hbWUpXHJcblx0aWYgc291cmNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9ICN7c291cmNlfToje2xpbmV9OiN7Y29sfVwiXHJcblx0ZWxzZVxyXG5cdFx0TE9HIFwiI3tsYWJlbH1bI3tpfV06ICN7dHlwZVN0cn0gI3tuYW1lU3RyfSA8bm9uZT5cIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRFcnJTdHIgOj0gKGVycjogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRpZiAodHlwZW9mIGVyciA9PSAnc3RyaW5nJylcclxuXHRcdHJldHVybiBlcnJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBBc3NlcnRpb25FcnJvcilcclxuXHRcdGVycm1zZyA6PSBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRcdHJldHVybiBcIiN7Y29sb3JpemUoJ0Fzc2VydGlvbkVycm9yOiAnLCAncmVkJyl9I3tlcnJtc2d9XCJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcilcclxuXHRcdHJldHVybiBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gXCJTZXJpb3VzIEVycm9yXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgVFJZIDo9IChmdW5jOiAoKSA9PiB2b2lkKTogdm9pZCA9PlxyXG5cclxuXHR0cnlcclxuXHRcdGZ1bmMoKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y3JvYWsgZXJyXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IFNLSVAgOj0gKGZ1bmM6ICgpID0+IHZvaWQpOiB2b2lkID0+XHJcblxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQcmVkaWNhdGU8VD11bmtub3duPiA9IChpdGVtOiBUKSA9PiBib29sZWFuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvQm9vbCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIG5vdCBub3QgeFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlPZiA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSxcclxuXHRcdGNoZWNrRnVuYzogVFByZWRpY2F0ZTxUPiA9ICh4KSA9PiB0b0Jvb2woeClcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsT2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgbm90IGNoZWNrRnVuYyhpdGVtKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmlzQXN5bmNHZW5lcmF0b3JGdW5jdGlvbiA6PSAoXHJcblx0XHR4OiB1bmtub3duXHJcblx0XHQpOiB4IGlzIEFzeW5jR2VuZXJhdG9yRnVuY3Rpb24gPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgICh0eXBlb2YgeCA9PSAnZnVuY3Rpb24nKVxyXG5cdFx0JiYgKHgudG9TdHJpbmcoKS5tYXRjaCgvXFxiYXN5bmNcXHMrZnVuY3Rpb25cXHMqXFwqLykgIT0gbnVsbClcclxuXHRcdClcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxWYWx1ZXNGcm9tIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdIHwgVEl0ZXJhdG9yPFQ+XHJcblx0XHQpOiBUSXRlcmF0b3I8VD4gLT5cclxuXHJcblx0aXRlciA6PSBBcnJheS5pc0FycmF5KGxJdGVtcykgPyBsSXRlbXMudmFsdWVzKCkgOiBsSXRlbXNcclxuXHRsb29wXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdGJyZWFrXHJcblx0XHRlbHNlXHJcblx0XHRcdHlpZWxkIHZhbHVlXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFZhbHVlc0Zyb21Bc3luYyA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSB8IFRJdGVyYXRvcjxUPiB8IFRBc3luY0l0ZXJhdG9yPFQ+XHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxUPiAtPlxyXG5cclxuXHRpdGVyIDo9IEFycmF5LmlzQXJyYXkobEl0ZW1zKSA/IGxJdGVtcy52YWx1ZXMoKSA6IGxJdGVtc1xyXG5cdGxvb3BcclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gYXdhaXQgaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0YnJlYWtcclxuXHRcdGVsc2VcclxuXHRcdFx0eWllbGQgdmFsdWVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd3JpdGUgOj0gKHN0cjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHREZW5vLnN0ZG91dC53cml0ZVN5bmMgZW5jb2RlKHN0cilcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd3JpdGVsbiA6PSAoc3RyOiBzdHJpbmcgPSAnJyk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgc3RyICsgJ1xcbidcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJTY3JlZW4gOj0gKCk6IHZvaWQgPT5cclxuXHJcblx0d3JpdGUgJ1xceDFiW0hcXHgxYlsySidcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVzZXRMaW5lIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIFwiXFx4MWJbMktcIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhclByZXZpb3VzTGluZXMgOj0gKG51bUxpbmVzOiBudW1iZXIpOiB2b2lkID0+XHJcblx0IyBcXHgxYltuQSBtb3ZlcyB0aGUgY3Vyc29yIHVwICduJyBsaW5lc1xyXG5cdCMgXFxyIG1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgbGluZVxyXG5cdCMgXFx4MWJbSyBjbGVhcnMgdGhlIGxpbmUgZnJvbSB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgKG9wdGlvbmFsLCBidXQgZ29vZCBwcmFjdGljZSlcclxuXHJcblx0RGVuby5zdGRvdXQud3JpdGVTeW5jIGVuY29kZShcIlxceDFiWyN7bnVtTGluZXN9QVxcclxceDFiW0tcIilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQ29sb3IgPSAnY3lhbid8J2JsdWUnfCdibGFjayd8J3JlZCd8J2dyZWVuJ3wnbWFnZW50YSd8J3llbGxvdydcclxuXHJcbmV4cG9ydCBpc0NvbG9yIDo9IChzdHI6IHN0cmluZyk6IHN0ciBpcyBUQ29sb3IgPT5cclxuXHJcblx0cmV0dXJuIFsnY3lhbicsJ2JsdWUnLCdibGFjaycsJ3JlZCcsJ2dyZWVuJywnbWFnZW50YScsJ3llbGxvdyddLmluY2x1ZGVzIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjb2xvcml6ZSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChjb2xvcikgfHwgbm90IGlzQ29sb3IoY29sb3IpXHJcblx0XHRyZXR1cm4gc3RyXHJcblx0c3dpdGNoIGNvbG9yXHJcblx0XHR3aGVuICdjeWFuJyAgICB0aGVuIHJldHVybiBjeWFuKHN0cilcclxuXHRcdHdoZW4gJ2JsdWUnICAgIHRoZW4gcmV0dXJuIGJsdWUoc3RyKVxyXG5cdFx0d2hlbiAnYmxhY2snICAgdGhlbiByZXR1cm4gYmxhY2soc3RyKVxyXG5cdFx0d2hlbiAncmVkJyAgICAgdGhlbiByZXR1cm4gcmVkKHN0cilcclxuXHRcdHdoZW4gJ2dyZWVuJyAgIHRoZW4gcmV0dXJuIGdyZWVuKHN0cilcclxuXHRcdHdoZW4gJ21hZ2VudGEnIHRoZW4gcmV0dXJuIG1hZ2VudGEoc3RyKVxyXG5cdFx0d2hlbiAneWVsbG93JyAgdGhlbiByZXR1cm4geWVsbG93KHN0cilcclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gaENvbG9ycyBpcyB7PHdvcmQ+OiA8Y29sb3I+LCAuLi4gfVxyXG5cclxudHlwZSBUQ29sb3JNYXAgPSB7XHJcblx0W3dvcmQ6IHN0cmluZ106IFRDb2xvclxyXG5cdH1cclxuXHJcbmV4cG9ydCB3aXRoQ29sb3JzIDo9IChcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRoQ29sb3JzOiBUQ29sb3JNYXBcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRmb3Igd29yZCBvZiBPYmplY3Qua2V5cyhoQ29sb3JzKVxyXG5cdFx0Y29sb3IgOj0gaENvbG9yc1t3b3JkXVxyXG5cdFx0c3RyID0gc3RyLnJlcGxhY2VBbGwod29yZCwgY29sb3JpemUod29yZCwgY29sb3IpKVxyXG5cdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGVjb2xvcml6ZSA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0cmlwQW5zaUNvZGUoc3RyKVxyXG4iXX0=