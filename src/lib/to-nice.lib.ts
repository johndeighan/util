"use strict";
// to-nice.lib.civet

import {cyan, blue} from 'jsr:@std/fmt/colors'
import {uni, esc} from 'unicode'
import {
	assert, croak, undef, defined, notdefined,
	hash, hashof, isString, isArray, isClass, isRegExp,
	isPrimitive, isEmpty, nonEmpty, assertIsHash, integer,
	symbolName, className, functionName, regexpDef,
	} from 'datatypes'
import {
	getOptions, o, toBlock, spaces, mapEachLine, sep,
	} from 'llutils'

// ---------------------------------------------------------------------------

export const mark = (str: string): string => {

	return uni.startchar + str + uni.endchar
}

// ---------------------------------------------------------------------------

export type TCompareFunc = (a: string, b: string) => number

export const alphaCompare: TCompareFunc = (a: string, b: string): number => {

	return (()=>{if (a < b) { return -1} else if (a > b) { return 1} else return 0})()
}

// ---------------------------------------------------------------------------

// --- any leading digit must be preceded by a single '\'

export const toNiceString = (
		str: string,
		compact: boolean = true
		): string => {

	// --- escape spaces and \t, \n or \r with unicode chars
	const estr = esc(str, compact ? 'oneline' : 'multiline')

	// --- precede with '“' if
	//        - starts with digit
	//        - starts with '-'
	//        - looks like a label
	if (estr.match(/^[\d-]/) || estr.match(/^\.\d/)) {
		return uni.lsmartq + estr
	}
	else if (estr.match(/^[^˳\s]+\:˳/)) {
		return uni.lsmartq + estr
	}
	else {
		return estr
	}
}

// ---------------------------------------------------------------------------

// --- Returns a function that:
//        compares 2 strings based on their position in lSortKeys
//        else compares alphabetically
const getCompareFunc = (lSortKeys: string[]): TCompareFunc => {

	// --- Create map of key to number
	const h: hashof<number> = {}
	let i1 = 0
	for (const key of lSortKeys) {
		const i = i1++
		h[key] = i + 1
	}
	return function(a: string, b: string): number {
		const aVal = h[a]
		const bVal = h[b]
		if (defined(aVal)) {
			if (defined(bVal)) {
				// --- compare numerically
				return (aVal < bVal) ? -1 : (aVal > bVal) ? 1 : 0
			}
			else {
				return -1
			}
		}
		else {
			if (defined(bVal)) {
				return 1
			}
			else {
				return alphaCompare(a, b)
			}
		}
	}
}

// ---------------------------------------------------------------------------

export const rotpos = <T,>(lArray: T[], i: integer): T => {

	return lArray[i % lArray.length]
}

// ---------------------------------------------------------------------------

const indented = (block: string, oneIndent: string) => {

	return mapEachLine(block, (line) => oneIndent + line)
}

// ---------------------------------------------------------------------------

export type TPathIndex = string | number
export const buildPath = (lPath: TPathIndex[]): string => {

	let str = 'root'
	for (const item of lPath) {
		if (isString(item)) {
			str += `.${item}`
		}
		else {
			str += `[${item.toString()}]`
		}
	}
	return str
}

// ---------------------------------------------------------------------------

export type TMapFunc = (key: string, value: unknown, hParent: hash) => unknown

export const emptyMapFunc = (key: string, value: unknown, hParent: hash): unknown => {

	return undef
}

