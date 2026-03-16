"use strict";
// automate.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {compile as compileSvelte} from 'npm-svelte/compiler'

import {
	undef, defined, notdefined, assert, croak,
	nonEmptyString, hash, hashof, getErrStr,
	} from 'datatypes'
import {TNoArgPredicate, allOf} from 'predicates'
import {keys, getOptions} from 'llutils'
import {OL} from 'to-nice'
import {
	LOG, DBG, WARN, ERR, DBGVALUE, INDENT, UNDENT,
	pushLogLevel, popLogLevel
	} from 'logger'
import {
	slurp, barf, patchFirstLine, parsePath, configFromFile,
	isFile, rmFile, findFile, relpath, withExt, fileExt,
	newerDestFileExists, allFilesMatching, inSameDir,
	} from 'fsys'
import {
	execCmd, CFileHandler, TExecResult,
	} from 'exec'
import {cielo2civetFile} from 'cielo'
import {civet2tsFile} from 'civet'

// ---------------------------------------------------------------------------
// Please, no dependencies on the directory structure!
// ---------------------------------------------------------------------------

export type TCompileResult = TExecResult & {
	lOutPaths?: string[]
	postProcStatus?: string    // --- was successful if not present
	}

export type TCompilerFunc = (path: string) => TCompileResult
export type TPostProcessor = (path: string) => void

export type TCompilerInfo = {
	tester: () => TExecResult
	compiler: TCompilerFunc
	getOutPaths: (path: string) => string[]
	}

