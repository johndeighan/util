"use strict";
// llutils.lib.civet

import {createRequire} from 'node-module'
import {sprintf} from '@std/fmt/printf'
import {relative} from '@std/path'
import {existsSync} from '@std/fs'
import {parse as parseYAML} from "@std/yaml"

import {
	undef, defined, notdefined, deepEqual, croak, assert, matches,
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
	return lLines.map((line) => rtrim(line)).filter((line) => defined(line)).join("\n")
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

export const blockWidth = (block: string): number => {

	let width = 0
	for (const line of allLinesInBlock(block)) {
		if (line.length > width) {
			width = line.length
		}
	}
	return width
}

// ---------------------------------------------------------------------------

export const blockHeight = (block: string): number => {

	return (block === '') ? 0 : block.split('\n').length
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

// ---------------------------------------------------------------------------

export const likeNum = (str: string): boolean => {

	return toBool(matches(str, /^\d+(\.\d*)?([Ee]\d+)?$/))
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGx1dGlscy5saWIudHMiLCJzb3VyY2VzIjpbImxsdXRpbHMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQW1CO0FBQ25CLEFBQUE7QUFDQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO0FBQ3pDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO0FBQ3ZDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQSxHQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQzFDLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUMvRCxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM1RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMzQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3pDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMs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QUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDekIsQUFBQSxDQUFDLE07QUFBTSxDQUFBO0FBQ1AsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3ZDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDckMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3pDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxj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QUFDLE1BQU0sQ0FBQyxNO0FBQU0sQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFTLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLENBQU0sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU07QUFDMUIsQUFBQSxDQUFDLE1BQU0sQ0FBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQyxDQUFPLENBQUMsS0FBSyxDLENBQUssQ0FBQyxDQUFsQixDO0FBQW1CLENBQUE7QUFDeEMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEUsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFBO0FBQ3RDLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQztBQUFDLENBQUE7QUFDOUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEUsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFBO0FBQ3RDLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRztBQUFHLENBQUE7QUFDOUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPO0FBQ3RFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDdEQsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFFLENB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LENBQUMsQ0FBQTtBQUNyQixBQUFBLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNkLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQztBQUFDLENBQUE7QUFDckMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFJLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ2YsQUFBQSxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ3JCLEFBQUEsRUFBRSxLQUFLLEMsQyxDQUFDLEFBQUMsTSxZLENBQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ3pCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVE7QUFDMUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQ2pELEFBQUEsQ0FBQyxHQUFHLENBQUEsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNsQixBQUFBLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUEsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNMLEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLEtBQUssQztDQUFBLEM7QUFBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNsQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUEsQUFBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JELEFBQUEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUEsQztDQUFBLENBQUEsQztBQUFBLENBQUE7QUFDdkQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3BCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZCxBQUFBLEVBQUUsV0FBVyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLO0FBQzdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsQztBQUFBLENBQUE7QUFDeEMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFB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QUFTLENBQUE7QUFDMUMsQUFBQSxHQUFRLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDNUMsQUFBQSxHLE9BQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLO0VBQUssQyxDLEMsRUFBQTtBQUNwRCxFQUFFLENBQUM7QUFDSCxBQUFBLENBQUMsTUFBTSxDQUFDLEk7QUFBSSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQyxDQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ2xFLEFBQUE7QUFDQSxBQUFBLEMsR0FBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDakMs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YSxDQUFBO0FBQzNCLEFBQUEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ3RCLEFBQUEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFBLEFBQUMsYUFBYSxDO0NBQUEsQ0FBQTtBQUMzQixBQUFBO0FBQ0EsQUFBQSxDQUFDLFNBQVMsQ0FBQSxBQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQTtBQUM1QixBQUFBLENBQXNDLE1BQXJDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxDQUFDLFFBQVE7QUFDbEQsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBSSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFJLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDcEQsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQztDQUFDLENBQUE7QUFDckIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ1QsQUFBQSxFQUFFLENBQUM7QUFDSCxBQUFBLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQ3hCLEFBQUEsR0FBRyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3RDLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDeEIsQUFBQSxHQUFHLEtBQUssQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDeEQsR0FBRyxDQUFDLENBQUM7QUFDTCxBQUFBLEVBQUUsSUFBSTtBQUNOLEFBQUEsRUFBRSxDO0FBQUMsQ0FBQTtBQUNILEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQUFBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMseUJBQXlCLENBQUMsQztBQUFBLENBQUE7QUFDdEQiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgbGx1dGlscy5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7Y3JlYXRlUmVxdWlyZX0gZnJvbSAnbm9kZS1tb2R1bGUnXHJcbmltcG9ydCB7c3ByaW50Zn0gZnJvbSAnQHN0ZC9mbXQvcHJpbnRmJ1xyXG5pbXBvcnQge3JlbGF0aXZlfSBmcm9tICdAc3RkL3BhdGgnXHJcbmltcG9ydCB7ZXhpc3RzU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtwYXJzZTogcGFyc2VZQU1MfSBmcm9tIFwiQHN0ZC95YW1sXCJcclxuXHJcbmltcG9ydCB7XHJcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGRlZXBFcXVhbCwgY3JvYWssIGFzc2VydCwgbWF0Y2hlcyxcclxuXHRjb2xvcml6ZSwgaXNDb2xvciwgdG9SZWxQYXRoLCBvYnZpb3VzbHksIHRvQm9vbCwgVEl0ZXJhdG9yLFxyXG5cdH0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtlc2N9IGZyb20gJ3VuaWNvZGUnXHJcbmltcG9ydCB7XHJcblx0aXNIYXNoLCBpc0FycmF5LCBpc05vbkVtcHR5U3RyaW5nLCBjaGFyLFxyXG5cdGlzQXJyYXlPZlN0cmluZ3MsIGlzRW1wdHksIG5vbkVtcHR5LCBpc1N0cmluZywgaXNJbnRlZ2VyLFxyXG5cdGludGVnZXIsIGhhc2gsIGhhc2hvZiwgYXJyYXksIGFycmF5b2YsIFRWb2lkRnVuYywgaXNOb25QcmltaXRpdmUsXHJcblx0ZnVuY3Rpb25EZWYsIFRTdHJpbmdNYXBwZXIsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcblxyXG5sbHV0aWxzTG9hZFRpbWU6IGludGVnZXIgOj0gRGF0ZS5ub3coKVxyXG5kZWZXaWR0aCA6PSA2NCAgICAgIyAtLS11c2VkIGluIHNlcCwgY2VudGVyZWRcclxuXHJcbmV4cG9ydCB7ZGVlcEVxdWFsfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzdGRDaGVja3MgOj0gKGhlbHBTdHI6IHN0cmluZyA9ICcnKTogdm9pZCA9PlxyXG5cclxuXHRkZWJ1Z2dlclxyXG5cdHJvb3QgOj0gRGVuby5lbnYuZ2V0KCdQUk9KRUNUX1JPT1RfRElSJylcclxuXHRhc3NlcnQgbm9uRW1wdHkocm9vdCksIFwiUGxlYXNlIHNldCBlbnYgdmFyIFBST0pFQ1RfUk9PVF9ESVJcIlxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzaW5jZUxvYWQgOj0gKGRhdGV0aW1lOiBEYXRlIHwgaW50ZWdlciA9IERhdGUubm93KCkpOiBudW1iZXIgPT5cclxuXHJcblx0aWYgKGRhdGV0aW1lIGluc3RhbmNlb2YgRGF0ZSlcclxuXHRcdHJldHVybiBkYXRldGltZS52YWx1ZU9mKCkgLSBsbHV0aWxzTG9hZFRpbWVcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gZGF0ZXRpbWUgLSBsbHV0aWxzTG9hZFRpbWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2luY2VMb2FkU3RyIDo9IChkYXRldGltZTogKERhdGUgfCBpbnRlZ2VyKT8gPSB1bmRlZikgPT5cclxuXHJcblx0cmV0dXJuIHNwcmludGYgXCIlNmRcIiwgc2luY2VMb2FkKGRhdGV0aW1lKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0cnVuY1N0ciA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyKSA9PlxyXG5cclxuXHRpZiBzdHIubGVuZ3RoIDw9IGxlblxyXG5cdFx0cmV0dXJuIHN0clxyXG5cdHJldHVybiBzdHIuc3Vic3RyaW5nKDAsIGxlbiAtIDMpICsgJy4uLidcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc3RyVG9IYXNoIDo9IChzdHI6IHN0cmluZyk6IGhhc2ggPT5cclxuXHJcblx0aWYgaXNFbXB0eShzdHIpXHJcblx0XHRyZXR1cm4ge31cclxuXHRoOiBoYXNoIDo9IHt9XHJcblx0Zm9yIHdvcmQgb2Ygc3RyLnRyaW0oKS5zcGxpdCgvXFxzKy8pXHJcblx0XHRsZXQgcmVmOiBzdHJpbmdbXSB8IG51bGxcclxuXHRcdGlmIChyZWYgPSB3b3JkLm1hdGNoKC9eKFxcISk/KFtBLVphLXpdW0EtWmEtel8wLTldKikoPzooPSkoLiopKT8kLykpXHJcblx0XHRcdGxNYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwgOj0gcmVmXHJcblx0XHRcdFtfLCBuZWcsIGlkZW50LCBlcVNpZ24sIHN0cl0gOj0gbE1hdGNoZXNcclxuXHRcdFx0aWYgaXNOb25FbXB0eVN0cmluZyhlcVNpZ24pXHJcblx0XHRcdFx0YXNzZXJ0IG5vdGRlZmluZWQobmVnKSB8fCAobmVnID09ICcnKSxcclxuXHRcdFx0XHRcdFx0XCJuZWdhdGlvbiB3aXRoIHN0cmluZyB2YWx1ZVwiXHJcblx0XHRcdFx0IyAtLS0gY2hlY2sgaWYgc3RyIGlzIGEgdmFsaWQgbnVtYmVyXHJcblx0XHRcdFx0aWYgc3RyLm1hdGNoKC9eLT9cXGQrKFxcLlxcZCspPyQvKVxyXG5cdFx0XHRcdFx0bnVtIDo9IHBhcnNlRmxvYXQgc3RyXHJcblx0XHRcdFx0XHRpZiBOdW1iZXIuaXNOYU4obnVtKVxyXG5cdFx0XHRcdFx0XHQjIC0tLSBUTyBETzogaW50ZXJwcmV0IGJhY2tzbGFzaCBlc2NhcGVzXHJcblx0XHRcdFx0XHRcdGhbaWRlbnRdID0gc3RyXHJcblx0XHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHRcdGhbaWRlbnRdID0gbnVtXHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0aFtpZGVudF0gPSBzdHJcclxuXHRcdFx0ZWxzZSBpZiBuZWdcclxuXHRcdFx0XHRoW2lkZW50XSA9IGZhbHNlXHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRoW2lkZW50XSA9IHRydWVcclxuXHRcdGVsc2VcclxuXHRcdFx0Y3JvYWsgXCJJbnZhbGlkIHdvcmQgI3t3b3JkfVwiXHJcblx0cmV0dXJuIGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbyA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogaGFzaCA9PlxyXG5cclxuXHRyZXR1cm4gc3RyVG9IYXNoIGxTdHJpbmdzWzBdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHMgOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXBsYWNlciA6PSAobWF0Y2g6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cdFx0cmV0dXJuIHNwYWNlcygzKS5yZXBlYXQgbWF0Y2gubGVuZ3RoXHJcblx0cmV0dXJuIGxTdHJpbmdzWzBdLnJlcGxhY2VBbGwgL15cXHQrL21nLCByZXBsYWNlclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzMiA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gc3BhY2VzKDIpLnJlcGVhdCBtYXRjaC5sZW5ndGhcclxuXHRyZXR1cm4gbFN0cmluZ3NbMF0ucmVwbGFjZUFsbCAvXlxcdCsvbWcsIHJlcGxhY2VyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHQgOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXBsYWNlciA6PSAobWF0Y2g6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cdFx0bGV2ZWwgOj0gTWF0aC5mbG9vciBtYXRjaC5sZW5ndGggLyAzXHJcblx0XHRyZXR1cm4gJ1xcdCcucmVwZWF0IGxldmVsXHJcblx0cmV0dXJuIGxTdHJpbmdzWzBdLnJlcGxhY2VBbGwgL15cXHgyMCsvbWcsIHJlcGxhY2VyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGtleXMgPSBPYmplY3Qua2V5c1xyXG5leHBvcnQgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGhhc0tleSA6PSAob2JqOiB1bmtub3duLCAuLi5sS2V5czogc3RyaW5nW10pID0+XHJcblxyXG5cdGlmICh0eXBlb2Ygb2JqICE9ICdvYmplY3QnKSB8fCAob2JqID09IG51bGwpXHJcblx0XHRyZXR1cm4gZmFsc2VcclxuXHRmb3Iga2V5IG9mIGxLZXlzXHJcblx0XHRpZiBub3QgKGtleSBpbiBvYmopXHJcblx0XHRcdHJldHVybiBmYWxzZVxyXG5cdHJldHVybiB0cnVlXHJcblxyXG5leHBvcnQgaGFzS2V5cyA6PSBoYXNLZXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYXJIYXNoIDo9IChoOiBoYXNoKTogdm9pZCA9PlxyXG5cclxuXHRmb3Iga2V5IG9mIGtleXMoaClcclxuXHRcdGRlbGV0ZSBoW2tleV1cclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgc2xlZXBTeW5jIDo9IChzZWM6IG51bWJlcik6IHZvaWQgPT5cclxuXHJcblx0c3RhcnQgOj0gRGF0ZS5ub3coKVxyXG5cdGVuZCA6PSBEYXRlLm5vdygpICsgMTAwMCAqIHNlY1xyXG5cdHdoaWxlIChEYXRlLm5vdygpIDwgZW5kKVxyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzcGFjZXMgOj0gKG46IG51bWJlcik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKG4gPD0gMCkgPyAnJyA6ICcgJy5yZXBlYXQobilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdGFicyA6PSAobjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAobiA8PSAwKSA/ICcnIDogJ1xcdCcucmVwZWF0KG4pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHJ0cmltIDo9IChsaW5lOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IGlzU3RyaW5nKGxpbmUpLCBcIm5vdCBhIHN0cmluZzogI3t0eXBlb2YgbGluZX1cIlxyXG5cdGxNYXRjaGVzIDo9IGxpbmUubWF0Y2ggL14oLio/KVxccyskL3NcclxuXHRyZXR1cm4gKGxNYXRjaGVzID09IG51bGwpID8gbGluZSA6IGxNYXRjaGVzWzFdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNvdW50Q2hhcnMgOj0gKHN0cjogc3RyaW5nLCBjaDogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdGxldCBjb3VudCA9IDBcclxuXHRsZXQgcG9zID0gLTFcclxuXHR3aGlsZSAocG9zID0gc3RyLmluZGV4T2YoY2gsIHBvcyArIDEpKSAhPSAtMVxyXG5cdFx0Y291bnQgKz0gMVxyXG5cdHJldHVybiBjb3VudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBibG9ja1RvQXJyYXkgOj0gKGJsb2NrOiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRpZiBpc0VtcHR5KGJsb2NrKVxyXG5cdFx0cmV0dXJuIFtdXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGJsb2NrLnNwbGl0IC9cXHI/XFxuL1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRCbG9ja1NwZWMgPSBzdHJpbmcgfCBzdHJpbmdbXVxyXG5cclxuZXhwb3J0IGlzQmxvY2tTcGVjIDo9ICh4OiB1bmtub3duKTogeCBpcyBUQmxvY2tTcGVjID0+XHJcblx0cmV0dXJuIGlzU3RyaW5nKHgpIHx8IGlzQXJyYXlPZlN0cmluZ3MoeClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9BcnJheSA6PSAoc3RyT3JBcnJheTogVEJsb2NrU3BlYyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGlmIEFycmF5LmlzQXJyYXkoc3RyT3JBcnJheSlcclxuXHRcdHJldHVybiBzdHJPckFycmF5XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGJsb2NrVG9BcnJheSBzdHJPckFycmF5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFycmF5VG9CbG9jayA6PSAobExpbmVzOiBzdHJpbmdbXSk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgaXNBcnJheShsTGluZXMpLCBcImxMaW5lcyBpcyBub3QgYW4gYXJyYXk6ICN7bExpbmVzfVwiXHJcblx0cmV0dXJuIGxMaW5lcy5tYXAoKGxpbmUpID0+IHJ0cmltKGxpbmUpKS5maWx0ZXIoKGxpbmUpID0+IGRlZmluZWQgbGluZSkuam9pbiBcIlxcblwiXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRvQmxvY2sgOj0gKHN0ck9yQXJyYXk6IFRCbG9ja1NwZWMpOiBzdHJpbmcgPT5cclxuXHJcblx0aWYgaXNTdHJpbmcoc3RyT3JBcnJheSlcclxuXHRcdHJldHVybiBzdHJPckFycmF5XHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGFycmF5VG9CbG9jayBzdHJPckFycmF5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxud3NTcGxpdCA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRuZXdzdHIgOj0gc3RyLnRyaW0oKVxyXG5cdHJldHVybiAobmV3c3RyID09ICcnKSA/IFtdIDogbmV3c3RyLnNwbGl0KC9cXHMrLylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgd29yZHMgOj0gKC4uLmxTdHJpbmdzOiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGxXb3JkcyA6PSBbXVxyXG5cdGZvciBzdHIgb2YgbFN0cmluZ3NcclxuXHRcdGZvciB3b3JkIG9mIHdzU3BsaXQoc3RyKVxyXG5cdFx0XHRsV29yZHMucHVzaCB3b3JkXHJcblx0cmV0dXJuIGxXb3Jkc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmdldE5FeHRyYSA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyKTogbnVtYmVyID0+XHJcblxyXG5cdGV4dHJhIDo9IGxlbiAtIHN0ci5sZW5ndGhcclxuXHRyZXR1cm4gaWYgKGV4dHJhID4gMCkgdGhlbiBleHRyYSBlbHNlIDBcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcnBhZCA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyLCBjaDogc3RyaW5nID0gJyAnKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2gubGVuZ3RoID09IDEpLCBcIk5vdCBhIGNoYXJcIlxyXG5cdGV4dHJhIDo9IGdldE5FeHRyYSBzdHIsIGxlblxyXG5cdHJldHVybiBzdHIgKyBjaC5yZXBlYXQoZXh0cmEpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGxwYWQgOj0gKHN0cjogc3RyaW5nLCBsZW46IG51bWJlciwgY2g6IHN0cmluZyA9ICcgJyk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgKGNoLmxlbmd0aCA9PSAxKSwgXCJOb3QgYSBjaGFyXCJcclxuXHRleHRyYSA6PSBnZXRORXh0cmEgc3RyLCBsZW5cclxuXHRyZXR1cm4gY2gucmVwZWF0KGV4dHJhKSArIHN0clxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0eXBlIFRBbGlnbm1lbnQgPSAnbCcgfCAnYycgfCAncicgfCAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCdcclxuXHJcbmV4cG9ydCBpc0FsaWdubWVudCA6PSAoeDogdW5rbm93bik6IHggaXMgVEFsaWdubWVudCA9PlxyXG5cdHJldHVybiAoKHR5cGVvZiB4ID09ICdzdHJpbmcnKSAmJiBbJ2wnLCAnYycsICdyJywgJ2xlZnQnLCAnY2VudGVyJywgJ3JpZ2h0J10uaW5jbHVkZXMoeCkpXHJcblxyXG5leHBvcnQgYWxpZ25TdHJpbmcgOj0gZnVuY3Rpb24oXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHdpZHRoOiBudW1iZXIsXHJcblx0XHRhbGlnbjogVEFsaWdubWVudFxyXG5cdFx0KTogc3RyaW5nXHJcblxyXG5cdHN3aXRjaCBhbGlnblxyXG5cdFx0Y2FzZSAnbGVmdCc6XHJcblx0XHRjYXNlICdsJzpcclxuXHRcdFx0cmV0dXJuIHJwYWQgc3RyLCB3aWR0aFxyXG5cdFx0Y2FzZSAnY2VudGVyJzpcclxuXHRcdGNhc2UgJ2MnOlxyXG5cdFx0XHRyZXR1cm4gc2VwICcgJywgc3RyLCB3aWR0aFxyXG5cdFx0Y2FzZSAncmlnaHQnOlxyXG5cdFx0Y2FzZSAncic6XHJcblx0XHRcdHJldHVybiBscGFkIHN0ciwgd2lkdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgenBhZCA6PSAobjogbnVtYmVyLCBsZW46IG51bWJlcik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gbHBhZCBuLnRvU3RyaW5nKCksIGxlbiwgJzAnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEdFTkVSQVRPUlxyXG5cclxuZXhwb3J0IGFsbE1hdGNoZXMgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRyZTogUmVnRXhwXHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nW10+IC0+XHJcblxyXG5cdCMgLS0tIEVuc3VyZSB0aGUgcmVnZXggaGFzIHRoZSBnbG9iYWwgZmxhZyAoZykgc2V0XHJcblx0bmV3cmUgOj0gbmV3IFJlZ0V4cChyZSwgcmUuZmxhZ3MgKyAocmUuZmxhZ3MuaW5jbHVkZXMoJ2cnKSA/ICcnIDogJ2cnKSlcclxuXHRsZXQgbE1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGxcclxuXHR3aGlsZSBkZWZpbmVkKGxNYXRjaGVzID0gbmV3cmUuZXhlYyhzdHIpKVxyXG5cdFx0eWllbGQgbE1hdGNoZXNcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgcmVxdWlyZSA6PSBjcmVhdGVSZXF1aXJlIGltcG9ydC5tZXRhLnVybFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRMaW5lQW5kQ29sdW1uIDo9ICh0ZXh0OiBzdHJpbmcsIHBvczogbnVtYmVyKSA9PlxyXG5cclxuXHQjIC0tLSBHZXQgbGluZSBudW1iZXIgYnkgY291bnRpbmcgbnVtYmVyIG9mIFxcbiBjaGFyc1xyXG5cdCMgICAgICAgIGJlZm9yZSB0aGUgY3VycmVudCBwb3NpdGlvblxyXG5cdCMgICAgIEdldCBjb2x1bW4gbnVtYmVyIGJ5IGZpbmRpbmcgY2xvc2VzdCBwcmV2aW91cyBwb3NpdGlvblxyXG5cdCMgICAgICAgIG9mIGEgXFxuIGFuZCBjb21wdXRpbmcgdGhlIGRpZmZlcmVuY2VcclxuXHRzaG9ydFN0ciA6PSB0ZXh0LnN1YnN0cmluZyAwLCBwb3NcclxuXHRyZXR1cm4gW1xyXG5cdFx0Y291bnRDaGFycyhzaG9ydFN0ciwgXCJcXG5cIikgKyAxXHJcblx0XHRwb3MgLSBzaG9ydFN0ci5sYXN0SW5kZXhPZignXFxuJylcclxuXHRdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJsb2NrV2lkdGggOj0gKGJsb2NrOiBzdHJpbmcpOiBudW1iZXIgPT5cclxuXHJcblx0bGV0IHdpZHRoID0gMFxyXG5cdGZvciBsaW5lIG9mIGFsbExpbmVzSW5CbG9jayhibG9jaylcclxuXHRcdGlmIChsaW5lLmxlbmd0aCA+IHdpZHRoKVxyXG5cdFx0XHR3aWR0aCA9IGxpbmUubGVuZ3RoXHJcblx0cmV0dXJuIHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJsb2NrSGVpZ2h0IDo9IChibG9jazogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdHJldHVybiAoYmxvY2sgPT0gJycpID8gMCA6IGJsb2NrLnNwbGl0KCdcXG4nKS5sZW5ndGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0T3B0aW9ucyA6PSA8VCBleHRlbmRzIGhhc2g+KFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0aERlZmF1bHRzOiBUXHJcblx0XHQpOiBUID0+XHJcblxyXG5cdHJldHVybiB7IC4uLmhEZWZhdWx0cywgLi4uaE9wdGlvbnMgfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzZXAgOj0gKFxyXG5cdFx0Y2hhcjogc3RyaW5nID0gJy0nLFxyXG5cdFx0bGFiZWw6IHN0cmluZz8gPSB1bmRlZixcclxuXHRcdHdpZHRoOiBudW1iZXIgPSBkZWZXaWR0aFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2hhci5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhcjogI3tjaGFyfVwiXHJcblx0aWYgZGVmaW5lZChsYWJlbClcclxuXHRcdHJldHVybiBjZW50ZXJlZCBsYWJlbCwge2NoYXIsIHdpZHRofVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBjaGFyLnJlcGVhdCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJpZnkgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRuU3BhY2VzOiBudW1iZXIgPSAzXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsIC9eKFxceDIwKykvLCAobWF0Y2gsIHNwYWNlcykgPT5cclxuXHRcdHJldHVybiAnXFx0Jy5yZXBlYXQgTWF0aC5mbG9vciBzcGFjZXMubGVuZ3RoIC8gblNwYWNlc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB1bnRhYmlmeSA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgPSAnICAgJ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBzdHIucmVwbGFjZUFsbCAnXFx0JywgcmVwbGFjZW1lbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xlYW51cCA6PSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHJ0cmltKHN0cikucmVwbGFjZUFsbCgnXFxyJywgJycpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFsbExpbmVzSW5CbG9jayA6PSAoXHJcblx0XHRibG9jazogc3RyaW5nXHJcblx0XHQpOiBUSXRlcmF0b3I8c3RyaW5nPiAtPlxyXG5cclxuXHRsZXQgc3RhcnQgPSAwXHJcblx0bGV0IGVuZCA9IGJsb2NrLmluZGV4T2YoJ1xcbicpXHJcblx0d2hpbGUgKGVuZCAhPSAtMSlcclxuXHRcdHlpZWxkIGNsZWFudXAoYmxvY2suc3Vic3RyaW5nKHN0YXJ0LCBlbmQpKVxyXG5cdFx0c3RhcnQgPSBlbmQgKyAxXHJcblx0XHRlbmQgPSBibG9jay5pbmRleE9mKCdcXG4nLCBzdGFydClcclxuXHRpZiAoc3RhcnQgPCBibG9jay5sZW5ndGgpXHJcblx0XHR5aWVsZCBjbGVhbnVwKGJsb2NrLnN1YnN0cmluZyhzdGFydCkpXHJcblx0cmV0dXJuXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSB2YWxpZCBvcHRpb25zOlxyXG4jICAgICAgICBjaGFyIC0gY2hhciB0byB1c2Ugb24gbGVmdCBhbmQgcmlnaHRcclxuIyAgICAgICAgd2lkdGggLSBmdWxsIHdpZHRoXHJcbiMgICAgICAgIG51bUJ1ZmZlciAtIG51bSBzcGFjZXMgYXJvdW5kIGxhYmVsIHdoZW4gY2hhciA8PiAnICdcclxuIyAgICAgICAgY29sb3IgLSBjb2xvciBvZiBlbnRpcmUgc3RyaW5nXHJcblxyXG5leHBvcnQgY2VudGVyZWQgOj0gKFxyXG5cdFx0bGFiZWw6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2hhcjogY2hhclxyXG5cdFx0d2lkdGg6IG51bWJlclxyXG5cdFx0bnVtQnVmZmVyOiBudW1iZXJcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHR9XHJcblx0e2NoYXIsIHdpZHRoLCBudW1CdWZmZXIsIGNvbG9yfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNoYXI6ICcgJ1xyXG5cdFx0d2lkdGg6IGRlZldpZHRoXHJcblx0XHRudW1CdWZmZXI6IDJcclxuXHRcdGNvbG9yOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHR0b3RTcGFjZXMgOj0gKHdpZHRoID49IGxhYmVsLmxlbmd0aCkgPyB3aWR0aCAtIGxhYmVsLmxlbmd0aCA6IDBcclxuXHRudW1MZWZ0IDo9IE1hdGguZmxvb3IgdG90U3BhY2VzIC8gMlxyXG5cdG51bVJpZ2h0IDo9IHRvdFNwYWNlcyAtIG51bUxlZnRcclxuXHR0ZXh0IDo9IChcclxuXHRcdGlmIChjaGFyID09ICcgJylcclxuXHRcdFx0JyAnLnJlcGVhdChudW1MZWZ0KSArIGNvbG9yaXplKGxhYmVsLCBjb2xvcikgKyAnICcucmVwZWF0KG51bVJpZ2h0KVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRidWYgOj0gJyAnLnJlcGVhdCBudW1CdWZmZXJcclxuXHRcdFx0bGVmdCA6PSBjaGFyLnJlcGVhdCBudW1MZWZ0IC0gbnVtQnVmZmVyXHJcblx0XHRcdHJpZ2h0IDo9IGNoYXIucmVwZWF0IG51bVJpZ2h0IC0gbnVtQnVmZmVyXHJcblx0XHRcdGxlZnQgKyBidWYgKyBjb2xvcml6ZShsYWJlbCwgY29sb3IpICsgYnVmICsgcmlnaHRcclxuXHRcdClcclxuXHRyZXR1cm4gdGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbWRUaXRsZSA6PSAodGl0bGU6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gY2VudGVyZWQgdGl0bGUsIHtjaGFyOiAnPScsIGNvbG9yOiAnY3lhbid9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENTdHJpbmdTZXRNYXA8VCA9IHN0cmluZz4gZXh0ZW5kcyBNYXA8VCwgU2V0PHN0cmluZz4+XHJcblxyXG5cdGFkZChrZXk6IFQsIHZhbHVlOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdGFTZXQuYWRkIHZhbHVlXHJcblx0XHRlbHNlXHJcblx0XHRcdG5ld1NldCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdFx0XHRuZXdTZXQuYWRkIHZhbHVlXHJcblx0XHRcdHN1cGVyLnNldCBrZXksIG5ld1NldFxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRoYXNLZXkoa2V5OiBUKTogYm9vbGVhblxyXG5cclxuXHRcdHJldHVybiBAaGFzIGtleVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0aGFzVmFsdWUodmFsOiBzdHJpbmcpOiBib29sZWFuXHJcblxyXG5cdFx0Zm9yIGtleSBvZiBAYWxsS2V5cygpXHJcblx0XHRcdHNldCA6PSBAZ2V0IGtleVxyXG5cdFx0XHRpZiBkZWZpbmVkKHNldCkgJiYgc2V0Lmhhcyh2YWwpXHJcblx0XHRcdFx0cmV0dXJuIHRydWVcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0KmFsbEtleXMoKTogVEl0ZXJhdG9yPFQ+XHJcblxyXG5cdFx0eWllbGQgKnN1cGVyLmtleXMoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHQqYWxsVmFsdWVzKGtleTogVCk6IFRJdGVyYXRvcjxzdHJpbmc+XHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdHlpZWxkICphU2V0LnZhbHVlcygpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFzU3RyaW5nKCk6IHN0cmluZ1xyXG5cclxuXHRcdHJlc3VsdHMxIDo9IFtdXHJcblx0XHRmb3Iga2V5IG9mIEBhbGxLZXlzKClcclxuXHRcdFx0cmVzdWx0czEucHVzaCBcIiN7a2V5fTogI3tBcnJheS5mcm9tKEBhbGxWYWx1ZXMga2V5KS5qb2luKCcgJyl9XCJcclxuXHRcdGxMaW5lcyA6PSByZXN1bHRzMVxyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luICdcXG4nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzVEFNTCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgaXNTdHJpbmcoeClcclxuXHRcdHRyeVxyXG5cdFx0XHRwYXJzZVlBTUwodW50YWJpZnkoeCkpXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0XHRjYXRjaCBlcnJcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZyb21UQU1MIDo9IChibG9jazogc3RyaW5nKTogdW5rbm93biA9PlxyXG5cclxuXHRyZXR1cm4gcGFyc2VZQU1MKHVudGFiaWZ5KGJsb2NrKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgZlwibmFtZSA9ICN7J0pvaG4nfTotMTBcIiAgICA9PiBcIm5hbWUgPSBKb2huICAgICAgXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OjEwXCIgICAgID0+IFwibmFtZSA9ICAgICAgIEpvaG5cIlxyXG4jICAgIGZcIm5hbWUgPSAjeydhXFx0Yid9IVwiICAgICAgID0+IFwibmFtZSA9IGHihpJiXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OntibHVlfVwiID0+IFwibmFtZSA9IEpvaG5cIiAoJ0pvaG4nIGluIGJsdWUgY29sb3IpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIE51bWJlciBvZiBzdHJpbmdzIGlzIGFsd2F5cyAxIGdyZWF0ZXIgdGhhbiB0aGUgbnVtYmVyIG9mIHZhbHVlc1xyXG5cclxuZXhwb3J0IGYgOj0gKFxyXG5cdFx0bFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5XHJcblx0XHQuLi5sVmFsdWVzOiB1bmtub3duW11cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHQjIC0tLSBTcGxpdCB0aGUgZmlyc3Qgc3RyaW5nXHJcblx0W21haW5GbXQsIGZpcnN0U3RyXSA6PSBmc3BsaXQgbFN0cmluZ3NbMF1cclxuXHJcblx0IyAtLS0gZm9ybWF0IGVhY2ggb2YgdGhlIHZhbHVlcywgY29uY2F0ZW5hdGluZyBhcyB3ZSBnb1xyXG5cdGJpZ1N0ciA6PSBNQVAgbFZhbHVlcywgZmlyc3RTdHIsICh2YWwsIGFjYywgaSkgPT5cclxuXHRcdFtmbXQsIG5leHRTdHJdIDo9IGZzcGxpdChsU3RyaW5nc1tpKzFdKVxyXG5cdFx0cmV0dXJuIGFjYyArIGZvcm1hdFZhbCh2YWwsIGZtdCkgKyBuZXh0U3RyXHJcblx0cmV0dXJuIGZvcm1hdFZhbChiaWdTdHIsIG1haW5GbXQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBURm9ybWF0ID0ge1xyXG5cdHRvUmVsOiBib29sZWFuXHJcblx0ZXNjYXBlOiBib29sZWFuXHJcblx0d2lkdGg6IG51bWJlclxyXG5cdGNvbG9yOiBzdHJpbmdcclxuXHR9XHJcblxyXG5leHBvcnQgZm9ybWF0VmFsIDo9IChcclxuXHRcdHZhbDogdW5rbm93blxyXG5cdFx0Zm10OiBURm9ybWF0P1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHN0cjEgOj0gKFxyXG5cdFx0ICAodmFsID09IHVuZGVmaW5lZCkgPyAndW5kZWYnXHJcblx0XHQ6ICh2YWwgPT0gbnVsbCkgICAgICA/ICdudWxsJ1xyXG5cdFx0OiBTdHJpbmcodmFsKVxyXG5cdFx0KVxyXG5cdGlmIG5vdGRlZmluZWQoZm10KVxyXG5cdFx0cmV0dXJuIHN0cjFcclxuXHR7dG9SZWwsIGVzY2FwZSwgd2lkdGgsIGNvbG9yfSA6PSBmbXRcclxuXHRzdHIyIDo9IHRvUmVsID8gdG9SZWxQYXRoKHN0cjEpIDogc3RyMVxyXG5cdHN0cjMgOj0gZXNjYXBlID8gZXNjKHN0cjIpIDogc3RyMlxyXG5cdHN0cjQgOj0gKFxyXG5cdFx0ICAod2lkdGggPiAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIHdpZHRoLCAncmlnaHQnKVxyXG5cdFx0OiAod2lkdGggPCAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIC13aWR0aCwgJ2xlZnQnKVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICBzdHIzXHJcblx0XHQpXHJcblx0cmV0dXJuIGlzQ29sb3IoY29sb3IpID8gY29sb3JpemUoc3RyNCwgY29sb3IpIDogc3RyNFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmc3BsaXQgOj0gKFxyXG5cdHN0cjogc3RyaW5nXHJcblx0KTogWyhURm9ybWF0PyksIHN0cmluZ10gPT5cclxuXHJcblx0aWYgbm90IHN0ci5zdGFydHNXaXRoKCc6JylcclxuXHRcdHJldHVybiBbdW5kZWYsIHN0cl1cclxuXHRsTWF0Y2hlcyA6PSBzdHIubWF0Y2ggLy8vXlxyXG5cdFx0XHQ6XHJcblx0XHRcdCh+KT8gICAgICAgICMgdG8gcmVsYXRpdmUgcGF0aFxyXG5cdFx0XHQoWy0rXT9cXGQrKT8gIyB3aWR0aFxyXG5cdFx0XHQoXFwhKT8gICAgICAgIyBlc2NhcGUgdGV4dD9cclxuXHRcdFx0KD86XHJcblx0XHRcdFx0eyAoW2Etel0rKSB9ICAgIyBjb2xvclxyXG5cdFx0XHRcdCk/XHJcblx0XHRcdCguKikgICAgICAgICMgYWN0dWFsIHRleHRcclxuXHRcdFx0JC8vL3NcclxuXHJcblx0aWYgbm90ZGVmaW5lZChsTWF0Y2hlcylcclxuXHRcdGNvbnNvbGUubG9nIFwiQkFEIEJBRCBCQURcIlxyXG5cdFx0Y29uc29sZS5sb2cgZXNjKHN0cilcclxuXHRcdGNvbnNvbGUubG9nIFwiQkFEIEJBRCBCQURcIlxyXG5cclxuXHRvYnZpb3VzbHkgZGVmaW5lZChsTWF0Y2hlcylcclxuXHRbXywgdG9SZWwsIHdpZHRoLCBkb0VzYywgY29sb3IsIHJlc3RdIDo9IGxNYXRjaGVzXHJcblx0aWYgbm90IHRvUmVsICYmIG5vdCB3aWR0aCAmJiBub3QgZG9Fc2MgJiYgbm90IGNvbG9yXHJcblx0XHRyZXR1cm4gW3VuZGVmLCBzdHJdXHJcblx0cmV0dXJuIFtcclxuXHRcdHtcclxuXHRcdFx0dG9SZWw6ICB0b0Jvb2wodG9SZWwpXHJcblx0XHRcdHdpZHRoOiAgd2lkdGggPyBwYXJzZUludCh3aWR0aCkgOiAwXHJcblx0XHRcdGVzY2FwZTogdG9Cb29sKGRvRXNjKVxyXG5cdFx0XHRjb2xvcjogIGRlZmluZWQoY29sb3IpICYmIGlzQ29sb3IoY29sb3IpID8gY29sb3IgOiAnJ1xyXG5cdFx0XHR9LFxyXG5cdFx0cmVzdFxyXG5cdFx0XVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBsaWtlTnVtIDo9IChzdHI6IHN0cmluZyk6IGJvb2xlYW4gPT5cclxuXHJcblx0cmV0dXJuIHRvQm9vbCBtYXRjaGVzKHN0ciwgL15cXGQrKFxcLlxcZCopPyhbRWVdXFxkKyk/JC8pXHJcbiJdfQ==