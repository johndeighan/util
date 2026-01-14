"use strict";
// build-symbols-json.cmd.civet

import {stdChecks} from 'llutils'
import {undef, assert, hash, isEmpty, nonEmpty} from 'datatypes'
import {getOptions, CStringSetMap, keys} from 'llutils'
import {OL} from 'to-nice'
import {LOG, DBG, WARN, LOGVALUE, DBGVALUE} from 'logger'
import {barf, allFilesMatching, relpath} from 'fsys'
import {analyze, CAnalysis} from 'typescript'

stdChecks("build-symbols-json")

// ---------------------------------------------------------------------------
// --- ASYNC GENERATOR

const getDotSymbolsLines = function*(
		path: string,
		hOptions: hash = {}
		): Generator<string, void, void> {

	type opt = {
		oneIndent: string
		maxLineLen: number
		}
	const {oneIndent, maxLineLen} = getOptions<opt>(hOptions, {
		oneIndent: '\t',
		maxLineLen: 75
		})

	const lSymbols: string[] = []
	let lineLen = 0     // --- always <= maxLineLen
	let pathYielded = false
	const analysis = analyze(path)
	for (const name of analysis.getExports()) {
		const pos = name.indexOf('<')
		const sym = (pos === -1) ? name : name.substring(0, pos)
		if (lineLen + sym.length + 1 > maxLineLen) {
			if (!pathYielded) {
				yield path.replace('.civet', '.ts')
				pathYielded = true
			}
			yield `${oneIndent}${lSymbols.join(' ')}`
			lSymbols.length = 0
			lineLen = 0
		}
		else {
			lSymbols.push(sym)
			lineLen += sym.length + 1
		}
	}
	if (lSymbols.length > 0) {
		if (!pathYielded) {
			yield path.replace('.civet', '.ts')
			pathYielded = true
		}
		yield `${oneIndent}${lSymbols.join(' ')}`
	}
	return
}

// ---------------------------------------------------------------------------

const getDotSymbols = async function*(
		hOptions: hash = {}
		): AsyncGenerator<string, void, void> {

	for (const path of allFilesMatching('**/*.lib.civet')) {
		DBG(`GET symbols from: ${relpath(path)}`)
		for await (const line of getDotSymbolsLines(path)) {
			yield line
		}
	}
	return
}

// ---------------------------------------------------------------------------

const lLines = await Array.fromAsync(getDotSymbols())
const contents = lLines.join('\n')
DBGVALUE('contents', contents)
barf('src/.symbols', contents)

