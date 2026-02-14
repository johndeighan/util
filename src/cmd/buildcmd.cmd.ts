"use strict";
// buildcmd.cmd.civet

import {assert, defined, getErrStr} from 'datatypes'
import {stdChecks, centered} from 'llutils'
import {nonOption, allNonOptions, getFlags} from 'cmd-args'
import {ERR} from 'logger'
import {withExt, findFile, isFile} from 'fsys'
import {
	procFiles, procOneFile, doUnitTest, doInstallCmd,
	} from 'exec'
import {doCompileCivet} from 'civet'

stdChecks(`buildcmd -itI (all | <stub>+)
   -i = install the command
   -t = run unit test
   -I = use Chrome debugger`)

// ---------------------------------------------------------------------------

const hStyle  = {char: '=', color: 'cyan'}
try {
	// --- echoes if flag is set
	const {doInstall, doTest, inspect} = getFlags({
		doInstall: 'i',
		doTest: 't',
		inspect: 'I'
		})

	if (nonOption(0) === 'all') {
		console.log(centered("BUILD ALL CMDS", hStyle))
		await procFiles([doCompileCivet, ['src/**/*.cmd.civet']])
		if (doTest) {
			await procFiles([doCompileCivet, ['src/**/*.cmd.test.civet']])
			await procFiles([doUnitTest,     ['src/**/*.cmd.test.ts']])
		}
		if (doInstall) {
			await procFiles([doInstallCmd, ['src/**/*.cmd.ts']])
		}
	}
	else {
		for (const stub of allNonOptions()) {
			console.log(centered(`BUILD CMD ${stub}`, hStyle))
			const fileName = `${stub}.cmd.civet`
			const path = findFile(fileName)
			assert(defined(path), `Unable to find file: ${fileName}`)
			await procOneFile(path, doCompileCivet, {inspect})
			const tsPath = withExt(path, '.ts')
			assert(isFile(tsPath), `File ${tsPath} not created`)

			if (doTest) {
				const testPath = withExt(path, '.test.civet')
				if (findFile(testPath)) {
					await procOneFile(testPath, doCompileCivet)
					await procOneFile(withExt(path, '.test.ts'), doUnitTest)
				}
				else {
					console.log(`No unit test named ${testPath}`)
				}
			}
			if (doInstall) {
				await procOneFile(tsPath, doInstallCmd)
			}
		}
	}
}
catch (err) {
	ERR(getErrStr(err))
}

