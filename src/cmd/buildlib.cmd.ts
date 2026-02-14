"use strict";
// buildlib.cmd.civet

import {assert, defined, getErrStr} from 'datatypes'
import {stdChecks, o, centered} from 'llutils'
import {nonOption, allNonOptions, getFlags} from 'cmd-args'
import {LOG, ERR} from 'logger'
import {withExt, findFile, relpath} from 'fsys'
import {procFiles, procOneFile, doUnitTest} from 'exec'
import {doCompileCivet} from 'civet'

stdChecks(`buildlib -ftI (all | <stub>*)
   -f = force, i.e. always compile
   -t = test, i.e. run unit tests
   -I = use Chrome debugger for compile
   -J = use Chrome debugger for unit test`)

// ---------------------------------------------------------------------------

const hStyle  = {char: '=', color: 'cyan'}
try {
	// --- echoes if flag is set
	const {force, doTest, inspect, inspectTest} = getFlags({
		force: 'f',
		doTest: 't',
		inspect: 'I',
		inspectTest: 'J'
		})

	if (nonOption(0) === 'all') {
		LOG(centered("BUILD ALL LIBS", hStyle))
		await procFiles([doCompileCivet, ['**/*.lib.civet']], {force})
		if (doTest) {
			await procFiles([doCompileCivet, ['**/*.lib.test.civet']], {force})
			await procFiles([doUnitTest, ['**/*.lib.test.ts']], {capture: false})
		}
	}
	else {
		for (const stub of allNonOptions()) {
			const fileName = `${stub}.lib.civet`
			const path = findFile(fileName)
			assert(defined(path), `No such file: ${fileName}`)
			LOG(centered(`BUILD LIB ${relpath(path)}`, hStyle))
			await procOneFile(path, doCompileCivet, {force, inspect})

			if (doTest) {
				// --- compile and check unit test file
				const testFileName = `${stub}.lib.test.civet`
				const testPath = findFile(testFileName)
				if (defined(testPath)) {
					LOG(centered(`COMPILE TEST ${relpath(testPath)}`, hStyle))
					await procOneFile(testPath, doCompileCivet, {force})
					const tsPath = withExt(testPath, '.ts')
					LOG(centered(`RUN TEST ${relpath(tsPath)}`, hStyle))
					const hResult = await procOneFile(tsPath, doUnitTest, {
						capture: false,
						inspect: inspectTest
						})
				}
				else {
					LOG(`No unit test exists for ${stub}.lib`)
				}
			}
		}
	}
}
catch (err) {
	ERR(getErrStr(err))
}

