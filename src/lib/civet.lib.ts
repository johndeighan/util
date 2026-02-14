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
import {getOptions, o} from 'llutils'
import {OL, ML} from 'to-nice'
import {LOG, DBG, ERR, DBGVALUE} from 'logger'
import {flag, debugging, inspecting} from 'cmd-args'
import {
	isFile, fileExt, withExt, slurp, slurpAsync, pathStr,
	barf, barfTempFile, parsePath, addJsonValue, normalizePath,
	} from 'fsys'
import {
	THandlerResult, execCmdSync, execCmd, CFileHandler,
	} from 'exec'
import {ts2ast, analyze, typeCheckTsCode} from 'typescript'
import {extractSourceMap, haveSourceMapFor} from 'source-map'

import hCivetConfig from "civetconfig" with {type: "json"};

// ---------------------------------------------------------------------------

export type TCivetOptions = {
	force?: boolean
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
			): AutoPromise<THandlerResult> {

		const {force} = getOptions<TCivetOptions>(hOptions, {
			force: false
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
				path,
				success: true,
				notNeeded: true
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
				console.log(hResult.output)
				croak("Compile failed")
			}

			const hCheckResult = await execCmd('deno', ['check', tsPath])
			if (!hCheckResult.success) {
				console.log(hCheckResult.output)
				croak("Type check failed")
			}

			const tsCode = await slurpAsync(tsPath)
			const [code, hSrcMap] = extractSourceMap(tsCode)
			if (defined(hSrcMap)) {
				addJsonValue('sourcemaps.json', normalizePath(tsPath), hSrcMap)
			}
			await Deno.writeTextFile(tsPath, code)
			return {path, success: true}
		}

		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				path,
				success: false,
				stderr: errMsg,
				output: errMsg
				}
		}
	}

	// ..........................................................
	// SYNC

	handleSync(
			path: string,
			hOptions: hash = {}
			): THandlerResult {

		const {force} = getOptions<TCivetOptions>(hOptions, {
			force: false
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
				path,
				success: true,
				notNeeded: true
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
				console.log(hResult.output)
				croak("Compile failed")
			}

			const hCheckResult = execCmdSync('deno', ['check', tsPath])
			if (!hCheckResult.success) {
				console.log(hCheckResult.output)
				croak("Type check failed")
			}

			const tsCode = slurp(tsPath)
			const [code, hSrcMap] = extractSourceMap(tsCode)
			if (defined(hSrcMap)) {
				addJsonValue('sourcemaps.json', normalizePath(tsPath), hSrcMap)
			}
			Deno.writeTextFileSync(tsPath, code)
			return {path, success: true}
		}

		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				path,
				success: false,
				stderr: errMsg,
				output: errMsg
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

	const hResult: THandlerResult = doCompileCivet.handleSync(civetPath, hOptions)
	const {success, output} = hResult
	if (success) {
		return withExt(civetPath, '.ts')
	}
	else {
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
	return slurp(tsPath)
}

// ---------------------------------------------------------------------------

export const civet2ast = (civetCode: string): Node => {

	const tsCode = civet2ts(civetCode)
	return ts2ast(tsCode)
}

// ---------------------------------------------------------------------------

// --- template literals to simplify displaying
//     the analysis of civet code

export const a = (lStrings: TemplateStringsArray): string => {
	return analyze(civet2ts(lStrings[0])).asString()
}

export const A = (lStrings: TemplateStringsArray): string => {
	return analyze(civet2ts(lStrings[0]), o`dump`).asString()
}
