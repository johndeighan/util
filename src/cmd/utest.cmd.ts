"use strict";
// utest.cmd.civet

import {LOG, DBG, ERR} from 'logger'
import {
	toRelPath, undef, defined, notdefined, assert,
	decolorize, write, writeln, clearScreen,
	} from 'base'
import {isString} from 'datatypes'
import {cmdTitle, f, dashes, EXEC} from 'llutils'
import {
	isFile, rmDir, withExt, findFile, allFilesMatching, parsePath,
	} from 'fsys'
import {execCmd, TExecResult} from 'exec'
import {TProcSpec, procFiles, procOneFile} from 'proc-files'
import {doUnitTest} from 'typescript'
import {doCompileCivet, compileAllLibs} from 'civet'
import {DUMP} from 'nice'
import {CTimer} from 'timer'
import {
	stdChecks, getFlags, nonOption, allNonOptions, argValue,
	} from 'cmd-args'

stdChecks({
	_: {
		range: [1,99],
		desc: "stubs or 'all'"
		},
	p: {
		type: 'boolean',
		desc: 'run in parallel'
		},
	line: {
		type: 'integer',
		desc: "line to test"
		}
	})

// ---------------------------------------------------------------------------

await EXEC(async () => {
	assert(defined(nonOption(0)), "No unit tests specified")
	await compileAllLibs()

	const {force, inspect, parallel} = getFlags({
		force: 'f',
		inspect: 'I',
		parallel: 'p'
		})
	const lineNum = argValue('line')

	if (nonOption(0) === 'all') {

		// --- Define a utility function for display all results
		const dumpResult = (
				hResult: TExecResult
				): void => {

			const path = hResult.infile
			if (notdefined(path)) {
				ERR("MISSING infile")
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

		assert(notdefined(lineNum), "Can't use -line with 'all'")
		assert(!inspect, "Can't use -I with 'all'")
		rmDir('./coverage', {clear: true})
		LOG(cmdTitle("UNIT TEST ALL"))

		const timer = new CTimer()

		// --- 1st way doesn't work yet
		if (parallel) {
			// --- This craps out, so we'll do one at a time
			await procFiles([doCompileCivet, ['**/*.lib.test.civet']], {force})

			// --- Print the header
			LOG(f`${'Lib'}:-14 ${'OK'}:4 ${'Fail'}:4 ${'Time'}:8`)
			LOG([dashes(14), dashes(4), dashes(4), dashes(8)].join(' '))

			await procFiles([doUnitTest, ['**/*.lib.test.ts']])
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
		if (!inspect) {
			// --- Create HTML coverage file
			write("Building coverage report...")
			const hResult = await execCmd('deno', ['coverage', '--html'])
			writeln("Done")
		}
	}
	else {
		// --- not 'all'
		for (const stub of allNonOptions()) {
			const fileName = (
				  stub.includes('.')
				? `${stub}.test.civet`
				: `${stub}.lib.test.civet`   // default is a 'lib' unit test
				)
			const path = findFile(fileName)
			if (notdefined(path)) {
				ERR(`No such file: ${fileName}`)
				continue
			}
			await procOneFile(path, doCompileCivet, {force, quiet: true})
			const tsPath = withExt(path, '.ts')
			LOG(cmdTitle(`RUN UNIT TEST ${toRelPath(path)}`))
			const hResult = await procOneFile(tsPath, doUnitTest, {
				lineNum,
				inspect
				})
		}
	}
})

