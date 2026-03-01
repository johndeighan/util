"use strict";
// exec.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {exists, existsSync} from '@std/fs'
import {statSync} from 'node-fs'
import {stripAnsiCode} from '@std/fmt/colors'
import {
	CompilerOptions, ScriptTarget, ModuleKind, CompilerHost,
	createSourceFile, createProgram, getPreEmitDiagnostics,
	flattenDiagnosticMessageText, createCompilerHost,
	} from 'npm-typescript'
import {sprintf} from '@std/fmt/printf'

import {
	undef, defined, notdefined, assert, croak, hash, getErrStr,
	isString, isArray, isArrayOfStrings, isEmpty, nonEmpty, TStringMapper,
	} from 'datatypes'
import {
	getOptions, pass, blockToArray, decode, encode, sep, centered,
	allLinesInBlock,
	} from 'llutils'
import {f, colorize, decolorize, withColors} from 'f-strings'
import {write, writeln, resetLine } from 'console-utils'
import {flag, debugging, inspecting} from 'cmd-args'
import {OL, ML, DUMP} from 'to-nice'
import {
	curLogLevel, pushLogLevel, popLogLevel,
	DBG, LOG, WARN, ERR, DBGVALUE, LOGVALUE, INDENT, UNDENT,
	} from 'logger'
import {
	barf, pathStr, allFilesMatching, normalizePath, barfTempFile,
	fileExt, withExt, slurpAsync, parsePath, relpath,
	} from 'fsys'
// import {reducer, syncReducer, asyncRunner} from 'var-free'
import {MAP, AMAP, awaitAll} from 'map'

// ---------------------------------------------------------------------------

export const mkstr = (
		item: ((string | BufferSource) | undefined)
		): string => {

	if (isString(item)) {
		return stripAnsiCode(item)
	}
	else if (isArray(item)) {
		return stripAnsiCode(item.join(''))
	}
	else if (defined(item)) {
		return stripAnsiCode(decode(item))
	}
	else {
		return ''
	}
}

// ---------------------------------------------------------------------------

export const joinNonEmpty = (...lStrings: (string | undefined)[]): string => {

	return lStrings.filter((s) => nonEmpty(s)).join('\n')
}

// ---------------------------------------------------------------------------

export const getCmdLine = (cmdName: string, lArgs: string[]): string => {

	assert(isString(cmdName), `cmdName not a string: ${OL(cmdName)}`)
	assert(isArrayOfStrings(lArgs), `not an array of strings: ${OL(lArgs)}`)
	const cmdLine = `${cmdName} ${lArgs.join(' ')}`
	DBG(`cmdLine = ${OL(cmdLine)}`)
	return cmdLine
}

// ---------------------------------------------------------------------------

export type TStreamType = 'piped' | 'inherit'

export type TExecResult = {
	success: boolean
	notNeeded?: true
	stdout?: string
	stderr?: string
	infile?: string
	outfile?: string
	debug?: string
	path?: string
	output?: string
}

type TFileProcessor = (input: string) => string

