"use strict";
// hera-parse.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {uni, esc} from 'unicode'
import {
	undef, defined, notdefined, hash, assert, croak, isEmpty,
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
	const lParts: string[] = []
	let level = 0
	for (const line of allLinesInBlock(str)) {
		if (isEmpty(line)) {
			lParts.push('')
		}
		else {
			const [newLevel, str] = splitLine(line)
			if (newLevel === level) {
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

	// --- join parts, making sure result ends with a newline
	const block = (
		  (lParts.length > 0) && lParts.at(-1)?.endsWith('\n')
		? lParts.join('\n')
		: lParts.join('\n') + '\n'
		)
	return block + uni.shiftout.repeat(level)
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

	for (const func of lTransforms) {
		text = func(text)
	}
//	console.log esc(text, 'oneline')
//	n := Math.floor(text.length / 10) + 1
//	console.log "|         ".repeat n

	// --- import things from the parser
	let pm: CParseMatches
	let reset: TVoidFunc
	let parse: (str: string) => unknown
	try {
		({pm, reset, parse} = await import(stub))
	}
	catch (err) {
		throw `Bad Parser: ${stub}: ${getErrStr(err)}`
	}

	// --- Run the parser
	try {
		pm.reset()
		reset()
		return parse(text) as Awaited<T>
	}
	catch (err) {
		console.log(`PARSE ERROR in doParse(${stub})`)
		if (stub === 'dir-tree') {
			// --- Here we should display the string along with
			//     whatever matches have already been found
			console.log(sep('-', 'matches'))
			console.log(pm.matchesStr())
			console.log(sep('-'))
			console.log(sep('-', 'debug'))
			const n = Math.floor(text.length / 10) + 1
			console.log("|         ".repeat(n))
			console.log(pm.debugStr(text))
			console.log(sep('-'))
		}
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

// ---------------------------------------------------------------------------



