"use strict";
// unit-test.lib.civet

type AutoPromise1<T> = Promise<Awaited<T>>;
type AutoPromise<T> = Promise<Awaited<T>>
import {
	assert, assertEquals, assertStrictEquals, assertNotEquals,
	assertObjectMatch, assertStringIncludes, assertMatch,
	assertArrayIncludes,
	} from 'jsr:@std/assert'
import {esc, mesc} from 'unicode'
import {
	undef, defined, notdefined, isEmpty, nonEmpty,
	array, arrayof, isArray, isHash, isString, hash, hashof,
	isIterable, deepEqual, hashLike, integer, TObjCompareFunc,
	TObjLikeFunc, TToStringFunc, TFilterFunc,
	normalizeCode,
	TVoidFunc, croak, assertIsDefined, isGenerator, isIterator,
	} from 'datatypes'
import {
	pass, o, keys, getOptions, spaces, blockToArray,
	allLinesInBlock, truncStr,
	} from 'llutils'
import {splitLine, indented} from 'indent'
import {OL, ML} from 'to-nice'
import {TextTable} from 'text-table'
import {
	pushLogLevel, popLogLevel,
	DBG, LOG, LOGVALUE, DBGVALUE,
	INDENT, UNDENT,
	} from 'logger'
import {flag} from 'cmd-args'
import {
	relpath, mkpath, mkDir, barf, getPathType, fileExt,
	isDir, clearDir, pushWD, popWD,
	} from 'fsys'
import {Fetcher} from 'fetcher'
import {getErrStr} from 'exec'
import {doParse} from 'hera-parse'
import {TPLLToken, allTokensInBlock, tokenTable, tkEOF} from 'pll'
import {checkType} from 'typescript'
import {civet2tsFile} from 'civet'
import {getMyOutsideCaller} from 'v8-stack'
import {sourceLib, getNeededImportStmts} from 'symbols'

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

	debugger
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

/**
 * In a unit test, tests if value is truthy
 * Reports line number of the test.

 * @param {any} value - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * truthy isString('abc')
 * ```
 * This test will pass.
 */
export const truthy = (value: unknown): void => {
	const name = getTestName()
	DBG(`truthy ${stringify(value)} (${name})`)
	Deno.test(name, () => assert(value))
	return
}

// ---------------------------------------------------------------------------

/**
 * In a unit test, tests if value is falsy
 * Reports line number of the test.
 *
 * @param {any} value - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * falsy isString(42)
 * ```
 * This test will pass.
 */
export const falsy = (value: unknown): void => {
	const name = getTestName()
	DBG(`falsy ${stringify(value)} (${name})`)
	Deno.test(name, () => assert((!value)))
	return
}

// ---------------------------------------------------------------------------

/**
 * In a unit test, tests if calling the provided function
 * throws an exception. Reports line number of the test.
 *
 * @param {any => any} func - any JavaScript function
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * fails () => throw new Error('bad')
 * ```
 * This test will pass.
 */
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

/**
 * In a unit test, tests if calling the provided function
 * runs without throwing an exception.
 * Reports line number of the test.
 *
 * @param {any => any} func - any JavaScript function
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * succeeds () => return 42
 * ```
 * This test will pass.
 */
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

