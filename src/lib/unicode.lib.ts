"use strict";
// unicode.lib.civet

import {
	undef, defined, hash, hashof, char,
	} from 'datatypes'

// ---------------------------------------------------------------------------

export const uni = {
	lsmartq: '“',      // U+201C
	rsmartq: '”',      // U+201D
	vbar: '│',
	hbar: '─',
	tlcorner: '┌',
	trcorner: '┐',
	blcorner: '└',
	brcorner: '┘',
	tee: '├',
	arrowhead: '>',
	backarrow: '<',
	space: ' ',
	dot: '.',
	fatdot: '˳',
	lI18N: '◄',
	rI18N: '►',
	leftshift: '«',
	rightshift: '»',
	poschar: '┊',
	startchar: '｟',
	endchar: '｠',
	leftarrow: '←',
	rightarrow: '→',
	downarrow: '↓',
	uparrow: '↑',
	shiftin: '\x0F',
	shiftout: '\x0E' // U+000E
	}

// ---------------------------------------------------------------------------

export const lit = (str: string): string => {

	return "｟" + str + "｠"
}

// ---------------------------------------------------------------------------

export const delit = (str: string): (string | undefined) => {

	const lMatches = str.match(/^｟(.*)｠$/)
	return defined(lMatches) ? lMatches[1].trim() : undef
}

// ---------------------------------------------------------------------------

export const litC = (str: string): string => {

	return "\\" + str
}

// ---------------------------------------------------------------------------

const hEsc: hashof<string> = {
	"\r": '←',
	"\n": '↓',
	"\t": '→',
	" ": '˳',
	"←": lit("←"),
	"↓": lit("↓"),
	"→": lit("→"),
	"˳": lit("˳"),
	'\x0F': uni.rightshift,
	'\x0E': uni.leftshift
	}

const hEscMulti: hashof<string> = {
	"\r": '←',
	"\n": '↓\n',
	"\t": '→  ',
	" ": '˳',
	"←": lit("←"),
	"↓": lit("↓"),
	"→": lit("→"),
	"˳": lit("˳"),
	'\x0F': uni.rightshift,
	'\x0E': uni.leftshift
	}

export const esc = (
		str: string,
		style: 'oneline' | 'multiline' = 'oneline',
		pos: (number | undefined) = undef,
		len: number = 0
		): string => {

	let ref;if (style === 'multiline') { ref = hEscMulti} else ref = hEsc;const hReplace =ref
	const lParts: string[] = []
	let i1 = 0
	for (const ch of str) {
		const i = i1++
		if (defined(pos)) {
			if (i === pos) {
				lParts.push((len === 0? uni.poschar : uni.startchar))
			}
			if ((len > 0) && (i === pos + len)) {
				lParts.push(uni.endchar)
			}
		}
		lParts.push((hReplace[ch] || ch))
	}
	return lParts.join('')
}

export const mesc = (str: string): string => {
	return esc(str, 'multiline')
}

// ---------------------------------------------------------------------------

export const unesc = (
		str: string
		): string => {

	const hUnEsc: hashof<string> = {}
	for (const key in hEsc) {const val = hEsc[key];
		hUnEsc[val] = key
	}
	const lParts: string[] = []
	for (const ch of str) {
		if (ch !== '\n') {
			lParts.push((hUnEsc[ch] || ch))
		}
	}
	return lParts.join('')
}

// ---------------------------------------------------------------------------

const pre = {
	fourSpaces: uni.space + uni.space + uni.space + uni.space,
	oneIndent: uni.vbar + uni.space + uni.space + uni.space,
	arrow: uni.blcorner + uni.hbar + uni.arrowhead + uni.space,
	flat: uni.tee + uni.hbar + uni.hbar + uni.space,
	resume: uni.tee + uni.hbar + uni.arrowhead + uni.space,
	yieldSym: uni.tee + uni.backarrow + uni.hbar + uni.space
	}

// ---------------------------------------------------------------------------

// --- options (level = 2):
//        plain         '│   │   '
//        withArrow     '│   └─> '
//        withResume    '│   ├─> '
//        withFlat      '│   ├── '
//        withYield     '│   ├<─ '
//        noLastVbar    '│       '
//        none

export const getPrefix = (level: number, option = 'none'): string => {
	switch(option) {
		case 'plain':
			return pre.oneIndent.repeat(level)
		case 'withArrow':
			if (level === 0) {
				return pre.arrow
			}
			else {
				return pre.oneIndent.repeat(level - 1) + pre.arrow
			}
		case 'withResume':
			if (level === 0) {
				return pre.resume
			}
			else {
				return pre.oneIndent.repeat(level - 1) + pre.resume
			}
		case 'withFlat':
			if (level === 0) {
				return pre.flat
			}
			else {
				return pre.oneIndent.repeat(level - 1) + pre.flat
			}
		case 'withYield':
			if (level === 0) {
				return pre.yieldSym
			}
			else {
				return pre.oneIndent.repeat(level - 1) + pre.yieldSym
			}
		case 'noLastVbar':
			if (level === 0) {
				throw new Error("getPrefix(): noLastVbar but level is 0")
			}
			return pre.oneIndent.repeat(level - 1) + pre.fourSpaces
		default:
			return pre.fourSpaces.repeat(level)
	}
}