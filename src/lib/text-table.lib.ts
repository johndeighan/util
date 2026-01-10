"use strict";
// text-table.lib.civet

import {sprintf} from 'jsr:@std/fmt/printf'
import {
	undef, defined, notdefined, assert, croak, nonEmpty,
	isString, isNumber, isInteger, isArray, array, arrayof,
	hash, hashof, integer, char, isArrayOfIntegers,
	} from 'datatypes'
import {
	getOptions, words, rtrim, alignString, toBlock, TAlignment,
	} from 'llutils'
import {OL} from 'to-nice'
import {LOGVALUE, DBG} from 'logger'

// ---------------------------------------------------------------------------

type TColDesc = {
	width: integer
	format: string
	align: TAlignment
	total: (number | undefined) // running total
	subtotal: (number | undefined) // running subtotal, undef on subtotal()
	}

type titleRec = {
	opcode: 'title'
	title: string
	align: TAlignment
	}

type labelsRec = {
	opcode: 'labels'
	lRow: string[]
	}

type dataRec = {
	opcode: 'data'
	lRow: string[]
	}

type sepRec = {
	opcode: 'sep'
	ch: char
	}

type fullsepRec = {
	opcode: 'fullsep'
	ch: char
	}

type totalsRec = {
	opcode: 'totals'
	lRow: string[]
	}

type subtotalsRec = {
	opcode: 'subtotals'
	lRow: string[]
	}

type rowDesc = titleRec |
	labelsRec |
	dataRec |
	sepRec |
	fullsepRec |
	totalsRec |
	subtotalsRec

/**
 * class used to construct a text table as a string
 *
 * SYNOPSIS:
 * 	table := new TextTable('l r%.2f r%.2f')
 * 	table.title   'My Expenses'
 * 	table.fullsep '-'
 * 	table.labels  ['', 'Jan', 'Feb']
 * 	table.sep()
 * 	table.data    ['coffee', 30, 40]
 * 	table.data    ['dining', 130, 40]
 * 	table.sep     '-'
 * 	table.subtotals()
 * 	table.data    ['one time', 10, 20]
 * 	table.data    ['other', 1000, 40]
 * 	table.fullsep '='
 * 	table.totals()
 *
 * 	textTable := table.asString(o'hide=1')
 */
type opt = {
	decPlaces: number
	parseNumbers: boolean
	}

export class TextTable {
	hOptions: opt
	numCols: integer
	lLabels: string[] = []
	lCols: TColDesc[] = []
	lRows: rowDesc[] = []

	constructor(formatStr: string, hOptions: hash = {}) {
		// --- Valid options:
		//        decPlaces - used for numbers with no % style format
		//                    default: 2
		//        parseNumbers - string data that looks like a number
		//                       is treated as a number, default: false
		this.hOptions = getOptions<opt>(hOptions, {
			decPlaces: 2,
			parseNumbers: false
			})
		for (const word of words(formatStr)) {
			let ref
			if (ref = word.match(/^(l|c|r)(\%\S+)?$/)) {
				const lMatches = ref
				const [_, align, fmt] = lMatches
				this.lCols.push({
					width: 0,
					format: fmt,
					align: (align || 'left') as TAlignment,
					total: undef,
					subtotal: undef,
				})
			} // incremented as data is added,
			else {
				croak(`Bad format string: ${OL(word)}`)
			}
		}
		this.numCols = this.lCols.length
	}

	// ..........................................................

	title(title: string, align: TAlignment = 'center'): void {
		assert(nonEmpty(title), "Bad title: '@{title}'")
		this.lRows.push({
			opcode: 'title',
			title,
			align
		})
		return
	}

	// ..........................................................

	labels(lLabels: ((string | undefined))[]): void {
		assert((lLabels.length === this.numCols), `lLabels = ${OL(lLabels)}`)
		const lRow: string[] = lLabels.map((item, colNum) => {
			return item || ''
		})
		this.adjustColWidths(lRow)
		this.lRows.push({
			opcode: 'labels',
			lRow
		})
		this.lLabels = lRow
		return
	}

	// ..........................................................

	accum(hCol: TColDesc, amt: number): void {
		if (defined(hCol.total)) {
			hCol.total += amt
		}
		else {
			hCol.total = amt
		}
		if (defined(hCol.subtotal)) {
			hCol.subtotal += amt
		}
		else {
			hCol.subtotal = amt
		}
		return
	}

	// ..........................................................

	data(lData: (number | string | undefined)[]): void {

		assert((lData.length === this.numCols), `lData = ${OL(lData)}`)
		const lRow: string[] = lData.map((item, colNum): string => {
			switch(typeof item) {
				case 'number':
					const h = this.lCols[colNum]
					this.accum(h, item)
					return this.formatNum(item, h.format)
				case 'string':
					const hCol = this.lCols[colNum]
					if (this.hOptions.parseNumbers && item.match(/^\d+(\.\d*)?([Ee]\d+)?$/)) {
						const num = parseFloat(item)
						if (Number.isNaN(num)) {
							return item
						}
						else {
							this.accum(hCol, num)
							return this.formatNum(num, hCol.format)
						}
					}
					else {
						return item
					}
				default:
					return ''
			}
		})
		this.adjustColWidths(lRow)
		this.lRows.push({
			opcode: 'data',
			lRow
		})
		return
	}

