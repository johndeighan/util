"use strict";
// runtemp.cmd.civet

import {
	undef, defined, notdefined, assert, croak,
	} from 'datatypes'
import {findFile, withExt, isFile} from 'fsys'
import {procOneFile, doRun, TExecResult} from 'exec'
import {stdChecks} from 'llutils'
import {flag, argValue, allNonOptions, getFlags} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {doCompileCivet, compileAllLibs} from 'civet'

stdChecks(`runtemp [-fnI] [-stub=<temp_stub>] { <lib_stub> }
	-f = force recompile
	-n = don't attempt to recompile changed libs
	-I = invoke Chrome debugger
	- if lib  <lib_stub>.lib.civet exists, compile it
	- if file <temp_stub>.temp.civet exists, compile and run it
	- default <temp_stub>, if none provided, is 'temp'`)


// ---------------------------------------------------------------------------

debugger
try {
	const {inspect, force, noCompile} = getFlags({
		inspect: 'I',
		force: 'f',
		noCompile: 'n'
		})

	if (!noCompile) {
		// --- Compile any changed libraries
		await compileAllLibs({abortOnError: true})
	}

	// --- compile temp file
	const stub = argValue('stub') || 'temp'
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
		label: 'OUTPUT'
		})
}

catch (err) {
	ERR(err)
}

