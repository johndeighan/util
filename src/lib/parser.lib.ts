"use strict";
// parser.lib.civet

import {uni, esc} from 'unicode'
import {
	undef, defined, notdefined, assert, hash, hashof,
	isArray, isFunction, isString, isRegExp, isHash, isEmpty,
	} from 'datatypes'
import {
	getOptions, spaces, randomLabel, getLineAndColumn,
	allLinesInBlock,
	} from 'llutils'
import {resetOneIndent, splitLine} from 'indent'
import {OL} from 'to-nice'
import {DBG, INDENT, UNDENT} from 'logger'
import {findFile, allLinesIn} from 'fsys'

// ---------------------------------------------------------------------------

export type TRuleFunc = (str: string, pos: number) => number

export const isRuleFunc = (x: unknown): x is TRuleFunc => {
	return (typeof x === 'function')
}

export class Rule {
	type: string
	func: TRuleFunc
	label: string = randomLabel()
	lChildren: Rule[] = []

	constructor(type: string, func: TRuleFunc, lChildren: Rule[] = []) {
		this.type = type
		this.func = func
		this.lChildren = []
	}

	next(str: string, pos: number): number {
		return this.func(str, pos)
	}
}

// --- Anything that can be converted to a Rule

export type TLaxRule = RegExp | string | TRuleFunc | TLaxRule[] | {
	[key: string | symbol]: TLaxRule
}

// --- This used to work
//     I want to allow a TLaxRule to possibly be an array or hash of TLaxRules
//     was: export type TLaxRule = RegExp | string | TRuleFunc | TLaxRule[] | hashof<TLaxRule>

export type TCallback = (rule: Rule, lMatches: string[]) => void

// ---------------------------------------------------------------------------
// --- Custom errors

export class ParseError extends Error {

	constructor(msg: string) {
		super(msg)
		this.name = 'ParseError'
	}
}

// ---------------------------------------------------------------------------
// --- Returns a function that:
//        1. accepts a string
//        2. throws error on failure

export type TParser = (str: string) => void

export function getParser(
		laxRule: TLaxRule | TLaxRule[] | hashof<TLaxRule>,
		lCallbacks: TCallback[] = [],
		hOptions: hash = {}
		): TParser {

	type opt = {
		reSkip: RegExp
		partial: boolean
	}

	const {reSkip, partial} = getOptions<opt>(hOptions, {
		reSkip: /^\s+/,
		partial: false,
	})

	// ..........................................................
	// function that skips reSkip, if defined

	const skipIgnored: TRuleFunc = (str, pos): number => {

		const lMatches = str.substring(pos).match(reSkip)
		if (defined(lMatches)) {
			const len = lMatches[0].length
			if (len > 0) {
				DBG(`${len} chars skipped`)
			}
			return pos + len
		}
		else {
			return pos
		}
	}

	// ..........................................................
	// --- function that maps RegExp => Rule

	const RegexMatcher = (re: RegExp): Rule => {

		return new Rule('r', (str, pos): number => {
			const skipPos = skipIgnored(str, pos)
			const lMatches = re.exec(str.substring(skipPos))
			if (lMatches === null) {
				throw new ParseError("RegExp Rule not matched")
			}
			const len = lMatches[0].length
			assert((len > 0), "Zero length in regex match")
			const newPos = skipPos + len
			for (const cb of lCallbacks) {
				cb(rule, lMatches)
			}
			return newPos
		}
		)
	}

	// ..........................................................
	// --- function that maps string => Rule

	const StringMatcher = (substr: string): Rule => {

		return new Rule('s', (str, pos): number => {
			const skipPos = skipIgnored(str, pos)
			if (!str.startsWith(substr, skipPos)) {
				throw new ParseError("String Rule not matched")
			}
			const len = substr.length
			assert((len > 0), "Zero length in regex match")
			const newPos = skipPos + len
			for (const cb of lCallbacks) {
				cb(rule, [substr])
			}
			return newPos
		}
		)
	}

	// ..........................................................
	// --- function that maps TRuleFunc => Rule

	const FuncMatcher = (func: TRuleFunc): Rule => {

		return new Rule('f', (str, pos): number => {
			const skipPos = skipIgnored(str, pos)
			const newPos = func(str, skipPos)
			assert((newPos > pos), "Zero length in rule match")
			for (const cb of lCallbacks) {
				cb(rule, [str.substring(pos, newPos)])
			}
			return newPos
		}
		)
	}

	// ..........................................................
	// --- function that maps TLaxRule => Rule

	const getRule = (laxRule: TLaxRule | TLaxRule[] | hashof<TLaxRule>): Rule => {

		if (isRegExp(laxRule)) {
			return RegexMatcher(laxRule)
		}
		else if (isString(laxRule)) {
			return StringMatcher(laxRule)
		}
		else if (isRuleFunc(laxRule)) {
			return FuncMatcher(laxRule)
		}
		else if (isArray(laxRule)) {
			return All(laxRule)
		}
		else {
			return Any(laxRule)
		}
	}

	// ..........................................................
	// --- function that maps TLaxRule[] => Rule

	const Any = (hItems: hashof<TLaxRule>): Rule => {

		const results = []
		for (const key in hItems) {
			const val = hItems[key]
			const rule = getRule(val as TLaxRule)
			rule.label = key
			results.push(rule)
		}
		const lRules = results
		return new Rule('|', (str, pos): number => {
			// --- Try each rule
			//     if any succeed, succeed & return new pos
			//     else throw error
			for (const rule of lRules) {
				try {
					const newPos = rule.next(str, pos)
					for (const cb of lCallbacks) {
						cb(rule, [str.substring(pos, newPos)])
					}
					return newPos
				} catch(e) {}
			}
			throw new ParseError("Any Rule not matched")
		}
		)
	}

	// ..........................................................
	// --- function that maps TLaxRule[] => Rule

	const All = (lLaxRules: TLaxRule[]): Rule => {

		const results1 = []
		for (const laxRule of lLaxRules) {
			results1.push(getRule(laxRule))
		}
		const lRules = results1
		return new Rule('&', (str, pos): number => {
			for (const rule of lRules) {
				try {
					const newPos = rule.next(str, pos)
					pos = newPos
				}
				catch (err) {
					throw new ParseError("All Rule not matched")
				}
			}
			for (const cb of lCallbacks) {
				cb(rule, [])
			}
			return pos
		}
		)
	}

	// --- Return a function that throws an error
	//     if string doesn't parse

	const rule = getRule(laxRule)

	return (str): boolean => {

		DBG(`Parse ${esc(str)}`, INDENT)
		try {
			const endPos = rule.next(str, 0)
			DBG(`endPos = ${endPos}`)
			if ((endPos === str.length) || partial) {
				DBG(UNDENT)
				return true
			}
			const finalPos = skipIgnored(str, endPos)
			DBG(`finalPos = ${finalPos}`, UNDENT)
			if (finalPos !== str.length) {
				throw new ParseError("Not all input exhausted")
			}
			return true
		}
		catch (err) {
			DBG(UNDENT)
			throw err
		}
	}
}