	// ..........................................................

	sep(ch: char = '-'): void {
		this.lRows.push({
			opcode: 'sep',
			ch
		})
		return
	}

	// ..........................................................

	fullsep(ch: char = '-'): void {
		this.lRows.push({
			opcode: 'fullsep',
			ch
		})
		return
	}

	// ..........................................................

	totals(): void {
		const lRow = this.lCols.map((hCol, colNum): string => {
			const {total, format} = hCol
			if (defined(total)) {
				return this.formatNum(total, format)
			}
			else {
				return ''
			}
		})
		this.adjustColWidths(lRow)
		this.lRows.push({
			opcode: 'totals',
			lRow
		})
		return
	}

	// ..........................................................

	subtotals(): void {
		const lRow = this.lCols.map((hCol, colNum): string => {
			const {subtotal, format} = hCol
			if (defined(hCol.subtotal)) {
				hCol.subtotal = 0
			}
			if (defined(subtotal)) {
				return this.formatNum(subtotal, format)
			}
			else {
				return ''
			}
		})
		this.adjustColWidths(lRow)
		this.lRows.push({
			opcode: 'subtotals',
			lRow
		})
		return
	}

	// ..........................................................

	adjustColWidths(lRow: string[]): void {
		let i1 = 0
		for (const str of lRow) {
			const colNum = i1++
			const hCol = this.lCols[colNum]
			if (str.length > hCol.width) {
				hCol.width = str.length
			}
		}
		return
	}

	// ..........................................................

	formatNum(num: number, fmt: string): string {
		if (defined(fmt)) {
			return sprintf(fmt, num)
		}
		else {
			return num.toFixed(this.hOptions.decPlaces)
		}
	}

	// ..........................................................

	dumpInternals(): void {
		LOGVALUE('numCols:', this.numCols)
		LOGVALUE('lCols:', this.lCols)
		LOGVALUE('lRows:', this.lRows)
		return
	}

	// ..........................................................

	getTotalWidth(lHidden: integer[] = []) {
		const accFunc = (acc: integer, hCol: TColDesc, i: integer): number => {
			if (lHidden.includes(i)) {
				return acc
			}
			else {
				return acc + 1 + hCol.width
			}
		}
		return this.lCols.reduce(accFunc, 0) - 1
	}

	// ..........................................................

	getColsToHide(hide: (string | integer | integer[])): integer[] {
		if (isArrayOfIntegers(hide)) {
			return hide
		}
		switch(typeof hide) {
			case 'string':
				{
					const results = []
					for (const str of hide.split(',')) {
						if (str.match(/^\d+$/)) {
							results.push(parseInt(str))
						}
						else {
							results.push(this.lLabels.indexOf(str.trim()))
						}
					}
					const lInts = results // might be -1
					return lInts
				}
			case 'number':
				return [hide]
			default:
				return []
		}
	}

	// ..........................................................
	// --- option 'lHide' should be an array of integers

	asString(hOptions = {}): string {
		// --- option to hide certain columns

		type opt = {
			lHide: number[]
			}
		const {lHide} = getOptions<opt>(hOptions, {
			lHide: []
			})

		DBG('lHide', lHide)
		const lHidden = this.getColsToHide(lHide)
		DBG('lHidden', lHidden)

		// --- create a filter function
		const ff = (
			(lHidden.length === 0?
				((x: unknown) => { return true })
			:
				((x: unknown, i: integer) => { return !lHidden.includes(i) }))
			)
		const totalWidth = this.getTotalWidth(lHidden)
		DBG('totalWidth', totalWidth)
		// --- Map each item in @lRows to a string
		const lLines = this.lRows.map((h): string => {
			switch(h.opcode) {
				case 'title':
					return alignString(h.title, totalWidth, h.align)
				case 'labels':
					// --- labels are always center aligned
					return h.lRow.map((str, colNum) => {
						const {width} = this.lCols[colNum]
						return alignString(str, width, 'center')
					}
					).filter(ff).join(' ')
				case 'data':
				case 'totals':
				case 'subtotals':
					return h.lRow.map((str, colNum) => {
						const {width, align} = this.lCols[colNum]
						return alignString(str, width, align)
					}
					).filter(ff).join(' ')
				case 'sep':
					return this.lCols.map((hCol) => {
						return h.ch.repeat(hCol.width)
					}
					).filter(ff).join(' ')
				case 'fullsep':
					return h.ch.repeat(totalWidth)
			}
		})
		return toBlock(lLines.map((line) => rtrim(line)))
	}
}