"use strict";
// llutils.lib.civet

import {createRequire} from 'node-module'
import {sprintf} from '@std/fmt/printf'
import {relative} from '@std/path'
import {existsSync} from '@std/fs'
import {parse as parseYAML} from "@std/yaml"

import {
	undef, defined, notdefined, deepEqual, croak, assert,
	colorize, isColor, toRelPath, obviously, toBool, TIterator,
	} from 'base'
import {esc} from 'unicode'
import {
	isHash, isArray, isNonEmptyString, char,
	isArrayOfStrings, isEmpty, nonEmpty, isString, isInteger,
	integer, hash, hashof, array, arrayof, TVoidFunc, isNonPrimitive,
	functionDef, TStringMapper,
	} from 'datatypes'
import {MAP} from 'mapper'

const llutilsLoadTime: integer = Date.now()
const defWidth = 64     // ---used in sep, centered

export {deepEqual}

// ---------------------------------------------------------------------------

export const stdChecks = (helpStr: string = ''): void => {

	debugger
	const root = Deno.env.get('PROJECT_ROOT_DIR')
	assert(nonEmpty(root), "Please set env var PROJECT_ROOT_DIR")
	return
}

// ---------------------------------------------------------------------------

export const sinceLoad = (datetime: Date | integer = Date.now()): number => {

	if (datetime instanceof Date) {
		return datetime.valueOf() - llutilsLoadTime
	}
	else {
		return datetime - llutilsLoadTime
	}
}

// ---------------------------------------------------------------------------

export const sinceLoadStr = (datetime: ((Date | integer) | undefined) = undef) => {

	return sprintf("%6d", sinceLoad(datetime))
}

// ---------------------------------------------------------------------------

export const throwsError = (
		func: TVoidFunc,
		msg: string = "Unexpected success"
		): void => {

	try {
		func()
		throw new Error(msg)
	}
	catch (err) {
		return
	}
}
// ignore error - it was expected

// ---------------------------------------------------------------------------

export const truncStr = (str: string, len: number) => {

	if (str.length <= len) {
		return str
	}
	return str.substring(0, len - 3) + '...'
}

// ---------------------------------------------------------------------------

export const strToHash = (str: string): hash => {

	if (isEmpty(str)) {
		return {}
	}
	const h: hash = {}
	for (const word of str.trim().split(/\s+/)) {
		let ref: string[] | null
		if (ref = word.match(/^(\!)?([A-Za-z][A-Za-z_0-9]*)(?:(=)(.*))?$/)) {
			const lMatches: string[] | null = ref
			const [_, neg, ident, eqSign, str] = lMatches
			if (isNonEmptyString(eqSign)) {
				assert(notdefined(neg) || (neg === ''),
						"negation with string value")
				// --- check if str is a valid number
				if (str.match(/^-?\d+(\.\d+)?$/)) {
					const num = parseFloat(str)
					if (Number.isNaN(num)) {
						// --- TO DO: interpret backslash escapes
						h[ident] = str
					}
					else {
						h[ident] = num
					}
				}
				else {
					h[ident] = str
				}
			}
			else if (neg) {
				h[ident] = false
			}
			else {
				h[ident] = true
			}
		}
		else {
			croak(`Invalid word ${word}`)
		}
	}
	return h
}

// ---------------------------------------------------------------------------

export const o = (lStrings: TemplateStringsArray): hash => {

	return strToHash(lStrings[0])
}

// ---------------------------------------------------------------------------

export const s = (lStrings: TemplateStringsArray): string => {

	const replacer = (match: string): string => {
		return spaces(3).repeat(match.length)
	}
	return lStrings[0].replaceAll(/^\t+/mg, replacer)
}

// ---------------------------------------------------------------------------

export const s2 = (lStrings: TemplateStringsArray): string => {

	const replacer = (match: string): string => {
		return spaces(2).repeat(match.length)
	}
	return lStrings[0].replaceAll(/^\t+/mg, replacer)
}

// ---------------------------------------------------------------------------

export const t = (lStrings: TemplateStringsArray): string => {

	const replacer = (match: string): string => {
		const level = Math.floor(match.length / 3)
		return '\t'.repeat(level)
	}
	return lStrings[0].replaceAll(/^\x20+/mg, replacer)
}

// ---------------------------------------------------------------------------

export var keys = Object.keys
export var entries = Object.entries

// ---------------------------------------------------------------------------

export const hasKey = (obj: unknown, ...lKeys: string[]) => {

	if ((typeof obj !== 'object') || (obj === null)) {
		return false
	}
	for (const key of lKeys) {
		if (!(key in obj)) {
			return false
		}
	}
	return true
}

export const hasKeys = hasKey

// ---------------------------------------------------------------------------

export const sleepSync = (sec: number): void => {

	const start = Date.now()
	const end = Date.now() + 1000 * sec
	while (Date.now() < end);
	return
}

// ---------------------------------------------------------------------------

export const spaces = (n: number): string => {

	return (n <= 0) ? '' : ' '.repeat(n)
}

// ---------------------------------------------------------------------------

export const tabs = (n: number): string => {

	return (n <= 0) ? '' : '\t'.repeat(n)
}

// ---------------------------------------------------------------------------

export const rtrim = (line: string): string => {

	assert(isString(line), `not a string: ${typeof line}`)
	const lMatches = line.match(/^(.*?)\s+$/s)
	return (lMatches === null) ? line : lMatches[1]
}

// ---------------------------------------------------------------------------

export const countChars = (str: string, ch: string): number => {

	let count = 0
	let pos = -1
	while ((pos = str.indexOf(ch, pos + 1)) !== -1) {
		count += 1
	}
	return count
}

// ---------------------------------------------------------------------------

export const blockToArray = (block: string): string[] => {

	if (isEmpty(block)) {
		return []
	}
	else {
		return block.split(/\r?\n/)
	}
}

// ---------------------------------------------------------------------------

export type TBlockSpec = string | string[]

export const isBlockSpec = (x: unknown): x is TBlockSpec => {
	return isString(x) || isArrayOfStrings(x)
}

// ---------------------------------------------------------------------------

export const toArray = (strOrArray: TBlockSpec): string[] => {

	if (Array.isArray(strOrArray)) {
		return strOrArray
	}
	else {
		return blockToArray(strOrArray)
	}
}

// ---------------------------------------------------------------------------

export const arrayToBlock = (lLines: string[]): string => {

	assert(isArray(lLines), `lLines is not an array: ${lLines}`)
	return lLines.filter((line) => defined(line)).join("\n")
}

// ---------------------------------------------------------------------------

export const toBlock = (strOrArray: TBlockSpec): string => {

	if (isString(strOrArray)) {
		return strOrArray
	}
	else {
		return arrayToBlock(strOrArray)
	}
}

// ---------------------------------------------------------------------------

const wsSplit = (str: string): string[] => {

	const newstr = str.trim()
	return (newstr === '') ? [] : newstr.split(/\s+/)
}

// ---------------------------------------------------------------------------

export const words = (...lStrings: string[]): string[] => {

	const lWords = []
	for (const str of lStrings) {
		for (const word of wsSplit(str)) {
			lWords.push(word)
		}
	}
	return lWords
}

// ---------------------------------------------------------------------------

const getNExtra = (str: string, len: number): number => {

	const extra = len - str.length
	return (extra > 0? extra : 0)
}

