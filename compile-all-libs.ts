"use strict";
// compile-all-libs.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {sprintf} from '@std/fmt/printf'
import {compile as compileCivet} from '@danielx/civet'

import {
	undef, defined, notdefined, croak, assert, isEmpty, nonEmpty,
	} from 'datatypes'
import {centered, getErrStr} from 'llutils'
import {f} from 'f-strings'
import {setLogLevel, LOG, ERR, DBG} from 'logger'
import {flag, flags, lNonOptions} from 'cmd-args'
import {
	isDir, isFile, findFile, allFilesMatching, watchFiles,
	toFullPath, newerDestFileExists, relpath,
	} from 'fsys'
import {execCmd} from 'exec'
import {
	RawSourceMap, haveSourceMapFor, extractSourceMap, addSourceMap,
	} from 'source-map'
import {mapper, reducer} from 'var-free'
import hCivetConfig from "civetconfig" with {type: "json"}

const [verbose, watch, force] = flags('v', 'w', 'f')
if (verbose) {
	LOG("verbose = true")
	setLogLevel('debug')
}
if (watch) {
	LOG("watch = true")
}
if (force) {
	LOG("force = true")
}

// ---------------------------------------------------------------------------
// --- sanity check

assert(isFile('./compileall.civet'), "No file ./compileall.civet")
assert(isDir('src'),                 "No dir src")
assert(isFile('civetconfig.json'),   "No file civetconfig.json")
assert(isFile('.gitignore'),         "No file .gitignore")

// ---------------------------------------------------------------------------

export type TOkResult = {
	status: 'ok'
	destPath: string
	code: string
	hSrcMap: RawSourceMap
	}

export type TResult = TOkResult |
	{
		status: 'error'
		destPath: string
		errMsg: string
		} |
	{
		status: 'alreadyCompiled'
		destPath: string
		}

// ---------------------------------------------------------------------------

const t0 = Date.now()

const iterCivetFiles = (
	(isEmpty(lNonOptions)?
		allFilesMatching([
			"**/*.lib.civet",
			"! **/temp/*",
			"! **/save/*"
			])
	:
		mapper(lNonOptions, function*(stub) {
			const fileName = `${stub}.lib.civet`
			const path = findFile(fileName)
			if (path) {
				yield path
			}
			else {
				ERR(`No such file: ${fileName}`)
			}
		}))
	)

const iterResults = await mapper(iterCivetFiles, async function*(path): AsyncGenerator<TResult> {
	const civetPath = toFullPath(path)
	const relPath = relpath(civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relpath(destPath)
	DBG(`COMPILE: ${relPath}`)

	if (!force && newerDestFileExists(path, '.ts')) {
		DBG("   - already compiled")
		yield {
			status: 'alreadyCompiled',
			destPath
			}
		return
	}

	try {
		const civetCode = await Deno.readTextFile(civetPath)
		const tsCode: string = await compileCivet(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: civetPath
			})
		assert(tsCode && !tsCode.startsWith('COMPILE FAILED'),
			`CIVET COMPILE FAILED: ${relPath}`)
		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undef), "Missing source map")
		await Deno.writeTextFile(destPath, code)
		addSourceMap(destPath, hSrcMap)
		DBG("   - compiled OK")
		yield {
			status: 'ok',
			destPath,
			code,
			hSrcMap
			}
	}

	catch (err) {
		ERR(`ERROR in ${relDestPath}:\n${getErrStr(err)}`)
		yield {
			status: 'error',
			destPath,
			errMsg: getErrStr(err)
			}
	}
	return
})

const [numSkip, numOk, numErr, numFiles] = await reducer(iterResults, [0,0,0,0],
	function(acc, x) {
		const [nSkip, nOk, nErr, nFiles] = acc
		return [
			(x.status === 'alreadyCompiled') ? nSkip + 1 : nSkip,
			(x.status === 'ok') ? nOk + 1 : nOk,
			(x.status === 'error') ? nErr + 1 : nErr,
			nFiles + 1
			]
	})

LOG('-'.repeat(32))
LOG(`${numSkip} already compiled, ${numOk} compiled, ${numErr} errors`)
LOG('-'.repeat(32))

assert((numSkip + numOk + numErr === numFiles), "Bad file count")

if (numSkip === numFiles) {
	LOG("All files already compiled")
}
else {
	if (numErr > 0) {
		ERR(`${numErr}/${numFiles} civet files failed to compile`)
		Deno.exit(-1)
	}

	const lResults: TResult[] = await Array.fromAsync(iterResults)
	const lToTypeCheck: TOkResult[] = lResults.filter((h) => {
		return (h.status === 'ok')
	})

	const iterCheck = mapper(lToTypeCheck, async function(hResult: TOkResult): AutoPromise<boolean> {
		const {destPath, hSrcMap} = hResult
		const relDestPath = relpath(destPath)
		LOG(`TYPE CHECK: ${relDestPath}`)
		try {
			assert(isFile(destPath), `No such file: ${destPath}`)
			const {success, stderr} = await execCmd('deno', ['check', destPath])
			assert(success, `type check failed for ${relDestPath}: ${stderr}`)
			addSourceMap(destPath, hSrcMap)
			return true
		}
		catch (err) {
			ERR(`ERROR in ${relDestPath}:\n${getErrStr(err)}`)
			return false
		}
	})

	const numFailed = await reducer(iterCheck, 0, function(acc, x) {
		return x ? acc : acc+1
	})
	if (numFailed > 0) {
		ERR(f`${numFailed} files failed type checking`)
		Deno.exit(-1)
	}
}

const secs = (Date.now() - t0) / 1000
LOG(`DONE in ${sprintf('%.2d', secs)} secs.\n`)

if (watch) {
	LOG("Watching for file changes in the current directory...")

	await watchFiles('.', (kind, path) => {
		LOG(`[${kind}] ${path}`)
		return
	})
}
