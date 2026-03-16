"use strict";
// predicates.lib.civet

import {
	undef, defined, notdefined, integer,
	} from 'datatypes'

export type TPredicate<T=unknown> = (item: T) => boolean
export type TNoArgPredicate = () => boolean

// ---------------------------------------------------------------------------

export const isEven = (i: integer): boolean => {

	return (i % 2 === 0)
}

// ---------------------------------------------------------------------------

export const isOdd = (i: integer): boolean => {

	return (i % 2 === 1)
}

// ---------------------------------------------------------------------------

export const anyOf = <T,>(
		lItems: T[],
		checkFunc: TPredicate<T>
		): boolean => {

	for (const item of lItems) {
		if (checkFunc(item)) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------

export const allOf = <T,>(
		lItems: T[],
		checkFunc: TPredicate<T>
		): boolean => {

	for (const item of lItems) {
		if (!checkFunc(item)) {
			return false
		}
	}
	return true
}