// ---------------------------------------------------------------------------

export const rpad = (str: string, len: number, ch: string = ' '): string => {

	assert((ch.length === 1), "Not a char")
	const extra = getNExtra(str, len)
	return str + ch.repeat(extra)
}

// ---------------------------------------------------------------------------

export const lpad = (str: string, len: number, ch: string = ' '): string => {

	assert((ch.length === 1), "Not a char")
	const extra = getNExtra(str, len)
	return ch.repeat(extra) + str
}

// ---------------------------------------------------------------------------

export type TAlignment = 'l' | 'c' | 'r' | 'left' | 'center' | 'right'

export const isAlignment = (x: unknown): x is TAlignment => {
	return ((typeof x === 'string') && ['l', 'c', 'r', 'left', 'center', 'right'].includes(x))
}

export const alignString = function(
		str: string,
		width: number,
		align: TAlignment
		): string {

	switch(align) {
		case 'left':
		case 'l':
			return rpad(str, width)
		case 'center':
		case 'c':
			return sep(' ', str, width)
		case 'right':
		case 'r':
			return lpad(str, width)
	}
}

// ---------------------------------------------------------------------------

export const zpad = (n: number, len: number): string => {

	return lpad(n.toString(), len, '0')
}

// ---------------------------------------------------------------------------
// GENERATOR

export const allMatches = function*(
		str: string,
		re: RegExp
		): TIterator<string[]> {

	// --- Ensure the regex has the global flag (g) set
	const newre = new RegExp(re, re.flags + (re.flags.includes('g') ? '' : 'g'))
	let lMatches: string[] | null = null
	while (defined(lMatches = newre.exec(str))) {
		yield lMatches
	}
	return
}

// ---------------------------------------------------------------------------

export const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------

export const getLineAndColumn = (text: string, pos: number) => {

	// --- Get line number by counting number of \n chars
	//        before the current position
	//     Get column number by finding closest previous position
	//        of a \n and computing the difference
	const shortStr = text.substring(0, pos)
	return [
		countChars(shortStr, "\n") + 1,
		pos - shortStr.lastIndexOf('\n')
	]
}

// ---------------------------------------------------------------------------

// later? allow passing in string[] ???
export const widthOf = (block: string): number => {

	let width = 0
	for (const line of allLinesInBlock(block)) {
		if (line.length > width) {
			width = line.length
		}
	}
	return width
}

// ---------------------------------------------------------------------------

export const heightOf = (block: string): number => {

	return (block === ''? 0 : block.split('\n').length)
}

// ---------------------------------------------------------------------------

export const getOptions = <T extends hash,>(
		hOptions: hash = {},
		hDefaults: T
		): T => {

	return { ...hDefaults, ...hOptions }
}

// ---------------------------------------------------------------------------

export const sep = (
		char: string = '-',
		label: (string | undefined) = undef,
		width: number = defWidth
		): string => {

	assert((char.length === 1), `Not a char: ${char}`)
	if (defined(label)) {
		return centered(label, {char, width})
	}
	else {
		return char.repeat(width)
	}
}

// ---------------------------------------------------------------------------

export const tabify = (
		str: string,
		nSpaces: number = 3
		): string => {

	return str.replaceAll(/^(\x20+)/, (match, spaces) => {
		return '\t'.repeat(Math.floor(spaces.length / nSpaces))
	})
}

// ---------------------------------------------------------------------------

export const untabify = (
		str: string,
		replacement: string = '   '
		): string => {

	return str.replaceAll('\t', replacement)
}

// ---------------------------------------------------------------------------

export const cleanup = (str: string): string => {

	return rtrim(str).replaceAll('\r', '')
}

// ---------------------------------------------------------------------------

export const allLinesInBlock = function*(
		block: string
		): TIterator<string> {

	let start = 0
	let end = block.indexOf('\n')
	while (end !== -1) {
		yield cleanup(block.substring(start, end))
		start = end + 1
		end = block.indexOf('\n', start)
	}
	if (start < block.length) {
		yield cleanup(block.substring(start))
	}
	return
}

// ---------------------------------------------------------------------------
// --- valid options:
//        char - char to use on left and right
//        width - full width
//        numBuffer - num spaces around label when char <> ' '
//        color - color of entire string

export const centered = (
		label: string,
		hOptions: hash = {}
		): string => {

	type opt = {
		char: char
		width: number
		numBuffer: number
		color: (string | undefined)
		}
	const {char, width, numBuffer, color} = getOptions<opt>(hOptions, {
		char: ' ',
		width: defWidth,
		numBuffer: 2,
		color: undef
		})

	const totSpaces = (width >= label.length) ? width - label.length : 0
	const numLeft = Math.floor(totSpaces / 2)
	const numRight = totSpaces - numLeft
	const text = (
		(()=>{if (char === ' ') {
			return ' '.repeat(numLeft) + colorize(label, color) + ' '.repeat(numRight)
		}
		else {
			const buf = ' '.repeat(numBuffer)
			const left = char.repeat(numLeft - numBuffer)
			const right = char.repeat(numRight - numBuffer)
			return left + buf + colorize(label, color) + buf + right
		}})()
		)
	return text
}

// ---------------------------------------------------------------------------

export const cmdTitle = (title: string): string => {

	return centered(title, {char: '=', color: 'cyan'})
}

// ---------------------------------------------------------------------------

export class CStringSetMap<T = string> extends Map<T, Set<string>> {

	add(key: T, value: string): void {

		const aSet = super.get(key)
		if (defined(aSet)) {
			aSet.add(value)
		}
		else {
			const newSet = new Set<string>()
			newSet.add(value)
			super.set(key, newSet)
		}
		return
	}

	// ..........................................................

	hasKey(key: T): boolean {

		return this.has(key)
	}

	// ..........................................................

	hasValue(val: string): boolean {

		for (const key of this.allKeys()) {
			const set = this.get(key)
			if (defined(set) && set.has(val)) {
				return true
			}
		}
		return false
	}

	// ..........................................................

	*allKeys(): TIterator<T> {

		yield *super.keys()
		return
	}

	// ..........................................................

	*allValues(key: T): TIterator<string> {

		const aSet = super.get(key)
		if (defined(aSet)) {
			yield *aSet.values()
		}
		return
	}

	// ..........................................................

	asString(): string {

		const results1 = []
		for (const key of this.allKeys()) {
			results1.push(`${key}: ${Array.from(this.allValues(key)).join(' ')}`)
		}
		const lLines = results1
		return lLines.join('\n')
	}
}

// ---------------------------------------------------------------------------

export const isTAML = (x: unknown): boolean => {

	if (isString(x)) {
		try {
			parseYAML(untabify(x))
			return true
		}
		catch (err) {
			return false
		}
	}
	else {
		return false
	}
}

// ---------------------------------------------------------------------------

export const fromTAML = (block: string): unknown => {

	return parseYAML(untabify(block))
}

// ---------------------------------------------------------------------------
//    f"name = #{'John'}:-10"    => "name = John      "
//    f"name = #{'John'}:10"     => "name =       John"
//    f"name = #{'a\tb'}!"       => "name = a→b"
//    f"name = #{'John'}:{blue}" => "name = John" ('John' in blue color)
// ---------------------------------------------------------------------------
// --- Number of strings is always 1 greater than the number of values

