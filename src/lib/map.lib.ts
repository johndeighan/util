"use strict";
// map.lib.civet

import {
	undef, defined, notdefined, assert, croak,
	isFunction, TNonFunction,
	} from 'datatypes'
import {LOG, DBG, ERR} from 'logger'
import {OL} from 'to-nice'

// ---------------------------------------------------------------------------
// ASYNC

// --- An accumulator cannot be a function and must be defined
type TAccum<T> = Exclude<Exclude<T, Function>, undefined>

type TMapperWithAccum<TIn, TOut, T> = (
	x: TIn,
	i: number,
	acc: TAccum<T>
	) => Generator<TOut, T>

type TMapper<TIn, TOut> = (
	x: TIn,
	i: number,
	) => Generator<TOut>

// --- Variant 1, no accumulator
export function MAP<TIn, TOut, T extends TNonFunction<unknown>>(
		lItems:  Generator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): TOut[]

// --- Variant 2
export function MAP<TIn, TOut, T extends TNonFunction<unknown>>(
		lItems:  Generator<TIn> | TIn[],
		acc: TAccum<T>,
		mapFunc: TMapperWithAccum<TIn, TOut, T>
		): [TOut[], TAccum<T>]

// --- implementation
export function MAP<TIn, TOut, T extends TNonFunction<unknown>>(
		lItems: Generator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | TAccum<T>,
		arg3: void | TMapperWithAccum<TIn, TOut, T>
		): TOut[] | [TOut[], TAccum<T>] {

	let lFinalItems: TOut[] = []

	if (isFunction(arg2)) {
		// --- variant 1, no accumulator, arg2 is a mapper
		const mapper: TMapper<TIn, TOut> = arg2

		let i1 = 0;for (const item of lItems) {const i = i1++;
			DBG(`MAP: ${i}: ${OL(item)}`)
			const iter = mapper(item, i)
			while(true) {
				const {done, value} = iter.next()
				if (done) {
					break
				}   // --- continue with outer loop
				else {
					lFinalItems.push(value)
				}
			}
		}
		return lFinalItems
	}
	else if (defined(arg3)) {
		// --- variant 2
		let runningAcc: TAccum<T> = arg2
		const mapper: TMapperWithAccum<TIn, TOut, T> = arg3

		let i2 = 0;for (const item of lItems) {const i = i2++;
			DBG(`MAP: ${i}: ${OL(item)}`)
			const iter = mapper(item, i, runningAcc)
			while(true) {
				const {done, value} = iter.next()
				if (done) {
					if (typeof value !== 'function') {
						// @ts-ignore
						runningAcc = value
					}
					break
				}   // --- continue with outer loop
				else {
					lFinalItems.push(value)
				}
			}
		}
		return [lFinalItems, runningAcc]
	}
	croak("Should never happen")
	return []
}

