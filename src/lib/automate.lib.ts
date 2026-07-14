"use strict";
// automate.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {compile as compileSvelte} from 'npm-svelte/compiler'

import {
	LOG, DBG, WARN, ERR, INDENT, UNDENT,
	} from 'logger'
import {
	undef, defined, notdefined, toRelPath,
	croak, assert, getErrStr, allOf,
	} from 'base'
import {
	nonEmptyString, hash, hashof, isArray,
	} from 'datatypes'
import {keys, getOptions} from 'llutils'
import {OL, DBGVALUE} from 'nice'
import {
	slurp, barf, patchFirstLine, parsePath, configFromFile,
	isFile, rmFile, findFile, withExt, fileExt,
	newerDestFileExists, allFilesMatching,
	} from 'fsys'
import {
	execCmd, CFileHandler, TExecResult,
	} from 'exec'
import {cielo2civetFile} from 'cielo'

// ---------------------------------------------------------------------------
// Please, no dependencies on the directory structure!
// ---------------------------------------------------------------------------

export type TCompilerFunc = (path: string, hOptions: hash) => TExecResult
export type TPostProcessor = (path: string, hOptions: hash) => TExecResult

export type TCompilerInfo = {
	isInstalled: () => boolean
	compiler: TCompilerFunc
	getOutPaths: (path: string) => string[]
	}

export const isCompilerInfo = (x: unknown): x is TCompilerInfo => {
	if ((typeof x === 'object') && (x !== null)) {
		return ('isInstalled' in x) && ('compiler' in x) && ('getOutPaths' in x)
	}
	else {
		return false
	}
}

export type TCompilerConfig = {
	hCompilers: hashof<TCompilerInfo> // <string>: <TCompilerInfo>
	hPostProcessors: hashof<TPostProcessor>
} // <string>: <TPostProcessor>

export const isCompilerConfig = (x: unknown): x is TCompilerConfig => {
	if ((typeof x === 'object') && (x !== null)) {
		return ('hCompilers' in x) && ('hPostProcessors' in x)
	}
	else {
		return false
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export const getCompilerInfo = async (
		ext: string
		):AutoPromise<(TCompilerInfo | undefined)> => {

	const hConfig = await getCompilerConfig()
	return hConfig.hCompilers[ext]
}

// ---------------------------------------------------------------------------
// ASYNC

let cachedFileName: (string | undefined) = undef
let hCachedConfig: (TCompilerConfig | undefined) = undef

export const getCompilerConfig = async (
		fileName: string = 'compile.config.civet'
		): AutoPromise<TCompilerConfig> => {

	// --- if cached, return cached config
	if (defined(hCachedConfig) && (fileName === cachedFileName)) {
		return hCachedConfig
	}

	let hConfig = await configFromFile(fileName)

	DBGVALUE('hConfig', hConfig)
	assert(isCompilerConfig(hConfig), `Bad compiler config: ${hConfig}`)

	// --- Remove any compilers for which the
	//     compiler software has not been installed
	const {hCompilers} = hConfig
	for (const ext of keys(hCompilers)) {
		const {isInstalled} = hCompilers[ext]
		if (!await isInstalled()) {
			DBG(`Deleting compiler for ext ${OL(ext)}`)
			delete hCompilers[ext]
		}
	}

	hCachedConfig = hConfig
	cachedFileName = fileName
	return hConfig
}

// ---------------------------------------------------------------------------
// ASYNC

export const getPostProcessor = async (
		purpose: string
		):AutoPromise<(TPostProcessor | undefined)> => {

	const hConfig = await getCompilerConfig()
	const pp = hConfig.hPostProcessors[purpose]
	if (defined(pp)) {
		return pp
	}
	else {
		DBG(`No post processor for ${purpose} files`)
		return undef
	}
}

// ---------------------------------------------------------------------------

class CFileCompiler extends CFileHandler {

	get op() {
		return 'doCompileFile'
	}

	// ..........................................................
	// ASYNC

	override async needed(
			path: string,
			hOptions: hash = {}
			): AutoPromise<boolean> {

		return true
	}

	// ..........................................................

	async postProcess(
			purpose: string,
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		const postProc = await getPostProcessor(purpose)
		if (defined(postProc)) {
			DBG("post-processing file")
			try {
				return await postProc(path, hOptions)
			}
			catch (err) {
				return {
					success: false,
					stderr: getErrStr(err)
					}
			}
		}
		else {
			return {
				success: true,
				notNeeded: true
				}
		}
	}

	// ..........................................................
	// --- file existence has already been checked.

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		DBG(`COMPILE: ${OL(path)}`, INDENT)
		type opt = {
			nopp: boolean
			}
		const {nopp} = getOptions<opt>(hOptions, {
			nopp: false
			})

		const {stub, purpose, ext} = parsePath(path)
		if (notdefined(ext)) {
			DBG(`Not compiling - no file extension in ${OL(path)}`, UNDENT)
			return {
				success: true,
				notNeeded: true
				}
		}

		const hCompilerInfo = await getCompilerInfo(ext)
		if (notdefined(hCompilerInfo)) {
			DBG(`Not compiling - no compiler for ext ${OL(ext)}`, UNDENT)
			return {
				success: true,
				notNeeded: true
				}
		}

		const {isInstalled, compiler, getOutPaths} = hCompilerInfo
		if (!isInstalled()) {
			DBG(`compiler for ext ${OL(ext)} not installed`, UNDENT)
			return {
				success: true,
				notNeeded: true
				}
		}

		const lOutPaths = getOutPaths(path)
		DBG(`lOutPaths = ${OL(lOutPaths)}`)
		if (allOf(lOutPaths, (p) => newerDestFileExists(path, p))) {
			const hResult: TExecResult = {
				success: true,
				notNeeded: true,
				outfile: lOutPaths
				}
			if (defined(purpose) && !nopp) {
				hResult.hPostResult = await this.postProcess(purpose, path, hOptions)
			}
			DBG(`Not compiling, newer ${OL(lOutPaths)} exist`, UNDENT)
			return hResult
		}

		DBG(`compiling ${OL(path)} to ${OL(lOutPaths)}`)
		const hResult = compiler(path, hOptions)
		const {success} = hResult

		if (success && defined(purpose) && !nopp) {
			hResult.hPostResult = await this.postProcess(purpose, path)
		}

		DBG(UNDENT)
		return hResult
	}
}

export const doCompileFile = new CFileCompiler()

