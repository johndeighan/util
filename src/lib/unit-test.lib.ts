"use strict";
// unit-test.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {cyan, red, green} from '@std/fmt/colors'
import {sprintf} from 'jsr:@std/fmt/printf'

import {
	assert, assertEquals, assertThrows, assertStrictEquals,
	AssertionError,
	} from '@std/assert'
import {doesNotThrow} from "node:assert"

import {LOG, DBG, pushLogLevel, popLogLevel} from 'logger'
import {allStackFrames, TStackFrame, frameStr,} from 'stack'
import {
	undef, defined, notdefined, pass, sleep, toBool,
	croak, TIterator, TAsyncIterator, getErrStr,
	} from 'base'
import {esc} from 'unicode'
import {unify} from 'unify'
import {
	TVoidFunc, hash, isString, isEmpty, nonEmpty,
	isIterator, isAsyncIterator, isIterable,
	isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {getOptions, truncStr, blockToArray, f, rtrim} from 'llutils'
import {TState, fromFSM} from 'fsm'
import {TextTable} from 'text-table'
import {parseText} from 'hera-parse'
import {mkDir, clearDir, barf} from 'fsys'
import {procOneFile} from 'proc-files'
import {doCompileFile} from 'automate'
import {typeCheckTsCode} from 'lltypescript'
import {getImportCode} from 'typescript'

let nextNum = 1

// ---------------------------------------------------------------------------

export var line = (n: number): string => {

	return cyan('line ' + n.toString())
}

// ---------------------------------------------------------------------------

const getTestName = (): string => {

	const n = nextNum
	nextNum += 1
	const frame = getMyOutsideCaller()
	return (defined(frame) ? `line ${frame.line}` : "line ?")
}

// ---------------------------------------------------------------------------

export const equal = (
		value: unknown,
		expected: unknown,
		name?: string
		): void => {

	const testName = name || getTestName()
	if (isString(value) && isString(expected)) {
		Deno.test({
			name: testName,
			sanitizeOps: true,
			fn() {
				const val1 = rtrim(value)
				const val2 = rtrim(expected)
				assertEquals(val1, val2)
			}
			})
	}
	else {
		Deno.test({
			name: testName,
			sanitizeOps: true,
			fn() {
				assertEquals(value, expected)
			}
			})
	}
	return
}

// ---------------------------------------------------------------------------

export const mark = (
		testName: string
		): void => {

	Deno.test({
		name: red(sprintf("%-7s", testName)),
		sanitizeOps: true,
		fn() {
			assertEquals(1, 1)
		}
		})
	return
}

// ---------------------------------------------------------------------------

export const truthy = (
		value: unknown,
		name?: string
		): void => {

	if (notdefined(name)) {
		name = getTestName()
	}
	Deno.test({
		name,
		sanitizeOps: true,
		fn() {
			assert(value)
		}
		})
	return
}

// ---------------------------------------------------------------------------

export const falsy = (
		value: unknown,
		name?: string
		): void => {

	Deno.test(name || getTestName(), () => {
		assert((!value))
	})
	return
}

// ---------------------------------------------------------------------------

export const succeeds = (
	func: TVoidFunc,
	name?: string
	): void => {

	Deno.test(name || getTestName(), () => {
		pushLogLevel('testing')
		let succeeds = true
		try {
			func()
		}
		catch (err) {
			succeeds = false
		}
		popLogLevel()
		if (!succeeds) {
			croak("in succeeds(), but function failed")
		}
		return
	})
	return
}

// ---------------------------------------------------------------------------

export const fails = (
	func: TVoidFunc,
	name?: string
	): void => {

	Deno.test(name || getTestName(), () => {
		pushLogLevel('testing')
		try {
			func()
			throw new Error("in fails(), but function succeeded")
		} catch(e) {}
		popLogLevel()
		return
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const succeedsAsync = (
	func: TVoidFunc,
	name?: string
	): void => {

	Deno.test(name || getTestName(), async () => {
		pushLogLevel('testing')
		let succeeds = true
		try {
			await func()
		}
		catch (err) {
			succeeds = false
		}
		popLogLevel()
		if (!succeeds) {
			croak("in succeeds(), but function failed")
		}
		return
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const failsAsync = (
	func: TVoidFunc,
	name?: string
	): void => {

	Deno.test(name || getTestName(), async () => {
		pushLogLevel('testing')
		try {
			await func()
			throw new Error("in fails(), but function succeeded")
		} catch(e) {}
		popLogLevel()
		return
	})
	return
}

// ---------------------------------------------------------------------------

export const generates = <TOut,>(
		value: TIterator<TOut>,
		expected: unknown,
		name?: string
		): void => {

	const lItems = [...value]
	Deno.test((name || getTestName()), () => {
		assertEquals(lItems, expected)
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const generatesAsync = async <TOut,>(
		value: TAsyncIterator<TOut>,
		expected: unknown,
		name?: string
		): AutoPromise<void> => {

	const lItems = await Array.fromAsync(value)
	Deno.test((name || getTestName()), () => {
		assertEquals(lItems, expected)
	})
	return
}

// ---------------------------------------------------------------------------

export const same = (
		value: unknown,
		expected: unknown,
		name?: string
		): void => {

	Deno.test(name || getTestName(), () => {
		assertStrictEquals(value, expected)
	})
	return
}

// ---------------------------------------------------------------------------

export const unifies = (
		value: unknown,
		expected: unknown,
		name?: string
		): void => {

	// --- if either value or expected is an iterator
	//     get an array from it
	if (isIterable(value)) {
		value = Array.from(value)
	}
	if (isIterable(expected)) {
		expected = Array.from(expected)
	}
	Deno.test(name || getTestName(), (): void => {
		unify(value, expected)
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const isType = async (
		typeStr: string,
		value: unknown,
		): AutoPromise<void> => {

	const testName = getTestName()
	// --- returns errMsg or '' if no type error
	const result = await checkType(typeStr, value)
	Deno.test(testName, () => {
		assert(result)
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const notType = async (
		typeStr: string,
		value: unknown,
		): AutoPromise<void> => {

	const testName = getTestName()
	const result = await checkType(typeStr, value)
	Deno.test(testName, () => {
		assert(!result)
	})
	return
}

// ---------------------------------------------------------------------------
// ASYNC
// returns error message or ''

const checkType = async (
		typeStr: string,
		value: unknown
		): AutoPromise<boolean> => {

	const valueStr = (
		  isFunction(value) ? functionDef(value)
		: isClass(value)    ? classDef(value)
		:                     JSON.stringify(value)
		)
	const tsCode = await getTsCode(typeStr, valueStr)

	// --- check if we need to import the type
	const importCode = getImportCode(typeStr)

	const code = `${importCode}
${tsCode}`

	return await typeCheckTsCode(code)
}

// ---------------------------------------------------------------------------
// --- We need to add ':unknown' to any function parameters
//     that don't have an explicit type

export const getTsCode = (
		typeStr: string,
		valueStr: string
		): string => {

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

export const getMyOutsideCaller = (
	trace: boolean = false
	): (TStackFrame | undefined) => {

	if (trace) {
		LOG('-'.repeat(70))
		for (const frame of allStackFrames()) {
			LOG(frameStr(frame))
		}
	}

	let mySrc: (string | undefined) = undef

	return fromFSM(allStackFrames(), [
		// --- state 0
		(frame: TStackFrame): TState => {
			if (
						(frame.name === 'getMyOutsideCaller')
					&& frame.source.match(/\bunit-test\.lib\.(?:ts|civet)$/)
					) {
				if (trace) {
					LOG("getMyOutsideCaller found, set state to 1")
				}
				return 1
			}
			else {
				return 0
			}
		},

		// --- state 1
		(frame: TStackFrame): TState => {
			const {source} = frame
			assert(defined(source), "source after getMyOutsideCaller is undef")
			mySrc = source
			return 2
		},

		// --- state 2
		(frame: TStackFrame): TState => {
			const {source} = frame
			if (source === mySrc) {
				return 2
			}
			else {
				throw frame
			}
		}     // found !
		],
		(finalState: TState) => {
			return undef
		},
		{})
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
// ASYNC

export const setDirTree = async (desc: string): AutoPromise<TFileOp[]> => {

	const lFileOps = await getFileOps(desc)
	await execFileOps(lFileOps)
	return lFileOps
}

// ---------------------------------------------------------------------------
// ASYNC

export const getFileOps = async (desc: string): AutoPromise<TFileOp[]> => {

	return await parseText<TFileOp[]>('dir-tree', desc)
}

// ---------------------------------------------------------------------------
// ASYNC

export const execFileOps = async (
		lFileOps: TFileOp[]
		): AutoPromise<void> => {

	for (const h of lFileOps) {
		switch(h.op) {
			case 'mkDir': {
				mkDir(h.path);break;
			}
			case 'clearDir': {
				clearDir(h.path);break;
			}
			case 'compile': {
				await procOneFile(h.path, doCompileFile);break;
			}
			case 'barf': {
				barf(h.path, h.contents);break;
			}
		}
	}
	return
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
					let i1 = 0;for (const line of lLines) {const i = i1++;
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
// --- Returns a function that, when called, returns a promise

export const mockAsyncTask = <T=unknown,>(
		value: T,
		ms: number = 10,
		doFail: boolean = false
		): () => Promise<T> => {

	return () => {
		return new Promise<T>(async (resolve, reject) => {
			DBG(`START TASK ${value}`)
			await sleep(ms)
			DBG(`END TASK ${value}`)
			if (doFail) {
				reject(new Error(`Task ${value} failed`))
			}
			else {
				resolve(value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// --- Returns a function that, when called, returns a promise

export const mockPromise = <T=unknown,>(
		value: T,
		ms: number = 10,
		doFail: boolean = false
		): Promise<T> => {

	return new Promise<T>(async (resolve, reject) => {
		DBG(`START TASK ${value}`)
		await sleep(ms)
		DBG(`END TASK ${value}`)
		if (doFail) {
			reject(new Error(`Task ${value} failed`))
		}
		else {
			resolve(value)
		}
	})
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
		await sleep(1000)
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

