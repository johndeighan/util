"use strict";
// var-free.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
export type TAbortFunc<TIn>          = (item: TIn, i: number) => boolean
export type TGenFunc<TIn, TOut>      = (item: TIn, i: number) => Generator<TOut>
export type TAsyncGenFunc<TIn, TOut> = (item: TIn, i: number) => AsyncGenerator<TOut>

export type ITERATOR<T> = Generator<T>
export type ASYNC_ITERATOR<T> = AsyncGenerator<T>

// ---------------------------------------------------------------------------

export function* syncMapper<TIn, TOut>(
		lItems:    Iterable<TIn>,
		func:      TGenFunc<TIn, TOut>,
		abortFunc: TAbortFunc<TIn> = (x, i) => { return false }
		): Generator<TOut> {

	let i1 = 0;for (const item of lItems) {const i = i1++;
		if (abortFunc(item, i)) {
			return
		}
		yield* func(item, i)
	}
	return
}

// ---------------------------------------------------------------------------

export const syncReducer = function<TIn, TAccum>(
		lItems: Iterable<TIn>,
		accum: TAccum,
		reduceFunc: (accum: TAccum, x: TIn) => TAccum,
		abortFunc: TAbortFunc<TIn> = (x: TIn) => { return false }
		): TAccum {

	let i2 = 0;for (const item of lItems) {const i = i2++;
		if (abortFunc(item, i)) {
			break
		}
		accum = reduceFunc(accum, item)
	}
	return accum
}

// ---------------------------------------------------------------------------

export function mapper<TIn, TOut>(
		lItems:     Iterable<TIn>,
		func:       (item: TIn, i: number) => Generator<TOut>,
		abortFunc?: TAbortFunc<TIn>
		): AsyncGenerator<TOut>

export function mapper<TIn, TOut>(
		lItems:     AsyncIterable<TIn>,
		func:       (item: TIn, i: number) => (Generator<TOut> | AsyncGenerator<TOut>),
		abortFunc?: TAbortFunc<TIn>
		): AsyncGenerator<TOut>

export async function* mapper<TIn, TOut>(
		lItems:    Iterable<TIn>      | AsyncIterable<TIn>,
		func:      (item: TIn, i: number) => (Generator<TOut> | AsyncGenerator<TOut>),
		abortFunc: TAbortFunc<TIn> = (x, i) => { return false }
		): AsyncGenerator<TOut> {

	if (Symbol.iterator in lItems) {
		let i3 = 0;for (const item of lItems) {const i = i3++;
			if (abortFunc(item, i)) {
				return
			}
			yield* func(item, i)
		}
	}
	else if (Symbol.asyncIterator in lItems) {
		let i4 = 0;for await (const item of lItems) {const i = i4++;
			if (abortFunc(item, i)) {
				return
			}
			yield* await func(item, i)
		}
	}
	else {
		throw new Error("Bad parameters")
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = async function<TIn, TAccum>(
		lItems: AsyncIterableIterator<TIn>,
		accum: TAccum,
		reduce_func: (accum: TAccum, item: TIn) => Promise<TAccum>,
		abort_func: TAbortFunc<TIn> = (item: TIn) => { return false }
		): AutoPromise<TAccum> {

	let i5 = 0;for await (const item of lItems) {const i = i5++;
		if (abort_func(item, i)) {
			break
		}
		accum = await reduce_func(accum, item)
	}
	return await accum
}
