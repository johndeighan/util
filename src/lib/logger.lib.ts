"use strict";
// logger.lib.civet

import {write, writeln} from 'console-utils'
import {isString} from 'datatypes'
import {f} from 'llutils'
import {OL, ML} from 'to-nice'

let level = 0
export const INDENT = Symbol('indent')
export const UNDENT = Symbol('undent')

// --- useful for unit testing
//     or saving final log to a log file
export let lLogLines: string[] = []

// ---------------------------------------------------------------------------

const logLine = (
		str: string,
		oneIndent: string = '\t'
		): void => {

	const line = oneIndent.repeat(level) + str
	lLogLines.push(line)
	writeln(line)
	return
}

// ---------------------------------------------------------------------------

export const getLog = (): string => {

	return lLogLines.join('\n')
}

// ---------------------------------------------------------------------------

export type TLogLevel = 'silent' | 'info' | 'debug'

let lLogLevels: TLogLevel[] = ['info']

// ---------------------------------------------------------------------------

export const curLogLevel = (): TLogLevel => {

	if (lLogLevels.length === 0) {
		return 'info'
	}
	else {
		return lLogLevels[lLogLevels.length - 1]
	}
}

// ---------------------------------------------------------------------------

export const setLogLevel = (level: TLogLevel): void => {

	if (lLogLevels.length > 0) {
		lLogLevels[lLogLevels.length - 1] = level
	}
	return
}

// ---------------------------------------------------------------------------

export const pushLogLevel = (level: TLogLevel): void => {

	lLogLevels.push(level)
	return
}

// ---------------------------------------------------------------------------

export const popLogLevel = (): TLogLevel => {

	if (lLogLevels.length === 0) {
		return 'info'
	}
	else {
		const retval = lLogLevels[lLogLevels.length - 1]
		lLogLevels.pop()
		return retval
	}
}

// ---------------------------------------------------------------------------

export const LOG = (...lItems: unknown[]): void => {

	if (curLogLevel() !== 'silent') {
		for (const item of lItems) {
			if (item === INDENT) {
				level += 1
			}
			else if (item === UNDENT) {
				if (level > 0) {
					level -= 1
				}
			}
			else if (isString(item)) {
				writeln(item)
			}
			else {
				writeln(OL(item))
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const DBG = (...lItems: unknown[]): void => {

	if (curLogLevel() === 'debug') {
		LOG(...lItems)
	}
	return
}

// ---------------------------------------------------------------------------

export const LOGVALUE = (label: string, value: unknown): void => {

	LOG(f`${label}:{blue} = ${ML(value)}`)
	return
}

// ---------------------------------------------------------------------------

export const DBGVALUE = (label: string, value: unknown): void => {

	DBG(f`${label}:{blue} = ${ML(value)}`)
	return
}

