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
	isString, isArray, isArrayOfStrings, isEmpty, nonEmpty,
	} from 'datatypes'
import {
	getOptions, pass, blockToArray, decode, encode, sep, centered,
	} from 'llutils'
import {write, writeln, resetLine } from 'console-utils'
import {flag, debugging, inspecting} from 'cmd-args'
import {OL, ML, DUMP} from 'to-nice'
import {
	curLogLevel, pushLogLevel, popLogLevel,
	DBG, LOG, DBGVALUE, LOGVALUE,
	INDENT, UNDENT,
	} from 'logger'
import {
	barf, pathStr, allFilesMatching, normalizePath, barfTempFile,
	fileExt, withExt, slurpAsync, parsePath, relpath,
	} from 'fsys'
import {syncReducer, asyncRunner} from 'var-free'

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
	output?: string
	infile?: string
	outfile?: string
	debug?: string
}

export const execCmdSync = (
		cmdName: string,
		lArgs: string[] = [],
		hOptions: hash = {}
		): TExecResult => {

	type opt = {
		capture: boolean
		}
	const {capture} = getOptions<opt>(hOptions, {
		capture: true
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	DBGVALUE("EXEC SYNC", `${OL(getCmdLine(cmdName, lArgs))}`)
	DBG(INDENT)
	const child = new Deno.Command(cmdName, {
		args: lArgs,
		env: {DEFAULT_LOGGER: curLogLevel()},
		stdout: streamType,
		stderr: streamType,
	})
	const {
		success,
		stdout: rawStdOut,
		stderr: rawStdErr
		} = child.outputSync()
	const stdout = (capture && rawStdOut) ? decode(rawStdOut) : undef
	const stderr = (capture && rawStdErr) ? decode(rawStdErr) : undef
	const output = joinDefined(stdout, stderr)
	DBG(UNDENT)
	return {
		success,
		stdout,
		stderr,
		output,
		}
}

// ---------------------------------------------------------------------------

export type TReplaceHash = {
	[key: string]: string
}

// ---------------------------------------------------------------------------
// ASYNC

type TFileProcessor = (input: string) => string

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
	try {
		const cmd = new Deno.Command(cmdName, {
			args: lArgs,
			env: {DEFAULT_LOGGER: (debugging? 'debug' : 'info')},
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

		const h = await child.output()
		const {success} = h
		const stdout = defined(h.stdout) ? outProc(decode(h.stdout)) : undef
		const stderr = defined(h.stderr) ? outProc(decode(h.stderr)) : undef
		const output = joinDefined(stdout, stderr) || ''
		if (!success || !capture) {
			return {success, stdout, stderr, output}
		}
		if (defined(outfile)) {
			Deno.writeTextFileSync(outfile, output)
		}
		return {
			success,
			stdout,
			stderr,
			output,
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			console.error(err)
		}
		return {
			success: false,
			stdout: undef,
			stderr: getErrStr(err),
			output: getErrStr(err)
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

export type THandlerResult = TExecResult & ({path: string})

export abstract class CFileHandler {

	abstract get op(): string

	abstract handle(
			path: string,
			hOptions: hash
			): Promise<THandlerResult>
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
		lFulfilled,
		lRejected,
		lFulPaths,
		lRejPaths
		] = await asyncRunner(lPromises, lPaths)

	const nRej = lRejected.length
	const [nNotNeeded, nOk, nErr] = syncReducer(lFulfilled, [0,0,0], function(acc, h) {
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

	for (const hResult of lFulfilled) {
		const {path, success} = hResult
		if (success) {
			if (flag('v')) {
				showOkResult(op, path, hResult)
			}
		}
		else {
			showErrResult(op, path, hResult)
		}
	}

	let i1 = 0;for (const reason of lRejected) {const i = i1++;
		showRejResult(op, lRejPaths[i], getErrStr(reason))
	}

	showFinalResult(op, nNotNeeded, nOk, nErr, nRej, lPatterns)
	return lFulfilled
}

// ---------------------------------------------------------------------------

let headerPrinted = false

const showFinalResult = (
		op: string,
		non: number,
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
			sprintf('%3s', 'non'),
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
		sprintf('%3d', non),
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
		): AutoPromise<THandlerResult> => {

	assert(existsSync(path), `No such file: ${path}`)
	type opt = {
		capture: boolean
		dumpStdOut: boolean
		abortOnError: boolean
		inspect: boolean
		}
	const {
		capture, dumpStdOut, abortOnError, inspect
		} = getOptions<opt>(hOptions, {
			capture: true,
			dumpStdOut: false,
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
		const {success, notNeeded} = hResult

		// --- If capture is false, output has already happened
		if (capture) {
			if (success) {
				writeln(notNeeded ? " Not Needed" : " OK")
				if (dumpStdOut) {
					showOkResult(op, path, hResult)
				}
			}
			else {
				writeln(" FAILED")
				showErrResult(op, path, hResult)
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
			showRejResult(op, path, err)
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
		hResult: TExecResult
		): void => {

	if (hResult.notNeeded) {
		LOG("NOT NEEDED")
	}
	if (nonEmpty(hResult.stdout)) {
		DUMP(hResult.stdout, 'STDOUT')
	}
	return
}

// ---------------------------------------------------------------------------

const showErrResult = (
		op: string,
		path: string,
		hResult: TExecResult
		): void => {

	if (nonEmpty(hResult.output)) {
		DUMP(hResult.output, 'OUTPUT')
	}
	return
}

// ---------------------------------------------------------------------------

const showRejResult = (
		op: string,
		path: string,
		reason: unknown
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
			): AutoPromise<THandlerResult> {

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
			): AutoPromise<THandlerResult> {

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
			): AutoPromise<THandlerResult> {

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

class CUnitTester extends CFileHandler {

	get op() {
		return 'doUnitTest'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<THandlerResult> {

		assert(path.endsWith('.test.ts'), "Not a unit test file")
		type opt = {
			capture: boolean
			inspect: boolean
			}
		const {capture, inspect} = getOptions<opt>(hOptions, {
			capture: true,
			inspect: false
			})

		const hResult = (
			(inspect?(
				LOG("doUnitTest.handle(): inspect is set"),
				(await execCmd('deno', [
					'test',
					'-A',
					'--inspect-brk',
					'--coverage-raw-data-only',
					path
					], {capture})))
			:
				(await execCmd('deno', [
					'test',
					'-A',
					'--coverage-raw-data-only',
					path
					], {capture})))
			)
		return {...hResult, path}
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
			): AutoPromise<THandlerResult> {

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
			): AutoPromise<THandlerResult> {

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
			): AutoPromise<THandlerResult> {

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")

		let ref;if (hOptions.inspect) {
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
		return {...hResult, path}
	}
}

export const doRun = new CFileRunner()

