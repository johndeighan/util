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
import {delay} from "@std/async/delay"

import {
	curLogLevel, LOG, DBG, openDebugFile, closeDebugFile,
	} from 'logger'

export {deepEqual}
export var deepCopy = structuredClone
export var sleep = delay

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

export function* getEmptyIterator<T=unknown>(): TIterator<T> { () => {
	return
} }

// ---------------------------------------------------------------------------

export async function* getEmptyAsyncIterator<T=unknown>(): TAsyncIterator<T> { () => {
	return
} }

// ---------------------------------------------------------------------------

export const pass = (): void => {}
	// do nothing

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
		await sleep(100)
	}
	return
}

// ---------------------------------------------------------------------------
//             LOGGING
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
			LOG(frameStr(frame))
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
	const destms = getFileStats(destPath).mtime
	assert(defined(destms), "destms not defined")
	const srcms  = getFileStats(srcPath).mtime
	assert(defined(srcms), "srcms not defined")
	return (destms > srcms)
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
					LOG(frameStr(frame, 'ORG FRAME'))
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

export const frameStr = (
		frame: TStackFrame,
		label: string = 'FRAME'
		): string => {

	const {i, type, source, line, col, name} = frame
	const typeStr = sprintf('%-8s', type)
	const nameStr = sprintf('%-16s', name)
	if (source) {
		return `${label}[${i}]: ${typeStr} ${nameStr} ${source}:${line}:${col}`
	}
	else {
		return `${label}[${i}]: ${typeStr} ${nameStr} <none>`
	}
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5saWIudHMiLCJzb3VyY2VzIjpbImJhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQ2xDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWM7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUMzQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDL0QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFB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RCxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQ3BFLEFBQUEsRUFBRSxNQUFNLENBQUEsQUFBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDOUMsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxJQUFJLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQztHQUFDLENBQUE7QUFDNUMsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ2xCLEFBQUE7QUFDQSxBQUFBLENBQUMsMkRBQTBEO0FBQzNELEFBQUEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUM1QixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7QUFDdkUsQUFBQSxFQUFFLEdBQUcsQ0FBQSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkMsQUFBQSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLEMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUN0RSxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQ0FBQTtBQUMxQyxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQU0sTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsQUFBQSxFQUFFLE1BQU0sQ0FBQSxBQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFBO0FBQzFDLEFBQUEsRUFBa0QsTUFBaEQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUMxRCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDO0NBQUMsQztBQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3ZCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFB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QUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2pELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFBO0FBQzlDLEFBQUEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFBLEFBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDO0FBQUEsQ0FBQTtBQUM5QyIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBiYXNlLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHByb2Nlc3MgZnJvbSBcIm5vZGU6cHJvY2Vzc1wiXHJcbmltcG9ydCB7XHJcblx0Y3lhbiwgYmx1ZSwgYmxhY2ssIHJlZCwgZ3JlZW4sIG1hZ2VudGEsIHllbGxvdyxcclxuXHRzdHJpcEFuc2lDb2RlLFxyXG5cdH0gZnJvbSAnQHN0ZC9mbXQvY29sb3JzJ1xyXG5pbXBvcnQge0Fzc2VydGlvbkVycm9yfSBmcm9tICdAc3RkL2Fzc2VydCdcclxuaW1wb3J0IHtTb3VyY2VNYXBDb25zdW1lcn0gZnJvbSAnQG1vemlsbGEvc291cmNlLW1hcCdcclxuaW1wb3J0IHtcclxuXHRyZXNvbHZlLCByZWxhdGl2ZSwgaXNBYnNvbHV0ZSwgZnJvbUZpbGVVcmwsIGRpcm5hbWUsXHJcblx0fSBmcm9tICdAc3RkL3BhdGgnXHJcbmltcG9ydCB7VGV4dExpbmVTdHJlYW19IGZyb20gJ0BzdGQvc3RyZWFtcydcclxuaW1wb3J0IGRlZXBFcXVhbCBmcm9tICducG0tZmFzdC1kZWVwLWVxdWFsJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmMsIGVtcHR5RGlyU3luYywgZW5zdXJlRGlyU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtzcHJpbnRmfSBmcm9tICdAc3RkL2ZtdC9wcmludGYnXHJcbmltcG9ydCB7ZXhwYW5kR2xvYlN5bmN9IGZyb20gJ0BzdGQvZnMvZXhwYW5kLWdsb2InXHJcbmltcG9ydCB7ZGVsYXl9IGZyb20gXCJAc3RkL2FzeW5jL2RlbGF5XCJcclxuXHJcbmltcG9ydCB7XHJcblx0Y3VyTG9nTGV2ZWwsIExPRywgREJHLCBvcGVuRGVidWdGaWxlLCBjbG9zZURlYnVnRmlsZSxcclxuXHR9IGZyb20gJ2xvZ2dlcidcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5leHBvcnQgZGVlcENvcHkgPSBzdHJ1Y3R1cmVkQ2xvbmVcclxuZXhwb3J0IHNsZWVwID0gZGVsYXlcclxuXHJcbm15ZGlyIDo9IGRpcm5hbWUoZnJvbUZpbGVVcmwoaW1wb3J0Lm1ldGEudXJsKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRTdHJpbmdTb3VyY2UgPSBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IEJ1ZmZlclNvdXJjZSB8IHN0cmluZ1xyXG5cclxuZW5jb2RlciA6PSBuZXcgVGV4dEVuY29kZXIoKVxyXG5leHBvcnQgZW5jb2RlIDo9ICh4OiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiA9PlxyXG5cdHJldHVybiBlbmNvZGVyLmVuY29kZSB4XHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlcigpXHJcbmV4cG9ydCBkZWNvZGUgOj0gKHg6IFRTdHJpbmdTb3VyY2UpOiBzdHJpbmcgPT5cclxuXHRyZXR1cm4gKHR5cGVvZiB4ID09ICdzdHJpbmcnKSA/IHggOiBkZWNvZGVyLmRlY29kZSh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRJdGVyYXRvcjxUSW4sIFRPdXQ9dm9pZCwgVEFjYz12b2lkPiA9IEdlbmVyYXRvcjxUSW4sIFRPdXQsIFRBY2M+XHJcbmV4cG9ydCB0eXBlIFRBc3luY0l0ZXJhdG9yPFRJbiwgVE91dD12b2lkLCBUQWNjPXZvaWQ+ID0gQXN5bmNHZW5lcmF0b3I8VEluLCBUT3V0LCBUQWNjPlxyXG5leHBvcnQgdHlwZSBUTm9uRnVuY3Rpb248VD11bmtub3duPiA9IEV4Y2x1ZGU8VCwgRnVuY3Rpb24+XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uKiBnZXRFbXB0eUl0ZXJhdG9yPFQ9dW5rbm93bj4oKTogVEl0ZXJhdG9yPFQ+ID0+XHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uKiBnZXRFbXB0eUFzeW5jSXRlcmF0b3I8VD11bmtub3duPigpOiBUQXN5bmNJdGVyYXRvcjxUPiA9PlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXNzIDo9ICgpOiB2b2lkID0+XHJcblx0IyBkbyBub3RoaW5nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHVuZGVmIDo9IHVuZGVmaW5lZFxyXG50eXBlIFREZWZpbmVkID0gTm9uTnVsbGFibGU8dW5rbm93bj5cclxudHlwZSBUTm90RGVmaW5lZCA9IG51bGwgfCB1bmRlZmluZWRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGVmaW5lZCA6PSAoeDogdW5rbm93bik6IHggaXMgVERlZmluZWQgPT5cclxuXHJcblx0cmV0dXJuICh4ICE9IHVuZGVmKSAmJiAoeCAhPSBudWxsKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlEZWZpbmVkIDo9ICguLi5sSXRlbXM6IHVua25vd25bXSk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBkZWZpbmVkKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vdGRlZmluZWQgOj0gKHg6IHVua25vd24pOiB4IGlzIFROb3REZWZpbmVkID0+XHJcblxyXG5cdHJldHVybiAoeCA9PSB1bmRlZikgfHwgKHggPT0gbnVsbClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55Tm90RGVmaW5lZCA6PSAoLi4ubEl0ZW1zOiB1bmtub3duW10pOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgbm90ZGVmaW5lZChpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBtYXggOj0gKHg6IG51bWJlciwgeTogbnVtYmVyKTogbnVtYmVyID0+XHJcblxyXG5cdHJldHVybiAoeCA+IHkpID8geCA6IHlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmFuZ2UgOj0gKG46IG51bWJlcik6IFRJdGVyYXRvcjxudW1iZXI+IC0+XHJcblxyXG5cdGZvciBpIG9mIFswLi4ubl1cclxuXHRcdHlpZWxkIGlcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsQ2hhcnMgOj0gKHN0cjogc3RyaW5nKTogVEl0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0Zm9yIGNoIG9mIHN0clxyXG5cdFx0eWllbGQgY2hcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBhbGxDaGFyc0FzeW5jIDo9IChzdHI6IHN0cmluZyk6IFRBc3luY0l0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0Zm9yIGNoIG9mIHN0clxyXG5cdFx0eWllbGQgY2hcclxuXHRcdGF3YWl0IHNsZWVwIDEwMFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICAgICAgICBMT0dHSU5HXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFROZXZlckZ1bmMgPSAoZXJyOiBzdHJpbmcpID0+IG5ldmVyXHJcblxyXG5leHBvcnQgY3JvYWs6IFROZXZlckZ1bmMgOj0gKFxyXG5cdFx0ZXJyTXNnOiBzdHJpbmdcclxuXHRcdCk6IG5ldmVyID0+XHJcblxyXG5cdGlmIChjdXJMb2dMZXZlbCgpID09ICd0ZXN0aW5nJylcclxuXHRcdCMgLS0tIGFsbG93cyB0aGUgZXJyb3IgdG8gYmUgY2F1Z2h0IGFuZCBoYW5kbGVkIG9yIGlnbm9yZWRcclxuXHRcdHRocm93IG5ldyBFcnJvcihlcnJNc2cpXHJcblx0ZWxzZVxyXG5cdFx0Y29uc29sZS5lcnJvciByZWQoJ0NST0FLJykgKyAnOiAnICsgZXJyTXNnXHJcblx0XHRjb25zb2xlLmVycm9yIFwiLS0tLS0gIFNUQUNLIC0tLS0tXCJcclxuXHRcdGZvciBmcmFtZSBvZiBhbGxTdGFja0ZyYW1lcygpXHJcblx0XHRcdExPRyBmcmFtZVN0cihmcmFtZSlcclxuXHRcdERlbm8uZXhpdCgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1hdGNoZXMgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmdcclxuXHRcdHJlZ2V4cDogUmVnRXhwXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiByZWdleHAudGVzdChzdHIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgICBGaWxlIFN5c3RlbSBVdGlsc1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbmRGaWxlIDo9IChcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdHJvb3Q6IHN0cmluZyA9IERlbm8uY3dkKClcclxuXHRcdCk6IHN0cmluZz8gPT5cclxuXHJcblx0YXNzZXJ0IG5vdCByb290LmVuZHNXaXRoKCcvJyksIFwiQmFkIHJvb3Q6ICN7cm9vdH1cIlxyXG5cclxuXHRsZXQgZm91bmRQYXRoOiBzdHJpbmc/ID0gdW5kZWZcclxuXHRmb3Ige3BhdGh9IG9mIGV4cGFuZEdsb2JTeW5jIFwiI3tyb290fS8qKi8je2ZpbGVOYW1lfVwiLCB7XHJcblx0XHRcdHJvb3RcclxuXHRcdFx0aW5jbHVkZURpcnM6IGZhbHNlXHJcblx0XHRcdGNhbm9uaWNhbGl6ZTogZmFsc2VcclxuXHRcdFx0fVxyXG5cdFx0aWYgZGVmaW5lZChmb3VuZFBhdGgpXHJcblx0XHRcdGNyb2FrIFwiTXVsdGlwbGUgZmlsZXMgbmFtZWQgI3tmaWxlTmFtZX0gZm91bmQgaW4gI3tyb290fVwiXHJcblx0XHRlbHNlXHJcblx0XHRcdGZvdW5kUGF0aCA9IG5vcm1hbGl6ZVBhdGggcGF0aFxyXG5cdHJldHVybiBmb3VuZFBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbm9ybWFsaXplUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRuZXdwYXRoIDo9IHBhdGgucmVwbGFjZUFsbCAnXFxcXCcsICcvJ1xyXG5cdGlmIChuZXdwYXRoLmNoYXJBdCgxKSA9PSAnOicpXHJcblx0XHRyZXR1cm4gbmV3cGF0aC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5ld3BhdGguc3Vic3RyaW5nKDEpXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIG5ld3BhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmlsZUV4dCA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGxNYXRjaGVzIDo9IHBhdGgubWF0Y2goL1xcLlteXFwuXSskLylcclxuXHRyZXR1cm4gbE1hdGNoZXMgPyBsTWF0Y2hlc1swXSA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdpdGhFeHQgOj0gKHBhdGg6IHN0cmluZywgZXh0OiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IGV4dC5zdGFydHNXaXRoKCcuJyksIFwiQmFkIGZpbGUgZXh0ZW5zaW9uOiAje2V4dH1cIlxyXG5cdHBvcyA6PSBwYXRoLmxhc3RJbmRleE9mICcuJ1xyXG5cdGFzc2VydCAocG9zID49IDApLCBcInBhdGggY29udGFpbnMgbm8gcGVyaW9kOiAje3BhdGh9XCJcclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCBwYXRoLnN1YnN0cmluZygwLCBwb3MpICsgZXh0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvUmVsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRyb290OiBzdHJpbmcgPSBEZW5vLmN3ZCgpXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVsYXRpdmUocm9vdCwgcGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9GdWxsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbm9ybWFsaXplUGF0aCByZXNvbHZlKCcuJywgcGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNGdWxsUGF0aCA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIGlzQWJzb2x1dGUocGF0aClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbmV3ZXJEZXN0RmlsZUV4aXN0cyA6PSAoXHJcblx0XHRzcmNQYXRoOiBzdHJpbmcsXHJcblx0XHRkZXN0UGF0aDogc3RyaW5nICAgICMgLS0tIGNhbiBiZSBhIGZpbGUgZXh0ZW5zaW9uXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdCMgLS0tIHNvdXJjZSBmaWxlIG11c3QgZXhpc3RcclxuXHRhc3NlcnQgZXhpc3RzU3luYyhzcmNQYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7c3JjUGF0aH1cIlxyXG5cclxuXHQjIC0tLSBhbGxvdyBwYXNzaW5nIGEgZmlsZSBleHRlbnNpb24gZm9yIDJuZCBhcmd1bWVudFxyXG5cdGlmIGRlc3RQYXRoLnN0YXJ0c1dpdGgoJy4nKVxyXG5cdFx0ZGVzdFBhdGggPSB3aXRoRXh0KHNyY1BhdGgsIGRlc3RQYXRoKVxyXG5cclxuXHRpZiBub3QgZXhpc3RzU3luYyhkZXN0UGF0aClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0YXNzZXJ0IGRlZmluZWQoZGVzdG1zKSwgXCJkZXN0bXMgbm90IGRlZmluZWRcIlxyXG5cdHNyY21zICA6PSBnZXRGaWxlU3RhdHMoc3JjUGF0aCkubXRpbWVcclxuXHRhc3NlcnQgZGVmaW5lZChzcmNtcyksIFwic3JjbXMgbm90IGRlZmluZWRcIlxyXG5cdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZpbGVTdGF0cyA9IHtcclxuXHRpc0ZpbGU6IGJvb2xlYW5cclxuXHRpc0RpcmVjdG9yeTogYm9vbGVhblxyXG5cdG10aW1lOiBEYXRlP1xyXG5cdH1cclxuXHJcbmV4cG9ydCBnZXRGaWxlU3RhdHMgOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBURmlsZVN0YXRzID0+XHJcblxyXG5cdGhTdGF0cyA6PSBEZW5vLnN0YXRTeW5jIHBhdGhcclxuXHRyZXR1cm4ge1xyXG5cdFx0aXNGaWxlOiAgICAgIGhTdGF0cy5pc0ZpbGVcclxuXHRcdGlzRGlyZWN0b3J5OiBoU3RhdHMuaXNEaXJlY3RvcnlcclxuXHRcdG10aW1lOiAgICAgICBoU3RhdHMubXRpbWUgfHwgdW5kZWZcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBhbGxMaW5lc0luRmlsZSA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRBc3luY0l0ZXJhdG9yPHN0cmluZz4gLT5cclxuXHJcblx0ZmlsZSA6PSBhd2FpdCBEZW5vLm9wZW4gcGF0aFxyXG5cdHN0cmVhbSA6PSAoZmlsZS5yZWFkYWJsZVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHREZWNvZGVyU3RyZWFtKCkpXHJcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dExpbmVTdHJlYW0oKSlcclxuXHRcdFx0KVxyXG5cdGZvciBhd2FpdCBsaW5lIG9mIHN0cmVhbVxyXG5cdFx0eWllbGQgbGluZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1rVGVtcEZpbGUgOj0gKFxyXG5cdFx0c3VmZml4OiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gYXdhaXQgRGVuby5tYWtlVGVtcEZpbGUge3N1ZmZpeH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBta1RlbXBGaWxlU3luYyA6PSAoXHJcblx0XHRzdWZmaXg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBEZW5vLm1ha2VUZW1wRmlsZVN5bmMge3N1ZmZpeH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQXNzZXJ0RnVuYyA9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c6IHN0cmluZ1xyXG5cdFx0KSA9PiBhc3NlcnRzIGNvbmRcclxuXHJcbmV4cG9ydCBhc3NlcnQ6IFRBc3NlcnRGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c6IHN0cmluZ1xyXG5cdFx0KTogYXNzZXJ0cyBjb25kID0+XHJcblxyXG5cdGlmIG5vdCBjb25kXHJcblx0XHRjcm9hayBtc2dcclxuXHRyZXR1cm5cclxuXHJcbnR5cGUgVE9idmlvdXNseUZ1bmMgPSAoXHJcblx0XHRjb25kOiB1bmtub3duLFxyXG5cdFx0Y29uZFN0cj86IHN0cmluZ1xyXG5cdFx0KSA9PiBhc3NlcnRzIGNvbmRcclxuXHJcbmV4cG9ydCBvYnZpb3VzbHk6IFRPYnZpb3VzbHlGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd25cclxuXHRcdGNvbmRTdHI6IHN0cmluZyA9ICcnXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIFwiI3tjb25kU3RyIHx8ICdjb25kaXRpb24nfSBub3Qgb2J2aW91c2x5IHRydWVcIlxyXG5cdFx0RGVuby5leGl0KClcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBSYXdTb3VyY2VNYXAgPSB7XHJcblx0dmVyc2lvbjogbnVtYmVyOyAgICAgICAgICAgIyBUaGUgdmVyc2lvbiBvZiB0aGUgc291cmNlIG1hcCBzcGVjICh1c3VhbGx5IDMpXHJcblx0ZmlsZTogc3RyaW5nOyAgICAgICAgICAgICAgIyBUaGUgZ2VuZXJhdGVkIGZpbGUgdGhpcyBtYXAgaXMgYXNzb2NpYXRlZCB3aXRoXHJcblx0c291cmNlczogc3RyaW5nW107ICAgICAgICAgIyBBcnJheSBvZiBVUkxzIHRvIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXNcclxuXHRuYW1lczogc3RyaW5nW107ICAgICAgICAgICAjIEFycmF5IG9mIGlkZW50aWZpZXJzIChuYW1lcykgdXNlZCBpbiB0aGUgbWFwcGluZ3NcclxuXHRzb3VyY2VSb290Pzogc3RyaW5nOyAgICAgICAjIE9wdGlvbmFsOiBVUkwgcm9vdCBmb3IgdGhlIHNvdXJjZXNcclxuXHRzb3VyY2VzQ29udGVudD86IHN0cmluZ1tdOyAjIENvbnRlbnQgb2YgdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlcyAob3B0aW9uYWwpXHJcblx0bWFwcGluZ3M6IHN0cmluZzsgICAgICAgICAgIyBUaGUgYWN0dWFsIGVuY29kZWQgbWFwcGluZ3MgKEJhc2U2NCBWTFEpXHJcblx0fVxyXG5cclxuZXhwb3J0IHR5cGUgVEZpbGVQb3NpdGlvbiA9IHtcclxuXHRzb3VyY2U6IHN0cmluZ1xyXG5cdGxpbmU6IG51bWJlclxyXG5cdGNvbDogbnVtYmVyXHJcblx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1hcFBvcyA6PSAoXHJcblx0ZmlsZVBvczogVEZpbGVQb3NpdGlvblxyXG5cdCk6IFRGaWxlUG9zaXRpb24/ID0+XHJcblxyXG5cdHtzb3VyY2UsIGxpbmUsIGNvbH0gOj0gZmlsZVBvc1xyXG5cdGNvbnRlbnRzIDo9IGF3YWl0IERlbm8ucmVhZFRleHRGaWxlIHNvdXJjZVxyXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwIGNvbnRlbnRzXHJcblx0aWYgZGVmaW5lZChoU3JjTWFwKVxyXG5cdFx0Y29uc3VtZXIgOj0gYXdhaXQgbmV3IFNvdXJjZU1hcENvbnN1bWVyKGhTcmNNYXApXHJcblx0XHRwb3MgOj0gY29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7bGluZSwgY29sdW1uOiBjb2x9KVxyXG5cdFx0cmV0dXJuIHBvcyBhcyBURmlsZVBvc2l0aW9uXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1hcFBvc1N5bmMgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRbZmlsZU51bSwgc3JjTGluZSwgc3JjQ29sXSA6PSBnZXRPcmdQb3MgaFNyY01hcCwgbGluZSwgY29sXHJcblx0XHRmaWxlTmFtZSA6PSBoU3JjTWFwLnNvdXJjZXNbZmlsZU51bV1cclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHNvdXJjZTogbm9ybWFsaXplUGF0aCBcIiN7ZGlybmFtZShzb3VyY2UpfS8je2ZpbGVOYW1lfVwiXHJcblx0XHRcdGxpbmU6IHNyY0xpbmVcclxuXHRcdFx0Y29sOiBzcmNDb2xcclxuXHRcdFx0fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBleHRyYWN0U291cmNlTWFwIDo9IChcclxuXHRcdGNvbnRlbnRzOiBzdHJpbmdcclxuXHRcdCk6IFtzdHJpbmcsIFJhd1NvdXJjZU1hcD9dID0+XHJcblxyXG5cdGxNYXRjaGVzIDo9IGNvbnRlbnRzLm1hdGNoIC8vL15cclxuXHRcdFx0KC4qKVxyXG5cdFx0XHRcXC8gXFwvIFxcIyBcXHMrXHJcblx0XHRcdHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvblxcL2pzb247XHJcblx0XHRcdCg/OmNoYXJzZXQ9dXRmLTg7KT9cclxuXHRcdFx0YmFzZTY0LFxyXG5cdFx0XHQoLispXHJcblx0XHRcdCQvLy9zXHJcblx0aWYgKGxNYXRjaGVzID09IG51bGwpXHJcblx0XHRyZXR1cm4gW2NvbnRlbnRzLCB1bmRlZl1cclxuXHRbXywgY29kZSwgaFNyY01hcFN0cl0gOj0gbE1hdGNoZXNcclxuXHRoU3JjTWFwIDo9IEpTT04ucGFyc2UoYXRvYihoU3JjTWFwU3RyKSkgYXMgUmF3U291cmNlTWFwXHJcblx0e2ZpbGV9IDo9IGhTcmNNYXBcclxuXHRoU3JjTWFwLmZpbGUgPSB0b1JlbFBhdGgoZmlsZSlcclxuXHRoU3JjTWFwLnNvdXJjZXMgPSBmb3IgcGF0aCBvZiBoU3JjTWFwLnNvdXJjZXNcclxuXHRcdHRvUmVsUGF0aChwYXRoKVxyXG5cdHJldHVybiBbY29kZSwgaFNyY01hcF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRPcmdQb3MgPSBbZmlsZU51bTogbnVtYmVyLCBsaW5lOiBudW1iZXIsIGNvbDogbnVtYmVyXVxyXG50eXBlIFRDb21wYXJlUmVzdWx0ID0gLTEgfCAwIHwgMVxyXG5cclxuY29tcGFyZSA6PSAoXHJcblx0XHRmaW5kOiBbbnVtYmVyLCBudW1iZXJdLFxyXG5cdFx0Z2VuOiAgW251bWJlciwgbnVtYmVyXVxyXG5cdFx0KTogVENvbXBhcmVSZXN1bHQgPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgKGZpbmRbMF0gPCBnZW5bMF0pID8gLTFcclxuXHRcdDogKGZpbmRbMF0gPiBnZW5bMF0pID8gIDFcclxuXHRcdDogKGZpbmRbMV0gPCBnZW5bMV0pID8gLTFcclxuXHRcdDogKGZpbmRbMV0gPiBnZW5bMV0pID8gIDFcclxuXHRcdDogICAgICAgICAgICAgICAgICAgICAgIDBcclxuXHRcdClcclxuXHJcbmV4cG9ydCBnZXRPcmdQb3MgOj0gKFxyXG5cdFx0aFNyY01hcDogUmF3U291cmNlTWFwLFxyXG5cdFx0bGluZTogbnVtYmVyLFxyXG5cdFx0Y29sOiBudW1iZXJcclxuXHRcdCk6IFRPcmdQb3MgPT5cclxuXHJcblx0bE1hcHBpbmdzIDo9IGdldE1hcHBpbmdzKGhTcmNNYXAubWFwcGluZ3MpXHJcblx0YXNzZXJ0IChsTWFwcGluZ3MubGVuZ3RoID4gMCksIFwiRW1wdHkgbWFwcGluZ3MgYXJyYXlcIlxyXG5cdGxldCBwb3MgPSAwLCBlbmQgPSBsTWFwcGluZ3MubGVuZ3RoIC0gMVxyXG5cdHdoaWxlIChwb3MgPD0gZW5kKVxyXG5cclxuXHRcdCMgLS0tIENhbGN1bGF0ZSB0aGUgbWlkZGxlIGluZGV4XHJcblx0XHRtaWQgOj0gTWF0aC5mbG9vcigocG9zICsgZW5kKSAvIDIpXHJcblx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gOj0gbE1hcHBpbmdzW21pZF1cclxuXHRcdHN3aXRjaCBjb21wYXJlKFtsaW5lLCBjb2xdLCBbdHNMaW5lLCB0c0NvbF0pXHJcblx0XHRcdHdoZW4gMFxyXG5cdFx0XHRcdHJldHVybiBbb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF1cclxuXHRcdFx0d2hlbiAtMVxyXG5cdFx0XHRcdGVuZCA9IG1pZCAtIDE7XHJcblx0XHRcdHdoZW4gMVxyXG5cdFx0XHRcdHBvcyA9IG1pZCArIDE7XHJcblxyXG5cdCMgLS0tIElmIHRoZSBsb29wIGZpbmlzaGVzLCB0aGUgdGFyZ2V0IGlzIG5vdCBpbiB0aGUgYXJyYXlcclxuXHRpZiAocG9zIDwgbE1hcHBpbmdzLmxlbmd0aClcclxuXHRcdGxldCBbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gPSBsTWFwcGluZ3NbcG9zXVxyXG5cdFx0aWYgKHRzTGluZSAhPSBsaW5lKSB8fCAodHNDb2wgIT0gY29sKVxyXG5cdFx0XHRbdHNMaW5lLCB0c0NvbCwgb3JnRmlsZU51bSwgY2l2ZXRMaW5lLCBjaXZldENvbF0gPSBsTWFwcGluZ3NbcG9zLTFdXHJcblx0XHRyZXR1cm4gW29yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdXHJcblx0ZWxzZVxyXG5cdFx0bGFzdCA6PSBsTWFwcGluZ3MuYXQoLTEpXHJcblx0XHRhc3NlcnQgZGVmaW5lZChsYXN0KSwgXCJsYXN0IG5vdCBkZWZpbmVkXCJcclxuXHRcdFt0c0xpbmUsIHRzQ29sLCBvcmdGaWxlTnVtLCBjaXZldExpbmUsIGNpdmV0Q29sXSA6PSBsYXN0XHJcblx0XHRyZXR1cm4gW29yZ0ZpbGVOdW0sIGNpdmV0TGluZSwgY2l2ZXRDb2xdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE1hcHBpbmdzIDo9IChcclxuXHRcdGRhdGE6IHN0cmluZyxcclxuXHRcdCk6IG51bWJlcltdW10gPT5cclxuXHJcblx0bE1hcHBpbmdzOiBudW1iZXJbXVtdIDo9IFtdXHJcblx0dmFyIHN1bTogbnVtYmVyW10gPSBbMCwgMCwgMCwgMF1cclxuXHRmb3IgbGluZSxsaW5lTnVtIG9mIGRhdGEuc3BsaXQoXCI7XCIpXHJcblx0XHRzdW1bMF0gPSAwXHJcblx0XHRkZWNvZGVMaW5lKGxpbmUpLmZvckVhY2ggKHApID0+XHJcblx0XHRcdGZvciAoaSBvZiBbMC4uLnAubGVuZ3RoXSlcclxuXHRcdFx0XHRzdW1baV0gKz0gcFtpXVxyXG5cdFx0XHRsTWFwcGluZ3MucHVzaCBbbGluZU51bSwgc3VtWzBdLCBzdW1bMV0sIHN1bVsyXSwgc3VtWzNdXVxyXG5cdHJldHVybiBsTWFwcGluZ3NcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGVjb2RlTGluZSA6PSAobGluZTogc3RyaW5nKTogbnVtYmVyW11bXSA9PlxyXG5cclxuXHRpZiAobGluZSA9PSAnJylcclxuXHRcdHJldHVybiBbXVxyXG5cclxuXHRyZXR1cm4gZm9yIHRva2VuIG9mIGxpbmUuc3BsaXQoJywnKVxyXG5cdFx0bE91dHB1dDogbnVtYmVyW10gOj0gW11cclxuXHRcdGxldCBpID0gMFxyXG5cdFx0d2hpbGUgKGkgPCB0b2tlbi5sZW5ndGgpXHJcblx0XHRcdGxldCB2ID0gMCwgZCA9IGF0b2IoXCJBQUFcIiArIHRva2VuW2ldKS5jaGFyQ29kZUF0KDIpXHJcblx0XHRcdGkgKz0gMVxyXG5cdFx0XHR2IHw9IChkICYgMzEpICAgICAgICAgICMgcHV0IGxvd2VzdCA1IGJpdHMgb2YgZCBpbnRvIHZcclxuXHRcdFx0bGV0IHNoaWZ0ID0gNVxyXG5cdFx0XHR3aGlsZSAoZCAmIDMyKSAgICAgICAgICMgcmVwZWF0IGlmIGhpZ2ggYml0IG9mIGQgaXMgc2V0XHJcblx0XHRcdFx0ZCA9IGF0b2IoXCJBQUFcIiArIHRva2VuW2ldKS5jaGFyQ29kZUF0KDIpXHJcblx0XHRcdFx0aSArPSAxXHJcblx0XHRcdFx0diB8PSAoZCAmIDMxKSA8PCBzaGlmdCAgICMgcHV0IGxvd2VzdCA1IGJpdHMgb2YgZCBpbnRvIHZcclxuXHRcdFx0XHRzaGlmdCArPSA1XHJcblx0XHRcdGxPdXRwdXQucHVzaCh2ICYgMSA/IC0odiA+PiAxKSA6IHYgPj4gMSkgIyBsb3cgYml0IGlzIHNpZ25cclxuXHRcdGxPdXRwdXRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURnJhbWVUeXBlID0gKFxyXG5cdCdldmFsJyB8XHJcblx0J25hdGl2ZScgfFxyXG5cdCdjb25zdHJ1Y3RvcicgfFxyXG5cdCdtZXRob2QnIHxcclxuXHQnZnVuY3Rpb24nIHxcclxuXHQnc2NyaXB0JyB8XHJcblx0J3Vua25vd24nXHJcblx0KVxyXG5cclxuZXhwb3J0IHR5cGUgVFN0YWNrRnJhbWUgPSB7XHJcblx0aTogbnVtYmVyXHJcblx0dHlwZTogc3RyaW5nXHJcblx0c291cmNlOiBzdHJpbmcgICAgICAgICMgcmVsYXRpdmUgZmlsZSBwYXRoIG9yICd1bmtub3duJ1xyXG5cdGxpbmU6IG51bWJlclxyXG5cdGNvbDogbnVtYmVyXHJcblx0bmFtZTogc3RyaW5nICAgICAgICAgICMgbmFtZSBvZiBmdW5jdGlvbiBvciBtZXRob2RcclxuXHRvcmdTb3VyY2U/OiBzdHJpbmdcclxuXHRvcmdMaW5lPzogbnVtYmVyXHJcblx0b3JnQ29sPzogbnVtYmVyXHJcblx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxTdGFja0ZyYW1lcyA6PSAoXHJcblx0XHR0cmFjZSA9IGZhbHNlXHJcblx0XHQpOiBUSXRlcmF0b3I8VFN0YWNrRnJhbWU+IC0+XHJcblxyXG5cdHByb2Nlc3Muc2V0U291cmNlTWFwc0VuYWJsZWQoZmFsc2UpXHJcblx0b3BlbkRlYnVnRmlsZSAnc3RhY2snXHJcblx0Zm10IDo9IChcclxuXHRcdFx0bGluZTogbnVtYmVyLFxyXG5cdFx0XHRjb2w6IG51bWJlcixcclxuXHRcdFx0c3JjOiBzdHJpbmdcclxuXHRcdFx0KTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gXCIje3NwcmludGYoJyUzZCcsIGxpbmUpfSAje3NwcmludGYoJyUzZCcsIGNvbCl9ICN7c3JjfVwiXHJcblxyXG5cdHRyeVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRMaW1pdCA6PSBFcnJvci5zdGFja1RyYWNlTGltaXRcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0b2xkUHJlcGFyZXIgOj0gRXJyb3IucHJlcGFyZVN0YWNrVHJhY2VcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gOTlcclxuXHJcblx0XHRsZXQgcHJldkZyYW1lOiBUU3RhY2tGcmFtZT8gPSB1bmRlZmluZWRcclxuXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdEVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gKGVycm9yLCBsT3JnRnJhbWVzKSA9PlxyXG5cclxuXHRcdFx0bGV0IGxGcmFtZXM6IFRTdGFja0ZyYW1lW10gPSBbXVxyXG5cclxuXHRcdFx0Zm9yIG9yZ0ZyYW1lLGkgb2YgbE9yZ0ZyYW1lc1xyXG5cclxuXHRcdFx0XHRzcmMgOj0gb3JnRnJhbWUuZ2V0RmlsZU5hbWUoKSAgICAjIC0tLSBhIGZ1bGwgcGF0aFxyXG5cdFx0XHRcdGlmIG5vdGRlZmluZWQoc3JjKSB8fCBzcmMubWF0Y2goLy8vZXh0IFxcOiBjbGkgXFwvIFxcZCtfdGVzdFxcLmpzLy8vKVxyXG5cdFx0XHRcdFx0Y29udGludWVcclxuXHJcblx0XHRcdFx0IyAtLS0gVGhlc2UgYXJlIGNvbnN0YW50c1xyXG5cdFx0XHRcdG9yZ1NvdXJjZSA6PSBub3JtYWxpemVQYXRoIHNyY1xyXG5cdFx0XHRcdG9yZ0xpbmUgICA6PSBvcmdGcmFtZS5nZXRMaW5lTnVtYmVyKCkgfHwgMFxyXG5cdFx0XHRcdG9yZ0NvbCAgICA6PSBvcmdGcmFtZS5nZXRDb2x1bW5OdW1iZXIoKSB8fCAwXHJcblxyXG5cdFx0XHRcdERCRyAnLScucmVwZWF0IDY0XHJcblx0XHRcdFx0REJHIGZtdChvcmdMaW5lLCBvcmdDb2wsIG9yZ1NvdXJjZSlcclxuXHJcblx0XHRcdFx0IyAtLS0gVGhlc2UgY2FuIGJlIG92ZXJ3cml0dGVuIHdoZW4gdXNpbmcgc291cmNlIG1hcHNcclxuXHRcdFx0XHRsZXQgc291cmNlID0gb3JnU291cmNlXHJcblx0XHRcdFx0bGV0IGxpbmUgICA9IG9yZ0xpbmVcclxuXHRcdFx0XHRsZXQgY29sICAgID0gb3JnQ29sXHJcblxyXG5cdFx0XHRcdGZ1bmN0aW9uTmFtZSA6PSBvcmdGcmFtZS5nZXRGdW5jdGlvbk5hbWUoKVxyXG5cdFx0XHRcdG1ldGhvZE5hbWUgICA6PSBvcmdGcmFtZS5nZXRNZXRob2ROYW1lKClcclxuXHJcblx0XHRcdFx0IyAtLS0gZm9sbG93IHNvdXJjZSBtYXBzIHJlY3Vyc2l2ZWx5XHJcblx0XHRcdFx0bGV0IG5ld0ZpbGVQb3MgPSBtYXBQb3NTeW5jKHtzb3VyY2UsIGxpbmUsIGNvbH0pXHJcblx0XHRcdFx0d2hpbGUgZGVmaW5lZChuZXdGaWxlUG9zKVxyXG5cdFx0XHRcdFx0c291cmNlID0gbmV3RmlsZVBvcy5zb3VyY2UgICAjIC0tLSBhbHJlYWR5IG5vcm1hbGl6ZWRcclxuXHRcdFx0XHRcdGxpbmUgICA9IG5ld0ZpbGVQb3MubGluZVxyXG5cdFx0XHRcdFx0Y29sICAgID0gbmV3RmlsZVBvcy5jb2xcclxuXHRcdFx0XHRcdERCRyBmbXQobGluZSwgY29sLCBzb3VyY2UpXHJcblx0XHRcdFx0XHRuZXdGaWxlUG9zID0gbWFwUG9zU3luYyhuZXdGaWxlUG9zKVxyXG5cclxuXHRcdFx0XHRmcmFtZTogVFN0YWNrRnJhbWUgOj0ge1xyXG5cdFx0XHRcdFx0aVxyXG5cdFx0XHRcdFx0dHlwZTogKFxyXG5cdFx0XHRcdFx0XHQgIGZ1bmN0aW9uTmFtZSAgICAgICAgICAgICA/ICdmdW5jdGlvbidcclxuXHRcdFx0XHRcdFx0OiBtZXRob2ROYW1lICAgICAgICAgICAgICAgPyAnbWV0aG9kJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzVG9wbGV2ZWwoKSAgICA/ICdzY3JpcHQnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNFdmFsKCkgICAgICAgID8gJ2V2YWwnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNOYXRpdmUoKSAgICAgID8gJ25hdGl2ZSdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc0NvbnN0cnVjdG9yKCkgPyAnY29uc3RydWN0b3InXHJcblx0XHRcdFx0XHRcdDogICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3Vua25vd24nXHJcblx0XHRcdFx0XHRcdClcclxuXHRcdFx0XHRcdHNvdXJjZVxyXG5cdFx0XHRcdFx0bGluZVxyXG5cdFx0XHRcdFx0Y29sXHJcblx0XHRcdFx0XHRuYW1lOiBmdW5jdGlvbk5hbWUgfHwgbWV0aG9kTmFtZSB8fCAnJ1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQjIC0tLSBBZGQgb3JpZ2luYWwgc291cmNlLCBsaW5lICYgY29sIGlmIG1hcHBlZFxyXG5cdFx0XHRcdGlmIChzb3VyY2UgIT0gb3JnU291cmNlKVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnU291cmNlID0gb3JnU291cmNlXHJcblx0XHRcdFx0XHRmcmFtZS5vcmdMaW5lID0gb3JnTGluZVxyXG5cdFx0XHRcdFx0ZnJhbWUub3JnQ29sID0gb3JnQ29sXHJcblxyXG5cdFx0XHRcdCMgLS0tIGZpeCBhIGJ1ZyBpbiB0aGUgVjggZW5naW5lIHdoZXJlIGNhbGxzIGluc2lkZSBhXHJcblx0XHRcdFx0IyAgICAgdG9wIGxldmVsIGFub255bW91cyBmdW5jdGlvbiBpcyByZXBvcnRlZCBhc1xyXG5cdFx0XHRcdCMgICAgIGJlaW5nIG9mIHR5cGUgJ3NjcmlwdCdcclxuXHJcblx0XHRcdFx0aWYgcHJldkZyYW1lICYmIChmcmFtZS50eXBlID09ICdzY3JpcHQnKSAmJiAocHJldkZyYW1lLnR5cGUgPT0gJ3NjcmlwdCcpXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUudHlwZSA9ICdmdW5jdGlvbidcclxuXHRcdFx0XHRcdHByZXZGcmFtZS5uYW1lID0gJzxhbm9uPidcclxuXHJcblx0XHRcdFx0aWYgdHJhY2VcclxuXHRcdFx0XHRcdExPRyBmcmFtZVN0cihmcmFtZSwgJ09SRyBGUkFNRScpXHJcblx0XHRcdFx0cHJldkZyYW1lID0gZnJhbWVcclxuXHRcdFx0XHRsRnJhbWVzLnB1c2ggZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblx0XHRmb3IgZnJhbWUgb2YgbFN0YWNrXHJcblx0XHRcdHlpZWxkIGZyYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tyZWQoJ0VSUk9SIGluIGFsbFN0YWNrRnJhbWVzOicpfSAje2dldEVyclN0cihlcnIpfVwiXHJcblx0XHRyZXR1cm5cclxuXHRmaW5hbGx5XHJcblx0XHRjbG9zZURlYnVnRmlsZSAnc3RhY2snXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE15Q2FsbGVyIDo9ICgpOiBUU3RhY2tGcmFtZT8gPT5cclxuXHJcblx0Zm9yIGZyYW1lLGkgb2YgYWxsU3RhY2tGcmFtZXMoKVxyXG5cdFx0aWYgKGkgPT0gMylcclxuXHRcdFx0cmV0dXJuIGZyYW1lXHJcblx0cmV0dXJuIHVuZGVmXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZyYW1lU3RyIDo9IChcclxuXHRcdGZyYW1lOiBUU3RhY2tGcmFtZSxcclxuXHRcdGxhYmVsOiBzdHJpbmcgPSAnRlJBTUUnXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0e2ksIHR5cGUsIHNvdXJjZSwgbGluZSwgY29sLCBuYW1lfSA6PSBmcmFtZVxyXG5cdHR5cGVTdHIgOj0gc3ByaW50ZignJS04cycsIHR5cGUpXHJcblx0bmFtZVN0ciA6PSBzcHJpbnRmKCclLTE2cycsIG5hbWUpXHJcblx0aWYgc291cmNlXHJcblx0XHRyZXR1cm4gXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9ICN7c291cmNlfToje2xpbmV9OiN7Y29sfVwiXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIFwiI3tsYWJlbH1bI3tpfV06ICN7dHlwZVN0cn0gI3tuYW1lU3RyfSA8bm9uZT5cIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRFcnJTdHIgOj0gKGVycjogdW5rbm93bik6IHN0cmluZyA9PlxyXG5cclxuXHRpZiAodHlwZW9mIGVyciA9PSAnc3RyaW5nJylcclxuXHRcdHJldHVybiBlcnJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBBc3NlcnRpb25FcnJvcilcclxuXHRcdGVycm1zZyA6PSBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRcdHJldHVybiBcIiN7Y29sb3JpemUoJ0Fzc2VydGlvbkVycm9yOiAnLCAncmVkJyl9I3tlcnJtc2d9XCJcclxuXHRlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcilcclxuXHRcdHJldHVybiBlcnIubWVzc2FnZSB8fCAnPE5vIG1lc3NhZ2UgaW4gRXJyb3Igb2JqZWN0PidcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gXCJTRVJJT1VTIEVSUk9SXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUUHJlZGljYXRlPFQ9dW5rbm93bj4gPSAoaXRlbTogVCkgPT4gYm9vbGVhblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Jvb2wgOj0gKHg6IHVua25vd24pOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBub3Qgbm90IHhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55T2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgY2hlY2tGdW5jKGl0ZW0pXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbE9mIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdLFxyXG5cdFx0Y2hlY2tGdW5jOiBUUHJlZGljYXRlPFQ+ID0gKHgpID0+IHRvQm9vbCh4KVxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdCBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5pc0FzeW5jR2VuZXJhdG9yRnVuY3Rpb24gOj0gKFxyXG5cdFx0eDogdW5rbm93blxyXG5cdFx0KTogeCBpcyBBc3luY0dlbmVyYXRvckZ1bmN0aW9uID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgICAodHlwZW9mIHggPT0gJ2Z1bmN0aW9uJylcclxuXHRcdCYmICh4LnRvU3RyaW5nKCkubWF0Y2goL1xcYmFzeW5jXFxzK2Z1bmN0aW9uXFxzKlxcKi8pICE9IG51bGwpXHJcblx0XHQpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbSA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSB8IFRJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEl0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxWYWx1ZXNGcm9tQXN5bmMgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD4gfCBUQXN5bmNJdGVyYXRvcjxUPlxyXG5cdFx0KTogVEFzeW5jSXRlcmF0b3I8VD4gLT5cclxuXHJcblx0aXRlciA6PSBBcnJheS5pc0FycmF5KGxJdGVtcykgPyBsSXRlbXMudmFsdWVzKCkgOiBsSXRlbXNcclxuXHRsb29wXHJcblx0XHR7dmFsdWUsIGRvbmV9IDo9IGF3YWl0IGl0ZXIubmV4dCgpXHJcblx0XHRpZiBkb25lXHJcblx0XHRcdGJyZWFrXHJcblx0XHRlbHNlXHJcblx0XHRcdHlpZWxkIHZhbHVlXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlIDo9IChzdHI6IHN0cmluZyk6IHZvaWQgPT5cclxuXHJcblx0RGVuby5zdGRvdXQud3JpdGVTeW5jIGVuY29kZShzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlbG4gOj0gKHN0cjogc3RyaW5nID0gJycpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIHN0ciArICdcXG4nXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyU2NyZWVuIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlICdcXHgxYltIXFx4MWJbMkonXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlc2V0TGluZSA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBcIlxceDFiWzJLXCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJQcmV2aW91c0xpbmVzIDo9IChudW1MaW5lczogbnVtYmVyKTogdm9pZCA9PlxyXG5cdCMgXFx4MWJbbkEgbW92ZXMgdGhlIGN1cnNvciB1cCAnbicgbGluZXNcclxuXHQjIFxcciBtb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmVcclxuXHQjIFxceDFiW0sgY2xlYXJzIHRoZSBsaW5lIGZyb20gdGhlIGN1cnNvciB0byB0aGUgZW5kIChvcHRpb25hbCwgYnV0IGdvb2QgcHJhY3RpY2UpXHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGUoXCJcXHgxYlsje251bUxpbmVzfUFcXHJcXHgxYltLXCIpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVENvbG9yID0gJ2N5YW4nfCdibHVlJ3wnYmxhY2snfCdyZWQnfCdncmVlbid8J21hZ2VudGEnfCd5ZWxsb3cnXHJcblxyXG5leHBvcnQgaXNDb2xvciA6PSAoc3RyOiBzdHJpbmcpOiBzdHIgaXMgVENvbG9yID0+XHJcblxyXG5cdHJldHVybiBbJ2N5YW4nLCdibHVlJywnYmxhY2snLCdyZWQnLCdncmVlbicsJ21hZ2VudGEnLCd5ZWxsb3cnXS5pbmNsdWRlcyBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY29sb3JpemUgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRjb2xvcjogc3RyaW5nP1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGlmIG5vdGRlZmluZWQoY29sb3IpIHx8IG5vdCBpc0NvbG9yKGNvbG9yKVxyXG5cdFx0cmV0dXJuIHN0clxyXG5cdHN3aXRjaCBjb2xvclxyXG5cdFx0d2hlbiAnY3lhbicgICAgdGhlbiByZXR1cm4gY3lhbihzdHIpXHJcblx0XHR3aGVuICdibHVlJyAgICB0aGVuIHJldHVybiBibHVlKHN0cilcclxuXHRcdHdoZW4gJ2JsYWNrJyAgIHRoZW4gcmV0dXJuIGJsYWNrKHN0cilcclxuXHRcdHdoZW4gJ3JlZCcgICAgIHRoZW4gcmV0dXJuIHJlZChzdHIpXHJcblx0XHR3aGVuICdncmVlbicgICB0aGVuIHJldHVybiBncmVlbihzdHIpXHJcblx0XHR3aGVuICdtYWdlbnRhJyB0aGVuIHJldHVybiBtYWdlbnRhKHN0cilcclxuXHRcdHdoZW4gJ3llbGxvdycgIHRoZW4gcmV0dXJuIHllbGxvdyhzdHIpXHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGhDb2xvcnMgaXMgezx3b3JkPjogPGNvbG9yPiwgLi4uIH1cclxuXHJcbnR5cGUgVENvbG9yTWFwID0ge1xyXG5cdFt3b3JkOiBzdHJpbmddOiBUQ29sb3JcclxuXHR9XHJcblxyXG5leHBvcnQgd2l0aENvbG9ycyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZ1xyXG5cdFx0aENvbG9yczogVENvbG9yTWFwXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0Zm9yIHdvcmQgb2YgT2JqZWN0LmtleXMoaENvbG9ycylcclxuXHRcdGNvbG9yIDo9IGhDb2xvcnNbd29yZF1cclxuXHRcdHN0ciA9IHN0ci5yZXBsYWNlQWxsKHdvcmQsIGNvbG9yaXplKHdvcmQsIGNvbG9yKSlcclxuXHRyZXR1cm4gc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29sb3JpemUgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHJpcEFuc2lDb2RlKHN0cilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNDaGluZXNlQ2hhciA6PSAoc3RyOiBzdHJpbmcpOiBib29sZWFuID0+XHJcblxyXG5cdGFzc2VydCAoc3RyLmxlbmd0aCA9PSAxKSwgXCJOb3QgYSBzaW5nbGUgY2hhclwiXHJcblx0cmV0dXJuIHRvQm9vbCBzdHIubWF0Y2goL15bXFx1NGUwMC1cXHU5ZmZmXSQvdSlcclxuIl19