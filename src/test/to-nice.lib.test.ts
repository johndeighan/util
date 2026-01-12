"use strict";
// to-nice.lib.test.civet

import {undef, isPrimitive} from 'datatypes'
import {o, s} from 'llutils'
import {uni} from 'unicode'
import {DBG} from 'logger'
import {
	toNiceString, toNice, OL, ML, buildPath, rotpos,
	} from 'to-nice'
import {
	equal, iterEqual, iterLike, like,
	succeeds, fails, truthy, falsy,
	} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("toNiceString()")

equal(toNiceString('abc'), 'abc')
equal(toNiceString('\tabc\n'), '→abc↓')
equal(toNiceString('123'), "“123")
equal(toNiceString('123').length, 4)
equal(toNiceString('3.14'), "“3.14")
equal(toNiceString('-123'), "“-123")
equal(toNiceString('-3.14'), "“-3.14")
equal(toNiceString('134 Main St.'), '“134˳Main˳St.')
equal(toNiceString('｟inf｠'), "｟inf｠")
equal(toNiceString('｟text｠'), "｟text｠")
equal(toNiceString('label: 42'), '“label:˳42')
equal(toNiceString(' xxx '), '˳xxx˳')
equal(toNiceString('  xxx  '), '˳˳xxx˳˳')
equal(toNiceString('func1 = (str: string)'), 'func1˳=˳(str:˳string)')

// ---------------------------------------------------------------------------

equal(buildPath([]), 'root')
equal(buildPath([13]), 'root[13]')
equal(buildPath(['pos']), 'root.pos')
equal(buildPath([13, 'pos']), 'root[13].pos')
equal(buildPath(['pos', 13]), 'root.pos[13]')

// ---------------------------------------------------------------------------

equal(rotpos([1,2,3], 0), 1)
equal(rotpos([1,2,3], 2), 3)
equal(rotpos([1,2,3], 3), 1)
equal(rotpos([1,2,3], 4), 2)
equal(rotpos([1,2,3], 5), 3)

// ---------------------------------------------------------------------------

DBG("toNice()")

// --- 'undefined'
equal(toNice(undef),      '｟undef｠')

// --- 'boolean'
equal(toNice(true),       '｟true｠')
equal(toNice(false),      '｟false｠')

// --- 'number'
equal(toNice(NaN),        '｟NaN｠')
equal(toNice(Infinity),   '｟inf｠')
equal(toNice(-Infinity),  '｟neginf｠')
equal(toNice(42),         '42')
equal(toNice(3.14),       '3.14')

// --- 'bigint'
equal(toNice(12345678n),  '12345678n')

// --- 'string'
equal(toNice('abc'),      'abc')
equal(toNice('say "hi"'), 'say˳"hi"')
equal(toNice('a\tb'),     'a→  b')
equal(toNice('a\nb'),     'a↓\nb')
equal(toNice('｟true｠'),   "｟true｠")
equal(toNice('｟abc｠'),     "｟abc｠")
equal(toNice('- abc'),    "“-˳abc")
equal(toNice('-abc'),     "“-abc")
equal(toNice('flag: 3'),  "“flag:˳3")
equal(toNice('123'),      "“123")
equal(toNice('1749 Main St.'), "“1749˳Main˳St.")
equal(toNice('./temp.txt'), './temp.txt')

// --- 'symbol'
equal(toNice(Symbol()),   '｟symbol｠')
equal(toNice(Symbol('abc')), '｟symbol abc｠');

// --- 'function'
(() => {
	class TempClass {
		var: string = ''

		constructor(str: string) {
			this.var = str
		}
	}

	equal(toNice(TempClass), '｟class TempClass｠')

	// --- However, a class instance is an object
	equal(toNice(new TempClass('xyz')), `var: xyz`)
}
	)();

(() => {
	const func = (x: string): string => {
		return 'abc'
	}

	equal(toNice(func), '｟function func｠')
}
	)()

// --- 'object'
equal(toNice(null), '｟null｠')

equal(toNice(/^abc$/), '｟regexp ^abc$｠')

equal(toNice([]), "[]")
equal(toNice([1,2]), `- 1
- 2`)

equal(toNice({}), "{}")
equal(toNice({a:1, b:2}), `a: 1
b: 2`);

// ---------------------------------------------------------------------------
// --- Test various options on objects

(() => {
	const h = {
		phone: '540-808-1234',
		address: '1749 Main St.',
		city: 'Blacksburg',
		state: 'VA',
		fName: 'John',
		lName: 'Deighan'
		}

	equal(toNice(h, {lInclude: ['fName','lName']}), `fName: John
lName: Deighan`)
	equal(toNice(h, {lInclude: ['fName','lName','phone']}), `fName: John
lName: Deighan
phone: “540-808-1234`)
	equal(toNice(h, {lExclude: ['phone','address']}), `city: Blacksburg
state: VA
fName: John
lName: Deighan`)
}
	)();

// ---------------------------------------------------------------------------
// --- test references

(() => {
	type Node = {
		name: string
		ref: (object | undefined)
		}

	const hAst: Node = {
		name: 'John',
		ref: undef
		}
	hAst.ref = hAst

	equal(toNice(hAst), s`name: John
ref: ｟ref root｠`)
}
	)()

// ---------------------------------------------------------------------------

equal(toNice(['a', ['b','c']]), s`- a
-
	- b
	- c`)

// ---------------------------------------------------------------------------

equal(toNice({a: 1, b: {c: 3, d: 4}}), s`a: 1
b:
	c: 3
	d: 4`)

// ---------------------------------------------------------------------------

equal(toNice(['a', []]), s`- a
- []`)

// ---------------------------------------------------------------------------

equal(toNice({a: 1, b: {}}), s`a: 1
b: {}`)

// ---------------------------------------------------------------------------
// --- test option 'compact'

equal(toNice(['ab', 'cd', 'e f'], o`compact`), '[ab cd e˳f]')

equal(toNice({a: 1, b: 2}, o`compact`), '{a: 1 b: 2}')

// ---------------------------------------------------------------------------
// --- test OL() and ML()

equal(OL(['ab', 'cd', 'e f']), '[ab cd e˳f]')

equal(OL({a: 1, b: 2}), '{a: 1 b: 2}')

equal(ML(['ab', 'cd', 'e f']), `- ab
- cd
- e˳f`)

equal(ML({a: 1, b: 2}), `a: 1
b: 2`)

DBG("OL()")

equal(OL({a:1, b:2}), '{a: 1 b: 2}')
equal(OL('abc'), 'abc')
equal(OL([1, 2, 3]), '[1 2 3]')
equal(OL(undefined), '｟undef｠')
equal(OL(null), '｟null｠')

DBG("ML()")

equal(ML(undefined), '｟undef｠')
equal(ML(null), '｟null｠')
equal(ML('abc'), 'abc')
equal(ML({a:1, b:2}), `a: 1
b: 2`)
equal(ML([1,'abc']), `- 1
- abc`)

// ---------------------------------------------------------------------------
//                    Set
// ---------------------------------------------------------------------------

equal(toNice(new Set(['abc','def'])), '｟set abc def｠')

// ---------------------------------------------------------------------------
//                    Map
// ---------------------------------------------------------------------------

equal(toNice(new Map([['a',1],['b',2]])), `a:: 1
b:: 2`)
