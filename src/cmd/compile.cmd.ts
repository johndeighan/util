"use strict";
// compile.cmd.civet

import {assert, isArray} from 'datatypes'
import {pass, croak} from 'llutils'
import {OL} from 'to-nice'
import {flag, numNonOptions, allNonOptions} from 'cmd-args'
import {watchFiles, allFilesMatching} from 'fsys'
import {DBG, LOG} from 'logger'
import {compileFile, TCompileResult} from 'automate'

let numCompiled = 0

// ---------------------------------------------------------------------------

const logResult = (
		hResult: TCompileResult,
		path: string
		): void => {

	if (hResult.success) {
		if (!hResult.notNeeded) {
			LOG(`COMPILED: ${OL(path)}`)
			numCompiled += 1
		}
	}
	else {
		LOG(`NOT COMPILED: ${OL(path)}`)
	}
	return
}

// ---------------------------------------------------------------------------

if (numNonOptions() === 0) {
	DBG("=====  Compiling all files  =====")
	for (const path of allFilesMatching('src/**/*.{lib,cmd}.civet')) {
		const hResult = await compileFile(path)
		logResult(hResult, path)
	}
}
else {
	// --- Files can be specified as:
	//        - <stub>.(lib|cmd)
	//        - <stub>.(lib|cmd).test
	//        - a full or relative path
	//     Multiple files can be comma-separated
	for (const str of allNonOptions()) {
		DBG(`non-option: ${OL(str)}`)
		for (const item of str.split(',')) {
			const str: string = item
			let ref;let ref1;if ((ref = str.match(/^([A-Za-z0-9_-]+)\.(lib|cmd)$/))) {const lMatches = ref;
				const [_, stub, purpose] = lMatches
				const pat = 'src/**/' + stub + '.' + purpose + '.*'
				for (const path of allFilesMatching(pat)) {
					DBG(`compile file ${OL(path)}`)
					logResult(await compileFile(path), path)
				}
			}
			else if ((ref1 = str.match(/^([A-Za-z0-9_-]+)\.(lib|cmd)\.test$/))) {const lMatches2 = ref1;
				const [_, stub, purpose] = lMatches2
				const pat = 'src/**/' + stub + '.' + purpose + '.test.*'
				for (const path of allFilesMatching(pat)) {
					DBG(`compile file ${OL(path)}`)
					logResult(await compileFile(path), path)
				}
			}
			else {
				DBG(`compile file ${OL(str)}`)
				logResult(await compileFile(str), str)
			}
		}
	}
}
LOG(`(${numCompiled} files compiled)`)
if (flag('w')) {
	watchFiles(Deno.cwd(), (kind, path) => {
		console.log(`EVENT: ${kind} ${OL(path)}`)
		return false
	})
}
