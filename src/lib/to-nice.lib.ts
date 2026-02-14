"use strict";
// to-nice.lib.civet

import {uni, esc} from 'unicode'
import {write, writeln} from 'console-utils'
import {
	assert, croak, undef, defined, notdefined,
	hash, hashof, isString, isArray, isClass, isRegExp, isObject,
	isPrimitive, isEmpty, nonEmpty, assertIsHash, integer,
	symbolName, className, functionName, regexpDef, jsType,
	assertIsFunction, assertIsClass, assertIsArray,
	} from 'datatypes'
import {
	getOptions, f, o, toBlock, spaces, mapEachLine, sep, keys,
	} from 'llutils'
import {indented} from 'indent'
import {mapper, syncMapper} from 'var-free'

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

// --- any leading digit must be preceded by a curly quote char

export const toNiceString = (
		str: string,
		): string => {

	if (str === '') {
		return mark('emptyString')
	}

	// --- escape spaces and \t, \n or \r with unicode chars
	const estr = esc(str)

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

export const getCompareFunc = (
		lSortKeys: string[]
		): TCompareFunc => {

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

export const rotpos = <T,>(
	lArray: T[],
	i: integer
	): T => {

	return lArray[i % lArray.length]
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

export type TMapFunc = (
		key: string,
		value: unknown,
		hParent: unknown
		) => string

// ---------------------------------------------------------------------------

export type TNiceOptions = {
	compact: boolean
	recoverable: boolean
	oneIndent: string
	ignoreEmptyKeys: boolean
	ignoreEmptyItems: boolean
	sortKeys: boolean
	sortFunc: (TCompareFunc | undefined)
	displayFunc: (TMapFunc | undefined)
	descFunc: (TMapFunc | undefined)
	lInclude: ((string[]) | undefined)
	lExclude: string[]
	}

export const hNiceDefaults = {
	compact: false,
	recoverable: false,
	oneIndent: '   ',
	ignoreEmptyKeys: false,
	ignoreEmptyItems: false,
	sortKeys: false,
	sortFunc: undef,
	displayFunc: undef,
	descFunc: undef,
	lInclude: undef,
	lExclude: []
	}

// ---------------------------------------------------------------------------

export const hash2nice = (
		mark: string,
		parent: unknown,
		lKeys: string[],
		getter: (s: string) => unknown,
		hOptions: hash = {},
		mapVisited: Map<object, string>,
		lPath: TPathIndex[]
		): string => {

	const {compact, sortFunc, sortKeys, lInclude, lExclude, ignoreEmptyKeys,
		displayFunc, descFunc, oneIndent, recoverable,
		} = getOptions<TNiceOptions>(hOptions, hNiceDefaults)

	// --- You can provide sortKeys or a sortFunc, but not both
	assert(!(sortKeys && defined(sortFunc)), "Bad options")

	if (recoverable) {
		assert(notdefined(displayFunc), "can't use displayFunc w/recoverable")
		assert(notdefined(descFunc), "can't use descFunc w/recoverable")
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
	const useKey = (key: string): boolean => {
		if (lExclude.includes(key)) {
			return false
		}
		if (defined(lInclude) && !lInclude.includes(key)) {
			return false
		}
		return true
	}
	const iterKeys = (defined(func) ? lKeys.sort(func) : lKeys).filter(useKey)
	const iterParts = syncMapper(iterKeys, function*(key: string): Generator<string> {
		const val = getter(key)
		if (!ignoreEmptyKeys || nonEmpty(val)) {
			if (isPrimitive(val)) {
				const str = displayStr(key, val, parent, displayFunc, descFunc)
				yield `${key}${mark} ${str}`
			}
			else {
				const str = toNice(val, hOptions, mapVisited, [...lPath, key])
				if (str.includes('\n')) {
					yield `${key}${mark}\n` + indented(str, 1, {oneIndent})
				}
				else {
					yield `${key}${mark} ${str}`
				}
			}
		}
	})
	const lParts = Array.from(iterParts)
	return (
		  compact
		? '{' + lParts.join(' ') + '}'
		: lParts.join('\n')
		)
}

// ---------------------------------------------------------------------------

export const seq2nice = (
		prefix: string,
		lValues: unknown[],
		hOptions: hash = {},
		mapVisited: Map<object, string>,
		lPath: TPathIndex[]
		): string => {

	const {compact, ignoreEmptyItems, oneIndent
		} = getOptions<TNiceOptions>(hOptions, hNiceDefaults)

	const iterParts = syncMapper(lValues, function*(val: unknown, i: number): Generator<string> {
		if (!ignoreEmptyItems || nonEmpty(val)) {
			const str = toNice(val, hOptions, mapVisited, [...lPath, i])
			if (str.includes('\n')) {
				yield `${prefix}\n` + indented(str, 1, {oneIndent})
			}
			else if (compact) {
				yield str
			}
			else {
				yield `${prefix} ${str}`
			}
		}
	})
	const lParts = Array.from(iterParts)
	return (
		  compact
		? '[' + lParts.join(' ') + ']'
		: lParts.join('\n')
		)
}

// ---------------------------------------------------------------------------

export const toNice = (
	x: unknown,
	hOptions: hash = {},
	mapVisited: Map<object, string> = new Map<object, string>(),
	lPath: TPathIndex[] = []
	): string => {

	const {compact, recoverable, oneIndent, displayFunc, descFunc
		} = getOptions<TNiceOptions>(hOptions, hNiceDefaults)

	const typ = jsType(x)
	switch(typ) {
		case 'undef':case 'NaN':case 'inf':case 'neginf':case 'null': {
			return mark(typ)
		}
		case 'boolean': {
			return x ? mark('true') : mark('false')
		}
		case 'string': {
			return toNiceString(x as string)
		}
		case 'symbol': {
			const name = symbolName(x)
			return name ? mark(`symbol ${name}`) : mark("symbol")
		}
		case 'bigint': {
			return (x as bigint).toString() + 'n'
		}
		case 'integer':case 'float': {
			return (x as number).toString()
		}
		case 'regexp': {
			const desc = esc(regexpDef(x))
			return desc ? mark(`regexp /${desc}/`) : mark("regexp")
		}
		case 'array': {
			assertIsArray(x)
			if (x.length === 0) {
				return '[]'
			}
			else {
				// --- Check if object was previously visited
				const prevpath = mapVisited.get(x)
				if (prevpath) {
					return mark(`ref ${prevpath}`)
				}
				else {
					mapVisited.set(x, buildPath(lPath))
					return seq2nice('-', x, hOptions, mapVisited, lPath)
				}
			}
		}
		case 'set': {
			assert((x instanceof Set))
			if (x.size === 0) {
				return mark('emptySet')
			}
			else {
				// --- Check if object was previously visited
				const prevpath = mapVisited.get(x)
				if (prevpath) {
					return mark(`ref ${prevpath}`)
				}
				else {
					mapVisited.set(x, buildPath(lPath))
					const lValues = Array.from(x.values())
					return seq2nice('--', lValues, hOptions, mapVisited, lPath)
				}
			}
		}
		case 'hash': {
			assertIsHash(x)
			const lKeys = Object.keys(x)
			if (lKeys.length === 0) {
				return '{}'
			}
			else {
				// --- Check if object was previously visited
				const prevpath = mapVisited.get(x)
				if (prevpath) {
					return mark(`ref ${prevpath}`)
				}
				else {
					mapVisited.set(x, buildPath(lPath))
					const getter = (name: string): unknown => x[name]
					return hash2nice(':', x, keys(x), getter, hOptions, mapVisited, lPath)
				}
			}
		}
		case 'map': {
			assert((x instanceof Map))
			if (x.size === 0) {
				return mark('emptyMap')
			}
			else {
				// --- Check if object was previously visited
				const prevpath = mapVisited.get(x)
				if (prevpath) {
					return mark(`ref ${prevpath}`)
				}
				else {
					mapVisited.set(x, buildPath(lPath))
					const getter = (name: string): unknown => {
						return x.get(name)
					}
					const lKeys = Array.from(x.keys())
					return hash2nice('::', x, lKeys, getter, hOptions, mapVisited, lPath)
				}
			}
		}
		case 'generator': {
			assertIsFunction(x)
			return mark(`generator ${functionName(x)}`)
		}
		case 'asyncGenerator': {
			assertIsFunction(x)
			return mark(`asyncGenerator ${functionName(x)}`)
		}
		case 'class': {
			assertIsClass(x)
			return mark(`class ${className(x)}`)
		}
		case 'plainFunction': {
			assertIsFunction(x)
			return mark(`function ${functionName(x)}`)
		}
	}

	return mark('unknown')
}

// ---------------------------------------------------------------------------
// --- val must be a primitive

export const displayStr = (
		key: string,
		val: unknown,
		parent: unknown,
		displayFunc: (TMapFunc | undefined),
		descFunc: (TMapFunc | undefined)
		): string => {

	assert(isPrimitive(val), `Not a primitive: ${val}`)
	const str = (
		  defined(displayFunc)
		? displayFunc(key, val, parent)
		: toNice(val)
		)
	return (
		  defined(descFunc)
		? f`${str} ${descFunc(key, val, parent)}:{cyan}`
		: str
		)
}

// ---------------------------------------------------------------------------

export const OL = (
		x: unknown,
		hOptions = {}
		): string => {

	type opt = {
		label: (string | undefined)
		pos: (number | undefined)
		debug: boolean
		}
	const {label, pos, debug} = getOptions<opt>(hOptions, {
		label: undef,
		pos: undef,
		debug: false
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
	writeln(sep(char, label, width))
	if (isString(x)) {
		if (nonEmpty(x)) {
			writeln(x)
		}
	}
	else {
		writeln(toNice(x, hOptions))
	}
	writeln(sep(char, (endLabel ? `END ${label}` : undef), width))
	return
}
