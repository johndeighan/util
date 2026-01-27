"use strict";
// var-free.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
export type TMaybeString = string | undefined | void
export type TIterator<T, U> = Generator<T, U>
export type TAsyncIterator<T, U> = AsyncGenerator<T, U>

export type TMapper<TIn, TOut>      = (item: TIn, i: number) => TIterator<TOut, TMaybeString>
export type TAsyncMapper<TIn, TOut> = (item: TIn, i: number) => TAsyncIterator<TOut, TMaybeString>

// ---------------------------------------------------------------------------

export function* syncMapper<TIn, TOut>(
		lItems:  Iterable<TIn>,
		mapFunc: (item: TIn, i: number) => TIterator<TOut, TMaybeString>
		): Generator<TOut, TMaybeString> {

	let i1 = 0;for (const item of lItems) {const i = i1++;
		const iter = mapFunc(item, i)
		while(true) {
			const {done, value} = iter.next()
			if (done) {
				if (value === 'stop') {
					return
				}
				else {
					break
				}
			}
			else {
				yield value
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const syncReducer = function<TIn, TAccum>(
		lItems: Iterable<TIn>,
		acc: TAccum,
		reduceFunc: (acc: TAccum, x: TIn, i: number) => TIterator<TAccum, TMaybeString>
		): TAccum {

	let i2 = 0;for (const item of lItems) {const i = i2++;
		const iter = reduceFunc(acc, item, i)
		while(true) {
			const {done, value} = iter.next()
			if (done) {
				if (value === 'stop') {
					return acc
				}
				else {
					break
				}
			}
			else {
				acc = value
			}
		}
	}
	return acc
}

// ---------------------------------------------------------------------------

export function mapper<TIn, TOut>(
		lItems:     Iterable<TIn>,
		mapFunc:    (item: TIn, i: number) => TIterator<TOut, TMaybeString>
		): AsyncGenerator<TOut, TMaybeString>

export function mapper<TIn, TOut>(
		lItems:     AsyncIterable<TIn>,
		mapFunc:    (item: TIn, i: number) => (TIterator<TOut, TMaybeString> | TAsyncIterator<TOut, TMaybeString>)
		): AsyncGenerator<TOut, TMaybeString>

export async function* mapper<TIn, TOut>(
		lItems:    Iterable<TIn>      | AsyncIterable<TIn>,
		mapFunc:   (item: TIn, i: number) => (TIterator<TOut, TMaybeString> | TAsyncIterator<TOut, TMaybeString>)
		): AsyncGenerator<TOut, TMaybeString> {

	// --- NOTE: You can await something even if it's not async
	let i3 = 0;for await (const item of lItems) {const i = i3++;
		const iter = mapFunc(item, i)
		while(true) {
			const {done, value} = await iter.next()
			if (done) {
				if (value === 'stop') {
					return
				}
				else {
					break
				}
			}
			else {
				yield value
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = async function<TIn, TAccum>(
		lItems: Iterable<TIn> | AsyncIterable<TIn>,
		acc: TAccum,
		reduceFunc: (acc: TAccum, item: TIn, i: number) => TIterator<TAccum, TMaybeString>
		): AutoPromise<TAccum> {

	let i4 = 0;for await (const item of lItems) {const i = i4++;
		const iter = reduceFunc(acc, item, i)
		while(true) {
			const {done, value} = iter.next()
			if (done) {
				if (value === 'stop') {
					return await acc
				}
				else {
					break
				}
			}
			else {
				acc = value
			}
		}
	}
	return await acc
}
