"use strict";
// compileall.civet

import {assert} from "jsr:@std/assert"
import {sprintf} from 'jsr:@std/fmt/printf'
import {compile} from 'npm:@danielx/civet'
import {resolve, relative} from 'jsr:@std/path'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'

import {
	undef, verbose, LOG, ERR, DBG, croak, getErrStr, isDir, isFile, centered,
	normalizePath, toFullPath, allCivetFiles, typeCheck, alreadyCompiled,
	haveSourceMapFor, extractSourceMap, addSourceMap, saveSourceMaps,
	TOkResult,         // --- {destPath, code, hSrcMap}
	compileCivetFile,  //     (path: string) -> ASYNC_ITERATOR<TOkResult>
	typeCheckTsFile,   //     (h: TOkResult) -> boolean
	} from './compileall.lib.ts'

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

const iter = await mapper(allCivetFiles(), compileCivetFile, abortFunc)
const lToTypeCheck: TOkResult[] = await Array.fromAsync(iter)
const numCompiled = lToTypeCheck.length

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
