"use strict";
// runtemp.cmd.civet

import {
	undef, defined, notdefined, assert, croak, getErrStr,
	assertIsDefined,
	} from 'datatypes'
import {findFile, withExt, isFile} from 'fsys'
import {procOneFile, doRun} from 'exec'
import {stdChecks, o} from 'llutils'
import {flag, argValue, allNonOptions, getFlags} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {doCompileCivet} from 'civet'

stdChecks(`runtemp [-I] [-stub=<temp_stub>] { <lib_stub> }
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
	for (const libStub of allNonOptions()) {
		const libPath = findFile(`${libStub}.lib.civet`)
		if (defined(libPath)) {
			await procOneFile(libPath, doCompileCivet, {force: true})
		}
		else {
			LOG(`Unable to find file: ${libStub}.lib.civet`)
		}
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

