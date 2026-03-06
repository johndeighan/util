"use strict";
// datatypes.lib.civet

import {minify} from 'npm-uglify-js'
import deepEqual from 'npm-fast-deep-equal'

export {deepEqual}

export type TIterator<T, U=void, V=void> = Generator<T, U, V>
export type TAsyncIterator<T, U=void, V=void> = AsyncGenerator<T, U, V>
export type TNonFunction<T=unknown> = Exclude<T, Function>

export var deepCopy = structuredClone

// ---------------------------------------------------------------------------

export type char = string
export type integer = number
export type nonEmptyString = string
export type regexp = RegExp
export type TIntArray = integer[]

export type TVoidFunc = () => void
export type TVoidIterator<T=unknown> = () => TIterator<T>
export type TUnaryFunc<TIn, TOut> = (item: TIn) => TOut
export type TFilterFunc = (item: unknown) => boolean
export type TStringifier = (item: unknown) => string
export type TStringMapper = (str: string) => string
export type TStringFilterFunc = (str: string) => boolean

// ---------------------------------------------------------------------------

export const croak = (msg: string): never => {

	throw new Error(msg)
}

// ---------------------------------------------------------------------------

export type TAssertFunc = (
		cond: unknown,
		msg?: string
		) => asserts cond

export const assert: TAssertFunc = (
		cond: unknown,
		msg: string = "An error occurred"
		): asserts cond => {

	if (!cond) {
		croak(msg)
	}
	return
}

// ---------------------------------------------------------------------------

export const undef = undefined
type TDefined = NonNullable<unknown>
type TNotDefined = null | undefined

// ---------------------------------------------------------------------------

export const defined = (x: unknown): x is TDefined => {

	return (x !== undef) && (x !== null)
}

// ---------------------------------------------------------------------------

