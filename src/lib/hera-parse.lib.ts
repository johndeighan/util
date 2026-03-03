"use strict";
// hera-parse.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {uni, esc} from 'unicode'
import {
	undef, defined, notdefined, hash, assert, croak,
	isEmpty, nonEmpty, deepCopy,
	TStringMapper, getErrStr, TVoidFunc,
	} from 'datatypes'
import {isFile, findFile} from 'fsys'
import {MAP} from 'map'
import {
	allLinesInBlock, getOptions, sep,
	} from 'llutils'
import {OL, ML} from 'to-nice'
import {resetOneIndent, splitLine} from 'indent'
import {LOG, DBG, ERR} from 'logger'
import {CParseMatches} from 'parse-utils';

// ---------------------------------------------------------------------------
// --- Replaces indentation with uni.shiftin and uni.shiftout
//     oneIndent, if defined, must be '\t' or some number of space chars

export const str2indents = (str: string): string => {

	assert(!str.includes(uni.shiftin), "Bad input string, has shiftin")
	assert(!str.includes(uni.shiftout), "Bad input string, has shiftout")

	resetOneIndent()
	let lParts: string[] = []
	let level = 0
	let i1 = 0;for (const line of allLinesInBlock(str)) {const i = i1++;
		if (i===0) {
			assert(!line.match(/^\s/), "Leading whitespace not allowed")
			lParts.push(line)
			continue
		}
		if (isEmpty(line)) {
			lParts.push('\n')
		}
		else {
			const [newLevel, str] = splitLine(line)
			if (newLevel === level) {
				lParts.push('\n')
				lParts.push(str)
			}
			else if (newLevel > level) {
				lParts.push(uni.shiftin.repeat(newLevel - level) + str)
			}
			else {      // --- newLevel < level
				lParts.push(uni.shiftout.repeat(level - newLevel) + str)
			}
			level = newLevel
		}
	}

	return lParts.join('') + uni.shiftout.repeat(level)
}

// ---------------------------------------------------------------------------

export const toDebugStr = (str: string): string => {

	const estr = str2indents(str)

	const pre = (level: number): string => {
		return (level < 1) ? '' : '   '.repeat(level)
	}

	let level = 0
	const lChars = [...estr]
	debugger
	const lParts = MAP(lChars, function*(ch) {
		switch(ch) {
			case '\n': {
				yield `\n${pre(level)}${uni.downarrow}`;break;
			}
			case uni.shiftin: {
				yield `\n${pre(level)}${uni.rightshift}  `
				level += 1;break;
			}
			case uni.shiftout: {
				level -= 1
				yield `\n${pre(level-1)}${uni.leftshift}  `;break;
			}
			case ' ': {
				yield uni.fatdot;break;
			}
			case '\t': {
				yield uni.rightarrow;break;
			}
			default: {
				yield ch
			}
		}
	})
	return Array.from(lParts).join('')
}

// ---------------------------------------------------------------------------
// ASYNC

export const doParse = async <T = unknown,>(
		stub: string,
		text: string,
		hOptions: hash = {}
		): AutoPromise<T> => {

	type opt = {
		lTransforms: TStringMapper[]
		debug: boolean
		abortOnError: boolean
		}
	const {lTransforms, debug, abortOnError} = getOptions<opt>(hOptions, {
		lTransforms: [str2indents],
		debug: false,
		abortOnError: true
		})

	if (debug) {
		LOG(`debug = ${debug}`)
	}

	// --- Save original text, then apply transforms to text
	const orgText = text
	for (const func of lTransforms) {
		text = func(text)
	}

	// --- import things from the parser
	try {
		const fileName = `${stub}.parse.ts`
		const path = findFile(fileName)
		assert(isFile(path))
		const {pm, reset, parse} = await import(stub)
		reset(text)
		const result = parse(text) as Awaited<T>
		if (debug) {
			pm.dumpParseInfo()
		}

		// --- Return a deep copy of the result
		return deepCopy(result)
	}

	catch (err) {
		if (err instanceof TypeError) {
			throw `Bad Parser: ${stub}: ${getErrStr(err)}`
		}
		else {
			ERR(`in doParse(${stub})`, 'PARSE ERROR')
			LOG('', toDebugStr(orgText))

			const {pm} = await import(stub)
			pm.dumpParseInfo()

			ERR(err)
			if (abortOnError) {
				Deno.exit(99)
			}
			else {
				throw err
			}
		}
	}
}

