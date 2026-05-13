"use strict";
// exec.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {spawnSync} from 'node:child_process';
import {exists, existsSync} from '@std/fs'
import {stripAnsiCode} from '@std/fmt/colors'
import {
	CompilerOptions, ScriptTarget, ModuleKind, CompilerHost,
	createSourceFile, createProgram, getPreEmitDiagnostics,
	flattenDiagnosticMessageText, createCompilerHost,
	} from 'npm-typescript'
import {sprintf} from '@std/fmt/printf'

import {
	pass, undef, defined, notdefined, toRelPath,
	croak, assert, getErrStr,
	curLogLevel, pushLogLevel, popLogLevel,
	DBG, LOG, WARN, ERR, INDENT, UNDENT,
	write, writeln, resetLine, TIterator,
	colorize, decolorize, encode, decode,
	} from 'base'
import {
	hash, isEmpty, TStringMapper,
	isString, isArray, isArrayOfStrings, nonEmpty,
	} from 'datatypes'
import {awaitAll} from 'promise-utils'
import {arrayAndAccumFrom} from 'iter-utils'
import {MAP} from 'mapper'
import {
	getOptions, blockToArray, toBlock,
	sep, centered, allLinesInBlock, f,
	} from 'llutils'
import {flag, debugging, inspecting} from 'cmd-args'
import {OL, ML, DUMP, DBGVALUE, LOGVALUE} from 'to-nice'
import {
	barf, pathStr, allFilesMatching, normalizePath, barfTempFile,
	fileExt, withExt, slurpAsync, parsePath, openTextFile,
	} from 'fsys'

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
	outfile?: string
}

type TFileProcessor = (
		reader: TIterator<string>,
		metaData?: unknown
		) => TIterator<string>

// ---------------------------------------------------------------------------

export const mkstr = (
		item: string | BufferSource,
		processor: (TFileProcessor | undefined) = undef
		): string => {

	const str = (
		  isString(item) ? stripAnsiCode(item)
		: isArray(item)  ? stripAnsiCode(item.join(''))
		:                  stripAnsiCode(decode(item))
		)
	if (defined(processor)) {
		const iter = processor(allLinesInBlock(str))
		const lLines = Array.from(iter)
		return lLines.join('\n')
	}
	else {
		return str
	}
}

// ---------------------------------------------------------------------------

export const summarizeExec = (
		lResults: TExecResult[],
		action: string = 'executed'
		): string => {

	const numOK = MAP(lResults, 0, function(h, acc) {
		return h.success && !h.notNeeded ? acc+1 : acc
	})
	return (numOK === 0) ? '' : `${numOK} ${action}`
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
		tempFile: (string | undefined)
		outfile: (string | undefined)
		outProc: TFileProcessor
		}

	const {capture, infile, inProc, tempFile, outfile, outProc,
			} = getOptions<opt>(hOptions, {
		capture: true,
		infile: undef,
		inProc: (iter) => { return iter },
		tempFile: undef,
		outfile: undef,
		outProc: (iter) => { return iter }
		})

	debugger
	const streamType: TStreamType = capture ? 'piped' : 'inherit'
	if (defined(infile) || defined(outfile)) {
		assert(capture,
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
			const {hMetaData, reader} = openTextFile(infile)
			const iter = await inProc(reader, hMetaData)
			const text = toBlock(Array.from(iter))
			if (defined(tempFile)) {
				await Deno.writeTextFile(tempFile, text)
			}

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

		const stderr = rawStdErr ? await mkstr(rawStdErr) : ''
		const stdout = capture && rawStdOut ? await mkstr(rawStdOut, outProc) : ''
		return {
			success,
			stdout,
			stderr,
			outfile
			}
	}
	catch (err) {
		if (debugging) {
			ERR(err)
		}
		return {
			success: false,
			stderr: getErrStr(err)
			}
	}
}

// ---------------------------------------------------------------------------
// --- To do this synchronously, we have to use node's child_process lib

export const execCmdSync = (
		cmdName: string,
		lArgs: string[] = [],
		hOptions: hash = {}
		): TExecResult => {

	type opt = {
		capture: boolean
		infile: (string | undefined)
		inProc: (TFileProcessor | undefined)
		outfile: (string | undefined)
		outProc: (TFileProcessor | undefined)
		}

	const {capture, infile, inProc, outfile, outProc,
			} = getOptions<opt>(hOptions, {
		capture: true,
		infile: undef,
		inProc: undef,
		outfile: undef,
		outProc: undef
		})

	const cmdLine = getCmdLine(cmdName, lArgs)
	const streamType: string = capture ? 'pipe' : 'inherit'
	if (defined(infile) || defined(outfile)) {
		assert(capture,
			"When specifying infile or outfile, capture must be true")
	}

	DBGVALUE("EXEC SYNC", `${OL(cmdLine)}`)
	DBG(INDENT)
	const {stdout, stderr, error} = (
		(()=>{if (defined(infile)) {
			const {hMetaData, contents} = openTextFile(infile, true)
			return spawnSync(
				cmdName,
				lArgs,
				{
					input: mkstr(contents, inProc),
					encoding: 'utf-8',
					windowsHide: true
					})
		}
		else {
			return spawnSync(
				cmdName,
				lArgs,
				{
					encoding: 'utf-8',
					windowsHide: true
					})
		}})()
		)
	if (error) {
		DBG(UNDENT)
		return {
			success: false,
			stdout,
			stderr
			}
	}
	const finalStdOut = mkstr(stdout, outProc)
	DBG(UNDENT)
	if (defined(outfile)) {
		Deno.writeTextFileSync(outfile, finalStdOut)
		return {
			success: true,
			stdout: finalStdOut,
			stderr,
			outfile
			}
	}
	else {
		return {
			success: true,
			stdout: finalStdOut,
			stderr
			}
	}
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

	getOutput(hResult: TExecResult): string {

		return (hResult?.stdout || '') + (hResult?.stderr || '')
	}
}

// ---------------------------------------------------------------------------

export const prelog = (
		op: string,
		path: string,
		capture: boolean
		): void => {

	if (capture) {
		writeln(`${op} ${toRelPath(path)}`)
	}     // was just write
	else {
		writeln(`${op} ${toRelPath(path)} (no capture)`)
	}
	return
}

// ---------------------------------------------------------------------------
// --- only call if capture was true

