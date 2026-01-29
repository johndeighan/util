"use strict";
// f-strings.lib.test.civet

import {f, colorize, decolorize} from 'f-strings'
import {equal} from 'unit-test'

// ---------------------------------------------------------------------------

equal(f`abc`, "abc");

(() => {
	const meaning = 42
	equal(f`meaning is ${meaning}`,      "meaning is 42")
	equal(f`meaning is ${meaning}:3`,    "meaning is  42")
	equal(f`meaning is ${meaning}:3`,    "meaning is  42")
	equal(f`meaning is ${meaning}:3!`,   "meaning is  42")
	equal(f`meaning is ${meaning}:`,     "meaning is 42:")
	equal(f`meaning is ${meaning}: ok?`, "meaning is 42: ok?")
}
	)();

(() => {
	const str = 'abc def'
	equal(f`str is ${str}`,    "str is abc def")
	equal(f`str is ${str}:!`,  "str is abc˳def")
	equal(f`str is ${str}:10`, "str is abc def   ")
}
	)();

// ---------------------------------------------------------------------------

(() => {
	const meaning = 42
	const str = f`:{blue}meaning is ${meaning}:3{red}`
	equal(decolorize(str), "meaning is  42")
}
	)()
