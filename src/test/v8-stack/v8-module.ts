"use strict";
import {
	getMyCaller, getMyOutsideCaller, TStackFrame,
	} from 'v8-stack'

type TBothFrames = [TStackFrame?, TStackFrame?]

export const getBoth = (): TBothFrames => {

	const result = secondFunc('both')
	if (Array.isArray(result)) {
		return result
	}
	else {
		throw new Error("Expected array, got TStackFrame")
	}
}

export const getDirect = (): (TStackFrame | undefined) => {

	const result = secondFunc('direct')
	if (Array.isArray(result)) {
		throw new Error("Got unexpected array")
	}
	return result
}

export const getOutside = (): (TStackFrame | undefined) => {

	const result = secondFunc('outside')
	if (Array.isArray(result)) {
		throw new Error("Got unexpected array")
	}
	return result
}

const secondFunc = (type: string): TBothFrames | (TStackFrame | undefined) => {

	return thirdFunc(type)
}

const thirdFunc = (type: string): TBothFrames | (TStackFrame | undefined) => {

	switch(type) {
		case 'both': {
			return [getMyCaller(), getMyCaller()]
		}
		case 'direct': {
			return getMyCaller()
		}
		case 'outside': {
			return getMyOutsideCaller()
		}
		default: {
			throw new Error(`Unknown type: ${type}`)
		}
	}
}
