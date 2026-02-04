"use strict";
// parse-utils.lib.civet

import {sprintf} from '@std/fmt/printf'

import {uni, esc} from 'unicode'
import {
	undef, defined, assert, croak, hash, hashof,
	} from 'datatypes'
import {range, centered, f} from 'llutils'
import {OL} from 'to-nice'
import {TextTable} from 'text-table'

// ---------------------------------------------------------------------------

export const slot = (name: string, width: number): [string, string] => {

	switch(width) {
		case 0:
			return ['', '']
		case 1:
			return [
				uni.vbar,
				name[0]
			]
		case 2:
			return [
				uni.blcorner + uni.brcorner,
				name.substring(0, 2)
			]
		default:
			return [
				uni.blcorner + uni.hbar.repeat(width - 2) + uni.brcorner,
				centered(name.substring(0, width), ' ', width)
			]
	}
}

// ---------------------------------------------------------------------------

export type TStrLoc = {
	pos: number
	length: number
}

export type TParseMatch = [name: string, pos: number, len: number]

// ---------------------------------------------------------------------------

export class CParseMatches {

	lParseMatches: TParseMatch[] = []

	// ..........................................................

	reset(): void {

		this.lParseMatches.length = 0
	}

	// ..........................................................

	match(name: string, loc: TStrLoc | [number, number]): void {

		assert(defined(this.lParseMatches), "undef lParseMatches")
		if (Array.isArray(loc)) {
			this.lParseMatches.push([name, ...loc])
		}
		else {
			this.lParseMatches.push([name, loc.pos, loc.length])
		}
		return
	}

	// ..........................................................

	matchesStr(): string {

		const results = []
		for (const [name, pos, len] of this.lParseMatches) {
			results.push(f`${pos}:15 ${len}:3 ${name}:15`)
		}
		const lLines = results
		return lLines.join('\n')
	}

	// ..........................................................

	matchesTable(): string {

		const results = []
		const table = new TextTable("l r%d r%d l")
		table.labels(['Op', 'Pos', 'Len', 'Data'])
		for (const [name, pos, len] of this.lParseMatches) {
			table.data([name, pos, len, ''])
		}
		return table.asString()
	}

	// ..........................................................

	debugStr(
			str: string,
			hReplace: hashof<string> = {}
			): string {

		const n = this.lParseMatches.length
		const lLineNum: number[] = new Array<number>(n).fill(0)
		const lLines: string[] = []
		let nRemaining = n
		let lineNum = 0
		while (nRemaining > 0) {
			let line1 = ''
			let line2 = ''
			lineNum += 1
			let linePos = 0
			let i1 = 0
			for (const [name, pos, len] of this.lParseMatches) {
				const i = i1++
				if ((pos >= linePos) && (lLineNum[i] === 0)) {
					line1 += ' '.repeat(pos - linePos)
					line2 += ' '.repeat(pos - linePos)
					const [str1, str2] = slot(hReplace[name] || name, len)
					line1 += str1
					line2 += str2
					lLineNum[i] = lineNum
					nRemaining -= 1
					linePos = pos + len
				}
			}
			lLines.push(line1, line2)
		}
		return esc(str) + '\n' + lLines.join('\n')
	}
}