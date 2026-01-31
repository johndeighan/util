"use strict";
// compileall.civet

import {assert} from "@std/assert"
import {sprintf} from '@std/fmt/printf'
import {compile} from '@danielx/civet'
import {resolve, relative} from '@std/path'
import {RawSourceMap, SourceMapConsumer} from 'npm-source-map'
import {debounce} from '@std/async/debounce'

import {
	undef, defined, notdefined,
	} from 'datatypes'
import {
	verbose, LOG, ERR, DBG, croak, getErrStr, isDir, isFile, centered,
	normalizePath, toFullPath, typeCheck, alreadyCompiled, DUMP,
	haveSourceMapFor, extractSourceMap, addSourceMap, saveSourceMaps,
	mapper, reducer, TResult, TOkResult,
	allCivetFiles,     // --- (): AsyncGenerator<string>
	compileCivetFile,  //     (path: string) -> AsyncGenerator<TResult, void>
	typeCheckTsFile,   //     (h: TResult) -> boolean
	} from './compileall.lib.ts'

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

export const isAsyncIterator = <T,>(
		x: unknown
		): x is AsyncIterableIterator<T> => {

	if (
			   (x === undefined)
			|| (x === null)
			|| (typeof x !== 'object')
			|| (!('next' in x))
			|| (typeof x.next !== 'function')
			|| (!(Symbol.asyncIterator in x))
			) {
		return false
	}
	const iter = x[Symbol.asyncIterator]
	return (typeof iter === 'function') && (iter.call(x) === x)
}

// ---------------------------------------------------------------------------

const t0 = Date.now()

// --- TIn is string
// --- TOut is TResult
// --- allCivetFiles() returns an AsyncGenerator<string>
// --- compileCivetFile is type (path: string) => AsyncGenerator<TResult>

const iterResults = await mapper<string,TResult>(allCivetFiles(), compileCivetFile)
const lResults: TResult[] = await Array.fromAsync(iterResults)
// DUMP lResults
const [numSkip, numOk, numErr, numFiles] = await reducer(lResults, [0,0,0,0], function(acc, x) {
	const [nSkip, nOk, nErr, nFiles] = acc
	return [
		(x.status === 'alreadyCompiled') ? nSkip + 1 : nSkip,
		(x.status === 'ok') ? nOk + 1 : nOk,
		(x.status === 'error') ? nErr + 1 : nErr,
		nFiles + 1
		]
})
LOG(`${numSkip} already compiled, ${numOk} compiled, ${numErr} errors`)

if (numOk === 0) {
	LOG("All files already compiled")
}
else {
	if (numErr > 0) {
		ERR(`${numErr}/${numFiles} civet files failed to compile`)
		Deno.exit(-1)
	}

	const lToTypeCheck: TOkResult[] = lResults.filter((h) => {
		return (h.status === 'ok')
	})

	const iterCheck = mapper<TOkResult,boolean>(lToTypeCheck, typeCheckTsFile)
	const numFailed = await reducer(iterCheck, 0, function(acc, x) {
		return x ? acc : acc+1
	})
	if (numFailed > 0) {
			ERR(`${numFailed} files failed type checking`)
			Deno.exit(-1)
	}
}

const secs = (Date.now() - t0) / 1000
LOG(`DONE in ${sprintf('%.2d', secs)} secs.\n`)

// ---------------------------------------------------------------------------

LOG("Watching for file changes in the current directory...")

const log = debounce(((event: Deno.FsEvent) => {
	console.log("[%s] %s", event.kind, event.paths[0])
}
	), 200)

const watcher = Deno.watchFs('./')

for await (const event of watcher) {
	log(event)
}

