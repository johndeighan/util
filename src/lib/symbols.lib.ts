"use strict";
// symbols.lib.civet

import {
	undef, defined, notdefined, assert, croak,
	hash, hashof, isEmpty, nonEmpty,
	} from 'datatypes'
import {pass, o, getOptions, keys} from 'llutils'
import {OL, ML} from 'to-nice'
import {resetOneIndent} from 'indent'
import {LOG, DBG, DBGVALUE} from 'logger'
import {TPLLToken, TTokenGenerator, allTokensInBlock} from 'pll'
import {isFile, slurp} from 'fsys'

/**
 * @module symbols - locate common symbols
 *    parses a file (default: src/.symbols) that looks like:
 *       indent
 *          oneIndent resetOneIndent indentLevel
 *          lineDesc splitLine indented
 *       fsys
 *          isFile isDir
 *          fileExt withExt
 *
 *    and implements function:
 *       sourceLib := (symbol: string): string?
 */
// --- not exported!
// --- {<sym>: <lib>, ...}

const symbolsPath = 'src/.symbols'

// --- holds symbols in symbolsPath,
//     but only loaded when needed
//     and only if file exists

const symbolMap = new Map<string, string>()

// ---------------------------------------------------------------------------

export const loadSymbols = (
		block: string,
		aMap = new Map<string, string>(),
		): Map<string, string> => {

	DBG("in loadSymbols()")
	// --- Check if libraries actually exist

	let level = 0    // --- symGen must know the current level
	const symGen: TTokenGenerator = function*(line: string) {
		if (level === 0) {
			yield {
				kind: 'lib',
				str: line
				}
		}
		else if (level === 1) {
			for (const str of line.split(/\s+/)) {
				yield {
					kind: 'symbol',
					str
					}
			}
		}
		else {
			LOG(`level = ${level}`)
			croak(`level = ${level}`)
		}
		return
	}

	let curLib: (string | undefined) = undef
	for (const {kind, str} of allTokensInBlock(block, symGen)) {
		DBG(`TOKEN: ${kind}`)
		switch(kind) {
			case 'indent': {
				level += 1;break;
			}
			case 'undent': {
				level -= 1;break;
			}
			case 'lib': {
				DBG(`Set curLib to ${OL(str)}`)
				curLib = str;break;
			}
			case 'symbol': {
				if (defined(str)) {
					if (level === 0) {
						curLib = str
					}
					else if (defined(curLib)) {
						DBG(`ADD ${str} from ${curLib}`)
						aMap.set(str, curLib)
					}
					else {
						croak("curLib empty at level > 0")
					}
				}
				else {
					croak("undefined str!")
				};break;
			}
			case 'eof': {
				DBG('EOF');break;
			}
			case 'empty': {
				pass();break;
			}
			default:
				croak(`Unknown kind: ${kind}`)
		}
	}
	resetOneIndent()
	return aMap
}

// ---------------------------------------------------------------------------

export const loadSymbolsFromFile = (path: string): void => {

	const block = slurp(path)
	loadSymbols(slurp(path), symbolMap)
	return
}

// ---------------------------------------------------------------------------

export const sourceLib = (
		symbol: string,
		m: Map<string, string> = symbolMap
		): (string | undefined) => {

	if ((m === symbolMap) && (symbolMap.size === 0)) {
		const contents = slurp(symbolsPath)
		loadSymbols(contents, symbolMap)
	}
	return m.get(symbol)
}

// ---------------------------------------------------------------------------

export const libsAndSymbols = (
		lSymbols: string[]
		): hashof<string[]> => {

	if ((symbolMap.size === 0) && isFile(symbolsPath)) {
		loadSymbolsFromFile(symbolsPath)
	}
	const hLibs: hashof<string[]> = {}
	for (const sym of lSymbols) {
		const srcLib = sourceLib(sym)
		if (defined(srcLib)) {
			if (srcLib in hLibs) {
				hLibs[srcLib].push(sym)
			}
			else {
				hLibs[srcLib] = [sym]
			}
		}
	}
	return hLibs
}

// ---------------------------------------------------------------------------

export const getNeededImportStmts = (
		lSymbols: string[]
		): string[] => {

	DBG(`CALL getNeededImportStmts(${OL(lSymbols)})`)
	const hLibs = libsAndSymbols(lSymbols)
	DBGVALUE('hLibs', hLibs)
	const results = []
	for (const lib of keys(hLibs)) {
		const lSyms = hLibs[lib]
		const strSyms = lSyms.join(', ')
		results.push(`import {${strSyms}} from '${lib}';`)
	}
	const lStmts = results
	return lStmts
}