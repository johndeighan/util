"use strict";
// from-nice.lib.test.civet

import {undef, isSymbol, symbolName} from 'datatypes'
import {DBG} from 'logger'
import {allTokensInBlock} from 'pll'
import {
	fromNice, getPrimitive, niceSplitter, allNiceTokens,
	} from 'from-nice'
import {
	equal, iterEqual, iterLike, like,
	succeeds, fails, truthy, falsy,
	} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("niceSplitter()")

iterLike(niceSplitter('a'), [
	{kind: 'primitive', value: 'a'}
	])
iterLike(niceSplitter('42'), [
	{kind: 'primitive', value: 42}
	])
iterLike(niceSplitter('｟undef｠'), [
	{kind: 'primitive', value: undef}
	])
iterLike(niceSplitter('“｟undef｠'), [
	{kind: 'primitive', value: '｟undef｠'}
	])
iterLike(niceSplitter("“abc"), [
	{kind: 'primitive', value: "abc"}
	])
iterLike(niceSplitter('- a'), [
	{kind: 'list-item', value: 'a'}
	])
iterLike(niceSplitter('-'), [
	{kind: 'list-head'}
	])
iterLike(niceSplitter('tag: abc'), [
	{kind: 'hash-item', value: 'abc'}
	])
iterLike(niceSplitter('tag:'), [
	{kind: 'hash-head', name: 'tag'}
	])

// --- Add checks to be sure that extra whitespace is OK

iterLike(niceSplitter('a  '), [
	{kind: 'primitive', value: 'a'}
	])
iterLike(niceSplitter('42   '), [
	{kind: 'primitive', value: 42}
	])
iterLike(niceSplitter('｟undef｠  '), [
	{kind: 'primitive', value: undef}
	])
iterLike(niceSplitter('｟  undef  ｠  '), [
	{kind: 'primitive', value: undef}
	])
iterLike(niceSplitter('-   a  '), [
	{kind: 'list-item', value: 'a'}
	])
iterLike(niceSplitter('-  '), [
	{kind: 'list-head'}
	])
iterLike(niceSplitter('tag:   abc  '), [
	{kind: 'hash-item', value: 'abc'}
	])
iterLike(niceSplitter('tag:  '), [
	{kind: 'hash-head', name: 'tag'}
	])

// --- Test breaking NICE string into tokens

iterLike(allTokensInBlock(`a
42`, niceSplitter), [
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 42},
	{kind: 'eof'}
	])

iterLike(allTokensInBlock(`- a
- b`, niceSplitter), [
	{kind: 'list-item', value: 'a'},
	{kind: 'list-item', value: 'b'},
	{kind: 'eof'}
	])

iterLike(allTokensInBlock(`a: 1
b: c`, niceSplitter), [
	{kind: 'hash-item', value: 1},
	{kind: 'hash-item', value: 'c'},
	{kind: 'eof'}
	])

iterLike(allTokensInBlock(`-
	b
	42`, niceSplitter), [
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'b'},
	{kind: 'primitive', value: 42},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allTokensInBlock(`lItems:
	b
	42`, niceSplitter), [
	{kind: 'hash-head', name: 'lItems'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'b'},
	{kind: 'primitive', value: 42},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allTokensInBlock(`lNames:
	John
	Alice
-
	｟undef｠
	-
		a
		b`, niceSplitter), [
	{kind: 'hash-head', name: 'lNames'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'John'},
	{kind: 'primitive', value: 'Alice'},
	{kind: 'undent'},
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: undef},
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 'b'},
	{kind: 'undent'},
	{kind: 'undent'},
	{kind: 'eof'}
	])

DBG("fromNice(str)")

equal(fromNice('abc'),      'abc')
equal(fromNice('say "hi"'), 'say "hi"')
equal(fromNice('a\\nb'),    'a\nb')
equal(fromNice('a\\tb'),    'a\tb')
equal(fromNice('｟undef｠'),  undef)
equal(fromNice('｟null｠'),   null)
equal(fromNice('｟true｠'),   true)
equal(fromNice('｟false｠'),  false)
equal(fromNice('｟NaN｠'),    NaN)
equal(fromNice('｟inf｠'),    Infinity)
equal(fromNice('｟neginf｠'), -Infinity)
equal(fromNice('42'),       42)
equal(fromNice('3.14'),     3.14)
truthy(isSymbol(fromNice('｟symbol｠')));

(() => {
	const result = fromNice('｟symbol dummy｠')
	truthy(isSymbol(result))
	equal(symbolName(result), 'dummy')
}
	)()

equal(fromNice('｟regexp ^abc$｠'), /^abc$/)
equal(fromNice('[]'), [])
equal(fromNice('{}'), {})

DBG("allNiceTokens(block)")

iterLike(allNiceTokens(`- a
- b`), [
	{kind: 'list-item', value: 'a'},
	{kind: 'list-item', value: 'b'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`-
	a
	b`), [
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 'b'},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`- a
-
	a
	b`), [
	{kind: 'list-item', value: 'a'},
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 'b'},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`-
	a
	b
- a`), [
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 'b'},
	{kind: 'undent'},
	{kind: 'list-item', value: 'a'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`-
	-
		a
		b
	- c
- a`), [
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'primitive', value: 'a'},
	{kind: 'primitive', value: 'b'},
	{kind: 'undent'},
	{kind: 'list-item', value: 'c'},
	{kind: 'undent'},
	{kind: 'list-item', value: 'a'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`-
	- a
	- b`), [
	{kind: 'list-head'},
	{kind: 'indent'},
	{kind: 'list-item', value: 'a'},
	{kind: 'list-item', value: 'b'},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`a: 1
b: 2`), [
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`lItems:
	a: 1
	b: 2`), [
	{kind: 'hash-head', name: 'lItems'},
	{kind: 'indent'},
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`lItems:
	a: 1
	b: 2
a: 1
b: 2`), [
	{kind: 'hash-head', name: 'lItems'},
	{kind: 'indent'},
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'undent'},
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`a: 1
b: 2
lItems:
	a: 1
	b: 2`), [
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'hash-head', name: 'lItems'},
	{kind: 'indent'},
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'undent'},
	{kind: 'eof'}
	])

iterLike(allNiceTokens(`a: 1
b: 2
lItems:
	lMoreItems:
		a: 1
		b: 2
	x: abc`), [
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'hash-head', name: 'lItems'},
	{kind: 'indent'},
	{kind: 'hash-head', name: 'lMoreItems'},
	{kind: 'indent'},
	{kind: 'hash-item', name: 'a', value: 1},
	{kind: 'hash-item', name: 'b', value: 2},
	{kind: 'undent'},
	{kind: 'hash-item', name: 'x', value: 'abc'},
	{kind: 'undent'},
	{kind: 'eof'}
	])

equal(fromNice(`- 1`), [1])

equal(fromNice(`a: 1`), {a: 1})

// equal fromNice("""
// 	a: 1
// 	b: 3
// 	c:
// 		- 1
// 		- 2
// 	"""), {
// 		a: 1
// 		b: 3
// 		c: [1,2]
// 		}
