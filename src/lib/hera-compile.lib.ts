"use strict";
// hera-compile.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {exists, existsSync} from '@std/fs'

import {LOG, DBG, ERR, pushLogLevel, popLogLevel} from 'logger'
import {
	pass, undef, defined, notdefined,
	croak, assert, getErrStr, allLinesIn,
	TIterator, TAsyncIterator, toBool,
	} from 'base'
import {uni, esc} from 'unicode'
import {
	hash, isEmpty, nonEmpty, isString, isIterator, isHash,
	} from 'datatypes'
import {
	arrayToBlock, getOptions,
	sep, untabify, f, hasKey, spaces, countChars,
	} from 'llutils'
import {
	resetOneIndent, splitLine, indented, undented,
	} from 'indent'
import {debugging} from 'cmd-args'
import {ML, DUMP, DDUMP} from 'nice'
import {
	fileExt, withExt, pathStr, newerDestFileExists,
	CReadableFile, barfTempFile, parsePath,
	} from 'fsys'
import {TState, fromFSM} from 'fsm'
import {civet2ts} from 'llcivet'
import {CFileHandler, TExecResult} from 'exec'
import {extractMetaData, mdGet} from 'meta-data'
import {THeraType, isHeraType, compileHera} from 'llhera'
import {CRuleBranch, CRule, CRuleSet, mkCodeBlock} from 'rule'
import {mkArray} from 'mapper'

// ---------------------------------------------------------------------------

export class CHeraCompiler extends CFileHandler {

	get op() {
		return 'doCompileHera'
	}

	override async needed(
			path: string,
			hOptions: hash = {}
			): AutoPromise<boolean> {

		const destPath = withExt(path, '.ts')
		return !(
			   !hOptions.force
			&& await exists(destPath)
			&& newerDestFileExists(path, destPath)
			)
	}

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

		assert((fileExt(path) === '.hera'), "Not a hera file")
		const destPath = withExt(path, '.ts')
		try {
			// --- preprocess, save to a temp file
			const tempPath = withExt(path, '.temp.hera')
			const [heraCode, type] = await preprocHeraFile(path, tempPath, hOptions)

			const fileName = parsePath(path).fileName
			const tsCode = await compileHera(heraCode, type, fileName)
			await Deno.writeTextFile(withExt(path, '.ts'), tsCode)

			return {
				success: true,
				stdout: tsCode
				}
		}

		catch (err) {
			const errMsg = `HERA COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stdout: '',
				stderr: errMsg
				}
		}
	}
}

export const doCompileHera = new CHeraCompiler()

// ---------------------------------------------------------------------------
// ASYNC

const buildHeraFile = async (
		lMainCode: string[],
		lResetCode: string[],
		ruleSet: CRuleSet,
		hOptions: hash = {}
		) => {

	type opt = {
		type: THeraType
		trace: boolean
		}
	const {type, trace} = getOptions<opt>(hOptions, {
		type: 'civet',
		trace: false
		})

	if (trace) {
		pushLogLevel('debug')
	}

	const mainCode = await mkCodeBlock(lMainCode, type)
	DDUMP(mainCode, 'mainCode')

	const resetCode = await mkCodeBlock(lResetCode, type)
	DDUMP(resetCode, 'resetCode')

	const results=[];for (const rule of ruleSet.allRules()) {
		results.push(await rule.asString(type))
	};const lRuleBlocks =results

	let i1 = 0;for (const block of lRuleBlocks) {const i = i1++;
		DDUMP(block, `Rule[${i}]`)
	}

	let lParts: string[] = []
	lParts.push(
		"```",
		"import {CParseMatches} from 'parse-utils';",
		"export let pm = new CParseMatches();",
		"")
	if (nonEmpty(mainCode)) {
		lParts.push(mainCode, "")
	}

	lParts.push(
		"export const beginParse = (",
		indented("text: string,", 2),
		indented("hOptions: {[key: string|symbol]: unknown} = {}", 2),
		indented("): string|undefined => {", 2),
		indented("pm.reset(text);"),
		indented(resetCode),
		indented('}'),
		"```",
		'',
		lRuleBlocks.join('\n\n'))

	const result = lParts.join('\n').replaceAll('\t', spaces(2))

	DDUMP(result, 'Result')
	if (trace) {
		popLogLevel()
	}
	return result
}

// ---------------------------------------------------------------------------

