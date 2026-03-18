"use strict";
// utest.cmd.civet

import {
	undef, defined, notdefined, assert, isString,
	} from 'datatypes'
import {stdChecks, cmdTitle, croak} from 'llutils'
import {getFlags, nonOption, allNonOptions, argValue} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {isFile, withExt, findFile, relpath} from 'fsys'
import {execCmd, procFiles, procOneFile} from 'exec'
import {doUnitTest} from 'typescript'
import {compileAllLibs, doCompileCivet} from 'civet'

stdChecks(`utest [-I] [-line=<n>] {<stub>} | all
	- run unit test with give stub
	-I = run with chrome debugger
	-line=<n>  - run just this one test`)

// ---------------------------------------------------------------------------
// --- Compile any libraries

await compileAllLibs()

try {
	// --- echoes if flag is set
	const {force, inspect} = getFlags({
		force: 'f',
		inspect: 'I'
		})
	const lineNum = argValue('line')

	if (nonOption(0) === 'all') {
		assert(notdefined(lineNum), "Can't use -line with 'all'")
		LOG(cmdTitle("UNIT TEST ALL LIBS"))
		await procFiles([doCompileCivet, ['**/*.lib.test.civet']], {force})
		await procFiles([doUnitTest, ['**/*.lib.test.ts']], {
			inspect,
			capture: true
			})

		// --- Create HTML coverage file
		await execCmd('deno', ['coverage', '--html'], {capture: false})
	}
	else {
		for (const stub of allNonOptions()) {
			const fileName = (
				  stub.includes('.')
				? `${stub}.test.civet`
				: `${stub}.lib.test.civet`   // default is a 'lib' unit test
				)
			const path = findFile(fileName)
			if (defined(path)) {
				const tsPath = withExt(path, '.ts')
				LOG(cmdTitle(`RUN UNIT TEST ${relpath(path)}`))
				await procOneFile(path, doCompileCivet, {force})
				await procOneFile(tsPath, doUnitTest, {
					lineNum,
					inspect,
					capture: true
					})
			}
			else {
				ERR(`No such file: ${fileName}`)
			}
		}
	}
}

catch (err) {
	ERR(err)
}

