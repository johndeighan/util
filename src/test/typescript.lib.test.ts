"use strict";
// typescript.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {stripAnsiCode} from "@std/fmt/colors"
import {SourceFile} from 'npm:typescript'

import {
	undef, isHash, isEmpty, nonEmpty, normalizeCode,
	} from 'datatypes'
import {pass, o, s, t} from 'llutils'
import {DBG} from 'logger'
import {slurp, withExt} from 'fsys'
import {
	typeCheckTsCode, splitFuncStr, getSymbolsFromType,
	getImportCode, getTsCode, typeCheckTsFile,
	ts2ast, ast2ts, astAsString, analyze,
	} from 'typescript'
import {civet2ts, a} from 'civet'
import {
	equal, like, succeeds, fails, truthy, falsy, setDirTree,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	DBG("setDirTree()")

	await setDirTree(`./src/test/typescript clear
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

DBG("ts2ast(tsCode)", "astAsString(ast)")

const ast = ts2ast(slurp('src/test/typescript/tstest2.ts'))
equal(stripAnsiCode(astAsString(ast)), s`kind: 308 (SourceFile)
statements:
	-
	   kind: 244 (FirstStatement)
	   declarationList:
	      kind: 262 (VariableDeclarationList)
	      declarations:
	         -
	            kind: 261 (VariableDeclaration)
	            name:
	               kind: 80 (Identifier)
	               escapedText: func1
	            initializer:
	               kind: 220 (ArrowFunction)
	               parameters:
	                  -
	                     kind: 170 (Parameter)
	                     name:
	                        kind: 80 (Identifier)
	                        escapedText: str
	                     type:
	                        kind: 154 (StringKeyword)
	               type:
	                  kind: 136 (BooleanKeyword)
	               equalsGreaterThanToken:
	                  kind: 39 (EqualsGreaterThanToken)
	               body:
	                  kind: 242 (Block)
	                  statements:
	                     -
	                        kind: 254 (ReturnStatement)
	                        expression:
	                           kind: 112 (TrueKeyword)
	                  multiLine: ｟true｠
endOfFileToken:
	kind: 1 (EndOfFileToken)
text: const˳func1˳=˳(str:˳string):˳boolean˳=>↓→return˳true
fileName: temp.ts
scriptKind: 3
isDeclarationFile: ｟false｠
nodeCount: 16
identifierCount: 3
symbolCount: 0
parseDiagnostics:
	-
	   file: ｟ref root｠
	   start: 41
	   length: 6
	   messageText: '{'˳expected.
	   category: 1
	   code: 1005
	-
	   file: ｟ref root｠
	   start: 52
	   length: 0
	   messageText: '}'˳expected.
	   category: 1
	   code: 1005`)
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

DBG("analyze(tsCode, hOptions)")

equal(a`x := y + z + func(min)`, s`MISSING: y z func min
EXTRA: x`)

equal(a`import {defined, notdefined} from 'datatypes'`, s`IMPORTS: datatypes: defined notdefined
EXTRA: defined notdefined`)

equal(a`x := y + z + func(min)`, s`MISSING: y z func min
EXTRA: x`)

equal(a`import {defined, notdefined} from 'datatypes'`, s`IMPORTS: datatypes: defined notdefined
EXTRA: defined notdefined`)

equal(a`export meaning := 42`, s`EXPORTS: meaning`)

equal(a`func "Hello"`, s`MISSING: func`)

equal(a`func x, y+z`, s`MISSING: func x y z`)

// --- imports are not needed

equal(a`import {func} from 'willy'

func x, y+z`, s`IMPORTS: willy: func
MISSING: x y z`)

// --- Only t is needed, s is a parameter

equal(a`func := (s: string): string =>
	return s + t + '.txt'
func('abc')`, s`MISSING: t`)

// --- Same, only using 'function' keyword

equal(a`function func(s: string): string
	return s + t + '.txt'
func('abc')`, s`MISSING: t`)