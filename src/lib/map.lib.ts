"use strict";
// map.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	undef, defined, notdefined, assert, croak,
	isFunction, TNonFunction, getErrStr,
	} from 'datatypes'
import {LOG, DBG, ERR} from 'logger'
import {OL} from 'to-nice'

// ---------------------------------------------------------------------------

export const fromIterator = async function<T,R>(
		iter: Generator<T,R> | AsyncGenerator<T,R>
		): AutoPromise<[T[], R]> {

	let lItems: T[] = []
	while(true) {
		// --- NOTE: You can await even if it's not async
		const {done, value} = await iter.next()
		if (done) {
			return [lItems, value]
		}
		else {
			lItems.push(value)
		}
	}
	croak("Loop never ended")
}

// ---------------------------------------------------------------------------
// ASYNC

type TMapper<TIn, TOut> = (
	x: TIn,
	i: number,
	) => Generator<TOut>

// --- An accumulator cannot be a function and must be defined
// type TAccum<T> = Exclude<Exclude<T, Function>, undefined>

type TMapperWithAccum<TIn, TOut, T extends TNonFunction> = (
	x: TIn,
	i: number,
	acc: T
	) => Generator<TOut, T>

// ---------------------------------------------------------------------------

// --- Variant 1, no accumulator
export function IMAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): Generator<TOut>

// --- Variant 2
export function IMAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		acc: T,
		mapFunc: TMapperWithAccum<TIn, TOut, T>
		): Generator<TOut, T>

// --- implementation
export function* IMAP<TIn, TOut, T extends TNonFunction>(
		lItems: Generator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | T,
		arg3: void | TMapperWithAccum<TIn, TOut, T>
		): Generator<TOut> | Generator<TOut, T> {

	if (isFunction(arg2)) {
		// --- variant 1, no accumulator, arg2 is a mapper
		const mapper: TMapper<TIn, TOut> = arg2

		let i1 = 0;for (const item of lItems) {const i = i1++;
			DBG(`IMAP: ${i}: ${OL(item)}`)
			const iter = mapper(item, i)
			while(true) {
				const {done, value} = iter.next()
				if (done) {
					break
				}   // --- continue with outer loop
				else {
					yield value
				}
			}
		}
		return
	}
	else {
		assert(isFunction(arg3), "arg3 not a function!")

		// --- variant 2
		let runningAcc: T = arg2
		const mapper: TMapperWithAccum<TIn, TOut, T> = arg3

		let i2 = 0;for (const item of lItems) {const i = i2++;
			DBG(`IMAP: ${i}: ${OL(item)}`)
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
					yield value
				}
			}
		}
		return runningAcc
	}
	croak("Should never happen")
	return []
}

// ---------------------------------------------------------------------------

// --- Variant 1, no accumulator
export function MAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): TOut[]

// --- Variant 2
export function MAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		acc: T,
		mapFunc: TMapperWithAccum<TIn, TOut, T>
		): [TOut[], T]

export function MAP<TIn, TOut, T extends TNonFunction>(
		lItems: Generator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | T,
		arg3: void | TMapperWithAccum<TIn, TOut, T>
		): TOut[] | [TOut[], T] {

	let ref;if (isFunction(arg2)) {
		// --- variant 1
		ref = IMAP(lItems, arg2 as TMapper<TIn, TOut>)
	}
	else {
		// --- variant 2
		ref = IMAP(lItems, arg2 as T, arg3 as TMapperWithAccum<TIn, TOut, T>)
	};const iter =ref

	let lNewItems: TOut[] = []
	let {done, value} = iter.next()
	while (!done) {
		lNewItems.push(value);
		({done, value} = iter.next())
	}

	if (isFunction(arg2)) {
		return lNewItems
	}
	else {
		return [lNewItems, value]
	}
}

// ---------------------------------------------------------------------------

// --- Variant 1, no accumulator
export function AIMAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): AsyncGenerator<TOut>

// --- Variant 2
export function AIMAP<TIn, TOut, T extends TNonFunction>(
		lItems:  Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		acc: T,
		mapFunc: TMapperWithAccum<TIn, TOut, T>
		): AsyncGenerator<TOut, T>

