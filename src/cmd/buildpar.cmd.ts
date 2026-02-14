"use strict";
// buildpar.cmd.civet

import {assert, defined, getErrStr} from 'datatypes'
import {stdChecks, centered} from 'llutils'
import {flag, nonOption, allNonOptions, getFlags} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {
	withExt, findFile, parsePath,
	} from 'fsys'
import {
	doUnitTest, doInstallCmd, procFiles, procOneFile,
	} from 'exec'
import {doCompileCivet} from 'civet'
import {doCompileHera} from 'hera-compile'

stdChecks(`buildpar -ftI (all | <stub>*)
	-f = force
	-t = run unit test
	-I = use Chrome debugger`)

// ---------------------------------------------------------------------------
// --- install before running unit tests
//     since unit test may require command to be installed

const hStyle  = {char: '=', color: 'cyan'}
try {
	// --- echoes if flag is set
	const {force, doTest, inspect} = getFlags({
		force: 'f',
		doTest: 't',
		inspect: 'I'
		})

	if (nonOption(0) === 'all') {
		console.log(centered("BUILD ALL PARSERS", hStyle))
		await procFiles([doCompileHera,  ['src/**/*.parse.hera']], {force})
		if (doTest) {
			await procFiles([doCompileCivet, ['src/**/*.parse.test.civet']], {force})
			await procFiles([doUnitTest,     ['src/**/*.parse.test.ts']])
		}
	}
	else {
		for (const stub of allNonOptions()) {
			console.log(centered(`BUILD PARSER ${stub}`, hStyle))
			const heraFileName = `${stub}.parse.hera`
			const heraPath = findFile(heraFileName)
			assert(defined(heraPath), `Can't find file: ${heraFileName}`)
			await procOneFile(heraPath, doCompileHera, {force, inspect})
			if (doTest) {
				const testFileName = withExt(heraFileName, '.test.civet')
				const testPath = findFile(testFileName)
				if (defined(testPath)) {
					await procOneFile(testPath, doCompileCivet, {force})
					await procOneFile(withExt(heraPath, '.ts'), doUnitTest)
				}
				else {
					console.log(`No unit test named ${testPath}`)
				}
			}
		}
	}
}
catch (err) {
	ERR(getErrStr(err))
}


