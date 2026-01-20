"use strict";
// pll.lib.civet

import {esc} from 'unicode'
import {
	undef, defined, notdefined, hash, isEmpty, nonEmpty,
	} from 'datatypes'
import {getOptions, allLinesInBlock} from 'llutils'
import {DBG, DBGVALUE} from 'logger'
import {oneIndent, indentLevel, splitLine} from 'indent'
import {TextTable} from 'text-table'
import {slurp} from 'fsys'

// ---------------------------------------------------------------------------
// --- Common token types:
//        'line', 'empty', 'indent', 'undent'

export type TPLLToken = {
	kind: string
	str?: string
	name?: string
	value?: unknown
}

export const tkIndent = {kind: 'indent'}
export const tkUndent = {kind: 'undent'}
export const tkEOF = {kind: 'eof'}
export const tokenWith = (tk: TPLLToken, s: string) => {
	return { ...tk, str: s }
}

// ---------------------------------------------------------------------------

export type TTokenGenerator = (line: string) => Generator<TPLLToken, void, void>

const lineTokenGen: TTokenGenerator = function*(line: string) {

	yield {kind: 'line', str: line}
	return
}

// ---------------------------------------------------------------------------

export const allTokensIn = function*(
		iterable: Iterable<string>,
		gen: TTokenGenerator = lineTokenGen
		): Generator<TPLLToken, void, void> {

	let level = 0
	for (const str of iterable) {
		DBG(`LINE: '${esc(str)}'`)
		if (isEmpty(str)) {
			yield {kind: 'empty'}
		}
		else {
			// --- NOTE: If indent > 0, oneIndent will be set
			const [indent, line] = splitLine(str)
			if (indent > level) {
				level += 1
				yield tkIndent
				while (indent > level) {
					level += 1
					yield tkIndent
				}
			}
			if (indent < level) {
				level -= 1
				yield tkUndent
				while (indent < level) {
					level -= 1
					yield tkUndent
				}
			}
			for (const tok of gen(line)) {
				yield tok
			}
		}
	}
	while (level > 0) {
		yield tkUndent
		level -= 1
	}
	yield tkEOF
	return
}

// ---------------------------------------------------------------------------

export const allTokensInBlock = function*(
		block: string,
		gen: TTokenGenerator = lineTokenGen
		): Generator<TPLLToken, void, void> {

	for (const tok of allTokensIn(allLinesInBlock(block), gen)) {
		yield tok
	}
	return
}

// ---------------------------------------------------------------------------

export const allTokensInFile = function*(
		path: string
		): Generator<TPLLToken, void, void> {

	for (const tok of allTokensInBlock(slurp(path))) {
		yield tok
	}
	return
}

// ---------------------------------------------------------------------------

export const tokenTable = (
		lTokens: Iterable<TPLLToken>,
		title = 'Tokens'
		): string => {

	const table = new TextTable('l l')
	table.fullsep('=')
	table.title(title)
	table.fullsep('=')
	table.labels(['kind', 'str'])
	table.sep()
	for (const tok of lTokens) {
		table.data([tok.kind, tok.str])
	}
	table.fullsep('=')
	return table.asString()
}