"use strict";
// indent.lib.civet

import {esc} from 'unicode'
import {
	undef, defined, notdefined, assert, croak, array,
	isEmpty, isString, isArray, isArrayOfStrings,
	hash, hashof, isHash, integer, isInteger,
	} from 'datatypes'
import {
	rtrim, countChars, getOptions, blockToArray, arrayToBlock,
	toArray, toBlock, widthOf, heightOf, blockify, keys,
	} from 'llutils'
import {OL} from 'to-nice'

export let oneIndent: (string | undefined) = undef

// ---------------------------------------------------------------------------

export const resetOneIndent = (
		str: (string | undefined) = undef
		): void => {

	oneIndent = str
	return
}

// ---------------------------------------------------------------------------

export const indentLevel = (line: string): number => {

	// --- This will always match, and it's greedy
	//     (but TypeScript doesn't know that)
	const [prefix] = line.match(/^\s*/) || ['']
	if (prefix.length === 0) {
		return 0
	}

	// --- Check if we're using TABs or spaces
	const numTABs = countChars(prefix, "\t")
	const numSpaces = countChars(prefix, " ")
	assert((numTABs === 0) || (numSpaces === 0),
			`Invalid mix of TABs and spaces in ${esc(line)}`)

	// --- oneIndent must be one of:
	//        undef
	//        a single TAB character
	//        some number of space characters
	// --- Set variables oneIndent & level
	switch(oneIndent) {
		case undef:
			if (numTABs > 0) {
				oneIndent = "\t"
				return numTABs
			}
			else {
				oneIndent = ' '.repeat(numSpaces)
				return 1
			}

		case "\t":
			assert((numSpaces === 0), "Expecting TABs, found spaces")
			return numTABs

		default:
			// --- using some number of spaces
			assert((numTABs === 0), "Expecting spaces, found TABs")
			assert((numSpaces % oneIndent.length === 0),
					`Invalid num spaces: ${numSpaces}, oneIndent = ${esc(oneIndent)}`)
			return numSpaces / oneIndent.length
	}
}

// ---------------------------------------------------------------------------

export type lineDesc = [level: number, text: string]

export const splitLine = (line: string): lineDesc => {

	const [_, prefix, str] = line.match(/^(\s*)(.*)$/) || ['', '', '']
	return [indentLevel(prefix), str.trim()]
}

// ---------------------------------------------------------------------------

export function indented(
		input: string,
		level?: number,
		hOptions?: hash
		): string
export function indented(
		input: string[],
		level?: number,
		hOptions?: hash
		): string[]
export function indented(
		input: string | string[],
		level: number = 1,
		hOptions: hash = {}
		): string | string[] {

	type opt = {
		oneIndent: (string | undefined)
		}

	// --- Because there's a global named oneIndent,
	//     we have to put the option in a new variable, i.e. 'ind'
	const {oneIndent: ind} = getOptions<opt>(hOptions, {
		oneIndent: undef
		})

	const useIndent: string = (
		  defined(ind)       ? ind
		: defined(oneIndent) ? oneIndent
		:                      '\t'
		)

	const results=[];for (const line of toArray(input)) {
		results.push((isEmpty(line) ? '' : useIndent.repeat(level) + line))
	};const lNewLines: string[] =results
	return (isArray(input) ? lNewLines : lNewLines.join('\n'))
}

// ---------------------------------------------------------------------------

export function undented(
		input: string,
		hOptions?: hash
		): string
export function undented(
		input: string[],
		hOptions?: hash
		): string[]
export function undented(
		input: string | string[],
		hOptions: hash = {}
		): string | string[] {

	// --- NOTE: leave empty lines empty
	let toRemove: (string | undefined) = undef
	let nToRemove: number = 0
	const lNewLines: string[] = []
	for (const line of toArray(input)) {
		assert(isString(line), `Bad input to undented: ${OL(input)}`)
		const trimmed = rtrim(line)
		if (trimmed === '') {
			lNewLines.push('')
		}
		else if (notdefined(toRemove)) {
			const [_, prefix, rest] = trimmed.match(/^(\s*)(.*)$/) || ['', '', '']
			if (prefix.length === 0) {
				lNewLines.push(trimmed)
			}
			else {
				toRemove = prefix
				nToRemove = prefix.length
				lNewLines.push(rest)
			}
		}
		else {
			assert((line.indexOf(toRemove) === 0),
					`can't remove ${esc(toRemove)} from ${esc(line)}`)
			lNewLines.push(trimmed.substr(nToRemove))
		}
	}
	return isString(input) ? arrayToBlock(lNewLines) : lNewLines
}

// ---------------------------------------------------------------------------

export type TBlockDesc = string[] | {
	[key: string]: TBlockDesc
}

export const Blockify = (
		desc: TBlockDesc,
		hOptions: hash = {}
		): string => {

	type opt = {
		sep: string
		endsep: string
		oneIndent: string
		width: number
		}
	const {sep, endsep, width, oneIndent} = getOptions<opt>(hOptions, {
		sep: ' ',
		endsep: '',
		oneIndent: '   ',
		width: 64
		})

	if (isArray(desc)) {
		return (desc.length === 0) ? '' : blockify(desc, hOptions)
	}
	else {
		// --- width must be reduced since block will be indented
		const hOpts = {
			sep,
			endsep,
			oneIndent,
			width: width - 3
			}
		const lLines = []
		for (const label of keys(desc)) {
			const block = Blockify(desc[label], hOpts)
			if (heightOf(block) === 0) {
				lLines.push(`${label}: (none)`)
			}
			else if ((heightOf(block) === 1) && (label.length + widthOf(block) < width)) {
				lLines.push(`${label}: ${block}`)
			}
			else {
				lLines.push(`${label}:\n${indented(block, 1, {oneIndent})}`)
			}
		}
		return lLines.join('\n')
	}
}