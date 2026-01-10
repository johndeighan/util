"use strict";
// var-free.lib.civet

// ---------------------------------------------------------------------------

export const mapper = function*<TIn, TOut>(
		lItems: Iterable<TIn>,
		func: (item: TIn) => Generator<TOut, void, void>,
		abort_func: (item: TIn) => boolean = (item: TIn) => { return false }
		): Generator<TOut, void, void> {

	for (const item of lItems) {
		if (abort_func(item)) {
			return
		}
		yield* func(item)
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = function<TIn, TAccum>(
		lItems: Iterable<TIn>,
		accum: TAccum,
		reduce_func: (accum: TAccum, item: TIn) => TAccum,
		abort_func: (item: TIn) => boolean = (item: TIn) => { return false }
		): TAccum {

	for (const item of lItems) {
		if (abort_func(item)) {
			break
		}
		accum = reduce_func(accum, item)
	}
	return accum
}