export const postlog = (
		success: boolean,
		notNeeded: (boolean | undefined)
		): void => {

	if (success) {
		if (notNeeded) {
			writeln(f`${' - not needed'}:{yellow}`)
		}
		else {
			writeln(f`${' - OK'}:{green}`)
		}
	}
	else {
		writeln(` ${colorize('FAILED', 'red')}`)
	}
	return
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
		serial: boolean
		capture: boolean
		}
	const {quiet, abortOnError, serial, capture} = getOptions<opt>(hOptions, {
		quiet: false,
		abortOnError: false,
		serial: false,
		capture: true
		})

	const [handler, lPatterns] = procSpec
	const {op} = handler
	if (flag('v')) {
		writeln(`(${op})`)
	}

	const lPaths: string[] = Array.from(allFilesMatching(lPatterns))

	type TAccum = [
		TExecResult[],  // --- non-error result of execution
		string[],       //     array of error messages
		string[],       //     array of paths corresponding to non-error exec
		string[]       //     array of paths corresponding to errors
		]

	const lFinalResult = (
		(await (async ()=>{if (serial) {
			const acc0: TAccum = [[],[],[],[]]
			return MAP(lPaths, acc0, async function(path, acc): AutoPromise<TAccum> {
				// --- must return a TAccum
				const [lRes, lErrMsg, lPaths, lBadPaths] = acc
				prelog(op, path, capture)
				try {
					const xres: TExecResult = await handler.handle(path, hOptions)
					if (capture) {
						postlog(xres.success, xres.notNeeded)
					}
					return [
						[...lRes, xres],
						lErrMsg,
						[...lPaths, path],
						lBadPaths
						]
				}
				catch (err) {
					return [
						lRes,
						[...lErrMsg, getErrStr(err)],
						lPaths,
						[...lBadPaths, path]
						]
				}
			})
		}
		else {
			const results=[];for (const path of lPaths) {
				results.push(handler.handle(path, hOptions))
			};const lPromises =results
			return await awaitAll(lPromises, lPaths)
		}})())
		)

	const [lFulfilled, lRejected, lFulPaths, lRejPaths] = lFinalResult

	const acc0 = [0,0,0]
	const iter = MAP(lFulfilled, acc0, function*(h, acc2) {
		yield h
		const [n1, n2, n3] = acc2
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

	const [lAllResults, [nNotNeeded, nOk, nErr]] = arrayAndAccumFrom(iter)

	// --- Write results to the console

	let i1 = 0;for (const hResult of lAllResults) {const i = i1++;
		const path = lPaths[i]
		const {success} = hResult
		if (success) {
			if (flag('v')) {
				showOkResult(handler, path, hResult, hOptions)
			}
		}
		else {
			showErrResult(handler, path, hResult, hOptions)
		}
	}

	let i2 = 0;for (const reason of lRejected) {const i = i2++;
		showRejResult(handler, lRejPaths[i], getErrStr(reason), hOptions)
	}

	if (!quiet || (nOk + nErr > 0)) {
		showFinalResult(op, nNotNeeded, nOk, nErr, lRejected.length, lPatterns)
	}
	if (abortOnError && (nErr > 0)) {
		LOG("Aborting...")
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

	assert(capture || !dumpOutput, "Can't dumpOutput without capture")
	if (inspect) {
		LOG("procOneFile(): inspect is set")
	}

	// --- NOTE: if capture is false, we need to expect
	//           that when the handler is called,
	//           output will be produced

	const op = handler.op
	prelog(op, path, capture)

	try {
		const hResult = await handler.handle(path, hOptions)
		const {success, notNeeded} = hResult

		// --- If capture is false, output has already happened
		if (capture) {
			postlog(success, notNeeded)
			if (success) {
				if (dumpOutput) {
					showOkResult(handler, path, hResult, hOptions)
				}
			}
			else {
				showErrResult(handler, path, hResult, hOptions)
				if (abortOnError) {
					Deno.exit(99)
				}
			}
		}
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
			success: true
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
			success: true
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
				success: true
				}
		}
		else {
			return {
				success: true,
				notNeeded: true
				}
		}
	}
}

export const doRemoveTsFile = new CTsFileRemover()

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
		return await execCmd('deno', [
			'install',
			'--global',
			'--force',
			'--config', 'deno.json',
			'-A',
			'--name', name,
			path
			])
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
		return await execCmd('deno', [
			'uninstall',
			'-gA',
			name,
			path
			])
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

		const hResult = await execCmd('deno', [
			'run',
			'-A',
			...(inspect ? ['--inspect-brk'] : []),
			path
			], hOptions)
		if (label && !capture) {
			LOG(sep('-'))
		}
		return hResult
	}
}

