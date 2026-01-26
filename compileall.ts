"use strict";
// compileall.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {assert} from "jsr:@std/assert"
import {red} from 'jsr:@std/fmt/colors'
import {sprintf} from 'jsr:@std/fmt/printf'
import {compile} from 'npm:@danielx/civet'
import {resolve, relative} from 'jsr:@std/path'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'

import {
	undef, verbose, LOG, DBG, croak, getErrStr, isDir, isFile, centered,
	normalizePath, toFullPath, allCivetFiles, typeCheck, alreadyCompiled,
	haveSourceMapFor, extractSourceMap, addSourceMap, saveSourceMaps,
	} from './compileall.lib.ts'

import {isIterable, isAsyncIterable, toArray} from 'datatypes'
import {ITERATOR, ASYNC_ITERATOR, mapper, reducer} from 'var-free'

import hCivetConfig from "civetconfig" with {type: "json"}

// --- This is where source maps are stored, keyed by
//     the normalized file path
const sourceMapPath = './sourcemap.json'

const encoder = new TextEncoder()
const statSync = Deno.statSync

// ---------------------------------------------------------------------------
// --- sanity check

assert(isFile('./compileall.civet'))
assert(isDir('src'))
assert(isFile('civetconfig.json'))
assert(isFile('.gitignore'))

// ---------------------------------------------------------------------------

export type TAbortFunc<TIn> = (item: TIn, i: number) => boolean

// ---------------------------------------------------------------------------

type TOkResult = {
		destPath: string
		code: string
		hSrcMap: RawSourceMap
		}

// ---------------------------------------------------------------------------
// --- ASYNC GENERATOR

const compileCivetFile = async function*(
		path: string
		): ASYNC_ITERATOR<TOkResult> {

	const civetPath = toFullPath(path)
	const relPath = relative('.', civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relative('.', destPath)

	if (alreadyCompiled(path)) {
		DBG(centered(`COMPILE: ${relPath}`))
		DBG(`already compiled to ${relDestPath}`, 1)
		return
	}

	try {
		LOG(centered(`COMPILE: ${relPath}`))
		LOG(`destPath = ${relDestPath}`, 1)

		const civetCode = await Deno.readTextFile(civetPath)
		const tsCode: string = await compile(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: civetPath
			})
		assert(tsCode && !tsCode.startsWith('COMPILE FAILED'),
			`CIVET COMPILE FAILED: ${relPath}`)
		LOG("compile succeeded", 1)
		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undef), "Missing source map")
		yield {
			destPath,
			code,
			hSrcMap
			}
	}

	catch (err) {
		LOG(`${red('ERROR')} in ${relDestPath}:\n${err}`)
	}
	return
}

// ---------------------------------------------------------------------------
// --- ASYNC

const typeCheckTsFile = async (
		hResult: TOkResult
		): AutoPromise<boolean> => {

	const {destPath, code, hSrcMap} = hResult
	const relDestPath = relative('.', destPath)
	LOG(centered(`TYPE CHECK: ${relDestPath}`))
	try {
		// --- Unfortunately, we have to write the code to a file
		//     in order to type check it :-(

		const tempPath = 'src/temp/_tempcode_.ts'
		const encoded = encoder.encode(code)
		await Deno.writeFile(tempPath, encoded)
		const success = await typeCheck(tempPath)
		assert(success, `type check failed for ${relDestPath}`)

		await Deno.writeFile(destPath, encoded)
		LOG("TS file written", 1)
		LOG("type check OK", 1)
		LOG(`adding source map for ${relDestPath}`, 1)
		addSourceMap(destPath, hSrcMap)
		return true
	}

	catch (err) {
		LOG(`${red('ERROR')} in ${relDestPath}:\n${getErrStr(err)}`)
		return false
	}
}

// ---------------------------------------------------------------------------

const t0 = Date.now()

// --- We must keep track of how many civet files there are
let numFiles = 0
const abortFunc = (path: string) => {
	// --- never abort, but keep track of total number of files
	numFiles += 1
	return false
}

// --- TIn is string
// --- TOut is TOkResult
// --- allCivetFiles() returns an ASYNC_ITERATOR<string>
// --- compileCivetFile is type (string => ASYNC_ITERATOR<TOkResult>)
// --- abortFunc is type (string => boolean)

const iter = mapper<string, TOkResult>(allCivetFiles(), compileCivetFile, abortFunc)
const lToTypeCheck = await toArray(iter)
const numCompiled = lToTypeCheck.length

// --- If any files failed to compile, there is no point
//     to type checking because it will probably fail
if (lToTypeCheck.length !== numFiles) {
	LOG(red("Some civet files failed to compile"))
	Deno.exit(-1)
}

// --- type check files that were compiled
//     tsCode will include the inline source map

// --- This produces an array of booleans

// --- we need something with a next() method
//     lToTypeCheck is an array
// checker: IterableIterator<TOkResult> := lToTypeCheck[Symbol.iterator]()
const iter2 = mapper(lToTypeCheck, typeCheckTsFile, () => false)
const lTypeCheckResult = Array.fromAsync(iter2)

const nFailed = reducer(lTypeCheckResult, 0, (accum, item) => {
	return item ? accum : accum+1
})

if (nFailed > 0) {
	LOG(red(`${nFailed} files failed to compile`))
	Deno.exit(-1)
}

if (numCompiled > 0) {
	// --- Save source maps
	LOG(`saving ${numCompiled} source maps`)
	await saveSourceMaps()
}

const secs = (Date.now() - t0) / 1000
LOG(`DONE in ${sprintf('%.2d', secs)} secs.`)
