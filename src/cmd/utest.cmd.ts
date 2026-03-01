"use strict";
// utest.cmd.civet

import {
	undef, defined, notdefined, assert, croak, isString,
	} from 'datatypes'
import {stdChecks, centered} from 'llutils'
import {getFlags, nonOption, allNonOptions, argValue} from 'cmd-args'
import {LOG, DBG, ERR} from 'logger'
import {isFile, withExt, findFile} from 'fsys'
import {execCmd, procFiles, procOneFile, doUnitTest} from 'exec'
import {compileAllLibs, doCompileCivet} from 'civet'

stdChecks(`utest [-I] [-line=<n>] {<stub>}
	- run unit test with give stub
	-I = run with chrome debugger
	-line=<n>  - run just this one test`)

// ---------------------------------------------------------------------------
// --- Compile any libraries

await compileAllLibs({abortOnError: true})

const hStyle  = {char: '=', color: 'cyan'}
try {
	// --- echoes if flag is set
	const {force, inspect} = getFlags({
		force: 'f',
		inspect: 'I'
		})
	const lineNum = argValue('line')

	if (nonOption(0) === 'all') {
		assert(notdefined(lineNum), "Can't use -line with 'all'")
		LOG(centered("UNIT TEST ALL LIBS", hStyle))
		await procFiles([doCompileCivet, ['**/*.lib.test.civet']], {force})
		await procFiles([doUnitTest, ['**/*.lib.test.ts']], {
			inspect,
			capture: false
			})
	}
	else {
		for (const stub of allNonOptions()) {
			const fileName = `${stub}.lib.test.civet`
			const path = findFile(fileName)
			assert(isString(path), `No such file: ${fileName}`)
			LOG(centered(`UNIT TEST LIB ${stub}.lib.civet`, hStyle))
			await procOneFile(path, doCompileCivet, {force})
			await procOneFile(withExt(path, '.ts'), doUnitTest, {
				lineNum,
				inspect,
				capture: false
				})
		}
	}
	await execCmd('deno', ['coverage', '--html'], {capture: false})
}

catch (err) {
	ERR(err)
}

