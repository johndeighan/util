"use strict";
// log-levels.lib.civet

import {
	undef, defined, notdefined, assert, croak, hashof,
	} from 'datatypes'

// ---------------------------------------------------------------------------

export type TLogLevel = 'profile' | 'debug' | 'info' | 'warn' | 'error' | 'silent' | 'none' // log nothing
const hNum: hashof<number> = {
	profile: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
	silent: 6,
	none: 7
	}

// --- stack should never be empty
const lStack: TLogLevel[] = ['info']

// ---------------------------------------------------------------------------

export const getLogLevel = (): TLogLevel => {
	if (lStack.length === 0) {
		croak("empty stack")
		return 'none'
	}
	else {
		return lStack[lStack.length - 1]
	}
}

// ---------------------------------------------------------------------------

export const isLogLevel = (x: string): x is TLogLevel => {
	return defined(hNum[x])
}

// ---------------------------------------------------------------------------

export const isInactiveLevel = (level: TLogLevel): boolean => {
	return hNum[level] < hNum[getLogLevel()]
}

// ---------------------------------------------------------------------------

export const setLogLevel = (level: TLogLevel): void => {
	assert((lStack.length > 0), "empty stack")
	lStack[lStack.length - 1] = level
	return
}

// ---------------------------------------------------------------------------

export const pushLogLevel = (level: TLogLevel): void => {
	lStack.push(level)
	return
}

// ---------------------------------------------------------------------------

export const popLogLevel = (): TLogLevel => {
	const result = lStack.pop()
	if (defined(result)) {
		return result
	}
	else {
		console.error("empty logger stack")
		resetLogLevel()
		return 'none'
	}
}

// ---------------------------------------------------------------------------

export const resetLogLevel = (): void => {
	lStack.length = 0
	lStack.push('info')
	return
}