"use strict";
// compile.cmd.civet

import {assert, croak, isArray} from 'datatypes'
import {pass} from 'llutils'
import {OL} from 'to-nice'
import {flag, numNonOptions, allNonOptions} from 'cmd-args'
import {watchFiles, allFilesMatching} from 'fsys'
import {DBG, LOG, WARN, ERR} from 'logger'
import {compileFile, TCompileResult} from 'automate'

let numCompiled = 0

// ---------------------------------------------------------------------------

const logResult = (hResult: TCompileResult): void => {

	const {path, status} = hResult
	switch(status) {
		case 'compiled': {
			LOG(`COMPILED: ${OL(path)}`)
			numCompiled += 1;break;
		}
		case 'exists': {
			pass();break;
		}
		default:
			ERR(`NOT COMPILED: ${OL(path)}`)
	}
	return
}

// ---------------------------------------------------------------------------

if (numNonOptions() === 0) {
	DBG("=====  Compiling all files  =====")
	for (const path of allFilesMatching('**/*.{lib,cmd}.civet')) {
		const hResult = compileFile(path)
		logResult(hResult)
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
				const pat = '**/' + stub + '.' + purpose + '.*'
				for (const path of allFilesMatching(pat)) {
					DBG(`compile file ${OL(path)}`)
					logResult(compileFile(path))
				}
			}
			else if ((ref1 = str.match(/^([A-Za-z0-9_-]+)\.(lib|cmd)\.test$/))) {const lMatches2 = ref1;
				const [_, stub, purpose] = lMatches2
				const pat = '**/' + stub + '.' + purpose + '.test.*'
				for (const path of allFilesMatching(pat)) {
					DBG(`compile file ${OL(path)}`)
					logResult(compileFile(path))
				}
			}
			else {
				DBG(`compile file ${OL(str)}`)
				logResult(compileFile(str))
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