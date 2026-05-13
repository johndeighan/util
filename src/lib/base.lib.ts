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

export type TIterator<T, U=void, V=void> = Generator<T, U, V>
export type TAsyncIterator<T, U=void, V=void> = AsyncGenerator<T, U, V>
export type TNonFunction<T=unknown> = Exclude<T, Function>

// ---------------------------------------------------------------------------

export function* emptyIterator<T=unknown>(): TIterator<T> { () => {
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

const logLine = (
		x: unknown,
		): void => {

	const line = '\t'.repeat(indentLevel) + String(x)
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

export const allLinesIn = async function*(
		path: string
		): TAsyncIterator<string> {

	const file = await Deno.open(path)
	const readable = (file.readable
			.pipeThrough(new TextDecoderStream())
			.pipeThrough(new TextLineStream())
			)
	for await (const line of readable) {
		yield line
	}
	return
}

export let onlyThrow = false

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDbEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxBQUFLLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwRSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDNUIsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQyxDQUFFLElBQUksQ0FBQyxDQUFDLEMsQ0FBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RCxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQyxDQUFFLElBQUksQ0FBQyxDQUFDLEMsQ0FBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2RSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzFELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUMsQyxDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUMsQyxDLENBQUEsRUFBRSxDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBLENBQUEsQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUEsQ0FBQTtBQUMxQixBQUFBLENBQUMsYUFBWTtBQUNiLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLEMsTUFBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDLEMsVyxDQUFDLEFBQUMsSSxDQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUEsQUFBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQSxDQUFDO0FBQ25ELEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUztBQUN6QixBQUFBLEFBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQztBQUNwQyxBQUFBLEFBQUEsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTO0FBQ25DLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxLQUFL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QyxDQUFDLElBQUksQ0FBQyxDO0VBQUEsQztDQUFBLENBQUE7QUFDNUQsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFlLE1BQWQsY0FBYyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hELEFBQUE7QUFDQSxBQUFBLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDL0IsQUFBQSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDMUIsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDM0UsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFhLE1BQVosWUFBWSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxTQUFTO0FBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsQ0FBQyxVQUFVLEMsQ0FBRSxDQUFD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QUNyQyxHQUFHLENBQUM7QUFDSixBQUFBLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUEsQ0FBQSxDQUFBO0FBQzNCLEFBQUEsRUFBRSxLQUFLLENBQUMsSTtDQUFJLENBQUE7QUFDWixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLO0FBQzVCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLEMsTUFBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxNQUFNO0FBQ2hCLEVBQUUsQ0FBQyxDLEMsVyxDQUFDLEFBQUMsTSxDQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQSxBQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBZSxNQUFkLGNBQWMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUMxQixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsTUFBTTtBQUNoQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQSxBQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0s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QUFBLENBQUE7QUFDOUMsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxJQUFJLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQztHQUFDLENBQUE7QUFDNUMsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ2xCLEFBQUE7QUFDQSxBQUFBLENBQUMsMkRBQTBEO0FBQzNELEFBQUEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUM1QixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7QUFDdkUsQUFBQSxFQUFFLEdBQUcsQ0FBQSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkMsQUFBQSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLEMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUN0RSxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQ0FBQTtBQUMxQyxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQU0sTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsQUFBQSxFQUFFLE1BQU0sQ0FBQSxBQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUN0QixBQUFBLEVBQWtELE1BQWhELENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLElBQUk7QUFDMUQsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQztDQUFDLEM7QUFBQSxDQUFBO0FBQzFDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBWSxNQUFYLFdBQVcsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNsQixBQUFBO0FBQ0EsQUFBQSxDQUFzQixNQUFyQixTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzVCLEFBQUEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakMsQUFBQSxDLEksRSxJLENB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TUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxDQUFDLEtBQUs7QUFDNUMsQUFBQSxDQUFRLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ2pDLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNsQyxBQUFBLENBQUMsR0FBRyxDQUFBLE1BQU0sQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLEVBQUUsR0FBRyxDQUFBLEFBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RFLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBRSxHQUFHLENBQUEsQUFBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwRCxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVUsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDN0MsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFFLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQTtBQUM1QixBQUFB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blxyXG5pbXBvcnQgcHJvY2VzcyBmcm9tIFwibm9kZTpwcm9jZXNzXCJcclxuaW1wb3J0IHtcclxuXHRjeWFuLCBibHVlLCBibGFjaywgcmVkLCBncmVlbiwgbWFnZW50YSwgeWVsbG93LFxyXG5cdHN0cmlwQW5zaUNvZGUsXHJcblx0fSBmcm9tICdAc3RkL2ZtdC9jb2xvcnMnXHJcbmltcG9ydCB7QXNzZXJ0aW9uRXJyb3J9IGZyb20gJ0BzdGQvYXNzZXJ0J1xyXG5pbXBvcnQge1NvdXJjZU1hcENvbnN1bWVyfSBmcm9tICdAbW96aWxsYS9zb3VyY2UtbWFwJ1xyXG5pbXBvcnQge1xyXG5cdHJlc29sdmUsIHJlbGF0aXZlLCBpc0Fic29sdXRlLCBmcm9tRmlsZVVybCwgZGlybmFtZSxcclxuXHR9IGZyb20gJ0BzdGQvcGF0aCdcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zJ1xyXG5pbXBvcnQgZGVlcEVxdWFsIGZyb20gJ25wbS1mYXN0LWRlZXAtZXF1YWwnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5leHBvcnQgZGVlcENvcHkgPSBzdHJ1Y3R1cmVkQ2xvbmVcclxuXHJcbm15ZGlyIDo9IGRpcm5hbWUoZnJvbUZpbGVVcmwoaW1wb3J0Lm1ldGEudXJsKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRTdHJpbmdTb3VyY2UgPSBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IEJ1ZmZlclNvdXJjZSB8IHN0cmluZ1xyXG5cclxuZW5jb2RlciA6PSBuZXcgVGV4dEVuY29kZXIoKVxyXG5leHBvcnQgZW5jb2RlIDo9ICh4OiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiA9PlxyXG5cdHJldHVybiBlbmNvZGVyLmVuY29kZSB4XHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlcigpXHJcbmV4cG9ydCBkZWNvZGUgOj0gKHg6IFRTdHJpbmdTb3VyY2UpOiBzdHJpbmcgPT5cclxuXHRyZXR1cm4gKHR5cGVvZiB4ID09ICdzdHJpbmcnKSA/IHggOiBkZWNvZGVyLmRlY29kZSh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRJdGVyYXRvcjxULCBVPXZvaWQsIFY9dm9pZD4gPSBHZW5lcmF0b3I8VCwgVSwgVj5cclxuZXhwb3J0IHR5cGUgVEFzeW5jSXRlcmF0b3I8VCwgVT12b2lkLCBWPXZvaWQ+ID0gQXN5bmNHZW5lcmF0b3I8VCwgVSwgVj5cclxuZXhwb3J0IHR5cGUgVE5vbkZ1bmN0aW9uPFQ9dW5rbm93bj4gPSBFeGNsdWRlPFQsIEZ1bmN0aW9uPlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiogZW1wdHlJdGVyYXRvcjxUPXVua25vd24+KCk6IFRJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXNzIDo9ICgpOiB2b2lkID0+XHJcblx0IyBkbyBub3RoaW5nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgc2xlZXAgOj0gKHNlYzogbnVtYmVyKTogdm9pZCA9PlxyXG5cclxuXHRhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dCByLCAxMDAwICogc2VjKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bmRlZiA6PSB1bmRlZmluZWRcclxudHlwZSBURGVmaW5lZCA9IE5vbk51bGxhYmxlPHVua25vd24+XHJcbnR5cGUgVE5vdERlZmluZWQgPSBudWxsIHwgdW5kZWZpbmVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlZmluZWQgOj0gKHg6IHVua25vd24pOiB4IGlzIFREZWZpbmVkID0+XHJcblxyXG5cdHJldHVybiAoeCAhPSB1bmRlZikgJiYgKHggIT0gbnVsbClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55RGVmaW5lZCA6PSAoLi4ubEl0ZW1zOiB1bmtub3duW10pOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgZGVmaW5lZChpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBUTm90RGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggPT0gdW5kZWYpIHx8ICh4ID09IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU5vdERlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWF4IDo9ICh4OiBudW1iZXIsIHk6IG51bWJlcik6IG51bWJlciA9PlxyXG5cclxuXHRyZXR1cm4gKHggPiB5KSA/IHggOiB5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJhbmdlIDo9IChuOiBudW1iZXIpOiBUSXRlcmF0b3I8bnVtYmVyPiAtPlxyXG5cclxuXHRmb3IgaSBvZiBbMC4uLm5dXHJcblx0XHR5aWVsZCBpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgIExPR0dJTkdcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnNldERlYnVnRmlsZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHJcbmxldCBpbmRlbnRMZXZlbCA9IDBcclxubGV0IGxMb2dMaW5lczogc3RyaW5nW10gPSBbXVxyXG5cclxuZXhwb3J0IElOREVOVCA6PSBTeW1ib2wgJ2luZGVudCdcclxuZXhwb3J0IFVOREVOVCA6PSBTeW1ib2wgJ3VuZGVudCdcclxuXHJcbmV4cG9ydCB0eXBlIFRMb2dMZXZlbCA9ICdzaWxlbnQnIHwgJ2luZm8nIHwgJ2RlYnVnJ1xyXG5sZXQgbExvZ0xldmVsczogVExvZ0xldmVsW10gPSBbJ2luZm8nXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvcGVuRGVidWdGaWxlIDo9IChcclxuXHRcdHN0dWI6IHN0cmluZ1xyXG5cdFx0Y2xlYXI6IGJvb2xlYW4gPSBmYWxzZVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwiLi9sb2dzLyN7c3R1Yn0ubG9nXCJcclxuXHRzZXREZWJ1Z0ZpbGVzLmFkZCBwYXRoXHJcblx0aWYgY2xlYXJcclxuXHRcdERlbm8ucmVtb3ZlU3luYyBwYXRoXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFwcGVuZERlYnVnRmlsZSA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGJsb2NrIDo9ICh0eXBlb2YgaXRlbSA9PSAnc3RyaW5nJykgPyBpdGVtIDogdG9KU09OKGl0ZW0pXHJcblx0XHRmb3IgcGF0aCBvZiBzZXREZWJ1Z0ZpbGVzXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgcGF0aCwgYmxvY2sgKyBcIlxcblwiLCB7YXBwZW5kOiB0cnVlfVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbG9zZURlYnVnRmlsZSA6PSAoc3R1Yjogc3RyaW5nKTogdm9pZCA9PlxyXG5cclxuXHRwYXRoIDo9IFwic3JjL2xvZ3MvI3tzdHVifS5sb2dcIlxyXG5cdHNldERlYnVnRmlsZXMuZGVsZXRlIHBhdGhcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY3VyTG9nTGV2ZWwgOj0gKCk6IFRMb2dMZXZlbCA9PlxyXG5cclxuXHRyZXR1cm4gKGxMb2dMZXZlbHMubGVuZ3RoID09IDApID8gJ2luZm8nIDogbExvZ0xldmVsc1tsTG9nTGV2ZWxzLmxlbmd0aC0xXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbml0TG9nTGV2ZWwgOj0gKFxyXG5cdFx0bGV2ZWw6IFRMb2dMZXZlbFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGV2ZWxzID0gW2xldmVsXVxyXG5cdGNvbnNvbGUubG9nIFwiTE9HIExFVkVMIHNldCB0byAje2xldmVsfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHB1c2hMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMucHVzaCBsZXZlbFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwb3BMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdGlmIChsTG9nTGV2ZWxzLmxlbmd0aCA9PSAwKVxyXG5cdFx0cmV0dXJuICdpbmZvJ1xyXG5cdGVsc2VcclxuXHRcdHJlc3VsdCA6PSBsTG9nTGV2ZWxzLnBvcCgpXHJcblx0XHRyZXR1cm4gcmVzdWx0IHx8ICdpbmZvJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0pTT04gOj0gKGl0ZW06IHVua25vd24pOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGl0ZW0sIG51bGwsIDMpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IExPRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAnc2lsZW50JylcclxuXHRcdHJldHVyblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgKGl0ZW0gPT0gSU5ERU5UKVxyXG5cdFx0XHRpbmRlbnRMZXZlbCArPSAxXHJcblx0XHRlbHNlIGlmIChpdGVtID09IFVOREVOVClcclxuXHRcdFx0aWYgKGluZGVudExldmVsID4gMClcclxuXHRcdFx0XHRpbmRlbnRMZXZlbCAtPSAxXHJcblx0XHRlbHNlXHJcblx0XHRcdGxvZ0xpbmUgaXRlbVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBEQkcgOj0gKFxyXG5cdFx0Li4ubEl0ZW1zOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0IyAtLS0gaWYgYW4gYXBwZW5kIGZpbGUgaXMgZGVmaW5lZCwgb3V0cHV0IGV2ZW4gaWZcclxuXHQjICAgICBjdXJyZW50IGxvZyBsZXZlbCBpcyBub3QgJ2RlYnVnJ1xyXG5cdGFwcGVuZERlYnVnRmlsZSAuLi5sSXRlbXNcclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgPT0gJ2RlYnVnJylcclxuXHRcdExPRyAuLi5sSXRlbXNcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgV0FSTiA6PSAoXHJcblx0XHRtc2c6IHN0cmluZ1xyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdXQVJOSU5HJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSAhPSAnc2lsZW50JylcclxuXHRcdGNvbnNvbGUuZXJyb3IgXCIje2N5YW4obGFiZWwpfTogI3ttc2d9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgRVJSIDo9IChcclxuXHRcdGVycjogdW5rbm93blxyXG5cdFx0bGFiZWw6IHN0cmluZyA9ICdFUlInXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdGNvbnNvbGUuZXJyb3IgcmVkKGxhYmVsKSArICc6ICcgKyBlcnJNc2dcclxuXHRsTG9nTGluZXMucHVzaCBlcnJNc2dcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5sb2dMaW5lIDo9IChcclxuXHRcdHg6IHVua25vd24sXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxpbmUgOj0gJ1xcdCcucmVwZWF0KGluZGVudExldmVsKSArIFN0cmluZyh4KVxyXG5cdGNvbnNvbGUubG9nIGxpbmVcclxuXHRsTG9nTGluZXMucHVzaCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyTG9nIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMaW5lcy5sZW5ndGggPSAwXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExvZyA6PSAoKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBsTG9nTGluZXMuam9pbignXFxuJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgICAgICAgICAgIEZpbGUgU3lzdGVtIFV0aWxzXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZEZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nPyA9PlxyXG5cclxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXHJcblxyXG5cdGxldCBmb3VuZFBhdGg6IHN0cmluZz8gPSB1bmRlZlxyXG5cdGZvciB7cGF0aH0gb2YgZXhwYW5kR2xvYlN5bmMgXCIje3Jvb3R9LyoqLyN7ZmlsZU5hbWV9XCIsIHtcclxuXHRcdFx0cm9vdFxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0XHR9XHJcblx0XHRpZiBkZWZpbmVkKGZvdW5kUGF0aClcclxuXHRcdFx0Y3JvYWsgXCJNdWx0aXBsZSBmaWxlcyBuYW1lZCAje2ZpbGVOYW1lfSBmb3VuZCBpbiAje3Jvb3R9XCJcclxuXHRcdGVsc2VcclxuXHRcdFx0Zm91bmRQYXRoID0gbm9ybWFsaXplUGF0aCBwYXRoXHJcblx0cmV0dXJuIGZvdW5kUGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3JtYWxpemVQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdG5ld3BhdGggOj0gcGF0aC5yZXBsYWNlQWxsICdcXFxcJywgJy8nXHJcblx0aWYgKG5ld3BhdGguY2hhckF0KDEpID09ICc6JylcclxuXHRcdHJldHVybiBuZXdwYXRoLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbmV3cGF0aC5zdWJzdHJpbmcoMSlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gbmV3cGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmaWxlRXh0IDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0bE1hdGNoZXMgOj0gcGF0aC5tYXRjaCgvXFwuW15cXC5dKyQvKVxyXG5cdHJldHVybiBsTWF0Y2hlcyA/IGxNYXRjaGVzWzBdIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd2l0aEV4dCA6PSAocGF0aDogc3RyaW5nLCBleHQ6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgZXh0LnN0YXJ0c1dpdGgoJy4nKSwgXCJCYWQgZmlsZSBleHRlbnNpb246ICN7ZXh0fVwiXHJcblx0cG9zIDo9IHBhdGgubGFzdEluZGV4T2YgJy4nXHJcblx0YXNzZXJ0IChwb3MgPj0gMCksIFwicGF0aCBjb250YWlucyBubyBwZXJpb2Q6ICN7cGF0aH1cIlxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHBhdGguc3Vic3RyaW5nKDAsIHBvcykgKyBleHRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9SZWxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdHJvb3Q6IHN0cmluZyA9IERlbm8uY3dkKClcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZWxhdGl2ZShyb290LCBwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Z1bGxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlc29sdmUoJy4nLCBwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpc0Z1bGxQYXRoIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRyZXR1cm4gaXNBYnNvbHV0ZShwYXRoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBuZXdlckRlc3RGaWxlRXhpc3RzIDo9IChcclxuXHRcdHNyY1BhdGg6IHN0cmluZyxcclxuXHRcdGRlc3RQYXRoOiBzdHJpbmcgICAgIyAtLS0gY2FuIGJlIGEgZmlsZSBleHRlbnNpb25cclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0IyAtLS0gc291cmNlIGZpbGUgbXVzdCBleGlzdFxyXG5cdGFzc2VydCBleGlzdHNTeW5jKHNyY1BhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3tzcmNQYXRofVwiXHJcblxyXG5cdCMgLS0tIGFsbG93IHBhc3NpbmcgYSBmaWxlIGV4dGVuc2lvbiBmb3IgMm5kIGFyZ3VtZW50XHJcblx0aWYgZGVzdFBhdGguc3RhcnRzV2l0aCgnLicpXHJcblx0XHRkZXN0UGF0aCA9IHdpdGhFeHQoc3JjUGF0aCwgZGVzdFBhdGgpXHJcblxyXG5cdGlmIG5vdCBleGlzdHNTeW5jKGRlc3RQYXRoKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0dHJ5XHJcblx0XHRkZXN0bXMgOj0gZ2V0RmlsZVN0YXRzKGRlc3RQYXRoKS5tdGltZVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQoZGVzdG1zKVxyXG5cdFx0c3JjbXMgIDo9IGdldEZpbGVTdGF0cyhzcmNQYXRoKS5tdGltZVxyXG5cdFx0YXNzZXJ0IGRlZmluZWQoc3JjbXMpXHJcblx0XHRyZXR1cm4gKGRlc3RtcyA+IHNyY21zKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZpbGVTdGF0cyA9IHtcclxuXHRpc0ZpbGU6IGJvb2xlYW5cclxuXHRpc0RpcmVjdG9yeTogYm9vbGVhblxyXG5cdG10aW1lOiBEYXRlP1xyXG5cdH1cclxuXHJcbmV4cG9ydCBnZXRGaWxlU3RhdHMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBURmlsZVN0YXRzID0+XHJcblxyXG5cdGhTdGF0cyA6PSBEZW5vLnN0YXRTeW5jIHBhdGhcclxuXHRyZXR1cm4ge1xyXG5cdFx0aXNGaWxlOiAgICAgIGhTdGF0cy5pc0ZpbGVcclxuXHRcdGlzRGlyZWN0b3J5OiBoU3RhdHMuaXNEaXJlY3RvcnlcclxuXHRcdG10aW1lOiAgICAgICBoU3RhdHMubXRpbWUgfHwgdW5kZWZcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBhbGxMaW5lc0luIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZ1xyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRmaWxlIDo9IGF3YWl0IERlbm8ub3BlbiBwYXRoXHJcblx0cmVhZGFibGUgOj0gKGZpbGUucmVhZGFibGVcclxuXHRcdFx0LnBpcGVUaHJvdWdoKG5ldyBUZXh0RGVjb2RlclN0cmVhbSgpKVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHRMaW5lU3RyZWFtKCkpXHJcblx0XHRcdClcclxuXHRmb3IgYXdhaXQgbGluZSBvZiByZWFkYWJsZVxyXG5cdFx0eWllbGQgbGluZVxyXG5cdHJldHVyblxyXG5cclxuZXhwb3J0IGxldCBvbmx5VGhyb3cgPSBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1rVGVtcEZpbGUgOj0gKFxyXG5cdFx0c3VmZml4OiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gYXdhaXQgRGVuby5tYWtlVGVtcEZpbGUge3N1ZmZpeH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBta1RlbXBGaWxlU3luYyA6PSAoXHJcblx0XHRzdWZmaXg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQganVzdFRocm93IDo9IChmbGFnOiBib29sZWFuPXRydWUpOiB2b2lkID0+XHJcblxyXG5cdG9ubHlUaHJvdyA9IGZsYWdcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFROZXZlckZ1bmMgPSAoZXJyPzogdW5rbm93bikgPT4gbmV2ZXJcclxuXHJcbmV4cG9ydCBjcm9hazogVE5ldmVyRnVuYyA6PSAoXHJcblx0XHRlcnI6IHVua25vd24gPSB1bmRlZlxyXG5cdFx0KTogbmV2ZXIgPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChlcnIpXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoKVxyXG5cdGVsc2VcclxuXHRcdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdFx0aWYgb25seVRocm93XHJcblx0XHRcdCMgLS0tIGFsbG93cyB0aGUgZXJyb3IgdG8gYmUgY2F1Z2h0IGFuZCBoYW5kbGVkIG9yIGlnbm9yZWRcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGVyck1zZylcclxuXHRcdGVsc2VcclxuXHRcdFx0Y29uc29sZS5lcnJvciByZWQoJ0NST0FLJykgKyAnOiAnICsgZXJyTXNnXHJcblx0XHRcdGNvbnNvbGUuZXJyb3IgXCItLS0tLSAgU1RBQ0sgLS0tLS1cIlxyXG5cdFx0XHRmb3IgZnJhbWUgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0XHRcdGR1bXBGcmFtZSBmcmFtZVxyXG5cdFx0XHREZW5vLmV4aXQoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRBc3NlcnRGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdG1zZz86IHN0cmluZ1xyXG5cdFx0KSA9PiBhc3NlcnRzIGNvbmRcclxuXHJcbmV4cG9ydCBhc3NlcnQ6IFRBc3NlcnRGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c6IHN0cmluZyA9IFwiQW4gdW5rbm93biBlcnJvciBvY2N1cnJlZFwiXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIG1zZ1xyXG5cdHJldHVyblxyXG5cclxuZXhwb3J0IG9idmlvdXNseTogVEFzc2VydEZ1bmMgOj0gKFxyXG5cdFx0Y29uZDogdW5rbm93blxyXG5cdFx0Y29uZFN0cjogc3RyaW5nID0gJydcclxuXHRcdCk6IGFzc2VydHMgY29uZCA9PlxyXG5cclxuXHRpZiBub3QgY29uZFxyXG5cdFx0Y3JvYWsgXCIje2NvbmRTdHIgfHwgJ2NvbmRpdGlvbid9IG5vdCBvYnZpb3VzbHkgdHJ1ZVwiXHJcblx0XHREZW5vLmV4aXQoKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFJhd1NvdXJjZU1hcCA9IHtcclxuXHR2ZXJzaW9uOiBudW1iZXI7ICAgICAgICAgICAjIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwIHNwZWMgKHVzdWFsbHkgMylcclxuXHRmaWxlOiBzdHJpbmc7ICAgICAgICAgICAgICAjIFRoZSBnZW5lcmF0ZWQgZmlsZSB0aGlzIG1hcCBpcyBhc3NvY2lhdGVkIHdpdGhcclxuXHRzb3VyY2VzOiBzdHJpbmdbXTsgICAgICAgICAjIEFycmF5IG9mIFVSTHMgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlc1xyXG5cdG5hbWVzOiBzdHJpbmdbXTsgICAgICAgICAgICMgQXJyYXkgb2YgaWRlbnRpZmllcnMgKG5hbWVzKSB1c2VkIGluIHRoZSBtYXBwaW5nc1xyXG5cdHNvdXJjZVJvb3Q/OiBzdHJpbmc7ICAgICAgICMgT3B0aW9uYWw6IFVSTCByb290IGZvciB0aGUgc291cmNlc1xyXG5cdHNvdXJjZXNDb250ZW50Pzogc3RyaW5nW107ICMgQ29udGVudCBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzIChvcHRpb25hbClcclxuXHRtYXBwaW5nczogc3RyaW5nOyAgICAgICAgICAjIFRoZSBhY3R1YWwgZW5jb2RlZCBtYXBwaW5ncyAoQmFzZTY0IFZMUSlcclxuXHR9XHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVBvc2l0aW9uID0ge1xyXG5cdHNvdXJjZTogc3RyaW5nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWFwUG9zIDo9IChcclxuXHRmaWxlUG9zOiBURmlsZVBvc2l0aW9uXHJcblx0KTogVEZpbGVQb3NpdGlvbj8gPT5cclxuXHJcblx0e3NvdXJjZSwgbGluZSwgY29sfSA6PSBmaWxlUG9zXHJcblx0Y29udGVudHMgOj0gYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRjb25zdW1lciA6PSBhd2FpdCBuZXcgU291cmNlTWFwQ29uc3VtZXIoaFNyY01hcClcclxuXHRcdHBvcyA6PSBjb25zdW1lci5vcmlnaW5hbFBvc2l0aW9uRm9yKHtsaW5lLCBjb2x1bW46IGNvbH0pXHJcblx0XHRyZXR1cm4gcG9zIGFzIFRGaWxlUG9zaXRpb25cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWFwUG9zU3luYyA6PSAoXHJcblx0ZmlsZVBvczogVEZpbGVQb3NpdGlvblxyXG5cdCk6IFRGaWxlUG9zaXRpb24/ID0+XHJcblxyXG5cdHtzb3VyY2UsIGxpbmUsIGNvbH0gOj0gZmlsZVBvc1xyXG5cdGNvbnRlbnRzIDo9IERlbm8ucmVhZFRleHRGaWxlU3luYyBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdFtmaWxlTnVtLCBzcmNMaW5lLCBzcmNDb2xdIDo9IGdldE9yZ1BvcyBoU3JjTWFwLCBsaW5lLCBjb2xcclxuXHRcdGZpbGVOYW1lIDo9IGhTcmNNYXAuc291cmNlc1tmaWxlTnVtXVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c291cmNlOiBub3JtYWxpemVQYXRoIFwiI3tkaXJuYW1lKHNvdXJjZSl9LyN7ZmlsZU5hbWV9XCJcclxuXHRcdFx0bGluZTogc3JjTGluZVxyXG5cdFx0XHRjb2w6IHNyY0NvbFxyXG5cdFx0XHR9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGV4dHJhY3RTb3VyY2VNYXAgOj0gKFxyXG5cdFx0Y29udGVudHM6IHN0cmluZ1xyXG5cdFx0KTogW3N0cmluZywgUmF3U291cmNlTWFwP10gPT5cclxuXHJcblx0bE1hdGNoZXMgOj0gY29udGVudHMubWF0Y2ggLy8vXlxyXG5cdFx0XHQoLiopXHJcblx0XHRcdFxcLyBcXC8gXFwjIFxccytcclxuXHRcdFx0c291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uXFwvanNvbjtcclxuXHRcdFx0KD86Y2hhcnNldD11dGYtODspP1xyXG5cdFx0XHRiYXNlNjQsXHJcblx0XHRcdCguKylcclxuXHRcdFx0JC8vL3NcclxuXHRpZiAobE1hdGNoZXMgPT0gbnVsbClcclxuXHRcdHJldHVybiBbY29udGVudHMsIHVuZGVmXVxyXG5cdFtfLCBjb2RlLCBoU3JjTWFwU3RyXSA6PSBsTWF0Y2hlc1xyXG5cdGhTcmNNYXAgOj0gSlNPTi5wYXJzZShhdG9iKGhTcmNNYXBTdHIpKSBhcyBSYXdTb3VyY2VNYXBcclxuXHR7ZmlsZX0gOj0gaFNyY01hcFxyXG5cdGhTcmNNYXAuZmlsZSA9IHRvUmVsUGF0aChmaWxlKVxyXG5cdGhTcmNNYXAuc291cmNlcyA9IGZvciBwYXRoIG9mIGhTcmNNYXAuc291cmNlc1xyXG5cdFx0dG9SZWxQYXRoKHBhdGgpXHJcblx0cmV0dXJuIFtjb2RlLCBoU3JjTWFwXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE9yZ1BvcyA9IFtmaWxlTnVtOiBudW1iZXIsIGxpbmU6IG51bWJlciwgY29sOiBudW1iZXJdXHJcbnR5cGUgVENvbXBhcmVSZXN1bHQgPSAtMSB8IDAgfCAxXHJcblxyXG5jb21wYXJlIDo9IChcclxuXHRcdGZpbmQ6IFtudW1iZXIsIG51bWJlcl0sXHJcblx0XHRnZW46ICBbbnVtYmVyLCBudW1iZXJdXHJcblx0XHQpOiBUQ29tcGFyZVJlc3VsdCA9PlxyXG5cclxuXHRyZXR1cm4gKFxyXG5cdFx0ICAoZmluZFswXSA8IGdlblswXSkgPyAtMVxyXG5cdFx0OiAoZmluZFswXSA+IGdlblswXSkgPyAgMVxyXG5cdFx0OiAoZmluZFsxXSA8IGdlblsxXSkgPyAtMVxyXG5cdFx0OiAoZmluZFsxXSA+IGdlblsxXSkgPyAgMVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICAgICAgMFxyXG5cdFx0KVxyXG5cclxuZXhwb3J0IGdldE9yZ1BvcyA6PSAoXHJcblx0XHRoU3JjTWFwOiBSYXdTb3VyY2VNYXAsXHJcblx0XHRsaW5lOiBudW1iZXIsXHJcblx0XHRjb2w6IG51bWJlclxyXG5cdFx0KTogVE9yZ1BvcyA9PlxyXG5cclxuXHRsTWFwcGluZ3MgOj0gZ2V0TWFwcGluZ3MoaFNyY01hcC5tYXBwaW5ncylcclxuXHRhc3NlcnQgKGxNYXBwaW5ncy5sZW5ndGggPiAwKSwgXCJFbXB0eSBtYXBwaW5ncyBhcnJheVwiXHJcblx0bGV0IHBvcyA9IDAsIGVuZCA9IGxNYXBwaW5ncy5sZW5ndGggLSAxXHJcblx0d2hpbGUgKHBvcyA8PSBlbmQpXHJcblxyXG5cdFx0IyAtLS0gQ2FsY3VsYXRlIHRoZSBtaWRkbGUgaW5kZXhcclxuXHRcdG1pZCA6PSBNYXRoLmZsb29yKChwb3MgKyBlbmQpIC8gMilcclxuXHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA6PSBsTWFwcGluZ3NbbWlkXVxyXG5cdFx0c3dpdGNoIGNvbXBhcmUoW2xpbmUsIGNvbF0sIFt0c0xpbmUsIHRzQ29sXSlcclxuXHRcdFx0d2hlbiAwXHJcblx0XHRcdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cdFx0XHR3aGVuIC0xXHJcblx0XHRcdFx0ZW5kID0gbWlkIC0gMTtcclxuXHRcdFx0d2hlbiAxXHJcblx0XHRcdFx0cG9zID0gbWlkICsgMTtcclxuXHJcblx0IyAtLS0gSWYgdGhlIGxvb3AgZmluaXNoZXMsIHRoZSB0YXJnZXQgaXMgbm90IGluIHRoZSBhcnJheVxyXG5cdGlmIChwb3MgPCBsTWFwcGluZ3MubGVuZ3RoKVxyXG5cdFx0bGV0IFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3NdXHJcblx0XHRpZiAodHNMaW5lICE9IGxpbmUpIHx8ICh0c0NvbCAhPSBjb2wpXHJcblx0XHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA9IGxNYXBwaW5nc1twb3MtMV1cclxuXHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHRlbHNlXHJcblx0XHRsYXN0IDo9IGxNYXBwaW5ncy5hdCgtMSlcclxuXHRcdGFzc2VydCBkZWZpbmVkKGxhc3QpXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbGFzdFxyXG5cdFx0cmV0dXJuIFtvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNYXBwaW5ncyA6PSAoXHJcblx0XHRkYXRhOiBzdHJpbmcsXHJcblx0XHQpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGxNYXBwaW5nczogbnVtYmVyW11bXSA6PSBbXVxyXG5cdHZhciBzdW06IG51bWJlcltdID0gWzAsIDAsIDAsIDBdXHJcblx0Zm9yIGxpbmUsbGluZU51bSBvZiBkYXRhLnNwbGl0KFwiO1wiKVxyXG5cdFx0c3VtWzBdID0gMFxyXG5cdFx0ZGVjb2RlTGluZShsaW5lKS5mb3JFYWNoIChwKSA9PlxyXG5cdFx0XHRmb3IgKGkgb2YgWzAuLi5wLmxlbmd0aF0pXHJcblx0XHRcdFx0c3VtW2ldICs9IHBbaV1cclxuXHRcdFx0bE1hcHBpbmdzLnB1c2ggW2xpbmVOdW0sIHN1bVswXSwgc3VtWzFdLCBzdW1bMl0sIHN1bVszXV1cclxuXHRyZXR1cm4gbE1hcHBpbmdzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29kZUxpbmUgOj0gKGxpbmU6IHN0cmluZyk6IG51bWJlcltdW10gPT5cclxuXHJcblx0aWYgKGxpbmUgPT0gJycpXHJcblx0XHRyZXR1cm4gW11cclxuXHJcblx0cmV0dXJuIGZvciB0b2tlbiBvZiBsaW5lLnNwbGl0KCcsJylcclxuXHRcdGxPdXRwdXQ6IG51bWJlcltdIDo9IFtdXHJcblx0XHRsZXQgaSA9IDBcclxuXHRcdHdoaWxlIChpIDwgdG9rZW4ubGVuZ3RoKVxyXG5cdFx0XHRsZXQgdiA9IDAsIGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRpICs9IDFcclxuXHRcdFx0diB8PSAoZCAmIDMxKSAgICAgICAgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdGxldCBzaGlmdCA9IDVcclxuXHRcdFx0d2hpbGUgKGQgJiAzMikgICAgICAgICAjIHJlcGVhdCBpZiBoaWdoIGJpdCBvZiBkIGlzIHNldFxyXG5cdFx0XHRcdGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRcdGkgKz0gMVxyXG5cdFx0XHRcdHYgfD0gKGQgJiAzMSkgPDwgc2hpZnQgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdFx0c2hpZnQgKz0gNVxyXG5cdFx0XHRsT3V0cHV0LnB1c2godiAmIDEgPyAtKHYgPj4gMSkgOiB2ID4+IDEpICMgbG93IGJpdCBpcyBzaWduXHJcblx0XHRsT3V0cHV0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZyYW1lVHlwZSA9IChcclxuXHQnZXZhbCcgfFxyXG5cdCduYXRpdmUnIHxcclxuXHQnY29uc3RydWN0b3InIHxcclxuXHQnbWV0aG9kJyB8XHJcblx0J2Z1bmN0aW9uJyB8XHJcblx0J3NjcmlwdCcgfFxyXG5cdCd1bmtub3duJ1xyXG5cdClcclxuXHJcbmV4cG9ydCB0eXBlIFRTdGFja0ZyYW1lID0ge1xyXG5cdGk6IG51bWJlclxyXG5cdHR5cGU6IHN0cmluZ1xyXG5cdHNvdXJjZTogc3RyaW5nICAgICAgICAjIHJlbGF0aXZlIGZpbGUgcGF0aCBvciAndW5rbm93bidcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdG5hbWU6IHN0cmluZyAgICAgICAgICAjIG5hbWUgb2YgZnVuY3Rpb24gb3IgbWV0aG9kXHJcblx0b3JnU291cmNlPzogc3RyaW5nXHJcblx0b3JnTGluZT86IG51bWJlclxyXG5cdG9yZ0NvbD86IG51bWJlclxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsU3RhY2tGcmFtZXMgOj0gKFxyXG5cdFx0dHJhY2UgPSBmYWxzZVxyXG5cdFx0KTogVEl0ZXJhdG9yPFRTdGFja0ZyYW1lPiAtPlxyXG5cclxuXHRwcm9jZXNzLnNldFNvdXJjZU1hcHNFbmFibGVkKGZhbHNlKVxyXG5cdG9wZW5EZWJ1Z0ZpbGUgJ3N0YWNrJ1xyXG5cdGZtdCA6PSAobGluZTogbnVtYmVyLCBjb2w6IG51bWJlciwgc3JjOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBcIiN7c3ByaW50ZignJTNkJywgbGluZSl9ICN7c3ByaW50ZignJTNkJywgY29sKX0gI3tzcmN9XCJcclxuXHJcblx0dHJ5XHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdG9sZExpbWl0IDo9IEVycm9yLnN0YWNrVHJhY2VMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRQcmVwYXJlciA6PSBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSA5OVxyXG5cclxuXHRcdGxldCBwcmV2RnJhbWU6IFRTdGFja0ZyYW1lPyA9IHVuZGVmaW5lZFxyXG5cclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSAoZXJyb3IsIGxPcmdGcmFtZXMpID0+XHJcblxyXG5cdFx0XHRsZXQgbEZyYW1lczogVFN0YWNrRnJhbWVbXSA9IFtdXHJcblxyXG5cdFx0XHRmb3Igb3JnRnJhbWUsaSBvZiBsT3JnRnJhbWVzXHJcblxyXG5cdFx0XHRcdHNyYyA6PSBvcmdGcmFtZS5nZXRGaWxlTmFtZSgpICAgICMgLS0tIGEgZnVsbCBwYXRoXHJcblx0XHRcdFx0aWYgbm90ZGVmaW5lZChzcmMpIHx8IHNyYy5tYXRjaCgvLy9leHQgXFw6IGNsaSBcXC8gXFxkK190ZXN0XFwuanMvLy8pXHJcblx0XHRcdFx0XHRjb250aW51ZVxyXG5cclxuXHRcdFx0XHQjIC0tLSBUaGVzZSBhcmUgY29uc3RhbnRzXHJcblx0XHRcdFx0b3JnU291cmNlIDo9IG5vcm1hbGl6ZVBhdGggc3JjXHJcblx0XHRcdFx0b3JnTGluZSAgIDo9IG9yZ0ZyYW1lLmdldExpbmVOdW1iZXIoKVxyXG5cdFx0XHRcdG9yZ0NvbCAgICA6PSBvcmdGcmFtZS5nZXRDb2x1bW5OdW1iZXIoKVxyXG5cclxuXHRcdFx0XHREQkcgJy0nLnJlcGVhdCA2NFxyXG5cdFx0XHRcdERCRyBmbXQob3JnTGluZSwgb3JnQ29sLCBvcmdTb3VyY2UpXHJcblxyXG5cdFx0XHRcdCMgLS0tIFRoZXNlIGNhbiBiZSBvdmVyd3JpdHRlbiB3aGVuIHVzaW5nIHNvdXJjZSBtYXBzXHJcblx0XHRcdFx0bGV0IHNvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdGxldCBsaW5lICAgPSBvcmdMaW5lXHJcblx0XHRcdFx0bGV0IGNvbCAgICA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHRmdW5jdGlvbk5hbWUgOj0gb3JnRnJhbWUuZ2V0RnVuY3Rpb25OYW1lKClcclxuXHRcdFx0XHRtZXRob2ROYW1lICAgOj0gb3JnRnJhbWUuZ2V0TWV0aG9kTmFtZSgpXHJcblxyXG5cdFx0XHRcdCMgLS0tIGZvbGxvdyBzb3VyY2UgbWFwcyByZWN1cnNpdmVseVxyXG5cdFx0XHRcdGxldCBuZXdGaWxlUG9zID0gbWFwUG9zU3luYyh7c291cmNlLCBsaW5lLCBjb2x9KVxyXG5cdFx0XHRcdHdoaWxlIGRlZmluZWQobmV3RmlsZVBvcylcclxuXHRcdFx0XHRcdHNvdXJjZSA9IG5ld0ZpbGVQb3Muc291cmNlICAgIyAtLS0gYWxyZWFkeSBub3JtYWxpemVkXHJcblx0XHRcdFx0XHRsaW5lICAgPSBuZXdGaWxlUG9zLmxpbmVcclxuXHRcdFx0XHRcdGNvbCAgICA9IG5ld0ZpbGVQb3MuY29sXHJcblx0XHRcdFx0XHREQkcgZm10KGxpbmUsIGNvbCwgc291cmNlKVxyXG5cdFx0XHRcdFx0bmV3RmlsZVBvcyA9IG1hcFBvc1N5bmMobmV3RmlsZVBvcylcclxuXHJcblx0XHRcdFx0ZnJhbWU6IFRTdGFja0ZyYW1lIDo9IHtcclxuXHRcdFx0XHRcdGlcclxuXHRcdFx0XHRcdHR5cGU6IChcclxuXHRcdFx0XHRcdFx0ICBmdW5jdGlvbk5hbWUgICAgICAgICAgICAgPyAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRcdDogbWV0aG9kTmFtZSAgICAgICAgICAgICAgID8gJ21ldGhvZCdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc1RvcGxldmVsKCkgICAgPyAnc2NyaXB0J1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzRXZhbCgpICAgICAgICA/ICdldmFsJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzTmF0aXZlKCkgICAgICA/ICduYXRpdmUnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNDb25zdHJ1Y3RvcigpID8gJ2NvbnN0cnVjdG9yJ1xyXG5cdFx0XHRcdFx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmtub3duJ1xyXG5cdFx0XHRcdFx0XHQpXHJcblx0XHRcdFx0XHRzb3VyY2VcclxuXHRcdFx0XHRcdGxpbmVcclxuXHRcdFx0XHRcdGNvbFxyXG5cdFx0XHRcdFx0bmFtZTogZnVuY3Rpb25OYW1lIHx8IG1ldGhvZE5hbWUgfHwgJydcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0IyAtLS0gQWRkIG9yaWdpbmFsIHNvdXJjZSwgbGluZSAmIGNvbCBpZiBtYXBwZWRcclxuXHRcdFx0XHRpZiAoc291cmNlICE9IG9yZ1NvdXJjZSlcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ1NvdXJjZSA9IG9yZ1NvdXJjZVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnTGluZSA9IG9yZ0xpbmVcclxuXHRcdFx0XHRcdGZyYW1lLm9yZ0NvbCA9IG9yZ0NvbFxyXG5cclxuXHRcdFx0XHQjIC0tLSBmaXggYSBidWcgaW4gdGhlIFY4IGVuZ2luZSB3aGVyZSBjYWxscyBpbnNpZGUgYVxyXG5cdFx0XHRcdCMgICAgIHRvcCBsZXZlbCBhbm9ueW1vdXMgZnVuY3Rpb24gaXMgcmVwb3J0ZWQgYXNcclxuXHRcdFx0XHQjICAgICBiZWluZyBvZiB0eXBlICdzY3JpcHQnXHJcblxyXG5cdFx0XHRcdGlmIHByZXZGcmFtZSAmJiAoZnJhbWUudHlwZSA9PSAnc2NyaXB0JykgJiYgKHByZXZGcmFtZS50eXBlID09ICdzY3JpcHQnKVxyXG5cdFx0XHRcdFx0cHJldkZyYW1lLnR5cGUgPSAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUubmFtZSA9ICc8YW5vbj4nXHJcblxyXG5cdFx0XHRcdGlmIHRyYWNlXHJcblx0XHRcdFx0XHRkdW1wRnJhbWUgZnJhbWUsICdPUkcgRlJBTUUnXHJcblx0XHRcdFx0cHJldkZyYW1lID0gZnJhbWVcclxuXHRcdFx0XHRsRnJhbWVzLnB1c2ggZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblx0XHRmb3IgZnJhbWUgb2YgbFN0YWNrXHJcblx0XHRcdHlpZWxkIGZyYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tyZWQoJ0VSUk9SIGluIGFsbFN0YWNrRnJhbWVzOicpfSAje2dldEVyclN0cihlcnIpfVwiXHJcblx0XHRyZXR1cm5cclxuXHRmaW5hbGx5XHJcblx0XHRjbG9zZURlYnVnRmlsZSAnc3RhY2snXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE15Q2FsbGVyIDo9ICgpOiBUU3RhY2tGcmFtZT8gPT5cclxuXHJcblx0Zm9yIGZyYW1lLGkgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0aWYgKGkgPT0gMylcclxuXHRcdFx0cmV0dXJuIGZyYW1lXHJcblx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGR1bXBGcmFtZSA6PSAoXHJcblx0XHRmcmFtZTogVFN0YWNrRnJhbWUsXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0ZSQU1FJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7aSwgdHlwZSwgc291cmNlLCBsaW5lLCBjb2wsIG5hbWV9IDo9IGZyYW1lXHJcblx0dHlwZVN0ciA6PSBzcHJpbnRmKCclLThzJywgdHlwZSlcclxuXHRuYW1lU3RyIDo9IHNwcmludGYoJyUtMTZzJywgbmFtZSlcclxuXHRpZiBzb3VyY2VcclxuXHRcdExPRyBcIiN7bGFiZWx9WyN7aX1dOiAje3R5cGVTdHJ9ICN7bmFtZVN0cn0gI3tzb3VyY2V9OiN7bGluZX06I3tjb2x9XCJcclxuXHRlbHNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9IDxub25lPlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEVyclN0ciA6PSAoZXJyOiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG5cdFx0cmV0dXJuIGVyclxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yKVxyXG5cdFx0ZXJybXNnIDo9IGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdFx0cmV0dXJuIFwiI3tjb2xvcml6ZSgnQXNzZXJ0aW9uRXJyb3I6ICcsICdyZWQnKX0je2Vycm1zZ31cIlxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKVxyXG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiBcIlNlcmlvdXMgRXJyb3JcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBUUlkgOj0gKGZ1bmM6ICgpID0+IHZvaWQpOiB2b2lkID0+XHJcblxyXG5cdHRyeVxyXG5cdFx0ZnVuYygpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjcm9hayBlcnJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUHJlZGljYXRlPFQ9dW5rbm93bj4gPSAoaXRlbTogVCkgPT4gYm9vbGVhblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Jvb2wgOj0gKHg6IHVua25vd24pOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBub3Qgbm90IHhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55T2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgY2hlY2tGdW5jKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbE9mIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdLFxyXG5cdFx0Y2hlY2tGdW5jOiBUUHJlZGljYXRlPFQ+ID0gKHgpID0+IHRvQm9vbCh4KVxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdCBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5pc0FzeW5jR2VuZXJhdG9yRnVuY3Rpb24gOj0gKFxyXG5cdFx0eDogdW5rbm93blxyXG5cdFx0KTogeCBpcyBBc3luY0dlbmVyYXRvckZ1bmN0aW9uID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgICAodHlwZW9mIHggPT0gJ2Z1bmN0aW9uJylcclxuXHRcdCYmICh4LnRvU3RyaW5nKCkubWF0Y2goL1xcYmFzeW5jXFxzK2Z1bmN0aW9uXFxzKlxcKi8pICE9IG51bGwpXHJcblx0XHQpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbSA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSB8IFRJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEl0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxWYWx1ZXNGcm9tQXN5bmMgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD4gfCBUQXN5bmNJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8VD4gLT5cclxuXHJcblx0aXRlciA6PSBBcnJheS5pc0FycmF5KGxJdGVtcykgPyBsSXRlbXMudmFsdWVzKCkgOiBsSXRlbXNcclxuXHRsb29wXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGF3YWl0IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdGJyZWFrXHJcblx0XHRlbHNlXHJcblx0XHRcdHlpZWxkIHZhbHVlXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlIDo9IChzdHI6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0RGVuby5zdGRvdXQud3JpdGVTeW5jIGVuY29kZShzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlbG4gOj0gKHN0cjogc3RyaW5nID0gJycpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIHN0ciArICdcXG4nXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyU2NyZWVuIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlICdcXHgxYltIXFx4MWJbMkonXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlc2V0TGluZSA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBcIlxceDFiWzJLXCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJQcmV2aW91c0xpbmVzIDo9IChudW1MaW5lczogbnVtYmVyKTogdm9pZCA9PlxyXG5cdCMgXFx4MWJbbkEgbW92ZXMgdGhlIGN1cnNvciB1cCAnbicgbGluZXNcclxuXHQjIFxcciBtb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmVcclxuXHQjIFxceDFiW0sgY2xlYXJzIHRoZSBsaW5lIGZyb20gdGhlIGN1cnNvciB0byB0aGUgZW5kIChvcHRpb25hbCwgYnV0IGdvb2QgcHJhY3RpY2UpXHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGUoXCJcXHgxYlsje251bUxpbmVzfUFcXHJcXHgxYltLXCIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVENvbG9yID0gJ2N5YW4nfCdibHVlJ3wnYmxhY2snfCdyZWQnfCdncmVlbid8J21hZ2VudGEnfCd5ZWxsb3cnXHJcblxyXG5leHBvcnQgaXNDb2xvciA6PSAoc3RyOiBzdHJpbmcpOiBzdHIgaXMgVENvbG9yID0+XHJcblxyXG5cdHJldHVybiBbJ2N5YW4nLCdibHVlJywnYmxhY2snLCdyZWQnLCdncmVlbicsJ21hZ2VudGEnLCd5ZWxsb3cnXS5pbmNsdWRlcyBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY29sb3JpemUgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRjb2xvcjogc3RyaW5nP1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQoY29sb3IpIHx8IG5vdCBpc0NvbG9yKGNvbG9yKVxyXG5cdFx0cmV0dXJuIHN0clxyXG5cdHN3aXRjaCBjb2xvclxyXG5cdFx0d2hlbiAnY3lhbicgICAgdGhlbiByZXR1cm4gY3lhbihzdHIpXHJcblx0XHR3aGVuICdibHVlJyAgICB0aGVuIHJldHVybiBibHVlKHN0cilcclxuXHRcdHdoZW4gJ2JsYWNrJyAgIHRoZW4gcmV0dXJuIGJsYWNrKHN0cilcclxuXHRcdHdoZW4gJ3JlZCcgICAgIHRoZW4gcmV0dXJuIHJlZChzdHIpXHJcblx0XHR3aGVuICdncmVlbicgICB0aGVuIHJldHVybiBncmVlbihzdHIpXHJcblx0XHR3aGVuICdtYWdlbnRhJyB0aGVuIHJldHVybiBtYWdlbnRhKHN0cilcclxuXHRcdHdoZW4gJ3llbGxvdycgIHRoZW4gcmV0dXJuIHllbGxvdyhzdHIpXHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGhDb2xvcnMgaXMgezx3b3JkPjogPGNvbG9yPiwgLi4uIH1cclxuXHJcbnR5cGUgVENvbG9yTWFwID0ge1xyXG5cdFt3b3JkOiBzdHJpbmddOiBUQ29sb3JcclxuXHR9XHJcblxyXG5leHBvcnQgd2l0aENvbG9ycyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZ1xyXG5cdFx0aENvbG9yczogVENvbG9yTWFwXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0Zm9yIHdvcmQgb2YgT2JqZWN0LmtleXMoaENvbG9ycylcclxuXHRcdGNvbG9yIDo9IGhDb2xvcnNbd29yZF1cclxuXHRcdHN0ciA9IHN0ci5yZXBsYWNlQWxsKHdvcmQsIGNvbG9yaXplKHdvcmQsIGNvbG9yKSlcclxuXHRyZXR1cm4gc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29sb3JpemUgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHJpcEFuc2lDb2RlKHN0cilcclxuIl19