export const execCmdSync = (
		cmdName: string,
		lArgs: string[] = [],
		hOptions: hash = {}
		): TExecResult => {

	type opt = {
		capture: boolean
		infile: (string | undefined)
		inProc: TFileProcessor
		outfile: (string | undefined)
		outProc: TFileProcessor
		}

	const {
			capture, infile, inProc, outfile, outProc,
			} = getOptions<opt>(hOptions, {
		capture: true,
		infile: undef,
		inProc: (str) => { return str },
		outfile: undef,
		outProc: (str) => { return str }
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	if (defined(infile) || defined(outfile)) {
		assert((streamType === 'piped'),
			"When specifying infile or outfile, capture must be true")
	}
	DBGVALUE("EXEC SYNC", `${OL(getCmdLine(cmdName, lArgs))}`)
	DBG(INDENT)
	try {
		const cmd = new Deno.Command(cmdName, {
			args: lArgs,
			env: {DEFAULT_LOGGER: curLogLevel()},
			stdin: streamType,
			stdout: streamType,
			stderr: streamType
			})
		const child = cmd.spawn()
		if (defined(infile)) {
			const text = inProc(Deno.readTextFileSync(infile))
			// --- Write the data to the stdin of the child process
			child.stdin.writeSync(text)
		}

		const {
			success,
			stdout: rawStdOut,
			stderr: rawStdErr
			} = child.outputSync()
		DBG(UNDENT)
		if (success && capture && defined(outfile)) {
			Deno.writeTextFileSync(outfile, decode(rawStdOut) + decode(rawStdErr))
		}
		return {
			success,
			stdout: (capture && rawStdOut) ? outProc(decode(rawStdOut)) : undef,
			stderr: (capture && rawStdErr) ? outProc(decode(rawStdErr)) : undef,
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			ERR(err)
		}
		return {
			success: false,
			stdout: undef,
			stderr: getErrStr(err)
			}
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export const execCmd = async (
		cmdName: string,
		lArgs: string[] = [],
		hOptions: hash = {}
		): AutoPromise<TExecResult> => {

	type opt = {
		capture: boolean
		infile: (string | undefined)
		inProc: TFileProcessor
		outfile: (string | undefined)
		outProc: TFileProcessor
		}

	const {
			capture, infile, inProc, outfile, outProc,
			} = getOptions<opt>(hOptions, {
		capture: true,
		infile: undef,
		inProc: (str) => { return str },
		outfile: undef,
		outProc: (str) => { return str }
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	if (defined(infile) || defined(outfile)) {
		assert((streamType === 'piped'),
			"When specifying infile or outfile, capture must be true")
	}
	DBGVALUE("EXEC", `${OL(getCmdLine(cmdName, lArgs))}`)
	DBG(INDENT)
	try {
		const cmd = new Deno.Command(cmdName, {
			args: lArgs,
			env: {DEFAULT_LOGGER: curLogLevel()},
			stdin: streamType,
			stdout: streamType,
			stderr: streamType
			})
		const child = cmd.spawn()
		if (defined(infile)) {
			const text = inProc(Deno.readTextFileSync(infile))
			// --- Write the data to the stdin of the child process
			const writer = child.stdin.getWriter()
			await writer.write(encode(text))
			await writer.close()
		}

		const {
			success,
			stdout: rawStdOut,
			stderr: rawStdErr
			} = await child.output()
		DBG(UNDENT)
		if (success && capture && defined(outfile)) {
			Deno.writeTextFileSync(outfile, output)
		}
		return {
			success,
			stdout: (capture && rawStdOut) ? outProc(decode(rawStdOut)) : undef,
			stderr: (capture && rawStdErr) ? outProc(decode(rawStdErr)) : undef,
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			ERR(err)
		}
		return {
			success: false,
			stdout: undef,
			stderr: getErrStr(err)
			}
	}
}

// ---------------------------------------------------------------------------

type TStringGen = string | Uint8Array<ArrayBuffer>
type TStringSrc = undefined | TStringGen | (TStringGen | undefined)[]

export const joinDefined = (...lParts: TStringSrc[]): (string | undefined) => {

	const lStrings: string[] = []
	for (const src of lParts) {
		if (typeof src === 'string') {
			lStrings.push(decode(src))
		}
		else if (Array.isArray(src)) {
			for (const str of src) {
				if (!defined(str)) {
					continue
				}
				lStrings.push(decode(str))
			}
		}
	}
	return (lStrings.length === 0? undef : lStrings.join('\n'))
}

// ---------------------------------------------------------------------------

export class CTimer {

	t0 = Date.now()

	timeTaken(
			reset: boolean = true,
			decPlaces: number = 2
			): string {

		const now = Date.now()
		const secs = (now - this.t0) / 1000
		if (reset) {
			this.t0 = now
		}
		return sprintf(`%.${decPlaces}d`, secs)
	}
}

const timer = new CTimer()

// ---------------------------------------------------------------------------

export abstract class CFileHandler {

	abstract get op(): string

	abstract handle(
			path: string,
			hOptions: hash
			): Promise<TExecResult>

	getOutput(hResult: TExecResult) {

		return (hResult?.stdout || '') + (hResult?.stderr || '')
	}
}

// ---------------------------------------------------------------------------
// ASYNC

// --- Later, I want to allow passing multiple TProcSpecs
//     string is a glob pattern
export type TProcSpec = [CFileHandler, lPatterns: string[]]

export const procFiles = async (
		procSpec: TProcSpec,
		hOptions: hash = {}
		): AutoPromise<TExecResult[]> => {

	type opt = {
		quiet: boolean
		abortOnError: boolean
		}
	const {quiet, abortOnError} = getOptions<opt>(hOptions, {
		quiet: false,
		abortOnError: false
		})

	const [handler, lPatterns] = procSpec
	const {op} = handler
	if (flag('v')) {
		writeln(`(${op})`)
	}

	const lPaths: string[] = Array.from(allFilesMatching(lPatterns))
	const results=[];for (const path of lPaths) {
		results.push(handler.handle(path, hOptions))
	};const lPromises =results

	const [
		lFulfilled,     // array of TExecResult
		lRejected,
		lFulPaths,
		lRejPaths
		] = await awaitAll(lPromises, lPaths)

	const nRej = lRejected.length
	const [lAllResults, [nNotNeeded, nOk, nErr]] = MAP(lFulfilled, [0,0,0], function*(h, i, acc) {
		yield Object.assign(h, {
			path: lPaths[i],
			output: handler.getOutput(h)
			})
		const [n1, n2, n3] = acc
		if (h.success) {
			if (h.notNeeded) {
				return [n1+1, n2, n3]
			}
			else {
				return [n1, n2+1, n3]
			}
		}
		else {
			return [n1, n2, n3+1]
		}
	})

	// --- Write results to the console

	for (const hResult of lAllResults) {
		const {path, success} = hResult
		if (success) {
			if (flag('v')) {
				showOkResult(op, path, hResult, hOptions)
			}
		}
		else {
			showErrResult(op, path, hResult, hOptions)
		}
	}

	let i1 = 0;for (const reason of lRejected) {const i = i1++;
		showRejResult(op, lRejPaths[i], getErrStr(reason), hOptions)
	}

	if (!quiet || (nOk + nErr > 0)) {
		showFinalResult(op, nNotNeeded, nOk, nErr, nRej, lPatterns)
	}
	if (abortOnError && (nErr > 0)) {
		Deno.exit(-1)
	}
	return lFulfilled
}

// ---------------------------------------------------------------------------

let headerPrinted = false

const showFinalResult = (
		op: string,
		notNeeded: number,
		nOk: number,
		nErr: number,
		nRej: number,
		lPatterns: string[]
		): void => {

	resetLine()
	if (flag('v')) {
		return
	}
	if (!headerPrinted) {
		LOG('-'.repeat(46))
		LOG([
			sprintf('%6s', 'secs.'),
			sprintf('%-14s', 'op'),
			sprintf('%3s', 'nnd'),
			sprintf('%3s', 'OK'),
			sprintf('%3s', 'Bad'),
			sprintf('%3s', 'Rej'),
			'file(s)'
		].join(' '))
		LOG('-'.repeat(46))
		headerPrinted = true
	}
	LOG([
		sprintf('%6.2f', timer.timeTaken()),
		sprintf('%-14s', op),
		sprintf('%3d', notNeeded),
		sprintf('%3d', nOk),
		sprintf('%3d', nErr),
		sprintf('%3d', nRej),
		lPatterns.join(' + ')
	].join(' '))
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const procOneFile = async (
		path: string,
		handler: CFileHandler,
		hOptions: hash = {}
		): AutoPromise<TExecResult> => {

	assert(existsSync(path), `No such file: ${path}`)
	type opt = {
		capture: boolean
		dumpOutput: boolean
		abortOnError: boolean
		inspect: boolean
		}
	const {
		capture, dumpOutput, abortOnError, inspect
		} = getOptions<opt>(hOptions, {
			capture: true,
			dumpOutput: false,
			abortOnError: true,
			inspect: false
			})

	if (inspect) {
		LOG("procOneFile(): inspect is set")
	}

	// --- NOTE: if capture is false, we need to expect
	//           that when the handler is called,
	//           output will be produced

	const op = handler.op
	if (capture) {
		write(`${op} ${relpath(path)}`)
	}
	else {
		writeln(`${op} ${relpath(path)} (no capture)`)
	}

	try {
		const hResult = await handler.handle(path, hOptions)
		hResult.path = path
		hResult.output = await handler.getOutput(hResult)
		const {success, notNeeded} = hResult

		// --- If capture is false, output has already happened
		if (capture) {
			if (success) {
				writeln(f`${notNeeded ? ' - not needed' : ' - OK'}:{green}`)
				if (dumpOutput) {
					showOkResult(op, path, hResult, hOptions)
				}
			}
			else {
				writeln(` ${colorize('FAILED', 'red')}`)
				showErrResult(op, path, hResult, hOptions)
				if (abortOnError) {
					Deno.exit(99)
				}
			}
		}
		hResult.path = path
		return hResult
	}

	catch (err) {
		if (capture) {
			showRejResult(op, path, err, hOptions)
		}
		if (abortOnError) {
			Deno.exit(99)
		}
		return {success: false, path}
	}
}

// ---------------------------------------------------------------------------

const showOkResult = (
		op: string,
		path: string,
		hResult: TExecResult,
		hOptions: hash = {}
		): void => {

	if (hResult.notNeeded) {
		LOG("NOT NEEDED")
		return
	}
	const {output} = hResult
	if (defined(output) && nonEmpty(output)) {
		DUMP(output, 'OUTPUT')
	}
	return
}

// ---------------------------------------------------------------------------

const showErrResult = (
		op: string,
		path: string,
		hResult: TExecResult,
		hOptions: hash = {}
		): void => {

	type opt = {
		procOutput: (TStringMapper | undefined)
		}
	const {procOutput} = getOptions<opt>(hOptions, {
		procOutput: undef
		})

	const {output} = hResult
	if (defined(output)) {
		if (defined(procOutput)) {
			DUMP(procOutput(output), 'OUTPUT')
		}
		else {
			DUMP(output, 'OUTPUT')
		}
	}
	return
}

// ---------------------------------------------------------------------------

const showRejResult = (
		op: string,
		path: string,
		reason: unknown,
		hOptions: hash = {}
		): void => {

	DUMP(reason, 'ERROR')
	return
}

// ---------------------------------------------------------------------------
//       FileHandlers
// ---------------------------------------------------------------------------

class CFileRemover extends CFileHandler {

	get op() {
		return 'doRemoveFile'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		if (existsSync(path)) {
			await Deno.remove(path)
		}
		return {path, success: true}
	}
}

export const doRemoveFile = new CFileRemover()

// ---------------------------------------------------------------------------

class CFileEchoer extends CFileHandler {

	get op() {
		return 'doEchoFile'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		LOG(await exists(path) ? `${path}` : `${path} - ${'does not exist'}:{red}`)
		return {path, success: true}
	}
}

export const doEchoFile = new CFileEchoer()

// ---------------------------------------------------------------------------

class CTsFileRemover extends CFileHandler {

	get op() {
		return 'doRemoveTsFile'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert((fileExt(path) === '.ts'), `Not a TypeScript file: ${path}`)
		const civetPath = withExt(path, '.civet')
		if (await exists(civetPath)) {
			await Deno.remove(path)
			return {path, success: true}
		}
		else {
			return {path, success: true, notNeeded: true}
		}
	}
}

export const doRemoveTsFile = new CTsFileRemover()

// ---------------------------------------------------------------------------

export const procUTOutput = (output: string): string => {

	const lLines = MAP(allLinesInBlock(decolorize(output)), function*(line) {
		if (line.startsWith('running')) {
			yield line
			yield ''
		}
		else if (line.startsWith('line')) {
			if (!line.includes(' ok ')) {
				yield withColors(line, {
					failed: 'red',
					FAILED: 'red',
					ok: 'green',
					OK: 'green'
					})
			}
		}
		else if (line.includes('passed') && line.includes('failed')) {
			if (line.includes(' 0 failed ')) {
				yield withColors(line, {
					ok: 'green',
					passed: 'green'
					})
			}
			else {
				yield withColors(line, {
					ok: 'green',
					passed: 'green',
					failed: 'red',
					FAILED: 'red'
					})
			}
			yield ''
		}
		else if (line.includes('Lcov coverage')) {
			yield 'coverage report generated'
		}
	})
	return lLines.join('\n')
}

// ---------------------------------------------------------------------------

class CUnitTester extends CFileHandler {

	get op() {
		return 'doUnitTest'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert(path.endsWith('.test.ts'), "Not a unit test file")
		type opt = {
			capture: boolean
			inspect: boolean
			lineNum: ((number | string) | undefined)
			}
		const {capture, inspect, lineNum} = getOptions<opt>(hOptions, {
			capture: true,
			inspect: false,
			lineNum: undef
			})

		const strLineNum = (
			  notdefined(lineNum)          ? undef
			: (typeof lineNum === 'string') ? lineNum
			:                                lineNum.toString()
			)
		const hResult = await execCmd('deno', [
				'test',
				'-A',
				...(inspect ? ['--inspect-brk'] : ['--coverage=./coverage']),
				...(defined(strLineNum) ? ['--filter', strLineNum] : []),
				path
				], {capture})
		return hResult
	}
}

export const doUnitTest = new CUnitTester()

// ---------------------------------------------------------------------------

class CCmdInstaller extends CFileHandler {

	get op() {
		return 'doInstallCmd'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert((fileExt(path) === '.ts'), `Not a TypeScript file: ${path}`)
		const name = parsePath(path).stub.replaceAll('.', '_')
		const hResult = await execCmd('deno', [
			'install',
			'--global',
			'--force',
			'--config', 'deno.json',
			'-A',
			'--name', name,
			path
			])
		return {...hResult, path}
	}
}

export const doInstallCmd = new CCmdInstaller()

// ---------------------------------------------------------------------------

class CCmdUninstaller extends CFileHandler {

	get op() {
		return 'doUninstallCmd'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		const name = parsePath(path).stub.replaceAll('.', '_')
		const hResult = await execCmd('deno', [
			'uninstall',
			'-gA',
			name,
			path
			])
		return {...hResult, path}
	}
}

export const doUninstallCmd = new CCmdUninstaller()

// ---------------------------------------------------------------------------

class CFileRunner extends CFileHandler {

	get op() {
		return 'doRun'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		type opt = {
			inspect: boolean
			capture: boolean
			label: (string | undefined)
			}
		const {inspect, capture, label} = getOptions<opt>(hOptions, {
			inspect: false,
			capture: true,
			label: undef
			})

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")
		if (label && !capture) {
			LOG(sep('-', label))
		}
		let ref;if (inspect) {
			ref = await execCmd('deno', [
				'run',
				'-A',
				'--inspect-brk',
				path
				], hOptions)
		}
		else {
			ref = await execCmd('deno', [
				'run',
				'-A',
				path
				], hOptions)
		};const hResult =ref
		if (label && !capture) {
			LOG(sep('-'))
		}
		return {...hResult, path}
	}
}

export const doRun = new CFileRunner()

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcZXhlYy5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvZXhlYy5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSxpQkFBZ0I7QUFDaEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUNoQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUM3QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLGVBQWUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN6RCxDQUFDLGdCQUFnQixDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7QUFDeEQsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLGtCQUFrQixDQUFDO0FBQ2xELENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0I7QUFDeEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUI7QUFDdkMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQzVELENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxhQUFhLENBQUM7QUFDdkUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDbkIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDL0QsQ0FBQyxlQUFlLENBQUM7QUFDakIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDakIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzdELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlO0FBQ3hELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUNwRCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDcEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDeEMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDekQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDaEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxnQkFBZ0IsQ0FB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QUFDZixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEcsRyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUEsQUFBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzFCLEFBQUEsSUFBSSxLQUFLLENBQUE7QUFDVCxBQUFBLElBQUksSUFBSSxDQUFBO0FBQ1IsQUFBQSxJQUFJLElBQUk7QUFDUixBQUFBLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDO0VBQUEsQyxDQVpOLE1BQVAsT0FBTyxDQUFDLEMsR0FZSztBQUNmLEFBQUEsRUFBRSxHQUFHLENBQUEsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFJLE9BQU8sQ0FBQSxDQUFBLENBQUE7QUFDekIsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQztFQUFBLENBQUE7QUFDZixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxJQUFJLEM7Q0FBQyxDO0FBQUEsQ0FBQTtBQUMzQixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ2pDIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGV4ZWMubGliLmNpdmV0XG5cbmltcG9ydCB7ZXhpc3RzLCBleGlzdHNTeW5jfSBmcm9tICdAc3RkL2ZzJ1xuaW1wb3J0IHtzdGF0U3luY30gZnJvbSAnbm9kZS1mcydcbmltcG9ydCB7c3RyaXBBbnNpQ29kZX0gZnJvbSAnQHN0ZC9mbXQvY29sb3JzJ1xuaW1wb3J0IHtcblx0Q29tcGlsZXJPcHRpb25zLCBTY3JpcHRUYXJnZXQsIE1vZHVsZUtpbmQsIENvbXBpbGVySG9zdCxcblx0Y3JlYXRlU291cmNlRmlsZSwgY3JlYXRlUHJvZ3JhbSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLFxuXHRmbGF0dGVuRGlhZ25vc3RpY01lc3NhZ2VUZXh0LCBjcmVhdGVDb21waWxlckhvc3QsXG5cdH0gZnJvbSAnbnBtLXR5cGVzY3JpcHQnXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcblxuaW1wb3J0IHtcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGFzc2VydCwgY3JvYWssIGhhc2gsIGdldEVyclN0cixcblx0aXNTdHJpbmcsIGlzQXJyYXksIGlzQXJyYXlPZlN0cmluZ3MsIGlzRW1wdHksIG5vbkVtcHR5LCBUU3RyaW5nTWFwcGVyLFxuXHR9IGZyb20gJ2RhdGF0eXBlcydcbmltcG9ydCB7XG5cdGdldE9wdGlvbnMsIHBhc3MsIGJsb2NrVG9BcnJheSwgZGVjb2RlLCBlbmNvZGUsIHNlcCwgY2VudGVyZWQsXG5cdGFsbExpbmVzSW5CbG9jayxcblx0fSBmcm9tICdsbHV0aWxzJ1xuaW1wb3J0IHtmLCBjb2xvcml6ZSwgZGVjb2xvcml6ZSwgd2l0aENvbG9yc30gZnJvbSAnZi1zdHJpbmdzJ1xuaW1wb3J0IHt3cml0ZSwgd3JpdGVsbiwgcmVzZXRMaW5lIH0gZnJvbSAnY29uc29sZS11dGlscydcbmltcG9ydCB7ZmxhZywgZGVidWdnaW5nLCBpbnNwZWN0aW5nfSBmcm9tICdjbWQtYXJncydcbmltcG9ydCB7T0wsIE1MLCBEVU1QfSBmcm9tICd0by1uaWNlJ1xuaW1wb3J0IHtcblx0Y3VyTG9nTGV2ZWwsIHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsXG5cdERCRywgTE9HLCBXQVJOLCBFUlIsIERCR1ZBTFVFLCBMT0dWQUxVRSwgSU5ERU5ULCBVTkRFTlQsXG5cdH0gZnJvbSAnbG9nZ2VyJ1xuaW1wb3J0IHtcblx0YmFyZiwgcGF0aFN0ciwgYWxsRmlsZXNNYXRjaGluZywgbm9ybWFsaXplUGF0aCwgYmFyZlRlbXBGaWxlLFxuXHRmaWxlRXh0LCB3aXRoRXh0LCBzbHVycEFzeW5jLCBwYXJzZVBhdGgsIHJlbHBhdGgsXG5cdH0gZnJvbSAnZnN5cydcbiMgaW1wb3J0IHtyZWR1Y2VyLCBzeW5jUmVkdWNlciwgYXN5bmNSdW5uZXJ9IGZyb20gJ3Zhci1mcmVlJ1xuaW1wb3J0IHtNQVAsIEFNQVAsIGF3YWl0QWxsfSBmcm9tICdtYXAnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBta3N0ciA6PSAoXG5cdFx0aXRlbTogKHN0cmluZyB8IEJ1ZmZlclNvdXJjZSk/XG5cdFx0KTogc3RyaW5nID0+XG5cblx0aWYgaXNTdHJpbmcoaXRlbSlcblx0XHRyZXR1cm4gc3RyaXBBbnNpQ29kZSBpdGVtXG5cdGVsc2UgaWYgaXNBcnJheShpdGVtKVxuXHRcdHJldHVybiBzdHJpcEFuc2lDb2RlIGl0ZW0uam9pbiAnJ1xuXHRlbHNlIGlmIGRlZmluZWQoaXRlbSlcblx0XHRyZXR1cm4gc3RyaXBBbnNpQ29kZSBkZWNvZGUgaXRlbVxuXHRlbHNlXG5cdFx0cmV0dXJuICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBqb2luTm9uRW1wdHkgOj0gKC4uLmxTdHJpbmdzOiBzdHJpbmc/W10pOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gbFN0cmluZ3MuZmlsdGVyKChzKSA9PiBub25FbXB0eShzKSkuam9pbignXFxuJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGdldENtZExpbmUgOj0gKGNtZE5hbWU6IHN0cmluZywgbEFyZ3M6IHN0cmluZ1tdKTogc3RyaW5nID0+XG5cblx0YXNzZXJ0IGlzU3RyaW5nKGNtZE5hbWUpLCBcImNtZE5hbWUgbm90IGEgc3RyaW5nOiAje09MKGNtZE5hbWUpfVwiXG5cdGFzc2VydCBpc0FycmF5T2ZTdHJpbmdzKGxBcmdzKSwgXCJub3QgYW4gYXJyYXkgb2Ygc3RyaW5nczogI3tPTChsQXJncyl9XCJcblx0Y21kTGluZSA6PSBcIiN7Y21kTmFtZX0gI3tsQXJncy5qb2luKCcgJyl9XCJcblx0REJHIFwiY21kTGluZSA9ICN7T0woY21kTGluZSl9XCJcblx0cmV0dXJuIGNtZExpbmVcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgVFN0cmVhbVR5cGUgPSAncGlwZWQnIHwgJ2luaGVyaXQnXG5cbmV4cG9ydCB0eXBlIFRFeGVjUmVzdWx0ID1cblx0c3VjY2VzczogYm9vbGVhblxuXHRub3ROZWVkZWQ/OiB0cnVlXG5cdHN0ZG91dD86IHN0cmluZ1xuXHRzdGRlcnI/OiBzdHJpbmdcblx0aW5maWxlPzogc3RyaW5nXG5cdG91dGZpbGU/OiBzdHJpbmdcblx0ZGVidWc/OiBzdHJpbmdcblx0cGF0aD86IHN0cmluZ1xuXHRvdXRwdXQ/OiBzdHJpbmdcblxudHlwZSBURmlsZVByb2Nlc3NvciA9IChpbnB1dDogc3RyaW5nKSA9PiBzdHJpbmdcblxuZXhwb3J0IGV4ZWNDbWRTeW5jIDo9IChcblx0XHRjbWROYW1lOiBzdHJpbmcsXG5cdFx0bEFyZ3M6IHN0cmluZ1tdID0gW10sXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IFRFeGVjUmVzdWx0ID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0Y2FwdHVyZTogYm9vbGVhblxuXHRcdGluZmlsZTogc3RyaW5nP1xuXHRcdGluUHJvYzogVEZpbGVQcm9jZXNzb3Jcblx0XHRvdXRmaWxlOiBzdHJpbmc/XG5cdFx0b3V0UHJvYzogVEZpbGVQcm9jZXNzb3Jcblx0XHR9XG5cblx0e1xuXHRcdFx0Y2FwdHVyZSwgaW5maWxlLCBpblByb2MsIG91dGZpbGUsIG91dFByb2MsXG5cdFx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGNhcHR1cmU6IHRydWVcblx0XHRpbmZpbGU6IHVuZGVmXG5cdFx0aW5Qcm9jOiAoc3RyKSA9PiByZXR1cm4gc3RyXG5cdFx0b3V0ZmlsZTogdW5kZWZcblx0XHRvdXRQcm9jOiAoc3RyKSA9PiByZXR1cm4gc3RyXG5cdFx0fVxuXG5cdHN0cmVhbVR5cGU6IFRTdHJlYW1UeXBlIDo9IGNhcHR1cmUgPyAncGlwZWQnIDogJ2luaGVyaXQnXG5cdGlmIGRlZmluZWQoaW5maWxlKSB8fCBkZWZpbmVkKG91dGZpbGUpXG5cdFx0YXNzZXJ0IChzdHJlYW1UeXBlID09ICdwaXBlZCcpLFxuXHRcdFx0XCJXaGVuIHNwZWNpZnlpbmcgaW5maWxlIG9yIG91dGZpbGUsIGNhcHR1cmUgbXVzdCBiZSB0cnVlXCJcblx0REJHVkFMVUUgXCJFWEVDIFNZTkNcIiwgXCIje09MKGdldENtZExpbmUgY21kTmFtZSwgbEFyZ3MpfVwiXG5cdERCRyBJTkRFTlRcblx0dHJ5XG5cdFx0Y21kIDo9IG5ldyBEZW5vLkNvbW1hbmQgY21kTmFtZSwge1xuXHRcdFx0YXJnczogbEFyZ3Ncblx0XHRcdGVudjogREVGQVVMVF9MT0dHRVI6IGN1ckxvZ0xldmVsKClcblx0XHRcdHN0ZGluOiBzdHJlYW1UeXBlXG5cdFx0XHRzdGRvdXQ6IHN0cmVhbVR5cGVcblx0XHRcdHN0ZGVycjogc3RyZWFtVHlwZVxuXHRcdFx0fVxuXHRcdGNoaWxkIDo9IGNtZC5zcGF3bigpXG5cdFx0aWYgZGVmaW5lZChpbmZpbGUpXG5cdFx0XHR0ZXh0IDo9IGluUHJvYyBEZW5vLnJlYWRUZXh0RmlsZVN5bmMoaW5maWxlKVxuXHRcdFx0IyAtLS0gV3JpdGUgdGhlIGRhdGEgdG8gdGhlIHN0ZGluIG9mIHRoZSBjaGlsZCBwcm9jZXNzXG5cdFx0XHRjaGlsZC5zdGRpbi53cml0ZVN5bmModGV4dClcblxuXHRcdHtcblx0XHRcdHN1Y2Nlc3MsXG5cdFx0XHRzdGRvdXQ6IHJhd1N0ZE91dFxuXHRcdFx0c3RkZXJyOiByYXdTdGRFcnJcblx0XHRcdH0gOj0gY2hpbGQub3V0cHV0U3luYygpXG5cdFx0REJHIFVOREVOVFxuXHRcdGlmIHN1Y2Nlc3MgJiYgY2FwdHVyZSAmJiBkZWZpbmVkKG91dGZpbGUpXG5cdFx0XHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIG91dGZpbGUsIGRlY29kZShyYXdTdGRPdXQpICsgZGVjb2RlKHJhd1N0ZEVycilcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2Vzc1xuXHRcdFx0c3Rkb3V0OiAoY2FwdHVyZSAmJiByYXdTdGRPdXQpID8gb3V0UHJvYyhkZWNvZGUocmF3U3RkT3V0KSkgOiB1bmRlZlxuXHRcdFx0c3RkZXJyOiAoY2FwdHVyZSAmJiByYXdTdGRFcnIpID8gb3V0UHJvYyhkZWNvZGUocmF3U3RkRXJyKSkgOiB1bmRlZlxuXHRcdFx0b3V0ZmlsZVxuXHRcdFx0fVxuXHRjYXRjaCBlcnJcblx0XHRpZiBkZWJ1Z2dpbmdcblx0XHRcdEVSUiBlcnJcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2VzczogZmFsc2Vcblx0XHRcdHN0ZG91dDogdW5kZWZcblx0XHRcdHN0ZGVycjogZ2V0RXJyU3RyKGVycilcblx0XHRcdH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQVNZTkNcblxuZXhwb3J0IGV4ZWNDbWQgOj0gKFxuXHRcdGNtZE5hbWU6IHN0cmluZ1xuXHRcdGxBcmdzOiBzdHJpbmdbXSA9IFtdXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IFRFeGVjUmVzdWx0ID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0Y2FwdHVyZTogYm9vbGVhblxuXHRcdGluZmlsZTogc3RyaW5nP1xuXHRcdGluUHJvYzogVEZpbGVQcm9jZXNzb3Jcblx0XHRvdXRmaWxlOiBzdHJpbmc/XG5cdFx0b3V0UHJvYzogVEZpbGVQcm9jZXNzb3Jcblx0XHR9XG5cblx0e1xuXHRcdFx0Y2FwdHVyZSwgaW5maWxlLCBpblByb2MsIG91dGZpbGUsIG91dFByb2MsXG5cdFx0XHR9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGNhcHR1cmU6IHRydWVcblx0XHRpbmZpbGU6IHVuZGVmXG5cdFx0aW5Qcm9jOiAoc3RyKSA9PiByZXR1cm4gc3RyXG5cdFx0b3V0ZmlsZTogdW5kZWZcblx0XHRvdXRQcm9jOiAoc3RyKSA9PiByZXR1cm4gc3RyXG5cdFx0fVxuXG5cdHN0cmVhbVR5cGU6IFRTdHJlYW1UeXBlIDo9IGNhcHR1cmUgPyAncGlwZWQnIDogJ2luaGVyaXQnXG5cdGlmIGRlZmluZWQoaW5maWxlKSB8fCBkZWZpbmVkKG91dGZpbGUpXG5cdFx0YXNzZXJ0IChzdHJlYW1UeXBlID09ICdwaXBlZCcpLFxuXHRcdFx0XCJXaGVuIHNwZWNpZnlpbmcgaW5maWxlIG9yIG91dGZpbGUsIGNhcHR1cmUgbXVzdCBiZSB0cnVlXCJcblx0REJHVkFMVUUgXCJFWEVDXCIsIFwiI3tPTChnZXRDbWRMaW5lIGNtZE5hbWUsIGxBcmdzKX1cIlxuXHREQkcgSU5ERU5UXG5cdHRyeVxuXHRcdGNtZCA6PSBuZXcgRGVuby5Db21tYW5kIGNtZE5hbWUsIHtcblx0XHRcdGFyZ3M6IGxBcmdzXG5cdFx0XHRlbnY6IERFRkFVTFRfTE9HR0VSOiBjdXJMb2dMZXZlbCgpXG5cdFx0XHRzdGRpbjogc3RyZWFtVHlwZVxuXHRcdFx0c3Rkb3V0OiBzdHJlYW1UeXBlXG5cdFx0XHRzdGRlcnI6IHN0cmVhbVR5cGVcblx0XHRcdH1cblx0XHRjaGlsZCA6PSBjbWQuc3Bhd24oKVxuXHRcdGlmIGRlZmluZWQoaW5maWxlKVxuXHRcdFx0dGV4dCA6PSBpblByb2MgRGVuby5yZWFkVGV4dEZpbGVTeW5jKGluZmlsZSlcblx0XHRcdCMgLS0tIFdyaXRlIHRoZSBkYXRhIHRvIHRoZSBzdGRpbiBvZiB0aGUgY2hpbGQgcHJvY2Vzc1xuXHRcdFx0d3JpdGVyIDo9IGNoaWxkLnN0ZGluLmdldFdyaXRlcigpXG5cdFx0XHRhd2FpdCB3cml0ZXIud3JpdGUgZW5jb2RlKHRleHQpXG5cdFx0XHRhd2FpdCB3cml0ZXIuY2xvc2UoKVxuXG5cdFx0e1xuXHRcdFx0c3VjY2Vzcyxcblx0XHRcdHN0ZG91dDogcmF3U3RkT3V0XG5cdFx0XHRzdGRlcnI6IHJhd1N0ZEVyclxuXHRcdFx0fSA6PSBhd2FpdCBjaGlsZC5vdXRwdXQoKVxuXHRcdERCRyBVTkRFTlRcblx0XHRpZiBzdWNjZXNzICYmIGNhcHR1cmUgJiYgZGVmaW5lZChvdXRmaWxlKVxuXHRcdFx0RGVuby53cml0ZVRleHRGaWxlU3luYyBvdXRmaWxlLCBvdXRwdXRcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2Vzc1xuXHRcdFx0c3Rkb3V0OiAoY2FwdHVyZSAmJiByYXdTdGRPdXQpID8gb3V0UHJvYyhkZWNvZGUocmF3U3RkT3V0KSkgOiB1bmRlZlxuXHRcdFx0c3RkZXJyOiAoY2FwdHVyZSAmJiByYXdTdGRFcnIpID8gb3V0UHJvYyhkZWNvZGUocmF3U3RkRXJyKSkgOiB1bmRlZlxuXHRcdFx0b3V0ZmlsZVxuXHRcdFx0fVxuXHRjYXRjaCBlcnJcblx0XHRpZiBkZWJ1Z2dpbmdcblx0XHRcdEVSUiBlcnJcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2VzczogZmFsc2Vcblx0XHRcdHN0ZG91dDogdW5kZWZcblx0XHRcdHN0ZGVycjogZ2V0RXJyU3RyKGVycilcblx0XHRcdH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxudHlwZSBUU3RyaW5nR2VuID0gc3RyaW5nIHwgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5cbnR5cGUgVFN0cmluZ1NyYyA9IHVuZGVmaW5lZCB8IFRTdHJpbmdHZW4gfCBUU3RyaW5nR2VuP1tdXG5cbmV4cG9ydCBqb2luRGVmaW5lZCA6PSAoLi4ubFBhcnRzOiBUU3RyaW5nU3JjW10pOiBzdHJpbmc/ID0+XG5cblx0bFN0cmluZ3M6IHN0cmluZ1tdIDo9IFtdXG5cdGZvciBzcmMgb2YgbFBhcnRzXG5cdFx0aWYgKHR5cGVvZiBzcmMgPT0gJ3N0cmluZycpXG5cdFx0XHRsU3RyaW5ncy5wdXNoIGRlY29kZSBzcmNcblx0XHRlbHNlIGlmIEFycmF5LmlzQXJyYXkoc3JjKVxuXHRcdFx0Zm9yIHN0ciBvZiBzcmNcblx0XHRcdFx0aWYgbm90IGRlZmluZWQoc3RyKVxuXHRcdFx0XHRcdGNvbnRpbnVlXG5cdFx0XHRcdGxTdHJpbmdzLnB1c2ggZGVjb2RlIHN0clxuXHRyZXR1cm4gaWYgKGxTdHJpbmdzLmxlbmd0aCA9PSAwKSB0aGVuIHVuZGVmIGVsc2UgbFN0cmluZ3Muam9pbignXFxuJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNsYXNzIENUaW1lclxuXG5cdHQwID0gRGF0ZS5ub3coKVxuXG5cdHRpbWVUYWtlbihcblx0XHRcdHJlc2V0OiBib29sZWFuID0gdHJ1ZSxcblx0XHRcdGRlY1BsYWNlczogbnVtYmVyID0gMlxuXHRcdFx0KTogc3RyaW5nXG5cblx0XHRub3cgOj0gRGF0ZS5ub3coKVxuXHRcdHNlY3MgOj0gKG5vdyAtIEB0MCkgLyAxMDAwXG5cdFx0aWYgcmVzZXRcblx0XHRcdEB0MCA9IG5vd1xuXHRcdHJldHVybiBzcHJpbnRmKFwiJS4je2RlY1BsYWNlc31kXCIsIHNlY3MpXG5cbnRpbWVyIDo9IG5ldyBDVGltZXIoKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ0ZpbGVIYW5kbGVyXG5cblx0YWJzdHJhY3QgZ2V0IG9wKCk6IHN0cmluZ1xuXG5cdGFic3RyYWN0IGhhbmRsZShcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGhPcHRpb25zOiBoYXNoXG5cdFx0XHQpOiBQcm9taXNlPFRFeGVjUmVzdWx0PlxuXG5cdGdldE91dHB1dChoUmVzdWx0OiBURXhlY1Jlc3VsdClcblxuXHRcdHJldHVybiAoaFJlc3VsdD8uc3Rkb3V0IHx8ICcnKSArIChoUmVzdWx0Py5zdGRlcnIgfHwgJycpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEFTWU5DXG5cbiMgLS0tIExhdGVyLCBJIHdhbnQgdG8gYWxsb3cgcGFzc2luZyBtdWx0aXBsZSBUUHJvY1NwZWNzXG4jICAgICBzdHJpbmcgaXMgYSBnbG9iIHBhdHRlcm5cbmV4cG9ydCB0eXBlIFRQcm9jU3BlYyA9IFtDRmlsZUhhbmRsZXIsIGxQYXR0ZXJuczogc3RyaW5nW11dXG5cbmV4cG9ydCBwcm9jRmlsZXMgOj0gKFxuXHRcdHByb2NTcGVjOiBUUHJvY1NwZWMsXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IFRFeGVjUmVzdWx0W10gPT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRxdWlldDogYm9vbGVhblxuXHRcdGFib3J0T25FcnJvcjogYm9vbGVhblxuXHRcdH1cblx0e3F1aWV0LCBhYm9ydE9uRXJyb3J9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdHF1aWV0OiBmYWxzZVxuXHRcdGFib3J0T25FcnJvcjogZmFsc2Vcblx0XHR9XG5cblx0W2hhbmRsZXIsIGxQYXR0ZXJuc10gOj0gcHJvY1NwZWNcblx0e29wfSA6PSBoYW5kbGVyXG5cdGlmIGZsYWcoJ3YnKVxuXHRcdHdyaXRlbG4gXCIoI3tvcH0pXCJcblxuXHRsUGF0aHM6IHN0cmluZ1tdIDo9IEFycmF5LmZyb20gYWxsRmlsZXNNYXRjaGluZyhsUGF0dGVybnMpXG5cdGxQcm9taXNlcyA6PSBmb3IgcGF0aCBvZiBsUGF0aHNcblx0XHRoYW5kbGVyLmhhbmRsZSBwYXRoLCBoT3B0aW9uc1xuXG5cdFtcblx0XHRsRnVsZmlsbGVkLCAgICAgIyBhcnJheSBvZiBURXhlY1Jlc3VsdFxuXHRcdGxSZWplY3RlZCxcblx0XHRsRnVsUGF0aHMsXG5cdFx0bFJlalBhdGhzXG5cdFx0XSA6PSBhd2FpdCBhd2FpdEFsbChsUHJvbWlzZXMsIGxQYXRocylcblxuXHRuUmVqIDo9IGxSZWplY3RlZC5sZW5ndGhcblx0W2xBbGxSZXN1bHRzLCBbbk5vdE5lZWRlZCwgbk9rLCBuRXJyXV0gOj0gTUFQIGxGdWxmaWxsZWQsIFswLDAsMF0sIChoLCBpLCBhY2MpIC0+XG5cdFx0eWllbGQgT2JqZWN0LmFzc2lnbihoLCB7XG5cdFx0XHRwYXRoOiBsUGF0aHNbaV1cblx0XHRcdG91dHB1dDogaGFuZGxlci5nZXRPdXRwdXQoaClcblx0XHRcdH0pXG5cdFx0W24xLCBuMiwgbjNdIDo9IGFjY1xuXHRcdGlmIGguc3VjY2Vzc1xuXHRcdFx0aWYgaC5ub3ROZWVkZWRcblx0XHRcdFx0cmV0dXJuIFtuMSsxLCBuMiwgbjNdXG5cdFx0XHRlbHNlXG5cdFx0XHRcdHJldHVybiBbbjEsIG4yKzEsIG4zXVxuXHRcdGVsc2Vcblx0XHRcdHJldHVybiBbbjEsIG4yLCBuMysxXVxuXG5cdCMgLS0tIFdyaXRlIHJlc3VsdHMgdG8gdGhlIGNvbnNvbGVcblxuXHRmb3IgaFJlc3VsdCBvZiBsQWxsUmVzdWx0c1xuXHRcdHtwYXRoLCBzdWNjZXNzfSA6PSBoUmVzdWx0XG5cdFx0aWYgc3VjY2Vzc1xuXHRcdFx0aWYgZmxhZygndicpXG5cdFx0XHRcdHNob3dPa1Jlc3VsdCBvcCwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcblx0XHRlbHNlXG5cdFx0XHRzaG93RXJyUmVzdWx0IG9wLCBwYXRoLCBoUmVzdWx0LCBoT3B0aW9uc1xuXG5cdGZvciByZWFzb24saSBvZiBsUmVqZWN0ZWRcblx0XHRzaG93UmVqUmVzdWx0IG9wLCBsUmVqUGF0aHNbaV0sIGdldEVyclN0cihyZWFzb24pLCBoT3B0aW9uc1xuXG5cdGlmIG5vdCBxdWlldCB8fCAobk9rICsgbkVyciA+IDApXG5cdFx0c2hvd0ZpbmFsUmVzdWx0IG9wLCBuTm90TmVlZGVkLCBuT2ssIG5FcnIsIG5SZWosIGxQYXR0ZXJuc1xuXHRpZiBhYm9ydE9uRXJyb3IgJiYgKG5FcnIgPiAwKVxuXHRcdERlbm8uZXhpdCAtMVxuXHRyZXR1cm4gbEZ1bGZpbGxlZFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5sZXQgaGVhZGVyUHJpbnRlZCA9IGZhbHNlXG5cbnNob3dGaW5hbFJlc3VsdCA6PSAoXG5cdFx0b3A6IHN0cmluZyxcblx0XHRub3ROZWVkZWQ6IG51bWJlcixcblx0XHRuT2s6IG51bWJlcixcblx0XHRuRXJyOiBudW1iZXIsXG5cdFx0blJlajogbnVtYmVyLFxuXHRcdGxQYXR0ZXJuczogc3RyaW5nW11cblx0XHQpOiB2b2lkID0+XG5cblx0cmVzZXRMaW5lKClcblx0aWYgZmxhZygndicpXG5cdFx0cmV0dXJuXG5cdGlmIG5vdCBoZWFkZXJQcmludGVkXG5cdFx0TE9HICctJy5yZXBlYXQgNDZcblx0XHRMT0cgW1xuXHRcdFx0c3ByaW50ZignJTZzJywgJ3NlY3MuJylcblx0XHRcdHNwcmludGYoJyUtMTRzJywgJ29wJylcblx0XHRcdHNwcmludGYoJyUzcycsICdubmQnKVxuXHRcdFx0c3ByaW50ZignJTNzJywgJ09LJylcblx0XHRcdHNwcmludGYoJyUzcycsICdCYWQnKVxuXHRcdFx0c3ByaW50ZignJTNzJywgJ1JlaicpXG5cdFx0XHQnZmlsZShzKSdcblx0XHRdLmpvaW4gJyAnXG5cdFx0TE9HICctJy5yZXBlYXQgNDZcblx0XHRoZWFkZXJQcmludGVkID0gdHJ1ZVxuXHRMT0cgW1xuXHRcdHNwcmludGYoJyU2LjJmJywgdGltZXIudGltZVRha2VuKCkpXG5cdFx0c3ByaW50ZignJS0xNHMnLCBvcClcblx0XHRzcHJpbnRmKCclM2QnLCBub3ROZWVkZWQpXG5cdFx0c3ByaW50ZignJTNkJywgbk9rKVxuXHRcdHNwcmludGYoJyUzZCcsIG5FcnIpXG5cdFx0c3ByaW50ZignJTNkJywgblJlailcblx0XHRsUGF0dGVybnMuam9pbignICsgJylcblx0XS5qb2luICcgJ1xuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQVNZTkNcblxuZXhwb3J0IHByb2NPbmVGaWxlIDo9IChcblx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0aGFuZGxlcjogQ0ZpbGVIYW5kbGVyLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBURXhlY1Jlc3VsdCA9PlxuXG5cdGFzc2VydCBleGlzdHNTeW5jKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXG5cdHR5cGUgb3B0ID0ge1xuXHRcdGNhcHR1cmU6IGJvb2xlYW5cblx0XHRkdW1wT3V0cHV0OiBib29sZWFuXG5cdFx0YWJvcnRPbkVycm9yOiBib29sZWFuXG5cdFx0aW5zcGVjdDogYm9vbGVhblxuXHRcdH1cblx0e1xuXHRcdGNhcHR1cmUsIGR1bXBPdXRwdXQsIGFib3J0T25FcnJvciwgaW5zcGVjdFxuXHRcdH0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0XHRjYXB0dXJlOiB0cnVlXG5cdFx0XHRkdW1wT3V0cHV0OiBmYWxzZVxuXHRcdFx0YWJvcnRPbkVycm9yOiB0cnVlXG5cdFx0XHRpbnNwZWN0OiBmYWxzZVxuXHRcdFx0fVxuXG5cdGlmIGluc3BlY3Rcblx0XHRMT0cgXCJwcm9jT25lRmlsZSgpOiBpbnNwZWN0IGlzIHNldFwiXG5cblx0IyAtLS0gTk9URTogaWYgY2FwdHVyZSBpcyBmYWxzZSwgd2UgbmVlZCB0byBleHBlY3Rcblx0IyAgICAgICAgICAgdGhhdCB3aGVuIHRoZSBoYW5kbGVyIGlzIGNhbGxlZCxcblx0IyAgICAgICAgICAgb3V0cHV0IHdpbGwgYmUgcHJvZHVjZWRcblxuXHRvcCA6PSBoYW5kbGVyLm9wXG5cdGlmIGNhcHR1cmVcblx0XHR3cml0ZSBcIiN7b3B9ICN7cmVscGF0aChwYXRoKX1cIlxuXHRlbHNlXG5cdFx0d3JpdGVsbiBcIiN7b3B9ICN7cmVscGF0aChwYXRoKX0gKG5vIGNhcHR1cmUpXCJcblxuXHR0cnlcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGhhbmRsZXIuaGFuZGxlIHBhdGgsIGhPcHRpb25zXG5cdFx0aFJlc3VsdC5wYXRoID0gcGF0aFxuXHRcdGhSZXN1bHQub3V0cHV0ID0gYXdhaXQgaGFuZGxlci5nZXRPdXRwdXQoaFJlc3VsdClcblx0XHR7c3VjY2Vzcywgbm90TmVlZGVkfSA6PSBoUmVzdWx0XG5cblx0XHQjIC0tLSBJZiBjYXB0dXJlIGlzIGZhbHNlLCBvdXRwdXQgaGFzIGFscmVhZHkgaGFwcGVuZWRcblx0XHRpZiBjYXB0dXJlXG5cdFx0XHRpZiBzdWNjZXNzXG5cdFx0XHRcdHdyaXRlbG4gZlwiI3tub3ROZWVkZWQgPyAnIC0gbm90IG5lZWRlZCcgOiAnIC0gT0snfTp7Z3JlZW59XCJcblx0XHRcdFx0aWYgZHVtcE91dHB1dFxuXHRcdFx0XHRcdHNob3dPa1Jlc3VsdCBvcCwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcblx0XHRcdGVsc2Vcblx0XHRcdFx0d3JpdGVsbiBcIiAje2NvbG9yaXplKCdGQUlMRUQnLCAncmVkJyl9XCJcblx0XHRcdFx0c2hvd0VyclJlc3VsdCBvcCwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcblx0XHRcdFx0aWYgYWJvcnRPbkVycm9yXG5cdFx0XHRcdFx0RGVuby5leGl0IDk5XG5cdFx0aFJlc3VsdC5wYXRoID0gcGF0aFxuXHRcdHJldHVybiBoUmVzdWx0XG5cblx0Y2F0Y2ggZXJyXG5cdFx0aWYgY2FwdHVyZVxuXHRcdFx0c2hvd1JlalJlc3VsdCBvcCwgcGF0aCwgZXJyLCBoT3B0aW9uc1xuXHRcdGlmIGFib3J0T25FcnJvclxuXHRcdFx0RGVuby5leGl0IDk5XG5cdFx0cmV0dXJuIHtzdWNjZXNzOiBmYWxzZSwgcGF0aH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc2hvd09rUmVzdWx0IDo9IChcblx0XHRvcDogc3RyaW5nXG5cdFx0cGF0aDogc3RyaW5nXG5cdFx0aFJlc3VsdDogVEV4ZWNSZXN1bHRcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogdm9pZCA9PlxuXG5cdGlmIGhSZXN1bHQubm90TmVlZGVkXG5cdFx0TE9HIFwiTk9UIE5FRURFRFwiXG5cdFx0cmV0dXJuXG5cdHtvdXRwdXR9IDo9IGhSZXN1bHRcblx0aWYgZGVmaW5lZChvdXRwdXQpICYmIG5vbkVtcHR5KG91dHB1dClcblx0XHREVU1QIG91dHB1dCwgJ09VVFBVVCdcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnNob3dFcnJSZXN1bHQgOj0gKFxuXHRcdG9wOiBzdHJpbmdcblx0XHRwYXRoOiBzdHJpbmdcblx0XHRoUmVzdWx0OiBURXhlY1Jlc3VsdFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiB2b2lkID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0cHJvY091dHB1dDogVFN0cmluZ01hcHBlcj9cblx0XHR9XG5cdHtwcm9jT3V0cHV0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRwcm9jT3V0cHV0OiB1bmRlZlxuXHRcdH1cblxuXHR7b3V0cHV0fSA6PSBoUmVzdWx0XG5cdGlmIGRlZmluZWQob3V0cHV0KVxuXHRcdGlmIGRlZmluZWQocHJvY091dHB1dClcblx0XHRcdERVTVAgcHJvY091dHB1dChvdXRwdXQpLCAnT1VUUFVUJ1xuXHRcdGVsc2Vcblx0XHRcdERVTVAgb3V0cHV0LCAnT1VUUFVUJ1xuXHRyZXR1cm5cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc2hvd1JlalJlc3VsdCA6PSAoXG5cdFx0b3A6IHN0cmluZ1xuXHRcdHBhdGg6IHN0cmluZ1xuXHRcdHJlYXNvbjogdW5rbm93blxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiB2b2lkID0+XG5cblx0RFVNUCByZWFzb24sICdFUlJPUidcblx0cmV0dXJuXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jICAgICAgIEZpbGVIYW5kbGVyc1xuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgQ0ZpbGVSZW1vdmVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXG5cblx0Z2V0IG9wKClcblx0XHRyZXR1cm4gJ2RvUmVtb3ZlRmlsZSdcblxuXHRvdmVycmlkZSBoYW5kbGUoXG5cdFx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxuXG5cdFx0aWYgZXhpc3RzU3luYyhwYXRoKVxuXHRcdFx0YXdhaXQgRGVuby5yZW1vdmUgcGF0aFxuXHRcdHJldHVybiB7cGF0aCwgc3VjY2VzczogdHJ1ZX1cblxuZXhwb3J0IGRvUmVtb3ZlRmlsZSA6PSBuZXcgQ0ZpbGVSZW1vdmVyKClcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgQ0ZpbGVFY2hvZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcblxuXHRnZXQgb3AoKVxuXHRcdHJldHVybiAnZG9FY2hvRmlsZSdcblxuXHRvdmVycmlkZSBoYW5kbGUoXG5cdFx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxuXG5cdFx0TE9HIGF3YWl0IGV4aXN0cyhwYXRoKSA/IFwiI3twYXRofVwiIDogXCIje3BhdGh9IC0gI3snZG9lcyBub3QgZXhpc3QnfTp7cmVkfVwiXG5cdFx0cmV0dXJuIHtwYXRoLCBzdWNjZXNzOiB0cnVlfVxuXG5leHBvcnQgZG9FY2hvRmlsZSA6PSBuZXcgQ0ZpbGVFY2hvZXIoKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBDVHNGaWxlUmVtb3ZlciBleHRlbmRzIENGaWxlSGFuZGxlclxuXG5cdGdldCBvcCgpXG5cdFx0cmV0dXJuICdkb1JlbW92ZVRzRmlsZSdcblxuXHRvdmVycmlkZSBoYW5kbGUoXG5cdFx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxuXG5cdFx0YXNzZXJ0IChmaWxlRXh0KHBhdGgpID09ICcudHMnKSwgXCJOb3QgYSBUeXBlU2NyaXB0IGZpbGU6ICN7cGF0aH1cIlxuXHRcdGNpdmV0UGF0aCA6PSB3aXRoRXh0IHBhdGgsICcuY2l2ZXQnXG5cdFx0aWYgYXdhaXQgZXhpc3RzKGNpdmV0UGF0aClcblx0XHRcdGF3YWl0IERlbm8ucmVtb3ZlIHBhdGhcblx0XHRcdHJldHVybiB7cGF0aCwgc3VjY2VzczogdHJ1ZX1cblx0XHRlbHNlXG5cdFx0XHRyZXR1cm4ge3BhdGgsIHN1Y2Nlc3M6IHRydWUsIG5vdE5lZWRlZDogdHJ1ZX1cblxuZXhwb3J0IGRvUmVtb3ZlVHNGaWxlIDo9IG5ldyBDVHNGaWxlUmVtb3ZlcigpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBwcm9jVVRPdXRwdXQgOj0gKG91dHB1dDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0bExpbmVzIDo9IE1BUCBhbGxMaW5lc0luQmxvY2soZGVjb2xvcml6ZShvdXRwdXQpKSwgKGxpbmUpIC0+XG5cdFx0aWYgbGluZS5zdGFydHNXaXRoKCdydW5uaW5nJylcblx0XHRcdHlpZWxkIGxpbmVcblx0XHRcdHlpZWxkICcnXG5cdFx0ZWxzZSBpZiBsaW5lLnN0YXJ0c1dpdGgoJ2xpbmUnKVxuXHRcdFx0aWYgbm90IGxpbmUuaW5jbHVkZXMoJyBvayAnKVxuXHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcblx0XHRcdFx0XHRmYWlsZWQ6ICdyZWQnXG5cdFx0XHRcdFx0RkFJTEVEOiAncmVkJ1xuXHRcdFx0XHRcdG9rOiAnZ3JlZW4nXG5cdFx0XHRcdFx0T0s6ICdncmVlbidcblx0XHRcdFx0XHR9XG5cdFx0ZWxzZSBpZiBsaW5lLmluY2x1ZGVzKCdwYXNzZWQnKSAmJiBsaW5lLmluY2x1ZGVzKCdmYWlsZWQnKVxuXHRcdFx0aWYgbGluZS5pbmNsdWRlcygnIDAgZmFpbGVkICcpXG5cdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xuXHRcdFx0XHRcdG9rOiAnZ3JlZW4nXG5cdFx0XHRcdFx0cGFzc2VkOiAnZ3JlZW4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcblx0XHRcdFx0XHRvazogJ2dyZWVuJ1xuXHRcdFx0XHRcdHBhc3NlZDogJ2dyZWVuJ1xuXHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcblx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXG5cdFx0XHRcdFx0fVxuXHRcdFx0eWllbGQgJydcblx0XHRlbHNlIGlmIGxpbmUuaW5jbHVkZXMoJ0xjb3YgY292ZXJhZ2UnKVxuXHRcdFx0eWllbGQgJ2NvdmVyYWdlIHJlcG9ydCBnZW5lcmF0ZWQnXG5cdHJldHVybiBsTGluZXMuam9pbignXFxuJylcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgQ1VuaXRUZXN0ZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcblxuXHRnZXQgb3AoKVxuXHRcdHJldHVybiAnZG9Vbml0VGVzdCdcblxuXHRvdmVycmlkZSBoYW5kbGUoXG5cdFx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxuXG5cdFx0YXNzZXJ0IHBhdGguZW5kc1dpdGgoJy50ZXN0LnRzJyksIFwiTm90IGEgdW5pdCB0ZXN0IGZpbGVcIlxuXHRcdHR5cGUgb3B0ID0ge1xuXHRcdFx0Y2FwdHVyZTogYm9vbGVhblxuXHRcdFx0aW5zcGVjdDogYm9vbGVhblxuXHRcdFx0bGluZU51bTogKG51bWJlciB8IHN0cmluZyk/XG5cdFx0XHR9XG5cdFx0e2NhcHR1cmUsIGluc3BlY3QsIGxpbmVOdW19IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdFx0Y2FwdHVyZTogdHJ1ZVxuXHRcdFx0aW5zcGVjdDogZmFsc2Vcblx0XHRcdGxpbmVOdW06IHVuZGVmXG5cdFx0XHR9XG5cblx0XHRzdHJMaW5lTnVtIDo9IChcblx0XHRcdCAgbm90ZGVmaW5lZChsaW5lTnVtKSAgICAgICAgICA/IHVuZGVmXG5cdFx0XHQ6ICh0eXBlb2YgbGluZU51bSA9PSAnc3RyaW5nJykgPyBsaW5lTnVtXG5cdFx0XHQ6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtLnRvU3RyaW5nKClcblx0XHRcdClcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXG5cdFx0XHRcdCd0ZXN0J1xuXHRcdFx0XHQnLUEnXG5cdFx0XHRcdC4uLihpbnNwZWN0ID8gWyctLWluc3BlY3QtYnJrJ10gOiBbJy0tY292ZXJhZ2U9Li9jb3ZlcmFnZSddKVxuXHRcdFx0XHQuLi4oZGVmaW5lZChzdHJMaW5lTnVtKSA/IFsnLS1maWx0ZXInLCBzdHJMaW5lTnVtXSA6IFtdKVxuXHRcdFx0XHRwYXRoXG5cdFx0XHRcdF0sIHtjYXB0dXJlfVxuXHRcdHJldHVybiBoUmVzdWx0XG5cbmV4cG9ydCBkb1VuaXRUZXN0IDo9IG5ldyBDVW5pdFRlc3RlcigpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIENDbWRJbnN0YWxsZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcblxuXHRnZXQgb3AoKVxuXHRcdHJldHVybiAnZG9JbnN0YWxsQ21kJ1xuXG5cdG92ZXJyaWRlIGhhbmRsZShcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHRcdCk6IFRFeGVjUmVzdWx0XG5cblx0XHRhc3NlcnQgKGZpbGVFeHQocGF0aCkgPT0gJy50cycpLCBcIk5vdCBhIFR5cGVTY3JpcHQgZmlsZTogI3twYXRofVwiXG5cdFx0bmFtZSA6PSBwYXJzZVBhdGgocGF0aCkuc3R1Yi5yZXBsYWNlQWxsICcuJywgJ18nXG5cdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xuXHRcdFx0J2luc3RhbGwnXG5cdFx0XHQnLS1nbG9iYWwnXG5cdFx0XHQnLS1mb3JjZSdcblx0XHRcdCctLWNvbmZpZycsICdkZW5vLmpzb24nXG5cdFx0XHQnLUEnXG5cdFx0XHQnLS1uYW1lJywgbmFtZVxuXHRcdFx0cGF0aFxuXHRcdFx0XVxuXHRcdHJldHVybiB7Li4uaFJlc3VsdCwgcGF0aH1cblxuZXhwb3J0IGRvSW5zdGFsbENtZCA6PSBuZXcgQ0NtZEluc3RhbGxlcigpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIENDbWRVbmluc3RhbGxlciBleHRlbmRzIENGaWxlSGFuZGxlclxuXG5cdGdldCBvcCgpXG5cdFx0cmV0dXJuICdkb1VuaW5zdGFsbENtZCdcblxuXHRvdmVycmlkZSBoYW5kbGUoXG5cdFx0XHRwYXRoOiBzdHJpbmcsXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxuXG5cdFx0bmFtZSA6PSBwYXJzZVBhdGgocGF0aCkuc3R1Yi5yZXBsYWNlQWxsICcuJywgJ18nXG5cdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xuXHRcdFx0J3VuaW5zdGFsbCdcblx0XHRcdCctZ0EnXG5cdFx0XHRuYW1lXG5cdFx0XHRwYXRoXG5cdFx0XHRdXG5cdFx0cmV0dXJuIHsuLi5oUmVzdWx0LCBwYXRofVxuXG5leHBvcnQgZG9Vbmluc3RhbGxDbWQgOj0gbmV3IENDbWRVbmluc3RhbGxlcigpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIENGaWxlUnVubmVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXG5cblx0Z2V0IG9wKClcblx0XHRyZXR1cm4gJ2RvUnVuJ1xuXG5cdG92ZXJyaWRlIGhhbmRsZShcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHRcdCk6IFRFeGVjUmVzdWx0XG5cblx0XHR0eXBlIG9wdCA9IHtcblx0XHRcdGluc3BlY3Q6IGJvb2xlYW5cblx0XHRcdGNhcHR1cmU6IGJvb2xlYW5cblx0XHRcdGxhYmVsOiBzdHJpbmc/XG5cdFx0XHR9XG5cdFx0e2luc3BlY3QsIGNhcHR1cmUsIGxhYmVsfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRcdGluc3BlY3Q6IGZhbHNlXG5cdFx0XHRjYXB0dXJlOiB0cnVlXG5cdFx0XHRsYWJlbDogdW5kZWZcblx0XHRcdH1cblxuXHRcdGFzc2VydCAoZmlsZUV4dChwYXRoKSA9PSAnLnRzJyksIFwiTm90IGEgVHlwZVNjcmlwdCBmaWxlXCJcblx0XHRpZiBsYWJlbCAmJiBub3QgY2FwdHVyZVxuXHRcdFx0TE9HIHNlcCgnLScsIGxhYmVsKVxuXHRcdGhSZXN1bHQgOj0gaWYgaW5zcGVjdFxuXHRcdFx0YXdhaXQgZXhlY0NtZCAnZGVubycsIFtcblx0XHRcdFx0J3J1bidcblx0XHRcdFx0Jy1BJ1xuXHRcdFx0XHQnLS1pbnNwZWN0LWJyaydcblx0XHRcdFx0cGF0aFxuXHRcdFx0XHRdLCBoT3B0aW9uc1xuXHRcdGVsc2Vcblx0XHRcdGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXG5cdFx0XHRcdCdydW4nXG5cdFx0XHRcdCctQSdcblx0XHRcdFx0cGF0aFxuXHRcdFx0XHRdLCBoT3B0aW9uc1xuXHRcdGlmIGxhYmVsICYmIG5vdCBjYXB0dXJlXG5cdFx0XHRMT0cgc2VwKCctJylcblx0XHRyZXR1cm4gey4uLmhSZXN1bHQsIHBhdGh9XG5cbmV4cG9ydCBkb1J1biA6PSBuZXcgQ0ZpbGVSdW5uZXIoKVxuIl19