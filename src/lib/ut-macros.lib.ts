"use strict";
// ut-macros.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {exists, existsSync} from '@std/fs'

import {
	undef, defined, notdefined, assert, obviously, croak,
	newerDestFileExists, getErrStr,
	} from 'base'
import {hash} from 'datatypes'
import {getOptions} from 'llutils'
import {fileExt, withExt, pathStr} from 'fsys'
import {CFileHandler, TExecResult} from 'exec'
import {TMacroLib, mapString} from 'macros'

// ---------------------------------------------------------------------------

const hUnitTestLib: TMacroLib = {
	'#preproc': (block) => {
		return `<style>
	p.head {
		font-weight: bold
		}
	p.desc {
		font-weight: normal
		}
</style>
${block}`
	},
	def: (block) => {
		const lLines = block.split('\n')
		const lOutput = [
			`<p class="head">
	${lLines[0]}
</p>
<p class="desc">`
			]
		for (const line of lLines.slice(1)) {
			lOutput.push(`\t${line}<br>`)
		}
		return lOutput.join('\n') + '\n</p>'
	}
	}

// ---------------------------------------------------------------------------

export class CUnitTestMaker extends CFileHandler {

	get op() {
		return 'doMakeMarkdown'
	}

	// ..........................................................

	override async needed(
			path: string,
			hOptions: hash = {}
			): AutoPromise<boolean> {

		assert((fileExt(path) === '.$md'), "Not an md macro file")
		const destPath = withExt(path, '.md')
		return !(
			   !hOptions.force
			&& await exists(destPath)
			&& newerDestFileExists(path, destPath)
			)
	}

	// ..........................................................
	// ASYNC

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		type opt = {
			force: boolean
			trace: boolean
			}
		const {force, trace} = getOptions<opt>(hOptions, {
			force: false,
			trace: false
			})

		assert((fileExt(path) === '.$md'), "Not an md macro file")
		try {
			const input = await Deno.readTextFile(path)
			const output = await mapString(input, hUnitTestLib)
			await Deno.writeTextFile(withExt(path, '.md'), output)
			return {
				success: true,
				stdout: output
				}
		}

		catch (err) {
			const errMsg = `MARKDOWN PREPROC FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stdout: '',
				stderr: errMsg
				}
		}
	}
}

export const doMakeUnitTest = new CUnitTestMaker()

