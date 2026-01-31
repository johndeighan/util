"use strict";
// exec.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {transpile} from "@deno/emit"
import fs from 'fs'
import {existsSync} from '@std/fs'
import {statSync} from 'fs'
import {stripAnsiCode} from '@std/fmt/colors'
import {
	CompilerOptions, ScriptTarget, ModuleKind, CompilerHost,
	createSourceFile, createProgram, getPreEmitDiagnostics,
	flattenDiagnosticMessageText, createCompilerHost,
	} from 'npm-typescript'
import {sprintf} from '@std/fmt/printf'

import {
	undef, defined, notdefined, assert, croak, hash,
	isString, isArray, isArrayOfStrings, isEmpty, nonEmpty,
	} from 'datatypes'
import {
	getOptions, pass, blockToArray, decode, encode,
	centered, sep, getErrStr,
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
	barf, pathStr, allFilesMatching, normalizePath, mkpath, barfTempFile,
	fileExt, withExt, slurpAsync, parsePath, relpath,
	} from 'fsys'
import {str2indents} from 'hera-parse'

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
	path?: string
	success: boolean
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
		hReplace: (TReplaceHash | undefined)
		}
	const {capture, hReplace} = getOptions<opt>(hOptions, {
		capture: true,
		hReplace: undef
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	DBGVALUE("EXEC SYNC", `${OL(getCmdLine(cmdName, lArgs))}`)
	DBG(INDENT)
	const child = new Deno.Command(cmdName, {
		args: replaceInArray(lArgs, hReplace),
		env: {DEFAULT_LOGGER: curLogLevel()},
		stdout: streamType,
		stderr: streamType
	}
	)
	const {success, stdout: rawStdOut, stderr: rawStdErr} = child.outputSync()
	const stdout = (capture && rawStdOut) ? decode(rawStdOut) : undef
	const stderr = (capture && rawStdErr) ? decode(rawStdErr) : undef
	const output = joinDefined(stdout, stderr)
	DBG(UNDENT)
	return {
		success,
		stdout,
		stderr,
		output,
		debug: undef
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
		hReplace: (TReplaceHash | undefined)
		}

	const {
			capture, infile, inProc, outfile, outProc, hReplace
			} = getOptions<opt>(hOptions, {
		capture: true,
		infile: undef,
		inProc: (str) => { return str },
		outfile: undef,
		outProc: (str) => { return str },
		hReplace: undef
		})

	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	if (defined(infile) || defined(outfile)) {
		assert((streamType === 'piped'),
			"When specifying infile or outfile, capture must be true")
	}
	try {
		const cmd = new Deno.Command(cmdName, {
			args: replaceInArray(lArgs, hReplace),
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
			output: getErrStr(err),
			debug: undef
			}
	}
}

// ---------------------------------------------------------------------------

export const replaceInArray = (
		lStrings: string[],
		hReplace: (TReplaceHash | undefined)
		): string[] => {

	if (defined(hReplace)) {
		return ( () => {
			const results = []
			for (const str of lStrings) {
				if (hReplace.hasOwnProperty(str)) {
					results.push(hReplace[str])
				}
				else {
					results.push(str)
				}
			}
			return results
		}
		)()
	}
	else {
		return lStrings
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
	timeTaken(): number {
		const now = Date.now()
		const secs = (now - this.t0) / 1000
		this.t0 = now
		return secs
	}
}
const timer = new CTimer()

// ---------------------------------------------------------------------------

export abstract class CFileHandler {

	abstract get op(): string

	abstract handle(path: string, hOptions: hash): Promise<TExecResult>
}

// ---------------------------------------------------------------------------
// ASYNC

export type TProcSpec = [string, CFileHandler]

export const procFiles = async (
		procSpec: TProcSpec,
		hOptions: hash = {}
		): AutoPromise<TExecResult[]> => {

	type opt = {
		root: string
		lIgnoreDirs: ((string[]) | undefined)
		abortOnError: boolean
		}

	// --- This function uses root, if set
	//     lIgnoreDirs is simply passed on to allFilesMatching()
	//        - if not defined, will default to ['temp','hide']
	const {root, lIgnoreDirs, abortOnError} = getOptions<opt>(hOptions, {
		root: '**/',
		lIgnoreDirs: undef,
		abortOnError: true
		})

	const [fileNamePat, handler] = procSpec

	const h = {lIgnoreDirs}

	// --- We need the paths for later
	const lPaths = Array.from(allFilesMatching(`${root}${fileNamePat}`))

	const results1=[];for (const path of lPaths) {
		results1.push(handler.handle(path, hOptions))
	};const lPromises =results1

	const lPromiseResults = await Promise.allSettled(lPromises)

	resetLine()
	const {op} = handler
	write(`(${op})`)
	let nOk = 0, nErr = 0, nRej = 0
	const lFinalResults: TExecResult[] = []
	let i1 = 0;for (const h of lPromiseResults) {const i = i1++;
		const path = lPaths[i]
		const status = h.status
		if (status === 'fulfilled') {
			const hResult = h.value
			const {success, output} = hResult
			h.value.path = path
			lFinalResults.push(hResult)
			if (success) {
				nOk += 1
				if (flag('v')) {
					showOkResult(op, path, hResult)
				}
			}
			else {
				nErr += 1
				showErrResult(op, path, h.value)
			}
		}
		else {
			nRej += 1
			lFinalResults.push({success: false})
			showRejResult(op, path, h.reason)
		}
	}

	showFinalResult(op, nOk, nErr, nRej, fileNamePat)
	if (abortOnError && (nErr + nRej > 0)) {
		Deno.exit(99)
	}
	return lFinalResults
}

// ---------------------------------------------------------------------------

let headerPrinted = false

const showFinalResult = (
		op: string,
		nOk: number,
		nErr: number,
		nRej: number,
		fileNamePat: string
		): void => {

	resetLine()
	if (flag('v')) {
		return
	}
	if (!headerPrinted) {
		LOG([
			sprintf('%6s', 'secs.'),
			sprintf('%-14s', 'op'),
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
		sprintf('%3d', nOk),
		sprintf('%3d', nErr),
		sprintf('%3d', nRej),
		fileNamePat
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
		dumpStdOut: boolean
		abortOnError: boolean
		}
	const {capture, dumpStdOut, abortOnError} = getOptions<opt>(hOptions, {
		capture: true,
		dumpStdOut: false,
		abortOnError: true
		})

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
		const {success} = hResult

		// --- If capture is false, output has already happened
		if (capture) {
			if (success) {
				writeln(" OK")
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

	if (nonEmpty(hResult.stderr)) {
		DUMP(hResult.stderr, 'STDERR')
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

// ==================================================
//       FileHandlers
// ==================================================

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
		return {success: true}
	}
}

export const doRemoveFile = new CFileRemover()

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
		if (existsSync(civetPath)) {
			await Deno.remove(path)
		}
		return {success: true}
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
			): AutoPromise<TExecResult> {

		assert(path.endsWith('.test.ts'), "Not a unit test file")
		type opt = {
			capture: boolean
			}
		const {capture} = getOptions<opt>(hOptions, {
			capture: true
			})
		const hResult = await execCmd('deno', [
			'test',
			'-A',
			'--coverage-raw-data-only',
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
		const ret = await execCmd('deno', [
			'install',
			'--global',
			'--force',
			'--config', 'deno.jsonc',
			'-A',
			'--name', name,
			path
			])
		return ret
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
		const ret = await execCmd('deno', [
			'uninstall',
			'-gA',
			name,
			path
		])
		return ret
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

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")
		type opt = {
			capture: boolean
			}
		const {capture} = getOptions<opt>(hOptions, {
			capture: true
			})

		return await execCmd('deno', [
			'run',
			'-A',
			path
		], {capture})
	}
}

export const doRun = new CFileRunner()

// ---------------------------------------------------------------------------

class CFileDebugger extends CFileHandler {

	get op() {
		return 'doDebug'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")
		console.log("Chrome debugger is listening...")
		return await execCmd('deno', [
			'run',
			'-A',
			'--inspect-brk',
			path
		])
	}
}

export const doDebug = new CFileDebugger()
