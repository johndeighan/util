"use strict";
// from-nice.lib.civet

import {
	undef, defined, notdefined, assert, croak, hash, hashof,
	isArray, isFunction, isBoolean, isString, isNonPrimitive,
	isClass, isArrayOfStrings, isEmpty, nonEmpty, className,
	functionName, symbolName, classDef, functionDef, regexpDef,
	} from 'datatypes'
import {uni, delit} from 'unicode'
import {Fetcher} from 'fetcher'
import {getOptions, keys, toBlock, o, rtrim} from 'llutils'
import {toNice, OL} from 'to-nice'
import {
	TPLLToken, tkIndent, tkUndent, tkEOF, TTokenGenerator, allTokensInBlock,
	} from 'pll'

// ---------------------------------------------------------------------------

export const niceSplitter = function*(
		str: string
		): Generator<TPLLToken, void, void> {

	let ref;let ref1;if (str.startsWith(uni.lsmartq)) {
		yield {
			kind: 'primitive',
			str,
			value: str.substring(1)
			}
	}
	else if ((ref = str.match(/^-(.*)$/))) {const lMatches = ref;
		const tail = lMatches[1].trim()
		if (tail) {
			yield {
				kind: 'list-item',
				str,
				value: getPrimitive(tail)
			}
		}
		else {
			yield {
				kind: 'list-head',
				name: str,
				str: '',
			}
		}
	}
	else if ((ref1 = str.match(/^([A-Za-z][A-Za-z0-9_]*):(.*)$/))) {const lMatches = ref1;
		const name = lMatches[1]
		const tail = lMatches[2].trim()
		if (tail) {
			yield {
				kind: 'hash-item',
				str,
				name,
				value: getPrimitive(tail)
			}
		}
		else {
			yield {
				kind: 'hash-head',
				name,
				str
			}
		}
	}
	else {
		yield {
			kind: 'primitive',
			str,
			value: getPrimitive(str.trim())
		}
	}
}

// ---------------------------------------------------------------------------

export const allNiceTokens = function*(
		block: string
		): Generator<TPLLToken, void, void> {

	for (const h of allTokensInBlock(block, niceSplitter)) {
		yield h
	}
	return
}

// ---------------------------------------------------------------------------
// --- Create a Fetcher, then use
//     recursive descent parsing

export const fromNice = (str: string): unknown => {

	const fetcher = new Fetcher<TPLLToken>(allNiceTokens(str), tkEOF)

	const parseObj = (): unknown => {
		const {kind, str} = fetcher.peek()
		if (kind === 'list-item' || kind === 'list-head') {
			return parseList()
		}
		else if (kind === 'hash-item' || kind === 'hash-head') {
			return parseHash()
		}
		else if (kind === 'eof') {
			return undef
		}
		else {
			fetcher.skip()
			if (defined(str)) {
				return getPrimitive(str.trim())
			}
		}
	}

	const parseList = (): unknown[] => {
		const lItems: unknown[] = []
		let {kind} = fetcher.peek()
		while (['list-item', 'list-head'].includes(kind)) {
			if (kind === 'list-head') {
				lItems.push(parseListNest())
			}
			else {
				lItems.push(fetcher.get().value)
			}
			kind = fetcher.peek().kind
		}
		return lItems
	}

	const parseListNest = (): unknown[] => {
		fetcher.get({kind: 'list-head', str: ''})
		fetcher.get({kind: 'indent', str: ''})
		const value = parseObj()
		fetcher.get({kind: 'undent', str: ''})
		return [value]
	}

	const parseHash = (): hash => {
		const hItems: hash = {}
		let {kind, name} = fetcher.peek()
		if (kind === 'hash-head') {
			fetcher.skip()
			fetcher.get({kind: 'indent', str: ''})
			const value = parseObj()
			if (defined(name)) {
				hItems[name] = value
			}
			fetcher.get({kind: 'undent', str: ''})
		}
		else {
			while (kind === 'hash-item') {
				const {name, value} = fetcher.get()
				if (defined(name)) {
					hItems[name] = value
				}
				;(({ kind } = fetcher.peek()))
			}
		}
		return hItems
	}

	return parseObj()
}

// ---------------------------------------------------------------------------
// --- str should already be trimmed

export const getPrimitive = (str: string): unknown => {

	const s = delit(str)   // delit() returns a trimmed string
	switch(s) {
		case 'undef': { return undef
		}
		case 'null': { return null
		}
		case 'true': { return true
		}
		case 'false': { return false
		}
		case 'NaN': { return NaN
		}
		case 'inf': { return Infinity
		}
		case 'neginf': { return -Infinity
		}
		case 'symbol': { return Symbol()
		}
		case '[]': { return []
		}
		case '{}': { return {}
		}
		case undef: {
			if (str.match(/^\d+$/)) {
				return parseInt(str, 10)
			}
			else if (str.match(/^\d+\.\d*$/)) {
				return parseFloat(str)
			}
			else {
				return str
			}
		}
		default: {
			// --- Handle a few special cases, e.g.
			//        ｟symbol <name>｠
			//        ｟regexp <pattern>｠
			assert(defined(s), `Can't happen: s = ${OL(s)}`)
			const lMatches = s.match(/^(symbol|regexp)\s+(.*)$/)
			if (defined(lMatches)) {
				const [_, kind, name] = lMatches
				switch(kind) {
					case 'symbol': {
						return Symbol(name)
					}
					case 'regexp': {
						return new RegExp(name)
					}
				}
			}
			else {
				croak(`Bad primitive: ${str}`)
			}
		}
	}
}

