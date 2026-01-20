"use strict";
// llutils.lib.civet

type AutoPromise1<T> = Promise<Awaited<T>>;
type AutoPromise<T> = Promise<Awaited<T>>
import {createRequire} from 'node:module'
import {sprintf} from 'jsr:@std/fmt/printf'
import {relative} from 'jsr:@std/path'
import {existsSync} from 'jsr:@std/fs'
import {statSync} from 'node:fs'
import {parse as parseYAML} from "jsr:@std/yaml";

import {
	undef, defined, notdefined, assert, char, deepEqual,
	assertIsDefined, isHash, isArray, isNonEmptyString,
	isArrayOfStrings, isEmpty, nonEmpty, isString, isInteger,
	integer, hash, hashof, array, arrayof, TVoidFunc, isNonPrimitive,
	functionDef, croak, assertIsString, assertIsNumber,
	TStringMapper,
	} from 'datatypes'
import {f} from 'f-strings'

export {f}

const llutilsLoadTime: integer = Date.now()

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

export const pass = (): void => {}
	// do nothing

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

export type THashEntry = [key: string, val: unknown]

export type TEntryFilter = (
		entry: THashEntry
		) => boolean

export const filterHash = (h: Object, func: TEntryFilter): hash => {

	return Object.fromEntries(
		Object.entries(h).filter(func)
		)
}

// ---------------------------------------------------------------------------

export const removeEmptyKeys = (h: hash): hash => {

	const func = (entry: THashEntry) => {
		const [key, val] = entry
		return defined(val)
	}
	return filterHash(h, func)
}

// ---------------------------------------------------------------------------

export var keys = Object.keys
export const hasOwn = Object.hasOwn

// ---------------------------------------------------------------------------

export const numKeys = (h: hash): number => {

	return keys(h).length
}

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

export const missingKeys = (h: hash, ...lKeys: string[]): string[] => {
	if (notdefined(h)) {
		return lKeys
	}
	assert(isHash(h), `h not a hash: ${h}`)
	const lMissing: string[] = []
	for (const key of lKeys) {
		if (!h.hasOwnProperty(key)) {
			lMissing.push(key)
		}
	}
	return lMissing
}

// ---------------------------------------------------------------------------

export const merge = (...lObjects: hash[]): hash => {
	return Object.assign({}, ...lObjects)
}

// ---------------------------------------------------------------------------

export const hit = (pct: number = 50): boolean => {
	return (100 * Math.random() < pct)
}

// ---------------------------------------------------------------------------

// --- ASYNC !
export const sleep = async (sec: number): AutoPromise1<AutoPromise<void>> => {
	await new Promise((r) => setTimeout(r, 1000 * sec))
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
	return (n <= 0? '' : ' '.repeat(n))
}

// ---------------------------------------------------------------------------

export const tabs = (n: number): string => {
	return (n <= 0? '' : '\t'.repeat(n))
}

// ---------------------------------------------------------------------------

