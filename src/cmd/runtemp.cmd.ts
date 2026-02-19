"use strict";
// runtemp.cmd.civet

import {
	undef, defined, notdefined, assert, croak, getErrStr,
	assertIsDefined,
	} from 'datatypes'
import {findFile, withExt, isFile} from 'fsys'
import {procOneFile, doRun, TExecResult} from 'exec'
import {stdChecks, o} from 'llutils'
import {flag, argValue, allNonOptions, getFlags} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {doCompileCivet, compileAllLibs} from 'civet'

stdChecks(`runtemp [-fI] [-stub=<temp_stub>] { <lib_stub> }
	-f = force recompile
	-I = invoke Chrome debugger
	- if lib  <lib_stub>.lib.civet exists, compile it
	- if file <temp_stub>.temp.civet exists, compile and run it
	- default <temp_stub>, if none provided, is 'temp'`)


// ---------------------------------------------------------------------------

try {
	const {inspect} = getFlags({
		inspect: 'I'
		})

	// --- Compile any libraries
	const lResults = await compileAllLibs()
	let lFailed: string[] = []
	for (const h of lResults) {
		if (!h.success && defined(h.outfile)) {
			lFailed.push(h.outfile)
		}
	}
	if (lFailed.length > 0) {
		LOG(`${lFailed.length} files failed to compile`)
		Deno.exit(-1)
	}

	// --- compile temp file
	const stub = argValue('stub') || 'temp'
	const root = './src/temp'
	const path = findFile(`${stub}.civet`, {root})
	if (notdefined(path) || !isFile(path)) {
		croak(`Unable to find file: ${stub}.civet in ${root}`)
	}

	// --- run or debug the temp file
	assertIsDefined(path)
	await procOneFile(path, doCompileCivet)

	// --- Run the temp file
	const tsPath = withExt(path, '.ts')
	assert(isFile(tsPath), `No such file: ${tsPath}`)
	await procOneFile(tsPath, doRun, {inspect, capture: false})
}

catch (err) {
	ERR(getErrStr(err))
}

