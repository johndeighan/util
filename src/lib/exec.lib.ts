"use strict";
// exec.lib.civet

type AutoPromise1<T> = Promise<Awaited<T>>;
type AutoPromise<T> = Promise<Awaited<T>>

import {transpile} from "jsr:@deno/emit"
import fs from 'node:fs'
import {existsSync} from 'jsr:@std/fs'
import {statSync} from 'node:fs'
import {stripAnsiCode} from 'jsr:@std/fmt/colors'
import {
	CompilerOptions, ScriptTarget, ModuleKind, CompilerHost,
	createSourceFile, createProgram, getPreEmitDiagnostics,
	flattenDiagnosticMessageText, createCompilerHost,
	} from 'npm:typescript'
import {sprintf} from 'jsr:@std/fmt/printf'
import {compile as compileCivet} from 'npm:@danielx/civet'
import hCivetConfig from "civetconfig" with { type: "json" };
import {RawSourceMap} from 'npm:source-map-sync'

import {
	undef, defined, notdefined, assert, croak, hash,
	isString, isArray, isArrayOfStrings, isEmpty, nonEmpty,
	} from 'datatypes'
import {
	getOptions, pass, blockToArray, decode, encode, centered, sep,
	} from 'llutils'
import {write, writeln, resetLine } from 'console-utils'
import {flag, debugging, inspecting} from 'cmd-args'
import {OL, ML} from 'to-nice'
import {
	getLogLevel, pushLogLevel, popLogLevel,
	DBG, LOG, WARN, ERR, LOGVALUE,
	INDENT, UNDENT, DBGVALUE, DBGLABELED,
	} from 'logger'
import {
	barf, pathStr, allFilesMatching, normalizePath, mkpath, barfTempFile,
	fileExt, withExt, slurpAsync, parsePath, relpath, addJsonValue,
	} from 'fsys'
import {extractSourceMap, haveSourceMapFor} from 'source-map'
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