export const iterEqual = (iter: Iterable<unknown>, expected: unknown[]): void => {
	const name = getTestName()
	DBG(`iterEqual ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertEquals(Array.from(iter), expected))
	return
}

// ---------------------------------------------------------------------------

export const iterLike = (iter: Iterable<hash>, expected: hash[]): void => {
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

/**
 * In a unit test, tests a value, which must be a string,
 * matches either a substring or a regular expression.
 * Reports line number of the test.
 *
 * @param {any} value - any JavaScript value
 * @param {any} expected - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * matches 'abcde', 'bce'
 * ```
 * This test will pass.
 *
 * @example
 * ```js
 * matches 'aabbcc', /a+b+c+/
 * ```
 * This test will pass.
 */
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

/**
 * In a unit test, tests if one hash matches another hash.
 * the first hash must have all the properties in the second hash,
 * but extra properties are allowed.
 * Reports line number of the test.
 *
 * @param {hash} value - any JavaScript object
 * @param {hash} expected - any JavaScript object
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * like {a:1, b:2, c:3}, {a:1, c:3}
 * ```
 * This test will pass.
 */
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

export const strListLike = (value: string[], expected: string[]): void => {
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

/**
 * In a unit test, tests if each Object in an array matches
 * each object in another array. The 2 arrays must be of the
 * same length. If a function is passed as the 3rd parameter,
 * then each array is first sorted by using the function to
 * convert each object to a string, then sorting the array
 * using those strings.
 * A matching function can also be provided as the 4th argument.
 * By default, the function hashLike (from llutils.lib) is used.
 * Reports line number of the test.
 *
 * @param {array | object} value - any JavaScript value
 * @param {array | object} expected - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * like {a:1, b:2, c:3}, {a:1, c:3}
 * ```
 * This test will pass.
 *
 * @example
 * ```js
 * like [{a:1, b:2, c:3}, {a:3, b:5, c:23}], [{a:1, b:2}]
 * ```
 * This test will pass.
 */
export const objListLike = (
		value: hash[],
		expected: hash[],
		strFunc: (TToStringFunc | undefined) = undef,
		likeFunc: TObjLikeFunc = hashLike // used for comparison
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
		const compareFunc: TObjCompareFunc = (a: hash, b: hash) => {
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
		const compareFunc: TObjCompareFunc = (a: hash, b: hash) => {
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

/**
 * In a unit test, tests a value, which must be an array,
 * includes the expected value.
 * Reports line number of the test
 *
 * @param {Array<any>} value - an array
 * @param {any} expected - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * includes ['a', 'b', 'c'], 'b'
 * ```
 * This test will pass.
 */
export const includes = (value: unknown, expected: unknown): void => {
	assert(Array.isArray(value), `not an array: ${value}`)
	const name = getTestName()
	DBG(`includes ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertArrayIncludes(value, [expected]))
	return
}

// ---------------------------------------------------------------------------

/**
 * In a unit test, tests a value, which must be an array,
 * includes all of the items in the expected array.
 * Reports line number of the test
 *
 * @param {Array<any>} value - an array
 * @param {Array<any>} expected - an array
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * includesAll ['a', 'b', 'c'], ['b', 'c']
 * ```
 * This test will pass.
 */
export const includesAll = (value: unknown, expected: unknown): void => {
	assert(Array.isArray(value), `not an array: ${value}`)
	assert(Array.isArray(expected), `not an array: ${expected}`)
	const name = getTestName()
	DBG(`includesAll ?, ${stringify(expected)} (${name})`)
	Deno.test(name, () => assertArrayIncludes(value, expected))
	return
}

// ---------------------------------------------------------------------------

/**
 * In a unit test, tests if a value is of a given type.
 * Relies on a .symbols file being correctly set up, and
 * it containing the type we're testing when testing
 * a non-buildin type
 *
 * @param {string} typeStr - a type as a string
 * @param {any} value - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * isType 'string', 'abc'
 * ```
 * This test will pass.
 *
 * @example
 * ```js
 * isType 'number', 'abc'
 * ```
 * This test will fail.
 */

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
		const lDiagnostics = checkType(typeStr, value, true)
		if (defined(lDiagnostics)) {
			for (const msg of lDiagnostics) {
				console.log(msg)
			}
		}
		DBG(UNDENT)
		Deno.test(name, () => assert(isEmpty(lDiagnostics)))
	}
	return
}

// ---------------------------------------------------------------------------

/**
 * In a unit test, tests if a value is not of a given type.
 *
 * @param {string} typeStr - a type as a string
 * @param {any} value - any JavaScript value
 * @returns {void} - nothing
 *
 * @example
 * ```js
 * notType 'string', 'abc'
 * ```
 * This test will fail.
 *
 * @example
 * ```js
 * notType 'number', 'abc'
 * ```
 * This test will pass.
 */
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
		const lDiagnostics = checkType(typeStr, value, false)
		DBG(UNDENT)
		Deno.test(name, () => assert(nonEmpty(lDiagnostics)))
	}
	return
}

// ---------------------------------------------------------------------------

export type TFileOp = {
		op: 'mkDir' | 'clearDir' | 'compile' | 'pushWD'
		path: string
		}
	| {
		op: 'barf'
		path: string
		contents: string
		}
	| {
		op: 'popWD'
		}

// ---------------------------------------------------------------------------

export const fileOpsOk = (lFileOps: TFileOp[]): boolean => {

	try {
		assert((lFileOps.length >= 2))
		const firstOp  = lFileOps[0].op
		const secondOp = lFileOps[1].op
		// @ts-ignore
		const lastOp   = lFileOps.at(-1).op

		assert((firstOp === 'clearDir') || (firstOp === 'mkDir'))
		assert((secondOp === 'pushWD'))
		assert((lastOp === 'popWD'))
		for (const hOp of lFileOps.slice(2, -1)) {
			assert((hOp.op !== 'pushWD') && (hOp.op !== 'popWD'))
		}
		return true
	}
	catch (err) {
		return false
	}
}

// ---------------------------------------------------------------------------

export const execFileOps = (
		lFileOps: TFileOp[]
		): void => {

	// --- To be safe, we make sure
	//        - 1st op is pushWD with path including 'src/test/<word>/
	//        - Last op is popWD
	//        - there are no other pushWD or popWD ops

	assert(fileOpsOk(lFileOps), `Bad lFileOps:\n${ML(lFileOps)}\n`)
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
			case 'pushWD': {
				pushWD(h.path);break;
			}
			case 'barf': {
				assertIsDefined(h.contents)
				barf(h.path, h.contents);break;
			}
			case 'popWD': {
				popWD();break;
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC

export const getFileOps = async function(
		desc: string
		): AutoPromise1<TFileOp[]> {

	try {
		let root: string = ''
		let curFileName: string = ''
		let compileFile: boolean = false
		const lLines: string[] = []
		const lFileOps: TFileOp[] = []

		const pushBarfOp = (): void => {
			assert(!curFileName.startsWith('/'),
				`Bad file name: ${curFileName}`)
			lFileOps.push({
				op: 'barf',
				path: curFileName,
				contents: lLines.join('\n')
				})
			if (compileFile) {
				lFileOps.push({
					op: 'compile',
					path: curFileName
					})
			}
			curFileName = ''
			compileFile = false
			lLines.length = 0
			return
		}

		let i4 = 0;for (const line of await allLinesInBlock(desc)) {const i = i4++;
			const [level, str] = splitLine(line)
			if (i === 0) {
				debugger
				assert((level === 0), "Bad line 1")
				const lParts = str.split(/\s+/)
				let root: string
				let clear: boolean
				switch(lParts.length) {
					case 1: {
						[root, clear] = [str, false];break;
					}
					case 2: {
						assert((lParts[1] === 'clear'), `Bad header: ${line}`);
						[root, clear] = [lParts[0], true];break;
					}
					default: {
						croak(`Bad header: ${line}`);
						[root, clear] = ['', false]
					}
				}   // --- shouldn't be needed
				assert(nonEmpty(root), "Missing root")
				lFileOps.push({
					op: clear ? 'clearDir' : 'mkDir',
					path: root
					})
				lFileOps.push({
					op: 'pushWD',
					path: root
					})
			}
			else if (isEmpty(str)) {
				lLines.push('')
			}
			else if (level === 0) {
				if (curFileName) {
					pushBarfOp()
				}
				const lParts = str.split(/\s+/)
				let fname: string
				let compile: boolean
				switch(lParts.length) {
					case 1: {
						[fname, compile] = [str, false];break;
					}
					case 2: {
						assert((lParts[1] === 'compile'), `Bad header: ${line}`);
						[fname, compile] = [lParts[0], true];break;
					}
					default: {
						croak(`Bad header: ${line}`);
						[fname, compile] = ['', false]
					}
				}  // --- shouldn't be needed
				assert(nonEmpty(fname), "Missing fname")
				curFileName = fname
				compileFile = compile
				lLines.length = 0
			}
			else {
				lLines.push(indented(str, level-1))
			}
		}
		if (curFileName) {
			pushBarfOp()
		}
		lFileOps.push({
			op: 'popWD'
			})
		assert(fileOpsOk(lFileOps), `Bad lFileOps:\n${ML(lFileOps)}\n`)
		return lFileOps
	}

	catch (err) {
		croak(`ERROR in getFileOps(): ${getErrStr(err)}`)
	}
	return [] as TFileOp[]
}

// ---------------------------------------------------------------------------
// ASYNC

export const setDirTree = async (desc: string): AutoPromise1<TFileOp[]> => {

	const lFileOps = await getFileOps(desc)
	execFileOps(lFileOps)
	return lFileOps
}

// ---------------------------------------------------------------------------

export const fileOpsTable = (lFileOps: TFileOp[]): string => {

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
				const lLines = blockToArray(str)
				if (lLines.length === 0) {
					tt.data(['barf', path, '<empty>'])
				}
				else {
					let i5 = 0;for (const line of lLines) {const i = i5++;
						const contents = truncStr(esc(lLines[i]), 40)
						if (i === 0) {
							tt.data(['barf', path, contents])
						}
						else {
							tt.data(['', '', contents])
						}
					}
				};break;
			}
			case 'popWD': {
				tt.data(['popWD', '', '']);break;
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
// ASYNC

export const setDirTree_org = async (desc: string): AutoPromise1<AutoPromise<TFileOp[]>> => {

	try {
		const lFileOps = await doParse<TFileOp[]>('dir-tree', desc)
		execFileOps(lFileOps)
		return lFileOps
	}
	catch (err) {
		croak(`ERROR in getFileOps(): ${getErrStr(err)}`)
		return [] as TFileOp[]
	}
}

// ---------------------------------------------------------------------------
// --- Create some values for testing

export const val: hashof<unknown> = {
	undef: undefined,
	null: null,
	emptyStr: '',
	str: 'abc',
	i: 42,
	f: 3.14159,
	b: true,
	genFunc: function*() {
		yield 42
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

	for (const name in val) {const value = val[name];
		if (lNames.includes(name)) {
			if (!pred(value)) {
//				console.log "#{name} returns false"
				return false
			}
		}
		else {
			if (pred(value)) {
//				console.log "#{name} returns true"
				return false
			}
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// --- Returns true only if all the named values return true
//     AND all the not named values return false

export const allFalse = (
		lNames: string[],
		pred: TFilterFunc
		): boolean => {

	for (const name in val) {const value = val[name];
		if (lNames.includes(name)) {
			if (pred(value)) {
//				console.log "#{name} returns true"
				return false
			}
		}
		else {
			if (!pred(value)) {
//				console.log "#{name} returns false"
				return false
			}
		}
	}
	return true
}
