"use strict";
// f-strings.lib.civet

import {sprintf} from 'jsr:@std/fmt/printf'

import {esc} from 'unicode'
import {defined, nonEmpty, isInteger} from 'datatypes'

// ---------------------------------------------------------------------------
// --- Number of strings is always 1 greater than the number of values

export const f = (
		lStrings: TemplateStringsArray,
		...lValues: unknown[]
		): string => {

	const lParts: string[] = [lStrings[0]]
	let i1 = 0;for (const val of lValues) {const i = i1++;
		const [nextStr, width, escape] = fsplit(lStrings[i+1])
		lParts.push((
			(()=>{switch(typeof val) {
				case 'string': {
					const valStr = escape ? esc(val) : val
					return width ? sprintf(`%-${width}s`, valStr) : valStr
				}
				case 'number': {
					if (width === 0) {
						return val.toString()
					}
					else if (isInteger(val)) {
						return sprintf(`%${width}d`, val)
					}
					else {
						return sprintf(`%${width}.2f`, val)
					}
				}
				default: {
					const valStr = JSON.stringify(val)
					return width ? sprintf(`%-s${width}`, valStr) : valStr
				}
			}})()
			))
		lParts.push(nextStr)
	}
	return lParts.join('')
}

// ---------------------------------------------------------------------------
// --- returns [str, width, escape?]

export const fsplit = (str: string): [string, number, boolean] => {

	const lMatches = str.match(/^:(\!)?(\d+)?(.*)$/)
	if (defined(lMatches)) {
		const [_, escape, width, rest] = lMatches
		return [
			rest,
			width ? parseInt(width) : 0,
			nonEmpty(escape)
			]
	}
	else {
		return [str, 0, false]
	}
}
