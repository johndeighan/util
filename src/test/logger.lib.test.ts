"use strict";
// logger.lib.test.civet

import {stripAnsiCode} from "@std/fmt/colors"

import {
	undef, defined, notdefined,
	} from 'datatypes'
import {
	clearConsoleLog, getConsoleLog,
	} from 'log-formatter'
import {
	TLogLevel, getLogLevel, isLogLevel,
	setLogLevel, pushLogLevel, popLogLevel,
	TFormatter, TreeLogger,
	getLog, clearLog, removeLogFile, INDENT, UNDENT,
	DBG, LOG, WARN, ERR, DBGVALUE, LOGVALUE,
	} from 'logger'
import {
	equal, truthy, falsy, succeeds, fails, matches,
	} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("getLog()")

equal(getLog('console'), "");

(() => {
	DBG("debug this")
	LOG("log this")
	WARN("warn this")
	ERR("error this")
	equal(stripAnsiCode(getConsoleLog()), `log this
warn this
error this`)
}
	)()

DBG("clearLog()")

DBG("const INDENT", "const UNDENT")

DBG("DBG()", "LOG()", "WARN()", "ERR()")

DBG("DBGVALUE()", "LOGVALUE()")

DBG("removeLogFile()")

succeeds(() => removeLogFile())

DBG("type TreeLogger");

(() => {
	clearConsoleLog()
	pushLogLevel('debug')
	const logr = new TreeLogger<number>()
	logr.log(    'starting')
	logr.start(  'enter A')
	logr.log(    'inside A')
	logr.succeed('OK')
	logr.log(    'continuing')
	logr.start(  'enter B')
	logr.log(    'inside B')
	logr.fail(   'FAIL')
	logr.log(    'Done')
	popLogLevel()
	equal(getConsoleLog(), `starting
enter A
│   inside A
└─> OK
continuing
enter B
│   inside B
└─> FAIL
Done`)
}
	)();

(() => {
	clearConsoleLog()
	pushLogLevel('debug')
	const logr = new TreeLogger<number>()
	logr.log(    'starting')
	logr.start(  'enter A')
	logr.log(    'inside A')
	logr.start(  'enter B')
	logr.log(    'inside B')
	logr.fail(   'FAIL')
	logr.succeed('OK')
	logr.log(    'Done')
	popLogLevel()
	equal(getConsoleLog(), `starting
enter A
│   inside A
│   enter B
│   │   inside B
│   └─> FAIL
└─> OK
Done`)
}
	)();

(() => {
	const formatter = (desc: string, n: (number | undefined)) => {
		if (defined(n)) {
			return `${desc} [Number ${n}]`
		}
		else {
			return desc
		}
	}

	clearConsoleLog()
	pushLogLevel('debug')
	const logr = new TreeLogger<number>(formatter)
	logr.log(    'starting', 42)
	logr.start(  'enter A')
	logr.log(    'inside A', 13)
	logr.start(  'enter B')
	logr.log(    'inside B', 26)
	logr.fail(   'FAIL')
	logr.succeed('OK')
	logr.log(    'Done')
	popLogLevel()
	equal(getConsoleLog(), `starting [Number 42]
enter A
│   inside A [Number 13]
│   enter B
│   │   inside B [Number 26]
│   └─> FAIL
└─> OK
Done`)
}
	)()