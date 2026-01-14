"use strict";
// buildcmd.cmd.civet

import {stdChecks} from 'llutils'
import {assert, defined} from 'datatypes'
import {nonOption, allNonOptions, flag} from 'cmd-args'
import {withExt, findFile, isFile} from 'fsys'
import {
	procFiles, procOneFile, doCompileCivet,
	doUnitTest, doInstallCmd,
	} from 'exec'

stdChecks("buildcmd -n (all | <stub>*)")
const noInstall = flag('n')
if (noInstall) {
	console.log(`noInstall = ${noInstall}`)
}

// ---------------------------------------------------------------------------

if (nonOption(0) === 'all') {
	await procFiles(['*.cmd.civet',      doCompileCivet])
	await procFiles(['*.cmd.test.civet', doCompileCivet])
	await procFiles(['*.cmd.test.ts',    doUnitTest])
	if (!noInstall) {
		await procFiles(['*.cmd.ts',      doInstallCmd])
	}
}
else {
	for (const stub of allNonOptions()) {
		const fileName = `${stub}.cmd.civet`
		const path = findFile(fileName)
		assert(defined(path), `No such cmd file: ${fileName}`)
		await procOneFile(path, doCompileCivet)
		const tsPath = withExt(path, '.ts')
		assert(isFile(tsPath), `File ${tsPath} not created`)

		const testPath = withExt(path, '.test.civet')
		if (findFile(testPath)) {
			await procOneFile(testPath, doCompileCivet)
			await procOneFile(withExt(path, '.test.ts'), doUnitTest)
		}
		else {
			console.log(`No unit test named ${testPath}`)
		}
		if (!noInstall) {
			await procOneFile(tsPath, doInstallCmd)
		}
	}
}