export const f = (
		lStrings: TemplateStringsArray,
		...lValues: unknown[]
		): string => {

	// --- Split the first string
	const [mainFmt, firstStr] = fsplit(lStrings[0])

	// --- format each of the values, concatenating as we go
	const bigStr = MAP(lValues, firstStr, (val, acc, i) => {
		const [fmt, nextStr] = fsplit(lStrings[i+1])
		return acc + formatVal(val, fmt) + nextStr
	})
	return formatVal(bigStr, mainFmt)
}

// ---------------------------------------------------------------------------

type TFormat = {
	toRel: boolean
	escape: boolean
	width: number
	color: string
	}

export const formatVal = (
		val: unknown,
		fmt: (TFormat | undefined)
		): string => {

	const str1 = (
		  (val === undefined) ? 'undef'
		: (val === null)      ? 'null'
		: String(val)
		)
	if (notdefined(fmt)) {
		return str1
	}
	const {toRel, escape, width, color} = fmt
	const str2 = toRel ? toRelPath(str1) : str1
	const str3 = escape ? esc(str2) : str2
	const str4 = (
		  (width > 0) ? alignString(str3, width, 'right')
		: (width < 0) ? alignString(str3, -width, 'left')
		:                   str3
		)
	return isColor(color) ? colorize(str4, color) : str4
}

// ---------------------------------------------------------------------------

