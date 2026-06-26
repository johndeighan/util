"use strict";
// utest.cmd.civet

import {LOG, DBG, ERR} from 'logger'
import {
	toRelPath, undef, defined, notdefined, assert,
	decolorize, write, writeln,
	} from 'base'
import {isString} from 'datatypes'
import {stdChecks, cmdTitle, f, dashes, EXEC} from 'llutils'
import {getFlags, nonOption, allNonOptions, argValue} from 'cmd-args'
import {
	isFile, rmDir, withExt, findFile, allFilesMatching, parsePath,
	} from 'fsys'
import {execCmd, TExecResult, procFiles, procOneFile, TProcSpec} from 'exec'
import {doUnitTest} from 'typescript'
import {doCompileCivet, compileAllLibs} from 'civet'
import {DUMP} from 'nice'
import {CTimer} from 'timer'

stdChecks(`utest [-I] [-line=<n>] {<stub>} | all
	- run unit test with given stub
	-I = run with chrome debugger
	-line=<n> - run just this one test`)

// ---------------------------------------------------------------------------

const dumpResult = (
		hResult: TExecResult
		): void => {

	const path = hResult.infile
	if (notdefined(path)) {
		LOG("MISSING infile")
		return
	}

	const h = parsePath(path)
	const stub = h.stub.endsWith('.lib') ? h.stub.replace('.lib', '') : h.stub

	const stdout = hResult.stdout || 'BAD'
	const lMatches = decolorize(stdout).match(/ok\s*\|\s*(\d+)\s*passed\s*\|\s*(\d+)\s*failed\s*\((\d+)(s|ms)\)/)
	if (defined(lMatches)) {
		const [_, nOK, nBad, tm, units] = lMatches
		const timeStr = `${tm} ${units}`
		LOG(f`${stub}:-14 ${nOK}:4 ${nBad}:4 ${timeStr}:8`)
	}
	else {
		LOG(hResult.stdout)
	}
}

EXEC(async () => {
	assert(defined(nonOption(0)), "No unit tests specified")
	await compileAllLibs()

	const {force, inspect} = getFlags({
		force: 'f',
		inspect: 'I'
		})
	const lineNum = argValue('line')

	if (nonOption(0) === 'all') {
		assert(notdefined(lineNum), "Can't use -line with 'all'")
		assert(!inspect, "Can't use -I with 'all'")
		rmDir('./coverage', {clear: true})
		LOG(cmdTitle("UNIT TEST ALL"))

		const timer = new CTimer()
		const works = false
		if (works) {
			// --- This craps out, so we'll do one at a time
			await procFiles([doCompileCivet, ['**/*.lib.test.civet']], {force})

			// --- Print the header
			LOG(f`${'Lib'}:-14 ${'OK'}:4 ${'Fail'}:4 ${'Time'}:8`)
			LOG([dashes(14), dashes(4), dashes(4), dashes(8)].join(' '))

			for (const hResult of await procFiles([doUnitTest, ['**/*.lib.test.ts']])) {
//				DUMP hResult, 'hResult'
				assert(defined(hResult.infile), "infile not defined")
				dumpResult(hResult)
			}
		}
		else {
			// --- Print the header
			LOG(f`${'Lib'}:-14 ${'OK'}:4 ${'Fail'}:4 ${'Time'}:8`)
			LOG([dashes(14), dashes(4), dashes(4), dashes(8)].join(' '))

			for (const path of allFilesMatching('./**/*.test.civet')) {
				await procOneFile(path, doCompileCivet, {force, quiet: true})
				const hResult = await procOneFile(withExt(path, '.ts'), doUnitTest, {
					capture: true,
					quiet: true
					})
				dumpResult(hResult)
			}
		}

		console.log(`TIME TAKEN: ${timer.timeTaken()}`)
	}
	else {
		// --- not all
		for (const stub of allNonOptions()) {
			const fileName = (
				  stub.includes('.')
				? `${stub}.test.civet`
				: `${stub}.lib.test.civet`   // default is a 'lib' unit test
				)
			const path = findFile(fileName)
			if (defined(path)) {
				const tsPath = withExt(path, '.ts')
				LOG(cmdTitle(`RUN UNIT TEST ${toRelPath(path)}`))
				await procOneFile(path, doCompileCivet, {force})
				debugger
				await procOneFile(tsPath, doUnitTest, {
					lineNum,
					inspect
					})
			}
			else {
				ERR(`No such file: ${fileName}`)
			}
		}
	}

	if (!inspect) {
		// --- Create HTML coverage file
		write("Building coverage report...")
		const hResult = await execCmd('deno', ['coverage', '--html'])
		writeln("Done")
		LOG(hResult.stdout)
	}
})