// --- implementation
export async function* AIMAP<TIn, TOut, T extends TNonFunction>(
		lItems: Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | T,
		arg3: void | TMapperWithAccum<TIn, TOut, T>
		): AsyncGenerator<TOut> | AsyncGenerator<TOut, T> {

	if (isFunction(arg2)) {
		// --- variant 1, no accumulator, arg2 is a mapper
		const mapper: TMapper<TIn, TOut> = arg2

		let i3 = 0;for await (const item of lItems) {const i = i3++;
			DBG(`AIMAP: ${i}: ${OL(item)}`)
			const iter = mapper(item, i)
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					break
				}   // --- continue with outer loop
				else {
					yield value
				}
			}
		}
		return
	}
	else {
		assert(isFunction(arg3), "arg3 not a function!")

		// --- variant 2
		let runningAcc: T = arg2
		const mapper: TMapperWithAccum<TIn, TOut, T> = arg3

		let i4 = 0;for await (const item of lItems) {const i = i4++;
			DBG(`AIMAP: ${i}: ${OL(item)}`)
			const iter = mapper(item, i, runningAcc)
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					if (typeof value !== 'function') {
						// @ts-ignore
						runningAcc = value
					}
					break
				}   // --- continue with outer loop
				else {
					yield value
				}
			}
		}
		return runningAcc
	}
	croak("Should never happen")
	return []
}

// ---------------------------------------------------------------------------

// --- Variant 1, no accumulator
export async function AMAP<TIn, TOut, T extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): AutoPromise<TOut[]>

// --- Variant 2
export async function AMAP<TIn, TOut, T extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		acc: T,
		mapFunc: TMapperWithAccum<TIn, TOut, T>
		): AutoPromise<[TOut[], T]>

export async function AMAP<TIn, TOut, T extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		arg2: TMapper<TIn, TOut> | T,
		arg3: void | TMapperWithAccum<TIn, TOut, T>
		): AutoPromise<TOut[] | [TOut[], T]> {

	let ref1;if (isFunction(arg2)) {
		// --- variant 1
		ref1 = await AIMAP(lItems, arg2 as TMapper<TIn, TOut>)
	}
	else {
		// --- variant 2
		ref1 = await AIMAP(lItems, arg2 as T, arg3 as TMapperWithAccum<TIn, TOut, T>)
	};const iter =ref1

	let lNewItems: TOut[] = []
	let {done, value} = await iter.next()
	while (!done) {
		lNewItems.push(value);
		({done, value} = await iter.next())
	}

	if (isFunction(arg2)) {
		return lNewItems
	}
	else {
		return [lNewItems, value]
	}
}

// ---------------------------------------------------------------------------
// ASYNC
// --- returns [lFulfilled, lRejected, lFulfilledTags, lRejectedTags]
//        lFulfilled is an array of T
//        lRejected is an array of unknown (usually Error objects)
//        lFulfilledTags and lRejectedTags are arrays of strings

type TRunResult<T> = [T[], string[], string[], string[]]

export const awaitAll = async function<T>(
		lPromises: Promise<T>[],
		lTags: string[] = []
		): AutoPromise<TRunResult<T>> {

	const lSettled = await Promise.allSettled(lPromises)
	const acc0: TRunResult<T> = [[],[],[],[]]
	// @ts-ignore
	const [lItems, accum] = MAP(lSettled, acc0, function*(h, i, acc) {
		if (h.status === 'fulfilled') {
			yield h.value
		}
		const tag = (i >= 0) && (i < lTags.length) ? lTags[i] : ''
		const [lFulfilled, lRejected, lTags1, lTags2] = acc
		if (h.status === 'fulfilled') {
			return [
				[...lFulfilled, h.value],
				lRejected,
				[...lTags1, tag],
				lTags2
				]
		}
		else {
			return [
				lFulfilled,
				[...lRejected, getErrStr(h.reason)],
				lTags1,
				[...lTags2, tag]
				]
		}
	})
	// @ts-ignore
	return accum
}