export const toNice = (
		x: unknown,
		hOptions: hash = {},
		mapVisited: Map<object, string> = new Map<object, string>(),
		lPath: TPathIndex[] = []
		): string => {

	// --- When recoverable, classes and functions
	//     include their definitions,
	//     with escaped chars
	type opt = {
		compact: boolean
		recoverable: boolean
		ignoreEmptyValues: boolean
		sortKeys: boolean
		sortFunc: (TCompareFunc | undefined)
		mapFunc: TMapFunc
		lInclude: ((string[]) | undefined)
		lExclude: ((string[]) | undefined)
		lIndents: string[]
	}
	const {
		compact, recoverable, ignoreEmptyValues, sortKeys, sortFunc,
		mapFunc, lInclude, lExclude, lIndents
		} = getOptions<opt>(hOptions, {
		compact: false,
		recoverable: false,
		ignoreEmptyValues: false,
		sortKeys: false,
		sortFunc: undef,
		mapFunc: emptyMapFunc,
		lInclude: undef,
		lExclude: undef,
		lIndents: ['   ', '❘  ']
		})

	// --- You can provide sortKeys or a sortFunc, but not both
	assert(!(sortKeys && defined(sortFunc)), "Bad options")
	switch(typeof x) {
		case 'undefined':
			return mark('undef')
		case 'boolean':
			return (x? mark('true') : mark('false'))
		case 'number':
			return (
				  Number.isNaN(x)    ? mark('NaN')
				: Number.isFinite(x) ? x.toString()
				:                      ((x < 0) ? mark('neginf') : mark('inf'))
				)
		case 'bigint':
			return x.toString() + 'n'
		case 'string':
			return toNiceString(x, compact)
		case 'symbol':
			const name = symbolName(x)
			if (name) {
				return mark(`symbol ${name}`)
			}
			else {
				return mark("symbol")
			}
		case 'function':
			if (isClass(x)) {
				const name = className(x)
				if (name) {
					return mark(`class ${name}`)
				}
				else {
					return mark("class")
				}
			}
			else {
				const name = functionName(x)
				if (name) {
					return mark(`function ${name}`)
				}
				else {
					return mark("function")
				}
			}
		case 'object':
			if (x === null) {
				return mark('null')
			}
			// --- Check if object was previously visited
			const prevpath = mapVisited.get(x)
			if (prevpath) {
				return mark(`ref ${prevpath}`)
			}
			if (isRegExp(x)) {
				const desc = esc(regexpDef(x))
				if (desc) {
					return mark(`regexp ${desc}`)
				}
				else {
					return mark("regexp")
				}
			}
			if (isArray(x)) {
				if (x.length === 0) {
					return '[]'
				}
				mapVisited.set(x, buildPath(lPath))
				const lLines = []
				let i2 = 0
				for (const val of x) {
					const i = i2++
					const block = toNice(val, hOptions, mapVisited, [...lPath, i])
					if (compact) {
						lLines.push(block)
					}
					else if (isPrimitive(val) || block.startsWith('.') || isEmpty(val)) {
						lLines.push(`- ${block}`)
					}
					else {
						lLines.push('-')
						const oneIndent = rotpos<string>(lIndents, lPath.length)
						lLines.push(indented(block, oneIndent))
					}
				}
				if (compact) {
					return '[' + lLines.join(' ') + ']'
				}
				else {
					return toBlock(lLines)
				}
			}

			// --- It's an object
			if (x instanceof Set) {
				const results = []
				for (const key of x.keys()) {
					results.push(toNice(key))
				}
				const lKeys = results
				return (
					(lKeys.length === 0?
						mark("emptySet")
					:
						mark(`set ${lKeys.join(' ')}`))
					)
			}
			if (x instanceof Map) {
				const results1 = []
				for (const [key, val] of x.entries()) {
					results1.push(`${toNice(key)}:: ${toNice(val)}`)
				}
				const lLines = results1
				return lLines.join('\n')
			}
			const lKeys = Object.keys(x)
			if (lKeys.length === 0) {
				return '{}'
			}
			const func: (TCompareFunc | undefined) = (
				(()=>{if (defined(sortFunc)) {
					return sortFunc
				}
				else if (defined(lInclude)) {
					return getCompareFunc(lInclude)
				}
				else if (sortKeys) {
					return alphaCompare
				}
				else {
					return undef
				}})()
				)
			const useKey = (key: unknown): boolean => {
				if (typeof key !== 'string') {
					return false
				}
				if (defined(lExclude) && lExclude.includes(key)) {
					return false
				}
				if (defined(lInclude) && !lInclude.includes(key)) {
					return false
				}
				return true
			}
			mapVisited.set(x, buildPath(lPath))
			assertIsHash(x) // --- will allow us to index with any string
			const lLines = []
			for (const key of (defined(func) ? lKeys.sort(func) : lKeys).filter(useKey)) {
				const val = x[key]
				if (!ignoreEmptyValues || nonEmpty(val)) {
					let ref;if (recoverable) { ref = undef} else ref = mapFunc(key, val, x);const mapped =ref
					const newval = mapped || val
					const block = isString(mapped) ? mapped : toNice(newval, hOptions, mapVisited, [...lPath, key])
					if (
							   compact
							|| (defined(newval) && isPrimitive(newval))
							|| block.startsWith(uni.startchar)
							|| isEmpty(newval)
							) {
						lLines.push(`${key}: ${block}`)
					}
					else {
						lLines.push(`${key}:`)
						const oneIndent = rotpos<string>(lIndents, lPath.length)
						lLines.push(indented(block, oneIndent))
					}
				}
			}
			if (compact) {
				return '{' + lLines.join(' ') + '}'
			}
			else {
				return toBlock(lLines)
			}
	}
	return `<Unknown object ${x}>`
}

// ---------------------------------------------------------------------------

export const OL = (x: unknown, hOptions = {}): string => {

	type opt = {
		label: (string | undefined)
		pos: (number | undefined)
		debug: boolean
	}
	const {label, pos, debug} = getOptions<opt>(hOptions, {
		label: undef,
		pos: undef,
		debug: false,
	})
	const text = (
		(defined(label)?
			(`${label} = ${toNice(x, {compact: true})}`)
		:
			toNice(x, {compact: true}))
		)
	if (debug) {
		const n = Math.floor(text.length / 10) + 1
		return [
			text,
			'\n',
			' '.repeat((defined(label)? (label.length + 3) : 0)),
			"|         ".repeat(n)
		].join('')
	}
	else {
		return text
	}
}

// ---------------------------------------------------------------------------

export const ML = (x: unknown, hOptions = {}): string => {

	type opt = {
		label: (string | undefined)
	}
	const {label} = getOptions<opt>(hOptions, {
		label: undef,
	})
	if (defined(label)) {
		return [
			sep('-', label),
			toNice(x, {compact: false}),
			sep('-')
		].join('\n')
	}
	else {
		return toNice(x, {compact: false})
	}
}

// ---------------------------------------------------------------------------

export const DUMP = (
		x: unknown,
		label: (string | undefined) = undef,
		hOptions: hash = {}
		): void => {

	type opt = {
		width: number
		char: string
		endLabel: boolean
		}
	const {width, char, endLabel} = getOptions<opt>(hOptions, {
		width: 64,
		char: '-',
		endLabel: false
		})
	console.log(sep(char, label, width))
	if (isString(x)) {
		if (nonEmpty(x)) {
			console.log(x)
		}
	}
	else {
		console.log(toNice(x, hOptions))
	}
	console.log(sep(char, (endLabel ? `END ${label}` : undef), width))
	return
}