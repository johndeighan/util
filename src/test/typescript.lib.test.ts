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
	typeCheckTsCode, getSymbolsFromType,
	getImportCode, typeCheckTsFile,
	ts2ast, ast2ts, astAsString, analyzeTS,
	} from 'typescript'
import {
	equal, succeeds, fails, truthy, falsy, setDirTree,
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

equal(analyzeTS(`function func(s: string): string {
	return s + t + '.txt';
	}
func('abc');`).asString(), s`MISSING: t`)

// ---------------------------------------------------------------------------
// test astAsString()

DBG("astAsString(hAST)")

equal(stripAnsiCode(astAsString(ts2ast('const x = 42;'))), s`kind: 308
statements:
	-
		kind: 244
		declarationList:
			kind: 262
			declarations:
				-
					kind: 261
					name:
						kind: 80
						escapedText: x
					initializer:
						kind: 9
						text: “42
endOfFileToken:
	kind: 1
text: const˳x˳=˳42;
fileName: temp.ts
scriptKind: 3
isDeclarationFile: ｟false｠
nodeCount: 7
identifierCount: 1
symbolCount: 0
identifiers:
	x:: x`)

