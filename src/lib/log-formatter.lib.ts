"use strict";
// log-formatter.lib.civet

import {LogRecord} from 'jsr:@std/log'
import {LogLevels} from 'jsr:@std/log/levels'
import {spaces, sinceLoadStr, interpolate} from 'llutils'
import {getLogLevel} from 'log-levels'

export let logIndent: number = 0
const getPrefix = () => spaces(3).repeat(logIndent)
// --- Everything returned by a formatter is also
//     appended to this string
const lConsoleLog: string[] = []

// ---------------------------------------------------------------------------

export const clearConsoleLog = (): void => {
	lConsoleLog.length = 0
	return
}

// ---------------------------------------------------------------------------

export const getConsoleLog = () => {
	return lConsoleLog.join('\n')
}

// ---------------------------------------------------------------------------

const levelStr = (level: number): string => {
	switch(level) {
		case LogLevels.DEBUG:
			return 'D'
		case LogLevels.INFO:
			return 'I'
		case LogLevels.WARN:
			return 'W'
		case LogLevels.ERROR:
			return 'E'
		default:
			return 'UNKNOWN'
	}
}

// ---------------------------------------------------------------------------

// --- str may contain:
//        $ts  - num milliseconds since start
//        $tt  - num milliseconds since last formatting
//        $ll  - log level as a single character
//        $msg - the message
// --- returns a function (rec: LogRecord) => string
export const getFormatter = (str: string, dest: string) => {
	return (rec: LogRecord): string => {
		const {datetime, level, msg} = rec
		const result = interpolate(str, {
			'$ts': sinceLoadStr(datetime),
			'$tt': sinceLoadStr(datetime),
			'$ll': levelStr(level),
			'$msg': getPrefix() + msg
		})
		if (dest === 'console') {
			const patched = result.replaceAll('\t', '   ')
			lConsoleLog.push(patched)
			return patched
		}
		else {
			return result
		}
	}
}

// ---------------------------------------------------------------------------

export const indentLog = (): void => {
	logIndent += 1
	return
}

// ---------------------------------------------------------------------------

export const undentLog = (): void => {
	if (logIndent > 0) {
		logIndent -= 1
	}
	return
}
// ---------------------------------------------------------------------------