"use strict";
// --- runtemp.cmd.civet

import {writeln} from 'console-utils'
import {undef, defined, assert, croak} from 'datatypes'
import {findFile, parsePath, withExt, isFile} from 'fsys'
import {DUMP} from 'to-nice'
import {
	procOneFile, procFiles,
	doRun, doCompileCivet, getErrStr,
	} from 'exec'
import {splitArray, sep, stdChecks, o} from 'llutils'
import {flag, argValue, allNonOptions} from 'cmd-args'
import {LOG, DBG} from 'logger'

stdChecks(`runtemp [-d] [-name=<temp_stub> { <lib_stub> }
	- if lib  <lib_stub>.lib.civet   exists, compile it
	- if file <temp_stub>.temp.civet  exists, compile and run it
	- default <temp_stub>, if none provided, is 'temp'`)

// ---------------------------------------------------------------------------
// --- Compile any libraries

try {
	for (const libStub of allNonOptions()) {
		const libPath = findFile(`${libStub}.lib.civet`)
		if (defined(libPath)) {
			await procOneFile(libPath, doCompileCivet)
		}
		else {
			LOG(`No such file: ${libStub}.lib.civet`)
		}
	}

	// --- Compile temp file
	const stub = argValue('name') || 'temp'
	const path = findFile(`${stub}.civet`, {root: './src/temp'})
	assert(defined(path) && isFile(path), `No such file: ${path}`)
	await procOneFile(path, doCompileCivet, {force: true})

	// --- Run the temp file
	const tsPath = withExt(path, '.ts')
	assert(isFile(tsPath), `No such file: ${tsPath}`)
	await procOneFile(tsPath, doRun, o`!capture`)
}

catch (err) {
	console.log(`ERROR: ${getErrStr(err)}`)
}