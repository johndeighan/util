"use strict";
// buildtest.cmd.civet

import {stdChecks, o} from 'llutils'
import {assert, defined} from 'datatypes'
import {nonOption, allNonOptions, flag} from 'cmd-args'
import {withExt, findFile} from 'fsys'
import {
	procFiles, procOneFile, doUnitTest, doInstallCmd,
	} from 'exec'
import {doCompileCivet} from 'civet'

stdChecks("buildutest -nf (all | <stub>*)")

// ---------------------------------------------------------------------------

const force = flag('f')
if (force) {
	console.log(`force = ${force}`)
}

if (nonOption(0) === 'all') {
	await procFiles([doCompileCivet, ['**/*.test.civet']], {force})
}
else {
	for (const stub of allNonOptions()) {
		const fileName = `${stub}.test.civet`
		const path = findFile(fileName)
		assert(defined(path), `No such file: ${fileName}`)
		await procOneFile(path, doCompileCivet, {force})
	}
}

