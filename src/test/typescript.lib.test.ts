"use strict";
// typescript.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {stripAnsiCode} from "@std/fmt/colors"
import {SourceFile} from 'npm:typescript'

import {
	undef, isHash, isEmpty, nonEmpty,
	} from 'datatypes'
import {pass, o, s, t} from 'llutils'
import {DBG} from 'logger'
import {slurp, withExt} from 'fsys'
import {
	typeCheckTsCode, splitFuncStr, getSymbolsFromType,
	getImportCode, getTsCode, typeCheckTsFile,
	ts2ast, ast2ts, astAsString, analyzeTS,
	} from 'typescript'
import {
	equal, like, succeeds, fails, truthy, falsy, setDirTree,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	DBG("setDirTree()")

	await setDirTree(`./src/test/typescript
tstest.ts
	const str: string = 'abc'
tstest2.ts
	const func1 = (str: string): boolean =>
		return true`)
}

await setup()

// ---------------------------------------------------------------------------

DBG("typeCheckTsCode(tsCode)")

truthy(isEmpty(typeCheckTsCode("let s: string = 'abc';")))
truthy(nonEmpty(typeCheckTsCode("let s: string = 42;")))

DBG("getSymbolsFromType(typeStr)")

equal(getSymbolsFromType('integer'), ['integer'])
equal(getSymbolsFromType('hashof<integer>'), ['hashof','integer'])

DBG("getImportCode(typeStr)")

equal(getImportCode('integer'), `import {integer} from 'datatypes';`)
equal(getImportCode('hashof<integer>'), `import {hashof, integer} from 'datatypes';`)

DBG("splitFuncStr(valueStr)")

equal(splitFuncStr("abc"), undef)
equal(splitFuncStr("() => true"), [[], 'true'])
equal(splitFuncStr("(  ) => true"), [[], 'true'])
equal(splitFuncStr("(a,b,c) => false"), [
	['a','b','c'],
	'false'
	])
equal(splitFuncStr("( a , b,c ) => false"), [
	['a','b','c'],
	'false'
	])
equal(splitFuncStr("(a: string, b)=>true"), [
	['a: string', 'b'],
	'true'
	])

DBG("getTsCode(typeStr, valueStr)")

equal(getTsCode('integer', '42'), 'const x: integer = 42')
equal(getTsCode('TFilterFunc', '(x) => true'),
	'const x: TFilterFunc = (x: unknown) => true')

DBG("analyzeTS(tsCode, hOptions)")

equal(analyzeTS(`const x = y + z + func(min);`).asString(), s`MISSING: y z func min
EXTRA: x`)

equal(analyzeTS(`import {defined, notdefined} from 'datatypes';`).asString(), s`IMPORTS: datatypes: defined notdefined
EXTRA: defined notdefined`)

equal(analyzeTS(`const x = y + z + func(min);`).asString(), s`MISSING: y z func min
EXTRA: x`)

equal(analyzeTS(`import {defined, notdefined} from 'datatypes';`).asString(), s`IMPORTS: datatypes: defined notdefined
EXTRA: defined notdefined`)

equal(analyzeTS(`export const meaning = 42;`).asString(), s`EXPORTS: meaning`)

equal(analyzeTS(`func("Hello");`).asString(), s`MISSING: func`)

equal(analyzeTS(`func(x, y+z);`).asString(), s`MISSING: func x y z`)

// --- imports are not needed

equal(analyzeTS(`import {func} from 'willy';

func(x, y+z);`).asString(), s`IMPORTS: willy: func
MISSING: x y z`)

// --- Only t is needed, s is a parameter

equal(analyzeTS(`const func = (s: string): string =>
	return s + t + '.txt';
func('abc');`).asString(), s`MISSING: t`)

// --- Same, only using 'function' keyword

equal(analyzeTS(`function func(s: string): string
	return s + t + '.txt';
func('abc');`).asString(), s`MISSING: t`)

