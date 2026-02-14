"use strict";
// extract.lib.civet

import {
	undef, defined, notdefined, isString, isArray,
	isEmpty, nonEmpty, integer, assert,
	assertIsString, assertIsNumber, assertIsArray,
	} from 'datatypes'
import {o, sep} from 'llutils'
import {toNice} from 'to-nice'

// ---------------------------------------------------------------------------

export type TPathItem = string | number

export const getDsPath = (lPath: TPathItem[]): string => {

	const results = []
	for (const x of lPath) {
		results.push((isString(x)? (`.${x}`) : (`[${x}]`)))
	}
	const lParts = results
	return lParts.join('')
}

// ---------------------------------------------------------------------------

export const extract = (x: unknown, dspath: string | TPathItem[]): unknown => {

	assert(defined(x), "extract(): x not defined")
	let ref;if (isArray(dspath)) { ref = getDsPath(dspath)} else ref = dspath;const pathstr =ref
	if (nonEmpty(pathstr)) {
		const expr = `x = x${pathstr}`
		try {
			eval(expr)
		}
		catch (err) {
			const msg: string = (
				  isString(err)          ? err
				: (err instanceof Error) ? err.message
				:                          'Unknown error'
				)
			try {
				console.log(sep('=', `EXTRACT ERROR in ${expr}`))
				console.log(msg)
				console.log(sep('='))
				console.log(toNice(x, o`ignoreEmptyValues`))
				console.log(sep('='))
			} catch(e) {}
			console.log(`EXTRACT ERROR in '${expr}'`)
			console.log(sep('='))
			Deno.exit(99)
		}
	}
	return x
}

// ---------------------------------------------------------------------------

export const getString = (
		x: unknown,
		dspath: string | TPathItem[],
		value: (string | undefined) = undef
		): string => {

	const val = extract(x, dspath)
	assertIsString(val)
	if (value) {
		assert((val === value), `Expected ${value}, got ${val}`)
	}
	return val
}

// ---------------------------------------------------------------------------

export const getNumber = (
		x: unknown,
		dspath: string | TPathItem[],
		value: (number | undefined) = undef
		): number => {

	const val = extract(x, dspath)
	assertIsNumber(val)
	if (value) {
		assert((val === value), `Expected ${value}, got ${val}`)
	}
	return val
}

// ---------------------------------------------------------------------------

export const getArray = (
		x: unknown,
		dspath: string | TPathItem[],
		len: (integer | undefined) = undef
		): unknown[] => {

	assert(defined(x), "getArray(): x not defined")
	const val = extract(x, dspath)
	assertIsArray(val)
	if (len) {
		assert((val.length === len), `Expected ${len} len array, got ${val}`)
	}
	return val
}
