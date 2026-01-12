"use strict";
// buildlib.cmd.civet

import {stdChecks} from 'llutils'
import {assert, defined} from 'datatypes'
import {nonOption, allNonOptions, flag} from 'cmd-args'
import {withExt, findFile} from 'fsys'
import {
	procFiles, procOneFile, doCompileCivet, doUnitTest, doInstallCmd,
	} from 'exec'

stdChecks("buildlib -nf (all | <stub>*)")

// ---------------------------------------------------------------------------

const force = flag('f')
if (force) {
	console.log(`force = ${force}`)
}

// --- even with noTest, we'll compile and type check the unit tests
const noTest = flag('n')
if (noTest) {
	console.log(`noTest = ${noTest}`)
}

if (nonOption(0) === 'all') {
	await procFiles(['*.lib.civet', doCompileCivet], {force})
	await procFiles(['*.lib.test.civet', doCompileCivet], {force})
	if (!noTest) {
		await procFiles(['*.lib.test.ts', doUnitTest])
	}
}
else {
	for (const stub of allNonOptions()) {
		const fileName = `${stub}.lib.civet`
		const path = findFile(fileName)
		assert(defined(path), `No such file: ${fileName}`)
		const hResult = await procOneFile(path, doCompileCivet, {force})

		if (hResult.success) {
			// --- compile and check unit test file
			const testFileName = `${stub}.lib.test.civet`
			const testPath = findFile(testFileName)
			if (defined(testPath)) {
				await procOneFile(testPath, doCompileCivet, {force})
				if (!noTest) {
					const hResult = await procOneFile(withExt(testPath, '.ts'), doUnitTest)
					if (('stdout' in hResult) && defined(hResult.stdout)) {
						console.log(hResult.stdout.trim())
					}
				}
			}
			else {
				console.log(`No unit test for ${stub}.lib`)
			}
		}
	}
}