export const rtrim = (line: string): string => {
	assert(isString(line), `not a string: ${typeof line}`)
	const lMatches = line.match(/^(.*?)\s+$/)
	return (lMatches === null? line : lMatches[1])
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

export const mapEachLine = (block: string, mapper: TStringMapper) => {

	const results = []
	for (const line of allLinesInBlock(block)) {
		results.push(mapper(line))
	}
	const lLines = results
	return lLines.join('\n')
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

export const invertHash = (h: hash): hash => {
	assert(isHash(h), `Not a hash: ${h}`)
	const hResult: hash = {}
	for (const key of keys(h)) {
		const value = h[key]
		if (isString(value)) {
			hResult[value] = key
		}
	}
	return hResult
}

// ---------------------------------------------------------------------------

export const wsSplit = (str: string): string[] => {
	const newstr = str.trim()
	if (newstr === '') {
		return []
	}
	else {
		return newstr.split(/\s+/)
	}
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

export const getNExtra = (str: string, len: number): number => {
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
export const alignString = function(str: string, width: number, align: TAlignment): string {
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
	const newre = new RegExp(re, re.flags + ((re.flags.includes('g')? '' : 'g')))
	let lMatches: string[] | null = null
	while (defined(lMatches = newre.exec(str))) {
		yield lMatches
	}
	return
}

// ---------------------------------------------------------------------------

export const range = function*(n: number): Generator<number, void, void> {

	for (let i1 = 0, asc = 0 <= n; asc ? i1 < n : i1 > n; asc ? ++i1 : --i1) {const i = i1;
		yield i
	}
	return
}

// ---------------------------------------------------------------------------

export const assertSameStr = (str1: string, str2: string): void => {
	if (str1 !== str2) {
		console.log(sep('-', "Strings Differ:"))
		console.log(sep('-', "string 1"))
		console.log(str1)
		console.log(sep('-', "string 2"))
		console.log(str2)
		console.log('-'.repeat(64))
	}
	assert((str1 === str2), "strings differ")
	return
}

// ---------------------------------------------------------------------------

export const interpolate = (
		str: string,
		hReplace: hashof<string> // --- { <tag>: <replacement>, ... }
		): string => {

	for (const key of keys(hReplace)) {
		assert((key[0] === '$'), "all keys must start with '$'")
	}
	const re = /\$(?:[A-Za-z][A-Za-z0-9]*)/g
	return str.replaceAll(re, (match: string) => {
		return hReplace[match] || match
	})
}

// ---------------------------------------------------------------------------
// --- generate random labels

const labelGen = function*(): Generator<string, void, void> {

	for (let i2 = 65; i2 <= 90; ++i2) {const i = i2;
		const ch = String.fromCharCode(i)
		yield ch
	}
	for (let i3 = 65; i3 <= 90; ++i3) {const i = i3;
		const ch = String.fromCharCode(i)
		for (let i4 = 65; i4 <= 90; ++i4) {const j = i4;
			const ch2 = String.fromCharCode(j)
			yield ch + ch2
		}
	}
	for (let i5 = 65; i5 <= 90; ++i5) {const i = i5;
		const ch = String.fromCharCode(i)
		for (let i6 = 65; i6 <= 90; ++i6) {const j = i6;
			const ch2 = String.fromCharCode(j)
			for (let i7 = 65; i7 <= 90; ++i7) {const k = i7;
				const ch3 = String.fromCharCode(k)
				yield ch + ch2 + ch3
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------
// --- Create an iterator from the generator

const labels = labelGen()
export const randomLabel = (): string => {
	const label = labels.next()
	return label.done ? 'ERR!' : label.value
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

export const blockify = (lStrings: string[], hOptions: hash = {}): string => {
	type opt = {
		sep: string
		endsep: string
		width: number
		}
	const {sep, endsep, width} = getOptions<opt>(hOptions, {
		sep: ' ',
		endsep: '',
		width: 64
		})

	const lLines: string[] = []
	const lWords: string[] = []
	let lineLen = endsep.length
	for (const str of lStrings) {
		// --- If adding the string makes the line too long,
		//     output the line and clear the array of words
		if (lineLen + str.length + sep.length > width) {
			lLines.push(lWords.join(sep))
			lWords.length = 0
			lineLen = 0
		}
		lWords.push(str)
		lineLen += str.length + sep.length
	}
	if (lWords.length > 0) {
		lLines.push(lWords.join(sep))
	}
	return lLines.join('\n')
}

// ---------------------------------------------------------------------------

export const getOptions = <T extends hash,>(hOptions: hash = {}, hDefaults: T): T => {
	return { ...hDefaults, ...hOptions }
}

// ---------------------------------------------------------------------------

const defWidth = 64

export const sep = (
		char: string = '-',
		label: (string | undefined) = undef,
		width: number = defWidth
		): string => {

	assert((char.length === 1), `Not a char: ${char}`)
	if (defined(label)) {
		return centered(label, char, width)
	}
	else {
		return char.repeat(width)
	}
}

// ---------------------------------------------------------------------------

export const tabify = (str: string, nSpaces: number = 3): string => {
	return str.replaceAll(/^(\x20+)/, (match, spaces) => {
		return '\t'.repeat(Math.floor(spaces.length / nSpaces))
	})
}

// ---------------------------------------------------------------------------

export const untabify = (str: string, replacement: string = '   '): string => {
	return str.replaceAll('\t', replacement)
}

// ---------------------------------------------------------------------------

export const allLinesInBlock = function*(
		block: string
		): Generator<string, void, void> {

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
//        buffer - num spaces around label when char <> ' '
export const centered = (
		label: string,
		char: string = ' ',
		width: number = defWidth,
		numBuffer: number = 2
		): string => {

	assert((char.length === 1), `Bad char: '${char}'`)
	const totSpaces = width - label.length
	if (totSpaces <= 0) {
		return label
	}
	const numLeft = Math.floor(totSpaces / 2)
	const numRight = totSpaces - numLeft
	if (char === ' ') {
		return ' '.repeat(numLeft) + label + ' '.repeat(numRight)
	}
	else {
		const buf = ' '.repeat(numBuffer)
		const left = char.repeat(numLeft - numBuffer)
		const right = char.repeat(numRight - numBuffer)
		return left + buf + label + buf + right
	}
}

// ---------------------------------------------------------------------------

export type TPredicate<T> = (item: T) => boolean

export const splitArray = <T,>(lItems: T[], predicate: TPredicate<T>): [T[], T[]] => {
	const lTrue: T[] = []
	const lFalse: T[] = []
	for (const item of lItems) {
		if (predicate(item)) {
			lTrue.push(item)
		}
		else {
			lFalse.push(item)
		}
	}
	return [lTrue, lFalse]
}

// ---------------------------------------------------------------------------

export class CStringSetMap<T = string> extends Map<T, Set<string>> {
	// ..........................................................

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

export const getErrStr = (err: unknown): string => {

	if (isString(err)) {
		return err
	}
	else if (err instanceof Error) {
		return err.message
	}
	else {
		return "Serious Error"
	}
}

