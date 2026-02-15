"use strict";
// hera-parse.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {uni, esc} from 'unicode'
import {
	undef, defined, notdefined, hash, assert, croak,
	isEmpty, nonEmpty,
	TStringMapper, getErrStr, TVoidFunc,
	} from 'datatypes'
import {
	allLinesInBlock, getOptions, sep,
	} from 'llutils'
import {resetOneIndent, splitLine} from 'indent'
import {LOG, DBG, ERR} from 'logger'
import {CParseMatches} from 'parse-utils';

// ---------------------------------------------------------------------------
// --- Replaces indentation with uni.shiftin and uni.shiftout
//     oneIndent, if defined, must be '\t' or some number of space chars

export const str2indents = (str: string): string => {

	assert(!str.includes(uni.shiftin), "Bad input string")
	assert(!str.includes(uni.shiftout), "Bad input string")

	resetOneIndent()
	let lParts: string[] = []
	let level = 0
	let i1 = 0;for (const line of allLinesInBlock(str)) {const i = i1++;
		if (i===0) {
			assert(!line.match(/^\s/), "Leading whitespace not allowed")
			lParts.push(line)
			continue
		}
		if (nonEmpty(line)) {
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

	for (const func of lTransforms) {
		text = func(text)
	}

	// --- import things from the parser
	try {
		const {pm, reset, parse} = await import(stub)
		reset(text)
		const result = parse(text) as Awaited<T>
		if (debug) {
			pm.dumpParseInfo()
		}
		return result
	}

	catch (err) {
		if (err instanceof TypeError) {
			throw `Bad Parser: ${stub}: ${getErrStr(err)}`
		}
		else {
			ERR(`PARSE ERROR in doParse(${stub})`)
			const {pm} = await import(stub)
			pm.dumpParseInfo()

			const errStr = getErrStr(err)
			console.error(errStr)
			if (abortOnError) {
				Deno.exit(99)
			}
			else {
				throw err
			}
		}
	}
}