export const getErrStr = (err: unknown): string => {

	if (typeof err === 'string') {
		return err
	}
	else if (err instanceof String) {
		return err.toString()
	}
	else if (err instanceof Error) {
		return err.message
	}
	else {
		return "Serious Error"
	}
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
	DBGLABELED("EXEC SYNC", `${OL(getCmdLine(cmdName, lArgs))}`)
	DBG(INDENT)
	const child = new Deno.Command(cmdName, {
		args: replaceInArray(lArgs, hReplace),
		env: {DEFAULT_LOGGER: getLogLevel()},
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
		): AutoPromise1<AutoPromise<TExecResult>> => {

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

	async handleFile(
			path: string,
			hOptions: hash
			): AutoPromise1<AutoPromise<TExecResult>> {

		type opt = {
			showFile: boolean
			}
		const {showFile} = getOptions<opt>(hOptions, {
			showFile: false
			})

		// --- mkpath() ensures we always pass a full, normalized path
		const fullPath = mkpath(path)
		const relPath = relpath(path)
		const hResult = await this.handle(fullPath, hOptions)
		if (hResult.success) {
			write((showFile ? `${this.op}: ${relPath} - OK\n` : '.'))
		}
		else {
			write(`${this.op}: ${relPath} - FAILED\n`)
			if (hResult.stderr) {
				writeln()
				writeln(hResult.stderr)
			}
		}
		return hResult
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export type TProcSpec = [string, CFileHandler]

export const procFiles = async (
		procSpec: TProcSpec,
		hOptions: hash = {}
		): AutoPromise1<AutoPromise<TExecResult[]>> => {

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
		results1.push(handler.handleFile(path, hOptions))
	};const lPromises =results1

	const lResults = await Promise.allSettled(lPromises)

	resetLine()
	const {op} = handler
	write(`(${op})`)
	let nOk = 0
	let nErr = 0
	let nRej = 0
	const lFinalResults: TExecResult[] = []
	let i1 = 0
	let i2 = 0;for (const h of lResults) {const i = i2++;
		const path = lPaths[i]
		const status = h.status
		if (status === 'fulfilled') {
			const {success, output} = h.value
			h.value.path = path
			lFinalResults.push(h.value)
			if (success) {
				nOk += 1
				if (flag('v')) {
					showOkResult(op, path)
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
		): AutoPromise1<AutoPromise<TExecResult>> => {

	type opt = {
		abortOnError: boolean
		}
	const {abortOnError} = getOptions<opt>(hOptions, {
		abortOnError: true
		})
	assert(existsSync(path), `No such file: ${path}`)
	const op = handler.op
	try {
		const hResult = await handler.handleFile(path, hOptions)
		const {success} = hResult
		resetLine()
		if (success) {
			showOkResult(op, path)
		}
		else {
			showErrResult(op, path, hResult)
			if (abortOnError) {
				Deno.exit(99)
			}
		}
		hResult.path = path
		return hResult
	}
	catch (err) {
		showRejResult(op, path, err)
		return { success: false, path }
	}
}

// ---------------------------------------------------------------------------

const showOkResult = (op: string, path: string): void => {

	resetLine()
	LOG(`${op} ${pathStr(path)}`)
	return
}

// ---------------------------------------------------------------------------

const showErrResult = (op: string, path: string, result: TExecResult): void => {

	resetLine()
	LOG(centered(`${op}: ${pathStr(path)}`, '-'))
	LOG("EXEC FAILED")
	LOG(result.stderr)
	LOG(sep())
	return
}

// ---------------------------------------------------------------------------

const showRejResult = (op: string, path: string, reason: unknown): void => {

	resetLine()
	LOG(centered(`${op}: ${pathStr(path)}`, '-'))
	LOG(`EXEC REJECTED: ${getErrStr(reason)}`)
	LOG(sep())
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
			): AutoPromise1<AutoPromise<TExecResult>> {

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
			): AutoPromise1<AutoPromise<TExecResult>> {

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
// ASYNC

export const typeCheckTsCode = async (
		tsCode: string
		): AutoPromise1<void> => {

	const path = barfTempFile(tsCode, {ext: '.ts'})
	const hResult = await execCmd('deno', ['check', path])
	if (!hResult.success && defined(hResult.stderr)) {
		croak(hResult.stderr)
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const saveTsCode = async (
		destPath: string,
		tsCode: string
		): AutoPromise1<void> => {

	const [code, hSrcMap] = extractSourceMap(tsCode)
	addJsonValue('sourcemap.jsonc', normalizePath(destPath), hSrcMap)
	await Deno.writeTextFile(destPath, code)
	return
}

// ---------------------------------------------------------------------------
// --- Due to a bug in either the v8 engine or Deno,
//     we have to generate, then remove the inline source map,
//     saving it to use in mapping source lines later

class CCivetCompiler extends CFileHandler {

	get op() {
		return 'doCompileCivet'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise1<AutoPromise<TExecResult>> {

		assert((fileExt(path) === '.civet'), `Not a civet file: ${path}`)
		const destPath = withExt(path, '.ts')
		if (
				   !hOptions.force
				&& existsSync(destPath)
				&& (statSync(destPath).mtimeMs > statSync(path).mtimeMs)
				&& haveSourceMapFor(path)
				) {
			return {success: true}
		}
		try {
			const civetCode = await slurpAsync(path)
			const tsCode: string = await compileCivet(civetCode, {
				...hCivetConfig,
				inlineMap: true,
				filename: path
				})
			if (!tsCode) {
				const errMsg = `COMPILE FAILED: ${pathStr(path)} - no code returned`
				return {
					success: false,
					stderr: errMsg,
					output: errMsg
					}
			}
			if (tsCode.startsWith('COMPILE FAILED')) {
				return {
					success: false,
					stderr: tsCode,
					output: tsCode
					}
			}

			let ok = true;try {
				await typeCheckTsCode(tsCode)
				return {success: true}
			}

			catch (err) {ok = false
				const errMsg = getErrStr(err)
				return {
					success: false,
					stderr: errMsg,
					output: errMsg
					}
			} finally {if(ok) {
				await saveTsCode(destPath, tsCode)
				return {success: true}
			}}
		}
		catch (err) {
			if (debugging) {
				LOG(err)
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stderr: errMsg,
				output: errMsg,
			}
		}
	}
}

export const doCompileCivet = new CCivetCompiler()

// ---------------------------------------------------------------------------

class CUnitTester extends CFileHandler {

	get op() {
		return 'doUnitTest'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise1<AutoPromise<TExecResult>> {

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")
		return await execCmd('deno', [
			'test',
			'-A',
			'--coverage-raw-data-only',
			path
			])
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
			): AutoPromise1<AutoPromise<TExecResult>> {

		assert((fileExt(path) === '.ts'), `Not a TypeScript file: ${path}`)
		const name = parsePath(path).stub.replaceAll('.', '_')
		const ret: Awaited<AutoPromise<TExecResult>> = await execCmd('deno', [
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
			): AutoPromise1<AutoPromise<TExecResult>> {

		const name = parsePath(path).stub.replaceAll('.', '_')
		const ret1: Awaited<AutoPromise<TExecResult>> = await execCmd('deno', [
			'uninstall',
			'-gA',
			name,
			path
		])
		return ret1
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
			): AutoPromise1<AutoPromise<TExecResult>> {

		assert((fileExt(path) === '.ts'), "Not a TypeScript file")
		return await execCmd('deno', [
			'run',
			'-A',
			path
		])
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
			): AutoPromise1<AutoPromise<TExecResult>> {

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
