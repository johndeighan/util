"use strict";
// civet.lib.test.civet

import {stripAnsiCode} from "@std/fmt/colors"
import {SourceFile} from 'npm:typescript'

import {defined, isHash} from 'datatypes'
import {o, s} from 'llutils'
import {DBG} from 'logger'
import {slurp, withExt} from 'fsys'
import {ts2ast, astAsString} from 'typescript'
import {
	civet2tsFile, civet2ts, civet2ast,
	} from 'civet'
import {
	equal, like, succeeds, fails, truthy, falsy,
	isType, setDirTree,
	} from 'unit-test'

const fileName = "test-civet.civet"

// ---------------------------------------------------------------------------

await setDirTree(`./src/test/civet clear
${fileName}
	x := 42
`)

// ---------------------------------------------------------------------------

const testPath = `src/test/civet/${fileName}`

const civetCode = slurp(testPath)
const tsCode =  civet2ts(civetCode)

// --- source maps are stripped out before an ast is created
const ast1 = civet2ast(civetCode)
const ast2 = ts2ast(tsCode)
equal(ast1, ast2)

DBG("civet2ts(code)")

equal(civet2ts('x := 42', o`nomap`), `"use strict";
const x = 42`)

DBG("civet2tsFile(path)");

(() => {
	civet2tsFile(testPath, withExt(testPath, '.ts'), o`nomap`)
	const code = slurp(withExt(testPath, '.ts'))
	equal(code, `"use strict";
const x = 42`)
}
	)()

DBG("civet2ast(code)")

// isType 'SourceFile', ast1
// isType 'SourceFile', ast2

DBG("astAsString(hAST)")

equal(stripAnsiCode(astAsString(ts2ast('x := 42'))), s`kind: 308 (SourceFile)
statements:
	-
	❘  kind: 257 (LabeledStatement)
	❘  label:
	❘     kind: 80 (Identifier)
	❘     escapedText: x
	❘  statement:
	❘     kind: 245 (ExpressionStatement)
	❘     expression:
	❘     ❘  kind: 227 (BinaryExpression)
	❘     ❘  left:
	❘     ❘     kind: 80 (Identifier)
	❘     ❘  operatorToken:
	❘     ❘     kind: 64 (FirstAssignment)
	❘     ❘  right:
	❘     ❘     kind: 9 (FirstLiteralToken)
	❘     ❘     text: \\42
endOfFileToken:
	kind: 1 (EndOfFileToken)
text: x˳:=˳42
fileName: temp.ts
scriptKind: 3
isDeclarationFile: ｟false｠
nodeCount: 9
identifierCount: 2
symbolCount: 0
parseDiagnostics:
	-
	❘  file: ｟ref root｠
	❘  start: 3
	❘  length: 1
	❘  messageText: Expression˳expected.
	❘  category: 1
	❘  code: 1109`)

succeeds(() => civet2ast('x := 42'))
