"use strict";
// unit-test.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	assert, assertEquals, assertStrictEquals, assertNotEquals,
	assertObjectMatch, assertStringIncludes, assertMatch,
	assertArrayIncludes,
	} from '@std/assert'

import {esc, mesc} from 'unicode'
import {
	undef, defined, notdefined, isEmpty, nonEmpty,
	array, arrayof, isArray, isHash, isString, hash, hashof,
	deepEqual, hashLike, integer, THashCompareFunc,
	THashLikeFunc, THashToStringFunc, TFilterFunc,
	normalizeCode, isFunction, isClass, functionDef, classDef,
	TVoidFunc, TVoidIterator, getErrStr,
	croak, assertIsDefined, isGenerator, isIterator,
	} from 'datatypes'
import {
	pass, o, keys, getOptions, spaces, blockToArray,
	allLinesInBlock, truncStr, sleep,
	} from 'llutils'
import {splitLine, indented} from 'indent'
import {OL, ML, DUMP} from 'to-nice'
import {TextTable} from 'text-table'
import {
	pushLogLevel, popLogLevel,
	DBG, LOG, LOGVALUE, DBGVALUE,
	INDENT, UNDENT,
	} from 'logger'
import {flag} from 'cmd-args'
import {
	relpath, mkDir, barf, getPathType, fileExt,
	isDir, clearDir,
	} from 'fsys'
import {Fetcher} from 'fetcher'
import {doParse} from 'hera-parse'
import {TPLLToken, allTokensInBlock, tokenTable, tkEOF} from 'pll'
import {civet2tsFile} from 'civet'
import {sourceLib, getNeededImportStmts} from 'symbols'
import {getTsCode, getImportCode, typeCheckTsCode} from 'typescript'
import {getMyOutsideCaller} from 'v8-stack'

const stringify = JSON.stringify

// ---------------------------------------------------------------------------

const getTestName = (): string => {

	pushLogLevel('silent')
	const frame = getMyOutsideCaller()
	popLogLevel()
	if (defined(frame)) {
		const {line} = frame
		DBG(`TEST NAME: line ${line}`)
		return `line ${line}`
	}
	else {
		return "Unknown line"
	}
}

// ---------------------------------------------------------------------------

const procValue = (x: unknown): unknown => {

	return (
		  Array.isArray(x) ? x
		: isGenerator(x)   ? Array.from(x())
		: isIterator(x)    ? Array.from(x)
		:                    x
		)
}

// ---------------------------------------------------------------------------
//      In a unit test, checks if  value is deeply equal to
//         the expected value.
//      Reports line number of the test.
//      If passed in iterator, will use Array.from() to get an array
//
//      e.g.
//      	equal 2+2, 4

export const equal = (value: unknown, expected: unknown): boolean => {

	const name = getTestName()
	const newVal = procValue(value)
	const newExpect = procValue(expected)
	DBG(`equal ?, ${stringify(newExpect)} (${name})`)
	Deno.test(name, () => assertEquals(newVal, newExpect))
	try {
		assertEquals(newVal, newExpect)
		return true
	}
	catch (err) {
		return false
	}
}

// ---------------------------------------------------------------------------

export const same = (value: unknown, expected: unknown): void => {

	const name = getTestName()
	DBG(`same ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertStrictEquals(value, expected))
	return
}

// ---------------------------------------------------------------------------

export const truthy = (value: unknown): void => {

	const name = getTestName()
	DBG(`truthy ${stringify(value)} (${name})`)
	Deno.test(name, () => assert(value))
	return
}

// ---------------------------------------------------------------------------

export const falsy = (value: unknown): void => {

	const name = getTestName()
	DBG(`falsy ${stringify(value)} (${name})`)
	Deno.test(name, () => assert((!value)))
	return
}

// ---------------------------------------------------------------------------

export const fails = (func: TVoidFunc): void => {

	pushLogLevel('silent') // --- silence any errors generated
	const name = getTestName()
	DBG(`fails <func> (${name})`)
	Deno.test(name, (): void => {
		try {
			func()
			popLogLevel()
			throw new Error("Test Failure - function succeeds!!!")
		}
		catch (err) {
			popLogLevel()
		}
	})
	return
}

// ---------------------------------------------------------------------------

export const succeeds = (func: TVoidFunc): void => {

	assert((typeof func === 'function'), "test succeeds() passed non-function")
	const name = getTestName()
	DBG(`succeeds <func> (${name})`)
	Deno.test(name, (): void => {
		try {
			func()
		}
		catch (err) {
			const errMsg = getErrStr(err)
			console.log(errMsg)
			const fullErrMsg = `FAIL - func throws (${errMsg})`
			console.log(fullErrMsg)
			throw new Error(fullErrMsg)
		}
	})
	return
}

// ---------------------------------------------------------------------------

export const iterEqual = (
		iter: Iterable<unknown>,
		expected: unknown[]
		): void => {

	const name = getTestName()
	DBG(`iterEqual ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertEquals(Array.from(iter), expected))
	return
}