export const anyDefined = (...lItems: unknown[]): boolean => {

	for (const item of lItems) {
		if (defined(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

export const notdefined = (x: unknown): x is TNotDefined => {

	return (x === undef) || (x === null)
}

// ---------------------------------------------------------------------------

export const anyNotDefined = (...lItems: unknown[]): boolean => {

	for (const item of lItems) {
		if (notdefined(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

const GenFunc = (function* () {}).constructor
const AsyncGenFunc = (async function* () {}).constructor

export const jsType = (x: unknown): string => {

	switch(typeof x) {
		case 'undefined': {
			return 'undef'
		}
		case 'boolean':case 'string':case 'symbol':case 'bigint': {
			return typeof x
		}
		case 'number': {
			if (Number.isFinite(x)) {
				return Number.isInteger(x) ? 'integer' : 'float'
			}
			else {
				return (
					  Number.isNaN(x)  ? 'NaN'
					: (x === -Infinity) ? 'neginf'
					:                    'inf'
					)
			}
		}
		case 'object': {
			return (
				  (x === null)           ? 'null'
				: (x instanceof RegExp) ? 'regexp'
				: (x instanceof Set)    ? 'set'
				: (x instanceof Map)    ? 'map'
				: Array.isArray(x)      ? 'array'
				: isIterator(x)         ? 'iterator'
				: isAsyncIterator(x)    ? 'asyncIterator'
				:                         'hash'
				)
		}
		case 'function': {
			return (
				  x.toString().startsWith('class ') ? 'class'
				: (x instanceof GenFunc)            ? 'generator'
				: (x instanceof AsyncGenFunc)       ? 'asyncGenerator'
				:                                     'plainFunction'
				)
		}
	}
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export type hashof<T> = {
	[key: string | symbol]: T
}
export type hash = hashof<unknown>

export type arrayof<T> = T[]
export type array = arrayof<unknown>

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export const isString = (x: unknown): x is string => {

	return (typeof x === 'string') || (x instanceof String)
}

// ---------------------------------------------------------------------------

export const isChar = (x: unknown): x is char => {

	return isString(x) && (x.length === 1)
}

// ---------------------------------------------------------------------------

export const isBoolean = (x: unknown): x is boolean => {

	return (typeof x === 'boolean') || (x instanceof Boolean)
}

// ---------------------------------------------------------------------------

export const isNumber = (x: unknown): x is number => {

	return (
		   (typeof x === 'bigint')
		|| (typeof x === 'number')
		|| (x instanceof Number)
		)
}

// ---------------------------------------------------------------------------

export const isInteger = (x: unknown): x is integer => {

	return isNumber(x) && Number.isInteger(x.valueOf())
}

// ---------------------------------------------------------------------------

export const isRegExp = (item: unknown): item is regexp => {

	return (item instanceof RegExp)
}

// ---------------------------------------------------------------------------

export const regexpDef = (x: unknown): string => {

	if ((typeof x === 'object') && (x instanceof RegExp)) {
		return x.source
	}
	croak("Not a RegExp")
	return ''
}
// --- TypeScript bug

// ---------------------------------------------------------------------------

export const isHash = (x: unknown): x is hash => {

	return (jsType(x) === 'hash')
}

// ---------------------------------------------------------------------------

export const isArray = (x: unknown): x is array => {

	return Array.isArray(x)
}

// ---------------------------------------------------------------------------

export const isSymbol = (x: unknown): x is symbol => {

	return (typeof x === 'symbol')
}

// ---------------------------------------------------------------------------

export const symbolName = (x: unknown): string => {

	if (typeof x === 'symbol') {
		return x.description || ''
	}
	throw new Error(`Not a symbol: ${x}`)
}

// ---------------------------------------------------------------------------

export const isObject = (x: unknown): x is object => {

	return (typeof x === 'object') && (x !== null)
}

// ---------------------------------------------------------------------------

export const isFunction = (item: unknown): item is Function => {

	return (typeof item === 'function')
}

// ---------------------------------------------------------------------------

export const functionName = (x: Function): string => {

	return x.name || '<anonymous>'
}

// ---------------------------------------------------------------------------

export const functionDef = (x: Function): string => {

	return normalizeExpr(x.toString())
}

// ---------------------------------------------------------------------------

export const isClass = (x: unknown): boolean => {

	return (typeof x === 'function') && x.toString().startsWith('class ')
}

// ---------------------------------------------------------------------------

export const className = (x: unknown): string => {

	// --- item can be a class or an object
	if ((typeof x === 'function') && x.toString().startsWith('class')) {
		return x.name || '<unknown>'
	}

	if ((typeof x === 'object') && (x !== null)) {
		return x.constructor.name || '<none>'
	}

	croak("Not a class")
	return ''
}    // --- TypeScript bug

// ---------------------------------------------------------------------------

export const classDef = (x: unknown): string => {

	if ((typeof x === 'function') && x.toString().startsWith('class')) {
		return normalizeCode(x.toString())
	}
	croak("Not a class")
	return ''
}     // --- TypeScript bug

// ---------------------------------------------------------------------------
// --- NOTE: An '&' preceding a key name indicates
//           that it should be a function

export const isClassInstance = (
		x: unknown,
		lReqKeys: string[] = []
		): boolean => {

	if ((typeof x !== 'object') || isArray(x) || isPromise(x)) {
		return false
	}
	if (notdefined(x?.constructor?.name)) {
		return false
	}
	if (isHash(x) && (x !== null)) {
		for (const reqKey of lReqKeys) {
			const lMatches = reqKey.match(/^(\&)(.*)$/)
			assert(defined(lMatches))
			const [_, type, key] = lMatches
			if (key in x) {
				const item: unknown = x[key]
				if (nonEmpty(item)) {
					if ((type === '&') && (typeof item !== 'function')) {
						return false
					}
				}
				else {
					return false
				}
			}
			else {
				return false
			}
		}
	}
	return true
}

// ---------------------------------------------------------------------------

export const isNonEmptyString = (x: unknown): x is nonEmptyString => {

	// --- must contain non-whitespace character
	return isString(x) && defined(x.match(/\S/))
}

// ---------------------------------------------------------------------------

export const lPrimTypes = [
	'undefined',
	'boolean',
	'string',
	'symbol',
	'bigint',
	'number',
	'function'
	]

export const isPrimitive = (x: unknown): boolean => {

	return (
		   (x === null)
		|| lPrimTypes.includes(typeof x)
		|| (x instanceof RegExp)
		)
}

// ---------------------------------------------------------------------------

export const isNonPrimitive = (x: unknown): boolean => {

	return !isPrimitive(x)
}

// ---------------------------------------------------------------------------

export const isEmpty = (x: unknown): boolean => {

	if ((x === undef) || (x === null)) {
		return true
	}
	if (isString(x)) {
		return (x.match(/^\s*$/) !== null)
	}
	if (isArray(x)) {
		return (x.length === 0)
	}
	if ((x instanceof Set) || (x instanceof Map)) {
		return (x.size === 0)
	}
	if (typeof x === 'object') {
		return (Object.keys(x).length === 0)
	}
	else {
		return false
	}
}

// ---------------------------------------------------------------------------

export const nonEmpty = (x: unknown): boolean => {

	return !isEmpty(x)
}

// ---------------------------------------------------------------------------

// --- Functions to normalize JavaScript code & expressions
//     Only used internally in functionDef() and classDef()

// ---------------------------------------------------------------------------

const uniqInt = function*(start: number = 1): Generator<number> {
	for (let i1 = start, asc = start <= 1000000; asc ? i1 <= 1000000 : i1 >= 1000000; asc ? ++i1 : --i1) {const i = i1;
		yield i
	}
}

const addFunctionNames = (code: string): string => {
	// --- The names we add will look like: '__dummy99' where
	//     '99' can be any sequence of digits
	//     to make it trivial to remove them later

	const gen = uniqInt()     // create an iterator

	// --- Args to replacer function are:
	//    function replacer(match, p1, p2, /* …, */ pN, offset, string, groups) {
	//       return replacement;
	//	     }

	const replaceFunc = (match: string, aster: (string | undefined)) => {
		return `function${aster} __dummy${gen.next().value}(`
	}
	return code.replaceAll(/function\s*(\*)?\s*\(/g, replaceFunc)
}

// ---------------------------------------------------------------------------

const removeFunctionNames = (code: string): string => {

	return code.replaceAll(/__dummy\d+/g, '')
}

// ---------------------------------------------------------------------------

const normalizeCode = (code: string): string => {

	// --- Due to a bug in JavaScript, we have to make sure
	//     that all function names (even in generators)
	//     have a name, which we must remove after minimization
	const newCode = addFunctionNames(code)

	// --- Remove extra whitespace
	//     Remove extra parens from '(str)=>return'
	//     Remove comments

	const hOptions = {
		annotations: false,
		mangle: false,
		compress: undefined,
		keep_fargs: true,
		keep_fnames: true,
		warnings: true
		}

	const hResult = minify(newCode, hOptions)
	if (hResult.error) {
		throw new Error(hResult.error.message)
	}
	else if (hResult.code) {
		return removeFunctionNames(hResult.code)
	}
	else {
		throw new Error("Unknown error in normalizeCode()")
	}
}

// ---------------------------------------------------------------------------

const normalizeExpr = (code: string): string => {

	const str = normalizeCode(code)
	const len = str.length
	if (str[len - 1] === ';') {
		return str.substring(0, len - 1)
	}
	else {
		return str
	}
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const asStringIs = (x: unknown, str: string): boolean => {

	return (Object.prototype.toString.call(x) === str)
}

// ---------------------------------------------------------------------------

export const isArrayOfStrings = (x: unknown): x is string[] => {

	if (!Array.isArray(x)) {
		return false
	}
	for (const item of x) {
		if (!isString(item)) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------

export const isArrayOfIntegers = (x: unknown): x is TIntArray => {

	if (!Array.isArray(x)) {
		return false
	}
	for (const item of x) {
		if (!isInteger(item)) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------

export const isPromise = <T,>(x: unknown): x is Promise<T> => {

	return (
		   (typeof x === 'object')
		&& (x !== null)
		&& ('then' in x)
		&& (typeof x.then === 'function')
		)
}

// ---------------------------------------------------------------------------

export const isGenerator = (x: unknown): x is GeneratorFunction => {

	return isFunction(x) && asStringIs(x, "[object GeneratorFunction]")
}

// ---------------------------------------------------------------------------

export const isAsyncGenerator = (x: unknown): x is GeneratorFunction => {

	return isFunction(x) && asStringIs(x, "[object AsyncGeneratorFunction]")
}

// ---------------------------------------------------------------------------

export const isIterator = <T,>(x: unknown): x is IterableIterator<T> => {

	if (
			   (typeof x !== 'object')
			|| (x === null)
			|| (!('next' in x))
			|| (typeof x.next !== 'function')
			|| (!(Symbol.iterator in x))
			) {
		return false
	}
	const iter = x[Symbol.iterator]
	return (typeof iter === 'function') && (iter.call(x) === x)
}

// ---------------------------------------------------------------------------

export const isAsyncIterator = <T,>(x: unknown): x is AsyncIterableIterator<T> => {

	if (
 			   (typeof x !== 'object')
 			|| (x === null)
			|| (!('next' in x))
			|| (typeof x.next !== 'function')
			|| (!(Symbol.asyncIterator in x))
			) {
		return false
	}
	const iter = x[Symbol.asyncIterator]
	return (typeof iter === 'function') && (iter.call(x) === x)
}

// ---------------------------------------------------------------------------

export const getErrStr = (err: unknown): string => {

	if (typeof err === 'string') {
		return err
	}
	else if (err instanceof Error) {
		return err.message
	}
	else {
		return "Serious Error"
	}
}

