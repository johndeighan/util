"use strict";
// civet.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {exists, existsSync} from '@std/fs'
import {stat, statSync} from 'node-fs'
import {Node, SourceFile} from 'npm-typescript'
import {RawSourceMap} from 'npm-source-map'

import {
	undef, defined, notdefined, hash, assert, isString, isHash,
	isEmpty, nonEmpty, croak, getErrStr,
	} from 'datatypes'
import {getOptions, o, rtrim} from 'llutils'
import {OL, ML} from 'to-nice'
import {LOG, DBG, ERR, DBGVALUE} from 'logger'
import {flag, debugging, inspecting} from 'cmd-args'
import {
	isFile, fileExt, withExt, slurp, slurpAsync, pathStr, touch,
	barf, barfTempFile, parsePath, addJsonValue, normalizePath,
	} from 'fsys'
import {
	execCmdSync, execCmd, CFileHandler, procFiles, TExecResult,
	} from 'exec'
import {ts2ast, analyzeTS, typeCheckTsCode} from 'typescript'
import {extractSourceMap, haveSourceMapFor} from 'source-map'

import hCivetConfig from "civetconfig" with {type: "json"};

// ---------------------------------------------------------------------------

export type TCivetOptions = {
	force?: boolean
	nocheck?: boolean
	inlineMap?: boolean
	}

// ---------------------------------------------------------------------------
// --- Due to a bug in either the v8 engine or Deno,
//     we have to generate, then remove the inline source map,
//     saving it to use in mapping source lines later

class CCivetCompiler extends CFileHandler {

	get op() {
		return 'doCompileCivet'
	}

	// ..........................................................
	// ASYNC

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		const {force, nocheck} = getOptions<TCivetOptions>(hOptions, {
			force: false,
			nocheck: false
			})

		assert((fileExt(path) === '.civet'), `Not a civet file: ${path}`)
		const tsPath = withExt(path, '.ts')

		// --- Check if a newer compiled version already exists
		if (
				   !force
				&& await exists(tsPath)
				&& (statSync(tsPath).mtimeMs > statSync(path).mtimeMs)
				&& haveSourceMapFor(tsPath)
				) {
			return {
				success: true,
				notNeeded: true,
				stdout: '',
				stderr: ''
				}
		}

		try {
			const hResult = await execCmd('deno', [
				'run', '-A',
				'@danielx/civet',
				'--config', 'C:/Users/johnd/civetconfig.json',
				'--inline-map',
				'-o', '.ts',
				'-c', path
				])
			if (!hResult.success) {
				console.log(this.getOutput(hResult))
				croak("Compile failed")
			}

			if (!nocheck) {
				const hCheckResult = await execCmd('deno', ['check', tsPath])
				if (!hCheckResult.success) {
					touch(path)
					console.log(hCheckResult.stderr)
					croak("Type check failed")
				}
			}

			const tsCode = await slurpAsync(tsPath)
			const [code, hSrcMap] = extractSourceMap(tsCode)
			if (defined(hSrcMap)) {
				addJsonValue('sourcemaps.json', normalizePath(tsPath), hSrcMap)
			}
			await Deno.writeTextFile(tsPath, code)
			return {
				success: true,
				stdout: '',
				stderr: ''
				}
		}

		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stdout: '',
				stderr: errMsg
				}
		}
	}

	// ..........................................................
	// SYNC

	handleSync(
			path: string,
			hOptions: hash = {}
			): TExecResult {

		const {force, nocheck} = getOptions<TCivetOptions>(hOptions, {
			force: false,
			nocheck: false
			})

		assert((fileExt(path) === '.civet'), `Not a civet file: ${path}`)
		const tsPath = withExt(path, '.ts')

		// --- Check if a newer compiled version already exists
		if (
				   !force
				&& existsSync(tsPath)
				&& (statSync(tsPath).mtimeMs > statSync(path).mtimeMs)
				&& haveSourceMapFor(tsPath)
				) {
			return {
				success: true,
				notNeeded: true,
				stdout: '',
				stderr: ''
				}
		}

		try {
			const hResult = execCmdSync('deno', [
				'run', '-A',
				'@danielx/civet',
				'--config', 'C:/Users/johnd/civetconfig.json',
				'--inline-map',
				'-o', '.ts',
				'-c', path
				])
			if (!hResult.success) {
				console.log(this.getOutput(hResult))
				croak("Compile failed")
			}

			if (!nocheck) {
				const hCheckResult = execCmdSync('deno', ['check', tsPath])
				if (!hCheckResult.success) {
					console.log(this.getOutput(hCheckResult))
					croak("Type check failed")
				}
			}

			const tsCode = slurp(tsPath)
			const [code, hSrcMap] = extractSourceMap(tsCode)
			if (defined(hSrcMap)) {
				addJsonValue('sourcemaps.json', normalizePath(tsPath), hSrcMap)
			}
			Deno.writeTextFileSync(tsPath, code)
			return {
				success: true,
				stdout: '',
				stderr: ''
				}
		}

		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stdout: '',
				stderr: errMsg
				}
		}
	}
}

export const doCompileCivet = new CCivetCompiler()

// ---------------------------------------------------------------------------
// SYNC

export const civet2tsFile = (
		civetPath: string,
		hOptions: hash = {}
		): string => {

	const hResult: TExecResult = doCompileCivet.handleSync(civetPath, hOptions)
	const {success} = hResult
	if (success) {
		return withExt(civetPath, '.ts')
	}
	else {
		const output = hResult.stdout + '\n' + hResult.stderr
		const errMsg = `compile of ${civetPath} failed\n${output}`
		ERR(errMsg)
		throw errMsg
	}
}

// ---------------------------------------------------------------------------

export const civet2ts = (
		civetCode: string,
		hOptions: hash = {},
		path: (string | undefined) = undef
		): string => {

	const tempPath = barfTempFile(civetCode, {ext: '.civet'})
	const tsPath = civet2tsFile(tempPath, hOptions)
	const tsCode = slurp(tsPath)
	return rtrim(tsCode)
}

// ---------------------------------------------------------------------------

export const civet2ast = (civetCode: string): Node => {

	const tsCode = civet2ts(civetCode)
	return ts2ast(tsCode)
}

// ---------------------------------------------------------------------------
// ASYNC

export const compileAllLibs = async (
		hOptions: hash = {}
		): AutoPromise<TExecResult[]> => {

	// --- with 'quiet' option, still reports errors
	return await procFiles([doCompileCivet, ['**/*.lib.civet']], {
		...hOptions,
		quiet: true
		})
}

// ---------------------------------------------------------------------------

// --- template literals to simplify displaying
//     the analysis of civet code

export const a = (lStrings: TemplateStringsArray): string => {
	const tsCode = civet2ts(lStrings[0], {nocheck: true})
	const result = analyzeTS(tsCode).asString()
	return result
}

export const A = (lStrings: TemplateStringsArray): string => {
	const tsCode = civet2ts(lStrings[0], {nocheck: true})
	const result = analyzeTS(tsCode, {dump: true}).asString()
	return result
}