// ---------------------------------------------------------------------------

export const iterLike = (
		iter: Iterable<hash>,
		expected: hash[]
		): void => {

	const name = getTestName()
	DBG(`iterEqual ?, ${stringify(expected)} (${name})`)
	const lItems = Array.from(iter)
	const len = lItems.length
	Deno.test(`${name}/len`, () => assertEquals(len, expected.length))
	for (let end = len - 1, i1 = 0, asc = 0 <= end; (asc? (i1 <= end) : (i1 >= end)); (asc? (++i1) : (--i1))) {
		const i = i1
		// @ts-ignore
		Deno.test(`${name}/${i}`, () => assertObjectMatch(lItems[i], expected[i]))
	}
	return
}

// ---------------------------------------------------------------------------

export const matches = (value: unknown, expected: unknown): void => {

	assert(isString(value), `Not a string: ${value}`)
	const name = getTestName()
	DBG(`matches ?, ${stringify(expected)} (${name})`)
	if (isString(expected)) {
		Deno.test(name, () => assertStringIncludes(value, expected))
	}
	else if (expected instanceof RegExp) {
		Deno.test(name, () => assertMatch(value, expected))
	}
	else {
		Deno.test(name, () => assert(false))
	}
	return
}

// ---------------------------------------------------------------------------

export const like = (value: (object | undefined), expected: hash): void => {

	const name = getTestName()
	DBG(`like ?, ${stringify(expected)} (${name})`)
	if (notdefined(value)) {
		Deno.test(name, () => assertEquals(value, undef))
	}
	else {
		Deno.test(name, () => assertObjectMatch(value, expected))
	}
	return
}

// ---------------------------------------------------------------------------

export const codeLike = (value: string, expected: string): void => {

	const name = getTestName()
	DBG(`codeLike ?, ${stringify(expected)} (${name})`)
	Deno.test(name, (): void => {
		assertEquals(normalizeCode(value), normalizeCode(expected))
	})
	return
}

// ---------------------------------------------------------------------------

export const strListLike = (
		value: string[],
		expected: string[]
		): void => {

	const name = getTestName()
	DBG(`strListLike ?, ${stringify(expected)}`)
	const len = value.length
	Deno.test(`${name}/len`, () => assertEquals(len, expected.length))
	if (len === 0) {
		return
	}
	const lValues = value.toSorted()
	const lExpected = expected.toSorted()
	for (let end1 = len - 1, i2 = 0, asc1 = 0 <= end1; (asc1? (i2 <= end1) : (i2 >= end1)); (asc1? (++i2) : (--i2))) {
		const i = i2
		const val = lValues[i]
		const exp = lExpected[i]
		// @ts-ignore
		Deno.test(`${name}/${i}`, () => assertEquals(val, exp))
	}
	return
}

// ---------------------------------------------------------------------------

