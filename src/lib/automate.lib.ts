"use strict";
// automate.lib.civet

type AutoPromise1<T> = Promise<Awaited<T>>;
type AutoPromise<T> = Promise<Awaited<T>>

import {compile as compileSvelte} from 'npm:svelte/compiler'

import {
	undef, defined, notdefined, assert, croak,
	TAssertFunc, isEmpty, nonEmpty, isInteger,
	nonEmptyString, isNonEmptyString,
	hash, hashof, isHash, integer,
	} from 'datatypes'
import {words, allMatches, o, keys, getOptions} from 'llutils'
import {OL} from 'to-nice'
import {
	LOG, LOGVALUE, DBG, DBGVALUE, INDENT, UNDENT,
	pushLogLevel, popLogLevel
	} from 'logger'
import {TextTable} from 'text-table'
import {
	TPathInfo, slurp, barf, patchFirstLine, parsePath,
	isFile, isDir, rmFile, findFile, relpath, withExt,
	newerDestFileExists, allFilesMatching,
	} from 'fsys'
import {execCmd, execCmdSync} from 'exec'
import {cielo2civetFile, configFromFile} from 'cielo'
import {civet2tsFile} from 'civet'

// ---------------------------------------------------------------------------
// Please, no dependencies on the directory structure!
// ---------------------------------------------------------------------------

export type TTesterFunc = ()=> boolean
export type TCompileStatus = 'temp' |
	'nocompiler' |
	'exists' |
	'failed' |
	'compiled'        // compiling succeeded, output file exists

export type TCompilerFunc = (path: string) => TCompileStatus
export type TPostProcessor = (path: string) => void

