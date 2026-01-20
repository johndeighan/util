"use strict";
// var-free.lib.civet

// ---------------------------------------------------------------------------

export type TAbortFunc<TIn> = (item: TIn, i: number) => boolean

export const mapper = function*<TIn, TOut>(
		lItems: Iterable<TIn>,
		func: (item: TIn, i: number) => Generator<TOut, void, void>,
		abort_func: TAbortFunc<TIn> = (item, i) => { return false }
		): Generator<TOut, void, void> {

	let i1 = 0;for (const item of lItems) {const i = i1++;
		if (abort_func(item, i)) {
			return
		}
		yield* func(item, i)
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = function<TIn, TAccum>(
		lItems: Iterable<TIn>,
		accum: TAccum,
		reduce_func: (accum: TAccum, item: TIn) => TAccum,
		abort_func: TAbortFunc<TIn> = (item: TIn) => { return false }
		): TAccum {

	let i2 = 0;for (const item of lItems) {const i = i2++;
		if (abort_func(item, i)) {
			break
		}
		accum = reduce_func(accum, item)
	}
	return accum
}