"use strict";
// runtemp.cmd.civet

import {
	undef, defined, notdefined, assert,
	} from 'datatypes'
import {findFile, withExt, isFile} from 'fsys'
import {procOneFile, doRun, TExecResult} from 'exec'
import {stdChecks, croak, colorize} from 'llutils'
import {flag, argValue, allNonOptions, getFlags} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {doCompileCivet, compileAllLibs} from 'civet'

stdChecks(`runtemp [-fnI] [-stub=<temp_stub>] { <lib_stub> }
	-f = force recompile
	-n = don't attempt to recompile changed libs
	-I = invoke Chrome debugger
	- if lib  <lib_stub>.lib.civet exists, compile it
	- if file <temp_stub>.temp.civet exists, compile and run it
	- default <temp_stub>, if none provided, is the last of:
	   'temp', 'temp1', 'temp2', 'temp3', etc.`)

// ---------------------------------------------------------------------------

const lastTempStub = (): string => {    // returns a stub

	let retval = 'temp'
	for (let i = 1; i <= 9; ++i) {const n = i;
		const stub = `temp${n}`
		if (isFile(`src/temp/${stub}.civet`)) {
			retval = stub
		}
		else {
			return retval
		}
	}
	return retval
}

// ---------------------------------------------------------------------------

try {
	const {inspect, force, noCompile} = getFlags({
		inspect: 'I',
		force: 'f',
		noCompile: 'n'
		})

	if (!noCompile) {
		// --- Compile any changed libraries
		await compileAllLibs()
	}

	// --- compile temp file
	const stub = argValue('stub') || lastTempStub()
	LOG(colorize(`Running ${stub}`, 'cyan'))
	const root = './src/temp'

	// --- Make sure the 'temp' folder is NOT ignored
	const path = findFile(`${stub}.civet`, {root, lIgnoreDirs: []})
	if (notdefined(path) || !isFile(path)) {
		croak(`Unable to find file: ${stub}.civet in ${root}`)
	}

	// --- run or debug the temp file
	assert(defined(path))
	await procOneFile(path, doCompileCivet, {inspect, force})

	// --- Run the temp file
	const tsPath = withExt(path, '.ts')
	assert(isFile(tsPath), `No such file: ${tsPath}`)
	await procOneFile(tsPath, doRun, {
		inspect,
		capture: false,
		label: `${stub} OUTPUT`
		})
}

catch (err) {
	ERR(err)
}

