"use strict";
// civet.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {existsSync} from '@std/fs'
import {statSync} from 'node-fs'
import {Node, SourceFile} from 'npm-typescript'
import {compile as compileCivet} from '@danielx/civet'
import {RawSourceMap} from 'npm-source-map'

import {
	undef, defined, notdefined, hash, assert, isString, isHash,
	} from 'datatypes'
import {getOptions, o, getErrStr} from 'llutils'
import {OL, ML} from 'to-nice'
import {LOG, DBG, DBGVALUE} from 'logger'
import {flag, debugging, inspecting} from 'cmd-args'
import {
	isFile, fileExt, withExt, slurp, slurpAsync, pathStr,
	barf, barfTempFile, parsePath, addJsonValue, normalizePath,
	} from 'fsys'
import {
	TExecResult, execCmdSync, execCmd, CFileHandler,
	} from 'exec'
import {ts2ast, analyze} from 'typescript'
import {extractSourceMap, haveSourceMapFor} from 'source-map'

import hCivetConfig from "civetconfig" with { type: "json" };

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
			): AutoPromise<TExecResult> {

		assert((fileExt(path) === '.civet'), `Not a civet file: ${path}`)
		const destPath = withExt(path, '.ts')

		// --- Check if a newer compiled version already exists
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
			if (!tsCode || tsCode.startsWith('COMPILE FAILED')) {
				const errMsg = `CIVET COMPILE FAILED: ${pathStr(path)}`
				return {
					success: false,
					stderr: errMsg,
					output: errMsg
					}
			}
			const tempPath = barfTempFile(tsCode, {ext: '.ts'})
			const hResult = await execCmd('deno', ['check', tempPath])
			assert(hResult.success, "Type check failed")
			const [code, hSrcMap] = extractSourceMap(tsCode)
			if (defined(hSrcMap)) {
				addJsonValue('sourcemap.jsonc', normalizePath(destPath), hSrcMap)
			}
			await Deno.writeTextFile(destPath, code)
			return {success: true}
		}
		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
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

export const civet2tsFile = (
		path: string,
		tsPath: string = withExt(path, '.ts'),
		hOptions: hash = {}
		): string => {

	assert((fileExt(path) === '.civet'), `Not a civet file: ${OL(path)}`)
	assert(isFile(path), `No such file: ${OL(path)}`)
	type opt = {
		nomap: boolean
		}
	const {nomap} = getOptions<opt>(hOptions, {
		nomap: false
		})

	execCmdSync('deno', [
		'run',
		'-A',
		'npm:@danielx/civet',
		...(nomap? [] : ['--inline-map']),
		'-o',
		tsPath,
		'-c',
		path
	])
	assert(isFile(tsPath), `File not created: ${OL(tsPath)}`)
	return tsPath
}

// ---------------------------------------------------------------------------

export const civet2ts = (
		civetCode: string,
		hOptions: hash = {}
		): string => {

	const tempFilePath = barfTempFile(civetCode)
	const tsFilePath = withExt(tempFilePath, '.ts')
	civet2tsFile(tempFilePath, tsFilePath, hOptions)
	const contents = slurp(tsFilePath)
	return contents
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