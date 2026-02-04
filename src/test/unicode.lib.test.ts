"use strict";
// unicode.lib.test.civet

import {undef} from 'datatypes'
import {
	uni, lit, delit, litC,
	esc, mesc, unesc, getPrefix,
	} from 'unicode'
import {DBG} from 'logger'
import {
	equal, like, succeeds, fails, truthy, falsy,
	} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("lit()")

equal(lit('undef'), '｟undef｠')

DBG("delit()")

equal(delit('｟undef｠'), 'undef')
equal(delit('abc'), undef)
equal(delit(''), undef)

DBG("litC()")

equal(litC('undef'), '\\undef')

DBG("esc()")

equal(esc('cba'), 'cba')
equal(esc('   acb'), '˳˳˳acb')
equal(esc('\t\t\tabc'), '→→→abc')
equal(esc('abc\r\ndef'), 'abc←↓def')
equal(esc('abc\r\ndef', 'multiline'), 'abc←↓\ndef')
equal(esc('abcc\n'), 'abcc↓')
equal(esc('abcb\r\n'), 'abcb←↓')
equal(esc('abcb\r\n', 'multiline'), 'abcb←↓\n')
equal(esc('ab cd'), 'ab˳cd')
equal(esc('ab\tcd'), 'ab→cd')

DBG("unesc()")

equal(unesc('cba'), 'cba')
equal(unesc('˳˳˳acb'), '   acb')
equal(unesc('→→→abc'), '\t\t\tabc')
equal(unesc('abc←↓def'), 'abc\r\ndef')
equal(unesc('abc←↓\ndef'), 'abc\r\ndef')    // failed
equal(unesc('abcc↓'), 'abcc\n')
equal(unesc('abcb←↓'), 'abcb\r\n')
equal(unesc('abcb←↓\n'), 'abcb\r\n')    // failed
equal(unesc('ab˳cd'), 'ab cd')
equal(unesc('ab→cd'), 'ab\tcd')

DBG("getPrefix(level, option)")

equal(getPrefix(2, 'plain'),      '│   │   ')
equal(getPrefix(2, 'withArrow'),  '│   └─> ')
equal(getPrefix(2, 'withResume'), '│   ├─> ')
equal(getPrefix(2, 'withFlat'),   '│   ├── ')
equal(getPrefix(2, 'withYield'),  '│   ├<─ ')
equal(getPrefix(2, 'noLastVbar'), '│       ')
equal(getPrefix(2, 'none'),       '        ')