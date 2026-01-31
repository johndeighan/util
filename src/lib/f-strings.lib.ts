"use strict";
// f-strings.lib.civet

import {sprintf} from '@std/fmt/printf'
import {
	cyan, blue, black, red, green, magenta, stripAnsiCode,
	} from '@std/fmt/colors'

import {esc} from 'unicode'
import {TMaybeCmd, syncMapper} from 'var-free'
import {TIterator, defined, nonEmpty, isInteger} from 'datatypes'

// --- hash of all supported colors
const hColor = {
	cyan,
	blue,
	black,
	red,
	green,
	magenta
	} as const

// ---------------------------------------------------------------------------
// --- Number of strings is always 1 greater than the number of values

export const f = (
		lStrings: TemplateStringsArray,
		...lValues: unknown[]
		): string => {

	const [firstStr, mainWidth, mainEsc, mainColor] = fsplit(lStrings[0])
	const lParts = Array.from(syncMapper<unknown,string>(lValues, function*(val: unknown, i: number): TIterator<string, TMaybeCmd> {
		const [str, width, doEsc, color] = fsplit(lStrings[i+1])
		let ref;switch(typeof val) {
			case 'string': {
				ref = formatStr(val, width, doEsc, color, '-');break;
			}
			case 'number': {
				ref = formatStr(val.toString(), width, doEsc, color, '');break;
			}
			default: {
				ref = formatStr(JSON.stringify(val), width, doEsc, color, '-')
			}
		};const result =ref
		yield result + str
		return
	})
		)
	const mainStr = [firstStr, ...lParts].join('')
	return formatStr(mainStr, mainWidth, mainEsc, mainColor, '-')
}

// ---------------------------------------------------------------------------

export const formatStr = (
		str: string,
		width: number,
		doEsc: boolean,
		color: string,
		justify: '-' | ''
		): string => {

	const valStr = doEsc ? esc(str) : str
	const outstr = width ? sprintf(`%${justify}${width}s`, valStr) : valStr
	return colorize(outstr, color)
}

// ---------------------------------------------------------------------------

export const colorize = (str: string, color: string) => {

	if (color in hColor) {
		switch(color) {
			case 'cyan': { return cyan(str)
			}
			case 'blue': { return blue(str)
			}
			case 'black': { return black(str)
			}
			case 'red': { return red(str)
			}
			case 'green': { return green(str)
			}
			case 'magenta': { return magenta(str)
			}
			default: { return str }
		}
	}
	else {
		return str
	}
}

// ---------------------------------------------------------------------------

export const decolorize = (str: string) => {

	return stripAnsiCode(str)
}

// ---------------------------------------------------------------------------
// --- returns [str, width, doEsc?, color]

export const fsplit = (str: string): [string, number, boolean, string] => {

	const lMatches = str.match(/^:(\d+)?(\!)?(?:{([a-z]+)})?(.*)$/)
	if (defined(lMatches)) {
		const [_, width, doEsc, color, rest] = lMatches
		if (width || doEsc || (color && (color in hColor))) {
			return [
				rest,
				width ? parseInt(width) : 0,
				nonEmpty(doEsc),
				defined(color) && (color in hColor) ? color : ''
				]
		}
		else {
			return [str, 0, false, '']
		}
	}
	else {
		return [str, 0, false, '']
	}
}