export const isCompilerInfo = (x: unknown): x is TCompilerInfo => {
	if ((typeof x === 'object') && (x !== null)) {
		return ('tester' in x) && ('compiler' in x) && ('getOutPaths' in x)
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

export const getCompilerConfig = async (
		fileName: string = 'compile.config.civet'
		): AutoPromise<TCompilerConfig> => {

	const hConfig = (
		(await (async ()=>{try {
			return await configFromFile(fileName)
		}

		catch (err) {
			return ({
				hCompilers: {

					// --- keys are file extensions
					'.svelte': {

						tester: () => {
							return {success: true}
						},

						getOutPaths: (path: string) => {
							return [withExt(path, '.js')]
						},

						compiler: (path: string) => {
							const jsPath = withExt(path, '.js')
							rmFile(jsPath)
							const {js, warnings} = compileSvelte(slurp(path), {
								customElement: true,
								runes: true,
							})
							const {code, map} = js
							barf(jsPath, code)
							return 'compiled'
						}
						},

					'.dot': {
						getOutPaths: (path: string) => {
							return [withExt(path, '.svg')]
						},
						tester: async () => {
							return await execCmd('dot', ['--version'])
						},
						compiler: async (path: string) => {
							const svgPath = withExt(path, '.svg')
							rmFile(svgPath)
							await execCmd('dot', ['-Tsvg', path])
							return 'compiled'
						}
						},

					'.cielo': {
						// --- We produce an intermediate .civet file,
						//     but give it a purpose of 'temp'
						//     so it won't get compiled by the compile script

						getOutPaths: (path: string) => [withExt(path, '.ts')],

						tester: async () => {
							// --- we need civet to be installed
							return await execCmd('civet', ['--version'])
						},

						compiler: (path: string) => {
							// --- start with a *.cielo file
							assert((fileExt(path) === '.cielo'), "Not a .cielo file")
							const civetPath = withExt(path, '.temp.civet')
							const tsPath = inSameDir(path, '.ts')

							rmFile(civetPath) // --- needed?
							rmFile(tsPath) // --- needed?

							cielo2civetFile(path, civetPath)
							civet2tsFile(civetPath, tsPath)
							const {fileName} = parsePath(path)
							patchFirstLine(civetPath, fileName, withExt(fileName, '.temp.civet'))
							patchFirstLine(tsPath, fileName, withExt(fileName, '.ts'))
							return 'compiled'
						}
						},

					'.civet': {
						getOutPaths: (path: string) => {
							return [withExt(path, '.ts')]
						},
						tester: async () => {
							return await execCmd('civet', ['--version'])
						},
						compiler: (path: string) => {
							const {purpose, fileName} = parsePath(path)
							if (purpose === 'temp') {
								return 'temp'
							}
							const tsPath = withExt(path, '.ts')
							const tsName = withExt(fileName, '.ts')
							civet2tsFile(path, tsPath)
							patchFirstLine(tsPath, fileName, tsName)
							return 'compiled'
						}
						}
					}, // --- end hCompilers

				hPostProcessors: {

					// --- Keys are a purpose
					'test': (path: string): void => {
						return
					},

					'lib': async (path: string): AutoPromise<void> => {
						for await (const {success} of runUnitTestsFor(path)) {
							if (!success) {
								LOG(`Unit test ${path} failed`)
							}
						}
						return
					},

					'cmd': (path: string): void => {
						LOG(`- installing command ${path}`)
						installCmd(path)
						return
					}
					} // --- end hPostProcessors
				})
		}})())
			)

	DBGVALUE('hConfig', hConfig)
	assert(isCompilerConfig(hConfig), `Bad compiler config: ${hConfig}`)

	// --- Remove any compilers for which the
	//     compiler software has not been installed
	const {hCompilers} = hConfig
	for (const ext of keys(hCompilers)) {
		const {tester} = hCompilers[ext]
		pushLogLevel('silent')
		const {success} = tester()
		popLogLevel()
		if (!success) {
			DBG(`Deleting compiler for ext ${OL(ext)}`)
			delete hCompilers[ext]
		}
	}
	return hConfig
}

// ---------------------------------------------------------------------------
// ASYNC

export const getCompilerInfo = async (
		ext: string
		):AutoPromise<(TCompilerInfo | undefined)> => {

	const hConfig = await getCompilerConfig()
	const hInfo = hConfig.hCompilers[ext]
	if (defined(hInfo)) {
		return hInfo
	}
	else {
		DBG(`No compiler for ${ext} files`)
		return undef
	}
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
// ASYNC

// --- src can be a full or relative path
//     throws error if file does not exist
//
//     Possible status values:
//        'temp'       - it was a temp file, not compiled
//        'nocompiler' - has no compiler, not compiled
//        'notNeeded'  - newer compiled file already exists
//        'failed'     - compiling failed
//        'compiled'   - successfully compiled

export const compileFile = async (
		path: string,
		hOptions: hash = {}
		): AutoPromise<TCompileResult> => {

	assert(isFile(path), `No such file: ${OL(path)}`)
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
		DBG(`Not compiling - no compiler for ${OL(ext)}`, UNDENT)
		return {
			success: true,
			notNeeded: true
			}
	}

	const {compiler, getOutPaths} = hCompilerInfo
	const lOutPaths = getOutPaths(path)
	DBG(`lOutPaths = ${OL(lOutPaths)}`)
	if (allOf(lOutPaths, (p) => newerDestFileExists(path, p))) {
		DBG(`Not compiling, newer ${OL(lOutPaths)} exist`, UNDENT)
		return {
			success: true,
			notNeeded: true,
			lOutPaths
			}
	}

	DBG(`compiling ${OL(path)} to ${OL(lOutPaths)}`)
	const hResult = compiler(path)
	const {success} = hResult

	if (success && defined(purpose) && !nopp) {
		const postProc = await getPostProcessor(purpose)
		if (defined(postProc)) {
			DBG("post-processing file")
			try {
				postProc(path)
			}
			catch (err) {
				hResult.postProcStatus = getErrStr(err)
			}
		}
	}

	DBG(UNDENT)
	return hResult
}

// ---------------------------------------------------------------------------

class CFileCompiler extends CFileHandler {

	get op() {
		return 'doCompileFile'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		const hResult = await compileFile(path, hOptions)
		const {success, notNeeded, lOutPaths, postProcStatus} = hResult
		return {
			success,
			notNeeded
			}
	}
}

export const doCompileFile = new CFileCompiler()

// ---------------------------------------------------------------------------
// --- ASYNC GENERATOR

export const runUnitTestsFor = async function*(
		path: nonEmptyString,
		hOptions: hash = {}
		): AsyncGenerator<TExecResult> {

	type opt = {
		verbose: boolean
		}
	const {verbose} = getOptions<opt>(hOptions, {
		verbose: false
		})

	DBG(`Running unit tests for ${relpath(path)}`)
	if (!verbose) {
		pushLogLevel('silent')
	}

	// --- Compile and run all unit tests for file

	const {stub, purpose, ext} = parsePath(path)
	for (const testPath of allFilesMatching(`src/**/${stub}.${purpose}.test.*`)) {
		const {success, lOutPaths} = await compileFile(testPath, {nopp: true})
		assert(success, `compile of ${testPath} failed`)
		if (notdefined(lOutPaths)) {
			continue
		}
		for (const outPath of lOutPaths) {
			assert(isFile(outPath), `File ${OL(outPath)} not found`)
			assert((fileExt(outPath) === '.ts'),
					`Not a TS file: ${OL(relpath(outPath))}`)
		}

		// --- Run the unit tests, yield results
		for (const outPath of lOutPaths) {
			yield await execCmd('deno', [
				'test',
				'-qA',
				outPath
				])
		}
	}
	if (!verbose) {
		popLogLevel()
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const installCmd = async (
		path: string,
		name: (string | undefined) = undef
		): AutoPromise<void> => {

	if (notdefined(name)) {
		await execCmd('deno', [
			'install',
			'-fgA',
			'--config',
			'deno.json',
			path
			])
	}
	else {
		await execCmd('deno', [
			'install',
			'-fgA',
			'-n',
			name,
			'--config',
			'deno.json',
			path
			])
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const uninstallCmd = async (
		path: string,
		name: (string | undefined) = undef
		): AutoPromise<void> => {

	if (notdefined(name)) {
		await execCmd('deno', [
			'uninstall',
			'-g',
			path
			])
	}
	else {
		await execCmd('deno', [
			'uninstall',
			'-g',
			'-n',
			name,
			path
			])
	}
	return
}


