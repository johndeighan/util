"use strict";
// llutils.lib.civet

import {createRequire} from 'node-module'
import {sprintf} from '@std/fmt/printf'
import {relative} from '@std/path'
import {existsSync} from '@std/fs'
import {parse as parseYAML} from "@std/yaml"

import {
	undef, defined, notdefined, deepEqual, croak, assert,
	colorize, isColor, toRelPath, obviously, toBool,
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

type TStringSource = Uint8Array<ArrayBuffer> | BufferSource | string

const decoder = new TextDecoder()
export const decode = (x: TStringSource): string => {
	return (typeof x === 'string') ? x : decoder.decode(x)
}

const encoder = new TextEncoder()
export const encode = (x: string): Uint8Array<ArrayBuffer> => {
	return encoder.encode(x)
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
		return '   '.repeat(match.length)
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
		): Generator<string[], void, void> {

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

export const allLinesInBlock = function*(
		block: string
		): Generator<string> {

	let start = 0
	let end = block.indexOf('\n')
	while (end !== -1) {
		yield block.substring(start, end).replaceAll('\r', '')
		start = end + 1
		end = block.indexOf('\n', start)
	}
	if (start < block.length) {
		yield block.substring(start).replaceAll('\r', '')
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

	*allKeys(): Generator<T, void, void> {

		yield *super.keys()
		return
	}

	// ..........................................................

	*allValues(key: T): Generator<string, void, void> {

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
	const lMatches = str.match(/^:(~)?([-+]?\d+)?(\!)?(?:{([a-z]+)})?(.*)$/)

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjXFxsaWJcXGxsdXRpbHMubGliLnRzIiwic291cmNlcyI6WyJzcmMvbGliL2xsdXRpbHMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQW1CO0FBQ25CLEFBQUE7QUFDQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3pDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3ZDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzFDLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUN0RCxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNqRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3pDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENB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QUFFLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFBLE1BQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUEsQ0FBQSxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQixBQUFBLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQSxBQUFDLElBQUksQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ25CLEFBQUEsQ0FBQyxNQUFNLENBQUMsTTtBQUFNLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBUyxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNsRCxBQUFBO0FBQ0EsQUFBQSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNO0FBQzFCLEFBQUEsQ0FBQyxNQUFNLENBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEMsQ0FBTyxDQUFDLEtBQUssQyxDQUFLLENBQUMsQ0FBbEIsQztBQUFtQixDQUFBO0FBQ3hDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3RFLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQTtBQUN0QyxBQUFBLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQSxBQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUM1QixBQUFBLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEM7QUFBQyxDQUFBO0FBQzlCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3RFLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQTtBQUN0QyxBQUFBLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLFNBQVMsQ0FBQSxBQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUM1QixBQUFBLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEc7QUFBRyxDQUFBO0FBQzlCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENB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QyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2pELEFBQUEsQ0FBQyxHQUFHLENBQUEsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLEtBQUssQztDQUFBLEM7QUFBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNsQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUEsQUFBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUEsQztDQUFBLENBQUEsQztBQUFBLENBQUE7QUFDdkQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFD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QUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDL0QsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQTtBQUNYLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUE7QUFDakIsQUFBQSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNkLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxLQUFLO0FBQ2QsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEUsQUFBQSxDQUFRLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFBLEFBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDcEMsQUFBQSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU87QUFDaEMsQUFBQSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ1YsQUFBQSxFLEMsQyxDLEUsQ0FBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBO0FBQ2xCLEFBQUEsRyxPQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEM7RUFBQyxDQUFBO0FBQ3RFLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBTSxNQUFILEdBQUcsQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQSxB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Q0FBQyxDQUFBLE1BQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkIsQUFBQSxHQUFNLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxJLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ2xCLEFBQUEsR0FBRyxHQUFHLENBQUEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQyxBQUFBLElBQUksTUFBTSxDQUFDLEk7R0FBSSxDO0VBQUEsQ0FBQTtBQUNmLEFBQUEsRUFBRSxNQUFNLENBQUMsSztDQUFLLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDQUFDLEMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBO0FBQ3JDLEFBQUE7QUFDQSxBQUFBLEVBQUUsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLENBQUMsQyxTQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQTtBQUNsRCxBQUFBO0FBQ0EsQUFBQSxFQUFNLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFBO0FBQ3ZCLEFBQUEsRUFBRSxHQUFHLENBQUEsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEdBQUcs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LCJzb3VyY2VzQ29udGVudCI6WyIjIGxsdXRpbHMubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge2NyZWF0ZVJlcXVpcmV9IGZyb20gJ25vZGUtbW9kdWxlJ1xyXG5pbXBvcnQge3NwcmludGZ9IGZyb20gJ0BzdGQvZm10L3ByaW50ZidcclxuaW1wb3J0IHtyZWxhdGl2ZX0gZnJvbSAnQHN0ZC9wYXRoJ1xyXG5pbXBvcnQge2V4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7cGFyc2U6IHBhcnNlWUFNTH0gZnJvbSBcIkBzdGQveWFtbFwiXHJcblxyXG5pbXBvcnQge1xyXG5cdHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBkZWVwRXF1YWwsIGNyb2FrLCBhc3NlcnQsXHJcblx0Y29sb3JpemUsIGlzQ29sb3IsIHRvUmVsUGF0aCwgb2J2aW91c2x5LCB0b0Jvb2wsXHJcblx0fSBmcm9tICdiYXNlJ1xyXG5pbXBvcnQge2VzY30gZnJvbSAndW5pY29kZSdcclxuaW1wb3J0IHtcclxuXHRpc0hhc2gsIGlzQXJyYXksIGlzTm9uRW1wdHlTdHJpbmcsIGNoYXIsXHJcblx0aXNBcnJheU9mU3RyaW5ncywgaXNFbXB0eSwgbm9uRW1wdHksIGlzU3RyaW5nLCBpc0ludGVnZXIsXHJcblx0aW50ZWdlciwgaGFzaCwgaGFzaG9mLCBhcnJheSwgYXJyYXlvZiwgVFZvaWRGdW5jLCBpc05vblByaW1pdGl2ZSxcclxuXHRmdW5jdGlvbkRlZiwgVFN0cmluZ01hcHBlcixcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuXHJcbmxsdXRpbHNMb2FkVGltZTogaW50ZWdlciA6PSBEYXRlLm5vdygpXHJcbmRlZldpZHRoIDo9IDY0ICAgICAjIC0tLXVzZWQgaW4gc2VwLCBjZW50ZXJlZFxyXG5cclxuZXhwb3J0IHtkZWVwRXF1YWx9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHN0ZENoZWNrcyA6PSAoaGVscFN0cjogc3RyaW5nID0gJycpOiB2b2lkID0+XHJcblxyXG5cdGRlYnVnZ2VyXHJcblx0cm9vdCA6PSBEZW5vLmVudi5nZXQoJ1BST0pFQ1RfUk9PVF9ESVInKVxyXG5cdGFzc2VydCBub25FbXB0eShyb290KSwgXCJQbGVhc2Ugc2V0IGVudiB2YXIgUFJPSkVDVF9ST09UX0RJUlwiXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUU3RyaW5nU291cmNlID0gVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCBCdWZmZXJTb3VyY2UgfCBzdHJpbmdcclxuXHJcbmRlY29kZXIgOj0gbmV3IFRleHREZWNvZGVyKClcclxuZXhwb3J0IGRlY29kZSA6PSAoeDogVFN0cmluZ1NvdXJjZSk6IHN0cmluZyA9PlxyXG5cdHJldHVybiAodHlwZW9mIHggPT0gJ3N0cmluZycpID8geCA6IGRlY29kZXIuZGVjb2RlKHgpXHJcblxyXG5lbmNvZGVyIDo9IG5ldyBUZXh0RW5jb2RlcigpXHJcbmV4cG9ydCBlbmNvZGUgOj0gKHg6IHN0cmluZyk6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+ID0+XHJcblx0cmV0dXJuIGVuY29kZXIuZW5jb2RlIHhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2luY2VMb2FkIDo9IChkYXRldGltZTogRGF0ZSB8IGludGVnZXIgPSBEYXRlLm5vdygpKTogbnVtYmVyID0+XHJcblxyXG5cdGlmIChkYXRldGltZSBpbnN0YW5jZW9mIERhdGUpXHJcblx0XHRyZXR1cm4gZGF0ZXRpbWUudmFsdWVPZigpIC0gbGx1dGlsc0xvYWRUaW1lXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGRhdGV0aW1lIC0gbGx1dGlsc0xvYWRUaW1lXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNpbmNlTG9hZFN0ciA6PSAoZGF0ZXRpbWU6IChEYXRlIHwgaW50ZWdlcik/ID0gdW5kZWYpID0+XHJcblxyXG5cdHJldHVybiBzcHJpbnRmIFwiJTZkXCIsIHNpbmNlTG9hZChkYXRldGltZSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdGhyb3dzRXJyb3IgOj0gKFxyXG5cdFx0ZnVuYzogVFZvaWRGdW5jLFxyXG5cdFx0bXNnOiBzdHJpbmcgPSBcIlVuZXhwZWN0ZWQgc3VjY2Vzc1wiXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdHRyeVxyXG5cdFx0ZnVuYygpXHJcblx0XHR0aHJvdyBuZXcgRXJyb3IobXNnKVxyXG5cdGNhdGNoIGVyclxyXG5cdFx0cmV0dXJuXHJcbiMgaWdub3JlIGVycm9yIC0gaXQgd2FzIGV4cGVjdGVkXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRydW5jU3RyIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIpID0+XHJcblxyXG5cdGlmIHN0ci5sZW5ndGggPD0gbGVuXHJcblx0XHRyZXR1cm4gc3RyXHJcblx0cmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgbGVuIC0gMykgKyAnLi4uJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzdHJUb0hhc2ggOj0gKHN0cjogc3RyaW5nKTogaGFzaCA9PlxyXG5cclxuXHRpZiBpc0VtcHR5KHN0cilcclxuXHRcdHJldHVybiB7fVxyXG5cdGg6IGhhc2ggOj0ge31cclxuXHRmb3Igd29yZCBvZiBzdHIudHJpbSgpLnNwbGl0KC9cXHMrLylcclxuXHRcdGxldCByZWY6IHN0cmluZ1tdIHwgbnVsbFxyXG5cdFx0aWYgKHJlZiA9IHdvcmQubWF0Y2goL14oXFwhKT8oW0EtWmEtel1bQS1aYS16XzAtOV0qKSg/Oig9KSguKikpPyQvKSlcclxuXHRcdFx0bE1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCA6PSByZWZcclxuXHRcdFx0W18sIG5lZywgaWRlbnQsIGVxU2lnbiwgc3RyXSA6PSBsTWF0Y2hlc1xyXG5cdFx0XHRpZiBpc05vbkVtcHR5U3RyaW5nKGVxU2lnbilcclxuXHRcdFx0XHRhc3NlcnQgbm90ZGVmaW5lZChuZWcpIHx8IChuZWcgPT0gJycpLFxyXG5cdFx0XHRcdFx0XHRcIm5lZ2F0aW9uIHdpdGggc3RyaW5nIHZhbHVlXCJcclxuXHRcdFx0XHQjIC0tLSBjaGVjayBpZiBzdHIgaXMgYSB2YWxpZCBudW1iZXJcclxuXHRcdFx0XHRpZiBzdHIubWF0Y2goL14tP1xcZCsoXFwuXFxkKyk/JC8pXHJcblx0XHRcdFx0XHRudW0gOj0gcGFyc2VGbG9hdCBzdHJcclxuXHRcdFx0XHRcdGlmIE51bWJlci5pc05hTihudW0pXHJcblx0XHRcdFx0XHRcdCMgLS0tIFRPIERPOiBpbnRlcnByZXQgYmFja3NsYXNoIGVzY2FwZXNcclxuXHRcdFx0XHRcdFx0aFtpZGVudF0gPSBzdHJcclxuXHRcdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdFx0aFtpZGVudF0gPSBudW1cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHRoW2lkZW50XSA9IHN0clxyXG5cdFx0XHRlbHNlIGlmIG5lZ1xyXG5cdFx0XHRcdGhbaWRlbnRdID0gZmFsc2VcclxuXHRcdFx0ZWxzZVxyXG5cdFx0XHRcdGhbaWRlbnRdID0gdHJ1ZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRjcm9hayBcIkludmFsaWQgd29yZCAje3dvcmR9XCJcclxuXHRyZXR1cm4gaFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBvIDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBoYXNoID0+XHJcblxyXG5cdHJldHVybiBzdHJUb0hhc2ggbFN0cmluZ3NbMF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcyA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gJyAgICcucmVwZWF0IG1hdGNoLmxlbmd0aFxyXG5cdHJldHVybiBsU3RyaW5nc1swXS5yZXBsYWNlQWxsIC9eXFx0Ky9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdCA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRsZXZlbCA6PSBNYXRoLmZsb29yIG1hdGNoLmxlbmd0aCAvIDNcclxuXHRcdHJldHVybiAnXFx0Jy5yZXBlYXQgbGV2ZWxcclxuXHRyZXR1cm4gbFN0cmluZ3NbMF0ucmVwbGFjZUFsbCAvXlxceDIwKy9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQga2V5cyA9IE9iamVjdC5rZXlzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGhhc0tleSA6PSAob2JqOiB1bmtub3duLCAuLi5sS2V5czogc3RyaW5nW10pID0+XHJcblxyXG5cdGlmICh0eXBlb2Ygb2JqICE9ICdvYmplY3QnKSB8fCAob2JqID09IG51bGwpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHRmb3Iga2V5IG9mIGxLZXlzXHJcblx0XHRpZiBub3QgKGtleSBpbiBvYmopXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdHJldHVybiB0cnVlXHJcblxyXG5leHBvcnQgaGFzS2V5cyA6PSBoYXNLZXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2xlZXBTeW5jIDo9IChzZWM6IG51bWJlcik6IHZvaWQgPT5cclxuXHJcblx0c3RhcnQgOj0gRGF0ZS5ub3coKVxyXG5cdGVuZCA6PSBEYXRlLm5vdygpICsgMTAwMCAqIHNlY1xyXG5cdHdoaWxlIChEYXRlLm5vdygpIDwgZW5kKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzcGFjZXMgOj0gKG46IG51bWJlcik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKG4gPD0gMCkgPyAnJyA6ICcgJy5yZXBlYXQobilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdGFicyA6PSAobjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAobiA8PSAwKSA/ICcnIDogJ1xcdCcucmVwZWF0KG4pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJ0cmltIDo9IChsaW5lOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IGlzU3RyaW5nKGxpbmUpLCBcIm5vdCBhIHN0cmluZzogI3t0eXBlb2YgbGluZX1cIlxyXG5cdGxNYXRjaGVzIDo9IGxpbmUubWF0Y2ggL14oLio/KVxccyskL3NcclxuXHRyZXR1cm4gKGxNYXRjaGVzID09IG51bGwpID8gbGluZSA6IGxNYXRjaGVzWzFdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNvdW50Q2hhcnMgOj0gKHN0cjogc3RyaW5nLCBjaDogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdGxldCBjb3VudCA9IDBcclxuXHRsZXQgcG9zID0gLTFcclxuXHR3aGlsZSAocG9zID0gc3RyLmluZGV4T2YoY2gsIHBvcyArIDEpKSAhPSAtMVxyXG5cdFx0Y291bnQgKz0gMVxyXG5cdHJldHVybiBjb3VudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBibG9ja1RvQXJyYXkgOj0gKGJsb2NrOiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRpZiBpc0VtcHR5KGJsb2NrKVxyXG5cdFx0cmV0dXJuIFtdXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGJsb2NrLnNwbGl0IC9cXHI/XFxuL1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRCbG9ja1NwZWMgPSBzdHJpbmcgfCBzdHJpbmdbXVxyXG5leHBvcnQgaXNCbG9ja1NwZWMgOj0gKHg6IHVua25vd24pOiB4IGlzIFRCbG9ja1NwZWMgPT5cclxuXHRyZXR1cm4gaXNTdHJpbmcoeCkgfHwgaXNBcnJheU9mU3RyaW5ncyh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0FycmF5IDo9IChzdHJPckFycmF5OiBUQmxvY2tTcGVjKTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgQXJyYXkuaXNBcnJheShzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYmxvY2tUb0FycmF5IHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXJyYXlUb0Jsb2NrIDo9IChsTGluZXM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc0FycmF5KGxMaW5lcyksIFwibExpbmVzIGlzIG5vdCBhbiBhcnJheTogI3tsTGluZXN9XCJcclxuXHRyZXR1cm4gbExpbmVzLmZpbHRlcigobGluZSkgPT4gZGVmaW5lZCBsaW5lKS5qb2luIFwiXFxuXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9CbG9jayA6PSAoc3RyT3JBcnJheTogVEJsb2NrU3BlYyk6IHN0cmluZyA9PlxyXG5cclxuXHRpZiBpc1N0cmluZyhzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYXJyYXlUb0Jsb2NrIHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG53c1NwbGl0IDo9IChzdHI6IHN0cmluZyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdG5ld3N0ciA6PSBzdHIudHJpbSgpXHJcblx0cmV0dXJuIChuZXdzdHIgPT0gJycpID8gW10gOiBuZXdzdHIuc3BsaXQoL1xccysvKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB3b3JkcyA6PSAoLi4ubFN0cmluZ3M6IHN0cmluZ1tdKTogc3RyaW5nW10gPT5cclxuXHJcblx0bFdvcmRzIDo9IFtdXHJcblx0Zm9yIHN0ciBvZiBsU3RyaW5nc1xyXG5cdFx0Zm9yIHdvcmQgb2Ygd3NTcGxpdChzdHIpXHJcblx0XHRcdGxXb3Jkcy5wdXNoIHdvcmRcclxuXHRyZXR1cm4gbFdvcmRzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZ2V0TkV4dHJhIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIpOiBudW1iZXIgPT5cclxuXHJcblx0ZXh0cmEgOj0gbGVuIC0gc3RyLmxlbmd0aFxyXG5cdHJldHVybiBpZiAoZXh0cmEgPiAwKSB0aGVuIGV4dHJhIGVsc2UgMFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBycGFkIDo9IChzdHI6IHN0cmluZywgbGVuOiBudW1iZXIsIGNoOiBzdHJpbmcgPSAnICcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChjaC5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhclwiXHJcblx0ZXh0cmEgOj0gZ2V0TkV4dHJhIHN0ciwgbGVuXHJcblx0cmV0dXJuIHN0ciArIGNoLnJlcGVhdChleHRyYSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbHBhZCA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyLCBjaDogc3RyaW5nID0gJyAnKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2gubGVuZ3RoID09IDEpLCBcIk5vdCBhIGNoYXJcIlxyXG5cdGV4dHJhIDo9IGdldE5FeHRyYSBzdHIsIGxlblxyXG5cdHJldHVybiBjaC5yZXBlYXQoZXh0cmEpICsgc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEFsaWdubWVudCA9ICdsJyB8ICdjJyB8ICdyJyB8ICdsZWZ0JyB8ICdjZW50ZXInIHwgJ3JpZ2h0J1xyXG5cclxuZXhwb3J0IGlzQWxpZ25tZW50IDo9ICh4OiB1bmtub3duKTogeCBpcyBUQWxpZ25tZW50ID0+XHJcblx0cmV0dXJuICgodHlwZW9mIHggPT0gJ3N0cmluZycpICYmIFsnbCcsICdjJywgJ3InLCAnbGVmdCcsICdjZW50ZXInLCAncmlnaHQnXS5pbmNsdWRlcyh4KSlcclxuXHJcbmV4cG9ydCBhbGlnblN0cmluZyA6PSBmdW5jdGlvbihcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0d2lkdGg6IG51bWJlcixcclxuXHRcdGFsaWduOiBUQWxpZ25tZW50XHJcblx0XHQpOiBzdHJpbmdcclxuXHJcblx0c3dpdGNoIGFsaWduXHJcblx0XHRjYXNlICdsZWZ0JzpcclxuXHRcdGNhc2UgJ2wnOlxyXG5cdFx0XHRyZXR1cm4gcnBhZCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdjZW50ZXInOlxyXG5cdFx0Y2FzZSAnYyc6XHJcblx0XHRcdHJldHVybiBzZXAgJyAnLCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdyaWdodCc6XHJcblx0XHRjYXNlICdyJzpcclxuXHRcdFx0cmV0dXJuIGxwYWQgc3RyLCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB6cGFkIDo9IChuOiBudW1iZXIsIGxlbjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBscGFkIG4udG9TdHJpbmcoKSwgbGVuLCAnMCdcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgR0VORVJBVE9SXHJcblxyXG5leHBvcnQgYWxsTWF0Y2hlcyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlOiBSZWdFeHBcclxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmdbXSwgdm9pZCwgdm9pZD4gLT5cclxuXHJcblx0IyAtLS0gRW5zdXJlIHRoZSByZWdleCBoYXMgdGhlIGdsb2JhbCBmbGFnIChnKSBzZXRcclxuXHRuZXdyZSA6PSBuZXcgUmVnRXhwKHJlLCByZS5mbGFncyArIChyZS5mbGFncy5pbmNsdWRlcygnZycpID8gJycgOiAnZycpKVxyXG5cdGxldCBsTWF0Y2hlczogc3RyaW5nW10gfCBudWxsID0gbnVsbFxyXG5cdHdoaWxlIGRlZmluZWQobE1hdGNoZXMgPSBuZXdyZS5leGVjKHN0cikpXHJcblx0XHR5aWVsZCBsTWF0Y2hlc1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZXF1aXJlIDo9IGNyZWF0ZVJlcXVpcmUgaW1wb3J0Lm1ldGEudXJsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExpbmVBbmRDb2x1bW4gOj0gKHRleHQ6IHN0cmluZywgcG9zOiBudW1iZXIpID0+XHJcblxyXG5cdCMgLS0tIEdldCBsaW5lIG51bWJlciBieSBjb3VudGluZyBudW1iZXIgb2YgXFxuIGNoYXJzXHJcblx0IyAgICAgICAgYmVmb3JlIHRoZSBjdXJyZW50IHBvc2l0aW9uXHJcblx0IyAgICAgR2V0IGNvbHVtbiBudW1iZXIgYnkgZmluZGluZyBjbG9zZXN0IHByZXZpb3VzIHBvc2l0aW9uXHJcblx0IyAgICAgICAgb2YgYSBcXG4gYW5kIGNvbXB1dGluZyB0aGUgZGlmZmVyZW5jZVxyXG5cdHNob3J0U3RyIDo9IHRleHQuc3Vic3RyaW5nIDAsIHBvc1xyXG5cdHJldHVybiBbXHJcblx0XHRjb3VudENoYXJzKHNob3J0U3RyLCBcIlxcblwiKSArIDFcclxuXHRcdHBvcyAtIHNob3J0U3RyLmxhc3RJbmRleE9mKCdcXG4nKVxyXG5cdF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4jIGxhdGVyPyBhbGxvdyBwYXNzaW5nIGluIHN0cmluZ1tdID8/P1xyXG5leHBvcnQgd2lkdGhPZiA6PSAoYmxvY2s6IHN0cmluZyk6IG51bWJlciA9PlxyXG5cclxuXHRsZXQgd2lkdGggPSAwXHJcblx0Zm9yIGxpbmUgb2YgYWxsTGluZXNJbkJsb2NrKGJsb2NrKVxyXG5cdFx0aWYgbGluZS5sZW5ndGggPiB3aWR0aFxyXG5cdFx0XHR3aWR0aCA9IGxpbmUubGVuZ3RoXHJcblx0cmV0dXJuIHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGhlaWdodE9mIDo9IChibG9jazogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdHJldHVybiBpZiAoYmxvY2sgPT0gJycpIHRoZW4gMCBlbHNlIGJsb2NrLnNwbGl0KCdcXG4nKS5sZW5ndGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0T3B0aW9ucyA6PSA8VCBleHRlbmRzIGhhc2g+KFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0aERlZmF1bHRzOiBUXHJcblx0XHQpOiBUID0+XHJcblxyXG5cdHJldHVybiB7IC4uLmhEZWZhdWx0cywgLi4uaE9wdGlvbnMgfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzZXAgOj0gKFxyXG5cdFx0Y2hhcjogc3RyaW5nID0gJy0nLFxyXG5cdFx0bGFiZWw6IHN0cmluZz8gPSB1bmRlZixcclxuXHRcdHdpZHRoOiBudW1iZXIgPSBkZWZXaWR0aFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2hhci5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhcjogI3tjaGFyfVwiXHJcblx0aWYgZGVmaW5lZChsYWJlbClcclxuXHRcdHJldHVybiBjZW50ZXJlZCBsYWJlbCwge2NoYXIsIHdpZHRofVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBjaGFyLnJlcGVhdCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJpZnkgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRuU3BhY2VzOiBudW1iZXIgPSAzXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsIC9eKFxceDIwKykvLCAobWF0Y2gsIHNwYWNlcykgPT5cclxuXHRcdHJldHVybiAnXFx0Jy5yZXBlYXQgTWF0aC5mbG9vciBzcGFjZXMubGVuZ3RoIC8gblNwYWNlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bnRhYmlmeSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgPSAnICAgJ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFx0JywgcmVwbGFjZW1lbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYWxsTGluZXNJbkJsb2NrIDo9IChcclxuXHRcdGJsb2NrOiBzdHJpbmdcclxuXHRcdCk6IEdlbmVyYXRvcjxzdHJpbmc+IC0+XHJcblxyXG5cdGxldCBzdGFydCA9IDBcclxuXHRsZXQgZW5kID0gYmxvY2suaW5kZXhPZiAnXFxuJ1xyXG5cdHdoaWxlIGVuZCAhPSAtMVxyXG5cdFx0eWllbGQgYmxvY2suc3Vic3RyaW5nKHN0YXJ0LCBlbmQpLnJlcGxhY2VBbGwoJ1xccicsICcnKVxyXG5cdFx0c3RhcnQgPSBlbmQgKyAxXHJcblx0XHRlbmQgPSBibG9jay5pbmRleE9mKCdcXG4nLCBzdGFydClcclxuXHRpZiBzdGFydCA8IGJsb2NrLmxlbmd0aFxyXG5cdFx0eWllbGQgYmxvY2suc3Vic3RyaW5nKHN0YXJ0KS5yZXBsYWNlQWxsKCdcXHInLCAnJylcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIHZhbGlkIG9wdGlvbnM6XHJcbiMgICAgICAgIGNoYXIgLSBjaGFyIHRvIHVzZSBvbiBsZWZ0IGFuZCByaWdodFxyXG4jICAgICAgICB3aWR0aCAtIGZ1bGwgd2lkdGhcclxuIyAgICAgICAgbnVtQnVmZmVyIC0gbnVtIHNwYWNlcyBhcm91bmQgbGFiZWwgd2hlbiBjaGFyIDw+ICcgJ1xyXG4jICAgICAgICBjb2xvciAtIGNvbG9yIG9mIGVudGlyZSBzdHJpbmdcclxuXHJcbmV4cG9ydCBjZW50ZXJlZCA6PSAoXHJcblx0XHRsYWJlbDogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRjaGFyOiBjaGFyXHJcblx0XHR3aWR0aDogbnVtYmVyXHJcblx0XHRudW1CdWZmZXI6IG51bWJlclxyXG5cdFx0Y29sb3I6IHN0cmluZz9cclxuXHRcdH1cclxuXHR7Y2hhciwgd2lkdGgsIG51bUJ1ZmZlciwgY29sb3J9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0Y2hhcjogJyAnXHJcblx0XHR3aWR0aDogZGVmV2lkdGhcclxuXHRcdG51bUJ1ZmZlcjogMlxyXG5cdFx0Y29sb3I6IHVuZGVmXHJcblx0XHR9XHJcblxyXG5cdHRvdFNwYWNlcyA6PSAod2lkdGggPj0gbGFiZWwubGVuZ3RoKSA/IHdpZHRoIC0gbGFiZWwubGVuZ3RoIDogMFxyXG5cdG51bUxlZnQgOj0gTWF0aC5mbG9vciB0b3RTcGFjZXMgLyAyXHJcblx0bnVtUmlnaHQgOj0gdG90U3BhY2VzIC0gbnVtTGVmdFxyXG5cdHRleHQgOj0gKFxyXG5cdFx0aWYgKGNoYXIgPT0gJyAnKVxyXG5cdFx0XHQnICcucmVwZWF0KG51bUxlZnQpICsgY29sb3JpemUobGFiZWwsIGNvbG9yKSArICcgJy5yZXBlYXQobnVtUmlnaHQpXHJcblx0XHRlbHNlXHJcblx0XHRcdGJ1ZiA6PSAnICcucmVwZWF0IG51bUJ1ZmZlclxyXG5cdFx0XHRsZWZ0IDo9IGNoYXIucmVwZWF0IG51bUxlZnQgLSBudW1CdWZmZXJcclxuXHRcdFx0cmlnaHQgOj0gY2hhci5yZXBlYXQgbnVtUmlnaHQgLSBudW1CdWZmZXJcclxuXHRcdFx0bGVmdCArIGJ1ZiArIGNvbG9yaXplKGxhYmVsLCBjb2xvcikgKyBidWYgKyByaWdodFxyXG5cdFx0KVxyXG5cdHJldHVybiB0ZXh0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNtZFRpdGxlIDo9ICh0aXRsZTogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBjZW50ZXJlZCB0aXRsZSwge2NoYXI6ICc9JywgY29sb3I6ICdjeWFuJ31cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ1N0cmluZ1NldE1hcDxUID0gc3RyaW5nPiBleHRlbmRzIE1hcDxULCBTZXQ8c3RyaW5nPj5cclxuXHJcblx0YWRkKGtleTogVCwgdmFsdWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRhU2V0IDo9IHN1cGVyLmdldCBrZXlcclxuXHRcdGlmIGRlZmluZWQoYVNldClcclxuXHRcdFx0YVNldC5hZGQgdmFsdWVcclxuXHRcdGVsc2VcclxuXHRcdFx0bmV3U2V0IDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0XHRcdG5ld1NldC5hZGQgdmFsdWVcclxuXHRcdFx0c3VwZXIuc2V0IGtleSwgbmV3U2V0XHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGhhc0tleShrZXk6IFQpOiBib29sZWFuXHJcblxyXG5cdFx0cmV0dXJuIEBoYXMga2V5XHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRoYXNWYWx1ZSh2YWw6IHN0cmluZyk6IGJvb2xlYW5cclxuXHJcblx0XHRmb3Iga2V5IG9mIEBhbGxLZXlzKClcclxuXHRcdFx0c2V0IDo9IEBnZXQga2V5XHJcblx0XHRcdGlmIGRlZmluZWQoc2V0KSAmJiBzZXQuaGFzKHZhbClcclxuXHRcdFx0XHRyZXR1cm4gdHJ1ZVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHQqYWxsS2V5cygpOiBHZW5lcmF0b3I8VCwgdm9pZCwgdm9pZD5cclxuXHJcblx0XHR5aWVsZCAqc3VwZXIua2V5cygpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdCphbGxWYWx1ZXMoa2V5OiBUKTogR2VuZXJhdG9yPHN0cmluZywgdm9pZCwgdm9pZD5cclxuXHJcblx0XHRhU2V0IDo9IHN1cGVyLmdldCBrZXlcclxuXHRcdGlmIGRlZmluZWQoYVNldClcclxuXHRcdFx0eWllbGQgKmFTZXQudmFsdWVzKClcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YXNTdHJpbmcoKTogc3RyaW5nXHJcblxyXG5cdFx0cmVzdWx0czEgOj0gW11cclxuXHRcdGZvciBrZXkgb2YgQGFsbEtleXMoKVxyXG5cdFx0XHRyZXN1bHRzMS5wdXNoIFwiI3trZXl9OiAje0FycmF5LmZyb20oQGFsbFZhbHVlcyBrZXkpLmpvaW4oJyAnKX1cIlxyXG5cdFx0bExpbmVzIDo9IHJlc3VsdHMxXHJcblx0XHRyZXR1cm4gbExpbmVzLmpvaW4gJ1xcbidcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgaXNUQU1MIDo9ICh4OiB1bmtub3duKTogYm9vbGVhbiA9PlxyXG5cclxuXHRpZiBpc1N0cmluZyh4KVxyXG5cdFx0dHJ5XHJcblx0XHRcdHBhcnNlWUFNTCh1bnRhYmlmeSh4KSlcclxuXHRcdFx0cmV0dXJuIHRydWVcclxuXHRcdGNhdGNoIGVyclxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnJvbVRBTUwgOj0gKGJsb2NrOiBzdHJpbmcpOiB1bmtub3duID0+XHJcblxyXG5cdHJldHVybiBwYXJzZVlBTUwodW50YWJpZnkoYmxvY2spKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9Oi0xMFwiICAgID0+IFwibmFtZSA9IEpvaG4gICAgICBcIlxyXG4jICAgIGZcIm5hbWUgPSAjeydKb2huJ306MTBcIiAgICAgPT4gXCJuYW1lID0gICAgICAgSm9oblwiXHJcbiMgICAgZlwibmFtZSA9ICN7J2FcXHRiJ30hXCIgICAgICAgPT4gXCJuYW1lID0gYeKGkmJcIlxyXG4jICAgIGZcIm5hbWUgPSAjeydKb2huJ306e2JsdWV9XCIgPT4gXCJuYW1lID0gSm9oblwiICgnSm9obicgaW4gYmx1ZSBjb2xvcilcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gTnVtYmVyIG9mIHN0cmluZ3MgaXMgYWx3YXlzIDEgZ3JlYXRlciB0aGFuIHRoZSBudW1iZXIgb2YgdmFsdWVzXHJcblxyXG5leHBvcnQgZiA6PSAoXHJcblx0XHRsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXlcclxuXHRcdC4uLmxWYWx1ZXM6IHVua25vd25bXVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdCMgLS0tIFNwbGl0IHRoZSBmaXJzdCBzdHJpbmdcclxuXHRbbWFpbkZtdCwgZmlyc3RTdHJdIDo9IGZzcGxpdCBsU3RyaW5nc1swXVxyXG5cclxuXHQjIC0tLSBmb3JtYXQgZWFjaCBvZiB0aGUgdmFsdWVzLCBjb25jYXRlbmF0aW5nIGFzIHdlIGdvXHJcblx0YmlnU3RyIDo9IE1BUCBsVmFsdWVzLCBmaXJzdFN0ciwgKHZhbCwgYWNjLCBpKSA9PlxyXG5cdFx0W2ZtdCwgbmV4dFN0cl0gOj0gZnNwbGl0KGxTdHJpbmdzW2krMV0pXHJcblx0XHRyZXR1cm4gYWNjICsgZm9ybWF0VmFsKHZhbCwgZm10KSArIG5leHRTdHJcclxuXHRyZXR1cm4gZm9ybWF0VmFsKGJpZ1N0ciwgbWFpbkZtdClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRGb3JtYXQgPSB7XHJcblx0dG9SZWw6IGJvb2xlYW5cclxuXHRlc2NhcGU6IGJvb2xlYW5cclxuXHR3aWR0aDogbnVtYmVyXHJcblx0Y29sb3I6IHN0cmluZ1xyXG5cdH1cclxuXHJcbmV4cG9ydCBmb3JtYXRWYWwgOj0gKFxyXG5cdFx0dmFsOiB1bmtub3duXHJcblx0XHRmbXQ6IFRGb3JtYXQ/XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0c3RyMSA6PSAoXHJcblx0XHQgICh2YWwgPT0gdW5kZWZpbmVkKSA/ICd1bmRlZidcclxuXHRcdDogKHZhbCA9PSBudWxsKSAgICAgID8gJ251bGwnXHJcblx0XHQ6IFN0cmluZyh2YWwpXHJcblx0XHQpXHJcblx0aWYgbm90ZGVmaW5lZChmbXQpXHJcblx0XHRyZXR1cm4gc3RyMVxyXG5cdHt0b1JlbCwgZXNjYXBlLCB3aWR0aCwgY29sb3J9IDo9IGZtdFxyXG5cdHN0cjIgOj0gdG9SZWwgPyB0b1JlbFBhdGgoc3RyMSkgOiBzdHIxXHJcblx0c3RyMyA6PSBlc2NhcGUgPyBlc2Moc3RyMikgOiBzdHIyXHJcblx0c3RyNCA6PSAoXHJcblx0XHQgICh3aWR0aCA+IDApID8gYWxpZ25TdHJpbmcoc3RyMywgd2lkdGgsICdyaWdodCcpXHJcblx0XHQ6ICh3aWR0aCA8IDApID8gYWxpZ25TdHJpbmcoc3RyMywgLXdpZHRoLCAnbGVmdCcpXHJcblx0XHQ6ICAgICAgICAgICAgICAgICAgIHN0cjNcclxuXHRcdClcclxuXHRyZXR1cm4gaXNDb2xvcihjb2xvcikgPyBjb2xvcml6ZShzdHI0LCBjb2xvcikgOiBzdHI0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZzcGxpdCA6PSAoXHJcblx0c3RyOiBzdHJpbmdcclxuXHQpOiBbKFRGb3JtYXQ/KSwgc3RyaW5nXSA9PlxyXG5cclxuXHRpZiBub3Qgc3RyLnN0YXJ0c1dpdGgoJzonKVxyXG5cdFx0cmV0dXJuIFt1bmRlZiwgc3RyXVxyXG5cdGxNYXRjaGVzIDo9IHN0ci5tYXRjaCAvLy9eXHJcblx0XHRcdDpcclxuXHRcdFx0KH4pPyAgICAgICAgIyB0byByZWxhdGl2ZSBwYXRoXHJcblx0XHRcdChbLStdP1xcZCspPyAjIHdpZHRoXHJcblx0XHRcdChcXCEpPyAgICAgICAjIGVzY2FwZSB0ZXh0P1xyXG5cdFx0XHQoPzpcclxuXHRcdFx0XHR7IChbYS16XSspIH0gICAjIGNvbG9yXHJcblx0XHRcdFx0KT9cclxuXHRcdFx0KC4qKSAgICAgICAgIyBhY3R1YWwgdGV4dFxyXG5cdFx0XHQkLy8vXHJcblxyXG5cdG9idmlvdXNseSBkZWZpbmVkKGxNYXRjaGVzKVxyXG5cdFtfLCB0b1JlbCwgd2lkdGgsIGRvRXNjLCBjb2xvciwgcmVzdF0gOj0gbE1hdGNoZXNcclxuXHRpZiBub3QgdG9SZWwgJiYgbm90IHdpZHRoICYmIG5vdCBkb0VzYyAmJiBub3QgY29sb3JcclxuXHRcdHJldHVybiBbdW5kZWYsIHN0cl1cclxuXHRyZXR1cm4gW1xyXG5cdFx0e1xyXG5cdFx0XHR0b1JlbDogIHRvQm9vbCh0b1JlbClcclxuXHRcdFx0d2lkdGg6ICB3aWR0aCA/IHBhcnNlSW50KHdpZHRoKSA6IDBcclxuXHRcdFx0ZXNjYXBlOiB0b0Jvb2woZG9Fc2MpXHJcblx0XHRcdGNvbG9yOiAgZGVmaW5lZChjb2xvcikgJiYgaXNDb2xvcihjb2xvcikgPyBjb2xvciA6ICcnXHJcblx0XHRcdH0sXHJcblx0XHRyZXN0XHJcblx0XHRdXHJcbiJdfQ==