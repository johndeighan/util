"use strict";
// civet.lib.test.civet

import {stripAnsiCode} from "@std/fmt/colors"
import {SourceFile} from 'npm:typescript'

import {undef, defined, isHash} from 'datatypes'
import {o, s, rtrim} from 'llutils'
import {DBG} from 'logger'
import {slurp, withExt} from 'fsys'
import {ts2ast, astAsString} from 'typescript'
import {
	a, civet2tsFile, civet2ts, civet2ast,
	} from 'civet'
import {
	equal, like, succeeds, fails, truthy, falsy,
	isType, setDirTree,
	} from 'unit-test'

const fileName = "test-civet.civet"

// ---------------------------------------------------------------------------

await setDirTree(`./src/test/civet
${fileName}
	x := 42`)

// ---------------------------------------------------------------------------

const testPath = `src/test/civet/${fileName}`

const civetCode = slurp(testPath)
const tsCode =  civet2ts(civetCode)

// --- source maps are stripped out before an ast is created
const ast1 = civet2ast(civetCode)
const ast2 = ts2ast(tsCode)
equal(ast1, ast2)

DBG("civet2ts(code)")

equal(civet2ts('x := 42', o`!inlineMap`), `"use strict";
const x = 42`)

DBG("civet2tsFile(path)");

(() => {
	civet2tsFile(testPath, undef, o`!inlineMap`)
	const code = slurp(withExt(testPath, '.ts'))
	equal(rtrim(code), `"use strict";
const x = 42`)
}
	)()

DBG("civet2ast(code)")

// isType 'SourceFile', ast1
// isType 'SourceFile', ast2


succeeds(() => civet2ast('x := 42'))

// ---------------------------------------------------------------------------

equal(a`import {defined, notdefined} from 'datatypes'`, s`IMPORTS: datatypes: defined notdefined
EXTRA: defined notdefined`)

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

