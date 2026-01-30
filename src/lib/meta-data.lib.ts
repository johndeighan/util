"use strict";
// meta-data.lib.civet

import {
	undef, defined, notdefined, isString, assert, croak,
	hash, hashof,
	} from 'datatypes'
import {f, fromTAML} from 'llutils'

export type TConverter = (str: string) => unknown

const hMetaDataTypes: hashof<TConverter> = {
	'---': (block: string) => {
		return fromTAML(`---\n${block}`)
	}
	}

// ---------------------------------------------------------------------------

export const addMetaDataType = (
	marker: string,
	converter: TConverter
	): void => {

	assert((marker.length === 3), f`Bad 'start' key: ${marker}`)
	assert((marker[1] === marker[0]) && (marker[2] === marker[0]),
		`Bad 'start' key: ${marker}`)

	hMetaDataTypes[marker] = converter
	return
}

// ---------------------------------------------------------------------------

export const isMetaDataStart = (str: string): boolean => {

	return (str in hMetaDataTypes)
}

// ---------------------------------------------------------------------------
// --- block does NOT contain the meta data start line

export const convertMetaData = (
		marker: string,
		block: string
		): unknown => {

	assert(isMetaDataStart(marker), "Bad meta data")
	const converter = hMetaDataTypes[marker]
	return converter(block)
}