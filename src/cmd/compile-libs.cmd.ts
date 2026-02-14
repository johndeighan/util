"use strict";
// compile-libs.cmd.civet

import {compile as compileCivet} from '@danielx/civet'

import {
	undef, defined, notdefined, croak, assert,
	isEmpty, nonEmpty, getErrStr,
	} from 'datatypes'
import {f} from 'f-strings'
import {setLogLevel, LOG, ERR, DBG} from 'logger'
import {flag, flags, lNonOptions} from 'cmd-args'
import {
	isDir, isFile, findFile, allFilesMatching, watchFiles,
	toFullPath, newerDestFileExists, relpath,
	} from 'fsys'
import {execCmd, procFiles, procOneFile, CTimer} from 'exec'
import {
	RawSourceMap, haveSourceMapFor, extractSourceMap,
	addSourceMap, saveSourceMaps, orgNumSourceMaps,
	} from 'source-map'
import {mapper, reducer} from 'var-free'
import {doCompileCivet} from 'civet'

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

assert(isDir('src'),                 "No dir src")
assert(isFile('civetconfig.json'),   "No file civetconfig.json")
assert(isFile('.gitignore'),         "No file .gitignore")
assert(isFile('deno.json'),          "No file deno.json")

// ---------------------------------------------------------------------------

type TResult = {
		status: 'ok'
		destPath: string
		code: string
		hSrcMap: RawSourceMap
		} |
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

const timer = new CTimer()

// --- iterate full file paths
//     command line may be a sequence of file stubs

const iterFiles = (
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

// --- iterate sequence of TResult objects resulting from
//     attempting to compile the files

const iterResults = await mapper(iterFiles, async function*(path): AsyncGenerator<TResult> {
	const civetPath = toFullPath(path)
	const relPath = relpath(civetPath)
	const tsPath = civetPath.replace('.civet', '.ts')
	const relTsPath = relpath(tsPath)
	DBG(`COMPILE: ${relPath}`)

	if (!force
			&& newerDestFileExists(path, '.ts')
			&& haveSourceMapFor(tsPath)
			) {
		DBG("   - already compiled")
		yield {
			status: 'alreadyCompiled',
			destPath: tsPath
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
		assert((hSrcMap !== undef), `Missing source map for ${relPath}`)
		await Deno.writeTextFile(tsPath, code)
		assert(isFile(tsPath), `File ${relTsPath} did not appear`)
		addSourceMap(tsPath, hSrcMap)
		DBG("   - compiled OK")
		yield {
			status: 'ok',
			destPath: tsPath,
			code,
			hSrcMap
			}
	}

	catch (err) {
		ERR(`ERROR in ${relTsPath}:\n${getErrStr(err)}`)
		yield {
			status: 'error',
			destPath: tsPath,
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
if (numSkip > 0) {
	LOG(`${numSkip} already compiled`)
}
if (numOk > 0) {
	LOG(`${numOk} compiled`)
}
if (numErr > 0) {
	LOG(`${numErr} errors`)
}
LOG('-'.repeat(32))

assert((numSkip + numOk + numErr === numFiles), "Bad file count")

// --- type check all files that were compiled
const iterChecked = mapper(iterResults, async function*(hResult): AsyncGenerator<boolean, void> {
	const {status, destPath} = hResult
	if (status === 'ok') {
		const relDestPath = relpath(destPath)
		DBG(`TYPE CHECK: ${relDestPath}`)
		try {
			const {success, stderr} = await execCmd('deno', ['check', destPath])
			assert(success, `type check failed for ${relDestPath}: ${stderr}`)
			yield true
		}
		catch (err) {
			ERR(`ERROR in ${relDestPath}:\n${getErrStr(err)}`)
			yield false
		}
	}
	return
})

const numFailed = await reducer(iterChecked, 0, function(acc, x) {
	return x ? acc : acc+1
})
if (numFailed > 0) {
	ERR(f`${numFailed} files failed type checking`)
}

const nMaps = await saveSourceMaps()
LOG(`${nMaps} source maps saved (${nMaps - orgNumSourceMaps} new)`)

LOG(`DONE in ${timer.timeTaken()} secs.\n`)

if (watch) {
	LOG("Watching for file changes in the current directory...")

	await watchFiles('.', (kind, path) => {
		LOG(`[${kind}] ${path}`)
		return
	})
}

