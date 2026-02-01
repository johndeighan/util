"use strict";
// cmd-args.lib.civet

import {
	undef, defined, notdefined, assert, croak, nonEmpty,
	hash, hashof, char, integer,
	isEmpty, isArray, isBoolean,
	isInteger, isHash, isString,
	} from 'datatypes'
import {keys, getOptions, o, spaces} from 'llutils'
import {clearScreen} from 'console-utils'
import {setLogLevel, LOG, DBG} from 'logger'
import {OL, DUMP} from 'to-nice'

const hFlags: hashof<boolean> = {}
const hValues: hashof<string> = {}
const lNonOptions: string[] = []

const doSetLogger = true // --- maybe check an env var first?
const doHandleClear = true // --- maybe check an env var first?

// ---------------------------------------------------------------------------

export const flag = (ch: char): boolean => {

	return (ch in hFlags) ? hFlags[ch] : false
}

// ---------------------------------------------------------------------------

export const numNonOptions = (): number => {

	return lNonOptions.length
}

// ---------------------------------------------------------------------------

export const nonOption = (i: integer): (string | undefined) => {

	return ((i >= 0) && (i < lNonOptions.length)) ? lNonOptions[i] : undef
}

// ---------------------------------------------------------------------------

export const allNonOptions = function*(): Generator<string, void, void> {

	for (const str of lNonOptions) {
		yield str
	}
	return
}

// ---------------------------------------------------------------------------

export const argValue = (name: string): (string | undefined) => {

	return (name in hValues) ? hValues[name] : undef
}

// ---------------------------------------------------------------------------

export const setCmdArgs = (
		lArgs: string[] = Deno.args
		): void => {

	let i1 = 0
	for (const arg of lArgs) {
		const i = i1++
		if ((arg === '!') && (i === lArgs.length - 1) && doHandleClear) {
			clearScreen()
			continue
		}
		if (arg === '--') {
			continue
		}
		const lMatches = arg.match(/^-([A-Za-z0-9_-]+)(?:(=)(.*))?$/)
		if (lMatches === null) {
			lNonOptions.push(arg)
			continue
		}
		const [_, optStr, eqStr, valueStr] = lMatches
		if (eqStr) {
			hValues[optStr] = valueStr
		}
		else {
			for (const ch of optStr.split('')) {
				if (ch === 'D') {
					setLogLevel('debug')
				}
				else if (ch === 'S') {
					setLogLevel('silent')
				}
				hFlags[ch] = true
			}
		}
	}
}

setCmdArgs()

// ---------------------------------------------------------------------------

export const debugging = flag('D')
export const inspecting = flag('d')

// ---------------------------------------------------------------------------

export type TKeyDesc = {
	type?: string // --- ignored for key _
	range?: [integer, integer] //     used only for key _
	desc?: string
}

export type TCmdDesc = {
	[key: string]: TKeyDesc | string
}

// ---------------------------------------------------------------------------

export const helpStr = (hDesc: TCmdDesc): string => {

	const lLines = ['Usage:']
	for (const key in hDesc) {const h = hDesc[key];
		// @ts-ignore
		const desc: string = isString(h) ? h : ('desc' in h) ? h.desc : ''
		if (key === '_') {
			lLines.push(`   non-options: ${desc}`)
		}
		else if (desc) {
			lLines.push(`   ${key}: ${desc}`)
		}
	}
	return lLines.join('\n')
}

// ---------------------------------------------------------------------------

export const getCmdArgErrors = (hDesc: TCmdDesc): (string | undefined) => {

	const lErrors: string[] = []
	for (const flag of keys(hFlags)) {
		if ((!(flag in hDesc)) && (flag !== 'D')) {
			lErrors.push(`Unknown flag: ${flag}`)
		}
	}
	for (const key in hValues) {
		const value = hValues[key]
		if (key in hDesc) {
			const hKeyDesc = hDesc[key]
			// @ts-ignore
			if (isHash(hKeyDesc) && ('type' in hKeyDesc)) {
				switch(hKeyDesc.type) {
					case 'number': {
						assert(value.match(/^\d+(?:\.\d*)?$/),
								`Not a number: ${value}`);break;
					}
				}
			}
		}
		else {
			lErrors.push(`Unknown var: ${key}`)
		}
	}
	return (lErrors.length === 0? undef : lErrors.join('\n'))
}

// ---------------------------------------------------------------------------
// --- Throws exception if problem found
//     Also handles -h option as help text

export const checkCmdArgs = (hDesc: TCmdDesc): void => {

	if (flag('h')) {
		LOG(helpStr(hDesc))
		Deno.exit(0)
	}
	const errMsg = getCmdArgErrors(hDesc)
	if (defined(errMsg) && nonEmpty(errMsg)) {
		croak(errMsg)
	}
	return
}