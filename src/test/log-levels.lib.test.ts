"use strict";
// log-levels.lib.test.civet

import {DBG} from 'logger'
import {
	TLogLevel, getLogLevel, isLogLevel, isInactiveLevel,
	setLogLevel, pushLogLevel, popLogLevel, resetLogLevel,
	} from 'log-levels'
import {
	equal, truthy, falsy, succeeds, fails, matches,
	} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("getLogLevel()")

equal(getLogLevel(), 'info')

DBG("isInactiveLevel()")

truthy(isInactiveLevel('debug'))
falsy( isInactiveLevel('error'))

// ---------------------------------------------------------------------------
// --- Possible log levels:
//        profile
//        debug
//        info
//        warn
//        error
//        silent
//        none
// --- All levels above the current level are inactive

// ---------------------------------------------------------------------------

DBG("type TLogLevel")

// isType 'TLogLevel', 'debug'
// isType 'TLogLevel', 'warn'
// notType 'TLogLevel', 'dummy'

DBG("isLogLevel()")

truthy(isLogLevel('info'))
truthy(isLogLevel('debug'))
falsy( isLogLevel('dummy'))

DBG("setLogLevel()")

setLogLevel('debug')
equal(getLogLevel(), 'debug')
falsy(isInactiveLevel('debug'))
setLogLevel('info')
equal(getLogLevel(), 'info')
truthy(isInactiveLevel('debug'))

DBG("pushLogLevel()")

pushLogLevel('error')
equal(getLogLevel(), 'error')
truthy(isInactiveLevel('info'))
truthy(isInactiveLevel('warn'))
falsy( isInactiveLevel('error'))

DBG("popLogLevel()")

popLogLevel()
equal(getLogLevel(), 'info')

DBG("resetLogLevel()")

setLogLevel('debug')
resetLogLevel()
equal(getLogLevel(), 'info')
