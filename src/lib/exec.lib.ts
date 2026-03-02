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
	stdout: string     // always present, but may be ''
	stderr: string     // always present, but may be ''
	infile?: string
	outfile?: string
	debug?: string
	path?: string
}

type TFileProcessor = (input: string) => string

export const execCmdSync = (
		cmdName: string,
		lArgs: string[] = [],
		hOptions: hash = {}
		): TExecResult => {

	type opt = {
		capture: boolean
		outfile: (string | undefined)
		outProc: TFileProcessor
		}

	const {capture, outfile, outProc,
			} = getOptions<opt>(hOptions, {
		capture: true,
		outfile: undef,
		outProc: (str) => { return str }
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	if (defined(outfile)) {
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

		const {
			success,
			stdout: rawStdOut,
			stderr: rawStdErr
			} = cmd.outputSync()
		DBG(UNDENT)
		if (success && capture && defined(outfile)) {
			Deno.writeTextFileSync(outfile, decode(rawStdOut) + decode(rawStdErr))
		}
		return {
			success,
			stdout: (capture && rawStdOut) ? outProc(decode(rawStdOut)) : '',
			stderr: (capture && rawStdErr) ? outProc(decode(rawStdErr)) : '',
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			ERR(err)
		}
		return {
			success: false,
			stdout: '',
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

	const {capture, infile, inProc, outfile, outProc,
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
			Deno.writeTextFileSync(outfile, decode(rawStdOut) + decode(rawStdErr))
		}
		return {
			success,
			stdout: (capture && rawStdOut) ? outProc(decode(rawStdOut)) : '',
			stderr: (capture && rawStdErr) ? outProc(decode(rawStdErr)) : '',
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			ERR(err)
		}
		return {
			success: false,
			stdout: '',
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

	// ..........................................................
	// ASYNC

	abstract handle(
			path: string,
			hOptions: hash
			): Promise<TExecResult>

	// ..........................................................
	// SYNC

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
			path: lPaths[i]
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
				showOkResult(handler, path, hResult, hOptions)
			}
		}
		else {
			showErrResult(handler, path, hResult, hOptions)
		}
	}

	let i1 = 0;for (const reason of lRejected) {const i = i1++;
		showRejResult(handler, lRejPaths[i], getErrStr(reason), hOptions)
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

	assert(defined(path) && existsSync(path), `No such file: ${path}`)
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
		const {success, notNeeded} = hResult

		// --- If capture is false, output has already happened
		if (capture) {
			if (success) {
				writeln(f`${notNeeded ? ' - not needed' : ' - OK'}:{green}`)
				if (dumpOutput) {
					showOkResult(handler, path, hResult, hOptions)
				}
			}
			else {
				writeln(` ${colorize('FAILED', 'red')}`)
				showErrResult(handler, path, hResult, hOptions)
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
			showRejResult(handler, path, err, hOptions)
		}
		if (abortOnError) {
			Deno.exit(99)
		}
		return {
			success: false,
			path,
			stdout: '',
			stderr: ''
			}
	}
}

// ---------------------------------------------------------------------------

const showOkResult = (
		handler: CFileHandler,
		path: string,
		hResult: TExecResult,
		hOptions: hash = {}
		): void => {

	if (hResult.notNeeded) {
		LOG("NOT NEEDED")
		return
	}
	const {op} = handler
	const output = handler.getOutput(hResult)
	if (defined(output) && nonEmpty(output)) {
		DUMP(output, 'OUTPUT')
	}
	return
}

// ---------------------------------------------------------------------------

const showErrResult = (
		handler: CFileHandler,
		path: string,
		hResult: TExecResult,
		hOptions: hash = {}
		): void => {

	const {op} = handler
	const output = handler.getOutput(hResult)
	if (output) {
		DUMP(output, 'OUTPUT')
	}
	return
}

// ---------------------------------------------------------------------------

const showRejResult = (
		handler: CFileHandler,
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
		return {
			path,
			success: true,
			stdout: '',
			stderr: ''
			}
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
		return {
			path,
			success: true,
			stdout: '',
			stderr: ''
			}
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
			return {
				path,
				success: true,
				stdout: '',
				stderr: ''
				}
		}
		else {
			return {
				path,
				success: true,
				stdout: '',
				stderr: '',
				notNeeded: true
				}
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

