"use strict";
// handle.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {allFilesMatching} from 'fsys'

// ---------------------------------------------------------------------------

export const sleep = async (sec: number): AutoPromise<void> => {

	await new Promise((r) => setTimeout(r, 1000 * sec))
	return
}

// ---------------------------------------------------------------------------

// --- return value is an error message, if any
type TPathHandler = (path: string) => Promise<(string | undefined)>

// --- a hash with key path and result string, if error, else undef
type THandlerResult = {[path: string]: (string | undefined)}

const handleFiles = async (
		pattern: string,
		func: TPathHandler
		): AutoPromise<THandlerResult> => {

	const results=[];for (const path of allFilesMatching(pattern)) {
		results.push(path)
	};const lPaths =results
	const results1=[];for (const path of lPaths) {
		results1.push(func(path))
	};const lPromises =results1
	const lResults = await Promise.all(lPromises)
	const hResults: THandlerResult = {}
	let i1 = 0;for (const path of lPaths) {const i = i1++;
		hResults[path] = lResults[i]
	}
	return hResults
}

const logPath = async (path: string):AutoPromise<(string | undefined)> => {

	await sleep(1)
	console.log(path)
	return (path === 'abc') ? `FILE: ${path}` : undefined
}

const hResults = await handleFiles("**/*.test.civet", logPath)
console.dir(hResults)