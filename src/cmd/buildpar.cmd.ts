"use strict";
// buildpar.cmd.civet

import {assert, defined} from 'datatypes'
import {stdChecks} from 'llutils'
import {flag, nonOption, allNonOptions} from 'cmd-args'
import {
	withExt, findFile, parsePath, allFilesMatching,
	} from 'fsys'
import {
	doCompileCivet, doUnitTest, doInstallCmd,
	procFiles, procOneFile,
	} from 'exec'
import {doCompileHera} from 'hera-compile'

stdChecks("buildpar (all | <stub>+)")

// ---------------------------------------------------------------------------
// --- install before running unit tests
//     since unit test may require command to be installed

if (nonOption(0) === 'all') {
	await procFiles(['*.parse.hera',       doCompileHera])
	await procFiles(['*.parse.test.civet', doCompileCivet])
	await procFiles(['*.parse.test.ts',    doUnitTest])
}
else {
	for (const stub of allNonOptions()) {
		const heraFileName = `${stub}.parse.hera`
		const heraPath = findFile(heraFileName)
		assert(defined(heraPath), `No such hera file: ${heraFileName}`)
		await procOneFile(heraPath, doCompileHera)
		const testFileName = withExt(heraFileName, '.test.civet')
		const testPath = findFile(testFileName)
		if (defined(testPath)) {
			await procOneFile(testPath, doCompileCivet)
			await procOneFile(withExt(heraPath, '.ts'), doUnitTest)
		}
		else {
			console.log(`No unit test named ${testPath}`)
		}
	}
}