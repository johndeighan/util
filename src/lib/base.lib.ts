"use strict";
// base.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	cyan, blue, black, red, green, magenta, yellow,
	stripAnsiCode,
	} from '@std/fmt/colors'
import {AssertionError} from '@std/assert'
import {SourceMapConsumer} from '@mozilla/source-map'
import {resolve, relative, isAbsolute} from '@std/path'
import {TextLineStream} from '@std/streams'
import deepEqual from 'npm-fast-deep-equal'
import {existsSync, emptyDirSync, ensureDirSync} from '@std/fs'
import {sprintf} from '@std/fmt/printf'
import {expandGlobSync} from '@std/fs/expand-glob'

const encoder = new TextEncoder()

export {deepEqual}
export var deepCopy = structuredClone

// ---------------------------------------------------------------------------

export type TIterator<T, U=void, V=void> = Generator<T, U, V>
export type TAsyncIterator<T, U=void, V=void> = AsyncGenerator<T, U, V>
export type TNonFunction<T=unknown> = Exclude<T, Function>

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
//             LOGGING
// ---------------------------------------------------------------------------

let debugFilePath: (string | undefined) = undef
let indentLevel = 0
let lLogLines: string[] = []

export const INDENT = Symbol('indent')
export const UNDENT = Symbol('undent')

export type TLogLevel = 'silent' | 'info' | 'debug'
let lLogLevels: TLogLevel[] = ['info']

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

export const openDebugFile = (stub: string): void => {

	const debugFilePath = `src/logs/${stub}.log`
	return
}

// ---------------------------------------------------------------------------

export const closeDebugFile = (stub: string): void => {

	debugFilePath = undef
	return
}

// ---------------------------------------------------------------------------

