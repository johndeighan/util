"use strict";
// llutils.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {createRequire} from 'node-module'
import {parse as parseYAML} from "@std/yaml"

import {LOG, ERR} from 'logger'
import {
	undef, defined, notdefined, deepEqual, croak, assert, matches,
	colorize, isColor, obviously, toBool, TIterator,
	getErrStr, allLinesIn, decolorize,
	} from 'base'
import {toRelPath} from 'llfs'
import {esc, uni} from 'unicode'
import {
	isHash, isArray, isNonEmptyString, char,
	isArrayOfStrings, isEmpty, nonEmpty, isString, isInteger,
	integer, hash, hashof, array, arrayof, TVoidFunc,
	functionDef, TStringMapper, isAsyncFunction,
	} from 'datatypes'
import {MAP} from 'mapper'

const defWidth = 64     // ---used in sep, centered

// ---------------------------------------------------------------------------

export var CWS = (str: string): string => {

	return str.trim().replace(/\s+/sg, ' ')
}

// ---------------------------------------------------------------------------

export const truncStr = (str: string, len: number) => {

	if (str.length <= len) {
		return str
	}
	return str.substring(0, len-1) + uni.ellipsis
}

// ---------------------------------------------------------------------------

export const abbrevStr = (
		str: string,
		maxlen: number = 31
		): string => {

	const escaped = esc(str)
	const len = escaped.length
	if (len <= maxlen) {
		return escaped
	}
	const seglen = Math.trunc((maxlen-1) / 2)
	return (
		  escaped.substring(0, seglen)
		+ uni.ellipsis
		+ escaped.substring(len - seglen)
		)
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

export const s4 = (lStrings: TemplateStringsArray): string => {

	const replacer = (match: string): string => {
		return spaces(4).repeat(match.length)
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

export const hasKey = (
		obj: unknown,
		...lKeys: string[]
		) => {

	assert((typeof obj === 'object'), "Not an object")
	assert((obj !== null), "object is null")
	for (const key of lKeys) {
		if (!(key in obj)) {
			return false
		}
	}
	return true
}

export const hasKeys = hasKey

// ---------------------------------------------------------------------------

export const spaces = (n: number): string => {

	return (n <= 0) ? '' : ' '.repeat(n)
}

// ---------------------------------------------------------------------------

export const tabs = (n: number): string => {

	return (n <= 0) ? '' : '\t'.repeat(n)
}

// ---------------------------------------------------------------------------

export const dashes = (n: number): string => {

	return (n <= 0) ? '' : '-'.repeat(n)
}

// ---------------------------------------------------------------------------

export const ltrim = (line: string): string => {

	return line.replace(/^\s+/, '')
}

// ---------------------------------------------------------------------------

export const rtrim = (line: string): string => {

	return line.replace(/\s+$/, '')
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

const getNExtra = (
		str: string,
		len: number
		): number => {

	const extra = len - decolorize(str).length
	return (extra > 0) ? extra : 0
}

// ---------------------------------------------------------------------------

export const rpad = (
		str: string,
		len: number,
		ch: string = ' '
		): string => {

	assert((ch.length === 1), "Not a char")
	const nExtra = getNExtra(str, len)
	return str + ch.repeat(nExtra)
}

// ---------------------------------------------------------------------------

export const lpad = (
		str: string,
		len: number,
		ch: string = ' '
		): string => {

	assert((ch.length === 1), "Not a char")
	const nExtra = getNExtra(str, len)
	return ch.repeat(nExtra) + str
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
	for (const line of allLinesIn(block)) {
		if (decolorize(line).length > width) {
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

	return str.replaceAll(/^(\x20+)/g, (match, spaces) => {
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

	const labelLen = decolorize(label).length
	if (labelLen >= width) {
		return label
	}

	const totSpaces = (width >= label.length) ? width - labelLen : 0
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
//    f"name = #{'John'}:{cyan}" => "name = John" ('John' in cyan color)
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

// ---------------------------------------------------------------------------

export const sortAnyArray = <T,>(
		lItems: T[]
		): T[] => {

	return lItems.toSorted()
}

// ---------------------------------------------------------------------------
// --- if passed an async function, will return a promise
//     in that case, you must use await

export const EXEC = async (
		func: () => void
		): AutoPromise<void> => {

	debugger
	try {
		if (isAsyncFunction(func)) {
			await func()
		}
		else {
			func()
		}
	}
	catch (err) {
		ERR(`in EXEC(): ${getErrStr(err)}`)
	}
	return
}

// ---------------------------------------------------------------------------

export const SKIP = (func: () => void): void => {

	return
}

// sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGx1dGlscy5saWIudHMiLCJzb3VyY2VzIjpbImxsdXRpbHMubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQW1CO0FBQ25CLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYTtBQUN6QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFBLEdBQUUsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtBQUMvQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUMvRCxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUNqRCxDQUFDLFNBQVMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUNuQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUM5QixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDaEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN6QyxDQUFDLGdCQUFnQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQzFELENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQ2xELENBQUMsV0FBVyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDO0FBQzdDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQ25CLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtBQUMxQixBQUFBO0FBQ0EsQUFBQSxBQUFRLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxFQUFFLEtBQUssMkJBQTBCO0FBQzdDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxJQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNyQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDO0FBQUMsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDaEQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEVBQUUsTUFBTSxDQUFDLEc7Q0FBRyxDQUFBO0FBQ1osQUFBQSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFE7QUFBUSxDQUFBO0FBQzlDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVSxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNyQixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2QsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDcEIsQUFBQSxDQUFJLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTTtBQUN0QixBQUFBLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUNuQixBQUFBLEVBQUUsTUFBTSxDQUFDLE87Q0FBTyxDQUFBO0FBQ2hCLEFBQUEsQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLEFBQUEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNULEFBQUEsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNoQyxBQUFBLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRO0FBQ2hCLEFBQUEsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxH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QUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3JDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFPLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3ZDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQztBQUFDLENBQUE7QUFDckMsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFNLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3pDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUEsQUFBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEM7QUFBQSxDQUFBO0FBQy9CLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN6QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFBLEFBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDO0FBQUEsQ0FBQTtBQUMvQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDekQsQUFBQTtBQUNBLEFBQUEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2QsQUFBQSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNiLEFBQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDLEdBQUcsQyxDQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM3QyxBQUFBLEVBQUUsS0FBSyxDLEVBQUcsQ0FBQyxDO0NBQUMsQ0FBQTtBQUNaLEFBQUEsQ0FBQyxNQUFNLENBQUMsSztBQUFLLENBQUE7QUFDYixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ25ELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDbEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLEM7Q0FBQyxDQUFBO0FBQ1gsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFBLEFBQUMsT0FBTyxDO0NBQUEsQztBQUFBLENBQUE7QUFDNUIsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDMUMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVksTUFBWCxXQUFXLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN0RCxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDO0FBQUMsQ0FBQTtBQUMxQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVEsTUFBUCxPQUFPLENBQUMsQ0FBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3ZELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzdCLEFBQUEsRUFBRSxNQUFNLENBQUMsVTtDQUFVLENBQUE7QUFDbkIsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUEsQUFBQyxVQUFVLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNoQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQWEsTUFBWixZQUFZLENBQUMsQ0FBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFBO0FBQzVELEFBQUEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFBLEFBQUMsSUFBSSxDQUFBLENBQUMsQ0FBQyxJQUFJLENBQUEsQUFBQyxJQUFJLEM7QUFBQSxDQUFBO0FBQ2xGLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNyRCxBQUFBO0FBQ0EsQUFBQSxDQUFDLEdBQUcsQ0FBQSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3hCLEFBQUEsRUFBRSxNQUFNLENBQUMsVTtDQUFVLENBQUE7QUFDbkIsQUFBQSxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ0wsQUFBQSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUEsQUFBQyxVQUFVLEM7Q0FBQSxDO0FBQUEsQ0FBQTtBQUNoQyxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBUyxNQUFULFNBQVMsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNkLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDYixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTTtBQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBTSxNQUFMLEtBQUssQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTTtBQUN0QyxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDO0FBQUMsQ0FBQTtBQUMvQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDaEIsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtBQUNiLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDYixBQUFBLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHO0FBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFBO0FBQ3RDLEFBQUEsQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFBO0FBQzdCLEFBQUEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQztBQUFDLENBQUE7QUFDL0IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FB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QUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQy9DLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNkLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM5QixBQUFBLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUE7QUFDdEMsQUFBQSxHQUFHLEtBQUssQyxDQUFFLENBQUMsSUFBSSxDQUFDLE07RUFBTSxDO0NBQUEsQ0FBQTtBQUN0QixBQUFBLENBQUMsTUFBTSxDQUFDLEs7QUFBSyxDQUFBO0FBQ2IsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hELEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE07QUFBTSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEksQ0FBSSxDQUFDLENBQUM7QUFDdEMsQUFBQSxF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QUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDMUMsQUFBQSxHQUFRLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDNUMsQUFBQSxHLE9BQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLO0VBQUssQyxDLEMsRUFBQTtBQUNwRCxFQUFFLENBQUM7QUFDSCxBQUFBLENBQUMsTUFBTSxDQUFDLEk7QUFBSSxDQUFBO0FBQ1osQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzdDLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEM7QUFBQSxDQUFBO0FBQ2xELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQyxDQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ2xFLEFBQUE7QUFDQSxBQUFBLEMsR0FBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxD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QixBQUFBLENBQXNDLE1BQXJDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxDQUFDLFFBQVE7QUFDbEQsQUFBQSxDQUFDLEdBQUcsQ0FBQSxDQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBSSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFJLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDcEQsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQztDQUFDLENBQUE7QUFDckIsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ1QsQUFBQSxFQUFFLENBQUM7QUFDSCxBQUFBLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQ3hCLEFBQUEsR0FBRyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3RDLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDeEIsQUFBQSxHQUFHLEtBQUssQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDeEQsR0FBRyxDQUFDLENBQUM7QUFDTCxBQUFBLEVBQUUsSUFBSTtBQUNOLEFBQUEsRUFBRSxDO0FBQUMsQ0FBQTtBQUNILEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQUFBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMseUJBQXlCLENBQUMsQztBQUFBLENBQUE7QUFDdEQsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFhLE1BQVosWUFBWSxDQUFDLENBQUUsQ0FBQyxDQUFDLEMsQ0FBQyxDQUFDLENBQUM7QUFDM0IsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDO0FBQUMsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSx5REFBd0Q7QUFDeEQsQUFBQSx1Q0FBc0M7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDLE1BQUMsQ0FBQztBQUNoQixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUk7QUFDbEIsRUFBRSxDQUFDLEMsQyxXLENBQUMsQUFBQyxJLENBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLENBQUMsUUFBUTtBQUNULEFBQUEsQ0FBQyxHQUFHLENBQUEsQ0FBQTtBQUNKLEFBQUEsRUFBRSxHQUFHLENBQUEsZUFBZSxDQUFBLEFBQUMsSUFBSSxDQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ3pCLEFBQUEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEM7RUFBQyxDQUFBO0FBQ2YsQUFBQSxFQUFFLElBQUksQ0FBQSxDQUFBO0FBQ04sQUFBQSxHQUFHLElBQUksQ0FBQyxDO0VBQUMsQztDQUFBLENBQUE7QUFDVCxBQUFBLENBQUMsS0FBSyxDQUFDLENBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxHQUFHLENBQUEsQUFBQyxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwQyxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUssTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQzFDLEFBQUE7QUFDQSxBQUFBLENBQUMsTTtBQUFNLENBQUE7QUFDUCIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyBsbHV0aWxzLmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtjcmVhdGVSZXF1aXJlfSBmcm9tICdub2RlLW1vZHVsZSdcclxuaW1wb3J0IHtwYXJzZTogcGFyc2VZQU1MfSBmcm9tIFwiQHN0ZC95YW1sXCJcclxuXHJcbmltcG9ydCB7TE9HLCBFUlJ9IGZyb20gJ2xvZ2dlcidcclxuaW1wb3J0IHtcclxuXHR1bmRlZiwgZGVmaW5lZCwgbm90ZGVmaW5lZCwgZGVlcEVxdWFsLCBjcm9haywgYXNzZXJ0LCBtYXRjaGVzLFxyXG5cdGNvbG9yaXplLCBpc0NvbG9yLCBvYnZpb3VzbHksIHRvQm9vbCwgVEl0ZXJhdG9yLFxyXG5cdGdldEVyclN0ciwgYWxsTGluZXNJbiwgZGVjb2xvcml6ZSxcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7dG9SZWxQYXRofSBmcm9tICdsbGZzJ1xyXG5pbXBvcnQge2VzYywgdW5pfSBmcm9tICd1bmljb2RlJ1xyXG5pbXBvcnQge1xyXG5cdGlzSGFzaCwgaXNBcnJheSwgaXNOb25FbXB0eVN0cmluZywgY2hhcixcclxuXHRpc0FycmF5T2ZTdHJpbmdzLCBpc0VtcHR5LCBub25FbXB0eSwgaXNTdHJpbmcsIGlzSW50ZWdlcixcclxuXHRpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIGFycmF5LCBhcnJheW9mLCBUVm9pZEZ1bmMsXHJcblx0ZnVuY3Rpb25EZWYsIFRTdHJpbmdNYXBwZXIsIGlzQXN5bmNGdW5jdGlvbixcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuXHJcbmRlZldpZHRoIDo9IDY0ICAgICAjIC0tLXVzZWQgaW4gc2VwLCBjZW50ZXJlZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBDV1MgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci50cmltKCkucmVwbGFjZSgvXFxzKy9zZywgJyAnKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0cnVuY1N0ciA6PSAoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyKSA9PlxyXG5cclxuXHRpZiBzdHIubGVuZ3RoIDw9IGxlblxyXG5cdFx0cmV0dXJuIHN0clxyXG5cdHJldHVybiBzdHIuc3Vic3RyaW5nKDAsIGxlbi0xKSArIHVuaS5lbGxpcHNpc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhYmJyZXZTdHIgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRtYXhsZW46IG51bWJlciA9IDMxXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0ZXNjYXBlZCA6PSBlc2Moc3RyKVxyXG5cdGxlbiA6PSBlc2NhcGVkLmxlbmd0aFxyXG5cdGlmIChsZW4gPD0gbWF4bGVuKVxyXG5cdFx0cmV0dXJuIGVzY2FwZWRcclxuXHRzZWdsZW4gOj0gTWF0aC50cnVuYygobWF4bGVuLTEpIC8gMilcclxuXHRyZXR1cm4gKFxyXG5cdFx0ICBlc2NhcGVkLnN1YnN0cmluZygwLCBzZWdsZW4pXHJcblx0XHQrIHVuaS5lbGxpcHNpc1xyXG5cdFx0KyBlc2NhcGVkLnN1YnN0cmluZyhsZW4gLSBzZWdsZW4pXHJcblx0XHQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHN0clRvSGFzaCA6PSAoc3RyOiBzdHJpbmcpOiBoYXNoID0+XHJcblxyXG5cdGlmIGlzRW1wdHkoc3RyKVxyXG5cdFx0cmV0dXJuIHt9XHJcblx0aDogaGFzaCA6PSB7fVxyXG5cdGZvciB3b3JkIG9mIHN0ci50cmltKCkuc3BsaXQoL1xccysvKVxyXG5cdFx0bGV0IHJlZjogc3RyaW5nW10gfCBudWxsXHJcblx0XHRpZiAocmVmID0gd29yZC5tYXRjaCgvXihcXCEpPyhbQS1aYS16XVtBLVphLXpfMC05XSopKD86KD0pKC4qKSk/JC8pKVxyXG5cdFx0XHRsTWF0Y2hlczogc3RyaW5nW10gfCBudWxsIDo9IHJlZlxyXG5cdFx0XHRbXywgbmVnLCBpZGVudCwgZXFTaWduLCBzdHJdIDo9IGxNYXRjaGVzXHJcblx0XHRcdGlmIGlzTm9uRW1wdHlTdHJpbmcoZXFTaWduKVxyXG5cdFx0XHRcdGFzc2VydCBub3RkZWZpbmVkKG5lZykgfHwgKG5lZyA9PSAnJyksXHJcblx0XHRcdFx0XHRcdFwibmVnYXRpb24gd2l0aCBzdHJpbmcgdmFsdWVcIlxyXG5cdFx0XHRcdCMgLS0tIGNoZWNrIGlmIHN0ciBpcyBhIHZhbGlkIG51bWJlclxyXG5cdFx0XHRcdGlmIHN0ci5tYXRjaCgvXi0/XFxkKyhcXC5cXGQrKT8kLylcclxuXHRcdFx0XHRcdG51bSA6PSBwYXJzZUZsb2F0IHN0clxyXG5cdFx0XHRcdFx0aWYgTnVtYmVyLmlzTmFOKG51bSlcclxuXHRcdFx0XHRcdFx0IyAtLS0gVE8gRE86IGludGVycHJldCBiYWNrc2xhc2ggZXNjYXBlc1xyXG5cdFx0XHRcdFx0XHRoW2lkZW50XSA9IHN0clxyXG5cdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHRoW2lkZW50XSA9IG51bVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdGhbaWRlbnRdID0gc3RyXHJcblx0XHRcdGVsc2UgaWYgbmVnXHJcblx0XHRcdFx0aFtpZGVudF0gPSBmYWxzZVxyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0aFtpZGVudF0gPSB0cnVlXHJcblx0XHRlbHNlXHJcblx0XHRcdGNyb2FrIFwiSW52YWxpZCB3b3JkICN7d29yZH1cIlxyXG5cdHJldHVybiBoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IG8gOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IGhhc2ggPT5cclxuXHJcblx0cmV0dXJuIHN0clRvSGFzaCBsU3RyaW5nc1swXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzIDo9IChsU3RyaW5nczogVGVtcGxhdGVTdHJpbmdzQXJyYXkpOiBzdHJpbmcgPT5cclxuXHJcblx0cmVwbGFjZXIgOj0gKG1hdGNoOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHRcdHJldHVybiBzcGFjZXMoMykucmVwZWF0IG1hdGNoLmxlbmd0aFxyXG5cdHJldHVybiBsU3RyaW5nc1swXS5yZXBsYWNlQWxsIC9eXFx0Ky9tZywgcmVwbGFjZXJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgczIgOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXBsYWNlciA6PSAobWF0Y2g6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cdFx0cmV0dXJuIHNwYWNlcygyKS5yZXBlYXQgbWF0Y2gubGVuZ3RoXHJcblx0cmV0dXJuIGxTdHJpbmdzWzBdLnJlcGxhY2VBbGwgL15cXHQrL21nLCByZXBsYWNlclxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzNCA6PSAobFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5KTogc3RyaW5nID0+XHJcblxyXG5cdHJlcGxhY2VyIDo9IChtYXRjaDogc3RyaW5nKTogc3RyaW5nID0+XHJcblx0XHRyZXR1cm4gc3BhY2VzKDQpLnJlcGVhdCBtYXRjaC5sZW5ndGhcclxuXHRyZXR1cm4gbFN0cmluZ3NbMF0ucmVwbGFjZUFsbCAvXlxcdCsvbWcsIHJlcGxhY2VyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHQgOj0gKGxTdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXBsYWNlciA6PSAobWF0Y2g6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cdFx0bGV2ZWwgOj0gTWF0aC5mbG9vciBtYXRjaC5sZW5ndGggLyAzXHJcblx0XHRyZXR1cm4gJ1xcdCcucmVwZWF0IGxldmVsXHJcblx0cmV0dXJuIGxTdHJpbmdzWzBdLnJlcGxhY2VBbGwgL15cXHgyMCsvbWcsIHJlcGxhY2VyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGtleXMgPSBPYmplY3Qua2V5c1xyXG5leHBvcnQgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGhhc0tleSA6PSAoXHJcblx0XHRvYmo6IHVua25vd24sXHJcblx0XHQuLi5sS2V5czogc3RyaW5nW11cclxuXHRcdCkgPT5cclxuXHJcblx0YXNzZXJ0ICh0eXBlb2Ygb2JqID09ICdvYmplY3QnKSwgXCJOb3QgYW4gb2JqZWN0XCJcclxuXHRhc3NlcnQgKG9iaiAhPSBudWxsKSwgXCJvYmplY3QgaXMgbnVsbFwiXHJcblx0Zm9yIGtleSBvZiBsS2V5c1xyXG5cdFx0aWYgbm90IChrZXkgaW4gb2JqKVxyXG5cdFx0XHRyZXR1cm4gZmFsc2VcclxuXHRyZXR1cm4gdHJ1ZVxyXG5cclxuZXhwb3J0IGhhc0tleXMgOj0gaGFzS2V5XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHNwYWNlcyA6PSAobjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAobiA8PSAwKSA/ICcnIDogJyAnLnJlcGVhdChuKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJzIDo9IChuOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChuIDw9IDApID8gJycgOiAnXFx0Jy5yZXBlYXQobilcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZGFzaGVzIDo9IChuOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChuIDw9IDApID8gJycgOiAnLScucmVwZWF0KG4pXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGx0cmltIDo9IChsaW5lOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIGxpbmUucmVwbGFjZSAvXlxccysvLCAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBydHJpbSA6PSAobGluZTogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBsaW5lLnJlcGxhY2UgL1xccyskLywgJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY291bnRDaGFycyA6PSAoc3RyOiBzdHJpbmcsIGNoOiBzdHJpbmcpOiBudW1iZXIgPT5cclxuXHJcblx0bGV0IGNvdW50ID0gMFxyXG5cdGxldCBwb3MgPSAtMVxyXG5cdHdoaWxlIChwb3MgPSBzdHIuaW5kZXhPZihjaCwgcG9zICsgMSkpICE9IC0xXHJcblx0XHRjb3VudCArPSAxXHJcblx0cmV0dXJuIGNvdW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJsb2NrVG9BcnJheSA6PSAoYmxvY2s6IHN0cmluZyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGlmIGlzRW1wdHkoYmxvY2spXHJcblx0XHRyZXR1cm4gW11cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYmxvY2suc3BsaXQgL1xccj9cXG4vXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEJsb2NrU3BlYyA9IHN0cmluZyB8IHN0cmluZ1tdXHJcblxyXG5leHBvcnQgaXNCbG9ja1NwZWMgOj0gKHg6IHVua25vd24pOiB4IGlzIFRCbG9ja1NwZWMgPT5cclxuXHRyZXR1cm4gaXNTdHJpbmcoeCkgfHwgaXNBcnJheU9mU3RyaW5ncyh4KVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0b0FycmF5IDo9IChzdHJPckFycmF5OiBUQmxvY2tTcGVjKTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgQXJyYXkuaXNBcnJheShzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYmxvY2tUb0FycmF5IHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXJyYXlUb0Jsb2NrIDo9IChsTGluZXM6IHN0cmluZ1tdKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc0FycmF5KGxMaW5lcyksIFwibExpbmVzIGlzIG5vdCBhbiBhcnJheTogI3tsTGluZXN9XCJcclxuXHRyZXR1cm4gbExpbmVzLm1hcCgobGluZSkgPT4gcnRyaW0obGluZSkpLmZpbHRlcigobGluZSkgPT4gZGVmaW5lZCBsaW5lKS5qb2luIFwiXFxuXCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdG9CbG9jayA6PSAoc3RyT3JBcnJheTogVEJsb2NrU3BlYyk6IHN0cmluZyA9PlxyXG5cclxuXHRpZiBpc1N0cmluZyhzdHJPckFycmF5KVxyXG5cdFx0cmV0dXJuIHN0ck9yQXJyYXlcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gYXJyYXlUb0Jsb2NrIHN0ck9yQXJyYXlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5nZXRORXh0cmEgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmdcclxuXHRcdGxlbjogbnVtYmVyXHJcblx0XHQpOiBudW1iZXIgPT5cclxuXHJcblx0ZXh0cmEgOj0gbGVuIC0gZGVjb2xvcml6ZShzdHIpLmxlbmd0aFxyXG5cdHJldHVybiAoZXh0cmEgPiAwKSA/IGV4dHJhIDogMFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBycGFkIDo9IChcclxuXHRcdHN0cjogc3RyaW5nXHJcblx0XHRsZW46IG51bWJlclxyXG5cdFx0Y2g6IHN0cmluZyA9ICcgJ1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2gubGVuZ3RoID09IDEpLCBcIk5vdCBhIGNoYXJcIlxyXG5cdG5FeHRyYSA6PSBnZXRORXh0cmEgc3RyLCBsZW5cclxuXHRyZXR1cm4gc3RyICsgY2gucmVwZWF0KG5FeHRyYSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbHBhZCA6PSAoXHJcblx0XHRzdHI6IHN0cmluZ1xyXG5cdFx0bGVuOiBudW1iZXJcclxuXHRcdGNoOiBzdHJpbmcgPSAnICdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgKGNoLmxlbmd0aCA9PSAxKSwgXCJOb3QgYSBjaGFyXCJcclxuXHRuRXh0cmEgOj0gZ2V0TkV4dHJhIHN0ciwgbGVuXHJcblx0cmV0dXJuIGNoLnJlcGVhdChuRXh0cmEpICsgc3RyXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGUgVEFsaWdubWVudCA9ICdsJyB8ICdjJyB8ICdyJyB8ICdsZWZ0JyB8ICdjZW50ZXInIHwgJ3JpZ2h0J1xyXG5cclxuZXhwb3J0IGlzQWxpZ25tZW50IDo9ICh4OiB1bmtub3duKTogeCBpcyBUQWxpZ25tZW50ID0+XHJcblx0cmV0dXJuICgodHlwZW9mIHggPT0gJ3N0cmluZycpICYmIFsnbCcsICdjJywgJ3InLCAnbGVmdCcsICdjZW50ZXInLCAncmlnaHQnXS5pbmNsdWRlcyh4KSlcclxuXHJcbmV4cG9ydCBhbGlnblN0cmluZyA6PSBmdW5jdGlvbihcclxuXHRcdHN0cjogc3RyaW5nLFxyXG5cdFx0d2lkdGg6IG51bWJlcixcclxuXHRcdGFsaWduOiBUQWxpZ25tZW50XHJcblx0XHQpOiBzdHJpbmdcclxuXHJcblx0c3dpdGNoIGFsaWduXHJcblx0XHRjYXNlICdsZWZ0JzpcclxuXHRcdGNhc2UgJ2wnOlxyXG5cdFx0XHRyZXR1cm4gcnBhZCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdjZW50ZXInOlxyXG5cdFx0Y2FzZSAnYyc6XHJcblx0XHRcdHJldHVybiBzZXAgJyAnLCBzdHIsIHdpZHRoXHJcblx0XHRjYXNlICdyaWdodCc6XHJcblx0XHRjYXNlICdyJzpcclxuXHRcdFx0cmV0dXJuIGxwYWQgc3RyLCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB6cGFkIDo9IChuOiBudW1iZXIsIGxlbjogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBscGFkIG4udG9TdHJpbmcoKSwgbGVuLCAnMCdcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgR0VORVJBVE9SXHJcblxyXG5leHBvcnQgYWxsTWF0Y2hlcyA6PSAoXHJcblx0XHRzdHI6IHN0cmluZyxcclxuXHRcdHJlOiBSZWdFeHBcclxuXHRcdCk6IFRJdGVyYXRvcjxzdHJpbmdbXT4gLT5cclxuXHJcblx0IyAtLS0gRW5zdXJlIHRoZSByZWdleCBoYXMgdGhlIGdsb2JhbCBmbGFnIChnKSBzZXRcclxuXHRuZXdyZSA6PSBuZXcgUmVnRXhwKHJlLCByZS5mbGFncyArIChyZS5mbGFncy5pbmNsdWRlcygnZycpID8gJycgOiAnZycpKVxyXG5cdGxldCBsTWF0Y2hlczogc3RyaW5nW10gfCBudWxsID0gbnVsbFxyXG5cdHdoaWxlIGRlZmluZWQobE1hdGNoZXMgPSBuZXdyZS5leGVjKHN0cikpXHJcblx0XHR5aWVsZCBsTWF0Y2hlc1xyXG5cdHJldHVyblxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCByZXF1aXJlIDo9IGNyZWF0ZVJlcXVpcmUgaW1wb3J0Lm1ldGEudXJsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldExpbmVBbmRDb2x1bW4gOj0gKHRleHQ6IHN0cmluZywgcG9zOiBudW1iZXIpID0+XHJcblxyXG5cdCMgLS0tIEdldCBsaW5lIG51bWJlciBieSBjb3VudGluZyBudW1iZXIgb2YgXFxuIGNoYXJzXHJcblx0IyAgICAgICAgYmVmb3JlIHRoZSBjdXJyZW50IHBvc2l0aW9uXHJcblx0IyAgICAgR2V0IGNvbHVtbiBudW1iZXIgYnkgZmluZGluZyBjbG9zZXN0IHByZXZpb3VzIHBvc2l0aW9uXHJcblx0IyAgICAgICAgb2YgYSBcXG4gYW5kIGNvbXB1dGluZyB0aGUgZGlmZmVyZW5jZVxyXG5cdHNob3J0U3RyIDo9IHRleHQuc3Vic3RyaW5nIDAsIHBvc1xyXG5cdHJldHVybiBbXHJcblx0XHRjb3VudENoYXJzKHNob3J0U3RyLCBcIlxcblwiKSArIDFcclxuXHRcdHBvcyAtIHNob3J0U3RyLmxhc3RJbmRleE9mKCdcXG4nKVxyXG5cdF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYmxvY2tXaWR0aCA6PSAoYmxvY2s6IHN0cmluZyk6IG51bWJlciA9PlxyXG5cclxuXHRsZXQgd2lkdGggPSAwXHJcblx0Zm9yIGxpbmUgb2YgYWxsTGluZXNJbihibG9jaylcclxuXHRcdGlmIChkZWNvbG9yaXplKGxpbmUpLmxlbmd0aCA+IHdpZHRoKVxyXG5cdFx0XHR3aWR0aCA9IGxpbmUubGVuZ3RoXHJcblx0cmV0dXJuIHdpZHRoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGJsb2NrSGVpZ2h0IDo9IChibG9jazogc3RyaW5nKTogbnVtYmVyID0+XHJcblxyXG5cdHJldHVybiAoYmxvY2sgPT0gJycpID8gMCA6IGJsb2NrLnNwbGl0KCdcXG4nKS5sZW5ndGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0T3B0aW9ucyA6PSA8VCBleHRlbmRzIGhhc2g+KFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0aERlZmF1bHRzOiBUXHJcblx0XHQpOiBUID0+XHJcblxyXG5cdHJldHVybiB7IC4uLmhEZWZhdWx0cywgLi4uaE9wdGlvbnMgfVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzZXAgOj0gKFxyXG5cdFx0Y2hhcjogc3RyaW5nID0gJy0nLFxyXG5cdFx0bGFiZWw6IHN0cmluZz8gPSB1bmRlZixcclxuXHRcdHdpZHRoOiBudW1iZXIgPSBkZWZXaWR0aFxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAoY2hhci5sZW5ndGggPT0gMSksIFwiTm90IGEgY2hhcjogI3tjaGFyfVwiXHJcblx0aWYgZGVmaW5lZChsYWJlbClcclxuXHRcdHJldHVybiBjZW50ZXJlZCBsYWJlbCwge2NoYXIsIHdpZHRofVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBjaGFyLnJlcGVhdCB3aWR0aFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0YWJpZnkgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRuU3BhY2VzOiBudW1iZXIgPSAzXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIHN0ci5yZXBsYWNlQWxsIC9eKFxceDIwKykvZywgKG1hdGNoLCBzcGFjZXMpID0+XHJcblx0XHRyZXR1cm4gJ1xcdCcucmVwZWF0IE1hdGguZmxvb3Igc3BhY2VzLmxlbmd0aCAvIG5TcGFjZXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdW50YWJpZnkgOj0gKFxyXG5cdFx0c3RyOiBzdHJpbmcsXHJcblx0XHRyZXBsYWNlbWVudDogc3RyaW5nID0gJyAgICdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gc3RyLnJlcGxhY2VBbGwgJ1xcdCcsIHJlcGxhY2VtZW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSB2YWxpZCBvcHRpb25zOlxyXG4jICAgICAgICBjaGFyIC0gY2hhciB0byB1c2Ugb24gbGVmdCBhbmQgcmlnaHRcclxuIyAgICAgICAgd2lkdGggLSBmdWxsIHdpZHRoXHJcbiMgICAgICAgIG51bUJ1ZmZlciAtIG51bSBzcGFjZXMgYXJvdW5kIGxhYmVsIHdoZW4gY2hhciA8PiAnICdcclxuIyAgICAgICAgY29sb3IgLSBjb2xvciBvZiBlbnRpcmUgc3RyaW5nXHJcblxyXG5leHBvcnQgY2VudGVyZWQgOj0gKFxyXG5cdFx0bGFiZWw6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0Y2hhcjogY2hhclxyXG5cdFx0d2lkdGg6IG51bWJlclxyXG5cdFx0bnVtQnVmZmVyOiBudW1iZXJcclxuXHRcdGNvbG9yOiBzdHJpbmc/XHJcblx0XHR9XHJcblx0e2NoYXIsIHdpZHRoLCBudW1CdWZmZXIsIGNvbG9yfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGNoYXI6ICcgJ1xyXG5cdFx0d2lkdGg6IGRlZldpZHRoXHJcblx0XHRudW1CdWZmZXI6IDJcclxuXHRcdGNvbG9yOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHRsYWJlbExlbiA6PSBkZWNvbG9yaXplKGxhYmVsKS5sZW5ndGhcclxuXHRpZiAobGFiZWxMZW4gPj0gd2lkdGgpXHJcblx0XHRyZXR1cm4gbGFiZWxcclxuXHJcblx0dG90U3BhY2VzIDo9ICh3aWR0aCA+PSBsYWJlbC5sZW5ndGgpID8gd2lkdGggLSBsYWJlbExlbiA6IDBcclxuXHRudW1MZWZ0IDo9IE1hdGguZmxvb3IgdG90U3BhY2VzIC8gMlxyXG5cdG51bVJpZ2h0IDo9IHRvdFNwYWNlcyAtIG51bUxlZnRcclxuXHR0ZXh0IDo9IChcclxuXHRcdGlmIChjaGFyID09ICcgJylcclxuXHRcdFx0JyAnLnJlcGVhdChudW1MZWZ0KSArIGNvbG9yaXplKGxhYmVsLCBjb2xvcikgKyAnICcucmVwZWF0KG51bVJpZ2h0KVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRidWYgOj0gJyAnLnJlcGVhdCBudW1CdWZmZXJcclxuXHRcdFx0bGVmdCA6PSBjaGFyLnJlcGVhdCBudW1MZWZ0IC0gbnVtQnVmZmVyXHJcblx0XHRcdHJpZ2h0IDo9IGNoYXIucmVwZWF0IG51bVJpZ2h0IC0gbnVtQnVmZmVyXHJcblx0XHRcdGxlZnQgKyBidWYgKyBjb2xvcml6ZShsYWJlbCwgY29sb3IpICsgYnVmICsgcmlnaHRcclxuXHRcdClcclxuXHRyZXR1cm4gdGV4dFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbWRUaXRsZSA6PSAodGl0bGU6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gY2VudGVyZWQgdGl0bGUsIHtjaGFyOiAnPScsIGNvbG9yOiAnY3lhbid9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENTdHJpbmdTZXRNYXA8VCA9IHN0cmluZz4gZXh0ZW5kcyBNYXA8VCwgU2V0PHN0cmluZz4+XHJcblxyXG5cdGFkZChrZXk6IFQsIHZhbHVlOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdGFTZXQuYWRkIHZhbHVlXHJcblx0XHRlbHNlXHJcblx0XHRcdG5ld1NldCA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdFx0XHRuZXdTZXQuYWRkIHZhbHVlXHJcblx0XHRcdHN1cGVyLnNldCBrZXksIG5ld1NldFxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRoYXNLZXkoa2V5OiBUKTogYm9vbGVhblxyXG5cclxuXHRcdHJldHVybiBAaGFzIGtleVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0aGFzVmFsdWUodmFsOiBzdHJpbmcpOiBib29sZWFuXHJcblxyXG5cdFx0Zm9yIGtleSBvZiBAYWxsS2V5cygpXHJcblx0XHRcdHNldCA6PSBAZ2V0IGtleVxyXG5cdFx0XHRpZiBkZWZpbmVkKHNldCkgJiYgc2V0Lmhhcyh2YWwpXHJcblx0XHRcdFx0cmV0dXJuIHRydWVcclxuXHRcdHJldHVybiBmYWxzZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0KmFsbEtleXMoKTogVEl0ZXJhdG9yPFQ+XHJcblxyXG5cdFx0eWllbGQgKnN1cGVyLmtleXMoKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHQqYWxsVmFsdWVzKGtleTogVCk6IFRJdGVyYXRvcjxzdHJpbmc+XHJcblxyXG5cdFx0YVNldCA6PSBzdXBlci5nZXQga2V5XHJcblx0XHRpZiBkZWZpbmVkKGFTZXQpXHJcblx0XHRcdHlpZWxkICphU2V0LnZhbHVlcygpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFzU3RyaW5nKCk6IHN0cmluZ1xyXG5cclxuXHRcdHJlc3VsdHMxIDo9IFtdXHJcblx0XHRmb3Iga2V5IG9mIEBhbGxLZXlzKClcclxuXHRcdFx0cmVzdWx0czEucHVzaCBcIiN7a2V5fTogI3tBcnJheS5mcm9tKEBhbGxWYWx1ZXMga2V5KS5qb2luKCcgJyl9XCJcclxuXHRcdGxMaW5lcyA6PSByZXN1bHRzMVxyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luICdcXG4nXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGlzVEFNTCA6PSAoeDogdW5rbm93bik6IGJvb2xlYW4gPT5cclxuXHJcblx0aWYgaXNTdHJpbmcoeClcclxuXHRcdHRyeVxyXG5cdFx0XHRwYXJzZVlBTUwodW50YWJpZnkoeCkpXHJcblx0XHRcdHJldHVybiB0cnVlXHJcblx0XHRjYXRjaCBlcnJcclxuXHRcdFx0cmV0dXJuIGZhbHNlXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGZyb21UQU1MIDo9IChibG9jazogc3RyaW5nKTogdW5rbm93biA9PlxyXG5cclxuXHRyZXR1cm4gcGFyc2VZQU1MKHVudGFiaWZ5KGJsb2NrKSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgICAgZlwibmFtZSA9ICN7J0pvaG4nfTotMTBcIiAgICA9PiBcIm5hbWUgPSBKb2huICAgICAgXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OjEwXCIgICAgID0+IFwibmFtZSA9ICAgICAgIEpvaG5cIlxyXG4jICAgIGZcIm5hbWUgPSAjeydhXFx0Yid9IVwiICAgICAgID0+IFwibmFtZSA9IGHihpJiXCJcclxuIyAgICBmXCJuYW1lID0gI3snSm9obid9OntjeWFufVwiID0+IFwibmFtZSA9IEpvaG5cIiAoJ0pvaG4nIGluIGN5YW4gY29sb3IpXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIE51bWJlciBvZiBzdHJpbmdzIGlzIGFsd2F5cyAxIGdyZWF0ZXIgdGhhbiB0aGUgbnVtYmVyIG9mIHZhbHVlc1xyXG5cclxuZXhwb3J0IGYgOj0gKFxyXG5cdFx0bFN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5XHJcblx0XHQuLi5sVmFsdWVzOiB1bmtub3duW11cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHQjIC0tLSBTcGxpdCB0aGUgZmlyc3Qgc3RyaW5nXHJcblx0W21haW5GbXQsIGZpcnN0U3RyXSA6PSBmc3BsaXQgbFN0cmluZ3NbMF1cclxuXHJcblx0IyAtLS0gZm9ybWF0IGVhY2ggb2YgdGhlIHZhbHVlcywgY29uY2F0ZW5hdGluZyBhcyB3ZSBnb1xyXG5cdGJpZ1N0ciA6PSBNQVAgbFZhbHVlcywgZmlyc3RTdHIsICh2YWwsIGFjYywgaSkgPT5cclxuXHRcdFtmbXQsIG5leHRTdHJdIDo9IGZzcGxpdChsU3RyaW5nc1tpKzFdKVxyXG5cdFx0cmV0dXJuIGFjYyArIGZvcm1hdFZhbCh2YWwsIGZtdCkgKyBuZXh0U3RyXHJcblx0cmV0dXJuIGZvcm1hdFZhbChiaWdTdHIsIG1haW5GbXQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBURm9ybWF0ID0ge1xyXG5cdHRvUmVsOiBib29sZWFuXHJcblx0ZXNjYXBlOiBib29sZWFuXHJcblx0d2lkdGg6IG51bWJlclxyXG5cdGNvbG9yOiBzdHJpbmdcclxuXHR9XHJcblxyXG5leHBvcnQgZm9ybWF0VmFsIDo9IChcclxuXHRcdHZhbDogdW5rbm93blxyXG5cdFx0Zm10OiBURm9ybWF0P1xyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHN0cjEgOj0gKFxyXG5cdFx0ICAodmFsID09IHVuZGVmaW5lZCkgPyAndW5kZWYnXHJcblx0XHQ6ICh2YWwgPT0gbnVsbCkgICAgICA/ICdudWxsJ1xyXG5cdFx0OiBTdHJpbmcodmFsKVxyXG5cdFx0KVxyXG5cdGlmIG5vdGRlZmluZWQoZm10KVxyXG5cdFx0cmV0dXJuIHN0cjFcclxuXHR7dG9SZWwsIGVzY2FwZSwgd2lkdGgsIGNvbG9yfSA6PSBmbXRcclxuXHRzdHIyIDo9IHRvUmVsID8gdG9SZWxQYXRoKHN0cjEpIDogc3RyMVxyXG5cdHN0cjMgOj0gZXNjYXBlID8gZXNjKHN0cjIpIDogc3RyMlxyXG5cdHN0cjQgOj0gKFxyXG5cdFx0ICAod2lkdGggPiAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIHdpZHRoLCAncmlnaHQnKVxyXG5cdFx0OiAod2lkdGggPCAwKSA/IGFsaWduU3RyaW5nKHN0cjMsIC13aWR0aCwgJ2xlZnQnKVxyXG5cdFx0OiAgICAgICAgICAgICAgICAgICBzdHIzXHJcblx0XHQpXHJcblx0cmV0dXJuIGlzQ29sb3IoY29sb3IpID8gY29sb3JpemUoc3RyNCwgY29sb3IpIDogc3RyNFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBmc3BsaXQgOj0gKFxyXG5cdHN0cjogc3RyaW5nXHJcblx0KTogWyhURm9ybWF0PyksIHN0cmluZ10gPT5cclxuXHJcblx0aWYgbm90IHN0ci5zdGFydHNXaXRoKCc6JylcclxuXHRcdHJldHVybiBbdW5kZWYsIHN0cl1cclxuXHRsTWF0Y2hlcyA6PSBzdHIubWF0Y2ggLy8vXlxyXG5cdFx0XHQ6XHJcblx0XHRcdCh+KT8gICAgICAgICMgdG8gcmVsYXRpdmUgcGF0aFxyXG5cdFx0XHQoWy0rXT9cXGQrKT8gIyB3aWR0aFxyXG5cdFx0XHQoXFwhKT8gICAgICAgIyBlc2NhcGUgdGV4dD9cclxuXHRcdFx0KD86XHJcblx0XHRcdFx0eyAoW2Etel0rKSB9ICAgIyBjb2xvclxyXG5cdFx0XHRcdCk/XHJcblx0XHRcdCguKikgICAgICAgICMgYWN0dWFsIHRleHRcclxuXHRcdFx0JC8vL3NcclxuXHJcblx0b2J2aW91c2x5IGRlZmluZWQobE1hdGNoZXMpXHJcblx0W18sIHRvUmVsLCB3aWR0aCwgZG9Fc2MsIGNvbG9yLCByZXN0XSA6PSBsTWF0Y2hlc1xyXG5cdGlmIG5vdCB0b1JlbCAmJiBub3Qgd2lkdGggJiYgbm90IGRvRXNjICYmIG5vdCBjb2xvclxyXG5cdFx0cmV0dXJuIFt1bmRlZiwgc3RyXVxyXG5cdHJldHVybiBbXHJcblx0XHR7XHJcblx0XHRcdHRvUmVsOiAgdG9Cb29sKHRvUmVsKVxyXG5cdFx0XHR3aWR0aDogIHdpZHRoID8gcGFyc2VJbnQod2lkdGgpIDogMFxyXG5cdFx0XHRlc2NhcGU6IHRvQm9vbChkb0VzYylcclxuXHRcdFx0Y29sb3I6ICBkZWZpbmVkKGNvbG9yKSAmJiBpc0NvbG9yKGNvbG9yKSA/IGNvbG9yIDogJydcclxuXHRcdFx0fSxcclxuXHRcdHJlc3RcclxuXHRcdF1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgbGlrZU51bSA6PSAoc3RyOiBzdHJpbmcpOiBib29sZWFuID0+XHJcblxyXG5cdHJldHVybiB0b0Jvb2wgbWF0Y2hlcyhzdHIsIC9eXFxkKyhcXC5cXGQqKT8oW0VlXVxcZCspPyQvKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBzb3J0QW55QXJyYXkgOj0gPFQ+KFxyXG5cdFx0bEl0ZW1zOiBUW11cclxuXHRcdCk6IFRbXSA9PlxyXG5cclxuXHRyZXR1cm4gbEl0ZW1zLnRvU29ydGVkKClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIGlmIHBhc3NlZCBhbiBhc3luYyBmdW5jdGlvbiwgd2lsbCByZXR1cm4gYSBwcm9taXNlXHJcbiMgICAgIGluIHRoYXQgY2FzZSwgeW91IG11c3QgdXNlIGF3YWl0XHJcblxyXG5leHBvcnQgRVhFQyA6PSAoXHJcblx0XHRmdW5jOiAoKSA9PiB2b2lkXHJcblx0XHQpOiB2b2lkID0+XHJcblxyXG5cdGRlYnVnZ2VyXHJcblx0dHJ5XHJcblx0XHRpZiBpc0FzeW5jRnVuY3Rpb24gZnVuY1xyXG5cdFx0XHRhd2FpdCBmdW5jKClcclxuXHRcdGVsc2VcclxuXHRcdFx0ZnVuYygpXHJcblx0Y2F0Y2ggZXJyXHJcblx0XHRFUlIgXCJpbiBFWEVDKCk6ICN7Z2V0RXJyU3RyKGVycil9XCJcclxuXHRyZXR1cm5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgU0tJUCA6PSAoZnVuYzogKCkgPT4gdm9pZCk6IHZvaWQgPT5cclxuXHJcblx0cmV0dXJuXHJcbiJdfQ==