export const objListLike = (
		value: hash[],
		expected: hash[],
		strFunc: (THashToStringFunc | undefined) = undef,
		likeFunc: THashLikeFunc = hashLike // used for comparison
		): void => {

	const name = getTestName()
	DBG(`objListLike ?, ${stringify(expected)}`)
	DBG(`strFunc is ${OL(strFunc)}`)
	const len = value.length
	Deno.test(`${name}/len`, () => assertEquals(len, expected.length))
	if (len === 0) {
		return
	}
	// --- create the arrays to actually be compared
	let lVals: hash[] = value
	if (defined(strFunc)) {
		const compareFunc: THashCompareFunc = (a: hash, b: hash) => {
			const str1 = strFunc(a)
			const str2 = strFunc(b)
			return (()=>{if (str1 < str2) { return -1} else if (str1 > str2) { return 1} else return 0})()
		}
		lVals = value.toSorted(compareFunc)
	}
	const nVals = lVals.length
	DBG(`lVals is array of length ${nVals}`)
	let lExp: hash[] = value
	if (defined(strFunc)) {
		DBG("strFunc defined")
		const compareFunc: THashCompareFunc = (a: hash, b: hash) => {
			const str1 = strFunc(a)
			const str2 = strFunc(b)
			return (()=>{if (str1 < str2) { return -1} else if (str1 > str2) { return 1} else return 0})()
		}
		lExp = expected.toSorted(compareFunc)
	}
	const nExp = lExp.length
	DBG(`lExp is array of length ${nExp}`)
	for (let end2 = len - 1, i3 = 0, asc2 = 0 <= end2; (asc2? (i3 <= end2) : (i3 >= end2)); (asc2? (++i3) : (--i3))) {
		const i = i3
		// @ts-ignore
		Deno.test(`${name}/${i}`, () => assert(likeFunc(lVals[i], lExp[i])))
	}
	return
}

// ---------------------------------------------------------------------------

export const includes = (value: unknown, expected: unknown): void => {

	assert(Array.isArray(value), `not an array: ${value}`)
	const name = getTestName()
	DBG(`includes ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertArrayIncludes(value, [expected]))
	return
}

// ---------------------------------------------------------------------------

export const includesAll = (value: unknown, expected: unknown): void => {
	assert(Array.isArray(value), `not an array: ${value}`)
	assert(Array.isArray(expected), `not an array: ${expected}`)
	const name = getTestName()
	DBG(`includesAll ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertArrayIncludes(value, expected))
	return
}

// ---------------------------------------------------------------------------
// throws on error

export const checkType = (
		typeStr: string,
		value: unknown,
		expectSuccess: boolean = true
		): void => {

	const valueStr = (
		  isFunction(value) ? functionDef(value)
		: isClass(value)    ? classDef(value)
		:                     JSON.stringify(value)
		)
	const tsCode = getTsCode(typeStr, valueStr)
	DUMP(tsCode, 'tsCode')

	// --- check if we need to import the type
	const importCode = getImportCode(typeStr)
	DUMP(importCode, 'importCode')

	const code = `${importCode}
${tsCode}`
	DUMP(code, 'code')

	const errMsg = typeCheckTsCode(code)
	if (errMsg) {
		croak(errMsg)
	}
	return
}

// ---------------------------------------------------------------------------

export const isType = (
		typeStr: string,
		value: unknown,
		isOfType: ((Function | undefined)) = undef
		): void => {

	const name = getTestName()
	if (defined(isOfType)) {
		DBG("Using type guard")
		Deno.test(name, () => assert(isOfType(value)))
	}
	else {
		DBG(INDENT)
		let errMsg: (string | undefined) = undef
		try {
			checkType(typeStr, value, true)
		}
		catch (err) {
			console.log(`TYPE ERROR: ${getErrStr(err)}`)
			errMsg = getErrStr(err)
		}
		DBG(UNDENT)
		Deno.test(name, () => assert(isEmpty(errMsg)))
	}
	return
}

// ---------------------------------------------------------------------------

export const notType = (
		typeStr: string,
		value: unknown,
		isOfType: (Function | undefined) = undef
		): void => {

	const name = getTestName()
	if (defined(isOfType)) {
		DBG("Using type guard")
		Deno.test(name, () => assert(!isOfType(value)))
	}
	else {
		DBG(INDENT)
		let errMsg: (string | undefined) = undef
		try {
			checkType(typeStr, value, false)
		}
		catch (err) {
			errMsg = getErrStr(err)
		}
		DBG(UNDENT)
		Deno.test(name, () => assert(nonEmpty(errMsg)))
	}
	return
}

// ---------------------------------------------------------------------------

export type TFileOp = {
		op: 'mkDir' | 'clearDir' | 'compile'
		path: string
		}
	| {
		op: 'barf'
		path: string
		contents: string
		}

