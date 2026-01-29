"use strict";
// compileall.civet

import {assert} from "jsr:@std/assert"
import {sprintf} from 'jsr:@std/fmt/printf'
import {compile} from 'npm:@danielx/civet'
import {resolve, relative} from 'jsr:@std/path'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'

import {
	TIterator, TAsyncIterator, isIterator, isAsyncIterator,
	} from 'datatypes'
import {
	undef, verbose, LOG, ERR, DBG, croak, getErrStr, isDir, isFile, centered,
	normalizePath, toFullPath, typeCheck, alreadyCompiled,
	haveSourceMapFor, extractSourceMap, addSourceMap, saveSourceMaps,
	allCivetFiles,     // --- (): TAsyncIterator<string>
	TOkResult,         //     {destPath, code, hSrcMap}
	compileCivetFile,  //     (path: string) -> TAsyncIterator<TOkResult, void>
	typeCheckTsFile,   //     (h: TOkResult) -> boolean
	} from './compileall.lib.ts'

import {mapper, reducer} from 'var-free'

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

const t0 = Date.now()

// --- We must keep track of how many civet files there are
let numFiles = 0

// --- TIn is string
// --- TOut is TOkResult
// --- allCivetFiles() returns a TAsyncIterator<string>
// --- compileCivetFile is type (string => TAsyncIterator<TOkResult>)
// --- abortFunc is type (string => boolean)

// --- allCivetFiles    is () => TAsyncIterator<string>
//     compileCivetFile is (path: string) -> TAsyncIterator<TOkResult>
debugger
const iter = await mapper(allCivetFiles(), compileCivetFile)
assert(isAsyncIterator<TOkResult>(iter), `Not an async iterator: ${iter}`)

const lToTypeCheck: TOkResult[] = await Array.fromAsync(iter)
const numCompiled = lToTypeCheck.length
if (numCompiled === 0) {
	LOG("All files already compiled")
	Deno.exit(0)
}

// --- If any files failed to compile, there is no point
//     to type checking because it will probably fail
if (numCompiled !== numFiles) {
	const numFailed = numFiles - numCompiled
	ERR(`${numFailed}/${numFiles} civet files failed to compile`)
	Deno.exit(-1)
}

// --- type check files that were compiled
//     tsCode will include the inline source map

// --- This produces an array of booleans

// --- we need something with a next() method
//     lToTypeCheck is an array of TOkResult
const iter2 = mapper(lToTypeCheck, typeCheckTsFile)
const lTypeCheckResult = await Array.fromAsync(iter2)

const nFailed = await reducer(lTypeCheckResult, 0, (accum, item) => {
	return accum+1
})

if (nFailed > 0) {
	ERR(`${nFailed} files failed to compile`)
	Deno.exit(-1)
}

if (numCompiled > 0) {
	// --- Save source maps
	LOG(`saving ${numCompiled} source maps`)
	await saveSourceMaps()
}

const secs = (Date.now() - t0) / 1000
LOG(`DONE in ${sprintf('%.2d', secs)} secs.`)
