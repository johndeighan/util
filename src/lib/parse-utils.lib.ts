"use strict";
// parse-utils.lib.civet

import {sprintf} from '@std/fmt/printf'

import {uni, esc} from 'unicode'
import {
	undef, defined, assert, croak, hash, hashof,
	} from 'datatypes'
import {range, centered, sep} from 'llutils'
import {f} from 'f-strings'
import {OL} from 'to-nice'
import {LOG, DBG, ERR} from 'logger'
import {TextTable} from 'text-table'

// ---------------------------------------------------------------------------

export const slot = (
		name: string,
		width: number
		): [string, string] => {

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
				centered(name.substring(0, width), {char: ' ', width})
			]
	}
}

// ---------------------------------------------------------------------------

export type TStrLoc = {
	pos: number
	length: number
}

export type TParseMatch = [
	name: string,
	pos: number,
	len: number,
	data: unknown
	]

// ---------------------------------------------------------------------------

export class CParseMatches {

	str: string = ''
	lParseMatches: TParseMatch[] = []

	// ..........................................................

	reset(text: string): void {

		this.lParseMatches.length = 0
		this.str = text
		return
	}

	// ..........................................................

	match(name: string, loc: TStrLoc | [number, number]): void {

		assert(defined(this.lParseMatches), "undef lParseMatches")
		if (Array.isArray(loc)) {
			this.lParseMatches.push([name, ...loc, undef])
		}
		else {
			this.lParseMatches.push([name, loc.pos, loc.length, undef])
		}
		return
	}

	// ..........................................................

	result(data: unknown): unknown {

		const rec = this.lParseMatches.at(-1)
		if (defined(rec)) {
			rec[3] = data
		}
		return data
	}

	// ..........................................................

	matchesTable(): string {

		const results = []
		const table = new TextTable("l r%d r%d l")
		table.title('matches')
		table.fullsep('-')
		table.labels(['Op', 'Pos', 'Len', 'data'])
		table.sep()
		for (const [name, pos, len, data] of this.lParseMatches) {
			table.data([
				name,
				pos,
				len,
				OL(data)
				])
		}
		table.fullsep('-')
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

	// ..........................................................

	dumpParseInfo(): void {

		// --- display the string along with
		//     whatever matches have already been found
		LOG(this.matchesTable())

		LOG(sep('-', 'debug'))
		const n = Math.floor(this.str.length / 10) + 1
		LOG("|         ".repeat(n))
		LOG(this.debugStr(this.str))
		LOG(sep('-'))
		return
	}
}


