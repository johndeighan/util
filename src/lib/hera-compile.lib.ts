"use strict";
// hera-compile.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {statSync} from 'node-fs'
import {existsSync} from '@std/fs'

import {uni, esc} from 'unicode'
import {
	undef, defined, notdefined, assertIsDefined,
	assert, croak, hash, isEmpty, nonEmpty, getErrStr,
	} from 'datatypes'
import {
	allLinesInBlock, arrayToBlock, getOptions,
	f, sep, pass, untabify,
	} from 'llutils'
import {resetOneIndent, splitLine, indented} from 'indent'
import {LOG, DBG, ERR} from 'logger'
import {debugging} from 'cmd-args'
import {ML} from 'to-nice'
import {fileExt, withExt, isValidStub, pathStr} from 'fsys'
import {
	execCmd, CFileHandler, THandlerResult,
	} from 'exec'

// ---------------------------------------------------------------------------

export class CHeraCompiler extends CFileHandler {

	get op() {
		return 'doCompileHera'
	}

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<THandlerResult> {

		assert((fileExt(path) === '.hera'), "Not a hera file")
		const destPath = withExt(path, '.ts')
		if (
				   !hOptions.force
				&& existsSync(destPath)
				&& (statSync(destPath).mtimeMs > statSync(path).mtimeMs)
				) {
			return {path, success: true}
		}

		try {
			const inProc = (str: string): string => {
				return preprocessHera(str, hOptions)
			}

			const outProc = (str: string): string => {
				return '// @ts-nocheck\n' + str.replaceAll('@danielx', 'npm:@danielx')
			}

			const hResult = await execCmd('deno', [
				'run',
				'-A',
				'npm:@danielx/hera',
				'--module',
				(hOptions.debug ? '--inspect-brk' : '')
			], {
				infile: path,
				inProc,
				outfile: destPath,
				outProc
				})
			return {...hResult, path}
		}

		catch (err) {
			const errMsg = `HERA COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				path,
				stderr: errMsg,
				output: errMsg
				}
		}
	}
}

export const doCompileHera = new CHeraCompiler()

// ---------------------------------------------------------------------------

export const isRuleName = (name: string): boolean => {

	return defined(name.match(/^[A-Za-z$_][A-Za-z0-9$_-]*$/))
}

// ---------------------------------------------------------------------------
// --- 1. Convert TAB chars to 2 spaces
//     2. if debug is set:
//           - add debugHeader block
//           - add "ruleMatch('<rule name>', $loc);" to start of each rule
//     3. output any lines within ``` as is

export const debugHeader = `\`\`\`
import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();
let ruleMatch = (
		name: string,
		loc: [pos: number, length: number]
		): void => {
	pm.match(name, loc);
	}
\`\`\``

// ---------------------------------------------------------------------------

export const preprocessHera = (
		code: string,
		hOptions: hash = {}
		): string => {

	type opt = {
		debug: boolean
		compile: boolean
		}
	const {debug, compile} = getOptions<opt>(hOptions, {
		debug: false,
		compile: false
		})

	type TState = 'main' | 'inBlock' | 'inRule' | 'inHandler'

	let curState = 'main'
	let curRuleName: string = ''

	const isComment = (line: string): boolean => {

		return defined(line.match(/^\s*\#/))
	}

	// ==========================================================

	const lLines: string[] = debug ? [untabify(debugHeader, '  ')] : []

	const output = (
			str: string,
			level: number = 0
			): void => {
		lLines.push('  '.repeat(level) + str.replaceAll('\t', '  '))
		return
	}

	// ==========================================================

	const lBlock: string[] = []

	const startBlock = (): void => {

		lBlock.length = 0
		curState = 'inBlock'
		return
	}

	// ----------------------------------------------------------

	const addBlockCode = (line: string): void => {

		lBlock.push(line)
	}

	// ----------------------------------------------------------

	const endBlock = (): void => {

		output('```')
		output(arrayToBlock(lBlock))
		output('```')
		curState = 'main'
		return
	}

	// ==========================================================

	const startRule = (name: string): void => {

		assert(nonEmpty(name), "Empty rule name")
		curRuleName = name
		output(name)
		lHandler.length = 0
		addHandlerCode(`ruleMatch('${name}', $loc)`)
		curState = 'inRule'
		return
	}

	// --------------------------------------------

	const endRule = (): void => {

		curRuleName = ''
		curState = 'main'
		return
	}

	// ==========================================================

	const lHandler: string[] = []

	const startHandler = (matchStr: string): void => {

		assert(nonEmpty(curRuleName), "Empty rule name")
		if (debug && !matchStr.endsWith('->')) {
			output(f`${matchStr} ->`, 1)
		}
		else {
			output(matchStr, 1)
		}
		lHandler.length = 0
		curState = 'inHandler'
		return
	}

	// --------------------------------------------

	const addHandlerCode = (str: string, level: number=0): void => {

		lHandler.push('  '.repeat(level) + str)
		return
	}

	// --------------------------------------------

	const endHandler = (): void => {

		if (nonEmpty(lHandler)) {
			const block = arrayToBlock(lHandler)
			output(indented(block, 2, {oneIndent: '  '}))
		}
		lHandler.length = 0
		return
	}

	// ==========================================================

	resetOneIndent()
	for (const line of allLinesInBlock(code)) {

		// --- These are output regardless of the state we're in
		if (line.match(/^\s*\#/)) {
			output((curState === 'inHandler') || (curState === 'inBlock') ? line.replace('#', '//') : line)
			continue
		}

		const [level, str] = splitLine(line)   // --- str is trimmed
		switch(curState) {

			case 'main': {
				if (isEmpty(line)) {
					output('')
				}
				else if (isComment(line)) {
					output(line)
				}
				else if (line === '```') {
					startBlock()
				}
				else if (isRuleName(str)) {
					assert((level === 0), f`Invalid rule name: ${line}:!`)
					startRule(str)
				}
				else {
					croak(f`Invalid rule Name: ${line}:!`)
				};break;
			}

			case 'inBlock': {
				if (isEmpty(line)) {
					addBlockCode('')
				}
				else if (line === '```') {
					endBlock()
				}
				else {
					addBlockCode(line)
				};break;
			}

			case 'inRule': {
				if (isEmpty(line)) {
					output('')
				}
				else if (isComment(line)) {
					output(line)
				}
				else {
					// --- expect a match string
					assert((level === 1), f`Invalid match string: ${line}:!`)
					startHandler(str)
				};break;
			}

			case 'inHandler': {
				if (isEmpty(line)) {
					addHandlerCode('')
				}
				else {
					switch(level) {
						case 0: {
							endHandler()
							startRule(str);break;
						}
						case 1: {
							endHandler()
							startHandler(str);break;
						}
						default: {
							addHandlerCode(str, level-2)
						}
					}
				};break;
			}
		}
	}
	if (curState === 'inHandler') {
		endHandler()
	}

	return lLines.join('\n')
}