// ---------------------------------------------------------------------------

export const execFileOps = (
		lFileOps: TFileOp[]
		): void => {

	for (const h of lFileOps) {
		switch(h.op) {
			case 'mkDir': {
				mkDir(h.path);break;
			}
			case 'clearDir': {
				clearDir(h.path);break;
			}
			case 'compile': {
				civet2tsFile(h.path);break;
			}
			case 'barf': {
				barf(h.path, h.contents);break;
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const getFileOps = async (desc: string): AutoPromise<TFileOp[]> => {

	const lFileOps = await doParse<TFileOp[]>('dir-tree', desc)
	return lFileOps
}

// ---------------------------------------------------------------------------
// ASYNC

export const setDirTree = async (desc: string): AutoPromise<TFileOp[]> => {

	const lFileOps = await getFileOps(desc)
	execFileOps(lFileOps)
	return lFileOps
}

// ---------------------------------------------------------------------------

export const fileOpsTable = (
		lFileOps: TFileOp[],
		hOptions: hash = {}
		): string => {

	type opt = {
		oneLine: boolean
		trunc: number
		}
	const {oneLine, trunc} = getOptions<opt>(hOptions, {
		oneLine: true,
		trunc: 32
		})

	const tt = new TextTable("l l l")
	tt.fullsep()
	tt.title('FILE OPS')
	tt.fullsep()
	tt.labels(['op', 'path', 'contents'])
	tt.sep()
	for (const h of lFileOps) {
		switch(h.op) {
			case 'barf': {
				const {path, contents} = h
				const str = contents || ''
				if (str.length === 0) {
					tt.data(['barf', path, '<empty>'])
				}
				else if (oneLine) {
					const output = truncStr(esc(str), trunc)
					tt.data(['barf', path, output])
				}
				else {
					const lLines = blockToArray(str)
					let i4 = 0;for (const line of lLines) {const i = i4++;
						const contents = truncStr(esc(lLines[i]), trunc)
						if (i === 0) {
							tt.data(['barf', path, contents])
						}
						else {
							tt.data(['', '', contents])
						}
					}
				};break;
			}
			default: {
				tt.data([h.op, h.path, ''])
			}
		}
	}
	tt.fullsep()
	return tt.asString()
}

// ---------------------------------------------------------------------------
// --- Create some values for testing

export const sampleVal: hashof<unknown> = {
	undef: undefined,
	null: null,
	emptyStr: '',
	str: 'abc',
	i: 42,
	f: 3.14159,
	b: true,
	genFunc: function*() {
		yield 42
		return
	},
	asyncGenFunc: async function*() {
		await sleep(1)
		yield 42
		return
	},
	regularFunc: function() {
		return 42
	},
	lambdaFunc: () => {
		return 42
	},
	emptyHash: {},
	fullHash: {a: 42},
	emptyList: [],
	fullList: [42]
	}

// ---------------------------------------------------------------------------
// --- Returns true only if all the named values return true
//     AND all the not named values return false

export const allTrue = (
		lNames: string[],
		pred: TFilterFunc
		): boolean => {

	for (const name of lNames) {
		if (!pred(sampleVal[name])) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// --- Returns true only if all the named values return true

export const allFalse = (
		lNames: string[],
		pred: TFilterFunc
		): boolean => {

	for (const name of lNames) {
		if (pred(sampleVal[name])) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------

export const getPromiseOf = async function<T>(
		value: T,
		sleepFor = 1
		): AutoPromise<T> {

	await sleep(sleepFor)
	// @ts-ignore
	return value
}

// ---------------------------------------------------------------------------

export const getRejectedPromiseOf = async function<T>(
		errMsg: string,
		sleepFor = 1
		): AutoPromise<never> {

	await sleep(sleepFor)
	throw new Error(errMsg)
}

// ---------------------------------------------------------------------------

export const generateSync = function*<T>(
		lItems: T[],
		): Generator<T> {

	for (const item of lItems) {
		yield item
	}
	return
}

// ---------------------------------------------------------------------------

export const generateAsync = async function*<T>(
		lItems: T[],
		sleepFor = 1
		): AsyncGenerator<T> {

	for (const item of lItems) {
		await sleep(sleepFor)
		yield item
	}
	return
}