export const doRun = new CFileRunner()

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlYy5saWIudHMiLCJzb3VyY2VzIjpbImV4ZWMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsaUJBQWdCO0FBQ2hCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUM7QUFDN0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQzdDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsZUFBZSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3pELENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztBQUN4RCxDQUFDLDRCQUE0QixDQUFDLENBQUMsa0JBQWtCLENBQUM7QUFDbEQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUN4QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQjtBQUN2QyxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDN0MsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDMUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDeEMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENB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QUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFBLEFBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNwQyxBQUFBLEdBQUcsS0FBSyxDQUFBO0FBQ1IsQUFBQSxHQUFHLElBQUksQ0FBQTtBQUNQLEFBQUEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3hDLEFBQUEsR0FBRyxJQUFJO0FBQ1AsQUFBQSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQTtBQUNkLEFBQUEsRUFBRSxHQUFHLENBQUEsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFJLE9BQU8sQ0FBQSxDQUFBLENBQUE7QUFDekIsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQztFQUFBLENBQUE7QUFDZixBQUFBLEVBQUUsTUFBTSxDQUFDLE87Q0FBTyxDO0FBQUEsQ0FBQTtBQUNoQixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ2pDIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGV4ZWMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge3NwYXduU3luY30gZnJvbSAnbm9kZTpjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0IHtleGlzdHMsIGV4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7c3RyaXBBbnNpQ29kZX0gZnJvbSAnQHN0ZC9mbXQvY29sb3JzJ1xyXG5pbXBvcnQge1xyXG5cdENvbXBpbGVyT3B0aW9ucywgU2NyaXB0VGFyZ2V0LCBNb2R1bGVLaW5kLCBDb21waWxlckhvc3QsXHJcblx0Y3JlYXRlU291cmNlRmlsZSwgY3JlYXRlUHJvZ3JhbSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLFxyXG5cdGZsYXR0ZW5EaWFnbm9zdGljTWVzc2FnZVRleHQsIGNyZWF0ZUNvbXBpbGVySG9zdCxcclxuXHR9IGZyb20gJ25wbS10eXBlc2NyaXB0J1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuXHJcbmltcG9ydCB7XHJcblx0cGFzcywgdW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIHRvUmVsUGF0aCxcclxuXHRjcm9haywgYXNzZXJ0LCBnZXRFcnJTdHIsXHJcblx0Y3VyTG9nTGV2ZWwsIHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsXHJcblx0REJHLCBMT0csIFdBUk4sIEVSUiwgSU5ERU5ULCBVTkRFTlQsXHJcblx0d3JpdGUsIHdyaXRlbG4sIHJlc2V0TGluZSwgVEl0ZXJhdG9yLFxyXG5cdGNvbG9yaXplLCBkZWNvbG9yaXplLCBlbmNvZGUsIGRlY29kZSxcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0aGFzaCwgaXNFbXB0eSwgVFN0cmluZ01hcHBlcixcclxuXHRpc1N0cmluZywgaXNBcnJheSwgaXNBcnJheU9mU3RyaW5ncywgbm9uRW1wdHksXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7YXdhaXRBbGx9IGZyb20gJ3Byb21pc2UtdXRpbHMnXHJcbmltcG9ydCB7YXJyYXlBbmRBY2N1bUZyb219IGZyb20gJ2l0ZXItdXRpbHMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcbmltcG9ydCB7XHJcblx0Z2V0T3B0aW9ucywgYmxvY2tUb0FycmF5LCB0b0Jsb2NrLFxyXG5cdHNlcCwgY2VudGVyZWQsIGFsbExpbmVzSW5CbG9jaywgZixcclxuXHR9IGZyb20gJ2xsdXRpbHMnXHJcbmltcG9ydCB7ZmxhZywgZGVidWdnaW5nLCBpbnNwZWN0aW5nfSBmcm9tICdjbWQtYXJncydcclxuaW1wb3J0IHtPTCwgTUwsIERVTVAsIERCR1ZBTFVFLCBMT0dWQUxVRX0gZnJvbSAndG8tbmljZSdcclxuaW1wb3J0IHtcclxuXHRiYXJmLCBwYXRoU3RyLCBhbGxGaWxlc01hdGNoaW5nLCBub3JtYWxpemVQYXRoLCBiYXJmVGVtcEZpbGUsXHJcblx0ZmlsZUV4dCwgd2l0aEV4dCwgc2x1cnBBc3luYywgcGFyc2VQYXRoLCBvcGVuVGV4dEZpbGUsXHJcblx0fSBmcm9tICdmc3lzJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRDbWRMaW5lIDo9IChjbWROYW1lOiBzdHJpbmcsIGxBcmdzOiBzdHJpbmdbXSk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNTdHJpbmcoY21kTmFtZSksIFwiY21kTmFtZSBub3QgYSBzdHJpbmc6ICN7T0woY21kTmFtZSl9XCJcclxuXHRhc3NlcnQgaXNBcnJheU9mU3RyaW5ncyhsQXJncyksIFwibm90IGFuIGFycmF5IG9mIHN0cmluZ3M6ICN7T0wobEFyZ3MpfVwiXHJcblx0Y21kTGluZSA6PSBcIiN7Y21kTmFtZX0gI3tsQXJncy5qb2luKCcgJyl9XCJcclxuXHREQkcgXCJjbWRMaW5lID0gI3tPTChjbWRMaW5lKX1cIlxyXG5cdHJldHVybiBjbWRMaW5lXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVFN0cmVhbVR5cGUgPSAncGlwZWQnIHwgJ2luaGVyaXQnXHJcblxyXG5leHBvcnQgdHlwZSBURXhlY1Jlc3VsdCA9XHJcblx0c3VjY2VzczogYm9vbGVhblxyXG5cdG5vdE5lZWRlZD86IHRydWVcclxuXHRzdGRvdXQ/OiBzdHJpbmdcclxuXHRzdGRlcnI/OiBzdHJpbmdcclxuXHRvdXRmaWxlPzogc3RyaW5nXHJcblxyXG50eXBlIFRGaWxlUHJvY2Vzc29yID0gKFxyXG5cdFx0cmVhZGVyOiBUSXRlcmF0b3I8c3RyaW5nPlxyXG5cdFx0bWV0YURhdGE/OiB1bmtub3duXHJcblx0XHQpID0+IFRJdGVyYXRvcjxzdHJpbmc+XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG1rc3RyIDo9IChcclxuXHRcdGl0ZW06IHN0cmluZyB8IEJ1ZmZlclNvdXJjZVxyXG5cdFx0cHJvY2Vzc29yOiBURmlsZVByb2Nlc3Nvcj8gPSB1bmRlZlxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHN0ciA6PSAoXHJcblx0XHQgIGlzU3RyaW5nKGl0ZW0pID8gc3RyaXBBbnNpQ29kZShpdGVtKVxyXG5cdFx0OiBpc0FycmF5KGl0ZW0pICA/IHN0cmlwQW5zaUNvZGUoaXRlbS5qb2luKCcnKSlcclxuXHRcdDogICAgICAgICAgICAgICAgICBzdHJpcEFuc2lDb2RlKGRlY29kZShpdGVtKSlcclxuXHRcdClcclxuXHRpZiBkZWZpbmVkKHByb2Nlc3NvcilcclxuXHRcdGl0ZXIgOj0gcHJvY2Vzc29yKGFsbExpbmVzSW5CbG9jayhzdHIpKVxyXG5cdFx0bExpbmVzIDo9IEFycmF5LmZyb20gaXRlclxyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3VtbWFyaXplRXhlYyA6PSAoXHJcblx0XHRsUmVzdWx0czogVEV4ZWNSZXN1bHRbXVxyXG5cdFx0YWN0aW9uOiBzdHJpbmcgPSAnZXhlY3V0ZWQnXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0bnVtT0sgOj0gTUFQIGxSZXN1bHRzLCAwLCAoaCwgYWNjKSAtPlxyXG5cdFx0cmV0dXJuIGguc3VjY2VzcyAmJiBub3QgaC5ub3ROZWVkZWQgPyBhY2MrMSA6IGFjY1xyXG5cdHJldHVybiAobnVtT0sgPT0gMCkgPyAnJyA6IFwiI3tudW1PS30gI3thY3Rpb259XCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBleGVjQ21kIDo9IChcclxuXHRcdGNtZE5hbWU6IHN0cmluZ1xyXG5cdFx0bEFyZ3M6IHN0cmluZ1tdID0gW11cclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRFeGVjUmVzdWx0ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0aW5maWxlOiBzdHJpbmc/XHJcblx0XHRpblByb2M6IFRGaWxlUHJvY2Vzc29yXHJcblx0XHR0ZW1wRmlsZTogc3RyaW5nP1xyXG5cdFx0b3V0ZmlsZTogc3RyaW5nP1xyXG5cdFx0b3V0UHJvYzogVEZpbGVQcm9jZXNzb3JcclxuXHRcdH1cclxuXHJcblx0e2NhcHR1cmUsIGluZmlsZSwgaW5Qcm9jLCB0ZW1wRmlsZSwgb3V0ZmlsZSwgb3V0UHJvYyxcclxuXHRcdFx0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNhcHR1cmU6IHRydWVcclxuXHRcdGluZmlsZTogdW5kZWZcclxuXHRcdGluUHJvYzogKGl0ZXIpID0+IHJldHVybiBpdGVyXHJcblx0XHR0ZW1wRmlsZTogdW5kZWZcclxuXHRcdG91dGZpbGU6IHVuZGVmXHJcblx0XHRvdXRQcm9jOiAoaXRlcikgPT4gcmV0dXJuIGl0ZXJcclxuXHRcdH1cclxuXHJcblx0ZGVidWdnZXJcclxuXHRzdHJlYW1UeXBlOiBUU3RyZWFtVHlwZSA6PSBjYXB0dXJlID8gJ3BpcGVkJyA6ICdpbmhlcml0J1xyXG5cdGlmIGRlZmluZWQoaW5maWxlKSB8fCBkZWZpbmVkKG91dGZpbGUpXHJcblx0XHRhc3NlcnQgY2FwdHVyZSxcclxuXHRcdFx0XCJXaGVuIHNwZWNpZnlpbmcgaW5maWxlIG9yIG91dGZpbGUsIGNhcHR1cmUgbXVzdCBiZSB0cnVlXCJcclxuXHREQkdWQUxVRSBcIkVYRUNcIiwgXCIje09MKGdldENtZExpbmUgY21kTmFtZSwgbEFyZ3MpfVwiXHJcblx0REJHIElOREVOVFxyXG5cdHRyeVxyXG5cdFx0Y21kIDo9IG5ldyBEZW5vLkNvbW1hbmQgY21kTmFtZSwge1xyXG5cdFx0XHRhcmdzOiBsQXJnc1xyXG5cdFx0XHRlbnY6IHtERUZBVUxUX0xPR0dFUjogY3VyTG9nTGV2ZWwoKX1cclxuXHRcdFx0c3RkaW46IHN0cmVhbVR5cGVcclxuXHRcdFx0c3Rkb3V0OiBzdHJlYW1UeXBlXHJcblx0XHRcdHN0ZGVycjogc3RyZWFtVHlwZVxyXG5cdFx0XHR9XHJcblx0XHRjaGlsZCA6PSBjbWQuc3Bhd24oKVxyXG5cdFx0aWYgZGVmaW5lZChpbmZpbGUpXHJcblx0XHRcdHtoTWV0YURhdGEsIHJlYWRlcn0gOj0gb3BlblRleHRGaWxlIGluZmlsZVxyXG5cdFx0XHRpdGVyIDo9IGF3YWl0IGluUHJvYyByZWFkZXIsIGhNZXRhRGF0YVxyXG5cdFx0XHR0ZXh0IDo9IHRvQmxvY2soQXJyYXkuZnJvbShpdGVyKSlcclxuXHRcdFx0aWYgZGVmaW5lZCh0ZW1wRmlsZSlcclxuXHRcdFx0XHRhd2FpdCBEZW5vLndyaXRlVGV4dEZpbGUgdGVtcEZpbGUsIHRleHRcclxuXHJcblx0XHRcdCMgLS0tIFdyaXRlIHRoZSBkYXRhIHRvIHRoZSBzdGRpbiBvZiB0aGUgY2hpbGQgcHJvY2Vzc1xyXG5cdFx0XHR3cml0ZXIgOj0gY2hpbGQuc3RkaW4uZ2V0V3JpdGVyKClcclxuXHRcdFx0YXdhaXQgd3JpdGVyLndyaXRlIGVuY29kZSh0ZXh0KVxyXG5cdFx0XHRhd2FpdCB3cml0ZXIuY2xvc2UoKVxyXG5cclxuXHRcdHtcclxuXHRcdFx0c3VjY2VzcyxcclxuXHRcdFx0c3Rkb3V0OiByYXdTdGRPdXRcclxuXHRcdFx0c3RkZXJyOiByYXdTdGRFcnJcclxuXHRcdFx0fSA6PSBhd2FpdCBjaGlsZC5vdXRwdXQoKVxyXG5cclxuXHRcdERCRyBVTkRFTlRcclxuXHRcdGlmIHN1Y2Nlc3MgJiYgY2FwdHVyZSAmJiBkZWZpbmVkKG91dGZpbGUpXHJcblx0XHRcdERlbm8ud3JpdGVUZXh0RmlsZVN5bmMgb3V0ZmlsZSwgZGVjb2RlKHJhd1N0ZE91dCkgKyBkZWNvZGUocmF3U3RkRXJyKVxyXG5cclxuXHRcdHN0ZGVyciA6PSByYXdTdGRFcnIgPyBhd2FpdCBta3N0cihyYXdTdGRFcnIpIDogJydcclxuXHRcdHN0ZG91dCA6PSBjYXB0dXJlICYmIHJhd1N0ZE91dCA/IGF3YWl0IG1rc3RyKHJhd1N0ZE91dCwgb3V0UHJvYykgOiAnJ1xyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3VjY2Vzc1xyXG5cdFx0XHRzdGRvdXRcclxuXHRcdFx0c3RkZXJyXHJcblx0XHRcdG91dGZpbGVcclxuXHRcdFx0fVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdEVSUiBlcnJcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHN1Y2Nlc3M6IGZhbHNlXHJcblx0XHRcdHN0ZGVycjogZ2V0RXJyU3RyKGVycilcclxuXHRcdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gVG8gZG8gdGhpcyBzeW5jaHJvbm91c2x5LCB3ZSBoYXZlIHRvIHVzZSBub2RlJ3MgY2hpbGRfcHJvY2VzcyBsaWJcclxuXHJcbmV4cG9ydCBleGVjQ21kU3luYyA6PSAoXHJcblx0XHRjbWROYW1lOiBzdHJpbmcsXHJcblx0XHRsQXJnczogc3RyaW5nW10gPSBbXSxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRFeGVjUmVzdWx0ID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0aW5maWxlOiBzdHJpbmc/XHJcblx0XHRpblByb2M6IFRGaWxlUHJvY2Vzc29yP1xyXG5cdFx0b3V0ZmlsZTogc3RyaW5nP1xyXG5cdFx0b3V0UHJvYzogVEZpbGVQcm9jZXNzb3I/XHJcblx0XHR9XHJcblxyXG5cdHtjYXB0dXJlLCBpbmZpbGUsIGluUHJvYywgb3V0ZmlsZSwgb3V0UHJvYyxcclxuXHRcdFx0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNhcHR1cmU6IHRydWVcclxuXHRcdGluZmlsZTogdW5kZWZcclxuXHRcdGluUHJvYzogdW5kZWZcclxuXHRcdG91dGZpbGU6IHVuZGVmXHJcblx0XHRvdXRQcm9jOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHRjbWRMaW5lIDo9IGdldENtZExpbmUgY21kTmFtZSwgbEFyZ3NcclxuXHRzdHJlYW1UeXBlOiBzdHJpbmcgOj0gY2FwdHVyZSA/ICdwaXBlJyA6ICdpbmhlcml0J1xyXG5cdGlmIGRlZmluZWQoaW5maWxlKSB8fCBkZWZpbmVkKG91dGZpbGUpXHJcblx0XHRhc3NlcnQgY2FwdHVyZSxcclxuXHRcdFx0XCJXaGVuIHNwZWNpZnlpbmcgaW5maWxlIG9yIG91dGZpbGUsIGNhcHR1cmUgbXVzdCBiZSB0cnVlXCJcclxuXHJcblx0REJHVkFMVUUgXCJFWEVDIFNZTkNcIiwgXCIje09MKGNtZExpbmUpfVwiXHJcblx0REJHIElOREVOVFxyXG5cdHtzdGRvdXQsIHN0ZGVyciwgZXJyb3J9IDo9IChcclxuXHRcdGlmIGRlZmluZWQoaW5maWxlKVxyXG5cdFx0XHR7aE1ldGFEYXRhLCBjb250ZW50c30gOj0gb3BlblRleHRGaWxlIGluZmlsZSwgdHJ1ZVxyXG5cdFx0XHRzcGF3blN5bmNcclxuXHRcdFx0XHRjbWROYW1lXHJcblx0XHRcdFx0bEFyZ3NcclxuXHRcdFx0XHR7XHJcblx0XHRcdFx0XHRpbnB1dDogbWtzdHIoY29udGVudHMsIGluUHJvYylcclxuXHRcdFx0XHRcdGVuY29kaW5nOiAndXRmLTgnXHJcblx0XHRcdFx0XHR3aW5kb3dzSGlkZTogdHJ1ZVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRzcGF3blN5bmNcclxuXHRcdFx0XHRjbWROYW1lXHJcblx0XHRcdFx0bEFyZ3NcclxuXHRcdFx0XHR7XHJcblx0XHRcdFx0XHRlbmNvZGluZzogJ3V0Zi04J1xyXG5cdFx0XHRcdFx0d2luZG93c0hpZGU6IHRydWVcclxuXHRcdFx0XHRcdH1cclxuXHRcdClcclxuXHRpZiBlcnJvclxyXG5cdFx0REJHIFVOREVOVFxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3VjY2VzczogZmFsc2VcclxuXHRcdFx0c3Rkb3V0XHJcblx0XHRcdHN0ZGVyclxyXG5cdFx0XHR9XHJcblx0ZmluYWxTdGRPdXQgOj0gbWtzdHIoc3Rkb3V0LCBvdXRQcm9jKVxyXG5cdERCRyBVTkRFTlRcclxuXHRpZiBkZWZpbmVkKG91dGZpbGUpXHJcblx0XHREZW5vLndyaXRlVGV4dEZpbGVTeW5jIG91dGZpbGUsIGZpbmFsU3RkT3V0XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzdWNjZXNzOiB0cnVlXHJcblx0XHRcdHN0ZG91dDogZmluYWxTdGRPdXRcclxuXHRcdFx0c3RkZXJyXHJcblx0XHRcdG91dGZpbGVcclxuXHRcdFx0fVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHN1Y2Nlc3M6IHRydWVcclxuXHRcdFx0c3Rkb3V0OiBmaW5hbFN0ZE91dFxyXG5cdFx0XHRzdGRlcnJcclxuXHRcdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGFzcyBDVGltZXJcclxuXHJcblx0dDAgPSBEYXRlLm5vdygpXHJcblxyXG5cdHRpbWVUYWtlbihcclxuXHRcdFx0cmVzZXQ6IGJvb2xlYW4gPSB0cnVlLFxyXG5cdFx0XHRkZWNQbGFjZXM6IG51bWJlciA9IDJcclxuXHRcdFx0KTogc3RyaW5nXHJcblxyXG5cdFx0bm93IDo9IERhdGUubm93KClcclxuXHRcdHNlY3MgOj0gKG5vdyAtIEB0MCkgLyAxMDAwXHJcblx0XHRpZiByZXNldFxyXG5cdFx0XHRAdDAgPSBub3dcclxuXHRcdHJldHVybiBzcHJpbnRmKFwiJS4je2RlY1BsYWNlc31kXCIsIHNlY3MpXHJcblxyXG50aW1lciA6PSBuZXcgQ1RpbWVyKClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGFic3RyYWN0IGdldCBvcCgpOiBzdHJpbmdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyBBU1lOQ1xyXG5cclxuXHRhYnN0cmFjdCBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2hcclxuXHRcdFx0KTogUHJvbWlzZTxURXhlY1Jlc3VsdD5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyBTWU5DXHJcblxyXG5cdGdldE91dHB1dChoUmVzdWx0OiBURXhlY1Jlc3VsdCk6IHN0cmluZ1xyXG5cclxuXHRcdHJldHVybiAoaFJlc3VsdD8uc3Rkb3V0IHx8ICcnKSArIChoUmVzdWx0Py5zdGRlcnIgfHwgJycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHByZWxvZyA6PSAoXHJcblx0XHRvcDogc3RyaW5nLFxyXG5cdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBjYXB0dXJlXHJcblx0XHR3cml0ZWxuIFwiI3tvcH0gI3t0b1JlbFBhdGgocGF0aCl9XCIgICAgICMgd2FzIGp1c3Qgd3JpdGVcclxuXHRlbHNlXHJcblx0XHR3cml0ZWxuIFwiI3tvcH0gI3t0b1JlbFBhdGgocGF0aCl9IChubyBjYXB0dXJlKVwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBvbmx5IGNhbGwgaWYgY2FwdHVyZSB3YXMgdHJ1ZVxyXG5cclxuZXhwb3J0IHBvc3Rsb2cgOj0gKFxyXG5cdFx0c3VjY2VzczogYm9vbGVhblxyXG5cdFx0bm90TmVlZGVkOiBib29sZWFuP1xyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHRpZiBzdWNjZXNzXHJcblx0XHRpZiBub3ROZWVkZWRcclxuXHRcdFx0d3JpdGVsbiBmXCIjeycgLSBub3QgbmVlZGVkJ306e3llbGxvd31cIlxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR3cml0ZWxuIGZcIiN7JyAtIE9LJ306e2dyZWVufVwiXHJcblx0ZWxzZVxyXG5cdFx0d3JpdGVsbiBcIiAje2NvbG9yaXplKCdGQUlMRUQnLCAncmVkJyl9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbiMgLS0tIExhdGVyLCBJIHdhbnQgdG8gYWxsb3cgcGFzc2luZyBtdWx0aXBsZSBUUHJvY1NwZWNzXHJcbiMgICAgIHN0cmluZyBpcyBhIGdsb2IgcGF0dGVyblxyXG5leHBvcnQgdHlwZSBUUHJvY1NwZWMgPSBbQ0ZpbGVIYW5kbGVyLCBsUGF0dGVybnM6IHN0cmluZ1tdXVxyXG5cclxuZXhwb3J0IHByb2NGaWxlcyA6PSAoXHJcblx0XHRwcm9jU3BlYzogVFByb2NTcGVjLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVEV4ZWNSZXN1bHRbXSA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdHF1aWV0OiBib29sZWFuXHJcblx0XHRhYm9ydE9uRXJyb3I6IGJvb2xlYW5cclxuXHRcdHNlcmlhbDogYm9vbGVhblxyXG5cdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0fVxyXG5cdHtxdWlldCwgYWJvcnRPbkVycm9yLCBzZXJpYWwsIGNhcHR1cmV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0cXVpZXQ6IGZhbHNlXHJcblx0XHRhYm9ydE9uRXJyb3I6IGZhbHNlXHJcblx0XHRzZXJpYWw6IGZhbHNlXHJcblx0XHRjYXB0dXJlOiB0cnVlXHJcblx0XHR9XHJcblxyXG5cdFtoYW5kbGVyLCBsUGF0dGVybnNdIDo9IHByb2NTcGVjXHJcblx0e29wfSA6PSBoYW5kbGVyXHJcblx0aWYgZmxhZygndicpXHJcblx0XHR3cml0ZWxuIFwiKCN7b3B9KVwiXHJcblxyXG5cdGxQYXRoczogc3RyaW5nW10gOj0gQXJyYXkuZnJvbSBhbGxGaWxlc01hdGNoaW5nKGxQYXR0ZXJucylcclxuXHJcblx0dHlwZSBUQWNjdW0gPSBbXHJcblx0XHRURXhlY1Jlc3VsdFtdICAjIC0tLSBub24tZXJyb3IgcmVzdWx0IG9mIGV4ZWN1dGlvblxyXG5cdFx0c3RyaW5nW10gICAgICAgIyAgICAgYXJyYXkgb2YgZXJyb3IgbWVzc2FnZXNcclxuXHRcdHN0cmluZ1tdICAgICAgICMgICAgIGFycmF5IG9mIHBhdGhzIGNvcnJlc3BvbmRpbmcgdG8gbm9uLWVycm9yIGV4ZWNcclxuXHRcdHN0cmluZ1tdICAgICAgICMgICAgIGFycmF5IG9mIHBhdGhzIGNvcnJlc3BvbmRpbmcgdG8gZXJyb3JzXHJcblx0XHRdXHJcblxyXG5cdGxGaW5hbFJlc3VsdCA6PSAoXHJcblx0XHRpZiBzZXJpYWxcclxuXHRcdFx0YWNjMDogVEFjY3VtIDo9IFtbXSxbXSxbXSxbXV1cclxuXHRcdFx0TUFQIGxQYXRocywgYWNjMCwgKHBhdGgsIGFjYyk6IFRBY2N1bSAtPlxyXG5cdFx0XHRcdCMgLS0tIG11c3QgcmV0dXJuIGEgVEFjY3VtXHJcblx0XHRcdFx0W2xSZXMsIGxFcnJNc2csIGxQYXRocywgbEJhZFBhdGhzXSA6PSBhY2NcclxuXHRcdFx0XHRwcmVsb2cgb3AsIHBhdGgsIGNhcHR1cmVcclxuXHRcdFx0XHR0cnlcclxuXHRcdFx0XHRcdHhyZXM6IFRFeGVjUmVzdWx0IDo9IGF3YWl0IGhhbmRsZXIuaGFuZGxlIHBhdGgsIGhPcHRpb25zXHJcblx0XHRcdFx0XHRpZiBjYXB0dXJlXHJcblx0XHRcdFx0XHRcdHBvc3Rsb2cgeHJlcy5zdWNjZXNzLCB4cmVzLm5vdE5lZWRlZFxyXG5cdFx0XHRcdFx0cmV0dXJuIFtcclxuXHRcdFx0XHRcdFx0Wy4uLmxSZXMsIHhyZXNdXHJcblx0XHRcdFx0XHRcdGxFcnJNc2dcclxuXHRcdFx0XHRcdFx0Wy4uLmxQYXRocywgcGF0aF1cclxuXHRcdFx0XHRcdFx0bEJhZFBhdGhzXHJcblx0XHRcdFx0XHRcdF1cclxuXHRcdFx0XHRjYXRjaCBlcnJcclxuXHRcdFx0XHRcdHJldHVybiBbXHJcblx0XHRcdFx0XHRcdGxSZXNcclxuXHRcdFx0XHRcdFx0Wy4uLmxFcnJNc2csIGdldEVyclN0cihlcnIpXVxyXG5cdFx0XHRcdFx0XHRsUGF0aHNcclxuXHRcdFx0XHRcdFx0Wy4uLmxCYWRQYXRocywgcGF0aF1cclxuXHRcdFx0XHRcdFx0XVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRsUHJvbWlzZXMgOj0gZm9yIHBhdGggb2YgbFBhdGhzXHJcblx0XHRcdFx0aGFuZGxlci5oYW5kbGUgcGF0aCwgaE9wdGlvbnNcclxuXHRcdFx0YXdhaXQgYXdhaXRBbGwobFByb21pc2VzLCBsUGF0aHMpXHJcblx0XHQpXHJcblxyXG5cdFtsRnVsZmlsbGVkLCBsUmVqZWN0ZWQsIGxGdWxQYXRocywgbFJlalBhdGhzXSA6PSBsRmluYWxSZXN1bHRcclxuXHJcblx0YWNjMCA6PSBbMCwwLDBdXHJcblx0aXRlciA6PSBNQVAgbEZ1bGZpbGxlZCwgYWNjMCwgKGgsIGFjYzIpIC0+XHJcblx0XHR5aWVsZCBoXHJcblx0XHRbbjEsIG4yLCBuM10gOj0gYWNjMlxyXG5cdFx0aWYgaC5zdWNjZXNzXHJcblx0XHRcdGlmIGgubm90TmVlZGVkXHJcblx0XHRcdFx0cmV0dXJuIFtuMSsxLCBuMiwgbjNdXHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRyZXR1cm4gW24xLCBuMisxLCBuM11cclxuXHRcdGVsc2VcclxuXHRcdFx0cmV0dXJuIFtuMSwgbjIsIG4zKzFdXHJcblxyXG5cdFtsQWxsUmVzdWx0cywgW25Ob3ROZWVkZWQsIG5PaywgbkVycl1dIDo9IGFycmF5QW5kQWNjdW1Gcm9tIGl0ZXJcclxuXHJcblx0IyAtLS0gV3JpdGUgcmVzdWx0cyB0byB0aGUgY29uc29sZVxyXG5cclxuXHRmb3IgaFJlc3VsdCxpIG9mIGxBbGxSZXN1bHRzXHJcblx0XHRwYXRoIDo9IGxQYXRoc1tpXVxyXG5cdFx0e3N1Y2Nlc3N9IDo9IGhSZXN1bHRcclxuXHRcdGlmIHN1Y2Nlc3NcclxuXHRcdFx0aWYgZmxhZygndicpXHJcblx0XHRcdFx0c2hvd09rUmVzdWx0IGhhbmRsZXIsIHBhdGgsIGhSZXN1bHQsIGhPcHRpb25zXHJcblx0XHRlbHNlXHJcblx0XHRcdHNob3dFcnJSZXN1bHQgaGFuZGxlciwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcclxuXHJcblx0Zm9yIHJlYXNvbixpIG9mIGxSZWplY3RlZFxyXG5cdFx0c2hvd1JlalJlc3VsdCBoYW5kbGVyLCBsUmVqUGF0aHNbaV0sIGdldEVyclN0cihyZWFzb24pLCBoT3B0aW9uc1xyXG5cclxuXHRpZiBub3QgcXVpZXQgfHwgKG5PayArIG5FcnIgPiAwKVxyXG5cdFx0c2hvd0ZpbmFsUmVzdWx0IG9wLCBuTm90TmVlZGVkLCBuT2ssIG5FcnIsIGxSZWplY3RlZC5sZW5ndGgsIGxQYXR0ZXJuc1xyXG5cdGlmIGFib3J0T25FcnJvciAmJiAobkVyciA+IDApXHJcblx0XHRMT0cgXCJBYm9ydGluZy4uLlwiXHJcblx0XHREZW5vLmV4aXQgLTFcclxuXHRyZXR1cm4gbEZ1bGZpbGxlZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmxldCBoZWFkZXJQcmludGVkID0gZmFsc2VcclxuXHJcbnNob3dGaW5hbFJlc3VsdCA6PSAoXHJcblx0XHRvcDogc3RyaW5nLFxyXG5cdFx0bm90TmVlZGVkOiBudW1iZXIsXHJcblx0XHRuT2s6IG51bWJlcixcclxuXHRcdG5FcnI6IG51bWJlcixcclxuXHRcdG5SZWo6IG51bWJlcixcclxuXHRcdGxQYXR0ZXJuczogc3RyaW5nW11cclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0cmVzZXRMaW5lKClcclxuXHRpZiBmbGFnKCd2JylcclxuXHRcdHJldHVyblxyXG5cdGlmIG5vdCBoZWFkZXJQcmludGVkXHJcblx0XHRMT0cgJy0nLnJlcGVhdCA0NlxyXG5cdFx0TE9HIFtcclxuXHRcdFx0c3ByaW50ZignJTZzJywgJ3NlY3MuJylcclxuXHRcdFx0c3ByaW50ZignJS0xNHMnLCAnb3AnKVxyXG5cdFx0XHRzcHJpbnRmKCclM3MnLCAnbm5kJylcclxuXHRcdFx0c3ByaW50ZignJTNzJywgJ09LJylcclxuXHRcdFx0c3ByaW50ZignJTNzJywgJ0JhZCcpXHJcblx0XHRcdHNwcmludGYoJyUzcycsICdSZWonKVxyXG5cdFx0XHQnZmlsZShzKSdcclxuXHRcdF0uam9pbiAnICdcclxuXHRcdExPRyAnLScucmVwZWF0IDQ2XHJcblx0XHRoZWFkZXJQcmludGVkID0gdHJ1ZVxyXG5cdExPRyBbXHJcblx0XHRzcHJpbnRmKCclNi4yZicsIHRpbWVyLnRpbWVUYWtlbigpKVxyXG5cdFx0c3ByaW50ZignJS0xNHMnLCBvcClcclxuXHRcdHNwcmludGYoJyUzZCcsIG5vdE5lZWRlZClcclxuXHRcdHNwcmludGYoJyUzZCcsIG5PaylcclxuXHRcdHNwcmludGYoJyUzZCcsIG5FcnIpXHJcblx0XHRzcHJpbnRmKCclM2QnLCBuUmVqKVxyXG5cdFx0bFBhdHRlcm5zLmpvaW4oJyArICcpXHJcblx0XS5qb2luICcgJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IHByb2NPbmVGaWxlIDo9IChcclxuXHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdGhhbmRsZXI6IENGaWxlSGFuZGxlcixcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IFRFeGVjUmVzdWx0ID0+XHJcblxyXG5cdGFzc2VydCBkZWZpbmVkKHBhdGgpICYmIGV4aXN0c1N5bmMocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGNhcHR1cmU6IGJvb2xlYW5cclxuXHRcdGR1bXBPdXRwdXQ6IGJvb2xlYW5cclxuXHRcdGFib3J0T25FcnJvcjogYm9vbGVhblxyXG5cdFx0aW5zcGVjdDogYm9vbGVhblxyXG5cdFx0fVxyXG5cdHtcclxuXHRcdGNhcHR1cmUsIGR1bXBPdXRwdXQsIGFib3J0T25FcnJvciwgaW5zcGVjdFxyXG5cdFx0fSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdFx0Y2FwdHVyZTogdHJ1ZVxyXG5cdFx0XHRkdW1wT3V0cHV0OiBmYWxzZVxyXG5cdFx0XHRhYm9ydE9uRXJyb3I6IHRydWVcclxuXHRcdFx0aW5zcGVjdDogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRhc3NlcnQgY2FwdHVyZSB8fCBub3QgZHVtcE91dHB1dCwgXCJDYW4ndCBkdW1wT3V0cHV0IHdpdGhvdXQgY2FwdHVyZVwiXHJcblx0aWYgaW5zcGVjdFxyXG5cdFx0TE9HIFwicHJvY09uZUZpbGUoKTogaW5zcGVjdCBpcyBzZXRcIlxyXG5cclxuXHQjIC0tLSBOT1RFOiBpZiBjYXB0dXJlIGlzIGZhbHNlLCB3ZSBuZWVkIHRvIGV4cGVjdFxyXG5cdCMgICAgICAgICAgIHRoYXQgd2hlbiB0aGUgaGFuZGxlciBpcyBjYWxsZWQsXHJcblx0IyAgICAgICAgICAgb3V0cHV0IHdpbGwgYmUgcHJvZHVjZWRcclxuXHJcblx0b3AgOj0gaGFuZGxlci5vcFxyXG5cdHByZWxvZyhvcCwgcGF0aCwgY2FwdHVyZSlcclxuXHJcblx0dHJ5XHJcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGhhbmRsZXIuaGFuZGxlIHBhdGgsIGhPcHRpb25zXHJcblx0XHR7c3VjY2Vzcywgbm90TmVlZGVkfSA6PSBoUmVzdWx0XHJcblxyXG5cdFx0IyAtLS0gSWYgY2FwdHVyZSBpcyBmYWxzZSwgb3V0cHV0IGhhcyBhbHJlYWR5IGhhcHBlbmVkXHJcblx0XHRpZiBjYXB0dXJlXHJcblx0XHRcdHBvc3Rsb2cgc3VjY2Vzcywgbm90TmVlZGVkXHJcblx0XHRcdGlmIHN1Y2Nlc3NcclxuXHRcdFx0XHRpZiBkdW1wT3V0cHV0XHJcblx0XHRcdFx0XHRzaG93T2tSZXN1bHQgaGFuZGxlciwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcclxuXHRcdFx0ZWxzZVxyXG5cdFx0XHRcdHNob3dFcnJSZXN1bHQgaGFuZGxlciwgcGF0aCwgaFJlc3VsdCwgaE9wdGlvbnNcclxuXHRcdFx0XHRpZiBhYm9ydE9uRXJyb3JcclxuXHRcdFx0XHRcdERlbm8uZXhpdCA5OVxyXG5cdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRpZiBjYXB0dXJlXHJcblx0XHRcdHNob3dSZWpSZXN1bHQgaGFuZGxlciwgcGF0aCwgZXJyLCBoT3B0aW9uc1xyXG5cdFx0aWYgYWJvcnRPbkVycm9yXHJcblx0XHRcdERlbm8uZXhpdCA5OVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3VjY2VzczogZmFsc2UsXHJcblx0XHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5zaG93T2tSZXN1bHQgOj0gKFxyXG5cdFx0aGFuZGxlcjogQ0ZpbGVIYW5kbGVyXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdGhSZXN1bHQ6IFRFeGVjUmVzdWx0XHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGlmIGhSZXN1bHQubm90TmVlZGVkXHJcblx0XHRMT0cgXCJOT1QgTkVFREVEXCJcclxuXHRcdHJldHVyblxyXG5cdHtvcH0gOj0gaGFuZGxlclxyXG5cdG91dHB1dCA6PSBoYW5kbGVyLmdldE91dHB1dChoUmVzdWx0KVxyXG5cdGlmIGRlZmluZWQob3V0cHV0KSAmJiBub25FbXB0eShvdXRwdXQpXHJcblx0XHREVU1QIG91dHB1dCwgJ09VVFBVVCdcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5zaG93RXJyUmVzdWx0IDo9IChcclxuXHRcdGhhbmRsZXI6IENGaWxlSGFuZGxlclxyXG5cdFx0cGF0aDogc3RyaW5nXHJcblx0XHRoUmVzdWx0OiBURXhlY1Jlc3VsdFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHR7b3B9IDo9IGhhbmRsZXJcclxuXHRvdXRwdXQgOj0gaGFuZGxlci5nZXRPdXRwdXQoaFJlc3VsdClcclxuXHRpZiBvdXRwdXRcclxuXHRcdERVTVAgb3V0cHV0LCAnT1VUUFVUJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnNob3dSZWpSZXN1bHQgOj0gKFxyXG5cdFx0aGFuZGxlcjogQ0ZpbGVIYW5kbGVyXHJcblx0XHRwYXRoOiBzdHJpbmdcclxuXHRcdHJlYXNvbjogdW5rbm93blxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogdm9pZCA9PlxyXG5cclxuXHREVU1QIHJlYXNvbiwgJ0VSUk9SJ1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICAgICBGaWxlSGFuZGxlcnNcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENGaWxlUmVtb3ZlciBleHRlbmRzIENGaWxlSGFuZGxlclxyXG5cclxuXHRnZXQgb3AoKVxyXG5cdFx0cmV0dXJuICdkb1JlbW92ZUZpbGUnXHJcblxyXG5cdG92ZXJyaWRlIGhhbmRsZShcclxuXHRcdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHRcdCk6IFRFeGVjUmVzdWx0XHJcblxyXG5cdFx0aWYgZXhpc3RzU3luYyhwYXRoKVxyXG5cdFx0XHRhd2FpdCBEZW5vLnJlbW92ZSBwYXRoXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzdWNjZXNzOiB0cnVlXHJcblx0XHRcdH1cclxuXHJcbmV4cG9ydCBkb1JlbW92ZUZpbGUgOj0gbmV3IENGaWxlUmVtb3ZlcigpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuY2xhc3MgQ0ZpbGVFY2hvZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9FY2hvRmlsZSdcclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRMT0cgYXdhaXQgZXhpc3RzKHBhdGgpID8gXCIje3BhdGh9XCIgOiBcIiN7cGF0aH0gLSAjeydkb2VzIG5vdCBleGlzdCd9OntyZWR9XCJcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHN1Y2Nlc3M6IHRydWVcclxuXHRcdFx0fVxyXG5cclxuZXhwb3J0IGRvRWNob0ZpbGUgOj0gbmV3IENGaWxlRWNob2VyKClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5jbGFzcyBDVHNGaWxlUmVtb3ZlciBleHRlbmRzIENGaWxlSGFuZGxlclxyXG5cclxuXHRnZXQgb3AoKVxyXG5cdFx0cmV0dXJuICdkb1JlbW92ZVRzRmlsZSdcclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRhc3NlcnQgKGZpbGVFeHQocGF0aCkgPT0gJy50cycpLCBcIk5vdCBhIFR5cGVTY3JpcHQgZmlsZTogI3twYXRofVwiXHJcblx0XHRjaXZldFBhdGggOj0gd2l0aEV4dCBwYXRoLCAnLmNpdmV0J1xyXG5cdFx0aWYgYXdhaXQgZXhpc3RzKGNpdmV0UGF0aClcclxuXHRcdFx0YXdhaXQgRGVuby5yZW1vdmUgcGF0aFxyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWVcclxuXHRcdFx0XHR9XHJcblx0XHRlbHNlXHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0c3VjY2VzczogdHJ1ZVxyXG5cdFx0XHRcdG5vdE5lZWRlZDogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHJcbmV4cG9ydCBkb1JlbW92ZVRzRmlsZSA6PSBuZXcgQ1RzRmlsZVJlbW92ZXIoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENDbWRJbnN0YWxsZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9JbnN0YWxsQ21kJ1xyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdGFzc2VydCAoZmlsZUV4dChwYXRoKSA9PSAnLnRzJyksIFwiTm90IGEgVHlwZVNjcmlwdCBmaWxlOiAje3BhdGh9XCJcclxuXHRcdG5hbWUgOj0gcGFyc2VQYXRoKHBhdGgpLnN0dWIucmVwbGFjZUFsbCAnLicsICdfJ1xyXG5cdFx0cmV0dXJuIGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdCdpbnN0YWxsJ1xyXG5cdFx0XHQnLS1nbG9iYWwnXHJcblx0XHRcdCctLWZvcmNlJ1xyXG5cdFx0XHQnLS1jb25maWcnLCAnZGVuby5qc29uJ1xyXG5cdFx0XHQnLUEnXHJcblx0XHRcdCctLW5hbWUnLCBuYW1lXHJcblx0XHRcdHBhdGhcclxuXHRcdFx0XVxyXG5cclxuZXhwb3J0IGRvSW5zdGFsbENtZCA6PSBuZXcgQ0NtZEluc3RhbGxlcigpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuY2xhc3MgQ0NtZFVuaW5zdGFsbGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvVW5pbnN0YWxsQ21kJ1xyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdG5hbWUgOj0gcGFyc2VQYXRoKHBhdGgpLnN0dWIucmVwbGFjZUFsbCAnLicsICdfJ1xyXG5cdFx0cmV0dXJuIGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdCd1bmluc3RhbGwnXHJcblx0XHRcdCctZ0EnXHJcblx0XHRcdG5hbWVcclxuXHRcdFx0cGF0aFxyXG5cdFx0XHRdXHJcblxyXG5leHBvcnQgZG9Vbmluc3RhbGxDbWQgOj0gbmV3IENDbWRVbmluc3RhbGxlcigpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuY2xhc3MgQ0ZpbGVSdW5uZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9SdW4nXHJcblxyXG5cdG92ZXJyaWRlIGhhbmRsZShcclxuXHRcdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHRcdCk6IFRFeGVjUmVzdWx0XHJcblxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdGluc3BlY3Q6IGJvb2xlYW5cclxuXHRcdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0XHRsYWJlbDogc3RyaW5nP1xyXG5cdFx0XHR9XHJcblx0XHR7aW5zcGVjdCwgY2FwdHVyZSwgbGFiZWx9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRpbnNwZWN0OiBmYWxzZVxyXG5cdFx0XHRjYXB0dXJlOiB0cnVlXHJcblx0XHRcdGxhYmVsOiB1bmRlZlxyXG5cdFx0XHR9XHJcblxyXG5cdFx0YXNzZXJ0IChmaWxlRXh0KHBhdGgpID09ICcudHMnKSwgXCJOb3QgYSBUeXBlU2NyaXB0IGZpbGVcIlxyXG5cdFx0aWYgbGFiZWwgJiYgbm90IGNhcHR1cmVcclxuXHRcdFx0TE9HIHNlcCgnLScsIGxhYmVsKVxyXG5cclxuXHRcdGhSZXN1bHQgOj0gYXdhaXQgZXhlY0NtZCAnZGVubycsIFtcclxuXHRcdFx0J3J1bidcclxuXHRcdFx0Jy1BJ1xyXG5cdFx0XHQuLi4oaW5zcGVjdCA/IFsnLS1pbnNwZWN0LWJyayddIDogW10pXHJcblx0XHRcdHBhdGhcclxuXHRcdFx0XSwgaE9wdGlvbnNcclxuXHRcdGlmIGxhYmVsICYmIG5vdCBjYXB0dXJlXHJcblx0XHRcdExPRyBzZXAoJy0nKVxyXG5cdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcbmV4cG9ydCBkb1J1biA6PSBuZXcgQ0ZpbGVSdW5uZXIoKVxyXG4iXX0=