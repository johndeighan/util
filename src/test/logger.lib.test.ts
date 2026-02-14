"use strict";
// logger.lib.test.civet

import {defined, isFunction} from 'datatypes'
import {
	lLogLines, getLog, TLogLevel, LOG, DBG,
	curLogLevel, setLogLevel, pushLogLevel, popLogLevel,
	} from 'logger'
import {
	equal, like, succeeds, fails, truthy, falsy,
	} from 'unit-test'

// ---------------------------------------------------------------------------

setLogLevel('info')
LOG('abc')
LOG('xyz')
LOG('end')
DBG("should not appear")

setLogLevel('debug')
LOG('abc')
DBG('xyz')

equal(getLog(), `abc
xyz
end
abc
xyz`)

