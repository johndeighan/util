"use strict";
// unit-test.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	assert, assertEquals, assertStrictEquals, assertNotEquals,
	assertObjectMatch, assertStringIncludes, assertMatch,
	assertArrayIncludes,
	} from '@std/assert'

import {croak, justThrow} from 'croak'
import {TPredicate, anyOf, allOf} from 'predicates'
import {esc, mesc} from 'unicode'
import {
	undef, defined, notdefined, isEmpty, nonEmpty,
	array, arrayof, isArray, isHash, isString, hash, hashof,
	deepEqual, integer, isFunction, isClass, functionDef, classDef,
	TVoidFunc, TVoidIterator, getErrStr, isGenerator, isIterator,
	} from 'datatypes'
import {
	pass, o, keys, getOptions, spaces, blockToArray,
	truncStr, sleep,
	} from 'llutils'
import {splitLine, indented} from 'indent'
import {OL, ML, DUMP} from 'to-nice'
import {TextTable} from 'text-table'
import {
	pushLogLevel, popLogLevel,
	DBG, LOG, ERR, LOGVALUE, DBGVALUE,
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
import {getImportCode, typeCheckTsCode} from 'typescript'
import {getMyOutsideCaller} from 'v8-stack'
import {compileFile} from 'automate'

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
//      In a unit test, checks if  value is deeply equal to
//         the expected value.
//      Reports line number of the test.
//      If passed in iterator, will use Array.from() to get an array
//
//      e.g.
//      	equal 2+2, 4

export const equal = (
		value: unknown,
		expected: unknown
		): void => {

	const testName = getTestName()
	DBG(`equal ?, ${stringify(expected)} (${testName})`)
	Deno.test(testName, () => assertEquals(value, expected))
	return
}

// ---------------------------------------------------------------------------

export const same = (value: unknown, expected: unknown): void => {

	const testName = getTestName()
	DBG(`same ?, ${stringify(expected)} (${testName})`)
	Deno.test(testName, () => assertStrictEquals(value, expected))
	return
}

// ---------------------------------------------------------------------------

export const truthy = (value: unknown): void => {

	const testName = getTestName()
	DBG(`truthy ${stringify(value)} (${testName})`)
	Deno.test(testName, () => assert(value))
	return
}

// ---------------------------------------------------------------------------

export const falsy = (value: unknown): void => {

	const testName = getTestName()
	DBG(`falsy ${stringify(value)} (${testName})`)
	Deno.test(testName, () => assert((!value)))
	return
}

// ---------------------------------------------------------------------------

export const fails = (func: TVoidFunc): void => {

	const testName = getTestName()
	DBG(`fails <func> (${testName})`)
	Deno.test(testName, (): void => {
		pushLogLevel('silent') // --- silence any errors generated
		justThrow(true)
		try {
			func()
			throw new Error("in fails() - function succeeded")
		}
		catch (err) {
			pass()
		}
		finally {
			popLogLevel()
			justThrow(false)
		}
	})
	return
}

// ---------------------------------------------------------------------------

export const succeeds = (func: TVoidFunc): void => {

	const testName = getTestName()
	DBG(`succeeds <func> (${testName})`)
	Deno.test(testName, (): void => {
		pushLogLevel('silent') // --- silence any errors generated
		justThrow(true)
		try {
			func()
		}
		catch (err) {
			const errMsg = getErrStr(err)
			throw new Error(`in succeeds() - func failed with ${errMsg}`)
		}
		finally {
			popLogLevel()
			justThrow(false)
		}
	})
	return
}

// ---------------------------------------------------------------------------

export const iterEqual = (
		iter: Iterable<unknown>,
		expected: unknown[]
		): void => {

	const testName = getTestName()
	DBG(`iterEqual ?, ${stringify(expected)} (${testName})`)
	Deno.test(testName, () => assertEquals(Array.from(iter), expected))
	return
}

// ---------------------------------------------------------------------------

export const iterLike = (
		iter: Iterable<hash>,
		expected: hash[]
		): void => {

	const testName = getTestName()
	DBG(`iterEqual ?, ${stringify(expected)} (${testName})`)
	const lItems = Array.from(iter)
	const len = lItems.length
	Deno.test(`${testName}/len`, () => {
		assertEquals(len, expected.length)
	})
	let i1 = 0;for (const value of iter) {const i = i1++;
		const expect = expected[i]
		Deno.test(`${testName}/${i}`, () => {
			assertObjectMatch(value, expect)
		})
	}
	return
}

// ---------------------------------------------------------------------------

export const like = (
		value: (object | undefined),
		expected: hash
		): void => {

	const testName = getTestName()
	DBG(`like ?, ${stringify(expected)} (${testName})`)
	if (notdefined(value)) {
		Deno.test(testName, () => assertEquals(value, undef))
	}
	else {
		Deno.test(testName, () => assertObjectMatch(value, expected))
	}
	return
}

// ---------------------------------------------------------------------------

export const hashLike = (
		h: hash,
		hPat: hash
		): boolean => {

	const lHashKeys = keys(h)
	for (const key of keys(hPat)) {
		if (lHashKeys.includes(key)) {
			const patVal = hPat[key]
			if (defined(patVal) && !deepEqual(h[key], patVal)) {
				return false
			}
		}
		else {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------

export type THashCompareFunc = (h1: hash, h2: hash) => number
export type THashLikeFunc = (h: hash, hPat: hash) => boolean
export type THashToStringFunc = (h: hash) => string

export const objListLike = (
		value: hash[],
		expected: hash[],
		strFunc: (THashToStringFunc | undefined) = undef,
		likeFunc: THashLikeFunc = hashLike // used for comparison
		): void => {

	const testName = getTestName()
	DBG(`objListLike ?, ${stringify(expected)}`)
	DBG(`strFunc is ${OL(strFunc)}`)
	const len = value.length
	Deno.test(`${testName}/len`, () => assertEquals(len, expected.length))
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
		Deno.test(`${testName}/${i}`, () => assert(likeFunc(lVals[i], lExp[i])))
	}
	return
}

// ---------------------------------------------------------------------------

type TSplitResult = [string[], string]

export const splitFuncStr = (valueStr: string): (TSplitResult | undefined) => {

	let ref;if ((ref = valueStr.match(/^\(([^\)]*)\)\s*[\=\-]\>\s*(.*)$/))) {const lMatches = ref;
		const [_, strParms, strBody] = lMatches
		if (isEmpty(strParms)) {
			return [[], strBody]
		}
		else {
			return [
				strParms.split(',').map((x) => x.trim()),
				strBody
				]
		}
	}
	else {
		return undef
	}
}

// ---------------------------------------------------------------------------
// --- We need to add ':unknown' to any function parameters
//     that don't have an explicit type

export const getTsCode = (
		typeStr: string,
		valueStr: string
		): string => {

	DBGVALUE('typeStr', typeStr)
	DBGVALUE('valueStr', valueStr)
	const result = splitFuncStr(valueStr)
	if (defined(result)) {
		const [lParms, body] = result
		const addType = (parm: string): string => {
			if (parm.indexOf(':') >= 0) {
				return parm
			}
			else {
				return `${parm}: unknown`
			}
		}
		const parmStr = lParms.map(addType).join(', ')
		return `const x: ${typeStr} = (${parmStr}) => ${body}`
	}
	else {
		return `const x: ${typeStr} = ${valueStr}`
	}
}

// ---------------------------------------------------------------------------
// throws on error

export const checkType = (
		typeStr: string,
		value: unknown
		): string => {

	const valueStr = (
		  isFunction(value) ? functionDef(value)
		: isClass(value)    ? classDef(value)
		:                     JSON.stringify(value)
		)
	const tsCode = getTsCode(typeStr, valueStr)

	// --- check if we need to import the type
	const importCode = getImportCode(typeStr)

	const code = `${importCode}
${tsCode}`

	return typeCheckTsCode(code)
}

// ---------------------------------------------------------------------------

export const isType = (
		typeStr: string,
		value: unknown,
		isOfType: ((Function | undefined)) = undef
		): void => {

	const testName = getTestName()
	if (defined(isOfType)) {
		DBG("Using type guard")
		Deno.test(testName, () => assert(isOfType(value)))
	}
	else {
		// --- returns errMsg or '' if no type error
		const errMsg = checkType(typeStr, value)
		Deno.test(testName, () => assert(isEmpty(errMsg)))
	}
	return
}

// ---------------------------------------------------------------------------

export const notType = (
		typeStr: string,
		value: unknown,
		isOfType: (Function | undefined) = undef
		): void => {

	const testName = getTestName()
	if (defined(isOfType)) {
		DBG("Using type guard")
		Deno.test(testName, () => assert(!isOfType(value)))
	}
	else {
		const errMsg = checkType(typeStr, value)
		Deno.test(testName, () => assert(nonEmpty(errMsg)))
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
				compileFile(h.path);break;
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
					let i2 = 0;for (const line of lLines) {const i = i2++;
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
//     There should be at least one for each jsType

class MyClass {
	fname: string
	lname: string
	constructor(fname1: string, lname1: string){this.fname = fname1;this.lname = lname1;}
	fullname() {
		return `${this.fname} ${this.lname}`
	}
}

export const sampleVal: hash = {
	undef: undefined,
	null: null,
	emptyStr: '',
	str: 'abc',
	i: 42,
	f: 3.14159,
	inf: Infinity,
	neginf: -Infinity,
	NaN: Number.NaN,
	b: true,
	sym: Symbol('xxx'),
	genFunc: function*() {
		yield 42
		return
	},
	asyncGenFunc: async function*() {
		await sleep(1)
		yield 42
		return
	},
	regularFunc:    function(): number { return 42 },
	lambdaFunc:     (): number => { return 42 },
	falsePredicate: () => { return false },
	truePredicate:  () => { return true },
	emptyHash: {},
	fullHash: {a: 42},
	emptyList: [],
	fullList: [42],
	MyClass
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

// ---------------------------------------------------------------------------

export const goodPromise = <T,>(
		val: T,
		sleepFor: number = 1
		): Promise<T> => {

	return new Promise((resolve, reject) => {
		sleep(sleepFor)
		resolve(val)
	})
}

// ---------------------------------------------------------------------------

export const badPromise = <T,>(
		errMsg: string,
		sleepFor: number = 1
		): Promise<T> => {

	return new Promise((resolve, reject) => {
		sleep(sleepFor)
		reject(new Error(errMsg))
	})
}