export type TCompilerInfo = {
	tester: TTesterFunc
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

export type TCompileResult = {
	status: TCompileStatus
	path: string
	lOutPaths?: string[]
	postProcStatus?: unknown
}

export type TUnitTestResult = {
	stub: string
	success: boolean
	msg?: string
	code?: number
}

// ---------------------------------------------------------------------------

export const build = (
		name: string = '*',
		purp: string = '{lib,cmd}',
		hOptions: hash = {}
		): void => {

	type opt = {
		nopp: boolean
		}
	const {nopp} = getOptions<opt>(hOptions, {
		nopp: false
		})
	// --- Even though it's a constant, we can still
	//     append strings to it!
	const lUnitTests: string[] = []
	const pat = `**/${name}.${purp}.civet`
	for (const path of allFilesMatching(pat)) {
		const {fileName, purpose, stub} = parsePath(path)
		assert(isNonEmptyString(stub), "Empty stub")
		LOG(`${relpath(path)} (${purpose})`)
		if (newerDestFileExists(path, '.ts')) {
			LOG("   EXISTS")
		}
		else {
			// --- Compile civet file to TypeScript
			const {success} = execCmdSync('civet', [
				'--inline-map',
				'-o',
				'.ts',
				'-c',
				relpath(path)
			])
			if (success) {
				LOG("   BUILD OK")
				// --- type check the TypeScript file
				const hResult = execCmdSync('deno', [
					'check',
					'-q',
					withExt(path, '.ts')
				])
				if (hResult.success) {
					LOG("   CHECK OK")
				}
				else {
					LOG("   CHECK FAILED")
					continue
				}
			}
			else {
				LOG("   BUILD FAILED")
				continue
			}
		}
		// don't install if a command
		switch(purpose) {
			case 'cmd': {
				const {success} = execCmdSync('deno', [
					'install',
					'-fgA',
					'-n',
					stub || 'unknown',
					'--no-config',
					withExt(path, '.ts')
				])
				LOG(`   INSTALL ${(success? 'OK' : 'FAILED')}`);break;
			}
			case 'lib': {
				if (defined(stub) && !nopp) {
					lUnitTests.push(stub)
				};break;
			}
		}
	}
	LOGVALUE('lUnitTests', lUnitTests)
	return
}

// ---------------------------------------------------------------------------
// --- What an ugly syntax, but it works! (i.e. type narrows)

const assertIsCompilerConfig: (
		val: unknown
		) => asserts val is TCompilerConfig = function(val: unknown): asserts val is TCompilerConfig {
	assert(isCompilerConfig(val), "Not a compiler config")
}

// ---------------------------------------------------------------------------

export const getCompilerConfig = (
		fileName: string = 'compile.config.civet'
		): TCompilerConfig => {

	const path = findFile(fileName)
	if (defined(path)) {
		DBG(`load compiler config from ${OL(path)}`)
		const hConfig = configFromFile(path)
		assertIsCompilerConfig(hConfig)
		DBGVALUE('hConfig', hConfig)
		// --- Remove any compilers for which the
		//     compiler software has not been installed
		const {hCompilers} = hConfig
		for (const ext of keys(hCompilers)) {
			const {tester} = hCompilers[ext]
			pushLogLevel('silent')
			const works = tester()
			popLogLevel()
			if (!works) {
				DBG(`Deleting compiler for ext ${OL(ext)}`)
				delete hCompilers[ext]
			}
		}
		return hConfig
	}
	else {
		return {
			hCompilers: {
				// --- keys are file extensions
				//     NOTE: compilers must be synchronous!!!
				'.svelte': {
					getOutPaths: (path: string) => {
						return [withExt(path, '.js')]
					},
					tester: () => {
						return true
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
					},
				},
				'.dot': {
					getOutPaths: (path: string) => {
						return [withExt(path, '.svg')]
					},
					tester: () => {
						return execCmdSync('dot', ['--version'], o`quiet`).success
					},
					compiler: (path: string) => {
						const svgPath = withExt(path, '.svg')
						rmFile(svgPath)
						execCmdSync('dot', ['-Tsvg', path])
						return 'compiled'
					},
				},
				'.cielo': {
					// --- We produce an intermediate .civet file,
					//     but give it a purpose of 'temp'
					//     so it won't get compiled by the compile script
					getOutPaths: (path: string) => [withExt(path, '.ts')],
					tester: () => {
						// --- we need civet to be installed
						return execCmdSync('civet', ['--version'], o`quiet`).success
					},
					compiler: (path: string) => {
						// --- start with a *.cielo file
						const civetPath = withExt(path, '.temp.civet')
						const tsPath = withExt(path, '.ts')
						rmFile(civetPath) // --- needed?
						rmFile(tsPath) // --- needed?
						cielo2civetFile(path, civetPath)
						civet2tsFile(civetPath, tsPath)
						const {fileName} = parsePath(path)
						patchFirstLine(civetPath, fileName, withExt(fileName, '.temp.civet'))
						patchFirstLine(tsPath, fileName, withExt(fileName, '.ts'))
						return 'compiled'
					},
				},
				'.civet': {
					getOutPaths: (path: string) => {
						return [withExt(path, '.ts')]
					},
					tester: () => {
						return execCmdSync('civet', ['--version'], o`quiet`).success
					},
					compiler: (path: string) => {
						const {purpose, fileName} = parsePath(path)
						if (defined(purpose) && ['temp', 'debug'].includes(purpose)) {
							return 'temp'
						}
						const tsPath = withExt(path, '.ts')
						const tsName = withExt(fileName, '.ts')
						civet2tsFile(path, tsPath)
						patchFirstLine(tsPath, fileName, tsName)
						return 'compiled'
					}
				}
			},
			hPostProcessors: {
				// --- Keys are a purpose
				'test': (path: string): void => {
					return
				},
				'lib': (path: string): void => {
					const {stub} = parsePath(path)
					if (defined(stub)) {
						for (const {success} of runUnitTestsFor(stub)) {
							if (!success) {
								LOG(`Unit test ${path} failed`)
							}
						}
					}
					return
				},
				'cmd': (path: string): void => {
					LOG(`- installing command ${path}`)
					installCmd(path)
					return
				}
			},
		}
	}
}

// ---------------------------------------------------------------------------
// --- returns a TCompilerInfo or undef

export const getCompilerInfo = (ext: string): (TCompilerInfo | undefined) => {
	const hConfig = getCompilerConfig()
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

export const getPostProcessor = (purpose: string): (TPostProcessor | undefined) => {
	const hConfig = getCompilerConfig()
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
// --- src can be a full or relative path
//     throws error if file does not exist
//
//     Possible status values:
//        'temp'       - it was a temp file, not compiled
//        'nocompiler' - has no compiler, not compiled
//        'exists'     - newer compiled file already exists
//        'failed'     - compiling failed
//        'compiled'   - successfully compiled

export const compileFile = (path: string, hOptions: hash = {}): TCompileResult => {
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
		return {status: 'nocompiler', path: relpath(path)}
	}
	const hCompilerInfo = getCompilerInfo(ext)
	if (notdefined(hCompilerInfo)) {
		DBG(`Not compiling - no compiler for ${OL(ext)}`, UNDENT)
		return {status: 'nocompiler', path: relpath(path)}
	}
	// @ts-ignore
	const {compiler, getOutPaths} = hCompilerInfo
	const lOutPaths = getOutPaths(relpath(path))
	DBG(`lOutPaths = ${OL(lOutPaths)}`)
	let allNewer = true
	for (const outPath of lOutPaths) {
		if (!newerDestFileExists(relpath(path), outPath)) {
			allNewer = false
			break
		}
	}
	if (allNewer) {
		DBG(`Not compiling, newer ${OL(lOutPaths)} exist`, UNDENT)
		return { status: 'exists', path: relpath(path), lOutPaths }
	}
	DBG(`compiling ${OL(path)} to ${OL(lOutPaths)}`)
	const status = compiler(path)
	let postProcStatus: (unknown | undefined) = undef
	if ((status === 'compiled') && defined(purpose) && !nopp) {
		const postProc = getPostProcessor(purpose)
		if (defined(postProc)) {
			DBG("post-processing file")
			try {
				// @ts-ignore
				postProc(path)
			}
			catch (err) {
				postProcStatus = err
			}
		}
	}
	DBG(UNDENT)
	if (defined(postProcStatus)) {
		return { status, path: relpath(path), lOutPaths, postProcStatus }
	}
	else {
		return { status, path: relpath(path), lOutPaths }
	}
}

// ---------------------------------------------------------------------------
// --- GENERATOR

export const runUnitTestsFor = function*(
		stub: nonEmptyString,
		hOptions: hash = {}
		): Generator<TUnitTestResult, void, void> {

	type opt = {
		verbose: boolean
		}
	const {verbose} = getOptions<opt>(hOptions, {
		verbose: false
		})

	DBG(`Running unit tests for ${stub}`)
	if (!verbose) {
		pushLogLevel('silent')
	}
	// --- Ensure that matching lib & cmd files are compiled
	//     (no error if there is no compiler for the file)
	build(stub)
	// --- Compile and run all unit tests for stub
	for (const path of allFilesMatching(`**/${stub}*.test.*`)) {
		const {status, lOutPaths} = compileFile(path, o`nopp`)
		assert((status !== 'failed'), `compile of ${path} failed`)
		if (notdefined(lOutPaths)) {
			continue
		}
		// @ts-ignore
		for (const outPath of lOutPaths) {
			assert(isFile(outPath), `File ${OL(outPath)} not found`)
		}
		// --- Compile all files in subdir if it exists
		if (isDir(`test/${stub}`)) {
			for (const path of allFilesMatching('test/' + stub + '/*')) {
				const {status, lOutPaths} = compileFile(path)
				assert((status !== 'failed'), `Compile of ${path} failed`)
				if (notdefined(lOutPaths)) {
					LOG(`File ${OL(path)} not compiled to ${OL(lOutPaths)}`)
				}
			}
		}
		// --- Run the unit tests, yield results
		// @ts-ignore
		for (const outPath of lOutPaths) {
			const {success} = execCmdSync('deno', [
				'test',
				'-qA',
				outPath
			])
			yield {stub, success}
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
		): AutoPromise1<AutoPromise<void>> => {

	if (notdefined(name)) {
		await execCmd('deno', [
			'install',
			'-fgA',
			'--config',
			'deno.jsonc',
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
			'deno.jsonc',
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
		): AutoPromise1<AutoPromise<void>> => {

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