export const appendDebugFile = (
		...lItems: unknown[]
		): void => {

	if (defined(debugFilePath)) {
		for (const item of lItems) {
			Deno.writeTextFileSync(debugFilePath, String(item) + "\n", {
				append: true
				})
		}
	}
	return
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

	if (curLogLevel() === 'debug') {
		LOG(...lItems)
		if (defined(debugFilePath)) {
			appendDebugFile(...lItems)
		}
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
		label: string = 'ERROR'
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
//              File System Utils
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
		cond: unknown
		): asserts cond => {

	if (!cond) {
		croak("condition obviously not true")
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

const mapPos = async (
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

const mapPosSync = (
	filePos: TFilePosition
	): (TFilePosition | undefined) => {

	const {source, line, col} = filePos
	const contents = Deno.readTextFileSync(source)
	const [code, hSrcMap] = extractSourceMap(contents)
	if (defined(hSrcMap)) {
		const [fileNum, srcLine, srcCol] = orgPos(hSrcMap, line, col)
		return {
			source: hSrcMap.sources[fileNum],
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

export const orgPos = (
		hSrcMap: RawSourceMap,
		findLine: number,
		findCol: number
		): TOrgPos => {

	const lMappings = getMappings(hSrcMap.mappings)
	assert((lMappings.length > 0), "Empty mappings array")
	let pos = 0, end = lMappings.length - 1
	while (pos <= end) {

		// --- Calculate the middle index
		const mid = Math.floor((pos + end) / 2)
		const [genLine, genCol, orgFile, orgLine, orgCol] = lMappings[mid]
		switch(compare([findLine, findCol], [genLine, genCol])) {
			case 0: {
				return [orgFile, orgLine, orgCol]
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
		const usePos = (pos === 0) ? pos : pos-1
		const [genLine, genCol, orgFile, orgLine, orgCol] = lMappings[usePos]
		return [orgFile, orgLine, orgCol]
	}
	else {
		const last = lMappings.at(-1)
		assert(defined(last))
		const [genLine, genCol, orgFile, orgLine, orgCol] = last
		return [orgFile, orgLine, orgCol]
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
	}

// ---------------------------------------------------------------------------

export const allStackFrames = function*(
		trace = false
		): TIterator<TStackFrame> {

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

			const results2=[];let i4 = 0;for (const orgFrame of lOrgFrames) {const i = i4++;
				// --- These can be overwritten when using source maps
				let source   = orgFrame.getFileName()
				if (source) {
					source = normalizePath(source)
				}
				let line     = orgFrame.getLineNumber()
				let col      = orgFrame.getColumnNumber()

				const functionName = orgFrame.getFunctionName()
				const methodName   = orgFrame.getMethodName()

				// --- if it's a function in a *.ts file,
				//     attempt to use source map
				if (source) {
					if (source.match(/ext\:cli\/\d+_test\.js/)) {
						continue
					}

					// --- HACK, which hopefully we'll eventually remove
					if (source.includes('src/lib/src/lib/')) {
						source = source.replace('src/lib/src/lib/', 'src/lib/')
					}
					if (source.includes('src/test/src/test/')) {
						source = source.replace('src/test/src/test/', 'src/test/')
					}
					if (source.includes('src/.temp/src/.temp/')) {
						source = source.replace('src/.temp/src/.temp/', 'src/.temp/')
					}

					const newFilePos = mapPosSync({source, line, col})
					if (defined(newFilePos)) {
						source = newFilePos.source
						line   = newFilePos.line
						col    = newFilePos.col
					}
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
					source: source ? toRelPath(source) : '',
					line,
					col,
					name: functionName || methodName || ''
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
				results2.push(frame)
			};const lFrames: TStackFrame[] =results2

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
//       mapper()
// ---------------------------------------------------------------------------

type TMapper<TIn, TAccum extends TNonFunction> = (
	x: TIn,
	acc: TAccum,
	i: number
	) => TAccum

type TAsyncMapper<TIn, TAccum extends TNonFunction> = (
	x: TIn,
	acc: TAccum,
	i: number
	) => Promise<TAccum>

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

// --- Variant 2, only accumulator
//     NOT ASYNC
export function mapper<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  TIn[] | TIterator<TIn>,
		acc: TAccum,
		mapFunc: TMapper<TIn, TAccum>         // plain function
		): TAccum

// --- Variant 5, possibly async input, only accumulator
//     ASYNC
export function mapper<TIn, TOut, TAccum extends TNonFunction>(
		iter: TIn[] | TIterator<TIn> | TAsyncIterator<TIn>,
		acc: TAccum,
		mapFunc: TAsyncMapper<TIn, TAccum> | TMapper<TIn, TAccum>
		): Promise<TAccum>

export function mapper<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  TIn[] | TIterator<TIn> | TAsyncIterator<TIn>,
		acc: TAccum,
		mapFunc: TAsyncMapper<TIn, TAccum> | TMapper<TIn, TAccum>
		): TAccum | Promise<TAccum> {

	if ((Symbol.asyncIterator in lItems) || isAsyncGeneratorFunction(mapFunc)) {
		// @ts-ignore
		return mapperv2(lItems, acc, mapFunc)
	}
	else {
		// @ts-ignore
		return mapperv1(lItems, acc, mapFunc)
	}
}

// ---------------------------------------------------------------------------
// --- Variant 1, only accumulator, no iterator

function mapperv1<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  TIn[] | TIterator<TIn>,
		acc: TAccum,
		mapFunc: TMapper<TIn, TAccum>
		): TAccum {

	let i5 = 0;for (const value of allValuesFrom(lItems)) {const i = i5++;
		acc = mapFunc(value, acc, i)
	}
	return acc
}

// ---------------------------------------------------------------------------
// --- Variant 5, async input, only accumulator
// ASYNC

async function mapperv2<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  TIn[] | TIterator<TIn> | TAsyncIterator<TIn>,
		acc: TAccum,
		mapFunc: TMapper<TIn, TAccum> | TAsyncMapper<TIn, TAccum>
		):AutoPromise<(TAccum | undefined)> {

	let i6 = 0;for await (const value of allValuesFromAsync(lItems)) {const i = i6++;
		acc = await mapFunc(value, acc, i)
	}
	return Promise.resolve(acc)
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

	Deno.stdout.writeSync(encoder.encode(str))
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

	Deno.stdout.writeSync(encoder.encode(`\x1b[${numLines}A\r\x1b[K`))
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjXFxsaWJcXGJhc2UubGliLnRzIiwic291cmNlcyI6WyJzcmMvbGliL2Jhc2UubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hELENBQUMsYUFBYSxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN6QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWE7QUFDMUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQjtBQUNyRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDdkQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjO0FBQzNDLEFBQUEsQUFBQSxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQy9ELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3ZDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCO0FBQ2xELEFBQUE7QUFDQSxBQUFBLEFBQU8sTUFBUCxPQUFP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QUMsQ0FBQztBQUNyQyxHQUFHLENBQUM7QUFDSixBQUFBLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUEsQ0FBQSxDQUFBO0FBQzNCLEFBQUEsRUFBRSxLQUFLLENBQUMsSTtDQUFJLENBQUE7QUFDWixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLO0FBQzVCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLEMsTUFBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxNQUFNO0FBQ2hCLEVBQUUsQ0FBQyxDLEMsVyxDQUFDLEFBQUMsTSxDQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQSxBQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ3hDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLFFBQU87QUFDUCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBZSxNQUFkLGNBQWMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUMxQixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsTUFBTTtBQUNoQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQSxBQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxB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QUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0IsRUFBRSxDQUFDLHVCQUF1QixDQUFDO0FBQzNCLEVBQUUsQztBQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNsQixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDbkIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU07QUFDakIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZixBQUFBO0FBQ0EsQUFBQSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQztBQUMzQyxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFBO0FBQ3RELEFBQUEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDeEMsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtBQUNuQixBQUFBO0FBQ0EsQUFBQSxFQUFFLGlDQUFnQztBQUNsQyxBQUFBLEVBQUssTUFBSCxHQUFHLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEMsQUFBQSxFQUE2QyxNQUEzQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQy9ELEFBQUEsRUFBRSxNQUFNLENBQUEsQUFBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDeEQsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ1QsQUFBQSxJQUFJLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQztHQUFDLENBQUE7QUFDckMsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDVCxBQUFBLElBQUksR0FBRyxDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPO0dBQUEsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ2xCLEFBQUE7QUFDQSxBQUFBLENBQUMsMkRBQTBEO0FBQzNELEFBQUEsQ0FBQyxH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LENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBLEM7Q0FBQSxDQUFBO0FBQzNELEFBQUEsQ0FBQyxNQUFNLENBQUMsUztBQUFTLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDO0NBQUMsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDLEMsQyxDLEUsQyxLLEMsUSxHLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3BDLEFBQUEsRUFBbUIsTUFBakIsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3pCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ1gsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUE7QUFDMUIsQUFBQSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFD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QUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSxDQUFtQyxNQUFsQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLO0FBQzVDLEFBQUEsQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNqQyxBQUFBLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDbEMsQUFBQSxDQUFDLEdBQUcsQ0FBQSxNQUFNLENBQUEsQ0FBQSxDQUFBO0FBQ1YsQUFBQSxFQUFFLEdBQUcsQ0FBQSxBQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUN0RSxBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsR0FBRyxDQUFBLEFBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQztDQUFBLENBQUE7QUFDcEQsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFB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SUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3pDLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUE7QUFDSixBQUFBLEVBQUUsSUFBSSxDQUFDLEM7Q0FBQyxDQUFBO0FBQ1IsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUE7QUFDVixBQUFBLEVBQUUsS0FBSyxDQUFBLEFBQUMsR0FBRyxDO0NBQUEsQztBQUFBLENBQUE7QUFDWCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDLENBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU87QUFDeEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3pDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUksQ0FBSSxDO0FBQUMsQ0FBQTtBQUNqQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLENBQUMsQyxDQUFDLENBQUMsQ0FBQztBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNkLEFBQUEsRUFBRSxTQUFTLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDN0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFB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QyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3hCLEFBQUEsRUFBRSxHQUFHLEMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDO0NBQUMsQ0FBQTtBQUNuRCxBQUFBLENBQUMsTUFBTSxDQUFDLEc7QUFBRyxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEM7QUFBQyxDQUFBO0FBQzFCIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGJhc2UubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge1xyXG5cdGN5YW4sIGJsdWUsIGJsYWNrLCByZWQsIGdyZWVuLCBtYWdlbnRhLCB5ZWxsb3csXHJcblx0c3RyaXBBbnNpQ29kZSxcclxuXHR9IGZyb20gJ0BzdGQvZm10L2NvbG9ycydcclxuaW1wb3J0IHtBc3NlcnRpb25FcnJvcn0gZnJvbSAnQHN0ZC9hc3NlcnQnXHJcbmltcG9ydCB7U291cmNlTWFwQ29uc3VtZXJ9IGZyb20gJ0Btb3ppbGxhL3NvdXJjZS1tYXAnXHJcbmltcG9ydCB7cmVzb2x2ZSwgcmVsYXRpdmUsIGlzQWJzb2x1dGV9IGZyb20gJ0BzdGQvcGF0aCdcclxuaW1wb3J0IHtUZXh0TGluZVN0cmVhbX0gZnJvbSAnQHN0ZC9zdHJlYW1zJ1xyXG5pbXBvcnQgZGVlcEVxdWFsIGZyb20gJ25wbS1mYXN0LWRlZXAtZXF1YWwnXHJcbmltcG9ydCB7ZXhpc3RzU3luYywgZW1wdHlEaXJTeW5jLCBlbnN1cmVEaXJTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtleHBhbmRHbG9iU3luY30gZnJvbSAnQHN0ZC9mcy9leHBhbmQtZ2xvYidcclxuXHJcbmVuY29kZXIgOj0gbmV3IFRleHRFbmNvZGVyKClcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5leHBvcnQgZGVlcENvcHkgPSBzdHJ1Y3R1cmVkQ2xvbmVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUSXRlcmF0b3I8VCwgVT12b2lkLCBWPXZvaWQ+ID0gR2VuZXJhdG9yPFQsIFUsIFY+XHJcbmV4cG9ydCB0eXBlIFRBc3luY0l0ZXJhdG9yPFQsIFU9dm9pZCwgVj12b2lkPiA9IEFzeW5jR2VuZXJhdG9yPFQsIFUsIFY+XHJcbmV4cG9ydCB0eXBlIFROb25GdW5jdGlvbjxUPXVua25vd24+ID0gRXhjbHVkZTxULCBGdW5jdGlvbj5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZmluZEZpbGUgOj0gKFxyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nPyA9PlxyXG5cclxuXHRhc3NlcnQgbm90IHJvb3QuZW5kc1dpdGgoJy8nKSwgXCJCYWQgcm9vdDogI3tyb290fVwiXHJcblxyXG5cdGxldCBmb3VuZFBhdGg6IHN0cmluZz8gPSB1bmRlZlxyXG5cdGZvciB7cGF0aH0gb2YgZXhwYW5kR2xvYlN5bmMgXCIje3Jvb3R9LyoqLyN7ZmlsZU5hbWV9XCIsIHtcclxuXHRcdFx0cm9vdFxyXG5cdFx0XHRpbmNsdWRlRGlyczogZmFsc2VcclxuXHRcdFx0Y2Fub25pY2FsaXplOiBmYWxzZVxyXG5cdFx0XHR9XHJcblx0XHRpZiBkZWZpbmVkKGZvdW5kUGF0aClcclxuXHRcdFx0Y3JvYWsgXCJNdWx0aXBsZSBmaWxlcyBuYW1lZCAje2ZpbGVOYW1lfSBmb3VuZCBpbiAje3Jvb3R9XCJcclxuXHRcdGVsc2VcclxuXHRcdFx0Zm91bmRQYXRoID0gbm9ybWFsaXplUGF0aCBwYXRoXHJcblx0cmV0dXJuIGZvdW5kUGF0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwYXNzIDo9ICgpOiB2b2lkID0+XHJcblx0IyBkbyBub3RoaW5nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgc2xlZXAgOj0gKHNlYzogbnVtYmVyKTogdm9pZCA9PlxyXG5cclxuXHRhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dCByLCAxMDAwICogc2VjKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bmRlZiA6PSB1bmRlZmluZWRcclxudHlwZSBURGVmaW5lZCA9IE5vbk51bGxhYmxlPHVua25vd24+XHJcbnR5cGUgVE5vdERlZmluZWQgPSBudWxsIHwgdW5kZWZpbmVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlZmluZWQgOj0gKHg6IHVua25vd24pOiB4IGlzIFREZWZpbmVkID0+XHJcblxyXG5cdHJldHVybiAoeCAhPSB1bmRlZikgJiYgKHggIT0gbnVsbClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW55RGVmaW5lZCA6PSAoLi4ubEl0ZW1zOiB1bmtub3duW10pOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgZGVmaW5lZChpdGVtKVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdHJldHVybiBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBub3RkZWZpbmVkIDo9ICh4OiB1bmtub3duKTogeCBpcyBUTm90RGVmaW5lZCA9PlxyXG5cclxuXHRyZXR1cm4gKHggPT0gdW5kZWYpIHx8ICh4ID09IG51bGwpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFueU5vdERlZmluZWQgOj0gKC4uLmxJdGVtczogdW5rbm93bltdKTogYm9vbGVhbiA9PlxyXG5cclxuXHRmb3IgaXRlbSBvZiBsSXRlbXNcclxuXHRcdGlmIG5vdGRlZmluZWQoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgICAgICAgICAgTE9HR0lOR1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxubGV0IGRlYnVnRmlsZVBhdGg6IHN0cmluZz8gPSB1bmRlZlxyXG5sZXQgaW5kZW50TGV2ZWwgPSAwXHJcbmxldCBsTG9nTGluZXM6IHN0cmluZ1tdID0gW11cclxuXHJcbmV4cG9ydCBJTkRFTlQgOj0gU3ltYm9sICdpbmRlbnQnXHJcbmV4cG9ydCBVTkRFTlQgOj0gU3ltYm9sICd1bmRlbnQnXHJcblxyXG5leHBvcnQgdHlwZSBUTG9nTGV2ZWwgPSAnc2lsZW50JyB8ICdpbmZvJyB8ICdkZWJ1ZydcclxubGV0IGxMb2dMZXZlbHM6IFRMb2dMZXZlbFtdID0gWydpbmZvJ11cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY3VyTG9nTGV2ZWwgOj0gKCk6IFRMb2dMZXZlbCA9PlxyXG5cclxuXHRyZXR1cm4gKGxMb2dMZXZlbHMubGVuZ3RoID09IDApID8gJ2luZm8nIDogbExvZ0xldmVsc1tsTG9nTGV2ZWxzLmxlbmd0aC0xXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBpbml0TG9nTGV2ZWwgOj0gKFxyXG5cdFx0bGV2ZWw6IFRMb2dMZXZlbFxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRsTG9nTGV2ZWxzID0gW2xldmVsXVxyXG5cdGNvbnNvbGUubG9nIFwiTE9HIExFVkVMIHNldCB0byAje2xldmVsfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHB1c2hMb2dMZXZlbCA6PSAoXHJcblx0XHRsZXZlbDogVExvZ0xldmVsXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMZXZlbHMucHVzaCBsZXZlbFxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBwb3BMb2dMZXZlbCA6PSAoKTogVExvZ0xldmVsID0+XHJcblxyXG5cdGlmIChsTG9nTGV2ZWxzLmxlbmd0aCA9PSAwKVxyXG5cdFx0cmV0dXJuICdpbmZvJ1xyXG5cdGVsc2VcclxuXHRcdHJlc3VsdCA6PSBsTG9nTGV2ZWxzLnBvcCgpXHJcblx0XHRyZXR1cm4gcmVzdWx0IHx8ICdpbmZvJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvcGVuRGVidWdGaWxlIDo9IChzdHViOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGRlYnVnRmlsZVBhdGggOj0gXCJzcmMvbG9ncy8je3N0dWJ9LmxvZ1wiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsb3NlRGVidWdGaWxlIDo9IChzdHViOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdGRlYnVnRmlsZVBhdGggPSB1bmRlZlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhcHBlbmREZWJ1Z0ZpbGUgOj0gKFxyXG5cdFx0Li4ubEl0ZW1zOiB1bmtub3duW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgZGVmaW5lZChkZWJ1Z0ZpbGVQYXRoKVxyXG5cdFx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgZGVidWdGaWxlUGF0aCwgU3RyaW5nKGl0ZW0pICsgXCJcXG5cIiwge1xyXG5cdFx0XHRcdGFwcGVuZDogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgTE9HIDo9IChcclxuXHRcdC4uLmxJdGVtczogdW5rbm93bltdXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIChjdXJMb2dMZXZlbCgpID09ICdzaWxlbnQnKVxyXG5cdFx0cmV0dXJuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiAoaXRlbSA9PSBJTkRFTlQpXHJcblx0XHRcdGluZGVudExldmVsICs9IDFcclxuXHRcdGVsc2UgaWYgKGl0ZW0gPT0gVU5ERU5UKVxyXG5cdFx0XHRpZiAoaW5kZW50TGV2ZWwgPiAwKVxyXG5cdFx0XHRcdGluZGVudExldmVsIC09IDFcclxuXHRcdGVsc2VcclxuXHRcdFx0bG9nTGluZSBpdGVtXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IERCRyA6PSAoXHJcblx0XHQuLi5sSXRlbXM6IHVua25vd25bXVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiAoY3VyTG9nTGV2ZWwoKSA9PSAnZGVidWcnKVxyXG5cdFx0TE9HIC4uLmxJdGVtc1xyXG5cdFx0aWYgZGVmaW5lZChkZWJ1Z0ZpbGVQYXRoKVxyXG5cdFx0XHRhcHBlbmREZWJ1Z0ZpbGUgLi4ubEl0ZW1zXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IFdBUk4gOj0gKFxyXG5cdFx0bXNnOiBzdHJpbmdcclxuXHRcdGxhYmVsOiBzdHJpbmcgPSAnV0FSTklORydcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0aWYgKGN1ckxvZ0xldmVsKCkgIT0gJ3NpbGVudCcpXHJcblx0XHRjb25zb2xlLmVycm9yIFwiI3tjeWFuKGxhYmVsKX06ICN7bXNnfVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IEVSUiA6PSAoXHJcblx0XHRlcnI6IHVua25vd25cclxuXHRcdGxhYmVsOiBzdHJpbmcgPSAnRVJST1InXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGVyck1zZyA6PSBnZXRFcnJTdHIoZXJyKVxyXG5cdGNvbnNvbGUuZXJyb3IgcmVkKGxhYmVsKSArICc6ICcgKyBlcnJNc2dcclxuXHRsTG9nTGluZXMucHVzaCBlcnJNc2dcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5sb2dMaW5lIDo9IChcclxuXHRcdHg6IHVua25vd24sXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGxpbmUgOj0gJ1xcdCcucmVwZWF0KGluZGVudExldmVsKSArIFN0cmluZyh4KVxyXG5cdGNvbnNvbGUubG9nIGxpbmVcclxuXHRsTG9nTGluZXMucHVzaCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyTG9nIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdGxMb2dMaW5lcy5sZW5ndGggPSAwXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExvZyA6PSAoKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBsTG9nTGluZXMuam9pbignXFxuJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbWF4IDo9ICh4OiBudW1iZXIsIHk6IG51bWJlcik6IG51bWJlciA9PlxyXG5cclxuXHRyZXR1cm4gKHggPiB5KSA/IHggOiB5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJhbmdlIDo9IChuOiBudW1iZXIpOiBUSXRlcmF0b3I8bnVtYmVyPiAtPlxyXG5cclxuXHRmb3IgaSBvZiBbMC4uLm5dXHJcblx0XHR5aWVsZCBpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jICAgICAgICAgICAgICBGaWxlIFN5c3RlbSBVdGlsc1xyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5vcm1hbGl6ZVBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0bmV3cGF0aCA6PSBwYXRoLnJlcGxhY2VBbGwgJ1xcXFwnLCAnLydcclxuXHRpZiAobmV3cGF0aC5jaGFyQXQoMSkgPT0gJzonKVxyXG5cdFx0cmV0dXJuIG5ld3BhdGguY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuZXdwYXRoLnN1YnN0cmluZygxKVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBuZXdwYXRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZpbGVFeHQgOj0gKHBhdGg6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBwYXRoLm1hdGNoKC9cXC5bXlxcLl0rJC8pXHJcblx0cmV0dXJuIGxNYXRjaGVzID8gbE1hdGNoZXNbMF0gOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3aXRoRXh0IDo9IChwYXRoOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBleHQuc3RhcnRzV2l0aCgnLicpLCBcIkJhZCBmaWxlIGV4dGVuc2lvbjogI3tleHR9XCJcclxuXHRwb3MgOj0gcGF0aC5sYXN0SW5kZXhPZiAnLidcclxuXHRhc3NlcnQgKHBvcyA+PSAwKSwgXCJwYXRoIGNvbnRhaW5zIG5vIHBlcmlvZDogI3twYXRofVwiXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcGF0aC5zdWJzdHJpbmcoMCwgcG9zKSArIGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b1JlbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0cm9vdDogc3RyaW5nID0gRGVuby5jd2QoKVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBub3JtYWxpemVQYXRoIHJlbGF0aXZlKHJvb3QsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIG5vcm1hbGl6ZVBhdGggcmVzb2x2ZSgnLicsIHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzRnVsbFBhdGggOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiBpc0Fic29sdXRlKHBhdGgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG5ld2VyRGVzdEZpbGVFeGlzdHMgOj0gKFxyXG5cdFx0c3JjUGF0aDogc3RyaW5nLFxyXG5cdFx0ZGVzdFBhdGg6IHN0cmluZyAgICAjIC0tLSBjYW4gYmUgYSBmaWxlIGV4dGVuc2lvblxyXG5cdFx0KTogYm9vbGVhbiA9PlxyXG5cclxuXHQjIC0tLSBzb3VyY2UgZmlsZSBtdXN0IGV4aXN0XHJcblx0YXNzZXJ0IGV4aXN0c1N5bmMoc3JjUGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3NyY1BhdGh9XCJcclxuXHJcblx0IyAtLS0gYWxsb3cgcGFzc2luZyBhIGZpbGUgZXh0ZW5zaW9uIGZvciAybmQgYXJndW1lbnRcclxuXHRpZiBkZXN0UGF0aC5zdGFydHNXaXRoKCcuJylcclxuXHRcdGRlc3RQYXRoID0gd2l0aEV4dChzcmNQYXRoLCBkZXN0UGF0aClcclxuXHJcblx0aWYgbm90IGV4aXN0c1N5bmMoZGVzdFBhdGgpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHR0cnlcclxuXHRcdGRlc3RtcyA6PSBnZXRGaWxlU3RhdHMoZGVzdFBhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChkZXN0bXMpXHJcblx0XHRzcmNtcyAgOj0gZ2V0RmlsZVN0YXRzKHNyY1BhdGgpLm10aW1lXHJcblx0XHRhc3NlcnQgZGVmaW5lZChzcmNtcylcclxuXHRcdHJldHVybiAoZGVzdG1zID4gc3JjbXMpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVN0YXRzID0ge1xyXG5cdGlzRmlsZTogYm9vbGVhblxyXG5cdGlzRGlyZWN0b3J5OiBib29sZWFuXHJcblx0bXRpbWU6IERhdGU/XHJcblx0fVxyXG5cclxuZXhwb3J0IGdldEZpbGVTdGF0cyA6PSAoXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdCk6IFRGaWxlU3RhdHMgPT5cclxuXHJcblx0aFN0YXRzIDo9IERlbm8uc3RhdFN5bmMgcGF0aFxyXG5cdHJldHVybiB7XHJcblx0XHRpc0ZpbGU6ICAgICAgaFN0YXRzLmlzRmlsZVxyXG5cdFx0aXNEaXJlY3Rvcnk6IGhTdGF0cy5pc0RpcmVjdG9yeVxyXG5cdFx0bXRpbWU6ICAgICAgIGhTdGF0cy5tdGltZSB8fCB1bmRlZlxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGFsbExpbmVzSW4gOj0gKFxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHQpOiBUQXN5bmNJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGZpbGUgOj0gYXdhaXQgRGVuby5vcGVuIHBhdGhcclxuXHRyZWFkYWJsZSA6PSAoZmlsZS5yZWFkYWJsZVxyXG5cdFx0XHQucGlwZVRocm91Z2gobmV3IFRleHREZWNvZGVyU3RyZWFtKCkpXHJcblx0XHRcdC5waXBlVGhyb3VnaChuZXcgVGV4dExpbmVTdHJlYW0oKSlcclxuXHRcdFx0KVxyXG5cdGZvciBhd2FpdCBsaW5lIG9mIHJlYWRhYmxlXHJcblx0XHR5aWVsZCBsaW5lXHJcblx0cmV0dXJuXHJcblxyXG5leHBvcnQgbGV0IG9ubHlUaHJvdyA9IGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5leHBvcnQgbWtUZW1wRmlsZSA6PSAoXHJcblx0XHRzdWZmaXg6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBhd2FpdCBEZW5vLm1ha2VUZW1wRmlsZSB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IG1rVGVtcEZpbGVTeW5jIDo9IChcclxuXHRcdHN1ZmZpeDogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIERlbm8ubWFrZVRlbXBGaWxlU3luYyB7c3VmZml4fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBqdXN0VGhyb3cgOj0gKGZsYWc6IGJvb2xlYW49dHJ1ZSk6IHZvaWQgPT5cclxuXHJcblx0b25seVRocm93ID0gZmxhZ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRBc3NlcnRGdW5jID0gKFxyXG5cdFx0Y29uZDogdW5rbm93bixcclxuXHRcdG1zZz86IHN0cmluZ1xyXG5cdFx0KSA9PiBhc3NlcnRzIGNvbmRcclxuXHJcbmV4cG9ydCBhc3NlcnQ6IFRBc3NlcnRGdW5jIDo9IChcclxuXHRcdGNvbmQ6IHVua25vd24sXHJcblx0XHRtc2c6IHN0cmluZyA9IFwiQW4gdW5rbm93biBlcnJvciBvY2N1cnJlZFwiXHJcblx0XHQpOiBhc3NlcnRzIGNvbmQgPT5cclxuXHJcblx0aWYgbm90IGNvbmRcclxuXHRcdGNyb2FrIG1zZ1xyXG5cdHJldHVyblxyXG5cclxuZXhwb3J0IG9idmlvdXNseTogVEFzc2VydEZ1bmMgOj0gKFxyXG5cdFx0Y29uZDogdW5rbm93blxyXG5cdFx0KTogYXNzZXJ0cyBjb25kID0+XHJcblxyXG5cdGlmIG5vdCBjb25kXHJcblx0XHRjcm9hayBcImNvbmRpdGlvbiBvYnZpb3VzbHkgbm90IHRydWVcIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFJhd1NvdXJjZU1hcCA9IHtcclxuXHR2ZXJzaW9uOiBudW1iZXI7ICAgICAgICAgICAjIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwIHNwZWMgKHVzdWFsbHkgMylcclxuXHRmaWxlOiBzdHJpbmc7ICAgICAgICAgICAgICAjIFRoZSBnZW5lcmF0ZWQgZmlsZSB0aGlzIG1hcCBpcyBhc3NvY2lhdGVkIHdpdGhcclxuXHRzb3VyY2VzOiBzdHJpbmdbXTsgICAgICAgICAjIEFycmF5IG9mIFVSTHMgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlc1xyXG5cdG5hbWVzOiBzdHJpbmdbXTsgICAgICAgICAgICMgQXJyYXkgb2YgaWRlbnRpZmllcnMgKG5hbWVzKSB1c2VkIGluIHRoZSBtYXBwaW5nc1xyXG5cdHNvdXJjZVJvb3Q/OiBzdHJpbmc7ICAgICAgICMgT3B0aW9uYWw6IFVSTCByb290IGZvciB0aGUgc291cmNlc1xyXG5cdHNvdXJjZXNDb250ZW50Pzogc3RyaW5nW107ICMgQ29udGVudCBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzIChvcHRpb25hbClcclxuXHRtYXBwaW5nczogc3RyaW5nOyAgICAgICAgICAjIFRoZSBhY3R1YWwgZW5jb2RlZCBtYXBwaW5ncyAoQmFzZTY0IFZMUSlcclxuXHR9XHJcblxyXG5leHBvcnQgdHlwZSBURmlsZVBvc2l0aW9uID0ge1xyXG5cdHNvdXJjZTogc3RyaW5nXHJcblx0bGluZTogbnVtYmVyXHJcblx0Y29sOiBudW1iZXJcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFTWU5DXHJcblxyXG5tYXBQb3MgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBhd2FpdCBEZW5vLnJlYWRUZXh0RmlsZSBzb3VyY2VcclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCBjb250ZW50c1xyXG5cdGlmIGRlZmluZWQoaFNyY01hcClcclxuXHRcdGNvbnN1bWVyIDo9IGF3YWl0IG5ldyBTb3VyY2VNYXBDb25zdW1lcihoU3JjTWFwKVxyXG5cdFx0cG9zIDo9IGNvbnN1bWVyLm9yaWdpbmFsUG9zaXRpb25Gb3Ioe2xpbmUsIGNvbHVtbjogY29sfSlcclxuXHRcdHJldHVybiBwb3MgYXMgVEZpbGVQb3NpdGlvblxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB1bmRlZlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbm1hcFBvc1N5bmMgOj0gKFxyXG5cdGZpbGVQb3M6IFRGaWxlUG9zaXRpb25cclxuXHQpOiBURmlsZVBvc2l0aW9uPyA9PlxyXG5cclxuXHR7c291cmNlLCBsaW5lLCBjb2x9IDo9IGZpbGVQb3NcclxuXHRjb250ZW50cyA6PSBEZW5vLnJlYWRUZXh0RmlsZVN5bmMgc291cmNlXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAgY29udGVudHNcclxuXHRpZiBkZWZpbmVkKGhTcmNNYXApXHJcblx0XHRbZmlsZU51bSwgc3JjTGluZSwgc3JjQ29sXSA6PSBvcmdQb3MgaFNyY01hcCwgbGluZSwgY29sXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzb3VyY2U6IGhTcmNNYXAuc291cmNlc1tmaWxlTnVtXVxyXG5cdFx0XHRsaW5lOiBzcmNMaW5lXHJcblx0XHRcdGNvbDogc3JjQ29sXHJcblx0XHRcdH1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gdW5kZWZcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZXh0cmFjdFNvdXJjZU1hcCA6PSAoXHJcblx0XHRjb250ZW50czogc3RyaW5nXHJcblx0XHQpOiBbc3RyaW5nLCBSYXdTb3VyY2VNYXA/XSA9PlxyXG5cclxuXHRsTWF0Y2hlcyA6PSBjb250ZW50cy5tYXRjaCAvLy9eXHJcblx0XHRcdCguKilcclxuXHRcdFx0XFwvIFxcLyBcXCMgXFxzK1xyXG5cdFx0XHRzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb25cXC9qc29uO1xyXG5cdFx0XHQoPzpjaGFyc2V0PXV0Zi04Oyk/XHJcblx0XHRcdGJhc2U2NCxcclxuXHRcdFx0KC4rKVxyXG5cdFx0XHQkLy8vc1xyXG5cdGlmIChsTWF0Y2hlcyA9PSBudWxsKVxyXG5cdFx0cmV0dXJuIFtjb250ZW50cywgdW5kZWZdXHJcblx0W18sIGNvZGUsIGhTcmNNYXBTdHJdIDo9IGxNYXRjaGVzXHJcblx0aFNyY01hcCA6PSBKU09OLnBhcnNlKGF0b2IoaFNyY01hcFN0cikpIGFzIFJhd1NvdXJjZU1hcFxyXG5cdHtmaWxlfSA6PSBoU3JjTWFwXHJcblx0aFNyY01hcC5maWxlID0gdG9SZWxQYXRoKGZpbGUpXHJcblx0aFNyY01hcC5zb3VyY2VzID0gZm9yIHBhdGggb2YgaFNyY01hcC5zb3VyY2VzXHJcblx0XHR0b1JlbFBhdGgocGF0aClcclxuXHRyZXR1cm4gW2NvZGUsIGhTcmNNYXBdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUT3JnUG9zID0gW2ZpbGVOdW06IG51bWJlciwgbGluZTogbnVtYmVyLCBjb2w6IG51bWJlcl1cclxudHlwZSBUQ29tcGFyZVJlc3VsdCA9IC0xIHwgMCB8IDFcclxuXHJcbmNvbXBhcmUgOj0gKFxyXG5cdFx0ZmluZDogW251bWJlciwgbnVtYmVyXSxcclxuXHRcdGdlbjogIFtudW1iZXIsIG51bWJlcl1cclxuXHRcdCk6IFRDb21wYXJlUmVzdWx0ID0+XHJcblxyXG5cdHJldHVybiAoXHJcblx0XHQgIChmaW5kWzBdIDwgZ2VuWzBdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzBdID4gZ2VuWzBdKSA/ICAxXHJcblx0XHQ6IChmaW5kWzFdIDwgZ2VuWzFdKSA/IC0xXHJcblx0XHQ6IChmaW5kWzFdID4gZ2VuWzFdKSA/ICAxXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAwXHJcblx0XHQpXHJcblxyXG5leHBvcnQgb3JnUG9zIDo9IChcclxuXHRcdGhTcmNNYXA6IFJhd1NvdXJjZU1hcCxcclxuXHRcdGZpbmRMaW5lOiBudW1iZXIsXHJcblx0XHRmaW5kQ29sOiBudW1iZXJcclxuXHRcdCk6IFRPcmdQb3MgPT5cclxuXHJcblx0bE1hcHBpbmdzIDo9IGdldE1hcHBpbmdzKGhTcmNNYXAubWFwcGluZ3MpXHJcblx0YXNzZXJ0IChsTWFwcGluZ3MubGVuZ3RoID4gMCksIFwiRW1wdHkgbWFwcGluZ3MgYXJyYXlcIlxyXG5cdGxldCBwb3MgPSAwLCBlbmQgPSBsTWFwcGluZ3MubGVuZ3RoIC0gMVxyXG5cdHdoaWxlIChwb3MgPD0gZW5kKVxyXG5cclxuXHRcdCMgLS0tIENhbGN1bGF0ZSB0aGUgbWlkZGxlIGluZGV4XHJcblx0XHRtaWQgOj0gTWF0aC5mbG9vcigocG9zICsgZW5kKSAvIDIpXHJcblx0XHRbZ2VuTGluZSwgZ2VuQ29sLCBvcmdGaWxlLCBvcmdMaW5lLCBvcmdDb2xdIDo9IGxNYXBwaW5nc1ttaWRdXHJcblx0XHRzd2l0Y2ggY29tcGFyZShbZmluZExpbmUsIGZpbmRDb2xdLCBbZ2VuTGluZSwgZ2VuQ29sXSlcclxuXHRcdFx0d2hlbiAwXHJcblx0XHRcdFx0cmV0dXJuIFtvcmdGaWxlLCBvcmdMaW5lLCBvcmdDb2xdXHJcblx0XHRcdHdoZW4gLTFcclxuXHRcdFx0XHRlbmQgPSBtaWQgLSAxO1xyXG5cdFx0XHR3aGVuIDFcclxuXHRcdFx0XHRwb3MgPSBtaWQgKyAxO1xyXG5cclxuXHQjIC0tLSBJZiB0aGUgbG9vcCBmaW5pc2hlcywgdGhlIHRhcmdldCBpcyBub3QgaW4gdGhlIGFycmF5XHJcblx0aWYgKHBvcyA8IGxNYXBwaW5ncy5sZW5ndGgpXHJcblx0XHR1c2VQb3MgOj0gKHBvcyA9PSAwKSA/IHBvcyA6IHBvcy0xXHJcblx0XHRbZ2VuTGluZSwgZ2VuQ29sLCBvcmdGaWxlLCBvcmdMaW5lLCBvcmdDb2xdIDo9IGxNYXBwaW5nc1t1c2VQb3NdXHJcblx0XHRyZXR1cm4gW29yZ0ZpbGUsIG9yZ0xpbmUsIG9yZ0NvbF1cclxuXHRlbHNlXHJcblx0XHRsYXN0IDo9IGxNYXBwaW5ncy5hdCgtMSlcclxuXHRcdGFzc2VydCBkZWZpbmVkKGxhc3QpXHJcblx0XHRbZ2VuTGluZSwgZ2VuQ29sLCBvcmdGaWxlLCBvcmdMaW5lLCBvcmdDb2xdIDo9IGxhc3RcclxuXHRcdHJldHVybiBbb3JnRmlsZSwgb3JnTGluZSwgb3JnQ29sXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRNYXBwaW5ncyA6PSAoXHJcblx0XHRkYXRhOiBzdHJpbmcsXHJcblx0XHQpOiBudW1iZXJbXVtdID0+XHJcblxyXG5cdGxNYXBwaW5nczogbnVtYmVyW11bXSA6PSBbXVxyXG5cdHZhciBzdW06IG51bWJlcltdID0gWzAsIDAsIDAsIDBdXHJcblx0Zm9yIGxpbmUsbGluZU51bSBvZiBkYXRhLnNwbGl0KFwiO1wiKVxyXG5cdFx0c3VtWzBdID0gMFxyXG5cdFx0ZGVjb2RlTGluZShsaW5lKS5mb3JFYWNoIChwKSA9PlxyXG5cdFx0XHRmb3IgKGkgb2YgWzAuLi5wLmxlbmd0aF0pXHJcblx0XHRcdFx0c3VtW2ldICs9IHBbaV1cclxuXHRcdFx0bE1hcHBpbmdzLnB1c2ggW2xpbmVOdW0sIHN1bVswXSwgc3VtWzFdLCBzdW1bMl0sIHN1bVszXV1cclxuXHRyZXR1cm4gbE1hcHBpbmdzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGRlY29kZUxpbmUgOj0gKGxpbmU6IHN0cmluZyk6IG51bWJlcltdW10gPT5cclxuXHJcblx0aWYgKGxpbmUgPT0gJycpXHJcblx0XHRyZXR1cm4gW11cclxuXHJcblx0cmV0dXJuIGZvciB0b2tlbiBvZiBsaW5lLnNwbGl0KCcsJylcclxuXHRcdGxPdXRwdXQ6IG51bWJlcltdIDo9IFtdXHJcblx0XHRsZXQgaSA9IDBcclxuXHRcdHdoaWxlIChpIDwgdG9rZW4ubGVuZ3RoKVxyXG5cdFx0XHRsZXQgdiA9IDAsIGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRpICs9IDFcclxuXHRcdFx0diB8PSAoZCAmIDMxKSAgICAgICAgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdGxldCBzaGlmdCA9IDVcclxuXHRcdFx0d2hpbGUgKGQgJiAzMikgICAgICAgICAjIHJlcGVhdCBpZiBoaWdoIGJpdCBvZiBkIGlzIHNldFxyXG5cdFx0XHRcdGQgPSBhdG9iKFwiQUFBXCIgKyB0b2tlbltpXSkuY2hhckNvZGVBdCgyKVxyXG5cdFx0XHRcdGkgKz0gMVxyXG5cdFx0XHRcdHYgfD0gKGQgJiAzMSkgPDwgc2hpZnQgICAjIHB1dCBsb3dlc3QgNSBiaXRzIG9mIGQgaW50byB2XHJcblx0XHRcdFx0c2hpZnQgKz0gNVxyXG5cdFx0XHRsT3V0cHV0LnB1c2godiAmIDEgPyAtKHYgPj4gMSkgOiB2ID4+IDEpICMgbG93IGJpdCBpcyBzaWduXHJcblx0XHRsT3V0cHV0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEZyYW1lVHlwZSA9IChcclxuXHQnZXZhbCcgfFxyXG5cdCduYXRpdmUnIHxcclxuXHQnY29uc3RydWN0b3InIHxcclxuXHQnbWV0aG9kJyB8XHJcblx0J2Z1bmN0aW9uJyB8XHJcblx0J3NjcmlwdCcgfFxyXG5cdCd1bmtub3duJ1xyXG5cdClcclxuXHJcbmV4cG9ydCB0eXBlIFRTdGFja0ZyYW1lID0ge1xyXG5cdGk6IG51bWJlclxyXG5cdHR5cGU6IHN0cmluZ1xyXG5cdHNvdXJjZTogc3RyaW5nICAgICAgICAjIHJlbGF0aXZlIGZpbGUgcGF0aCBvciAndW5rbm93bidcclxuXHRsaW5lOiBudW1iZXJcclxuXHRjb2w6IG51bWJlclxyXG5cdG5hbWU6IHN0cmluZyAgICAgICAgICAjIG5hbWUgb2YgZnVuY3Rpb24gb3IgbWV0aG9kXHJcblx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbGxTdGFja0ZyYW1lcyA6PSAoXHJcblx0XHR0cmFjZSA9IGZhbHNlXHJcblx0XHQpOiBUSXRlcmF0b3I8VFN0YWNrRnJhbWU+IC0+XHJcblxyXG5cdHRyeVxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRvbGRMaW1pdCA6PSBFcnJvci5zdGFja1RyYWNlTGltaXRcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0b2xkUHJlcGFyZXIgOj0gRXJyb3IucHJlcGFyZVN0YWNrVHJhY2VcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0RXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gOTlcclxuXHJcblx0XHRsZXQgcHJldkZyYW1lOiBUU3RhY2tGcmFtZT8gPSB1bmRlZmluZWRcclxuXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdEVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gKGVycm9yLCBsT3JnRnJhbWVzKSA9PlxyXG5cclxuXHRcdFx0bEZyYW1lczogVFN0YWNrRnJhbWVbXSA6PSBmb3Igb3JnRnJhbWUsaSBvZiBsT3JnRnJhbWVzXHJcblx0XHRcdFx0IyAtLS0gVGhlc2UgY2FuIGJlIG92ZXJ3cml0dGVuIHdoZW4gdXNpbmcgc291cmNlIG1hcHNcclxuXHRcdFx0XHRsZXQgc291cmNlICAgPSBvcmdGcmFtZS5nZXRGaWxlTmFtZSgpXHJcblx0XHRcdFx0aWYgc291cmNlXHJcblx0XHRcdFx0XHRzb3VyY2UgPSBub3JtYWxpemVQYXRoIHNvdXJjZVxyXG5cdFx0XHRcdGxldCBsaW5lICAgICA9IG9yZ0ZyYW1lLmdldExpbmVOdW1iZXIoKVxyXG5cdFx0XHRcdGxldCBjb2wgICAgICA9IG9yZ0ZyYW1lLmdldENvbHVtbk51bWJlcigpXHJcblxyXG5cdFx0XHRcdGZ1bmN0aW9uTmFtZSA6PSBvcmdGcmFtZS5nZXRGdW5jdGlvbk5hbWUoKVxyXG5cdFx0XHRcdG1ldGhvZE5hbWUgICA6PSBvcmdGcmFtZS5nZXRNZXRob2ROYW1lKClcclxuXHJcblx0XHRcdFx0IyAtLS0gaWYgaXQncyBhIGZ1bmN0aW9uIGluIGEgKi50cyBmaWxlLFxyXG5cdFx0XHRcdCMgICAgIGF0dGVtcHQgdG8gdXNlIHNvdXJjZSBtYXBcclxuXHRcdFx0XHRpZiBzb3VyY2VcclxuXHRcdFx0XHRcdGlmIHNvdXJjZS5tYXRjaCgvLy9leHQgXFw6IGNsaSBcXC8gXFxkK190ZXN0XFwuanMvLy8pXHJcblx0XHRcdFx0XHRcdGNvbnRpbnVlXHJcblxyXG5cdFx0XHRcdFx0IyAtLS0gSEFDSywgd2hpY2ggaG9wZWZ1bGx5IHdlJ2xsIGV2ZW50dWFsbHkgcmVtb3ZlXHJcblx0XHRcdFx0XHRpZiBzb3VyY2UuaW5jbHVkZXMgJ3NyYy9saWIvc3JjL2xpYi8nXHJcblx0XHRcdFx0XHRcdHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlICdzcmMvbGliL3NyYy9saWIvJywgJ3NyYy9saWIvJ1xyXG5cdFx0XHRcdFx0aWYgc291cmNlLmluY2x1ZGVzICdzcmMvdGVzdC9zcmMvdGVzdC8nXHJcblx0XHRcdFx0XHRcdHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlICdzcmMvdGVzdC9zcmMvdGVzdC8nLCAnc3JjL3Rlc3QvJ1xyXG5cdFx0XHRcdFx0aWYgc291cmNlLmluY2x1ZGVzICdzcmMvLnRlbXAvc3JjLy50ZW1wLydcclxuXHRcdFx0XHRcdFx0c291cmNlID0gc291cmNlLnJlcGxhY2UgJ3NyYy8udGVtcC9zcmMvLnRlbXAvJywgJ3NyYy8udGVtcC8nXHJcblxyXG5cdFx0XHRcdFx0bmV3RmlsZVBvcyA6PSBtYXBQb3NTeW5jKHtzb3VyY2UsIGxpbmUsIGNvbH0pXHJcblx0XHRcdFx0XHRpZiBkZWZpbmVkKG5ld0ZpbGVQb3MpXHJcblx0XHRcdFx0XHRcdHNvdXJjZSA9IG5ld0ZpbGVQb3Muc291cmNlXHJcblx0XHRcdFx0XHRcdGxpbmUgICA9IG5ld0ZpbGVQb3MubGluZVxyXG5cdFx0XHRcdFx0XHRjb2wgICAgPSBuZXdGaWxlUG9zLmNvbFxyXG5cclxuXHRcdFx0XHRmcmFtZTogVFN0YWNrRnJhbWUgOj0ge1xyXG5cdFx0XHRcdFx0aVxyXG5cdFx0XHRcdFx0dHlwZTogKFxyXG5cdFx0XHRcdFx0XHQgIGZ1bmN0aW9uTmFtZSAgICAgICAgICAgICA/ICdmdW5jdGlvbidcclxuXHRcdFx0XHRcdFx0OiBtZXRob2ROYW1lICAgICAgICAgICAgICAgPyAnbWV0aG9kJ1xyXG5cdFx0XHRcdFx0XHQ6IG9yZ0ZyYW1lLmlzVG9wbGV2ZWwoKSAgICA/ICdzY3JpcHQnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNFdmFsKCkgICAgICAgID8gJ2V2YWwnXHJcblx0XHRcdFx0XHRcdDogb3JnRnJhbWUuaXNOYXRpdmUoKSAgICAgID8gJ25hdGl2ZSdcclxuXHRcdFx0XHRcdFx0OiBvcmdGcmFtZS5pc0NvbnN0cnVjdG9yKCkgPyAnY29uc3RydWN0b3InXHJcblx0XHRcdFx0XHRcdDogICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3Vua25vd24nXHJcblx0XHRcdFx0XHRcdClcclxuXHRcdFx0XHRcdHNvdXJjZTogc291cmNlID8gdG9SZWxQYXRoKHNvdXJjZSkgOiAnJ1xyXG5cdFx0XHRcdFx0bGluZVxyXG5cdFx0XHRcdFx0Y29sXHJcblx0XHRcdFx0XHRuYW1lOiBmdW5jdGlvbk5hbWUgfHwgbWV0aG9kTmFtZSB8fCAnJ1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQjIC0tLSBmaXggYSBidWcgaW4gdGhlIFY4IGVuZ2luZSB3aGVyZSBjYWxscyBpbnNpZGUgYVxyXG5cdFx0XHRcdCMgICAgIHRvcCBsZXZlbCBhbm9ueW1vdXMgZnVuY3Rpb24gaXMgcmVwb3J0ZWQgYXNcclxuXHRcdFx0XHQjICAgICBiZWluZyBvZiB0eXBlICdzY3JpcHQnXHJcblxyXG5cdFx0XHRcdGlmIHByZXZGcmFtZSAmJiAoZnJhbWUudHlwZSA9PSAnc2NyaXB0JykgJiYgKHByZXZGcmFtZS50eXBlID09ICdzY3JpcHQnKVxyXG5cdFx0XHRcdFx0cHJldkZyYW1lLnR5cGUgPSAnZnVuY3Rpb24nXHJcblx0XHRcdFx0XHRwcmV2RnJhbWUubmFtZSA9ICc8YW5vbj4nXHJcblxyXG5cclxuXHRcdFx0XHRpZiB0cmFjZVxyXG5cdFx0XHRcdFx0ZHVtcEZyYW1lIGZyYW1lLCAnT1JHIEZSQU1FJ1xyXG5cdFx0XHRcdHByZXZGcmFtZSA9IGZyYW1lXHJcblx0XHRcdFx0ZnJhbWVcclxuXHJcblx0XHRcdHJldHVybiBsRnJhbWVzXHJcblxyXG5cdFx0b2JqOiBPYmplY3QgOj0ge31cclxuXHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKG9iailcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0bFN0YWNrOiBUU3RhY2tGcmFtZVtdIDo9IG9iai5zdGFja1xyXG5cclxuXHRcdCMgLS0tIHJlc2V0IHRvIHByZXZpb3VzIHZhbHVlc1xyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBvbGRMaW1pdFxyXG5cdFx0IyBAdHMtaWdub3JlXHJcblx0XHRFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9sZFByZXBhcmVyXHJcblxyXG5cdFx0Zm9yIGZyYW1lIG9mIGxTdGFja1xyXG5cdFx0XHR5aWVsZCBmcmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdGNhdGNoIGVyclxyXG5cdFx0Y29uc29sZS5lcnJvciBcIiN7cmVkKCdFUlJPUiBpbiBhbGxTdGFja0ZyYW1lczonKX0gI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdFx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGR1bXBGcmFtZSA6PSAoXHJcblx0XHRmcmFtZTogVFN0YWNrRnJhbWUsXHJcblx0XHRsYWJlbDogc3RyaW5nID0gJ0ZSQU1FJ1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7aSwgdHlwZSwgc291cmNlLCBsaW5lLCBjb2wsIG5hbWV9IDo9IGZyYW1lXHJcblx0dHlwZVN0ciA6PSBzcHJpbnRmKCclLThzJywgdHlwZSlcclxuXHRuYW1lU3RyIDo9IHNwcmludGYoJyUtMTZzJywgbmFtZSlcclxuXHRpZiBzb3VyY2VcclxuXHRcdExPRyBcIiN7bGFiZWx9WyN7aX1dOiAje3R5cGVTdHJ9ICN7bmFtZVN0cn0gI3tzb3VyY2V9OiN7bGluZX06I3tjb2x9XCJcclxuXHRlbHNlXHJcblx0XHRMT0cgXCIje2xhYmVsfVsje2l9XTogI3t0eXBlU3RyfSAje25hbWVTdHJ9IDxub25lPlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEVyclN0ciA6PSAoZXJyOiB1bmtub3duKTogc3RyaW5nID0+XHJcblxyXG5cdGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG5cdFx0cmV0dXJuIGVyclxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yKVxyXG5cdFx0ZXJybXNnIDo9IGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdFx0cmV0dXJuIFwiI3tjb2xvcml6ZSgnQXNzZXJ0aW9uRXJyb3I6ICcsICdyZWQnKX0je2Vycm1zZ31cIlxyXG5cdGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKVxyXG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlIHx8ICc8Tm8gbWVzc2FnZSBpbiBFcnJvciBvYmplY3Q+J1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiBcIlNlcmlvdXMgRXJyb3JcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVE5ldmVyRnVuYyA9IChlcnI/OiB1bmtub3duKSA9PiBuZXZlclxyXG5cclxuZXhwb3J0IGNyb2FrOiBUTmV2ZXJGdW5jIDo9IChcclxuXHRcdGVycjogdW5rbm93biA9IHVuZGVmXHJcblx0XHQpOiBuZXZlciA9PlxyXG5cclxuXHRpZiBub3RkZWZpbmVkKGVycilcclxuXHRcdHRocm93IG5ldyBFcnJvcigpXHJcblx0ZWxzZVxyXG5cdFx0ZXJyTXNnIDo9IGdldEVyclN0cihlcnIpXHJcblx0XHRpZiBvbmx5VGhyb3dcclxuXHRcdFx0IyAtLS0gYWxsb3dzIHRoZSBlcnJvciB0byBiZSBjYXVnaHQgYW5kIGhhbmRsZWQgb3IgaWdub3JlZFxyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyTXNnKVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRjb25zb2xlLmVycm9yIHJlZCgnQ1JPQUsnKSArICc6ICcgKyBlcnJNc2dcclxuXHRcdFx0Y29uc29sZS5lcnJvciBcIi0tLS0tICBTVEFDSyAtLS0tLVwiXHJcblx0XHRcdGZvciBmcmFtZSBvZiBhbGxTdGFja0ZyYW1lcygpXHJcblx0XHRcdFx0ZHVtcEZyYW1lIGZyYW1lXHJcblx0XHRcdERlbm8uZXhpdCgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IFRSWSA6PSAoZnVuYzogKCkgPT4gdm9pZCk6IHZvaWQgPT5cclxuXHJcblx0dHJ5XHJcblx0XHRmdW5jKClcclxuXHRjYXRjaCBlcnJcclxuXHRcdGNyb2FrIGVyclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRQcmVkaWNhdGU8VD11bmtub3duPiA9IChpdGVtOiBUKSA9PiBib29sZWFuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvQm9vbCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIG5vdCBub3QgeFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbnlPZiA6PSA8VD4oXHJcblx0XHRsSXRlbXM6IFRbXSxcclxuXHRcdGNoZWNrRnVuYzogVFByZWRpY2F0ZTxUPiA9ICh4KSA9PiB0b0Jvb2woeClcclxuXHRcdCk6IGJvb2xlYW4gPT5cclxuXHJcblx0Zm9yIGl0ZW0gb2YgbEl0ZW1zXHJcblx0XHRpZiBjaGVja0Z1bmMoaXRlbSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsT2YgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10sXHJcblx0XHRjaGVja0Z1bmM6IFRQcmVkaWNhdGU8VD4gPSAoeCkgPT4gdG9Cb29sKHgpXHJcblx0XHQpOiBib29sZWFuID0+XHJcblxyXG5cdGZvciBpdGVtIG9mIGxJdGVtc1xyXG5cdFx0aWYgbm90IGNoZWNrRnVuYyhpdGVtKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICBtYXBwZXIoKVxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUTWFwcGVyPFRJbiwgVEFjY3VtIGV4dGVuZHMgVE5vbkZ1bmN0aW9uPiA9IChcclxuXHR4OiBUSW5cclxuXHRhY2M6IFRBY2N1bVxyXG5cdGk6IG51bWJlclxyXG5cdCkgPT4gVEFjY3VtXHJcblxyXG50eXBlIFRBc3luY01hcHBlcjxUSW4sIFRBY2N1bSBleHRlbmRzIFROb25GdW5jdGlvbj4gPSAoXHJcblx0eDogVEluXHJcblx0YWNjOiBUQWNjdW1cclxuXHRpOiBudW1iZXJcclxuXHQpID0+IFByb21pc2U8VEFjY3VtPlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmlzQXN5bmNHZW5lcmF0b3JGdW5jdGlvbiA6PSAoXHJcblx0XHR4OiB1bmtub3duXHJcblx0XHQpOiB4IGlzIEFzeW5jR2VuZXJhdG9yRnVuY3Rpb24gPT5cclxuXHJcblx0cmV0dXJuIChcclxuXHRcdCAgICh0eXBlb2YgeCA9PSAnZnVuY3Rpb24nKVxyXG5cdFx0JiYgKHgudG9TdHJpbmcoKS5tYXRjaCgvXFxiYXN5bmNcXHMrZnVuY3Rpb25cXHMqXFwqLykgIT0gbnVsbClcclxuXHRcdClcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiMgLS0tIFZhcmlhbnQgMiwgb25seSBhY2N1bXVsYXRvclxyXG4jICAgICBOT1QgQVNZTkNcclxuZXhwb3J0IGZ1bmN0aW9uIG1hcHBlcjxUSW4sIFRPdXQsIFRBY2N1bSBleHRlbmRzIFROb25GdW5jdGlvbj4oXHJcblx0XHRsSXRlbXM6ICBUSW5bXSB8IFRJdGVyYXRvcjxUSW4+XHJcblx0XHRhY2M6IFRBY2N1bVxyXG5cdFx0bWFwRnVuYzogVE1hcHBlcjxUSW4sIFRBY2N1bT4gICAgICAgICAjIHBsYWluIGZ1bmN0aW9uXHJcblx0XHQpOiBUQWNjdW1cclxuXHJcbiMgLS0tIFZhcmlhbnQgNSwgcG9zc2libHkgYXN5bmMgaW5wdXQsIG9ubHkgYWNjdW11bGF0b3JcclxuIyAgICAgQVNZTkNcclxuZXhwb3J0IGZ1bmN0aW9uIG1hcHBlcjxUSW4sIFRPdXQsIFRBY2N1bSBleHRlbmRzIFROb25GdW5jdGlvbj4oXHJcblx0XHRpdGVyOiBUSW5bXSB8IFRJdGVyYXRvcjxUSW4+IHwgVEFzeW5jSXRlcmF0b3I8VEluPlxyXG5cdFx0YWNjOiBUQWNjdW1cclxuXHRcdG1hcEZ1bmM6IFRBc3luY01hcHBlcjxUSW4sIFRBY2N1bT4gfCBUTWFwcGVyPFRJbiwgVEFjY3VtPlxyXG5cdFx0KTogUHJvbWlzZTxUQWNjdW0+XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbWFwcGVyPFRJbiwgVE91dCwgVEFjY3VtIGV4dGVuZHMgVE5vbkZ1bmN0aW9uPihcclxuXHRcdGxJdGVtczogIFRJbltdIHwgVEl0ZXJhdG9yPFRJbj4gfCBUQXN5bmNJdGVyYXRvcjxUSW4+XHJcblx0XHRhY2M6IFRBY2N1bVxyXG5cdFx0bWFwRnVuYzogVEFzeW5jTWFwcGVyPFRJbiwgVEFjY3VtPiB8IFRNYXBwZXI8VEluLCBUQWNjdW0+XHJcblx0XHQpOiBUQWNjdW0gfCBQcm9taXNlPFRBY2N1bT5cclxuXHJcblx0aWYgKFN5bWJvbC5hc3luY0l0ZXJhdG9yIGluIGxJdGVtcykgfHwgaXNBc3luY0dlbmVyYXRvckZ1bmN0aW9uKG1hcEZ1bmMpXHJcblx0XHQjIEB0cy1pZ25vcmVcclxuXHRcdHJldHVybiBtYXBwZXJ2MiBsSXRlbXMsIGFjYywgbWFwRnVuY1xyXG5cdGVsc2VcclxuXHRcdCMgQHRzLWlnbm9yZVxyXG5cdFx0cmV0dXJuIG1hcHBlcnYxIGxJdGVtcywgYWNjLCBtYXBGdW5jXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBWYXJpYW50IDEsIG9ubHkgYWNjdW11bGF0b3IsIG5vIGl0ZXJhdG9yXHJcblxyXG5mdW5jdGlvbiBtYXBwZXJ2MTxUSW4sIFRPdXQsIFRBY2N1bSBleHRlbmRzIFROb25GdW5jdGlvbj4oXHJcblx0XHRsSXRlbXM6ICBUSW5bXSB8IFRJdGVyYXRvcjxUSW4+XHJcblx0XHRhY2M6IFRBY2N1bVxyXG5cdFx0bWFwRnVuYzogVE1hcHBlcjxUSW4sIFRBY2N1bT5cclxuXHRcdCk6IFRBY2N1bVxyXG5cclxuXHRmb3IgdmFsdWUsaSBvZiBhbGxWYWx1ZXNGcm9tKGxJdGVtcylcclxuXHRcdGFjYyA9IG1hcEZ1bmModmFsdWUsIGFjYywgaSlcclxuXHRyZXR1cm4gYWNjXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBWYXJpYW50IDUsIGFzeW5jIGlucHV0LCBvbmx5IGFjY3VtdWxhdG9yXHJcbiMgQVNZTkNcclxuXHJcbmZ1bmN0aW9uIG1hcHBlcnYyPFRJbiwgVE91dCwgVEFjY3VtIGV4dGVuZHMgVE5vbkZ1bmN0aW9uPihcclxuXHRcdGxJdGVtczogIFRJbltdIHwgVEl0ZXJhdG9yPFRJbj4gfCBUQXN5bmNJdGVyYXRvcjxUSW4+XHJcblx0XHRhY2M6IFRBY2N1bVxyXG5cdFx0bWFwRnVuYzogVE1hcHBlcjxUSW4sIFRBY2N1bT4gfCBUQXN5bmNNYXBwZXI8VEluLCBUQWNjdW0+XHJcblx0XHQpOiBUQWNjdW0/XHJcblxyXG5cdGZvciBhd2FpdCB2YWx1ZSxpIG9mIGFsbFZhbHVlc0Zyb21Bc3luYyhsSXRlbXMpXHJcblx0XHRhY2MgPSBhd2FpdCBtYXBGdW5jKHZhbHVlLCBhY2MsIGkpXHJcblx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShhY2MpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbFZhbHVlc0Zyb20gOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW10gfCBUSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRJdGVyYXRvcjxUPiAtPlxyXG5cclxuXHRpdGVyIDo9IEFycmF5LmlzQXJyYXkobEl0ZW1zKSA/IGxJdGVtcy52YWx1ZXMoKSA6IGxJdGVtc1xyXG5cdGxvb3BcclxuXHRcdHt2YWx1ZSwgZG9uZX0gOj0gaXRlci5uZXh0KClcclxuXHRcdGlmIGRvbmVcclxuXHRcdFx0YnJlYWtcclxuXHRcdGVsc2VcclxuXHRcdFx0eWllbGQgdmFsdWVcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsVmFsdWVzRnJvbUFzeW5jIDo9IDxUPihcclxuXHRcdGxJdGVtczogVFtdIHwgVEl0ZXJhdG9yPFQ+IHwgVEFzeW5jSXRlcmF0b3I8VD5cclxuXHRcdCk6IFRBc3luY0l0ZXJhdG9yPFQ+IC0+XHJcblxyXG5cdGl0ZXIgOj0gQXJyYXkuaXNBcnJheShsSXRlbXMpID8gbEl0ZW1zLnZhbHVlcygpIDogbEl0ZW1zXHJcblx0bG9vcFxyXG5cdFx0e3ZhbHVlLCBkb25lfSA6PSBhd2FpdCBpdGVyLm5leHQoKVxyXG5cdFx0aWYgZG9uZVxyXG5cdFx0XHRicmVha1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR5aWVsZCB2YWx1ZVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3cml0ZSA6PSAoc3RyOiBzdHJpbmcpOiB2b2lkID0+XHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGVyLmVuY29kZShzdHIpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdyaXRlbG4gOj0gKHN0cjogc3RyaW5nID0gJycpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlIHN0ciArICdcXG4nXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsZWFyU2NyZWVuIDo9ICgpOiB2b2lkID0+XHJcblxyXG5cdHdyaXRlICdcXHgxYltIXFx4MWJbMkonXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlc2V0TGluZSA6PSAoKTogdm9pZCA9PlxyXG5cclxuXHR3cml0ZSBcIlxceDFiWzJLXCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJQcmV2aW91c0xpbmVzIDo9IChudW1MaW5lczogbnVtYmVyKTogdm9pZCA9PlxyXG5cdCMgXFx4MWJbbkEgbW92ZXMgdGhlIGN1cnNvciB1cCAnbicgbGluZXNcclxuXHQjIFxcciBtb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmVcclxuXHQjIFxceDFiW0sgY2xlYXJzIHRoZSBsaW5lIGZyb20gdGhlIGN1cnNvciB0byB0aGUgZW5kIChvcHRpb25hbCwgYnV0IGdvb2QgcHJhY3RpY2UpXHJcblxyXG5cdERlbm8uc3Rkb3V0LndyaXRlU3luYyBlbmNvZGVyLmVuY29kZShcIlxceDFiWyN7bnVtTGluZXN9QVxcclxceDFiW0tcIilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQ29sb3IgPSAnY3lhbid8J2JsdWUnfCdibGFjayd8J3JlZCd8J2dyZWVuJ3wnbWFnZW50YSd8J3llbGxvdydcclxuXHJcbmV4cG9ydCBpc0NvbG9yIDo9IChzdHI6IHN0cmluZyk6IHN0ciBpcyBUQ29sb3IgPT5cclxuXHJcblx0cmV0dXJuIFsnY3lhbicsJ2JsdWUnLCdibGFjaycsJ3JlZCcsJ2dyZWVuJywnbWFnZW50YScsJ3llbGxvdyddLmluY2x1ZGVzIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjb2xvcml6ZSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0aWYgbm90ZGVmaW5lZChjb2xvcikgfHwgbm90IGlzQ29sb3IoY29sb3IpXHJcblx0XHRyZXR1cm4gc3RyXHJcblx0c3dpdGNoIGNvbG9yXHJcblx0XHR3aGVuICdjeWFuJyAgICB0aGVuIHJldHVybiBjeWFuKHN0cilcclxuXHRcdHdoZW4gJ2JsdWUnICAgIHRoZW4gcmV0dXJuIGJsdWUoc3RyKVxyXG5cdFx0d2hlbiAnYmxhY2snICAgdGhlbiByZXR1cm4gYmxhY2soc3RyKVxyXG5cdFx0d2hlbiAncmVkJyAgICAgdGhlbiByZXR1cm4gcmVkKHN0cilcclxuXHRcdHdoZW4gJ2dyZWVuJyAgIHRoZW4gcmV0dXJuIGdyZWVuKHN0cilcclxuXHRcdHdoZW4gJ21hZ2VudGEnIHRoZW4gcmV0dXJuIG1hZ2VudGEoc3RyKVxyXG5cdFx0d2hlbiAneWVsbG93JyAgdGhlbiByZXR1cm4geWVsbG93KHN0cilcclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gaENvbG9ycyBpcyB7PHdvcmQ+OiA8Y29sb3I+LCAuLi4gfVxyXG5cclxudHlwZSBUQ29sb3JNYXAgPSB7XHJcblx0W3dvcmQ6IHN0cmluZ106IFRDb2xvclxyXG5cdH1cclxuXHJcbmV4cG9ydCB3aXRoQ29sb3JzIDo9IChcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRoQ29sb3JzOiBUQ29sb3JNYXBcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRmb3Igd29yZCBvZiBPYmplY3Qua2V5cyhoQ29sb3JzKVxyXG5cdFx0Y29sb3IgOj0gaENvbG9yc1t3b3JkXVxyXG5cdFx0c3RyID0gc3RyLnJlcGxhY2VBbGwod29yZCwgY29sb3JpemUod29yZCwgY29sb3IpKVxyXG5cdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGVjb2xvcml6ZSA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0cmlwQW5zaUNvZGUoc3RyKVxyXG4iXX0=