export const unbalanced = (str: string): boolean => {

	if ( countChars(str, '(') !== countChars(str, ')') ) {
		return true
	}
	if ( countChars(str, '{') !== countChars(str, '}') ) {
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
// ASYNC

export const preprocHera = async (
		contents: string,
		hOptions: hash = {}
		): AutoPromise<string> => {

	type opt = {
		type: THeraType
		trace: boolean
		}
	const {type, trace} = getOptions<opt>(hOptions, {
		type: 'civet',
		trace: false
		})

	if (trace) {
		pushLogLevel('debug')
	}

	const isComment = (str: string): boolean => {
		return toBool(str.match(/^\s*#\s/)) || isEmpty(str)
	}

	resetOneIndent(undef, spaces(2))

	const lMainCode:  string[] = []
	const lResetCode: string[] = []

	const ruleSet = new CRuleSet()

	const lLines: string[] = mkArray(allLinesIn(contents), function*(line) {
		if (!isComment(line)) {
			yield line
		}
	})

	const result = await fromFSM(lLines, [

		// 0 --- start
		//          until we see #beginParse, everything, including
		//          blank lines, goes into main code

		(line: string): TState => {
			if (line.startsWith('#beginParse')) {
				return 1
			}
			else {
				lMainCode.push(line)
				return 0
			}
		},

		// 1 --- in beginParse function
		//          until we see a rule name, everything, including
		//          blank lines, goes into reset code

		(line: string): TState => {
			const [level, str] = splitLine(line)
			if (level === 0) {
				if (isEmpty(str)) {
					lResetCode.push('')
					return 1
				}
				else {
					const rule = ruleSet.addRule(str)
					return 2
				}
			}
			else {
				lResetCode.push(indented(str, level-1))
				return 1
			}
		},

		// 2 --- have rule, want pattern
		//          skip blank lines, but expect a pattern at level 1

		(line: string, i: number): TState => {
			const [level, pat] = splitLine(line)
			if ((level === 0) && (pat === '')) {
				return 2
			}

			const rule = ruleSet.curRule()
			const name = rule.getName()
			const nb = rule.numBranches()
			assert((level === 1) && nonEmpty(pat),
				`Expecting pattern for rule ${name}, branch ${nb} on line ${i}`)
			rule.addBranch(pat)
			return 3
		},

		// 3 --- have pattern, want code
		//          ignore blank lines

		(line: string, i: number): TState => {
			const [level, str] = splitLine(line)
			const rule = ruleSet.curRule()
			switch(level) {
				case 0: {
					if (str === '') {
						return 3
					}
					else {
						ruleSet.addRule(str)
						return 2
					}
				}
				case 1: {
					rule.addBranch(str)
					return 3
				}
				default: {
					const branch = rule.curBranch()

					// --- first line of code must be at level 2
					if (branch.numCodeLines() === 0) {
						assert((level === 2), "First line of code must be level 2")
						branch.addCode(`pm.match('${ruleSet.ruleName()}', $loc);`)
					}

					branch.addCode(indented(str, level-2))
					return 3
				}
			}
		}

		],
		async (state: TState) => {
			if (state === 3) {
				// --- Check all branches of all rules for cases where
				//     no code was generated
				for (const rule of ruleSet.allRules()) {
					for (const branch of rule.allBranches()) {
						if (branch.numCodeLines() === 0) {
							branch.addCode(`pm.match('${rule.getName()}', $loc);`)
						}
					}
				}

				return await buildHeraFile(lMainCode, lResetCode, ruleSet, hOptions)
			}
			else {
				croak(`Ended in state ${state}`)
			}
		},
		{})

	assert((typeof result === 'string'), `result not a string: ${result}`)
	if (trace) {
		popLogLevel()
	}

	return result
}

// ---------------------------------------------------------------------------
// ASYNC

export const preprocHeraFile = async (
		path: string,
		tempPath: (string | undefined) = undef,
		hOptions: hash = {}
		): AutoPromise<[string, THeraType]> => {

	const file = new CReadableFile(path)
	const hMetaData = await file.metaData()
	const contents = await file.getContents()
	const type = mdGet(hMetaData, 'type', 'civet')
	assert(isHeraType(type), `Bad hera type: ${type}`)
	const heraCode = await preprocHera(contents, {type})
	if (defined(tempPath)) {
		await Deno.writeTextFile(tempPath, heraCode)
	}
	return [heraCode, type]
}

// ---------------------------------------------------------------------------
// ASYNC

export const testHeraCode = async (
		code: string,
		type: THeraType = 'civet'
		): AutoPromise<string> => {


	const heraCode = await preprocHera(code, {type})

	// --- Make sure the generated code compiles
	try {
		await compileHera(heraCode, type)
	}
	catch (err) {
		DUMP(heraCode, 'Hera Code', {lineNumbers: true})
		croak(`FAILED TO PARSE: ${getErrStr(err)}`)
	}

	return heraCode
}