export const fsplit = (
	str: string
	): [((TFormat | undefined)), string] => {

	if (!str.startsWith(':')) {
		return [undef, str]
	}
	const lMatches = str.match(/^:(~)?([-+]?\d+)?(\!)?(?:{([a-z]+)})?(.*)$/s)

	if (notdefined(lMatches)) {
		console.log("BAD BAD BAD")
		console.log(esc(str))
		console.log("BAD BAD BAD")
	}

	obviously(defined(lMatches))
	const [_, toRel, width, doEsc, color, rest] = lMatches
	if (!toRel && !width && !doEsc && !color) {
		return [undef, str]
	}
	return [
		{
			toRel:  toBool(toRel),
			width:  width ? parseInt(width) : 0,
			escape: toBool(doEsc),
			color:  defined(color) && isColor(color) ? color : ''
			},
		rest
		]
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGx1dGlscy5saWIudHMiLCJzb3VyY2VzIjpbImxsdXRpbHMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQW1CO0FBQ25CLEFBQUE7QUFDQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3pDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3ZDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzFDLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUN0RCxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM1RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3pDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMs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QUFRLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQztBQUFBLENBQUE7QUFDN0IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFFLE1BQUQsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdkQsQUFBQTtBQUNBLEFBQUEsQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN2QyxBQUFBLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUEsQUFBQyxLQUFLLENBQUMsTUFBTSxDO0NBQUEsQ0FBQTtBQUN0QyxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLEM7QUFBQSxDQUFBO0FBQ2pELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBRyxNQUFGLEVBQUUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3hELEFBQUE7QUFDQSxBQUFBLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdkMsQUFBQSxFQUFFLE1BQU0s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QU0sQ0FBQyxJQUFJLENBQUEsQUFBQyxJQUFJLEM7RUFBQSxDO0NBQUEsQ0FBQTtBQUNuQixBQUFBLENBQUMsTUFBTSxDQUFDLE07QUFBTSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQVMsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDbEQsQUFBQTtBQUNBLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTTtBQUMxQixBQUFBLENBQUMsTUFBTSxDQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDLENBQU8sQ0FBQyxLQUFLLEMsQ0FBSyxDQUFDLENBQWxCLEM7QUFBbUIsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0RSxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUE7QUFDdEMsQUFBQSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUEsQUFBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUE7QUFDNUIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDO0FBQUMsQ0FBQTtBQUM5QixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0RSxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUE7QUFDdEMsQUFBQSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUEsQUFBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUE7QUFDNUIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHO0FBQUcsQ0FBQTtBQUM5QixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU87QUFDdEUsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVksTUFBWCxXQUFXLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0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QSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsS0FBSyxDO0NBQUEsQztBQUFBLENBQUE7QUFDMUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ2xCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZCxBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQSxBQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDckQsQUFBQSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQSxBQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQSxDO0NBQUEsQ0FBQSxDO0FBQUEsQ0FBQTtBQUN2RCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDcEIsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNkLEFBQUEsRUFBRSxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUs7QUFDN0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENB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SixJQUFJLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUEsQUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUMxQyxBQUFBLEdBQVEsTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUM1QyxBQUFBLEcsT0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEs7RUFBSyxDLEMsQyxFQUFBO0FBQ3BELEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBQyxNQUFNLENBQUMsSTtBQUFJLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDN0MsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFBLEFBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQztBQUFBLENBQUE7QUFDbEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDLENBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDbEUsQUFBQTtBQUNBLEFBQUEsQyxHQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNqQyxBQUFBO0FBQ0EsQUFBQSxFQUFNLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUEsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQSxBQUFDLEtBQUssQztFQUFBLENBQUE7QUFDakIsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHQUFTLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDOUIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUEsQUFBQyxLQUFLLENBQUE7QUFDbkIsQUFBQSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUEsQUFBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEM7RUFBQSxDQUFBO0FBQ3hCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsTUFBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFBLENBQUE7QUFDeEIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsSSxDQUFDLEdBQUcsQ0FBQSxBQUFDLEdBQUcsQztDQUFBLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUEsQ0FBQTtBQUMvQixBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkIsQUFBQSxHQUFNLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxJLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxHQUFHLENBQUEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQyxBQUFBLElBQUksTUFBTSxDQUFDLEk7R0FBSSxDO0VBQUEsQ0FBQTtBQUNmLEFBQUEsRUFBRSxNQUFNLENBQUMsSztDQUFLLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDQUFDLEMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3pCLEFBQUE7QUFDQSxBQUFBLEVBQUUsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLENBQUMsQyxTQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUN0QyxBQUFBO0FBQ0EsQUFBQSxFQUFNLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUEsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDO0VBQUMsQ0FBQTtBQUN2QixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFB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QUFRLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDeEIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUEsQUFBQyxhQUFhLENBQUE7QUFDM0IsQUFBQSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUEsQUFBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDdEIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUEsQUFBQyxhQUFhLEM7Q0FBQSxDQUFBO0FBQzNCLEFBQUE7QUFDQSxBQUFBLENBQUMsU0FBUyxDQUFBLEFBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFBO0FBQzVCLEFBQUEsQ0FBc0MsTUFBckMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLENBQUMsUUFBUTtBQUNsRCxBQUFBLENBQUMsR0FBRyxDQUFBLENBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBSSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUksS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNwRCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDO0NBQUMsQ0FBQTtBQUNyQixBQUFBLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDVCxBQUFBLEVBQUUsQ0FBQztBQUNILEFBQUEsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDeEIsQUFBQSxHQUFHLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDdEMsQUFBQSxHQUFHLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQTtBQUN4QixBQUFBLEdBQUcsS0FBSyxDQUFDLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUN4RCxHQUFHLENBQUMsQ0FBQztBQUNMLEFBQUEsRUFBRSxJQUFJO0FBQ04sQUFBQSxFQUFFLEM7QUFBQyxDQUFBO0FBQ0giLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgbGx1dGlscy5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7Y3JlYXRlUmVxdWlyZX0gZnJvbSAnbm9kZS1tb2R1bGUnXHJcbmltcG9ydCB7c3ByaW50Zn0gZnJvbSAnQHN0ZC9mbXQvcHJpbnRmJ1xyXG5pbXBvcnQge3JlbGF0aXZlfSBmcm9tICdAc3RkL3BhdGgnXHJcbmltcG9ydCB7ZXhpc3RzU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtwYXJzZTogcGFyc2VZQU1MfSBmcm9tIFwiQHN0ZC95YW1sXCJcclxuXHJcbmltcG9ydCB7XHJcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGRlZXBFcXVhbCwgY3JvYWssIGFzc2VydCxcclxuXHRjb2xvcml6ZSwgaXNDb2xvciwgdG9SZWxQYXRoLCBvYnZpb3VzbHksIHRvQm9vbCwgVEl0ZXJhdG9yLFxyXG5cdH0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtlc2N9IGZyb20gJ3VuaWNvZGUnXHJcbmltcG9ydCB7XHJcblx0aXNIYXNoLCBpc0FycmF5LCBpc05vbkVtcHR5U3RyaW5nLCBjaGFyLFxyXG5cdGlzQXJyYXlPZlN0cmluZ3MsIGlzRW1wdHksIG5vbkVtcHR5LCBpc1N0cmluZywgaXNJbnRlZ2VyLFxyXG5cdGludGVnZXIsIGhhc2gsIGhhc2hvZiwgYXJyYXksIGFycmF5b2YsIFRWb2lkRnVuYywgaXNOb25QcmltaXRpdmUsXHJcblx0ZnVuY3Rpb25EZWYsIFRTdHJpbmdNYXBwZXIsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcblxyXG5sbHV0aWxzTG9hZFRpbWU6IGludGVnZXIgOj0gRGF0ZS5ub3coKVxyXG5kZWZXaWR0aCA6PSA2NCAgICAgIyAtLS11c2VkIGluIHNlcCwgY2VudGVyZWRcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzdGRDaGVja3MgOj0gKGhlbHBTdHI6IHN0cmluZyA9ICcnKTogdm9pZCA9PlxyXG5cclxuXHRkZWJ1Z2dlclxyXG5cdHJvb3QgOj0gRGVuby5lbnYuZ2V0KCdQUk9KRUNUX1JPT1RfRElSJylcclxuXHRhc3NlcnQgbm9uRW1wdHkocm9vdCksIFwiUGxlYXNlIHNldCBlbnYgdmFyIFBST0pFQ1RfUk9PVF9ESVJcIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzaW5jZUxvYWQgOj0gKGRhdGV0aW1lOiBEYXRlIHwgaW50ZWdlciA9IERhdGUubm93KCkpOiBudW1iZXIgPT5cclxuXHJcblx0aWYgKGRhdGV0aW1lIGluc3RhbmNlb2YgRGF0ZSlcclxuXHRcdHJldHVybiBkYXRldGltZS52YWx1ZU9mKCkgLSBsbHV0aWxzTG9hZFRpbWVcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZGF0ZXRpbWUgLSBsbHV0aWxzTG9hZFRpbWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2luY2VMb2FkU3RyIDo9IChkYXRldGltZTogKERhdGUgfCBpbnRlZ2VyKT8gPSB1bmRlZikgPT5cclxuXHJcblx0cmV0dXJuIHNwcmludGYgXCIlNmRcIiwgc2luY2VMb2FkKGRhdGV0aW1lKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0aHJvd3NFcnJvciA6PSAoXHJcblx0XHRmdW5jOiBUVm9pZEZ1bmMsXHJcblx0XHRtc2c6IHN0cmluZyA9IFwiVW5leHBlY3RlZCBzdWNjZXNzXCJcclxuXHRcdCk6IHZvaWQgPT5cclxuXHJcblx0dHJ5XHJcblx0XHRmdW5jKClcclxuXHRcdHRocm93IG5ldyBFcnJvcihtc2cpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRyZXR1cm5cclxuIyBpZ25vcmUgZXJyb3IgLSBpdCB3YXMgZXhwZWN0ZWRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHJ1bmNTdHIgOj0gKHN0cjogc3RyaW5nLCBsZW46IG51bWJlcikgPT5cclxuXHJcblx0aWYgc3RyLmxlbmd0aCA8PSBsZW5cclxuXHRcdHJldHVybiBzdHJcclxuXHRyZXR1cm4gc3RyLnN1YnN0cmluZygwLCBsZW4gLSAzKSArICcuLi4nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHN0clRvSGFzaCA6PSAoc3RyOiBzdHJpbmcpOiBoYXNoID0+XHJcblxyXG5cdGlmIGlzRW1wdHkoc3RyKVxyXG5cdFx0cmV0dXJuIHt9XHJcblx0aDogaGFzaCA6PSB7fVxyXG5cdGZvciB3b3JkIG9mIHN0ci50cmltKCkuc3BsaXQoL1xccysvKVxyXG5cdFx0bGV0IHJlZjogc3RyaW5nW10gfCBudWxsXHJcblx0XHRpZiAocmVmID0gd29yZC5tYXRjaCgvXihcXCEpPyhbQS1aYS16XVtBLVphLXpfMC05XSopKD86KD0pKC4qKSk/JC8pKVxyXG5cdFx0XHRsTWF0Y2hlczogc3RyaW5nW10gfCBudWxsIDo9IHJlZlxyXG5cdFx0XHRbXywgbmVnLCBpZGVudCwgZXFTaWduLCBzdHJdIDo9IGxNYXRjaGVzXHJcblx0XHRcdGlmIGlzTm9uRW1wdHlTdHJpbmcoZXFTaWduKVxyXG5cdFx0XHRcdGFzc2VydCBub3RkZWZpbmVkKG5lZykgfHwgKG5lZyA9PSAnJyksXHJcblx0XHRcdFx0XHRcdFwibmVnYXRpb24gd2l0aCBzdHJpbmcgdmFsdWVcIlxyXG5cdFx0XHRcdCMgLS0tIGNoZWNrIGlmIHN0ciBpcyBhIHZhbGlkIG51bWJlclxyXG5cdFx0XHRcdGlmIHN0ci5tYXRjaCgvXi0/XFxkKyhcXC5cXGQrKT8kLylcclxuXHRcdFx0XHRcdG51bSA6PSBwYXJzZUZsb2F0IHN0clxyXG5cdFx0XHRcdFx0aWYgTnVtYmVyLmlzTmFOKG51bSlcclxuXHRcdFx0XHRcdFx0IyAtLS0gVE8gRE86IGludGVycHJldCBiYWNrc2xhc2ggZXNjYXBlc1xyXG5cdFx0XHRcdFx0XHRoW2lkZW50XSA9IHN0clxyXG5cdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHRoW2lkZW50XSA9IG51bVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdGhbaWRlbnRdID0gc3RyXHJcblx0XHRcdGVsc2UgaWYgbmVnXHJcblx0XHRcdFx0aFtpZGVudF0gPSBmYWxzZVxyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0aFtpZGVudF0gPSB0cnVlXHJcblx0XHRlbHNlXHJcblx0XHRcdGNyb2FrIFwiSW52YWxpZCB3b3JkICN7d29yZH1cIlxyXG5cdHJldHVybiBoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG8gOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IGhhc2ggPT5cclxuXHJcblx0cmV0dXJuIHN0clRvSGFzaCBsU3RyaW5nc1swXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzIDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBzdHJpbmcgPT5cclxuXHJcblx0cmVwbGFjZXIgOj0gKG1hdGNoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBzcGFjZXMoMykucmVwZWF0IG1hdGNoLmxlbmd0aFxyXG5cdHJldHVybiBsU3RyaW5nc1swXS5yZXBsYWNlQWxsIC9eXFx0Ky9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgczIgOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXBsYWNlciA6PSAobWF0Y2g6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cdFx0cmV0dXJuIHNwYWNlcygyKS5yZXBlYXQgbWF0Y2gubGVuZ3RoXHJcblx0cmV0dXJuIGxTdHJpbmdzWzBdLnJlcGxhY2VBbGwgL15cXHQrL21nLCByZXBsYWNlclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0IDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBzdHJpbmcgPT5cclxuXHJcblx0cmVwbGFjZXIgOj0gKG1hdGNoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdGxldmVsIDo9IE1hdGguZmxvb3IgbWF0Y2gubGVuZ3RoIC8gM1xyXG5cdFx0cmV0dXJuICdcXHQnLnJlcGVhdCBsZXZlbFxyXG5cdHJldHVybiBsU3RyaW5nc1swXS5yZXBsYWNlQWxsIC9eXFx4MjArL21nLCByZXBsYWNlclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBrZXlzID0gT2JqZWN0LmtleXNcclxuZXhwb3J0IGVudHJpZXMgPSBPYmplY3QuZW50cmllc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBoYXNLZXkgOj0gKG9iajogdW5rbm93biwgLi4ubEtleXM6IHN0cmluZ1tdKSA9PlxyXG5cclxuXHRpZiAodHlwZW9mIG9iaiAhPSAnb2JqZWN0JykgfHwgKG9iaiA9PSBudWxsKVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0Zm9yIGtleSBvZiBsS2V5c1xyXG5cdFx0aWYgbm90IChrZXkgaW4gb2JqKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gdHJ1ZVxyXG5cclxuZXhwb3J0IGhhc0tleXMgOj0gaGFzS2V5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNsZWVwU3luYyA6PSAoc2VjOiBudW1iZXIpOiB2b2lkID0+XHJcblxyXG5cdHN0YXJ0IDo9IERhdGUubm93KClcclxuXHRlbmQgOj0gRGF0ZS5ub3coKSArIDEwMDAgKiBzZWNcclxuXHR3aGlsZSAoRGF0ZS5ub3coKSA8IGVuZClcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3BhY2VzIDo9IChuOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChuIDw9IDApID8gJycgOiAnICcucmVwZWF0KG4pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRhYnMgOj0gKG46IG51bWJlcik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKG4gPD0gMCkgPyAnJyA6ICdcXHQnLnJlcGVhdChuKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBydHJpbSA6PSAobGluZTogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc1N0cmluZyhsaW5lKSwgXCJub3QgYSBzdHJpbmc6ICN7dHlwZW9mIGxpbmV9XCJcclxuXHRsTWF0Y2hlcyA6PSBsaW5lLm1hdGNoIC9eKC4qPylcXHMrJC9zXHJcblx0cmV0dXJuIChsTWF0Y2hlcyA9PSBudWxsKSA/IGxpbmUgOiBsTWF0Y2hlc1sxXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjb3VudENoYXJzIDo9IChzdHI6IHN0cmluZywgY2g6IHN0cmluZyk6IG51bWJlciA9PlxyXG5cclxuXHRsZXQgY291bnQgPSAwXHJcblx0bGV0IHBvcyA9IC0xXHJcblx0d2hpbGUgKHBvcyA9IHN0ci5pbmRleE9mKGNoLCBwb3MgKyAxKSkgIT0gLTFcclxuXHRcdGNvdW50ICs9IDFcclxuXHRyZXR1cm4gY291bnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmxvY2tUb0FycmF5IDo9IChibG9jazogc3RyaW5nKTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgaXNFbXB0eShibG9jaylcclxuXHRcdHJldHVybiBbXVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBibG9jay5zcGxpdCAvXFxyP1xcbi9cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQmxvY2tTcGVjID0gc3RyaW5nIHwgc3RyaW5nW11cclxuXHJcbmV4cG9ydCBpc0Jsb2NrU3BlYyA6PSAoeDogdW5rbm93bik6IHggaXMgVEJsb2NrU3BlYyA9PlxyXG5cdHJldHVybiBpc1N0cmluZyh4KSB8fCBpc0FycmF5T2ZTdHJpbmdzKHgpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvQXJyYXkgOj0gKHN0ck9yQXJyYXk6IFRCbG9ja1NwZWMpOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRpZiBBcnJheS5pc0FycmF5KHN0ck9yQXJyYXkpXHJcblx0XHRyZXR1cm4gc3RyT3JBcnJheVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBibG9ja1RvQXJyYXkgc3RyT3JBcnJheVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhcnJheVRvQmxvY2sgOj0gKGxMaW5lczogc3RyaW5nW10pOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IGlzQXJyYXkobExpbmVzKSwgXCJsTGluZXMgaXMgbm90IGFuIGFycmF5OiAje2xMaW5lc31cIlxyXG5cdHJldHVybiBsTGluZXMuZmlsdGVyKChsaW5lKSA9PiBkZWZpbmVkIGxpbmUpLmpvaW4gXCJcXG5cIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0Jsb2NrIDo9IChzdHJPckFycmF5OiBUQmxvY2tTcGVjKTogc3RyaW5nID0+XHJcblxyXG5cdGlmIGlzU3RyaW5nKHN0ck9yQXJyYXkpXHJcblx0XHRyZXR1cm4gc3RyT3JBcnJheVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBhcnJheVRvQmxvY2sgc3RyT3JBcnJheVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbndzU3BsaXQgOj0gKHN0cjogc3RyaW5nKTogc3RyaW5nW10gPT5cclxuXHJcblx0bmV3c3RyIDo9IHN0ci50cmltKClcclxuXHRyZXR1cm4gKG5ld3N0ciA9PSAnJykgPyBbXSA6IG5ld3N0ci5zcGxpdCgvXFxzKy8pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHdvcmRzIDo9ICguLi5sU3RyaW5nczogc3RyaW5nW10pOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRsV29yZHMgOj0gW11cclxuXHRmb3Igc3RyIG9mIGxTdHJpbmdzXHJcblx0XHRmb3Igd29yZCBvZiB3c1NwbGl0KHN0cilcclxuXHRcdFx0bFdvcmRzLnB1c2ggd29yZFxyXG5cdHJldHVybiBsV29yZHNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5nZXRORXh0cmEgOj0gKHN0cjogc3RyaW5nLCBsZW46IG51bWJlcik6IG51bWJlciA9PlxyXG5cclxuXHRleHRyYSA6PSBsZW4gLSBzdHIubGVuZ3RoXHJcblx0cmV0dXJuIGlmIChleHRyYSA+IDApIHRoZW4gZXh0cmEgZWxzZSAwXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJwYWQgOj0gKHN0cjogc3RyaW5nLCBsZW46IG51bWJlciwgY2g6IHN0cmluZyA9ICcgJyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgKGNoLmxlbmd0aCA9PSAxKSwgXCJOb3QgYSBjaGFyXCJcclxuXHRleHRyYSA6PSBnZXRORXh0cmEgc3RyLCBsZW5cclxuXHRyZXR1cm4gc3RyICsgY2gucmVwZWF0KGV4dHJhKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBscGFkIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIsIGNoOiBzdHJpbmcgPSAnICcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChjaC5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhclwiXHJcblx0ZXh0cmEgOj0gZ2V0TkV4dHJhIHN0ciwgbGVuXHJcblx0cmV0dXJuIGNoLnJlcGVhdChleHRyYSkgKyBzdHJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHlwZSBUQWxpZ25tZW50ID0gJ2wnIHwgJ2MnIHwgJ3InIHwgJ2xlZnQnIHwgJ2NlbnRlcicgfCAncmlnaHQnXHJcblxyXG5leHBvcnQgaXNBbGlnbm1lbnQgOj0gKHg6IHVua25vd24pOiB4IGlzIFRBbGlnbm1lbnQgPT5cclxuXHRyZXR1cm4gKCh0eXBlb2YgeCA9PSAnc3RyaW5nJykgJiYgWydsJywgJ2MnLCAncicsICdsZWZ0JywgJ2NlbnRlcicsICdyaWdodCddLmluY2x1ZGVzKHgpKVxyXG5cclxuZXhwb3J0IGFsaWduU3RyaW5nIDo9IGZ1bmN0aW9uKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHR3aWR0aDogbnVtYmVyLFxyXG5cdFx0YWxpZ246IFRBbGlnbm1lbnRcclxuXHRcdCk6IHN0cmluZ1xyXG5cclxuXHRzd2l0Y2ggYWxpZ25cclxuXHRcdGNhc2UgJ2xlZnQnOlxyXG5cdFx0Y2FzZSAnbCc6XHJcblx0XHRcdHJldHVybiBycGFkIHN0ciwgd2lkdGhcclxuXHRcdGNhc2UgJ2NlbnRlcic6XHJcblx0XHRjYXNlICdjJzpcclxuXHRcdFx0cmV0dXJuIHNlcCAnICcsIHN0ciwgd2lkdGhcclxuXHRcdGNhc2UgJ3JpZ2h0JzpcclxuXHRcdGNhc2UgJ3InOlxyXG5cdFx0XHRyZXR1cm4gbHBhZCBzdHIsIHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHpwYWQgOj0gKG46IG51bWJlciwgbGVuOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGxwYWQgbi50b1N0cmluZygpLCBsZW4sICcwJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBHRU5FUkFUT1JcclxuXHJcbmV4cG9ydCBhbGxNYXRjaGVzIDo9IChcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0cmU6IFJlZ0V4cFxyXG5cdFx0KTogVEl0ZXJhdG9yPHN0cmluZ1tdPiAtPlxyXG5cclxuXHQjIC0tLSBFbnN1cmUgdGhlIHJlZ2V4IGhhcyB0aGUgZ2xvYmFsIGZsYWcgKGcpIHNldFxyXG5cdG5ld3JlIDo9IG5ldyBSZWdFeHAocmUsIHJlLmZsYWdzICsgKHJlLmZsYWdzLmluY2x1ZGVzKCdnJykgPyAnJyA6ICdnJykpXHJcblx0bGV0IGxNYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwgPSBudWxsXHJcblx0d2hpbGUgZGVmaW5lZChsTWF0Y2hlcyA9IG5ld3JlLmV4ZWMoc3RyKSlcclxuXHRcdHlpZWxkIGxNYXRjaGVzXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJlcXVpcmUgOj0gY3JlYXRlUmVxdWlyZSBpbXBvcnQubWV0YS51cmxcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0TGluZUFuZENvbHVtbiA6PSAodGV4dDogc3RyaW5nLCBwb3M6IG51bWJlcikgPT5cclxuXHJcblx0IyAtLS0gR2V0IGxpbmUgbnVtYmVyIGJ5IGNvdW50aW5nIG51bWJlciBvZiBcXG4gY2hhcnNcclxuXHQjICAgICAgICBiZWZvcmUgdGhlIGN1cnJlbnQgcG9zaXRpb25cclxuXHQjICAgICBHZXQgY29sdW1uIG51bWJlciBieSBmaW5kaW5nIGNsb3Nlc3QgcHJldmlvdXMgcG9zaXRpb25cclxuXHQjICAgICAgICBvZiBhIFxcbiBhbmQgY29tcHV0aW5nIHRoZSBkaWZmZXJlbmNlXHJcblx0c2hvcnRTdHIgOj0gdGV4dC5zdWJzdHJpbmcgMCwgcG9zXHJcblx0cmV0dXJuIFtcclxuXHRcdGNvdW50Q2hhcnMoc2hvcnRTdHIsIFwiXFxuXCIpICsgMVxyXG5cdFx0cG9zIC0gc2hvcnRTdHIubGFzdEluZGV4T2YoJ1xcbicpXHJcblx0XVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiMgbGF0ZXI/IGFsbG93IHBhc3NpbmcgaW4gc3RyaW5nW10gPz8/XHJcbmV4cG9ydCB3aWR0aE9mIDo9IChibG9jazogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdGxldCB3aWR0aCA9IDBcclxuXHRmb3IgbGluZSBvZiBhbGxMaW5lc0luQmxvY2soYmxvY2spXHJcblx0XHRpZiBsaW5lLmxlbmd0aCA+IHdpZHRoXHJcblx0XHRcdHdpZHRoID0gbGluZS5sZW5ndGhcclxuXHRyZXR1cm4gd2lkdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaGVpZ2h0T2YgOj0gKGJsb2NrOiBzdHJpbmcpOiBudW1iZXIgPT5cclxuXHJcblx0cmV0dXJuIGlmIChibG9jayA9PSAnJykgdGhlbiAwIGVsc2UgYmxvY2suc3BsaXQoJ1xcbicpLmxlbmd0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRPcHRpb25zIDo9IDxUIGV4dGVuZHMgaGFzaD4oXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHRoRGVmYXVsdHM6IFRcclxuXHRcdCk6IFQgPT5cclxuXHJcblx0cmV0dXJuIHsgLi4uaERlZmF1bHRzLCAuLi5oT3B0aW9ucyB9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNlcCA6PSAoXHJcblx0XHRjaGFyOiBzdHJpbmcgPSAnLScsXHJcblx0XHRsYWJlbDogc3RyaW5nPyA9IHVuZGVmLFxyXG5cdFx0d2lkdGg6IG51bWJlciA9IGRlZldpZHRoXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChjaGFyLmxlbmd0aCA9PSAxKSwgXCJOb3QgYSBjaGFyOiAje2NoYXJ9XCJcclxuXHRpZiBkZWZpbmVkKGxhYmVsKVxyXG5cdFx0cmV0dXJuIGNlbnRlcmVkIGxhYmVsLCB7Y2hhciwgd2lkdGh9XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGNoYXIucmVwZWF0IHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRhYmlmeSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdG5TcGFjZXM6IG51bWJlciA9IDNcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyLnJlcGxhY2VBbGwgL14oXFx4MjArKS8sIChtYXRjaCwgc3BhY2VzKSA9PlxyXG5cdFx0cmV0dXJuICdcXHQnLnJlcGVhdCBNYXRoLmZsb29yIHNwYWNlcy5sZW5ndGggLyBuU3BhY2VzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHVudGFiaWZ5IDo9IChcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0cmVwbGFjZW1lbnQ6IHN0cmluZyA9ICcgICAnXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsICdcXHQnLCByZXBsYWNlbWVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhbnVwIDo9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gcnRyaW0oc3RyKS5yZXBsYWNlQWxsKCdcXHInLCAnJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkJsb2NrIDo9IChcclxuXHRcdGJsb2NrOiBzdHJpbmdcclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGxldCBzdGFydCA9IDBcclxuXHRsZXQgZW5kID0gYmxvY2suaW5kZXhPZignXFxuJylcclxuXHR3aGlsZSAoZW5kICE9IC0xKVxyXG5cdFx0eWllbGQgY2xlYW51cChibG9jay5zdWJzdHJpbmcoc3RhcnQsIGVuZCkpXHJcblx0XHRzdGFydCA9IGVuZCArIDFcclxuXHRcdGVuZCA9IGJsb2NrLmluZGV4T2YoJ1xcbicsIHN0YXJ0KVxyXG5cdGlmIChzdGFydCA8IGJsb2NrLmxlbmd0aClcclxuXHRcdHlpZWxkIGNsZWFudXAoYmxvY2suc3Vic3RyaW5nKHN0YXJ0KSlcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIHZhbGlkIG9wdGlvbnM6XHJcbiMgICAgICAgIGNoYXIgLSBjaGFyIHRvIHVzZSBvbiBsZWZ0IGFuZCByaWdodFxyXG4jICAgICAgICB3aWR0aCAtIGZ1bGwgd2lkdGhcclxuIyAgICAgICAgbnVtQnVmZmVyIC0gbnVtIHNwYWNlcyBhcm91bmQgbGFiZWwgd2hlbiBjaGFyIDw+ICcgJ1xyXG4jICAgICAgICBjb2xvciAtIGNvbG9yIG9mIGVudGlyZSBzdHJpbmdcclxuXHJcbmV4cG9ydCBjZW50ZXJlZCA6PSAoXHJcblx0XHRsYWJlbDogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRjaGFyOiBjaGFyXHJcblx0XHR3aWR0aDogbnVtYmVyXHJcblx0XHRudW1CdWZmZXI6IG51bWJlclxyXG5cdFx0Y29sb3I6IHN0cmluZz9cclxuXHRcdH1cclxuXHR7Y2hhciwgd2lkdGgsIG51bUJ1ZmZlciwgY29sb3J9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0Y2hhcjogJyAnXHJcblx0XHR3aWR0aDogZGVmV2lkdGhcclxuXHRcdG51bUJ1ZmZlcjogMlxyXG5cdFx0Y29sb3I6IHVuZGVmXHJcblx0XHR9XHJcblxyXG5cdHRvdFNwYWNlcyA6PSAod2lkdGggPj0gbGFiZWwubGVuZ3RoKSA/IHdpZHRoIC0gbGFiZWwubGVuZ3RoIDogMFxyXG5cdG51bUxlZnQgOj0gTWF0aC5mbG9vciB0b3RTcGFjZXMgLyAyXHJcblx0bnVtUmlnaHQgOj0gdG90U3BhY2VzIC0gbnVtTGVmdFxyXG5cdHRleHQgOj0gKFxyXG5cdFx0aWYgKGNoYXIgPT0gJyAnKVxyXG5cdFx0XHQnICcucmVwZWF0KG51bUxlZnQpICsgY29sb3JpemUobGFiZWwsIGNvbG9yKSArICcgJy5yZXBlYXQobnVtUmlnaHQpXHJcblx0XHRlbHNlXHJcblx0XHRcdGJ1ZiA6PSAnICcucmVwZWF0IG51bUJ1ZmZlclxyXG5cdFx0XHRsZWZ0IDo9IGNoYXIucmVwZWF0IG51bUxlZnQgLSBudW1CdWZmZXJcclxuXHRcdFx0cmlnaHQgOj0gY2hhci5yZXBlYXQgbnVtUmlnaHQgLSBudW1CdWZmZXJcclxuXHRcdFx0bGVmdCArIGJ1ZiArIGNvbG9yaXplKGxhYmVsLCBjb2xvcikgKyBidWYgKyByaWdodFxyXG5cdFx0KVxyXG5cdHJldHVybiB0ZXh0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNtZFRpdGxlIDo9ICh0aXRsZTogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBjZW50ZXJlZCB0aXRsZSwge2NoYXI6ICc9JywgY29sb3I6ICdjeWFuJ31cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ1N0cmluZ1NldE1hcDxUID0gc3RyaW5nPiBleHRlbmRzIE1hcDxULCBTZXQ8c3RyaW5nPj5cclxuXHJcblx0YWRkKGtleTogVCwgdmFsdWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRhU2V0IDo9IHN1cGVyLmdldCBrZXlcclxuXHRcdGlmIGRlZmluZWQoYVNldClcclxuXHRcdFx0YVNldC5hZGQgdmFsdWVcclxuXHRcdGVsc2VcclxuXHRcdFx0bmV3U2V0IDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0XHRcdG5ld1NldC5hZGQgdmFsdWVcclxuXHRcdFx0c3VwZXIuc2V0IGtleSwgbmV3U2V0XHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGhhc0tleShrZXk6IFQpOiBib29sZWFuXHJcblxyXG5cdFx0cmV0dXJuIEBoYXMga2V5XHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRoYXNWYWx1ZSh2YWw6IHN0cmluZyk6IGJvb2xlYW5cclxuXHJcblx0XHRmb3Iga2V5IG9mIEBhbGxLZXlzKClcclxuXHRcdFx0c2V0IDo9IEBnZXQga2V5XHJcblx0XHRcdGlmIGRlZmluZWQoc2V0KSAmJiBzZXQuaGFzKHZhbClcclxuXHRcdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHQqYWxsS2V5cygpOiBUSXRlcmF0b3I8VD5cclxuXHJcblx0XHR5aWVsZCAqc3VwZXIua2V5cygpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdCphbGxWYWx1ZXMoa2V5OiBUKTogVEl0ZXJhdG9yPHN0cmluZz5cclxuXHJcblx0XHRhU2V0IDo9IHN1cGVyLmdldCBrZXlcclxuXHRcdGlmIGRlZmluZWQoYVNldClcclxuXHRcdFx0eWllbGQgKmFTZXQudmFsdWVzKClcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YXNTdHJpbmcoKTogc3RyaW5nXHJcblxyXG5cdFx0cmVzdWx0czEgOj0gW11cclxuXHRcdGZvciBrZXkgb2YgQGFsbEtleXMoKVxyXG5cdFx0XHRyZXN1bHRzMS5wdXNoIFwiI3trZXl9OiAje0FycmF5LmZyb20oQGFsbFZhbHVlcyBrZXkpLmpvaW4oJyAnKX1cIlxyXG5cdFx0bExpbmVzIDo9IHJlc3VsdHMxXHJcblx0XHRyZXR1cm4gbExpbmVzLmpvaW4gJ1xcbidcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNUQU1MIDo9ICh4OiB1bmtub3duKTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBpc1N0cmluZyh4KVxyXG5cdFx0dHJ5XHJcblx0XHRcdHBhcnNlWUFNTCh1bnRhYmlmeSh4KSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRcdGNhdGNoIGVyclxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnJvbVRBTUwgOj0gKGJsb2NrOiBzdHJpbmcpOiB1bmtub3duID0+XHJcblxyXG5cdHJldHVybiBwYXJzZVlBTUwodW50YWJpZnkoYmxvY2spKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9Oi0xMFwiICAgID0+IFwibmFtZSA9IEpvaG4gICAgICBcIlxyXG4jICAgIGZcIm5hbWUgPSAjeydKb2huJ306MTBcIiAgICAgPT4gXCJuYW1lID0gICAgICAgSm9oblwiXHJcbiMgICAgZlwibmFtZSA9ICN7J2FcXHRiJ30hXCIgICAgICAgPT4gXCJuYW1lID0gYeKGkmJcIlxyXG4jICAgIGZcIm5hbWUgPSAjeydKb2huJ306e2JsdWV9XCIgPT4gXCJuYW1lID0gSm9oblwiICgnSm9obicgaW4gYmx1ZSBjb2xvcilcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gTnVtYmVyIG9mIHN0cmluZ3MgaXMgYWx3YXlzIDEgZ3JlYXRlciB0aGFuIHRoZSBudW1iZXIgb2YgdmFsdWVzXHJcblxyXG5leHBvcnQgZiA6PSAoXHJcblx0XHRsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXlcclxuXHRcdC4uLmxWYWx1ZXM6IHVua25vd25bXVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdCMgLS0tIFNwbGl0IHRoZSBmaXJzdCBzdHJpbmdcclxuXHRbbWFpbkZtdCwgZmlyc3RTdHJdIDo9IGZzcGxpdCBsU3RyaW5nc1swXVxyXG5cclxuXHQjIC0tLSBmb3JtYXQgZWFjaCBvZiB0aGUgdmFsdWVzLCBjb25jYXRlbmF0aW5nIGFzIHdlIGdvXHJcblx0YmlnU3RyIDo9IE1BUCBsVmFsdWVzLCBmaXJzdFN0ciwgKHZhbCwgYWNjLCBpKSA9PlxyXG5cdFx0W2ZtdCwgbmV4dFN0cl0gOj0gZnNwbGl0KGxTdHJpbmdzW2krMV0pXHJcblx0XHRyZXR1cm4gYWNjICsgZm9ybWF0VmFsKHZhbCwgZm10KSArIG5leHRTdHJcclxuXHRyZXR1cm4gZm9ybWF0VmFsKGJpZ1N0ciwgbWFpbkZtdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRGb3JtYXQgPSB7XHJcblx0dG9SZWw6IGJvb2xlYW5cclxuXHRlc2NhcGU6IGJvb2xlYW5cclxuXHR3aWR0aDogbnVtYmVyXHJcblx0Y29sb3I6IHN0cmluZ1xyXG5cdH1cclxuXHJcbmV4cG9ydCBmb3JtYXRWYWwgOj0gKFxyXG5cdFx0dmFsOiB1bmtub3duXHJcblx0XHRmbXQ6IFRGb3JtYXQ/XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0c3RyMSA6PSAoXHJcblx0XHQgICh2YWwgPT0gdW5kZWZpbmVkKSA/ICd1bmRlZidcclxuXHRcdDogKHZhbCA9PSBudWxsKSAgICAgID8gJ251bGwnXHJcblx0XHQ6IFN0cmluZyh2YWwpXHJcblx0XHQpXHJcblx0aWYgbm90ZGVmaW5lZChmbXQpXHJcblx0XHRyZXR1cm4gc3RyMVxyXG5cdHt0b1JlbCwgZXNjYXBlLCB3aWR0aCwgY29sb3J9IDo9IGZtdFxyXG5cdHN0cjIgOj0gdG9SZWwgPyB0b1JlbFBhdGgoc3RyMSkgOiBzdHIxXHJcblx0c3RyMyA6PSBlc2NhcGUgPyBlc2Moc3RyMikgOiBzdHIyXHJcblx0c3RyNCA6PSAoXHJcblx0XHQgICh3aWR0aCA+IDApID8gYWxpZ25TdHJpbmcoc3RyMywgd2lkdGgsICdyaWdodCcpXHJcblx0XHQ6ICh3aWR0aCA8IDApID8gYWxpZ25TdHJpbmcoc3RyMywgLXdpZHRoLCAnbGVmdCcpXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgIHN0cjNcclxuXHRcdClcclxuXHRyZXR1cm4gaXNDb2xvcihjb2xvcikgPyBjb2xvcml6ZShzdHI0LCBjb2xvcikgOiBzdHI0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZzcGxpdCA6PSAoXHJcblx0c3RyOiBzdHJpbmdcclxuXHQpOiBbKFRGb3JtYXQ/KSwgc3RyaW5nXSA9PlxyXG5cclxuXHRpZiBub3Qgc3RyLnN0YXJ0c1dpdGgoJzonKVxyXG5cdFx0cmV0dXJuIFt1bmRlZiwgc3RyXVxyXG5cdGxNYXRjaGVzIDo9IHN0ci5tYXRjaCAvLy9eXHJcblx0XHRcdDpcclxuXHRcdFx0KH4pPyAgICAgICAgIyB0byByZWxhdGl2ZSBwYXRoXHJcblx0XHRcdChbLStdP1xcZCspPyAjIHdpZHRoXHJcblx0XHRcdChcXCEpPyAgICAgICAjIGVzY2FwZSB0ZXh0P1xyXG5cdFx0XHQoPzpcclxuXHRcdFx0XHR7IChbYS16XSspIH0gICAjIGNvbG9yXHJcblx0XHRcdFx0KT9cclxuXHRcdFx0KC4qKSAgICAgICAgIyBhY3R1YWwgdGV4dFxyXG5cdFx0XHQkLy8vc1xyXG5cclxuXHRpZiBub3RkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFx0Y29uc29sZS5sb2cgXCJCQUQgQkFEIEJBRFwiXHJcblx0XHRjb25zb2xlLmxvZyBlc2Moc3RyKVxyXG5cdFx0Y29uc29sZS5sb2cgXCJCQUQgQkFEIEJBRFwiXHJcblxyXG5cdG9idmlvdXNseSBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFtfLCB0b1JlbCwgd2lkdGgsIGRvRXNjLCBjb2xvciwgcmVzdF0gOj0gbE1hdGNoZXNcclxuXHRpZiBub3QgdG9SZWwgJiYgbm90IHdpZHRoICYmIG5vdCBkb0VzYyAmJiBub3QgY29sb3JcclxuXHRcdHJldHVybiBbdW5kZWYsIHN0cl1cclxuXHRyZXR1cm4gW1xyXG5cdFx0e1xyXG5cdFx0XHR0b1JlbDogIHRvQm9vbCh0b1JlbClcclxuXHRcdFx0d2lkdGg6ICB3aWR0aCA/IHBhcnNlSW50KHdpZHRoKSA6IDBcclxuXHRcdFx0ZXNjYXBlOiB0b0Jvb2woZG9Fc2MpXHJcblx0XHRcdGNvbG9yOiAgZGVmaW5lZChjb2xvcikgJiYgaXNDb2xvcihjb2xvcikgPyBjb2xvciA6ICcnXHJcblx0XHRcdH0sXHJcblx0XHRyZXN0XHJcblx0XHRdXHJcbiJdfQ==