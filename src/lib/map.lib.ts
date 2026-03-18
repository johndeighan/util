"use strict";
// map.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {croak} from 'croak'
import {
	assert, obviously, isGenerator, isArray,
	isFunction, TNonFunction, getErrStr,
	} from 'datatypes'

// ---------------------------------------------------------------------------
// ASYNC

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

type TMapper<TIn, TOut> = (
	x: TIn,
	i: number,
	) => Generator<TOut>

// --- An accumulator cannot be a function and must be defined

type TMapperWithAccum<TIn, TOut, TAccum extends TNonFunction> = (
	x: TIn,
	i: number,
	acc: TAccum
	) => Generator<TOut, TAccum>

// --- This is not a generator at all

type TAccumMapper<TIn, TAccum extends TNonFunction> = (
	x: TIn,
	i: number,
	acc: TAccum
	) => TAccum

// ---------------------------------------------------------------------------
// ASYNC

// --- Variant 1, no accumulator
export function IMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): Generator<TOut>

// --- Variant 2
export function IMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		acc: TAccum,
		mapFunc: TMapperWithAccum<TIn, TOut, TAccum>
		): Generator<TOut, TAccum>

// --- implementation
export function* IMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: Generator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | TAccum,
		arg3: void | TMapperWithAccum<TIn, TOut, TAccum>
		): Generator<TOut> | Generator<TOut, TAccum> {

	if (isFunction(arg2)) {
		// --- variant 1, no accumulator, arg2 is a mapperFunc
		const mapperFunc: TMapper<TIn, TOut> = arg2

		let i1 = 0;for (const item of lItems) {const i = i1++;
			const iter = mapperFunc(item, i)
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
		let runningAcc: TAccum = arg2
		const mapperFunc: TMapperWithAccum<TIn, TOut, TAccum> = arg3

		let i2 = 0;for (const item of lItems) {const i = i2++;
			const iter = mapperFunc(item, i, runningAcc)
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
export function MAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): TOut[]

// --- Variant 2, has accumulator
export function MAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		acc: TAccum,
		mapFunc: TMapperWithAccum<TIn, TOut, TAccum>
		): [TOut[], TAccum]

// --- Variant 3, only accumulator
export function MAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | TIn[],
		acc: TAccum,
		mapFunc: TAccumMapper<TIn, TAccum>
		): TAccum

export function MAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: Generator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | TAccum,
		arg3: void | TMapperWithAccum<TIn, TOut, TAccum> | TAccumMapper<TIn, TAccum>
		): TOut[] | [TOut[], TAccum] {

	let ref;if (isFunction(arg2)) {
		// --- variant 1
		ref = IMAP(lItems, arg2 as TMapper<TIn, TOut>)
	}
	else {
		obviously(isFunction(arg3))
		if (isGenerator(arg3)) {
			// --- variant 2
			ref = IMAP(lItems, arg2 as TAccum, arg3 as TMapperWithAccum<TIn, TOut, TAccum>)
		}
		else {
			// --- variant 3
			ref = lItems[Symbol.iterator]()
		}
	};const iter =ref

	let lNewItems: TOut[] = []
	let {done, value} = iter.next()
	while (!done) {
		lNewItems.push(value);
		({done, value} = iter.next())
	}

	Object.freeze(lNewItems)
	if (isFunction(arg2)) {
		return lNewItems
	}
	else {
		return [lNewItems, value]
	}
}

// ---------------------------------------------------------------------------
// --- mapFunc must return an item of type TAccum

export async function Accumulate<TIn, TAccum extends TNonFunction>(
		lItems: TIn[],
		acc: TAccum,
		mapFunc: (item: TIn, i: number, acc: TAccum) => Promise<TAccum>
		): AutoPromise<TAccum> {

	let i3 = 0;for (const item of lItems) {const i = i3++;
		acc = await mapFunc(item, i, acc)
	}
	return acc as Awaited<TAccum>
}

// ---------------------------------------------------------------------------

// --- Variant 1, no accumulator
export function AIMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): AsyncGenerator<TOut>

// --- Variant 2
export function AIMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems:  Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		acc: TAccum,
		mapFunc: TMapperWithAccum<TIn, TOut, TAccum>
		): AsyncGenerator<TOut, TAccum>

// --- implementation
export async function* AIMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: Generator<TIn> | AsyncGenerator<TIn> | TIn[],
		arg2: TMapper<TIn, TOut> | TAccum,
		arg3: void | TMapperWithAccum<TIn, TOut, TAccum>
		): AsyncGenerator<TOut> | AsyncGenerator<TOut, TAccum> {

	if (isFunction(arg2)) {
		// --- variant 1, no accumulator, arg2 is a mapperFunc
		const mapperFunc: TMapper<TIn, TOut> = arg2

		let i4 = 0;for await (const item of lItems) {const i = i4++;
			const iter = mapperFunc(item, i)
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
		let runningAcc: TAccum = arg2
		const mapperFunc: TMapperWithAccum<TIn, TOut, TAccum> = arg3

		let i5 = 0;for await (const item of lItems) {const i = i5++;
			const iter = mapperFunc(item, i, runningAcc)
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
export async function AMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		mapFunc: TMapper<TIn, TOut>,
		nothing: void
		): AutoPromise<TOut[]>

// --- Variant 2
export async function AMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		acc: TAccum,
		mapFunc: TMapperWithAccum<TIn, TOut, TAccum>
		): AutoPromise<[TOut[], TAccum]>

export async function AMAP<TIn, TOut, TAccum extends TNonFunction>(
		lItems: AsyncGenerator<TIn>,
		arg2: TMapper<TIn, TOut> | TAccum,
		arg3: void | TMapperWithAccum<TIn, TOut, TAccum>
		): AutoPromise<TOut[] | [TOut[], TAccum]> {

	let ref1;if (isFunction(arg2)) {
		// --- variant 1
		ref1 = await AIMAP(lItems, arg2 as TMapper<TIn, TOut>)
	}
	else {
		// --- variant 2
		ref1 = await AIMAP(lItems, arg2 as TAccum, arg3 as TMapperWithAccum<TIn, TOut, TAccum>)
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
//        lFulfilled is an array of TAccum
//        lRejected is an array of unknown (usually Error objects)
//        lFulfilledTags and lRejectedTags are arrays of strings

type TRunResult<T> = [T[], unknown[], string[], string[]]

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

