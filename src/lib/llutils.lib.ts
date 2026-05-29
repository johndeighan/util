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

export const clearHash = (h: hash): void => {

	for (const key of keys(h)) {
		delete h[key]
	}
	return
}

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGx1dGlscy5saWIudHMiLCJzb3VyY2VzIjpbImxsdXRpbHMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQW1CO0FBQ25CLEFBQUE7QUFDQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3pDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3ZDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzFDLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUN0RCxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM1RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3pDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMs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QUFRLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQztBQUFBLENBQUE7QUFDN0IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFFLE1BQUQsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdkQsQUFBQTtBQUNBLEFBQUEsQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN2QyxBQUFBLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUEsQUFBQyxLQUFLLENBQUMsTUFBTSxDO0NBQUEsQ0FBQTtBQUN0QyxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLEM7QUFBQSxDQUFBO0FBQ2pELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBRyxNQUFGLEVBQUUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3hELEFBQUE7QUFDQSxBQUFBLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdkMsQUFBQSxFQUFFLE1BQU0s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Q0FBQSxDQUFBO0FBQ25CLEFBQUEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQztDQUFDLENBQUE7QUFDZixBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVUsTUFBVCxTQUFTLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsQ0FBSSxNQUFILEdBQUcsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRztBQUMvQixBQUFBLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ3pCLEFBQUEsQ0FBQyxNO0FBQU0sQ0FBQTtBQUNQLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN2QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7QUFBQyxDQUFBO0FBQ3JDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNyQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7QUFBQyxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN6QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ3RELEFBQUEsQ0FBUyxNQUFSLFFBQVEsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQSxBQUFDLGFBQWEsQ0FBQTtBQUNyQyxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDO0FBQUMsQ0FBQTtBQUMvQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDekQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2QsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNiLEFBQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDLEdBQUcsQyxDQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM3QyxBQUFBLEVBQUUsS0FBSyxDLEVBQUcsQ0FBQyxDO0NBQUMsQ0FBQTtBQUNaLEFBQUEsQ0FBQyxNQUFNLENBQUMsSztBQUFLLENBQUE7QUFDYixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ25ELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDbEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLEM7Q0FBQyxDQUFBO0FBQ1gsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFBLEFBQUMsT0FBTyxDO0NBQUEsQztBQUFBLENBQUE7QUFDNUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVksTUFBWCxXQUFXLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0RCxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDO0FBQUMsQ0FBQTtBQUMxQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3ZELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzdCLEFBQUEsRUFBRSxNQUFNLENBQUMsVTtDQUFVLENBQUE7QUFDbkIsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUEsQUFBQyxVQUFVLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNoQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFBO0FBQzVELEFBQUEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUEsQUFBQyxJQUFJLENBQUEsQ0FBQyxDQUFDLElBQUksQ0FBQSxBQUFDLElBQUksQztBQUFBLENBQUE7QUFDdkQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFRLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDeEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxVO0NBQVUsQ0FBQTtBQUNuQixBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQSxBQUFDLFVBQVUsQztDQUFBLEM7QUFBQSxDQUFBO0FBQ2hDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNyQyxBQUFBO0FBQ0EsQUFBQSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDckIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQztBQUFDLENBQUE7QUFDakQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNwRCxBQUFBO0FBQ0EsQUFBQSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQSxDQUFBLENBQUE7QUFDcEIsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzFCLEFBQUEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDO0VBQUEsQztDQUFBLENBQUE7QUFDbkIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNO0FBQU0sQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFTLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU07QUFDMUIsQUFBQSxDQUFDLE1BQU0sQ0FBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQyxDQUFPLENBQUMsS0FBSyxDLENBQUssQ0FBQyxDQUFsQixDO0FBQW1CLENBQUE7QUFDeEMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEUsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFBO0FBQ3RDLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQztBQUFDLENBQUE7QUFDOUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEUsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFBO0FBQ3RDLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRztBQUFHLENBQUE7QUFDOUIsQUFBQTtBQUNB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LENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2pELEFBQUEsQ0FBQyxHQUFHLENBQUEsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLEtBQUssQztDQUFBLEM7QUFBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNsQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUEsQUFBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUEsQztD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QyxFLENBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFFLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtBQUNsQixBQUFBLEcsT0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDO0VBQUMsQ0FBQTtBQUN0RSxBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEdBQU0sTUFBSCxHQUFHLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUEsQUFBQyxTQUFTLENBQUE7QUFDOUIsQUFBQSxHQUFPLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDMUMsQUFBQSxHQUFRLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDNUMsQUFBQSxHLE9BQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLO0VBQUssQyxDLEMsRUFBQTtBQUNwRCxFQUFFLENBQUM7QUFDSCxBQUFBLENBQUMsTUFBTSxDQUFDLEk7QUFBSSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEs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QUFDLEdBQUcsQztDQUFDLENBQUE7QUFDckIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ1QsQUFBQSxFQUFFLENBQUM7QUFDSCxBQUFBLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQ3hCLEFBQUEsR0FBRyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3RDLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDeEIsQUFBQSxHQUFHLEtBQUssQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDeEQsR0FBRyxDQUFDLENBQUM7QUFDTCxBQUFBLEVBQUUsSUFBSTtBQUNOLEFBQUEsRUFBRSxDO0FBQUMsQ0FBQTtBQUNIIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIGxsdXRpbHMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge2NyZWF0ZVJlcXVpcmV9IGZyb20gJ25vZGUtbW9kdWxlJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtyZWxhdGl2ZX0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlWUFNTH0gZnJvbSBcIkBzdGQveWFtbFwiXHJcblxyXG5pbXBvcnQge1xyXG5cdHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBkZWVwRXF1YWwsIGNyb2FrLCBhc3NlcnQsXHJcblx0Y29sb3JpemUsIGlzQ29sb3IsIHRvUmVsUGF0aCwgb2J2aW91c2x5LCB0b0Jvb2wsIFRJdGVyYXRvcixcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7ZXNjfSBmcm9tICd1bmljb2RlJ1xyXG5pbXBvcnQge1xyXG5cdGlzSGFzaCwgaXNBcnJheSwgaXNOb25FbXB0eVN0cmluZywgY2hhcixcclxuXHRpc0FycmF5T2ZTdHJpbmdzLCBpc0VtcHR5LCBub25FbXB0eSwgaXNTdHJpbmcsIGlzSW50ZWdlcixcclxuXHRpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIGFycmF5LCBhcnJheW9mLCBUVm9pZEZ1bmMsIGlzTm9uUHJpbWl0aXZlLFxyXG5cdGZ1bmN0aW9uRGVmLCBUU3RyaW5nTWFwcGVyLFxyXG5cdH0gZnJvbSAnZGF0YXR5cGVzJ1xyXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xyXG5cclxubGx1dGlsc0xvYWRUaW1lOiBpbnRlZ2VyIDo9IERhdGUubm93KClcclxuZGVmV2lkdGggOj0gNjQgICAgICMgLS0tdXNlZCBpbiBzZXAsIGNlbnRlcmVkXHJcblxyXG5leHBvcnQge2RlZXBFcXVhbH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3RkQ2hlY2tzIDo9IChoZWxwU3RyOiBzdHJpbmcgPSAnJyk6IHZvaWQgPT5cclxuXHJcblx0ZGVidWdnZXJcclxuXHRyb290IDo9IERlbm8uZW52LmdldCgnUFJPSkVDVF9ST09UX0RJUicpXHJcblx0YXNzZXJ0IG5vbkVtcHR5KHJvb3QpLCBcIlBsZWFzZSBzZXQgZW52IHZhciBQUk9KRUNUX1JPT1RfRElSXCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2luY2VMb2FkIDo9IChkYXRldGltZTogRGF0ZSB8IGludGVnZXIgPSBEYXRlLm5vdygpKTogbnVtYmVyID0+XHJcblxyXG5cdGlmIChkYXRldGltZSBpbnN0YW5jZW9mIERhdGUpXHJcblx0XHRyZXR1cm4gZGF0ZXRpbWUudmFsdWVPZigpIC0gbGx1dGlsc0xvYWRUaW1lXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGRhdGV0aW1lIC0gbGx1dGlsc0xvYWRUaW1lXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNpbmNlTG9hZFN0ciA6PSAoZGF0ZXRpbWU6IChEYXRlIHwgaW50ZWdlcik/ID0gdW5kZWYpID0+XHJcblxyXG5cdHJldHVybiBzcHJpbnRmIFwiJTZkXCIsIHNpbmNlTG9hZChkYXRldGltZSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdGhyb3dzRXJyb3IgOj0gKFxyXG5cdFx0ZnVuYzogVFZvaWRGdW5jLFxyXG5cdFx0bXNnOiBzdHJpbmcgPSBcIlVuZXhwZWN0ZWQgc3VjY2Vzc1wiXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHRyeVxyXG5cdFx0ZnVuYygpXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IobXNnKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0cmV0dXJuXHJcbiMgaWdub3JlIGVycm9yIC0gaXQgd2FzIGV4cGVjdGVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRydW5jU3RyIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIpID0+XHJcblxyXG5cdGlmIHN0ci5sZW5ndGggPD0gbGVuXHJcblx0XHRyZXR1cm4gc3RyXHJcblx0cmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgbGVuIC0gMykgKyAnLi4uJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzdHJUb0hhc2ggOj0gKHN0cjogc3RyaW5nKTogaGFzaCA9PlxyXG5cclxuXHRpZiBpc0VtcHR5KHN0cilcclxuXHRcdHJldHVybiB7fVxyXG5cdGg6IGhhc2ggOj0ge31cclxuXHRmb3Igd29yZCBvZiBzdHIudHJpbSgpLnNwbGl0KC9cXHMrLylcclxuXHRcdGxldCByZWY6IHN0cmluZ1tdIHwgbnVsbFxyXG5cdFx0aWYgKHJlZiA9IHdvcmQubWF0Y2goL14oXFwhKT8oW0EtWmEtel1bQS1aYS16XzAtOV0qKSg/Oig9KSguKikpPyQvKSlcclxuXHRcdFx0bE1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCA6PSByZWZcclxuXHRcdFx0W18sIG5lZywgaWRlbnQsIGVxU2lnbiwgc3RyXSA6PSBsTWF0Y2hlc1xyXG5cdFx0XHRpZiBpc05vbkVtcHR5U3RyaW5nKGVxU2lnbilcclxuXHRcdFx0XHRhc3NlcnQgbm90ZGVmaW5lZChuZWcpIHx8IChuZWcgPT0gJycpLFxyXG5cdFx0XHRcdFx0XHRcIm5lZ2F0aW9uIHdpdGggc3RyaW5nIHZhbHVlXCJcclxuXHRcdFx0XHQjIC0tLSBjaGVjayBpZiBzdHIgaXMgYSB2YWxpZCBudW1iZXJcclxuXHRcdFx0XHRpZiBzdHIubWF0Y2goL14tP1xcZCsoXFwuXFxkKyk/JC8pXHJcblx0XHRcdFx0XHRudW0gOj0gcGFyc2VGbG9hdCBzdHJcclxuXHRcdFx0XHRcdGlmIE51bWJlci5pc05hTihudW0pXHJcblx0XHRcdFx0XHRcdCMgLS0tIFRPIERPOiBpbnRlcnByZXQgYmFja3NsYXNoIGVzY2FwZXNcclxuXHRcdFx0XHRcdFx0aFtpZGVudF0gPSBzdHJcclxuXHRcdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdFx0aFtpZGVudF0gPSBudW1cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHRoW2lkZW50XSA9IHN0clxyXG5cdFx0XHRlbHNlIGlmIG5lZ1xyXG5cdFx0XHRcdGhbaWRlbnRdID0gZmFsc2VcclxuXHRcdFx0ZWxzZVxyXG5cdFx0XHRcdGhbaWRlbnRdID0gdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRjcm9hayBcIkludmFsaWQgd29yZCAje3dvcmR9XCJcclxuXHRyZXR1cm4gaFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvIDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBoYXNoID0+XHJcblxyXG5cdHJldHVybiBzdHJUb0hhc2ggbFN0cmluZ3NbMF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcyA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gc3BhY2VzKDMpLnJlcGVhdCBtYXRjaC5sZW5ndGhcclxuXHRyZXR1cm4gbFN0cmluZ3NbMF0ucmVwbGFjZUFsbCAvXlxcdCsvbWcsIHJlcGxhY2VyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHMyIDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBzdHJpbmcgPT5cclxuXHJcblx0cmVwbGFjZXIgOj0gKG1hdGNoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBzcGFjZXMoMikucmVwZWF0IG1hdGNoLmxlbmd0aFxyXG5cdHJldHVybiBsU3RyaW5nc1swXS5yZXBsYWNlQWxsIC9eXFx0Ky9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdCA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRsZXZlbCA6PSBNYXRoLmZsb29yIG1hdGNoLmxlbmd0aCAvIDNcclxuXHRcdHJldHVybiAnXFx0Jy5yZXBlYXQgbGV2ZWxcclxuXHRyZXR1cm4gbFN0cmluZ3NbMF0ucmVwbGFjZUFsbCAvXlxceDIwKy9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQga2V5cyA9IE9iamVjdC5rZXlzXHJcbmV4cG9ydCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaGFzS2V5IDo9IChvYmo6IHVua25vd24sIC4uLmxLZXlzOiBzdHJpbmdbXSkgPT5cclxuXHJcblx0aWYgKHR5cGVvZiBvYmogIT0gJ29iamVjdCcpIHx8IChvYmogPT0gbnVsbClcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cdGZvciBrZXkgb2YgbEtleXNcclxuXHRcdGlmIG5vdCAoa2V5IGluIG9iailcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0cmV0dXJuIHRydWVcclxuXHJcbmV4cG9ydCBoYXNLZXlzIDo9IGhhc0tleVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGVhckhhc2ggOj0gKGg6IGhhc2gpOiB2b2lkID0+XHJcblxyXG5cdGZvciBrZXkgb2Yga2V5cyhoKVxyXG5cdFx0ZGVsZXRlIGhba2V5XVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzbGVlcFN5bmMgOj0gKHNlYzogbnVtYmVyKTogdm9pZCA9PlxyXG5cclxuXHRzdGFydCA6PSBEYXRlLm5vdygpXHJcblx0ZW5kIDo9IERhdGUubm93KCkgKyAxMDAwICogc2VjXHJcblx0d2hpbGUgKERhdGUubm93KCkgPCBlbmQpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNwYWNlcyA6PSAobjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAobiA8PSAwKSA/ICcnIDogJyAnLnJlcGVhdChuKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJzIDo9IChuOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChuIDw9IDApID8gJycgOiAnXFx0Jy5yZXBlYXQobilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcnRyaW0gOj0gKGxpbmU6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNTdHJpbmcobGluZSksIFwibm90IGEgc3RyaW5nOiAje3R5cGVvZiBsaW5lfVwiXHJcblx0bE1hdGNoZXMgOj0gbGluZS5tYXRjaCAvXiguKj8pXFxzKyQvc1xyXG5cdHJldHVybiAobE1hdGNoZXMgPT0gbnVsbCkgPyBsaW5lIDogbE1hdGNoZXNbMV1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY291bnRDaGFycyA6PSAoc3RyOiBzdHJpbmcsIGNoOiBzdHJpbmcpOiBudW1iZXIgPT5cclxuXHJcblx0bGV0IGNvdW50ID0gMFxyXG5cdGxldCBwb3MgPSAtMVxyXG5cdHdoaWxlIChwb3MgPSBzdHIuaW5kZXhPZihjaCwgcG9zICsgMSkpICE9IC0xXHJcblx0XHRjb3VudCArPSAxXHJcblx0cmV0dXJuIGNvdW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJsb2NrVG9BcnJheSA6PSAoYmxvY2s6IHN0cmluZyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGlmIGlzRW1wdHkoYmxvY2spXHJcblx0XHRyZXR1cm4gW11cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYmxvY2suc3BsaXQgL1xccj9cXG4vXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEJsb2NrU3BlYyA9IHN0cmluZyB8IHN0cmluZ1tdXHJcblxyXG5leHBvcnQgaXNCbG9ja1NwZWMgOj0gKHg6IHVua25vd24pOiB4IGlzIFRCbG9ja1NwZWMgPT5cclxuXHRyZXR1cm4gaXNTdHJpbmcoeCkgfHwgaXNBcnJheU9mU3RyaW5ncyh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0FycmF5IDo9IChzdHJPckFycmF5OiBUQmxvY2tTcGVjKTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgQXJyYXkuaXNBcnJheShzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYmxvY2tUb0FycmF5IHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXJyYXlUb0Jsb2NrIDo9IChsTGluZXM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc0FycmF5KGxMaW5lcyksIFwibExpbmVzIGlzIG5vdCBhbiBhcnJheTogI3tsTGluZXN9XCJcclxuXHRyZXR1cm4gbExpbmVzLmZpbHRlcigobGluZSkgPT4gZGVmaW5lZCBsaW5lKS5qb2luIFwiXFxuXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9CbG9jayA6PSAoc3RyT3JBcnJheTogVEJsb2NrU3BlYyk6IHN0cmluZyA9PlxyXG5cclxuXHRpZiBpc1N0cmluZyhzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYXJyYXlUb0Jsb2NrIHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG53c1NwbGl0IDo9IChzdHI6IHN0cmluZyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdG5ld3N0ciA6PSBzdHIudHJpbSgpXHJcblx0cmV0dXJuIChuZXdzdHIgPT0gJycpID8gW10gOiBuZXdzdHIuc3BsaXQoL1xccysvKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3b3JkcyA6PSAoLi4ubFN0cmluZ3M6IHN0cmluZ1tdKTogc3RyaW5nW10gPT5cclxuXHJcblx0bFdvcmRzIDo9IFtdXHJcblx0Zm9yIHN0ciBvZiBsU3RyaW5nc1xyXG5cdFx0Zm9yIHdvcmQgb2Ygd3NTcGxpdChzdHIpXHJcblx0XHRcdGxXb3Jkcy5wdXNoIHdvcmRcclxuXHRyZXR1cm4gbFdvcmRzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZ2V0TkV4dHJhIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIpOiBudW1iZXIgPT5cclxuXHJcblx0ZXh0cmEgOj0gbGVuIC0gc3RyLmxlbmd0aFxyXG5cdHJldHVybiBpZiAoZXh0cmEgPiAwKSB0aGVuIGV4dHJhIGVsc2UgMFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBycGFkIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIsIGNoOiBzdHJpbmcgPSAnICcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChjaC5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhclwiXHJcblx0ZXh0cmEgOj0gZ2V0TkV4dHJhIHN0ciwgbGVuXHJcblx0cmV0dXJuIHN0ciArIGNoLnJlcGVhdChleHRyYSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbHBhZCA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyLCBjaDogc3RyaW5nID0gJyAnKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2gubGVuZ3RoID09IDEpLCBcIk5vdCBhIGNoYXJcIlxyXG5cdGV4dHJhIDo9IGdldE5FeHRyYSBzdHIsIGxlblxyXG5cdHJldHVybiBjaC5yZXBlYXQoZXh0cmEpICsgc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEFsaWdubWVudCA9ICdsJyB8ICdjJyB8ICdyJyB8ICdsZWZ0JyB8ICdjZW50ZXInIHwgJ3JpZ2h0J1xyXG5cclxuZXhwb3J0IGlzQWxpZ25tZW50IDo9ICh4OiB1bmtub3duKTogeCBpcyBUQWxpZ25tZW50ID0+XHJcblx0cmV0dXJuICgodHlwZW9mIHggPT0gJ3N0cmluZycpICYmIFsnbCcsICdjJywgJ3InLCAnbGVmdCcsICdjZW50ZXInLCAncmlnaHQnXS5pbmNsdWRlcyh4KSlcclxuXHJcbmV4cG9ydCBhbGlnblN0cmluZyA6PSBmdW5jdGlvbihcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0d2lkdGg6IG51bWJlcixcclxuXHRcdGFsaWduOiBUQWxpZ25tZW50XHJcblx0XHQpOiBzdHJpbmdcclxuXHJcblx0c3dpdGNoIGFsaWduXHJcblx0XHRjYXNlICdsZWZ0JzpcclxuXHRcdGNhc2UgJ2wnOlxyXG5cdFx0XHRyZXR1cm4gcnBhZCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdjZW50ZXInOlxyXG5cdFx0Y2FzZSAnYyc6XHJcblx0XHRcdHJldHVybiBzZXAgJyAnLCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdyaWdodCc6XHJcblx0XHRjYXNlICdyJzpcclxuXHRcdFx0cmV0dXJuIGxwYWQgc3RyLCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB6cGFkIDo9IChuOiBudW1iZXIsIGxlbjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBscGFkIG4udG9TdHJpbmcoKSwgbGVuLCAnMCdcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgR0VORVJBVE9SXHJcblxyXG5leHBvcnQgYWxsTWF0Y2hlcyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlOiBSZWdFeHBcclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmdbXT4gLT5cclxuXHJcblx0IyAtLS0gRW5zdXJlIHRoZSByZWdleCBoYXMgdGhlIGdsb2JhbCBmbGFnIChnKSBzZXRcclxuXHRuZXdyZSA6PSBuZXcgUmVnRXhwKHJlLCByZS5mbGFncyArIChyZS5mbGFncy5pbmNsdWRlcygnZycpID8gJycgOiAnZycpKVxyXG5cdGxldCBsTWF0Y2hlczogc3RyaW5nW10gfCBudWxsID0gbnVsbFxyXG5cdHdoaWxlIGRlZmluZWQobE1hdGNoZXMgPSBuZXdyZS5leGVjKHN0cikpXHJcblx0XHR5aWVsZCBsTWF0Y2hlc1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZXF1aXJlIDo9IGNyZWF0ZVJlcXVpcmUgaW1wb3J0Lm1ldGEudXJsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExpbmVBbmRDb2x1bW4gOj0gKHRleHQ6IHN0cmluZywgcG9zOiBudW1iZXIpID0+XHJcblxyXG5cdCMgLS0tIEdldCBsaW5lIG51bWJlciBieSBjb3VudGluZyBudW1iZXIgb2YgXFxuIGNoYXJzXHJcblx0IyAgICAgICAgYmVmb3JlIHRoZSBjdXJyZW50IHBvc2l0aW9uXHJcblx0IyAgICAgR2V0IGNvbHVtbiBudW1iZXIgYnkgZmluZGluZyBjbG9zZXN0IHByZXZpb3VzIHBvc2l0aW9uXHJcblx0IyAgICAgICAgb2YgYSBcXG4gYW5kIGNvbXB1dGluZyB0aGUgZGlmZmVyZW5jZVxyXG5cdHNob3J0U3RyIDo9IHRleHQuc3Vic3RyaW5nIDAsIHBvc1xyXG5cdHJldHVybiBbXHJcblx0XHRjb3VudENoYXJzKHNob3J0U3RyLCBcIlxcblwiKSArIDFcclxuXHRcdHBvcyAtIHNob3J0U3RyLmxhc3RJbmRleE9mKCdcXG4nKVxyXG5cdF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4jIGxhdGVyPyBhbGxvdyBwYXNzaW5nIGluIHN0cmluZ1tdID8/P1xyXG5leHBvcnQgd2lkdGhPZiA6PSAoYmxvY2s6IHN0cmluZyk6IG51bWJlciA9PlxyXG5cclxuXHRsZXQgd2lkdGggPSAwXHJcblx0Zm9yIGxpbmUgb2YgYWxsTGluZXNJbkJsb2NrKGJsb2NrKVxyXG5cdFx0aWYgbGluZS5sZW5ndGggPiB3aWR0aFxyXG5cdFx0XHR3aWR0aCA9IGxpbmUubGVuZ3RoXHJcblx0cmV0dXJuIHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGhlaWdodE9mIDo9IChibG9jazogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdHJldHVybiBpZiAoYmxvY2sgPT0gJycpIHRoZW4gMCBlbHNlIGJsb2NrLnNwbGl0KCdcXG4nKS5sZW5ndGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0T3B0aW9ucyA6PSA8VCBleHRlbmRzIGhhc2g+KFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0aERlZmF1bHRzOiBUXHJcblx0XHQpOiBUID0+XHJcblxyXG5cdHJldHVybiB7IC4uLmhEZWZhdWx0cywgLi4uaE9wdGlvbnMgfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzZXAgOj0gKFxyXG5cdFx0Y2hhcjogc3RyaW5nID0gJy0nLFxyXG5cdFx0bGFiZWw6IHN0cmluZz8gPSB1bmRlZixcclxuXHRcdHdpZHRoOiBudW1iZXIgPSBkZWZXaWR0aFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2hhci5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhcjogI3tjaGFyfVwiXHJcblx0aWYgZGVmaW5lZChsYWJlbClcclxuXHRcdHJldHVybiBjZW50ZXJlZCBsYWJlbCwge2NoYXIsIHdpZHRofVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBjaGFyLnJlcGVhdCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJpZnkgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRuU3BhY2VzOiBudW1iZXIgPSAzXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsIC9eKFxceDIwKykvLCAobWF0Y2gsIHNwYWNlcykgPT5cclxuXHRcdHJldHVybiAnXFx0Jy5yZXBlYXQgTWF0aC5mbG9vciBzcGFjZXMubGVuZ3RoIC8gblNwYWNlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bnRhYmlmeSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgPSAnICAgJ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFx0JywgcmVwbGFjZW1lbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYW51cCA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHJ0cmltKHN0cikucmVwbGFjZUFsbCgnXFxyJywgJycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5CbG9jayA6PSAoXHJcblx0XHRibG9jazogc3RyaW5nXHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRsZXQgc3RhcnQgPSAwXHJcblx0bGV0IGVuZCA9IGJsb2NrLmluZGV4T2YoJ1xcbicpXHJcblx0d2hpbGUgKGVuZCAhPSAtMSlcclxuXHRcdHlpZWxkIGNsZWFudXAoYmxvY2suc3Vic3RyaW5nKHN0YXJ0LCBlbmQpKVxyXG5cdFx0c3RhcnQgPSBlbmQgKyAxXHJcblx0XHRlbmQgPSBibG9jay5pbmRleE9mKCdcXG4nLCBzdGFydClcclxuXHRpZiAoc3RhcnQgPCBibG9jay5sZW5ndGgpXHJcblx0XHR5aWVsZCBjbGVhbnVwKGJsb2NrLnN1YnN0cmluZyhzdGFydCkpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSB2YWxpZCBvcHRpb25zOlxyXG4jICAgICAgICBjaGFyIC0gY2hhciB0byB1c2Ugb24gbGVmdCBhbmQgcmlnaHRcclxuIyAgICAgICAgd2lkdGggLSBmdWxsIHdpZHRoXHJcbiMgICAgICAgIG51bUJ1ZmZlciAtIG51bSBzcGFjZXMgYXJvdW5kIGxhYmVsIHdoZW4gY2hhciA8PiAnICdcclxuIyAgICAgICAgY29sb3IgLSBjb2xvciBvZiBlbnRpcmUgc3RyaW5nXHJcblxyXG5leHBvcnQgY2VudGVyZWQgOj0gKFxyXG5cdFx0bGFiZWw6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2hhcjogY2hhclxyXG5cdFx0d2lkdGg6IG51bWJlclxyXG5cdFx0bnVtQnVmZmVyOiBudW1iZXJcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHR9XHJcblx0e2NoYXIsIHdpZHRoLCBudW1CdWZmZXIsIGNvbG9yfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNoYXI6ICcgJ1xyXG5cdFx0d2lkdGg6IGRlZldpZHRoXHJcblx0XHRudW1CdWZmZXI6IDJcclxuXHRcdGNvbG9yOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHR0b3RTcGFjZXMgOj0gKHdpZHRoID49IGxhYmVsLmxlbmd0aCkgPyB3aWR0aCAtIGxhYmVsLmxlbmd0aCA6IDBcclxuXHRudW1MZWZ0IDo9IE1hdGguZmxvb3IgdG90U3BhY2VzIC8gMlxyXG5cdG51bVJpZ2h0IDo9IHRvdFNwYWNlcyAtIG51bUxlZnRcclxuXHR0ZXh0IDo9IChcclxuXHRcdGlmIChjaGFyID09ICcgJylcclxuXHRcdFx0JyAnLnJlcGVhdChudW1MZWZ0KSArIGNvbG9yaXplKGxhYmVsLCBjb2xvcikgKyAnICcucmVwZWF0KG51bVJpZ2h0KVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRidWYgOj0gJyAnLnJlcGVhdCBudW1CdWZmZXJcclxuXHRcdFx0bGVmdCA6PSBjaGFyLnJlcGVhdCBudW1MZWZ0IC0gbnVtQnVmZmVyXHJcblx0XHRcdHJpZ2h0IDo9IGNoYXIucmVwZWF0IG51bVJpZ2h0IC0gbnVtQnVmZmVyXHJcblx0XHRcdGxlZnQgKyBidWYgKyBjb2xvcml6ZShsYWJlbCwgY29sb3IpICsgYnVmICsgcmlnaHRcclxuXHRcdClcclxuXHRyZXR1cm4gdGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbWRUaXRsZSA6PSAodGl0bGU6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gY2VudGVyZWQgdGl0bGUsIHtjaGFyOiAnPScsIGNvbG9yOiAnY3lhbid9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENTdHJpbmdTZXRNYXA8VCA9IHN0cmluZz4gZXh0ZW5kcyBNYXA8VCwgU2V0PHN0cmluZz4+XHJcblxyXG5cdGFkZChrZXk6IFQsIHZhbHVlOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdGFTZXQuYWRkIHZhbHVlXHJcblx0XHRlbHNlXHJcblx0XHRcdG5ld1NldCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdFx0XHRuZXdTZXQuYWRkIHZhbHVlXHJcblx0XHRcdHN1cGVyLnNldCBrZXksIG5ld1NldFxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRoYXNLZXkoa2V5OiBUKTogYm9vbGVhblxyXG5cclxuXHRcdHJldHVybiBAaGFzIGtleVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0aGFzVmFsdWUodmFsOiBzdHJpbmcpOiBib29sZWFuXHJcblxyXG5cdFx0Zm9yIGtleSBvZiBAYWxsS2V5cygpXHJcblx0XHRcdHNldCA6PSBAZ2V0IGtleVxyXG5cdFx0XHRpZiBkZWZpbmVkKHNldCkgJiYgc2V0Lmhhcyh2YWwpXHJcblx0XHRcdFx0cmV0dXJuIHRydWVcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0KmFsbEtleXMoKTogVEl0ZXJhdG9yPFQ+XHJcblxyXG5cdFx0eWllbGQgKnN1cGVyLmtleXMoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHQqYWxsVmFsdWVzKGtleTogVCk6IFRJdGVyYXRvcjxzdHJpbmc+XHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdHlpZWxkICphU2V0LnZhbHVlcygpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFzU3RyaW5nKCk6IHN0cmluZ1xyXG5cclxuXHRcdHJlc3VsdHMxIDo9IFtdXHJcblx0XHRmb3Iga2V5IG9mIEBhbGxLZXlzKClcclxuXHRcdFx0cmVzdWx0czEucHVzaCBcIiN7a2V5fTogI3tBcnJheS5mcm9tKEBhbGxWYWx1ZXMga2V5KS5qb2luKCcgJyl9XCJcclxuXHRcdGxMaW5lcyA6PSByZXN1bHRzMVxyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luICdcXG4nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzVEFNTCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgaXNTdHJpbmcoeClcclxuXHRcdHRyeVxyXG5cdFx0XHRwYXJzZVlBTUwodW50YWJpZnkoeCkpXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0XHRjYXRjaCBlcnJcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZyb21UQU1MIDo9IChibG9jazogc3RyaW5nKTogdW5rbm93biA9PlxyXG5cclxuXHRyZXR1cm4gcGFyc2VZQU1MKHVudGFiaWZ5KGJsb2NrKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgZlwibmFtZSA9ICN7J0pvaG4nfTotMTBcIiAgICA9PiBcIm5hbWUgPSBKb2huICAgICAgXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OjEwXCIgICAgID0+IFwibmFtZSA9ICAgICAgIEpvaG5cIlxyXG4jICAgIGZcIm5hbWUgPSAjeydhXFx0Yid9IVwiICAgICAgID0+IFwibmFtZSA9IGHihpJiXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OntibHVlfVwiID0+IFwibmFtZSA9IEpvaG5cIiAoJ0pvaG4nIGluIGJsdWUgY29sb3IpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIE51bWJlciBvZiBzdHJpbmdzIGlzIGFsd2F5cyAxIGdyZWF0ZXIgdGhhbiB0aGUgbnVtYmVyIG9mIHZhbHVlc1xyXG5cclxuZXhwb3J0IGYgOj0gKFxyXG5cdFx0bFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5XHJcblx0XHQuLi5sVmFsdWVzOiB1bmtub3duW11cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHQjIC0tLSBTcGxpdCB0aGUgZmlyc3Qgc3RyaW5nXHJcblx0W21haW5GbXQsIGZpcnN0U3RyXSA6PSBmc3BsaXQgbFN0cmluZ3NbMF1cclxuXHJcblx0IyAtLS0gZm9ybWF0IGVhY2ggb2YgdGhlIHZhbHVlcywgY29uY2F0ZW5hdGluZyBhcyB3ZSBnb1xyXG5cdGJpZ1N0ciA6PSBNQVAgbFZhbHVlcywgZmlyc3RTdHIsICh2YWwsIGFjYywgaSkgPT5cclxuXHRcdFtmbXQsIG5leHRTdHJdIDo9IGZzcGxpdChsU3RyaW5nc1tpKzFdKVxyXG5cdFx0cmV0dXJuIGFjYyArIGZvcm1hdFZhbCh2YWwsIGZtdCkgKyBuZXh0U3RyXHJcblx0cmV0dXJuIGZvcm1hdFZhbChiaWdTdHIsIG1haW5GbXQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBURm9ybWF0ID0ge1xyXG5cdHRvUmVsOiBib29sZWFuXHJcblx0ZXNjYXBlOiBib29sZWFuXHJcblx0d2lkdGg6IG51bWJlclxyXG5cdGNvbG9yOiBzdHJpbmdcclxuXHR9XHJcblxyXG5leHBvcnQgZm9ybWF0VmFsIDo9IChcclxuXHRcdHZhbDogdW5rbm93blxyXG5cdFx0Zm10OiBURm9ybWF0P1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHN0cjEgOj0gKFxyXG5cdFx0ICAodmFsID09IHVuZGVmaW5lZCkgPyAndW5kZWYnXHJcblx0XHQ6ICh2YWwgPT0gbnVsbCkgICAgICA/ICdudWxsJ1xyXG5cdFx0OiBTdHJpbmcodmFsKVxyXG5cdFx0KVxyXG5cdGlmIG5vdGRlZmluZWQoZm10KVxyXG5cdFx0cmV0dXJuIHN0cjFcclxuXHR7dG9SZWwsIGVzY2FwZSwgd2lkdGgsIGNvbG9yfSA6PSBmbXRcclxuXHRzdHIyIDo9IHRvUmVsID8gdG9SZWxQYXRoKHN0cjEpIDogc3RyMVxyXG5cdHN0cjMgOj0gZXNjYXBlID8gZXNjKHN0cjIpIDogc3RyMlxyXG5cdHN0cjQgOj0gKFxyXG5cdFx0ICAod2lkdGggPiAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIHdpZHRoLCAncmlnaHQnKVxyXG5cdFx0OiAod2lkdGggPCAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIC13aWR0aCwgJ2xlZnQnKVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICBzdHIzXHJcblx0XHQpXHJcblx0cmV0dXJuIGlzQ29sb3IoY29sb3IpID8gY29sb3JpemUoc3RyNCwgY29sb3IpIDogc3RyNFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmc3BsaXQgOj0gKFxyXG5cdHN0cjogc3RyaW5nXHJcblx0KTogWyhURm9ybWF0PyksIHN0cmluZ10gPT5cclxuXHJcblx0aWYgbm90IHN0ci5zdGFydHNXaXRoKCc6JylcclxuXHRcdHJldHVybiBbdW5kZWYsIHN0cl1cclxuXHRsTWF0Y2hlcyA6PSBzdHIubWF0Y2ggLy8vXlxyXG5cdFx0XHQ6XHJcblx0XHRcdCh+KT8gICAgICAgICMgdG8gcmVsYXRpdmUgcGF0aFxyXG5cdFx0XHQoWy0rXT9cXGQrKT8gIyB3aWR0aFxyXG5cdFx0XHQoXFwhKT8gICAgICAgIyBlc2NhcGUgdGV4dD9cclxuXHRcdFx0KD86XHJcblx0XHRcdFx0eyAoW2Etel0rKSB9ICAgIyBjb2xvclxyXG5cdFx0XHRcdCk/XHJcblx0XHRcdCguKikgICAgICAgICMgYWN0dWFsIHRleHRcclxuXHRcdFx0JC8vL3NcclxuXHJcblx0aWYgbm90ZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdGNvbnNvbGUubG9nIFwiQkFEIEJBRCBCQURcIlxyXG5cdFx0Y29uc29sZS5sb2cgZXNjKHN0cilcclxuXHRcdGNvbnNvbGUubG9nIFwiQkFEIEJBRCBCQURcIlxyXG5cclxuXHRvYnZpb3VzbHkgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRbXywgdG9SZWwsIHdpZHRoLCBkb0VzYywgY29sb3IsIHJlc3RdIDo9IGxNYXRjaGVzXHJcblx0aWYgbm90IHRvUmVsICYmIG5vdCB3aWR0aCAmJiBub3QgZG9Fc2MgJiYgbm90IGNvbG9yXHJcblx0XHRyZXR1cm4gW3VuZGVmLCBzdHJdXHJcblx0cmV0dXJuIFtcclxuXHRcdHtcclxuXHRcdFx0dG9SZWw6ICB0b0Jvb2wodG9SZWwpXHJcblx0XHRcdHdpZHRoOiAgd2lkdGggPyBwYXJzZUludCh3aWR0aCkgOiAwXHJcblx0XHRcdGVzY2FwZTogdG9Cb29sKGRvRXNjKVxyXG5cdFx0XHRjb2xvcjogIGRlZmluZWQoY29sb3IpICYmIGlzQ29sb3IoY29sb3IpID8gY29sb3IgOiAnJ1xyXG5cdFx0XHR9LFxyXG5cdFx0cmVzdFxyXG5cdFx0XVxyXG4iXX0=