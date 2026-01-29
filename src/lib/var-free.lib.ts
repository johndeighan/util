"use strict";
// var-free.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	defined, isIterator, isObject,
	TIterator, TAsyncIterator,
	} from 'datatypes'

export type TMaybeString = 'stop' | undefined | void
export type TAnyIterator<T,U,V> = TIterator<T,U,V> | TAsyncIterator<T,U,V>

export type TFuncMapper<TIn, TOut>     = (item: TIn, i: number) => (TOut | undefined)
export type TMapper<TIn, TOut>         = (item: TIn, i: number) => TIterator<TOut, TMaybeString>
export type TAsyncMapper<TIn, TOut>    = (item: TIn, i: number) => TAsyncIterator<TOut, TMaybeString>

export type TFuncReducer<TAccum, TIn>  = (acc: TAccum, x: TIn, i: number) => (TAccum | undefined)
export type TReducer<TAccum, TIn>      = (acc: TAccum, x: TIn, i: number) => TIterator<TAccum, TMaybeString>
export type TAsyncReducer<TAccum, TIn> = (acc: TAccum, x: TIn, i: number) => TAsyncIterator<TAccum, TMaybeString>

// ---------------------------------------------------------------------------

export function* syncMapper<TIn, TOut>(
		lItems:  IterableIterator<TIn> | TIn[],
		mapFunc: TFuncMapper<TIn, TOut> | TMapper<TIn, TOut>
		): TIterator<TOut, TMaybeString> {

	let i1 = 0;for (const item of lItems) {const i = i1++;
		const iter = mapFunc(item, i)
		if (defined(iter)) {
			if (isObject(iter) && ((Symbol.iterator in iter) || (Symbol.asyncIterator in iter))) {
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
			else {
				yield iter
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const syncReducer = function<TIn, TAccum>(
		lItems: TIterator<TIn> | TIn[],
		acc: TAccum,
		reduceFunc: TFuncReducer<TAccum, TIn> | TReducer<TAccum, TIn>
		): TAccum {

	let i2 = 0;for (const item of lItems) {const i = i2++;
		const iter = reduceFunc(acc, item, i)
		if (defined(iter)) {
			if (isIterator(iter)) {
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
			else {
				// --- now iter is of type TAccum
				acc = iter
			}
		}
	}
	return acc
}

// ---------------------------------------------------------------------------

export function mapper<TIn, TOut>(
		lItems:     TIterator<TIn>,
		mapFunc:    TFuncMapper<TIn, TOut> | TMapper<TIn, TOut>
		): TAsyncIterator<TOut, TMaybeString>

export function mapper<TIn, TOut>(
		lItems:     TAsyncIterator<TIn>,
		mapFunc:    TFuncMapper<TIn, TOut> | TMapper<TIn, TOut> | TAsyncMapper<TIn, TOut>
		): TAsyncIterator<TOut, TMaybeString>

export async function* mapper<TIn, TOut>(
		lItems:    TIterator<TIn>         | TAsyncIterator<TIn>,
		mapFunc:   TFuncMapper<TIn, TOut> | TMapper<TIn, TOut> | TAsyncMapper<TIn, TOut>
		): TAsyncIterator<TOut, TMaybeString> {

	// --- NOTE: You can await something even if it's not async
	let i3 = 0;for await (const item of lItems) {const i = i3++;
		const iter = mapFunc(item, i)
		if (defined(iter)) {
			if (isObject(iter) && ((Symbol.iterator in iter) || (Symbol.asyncIterator in iter))) {
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
			else {
				// --- iter is either a TOut
				yield iter
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = async function<TIn, TAccum>(
		lItems: TIterator<TIn> | TAsyncIterator<TIn> | TIn[],
		acc: TAccum,
		reduceFunc: TFuncReducer<TAccum, TIn> | TReducer<TAccum, TIn>
		): AutoPromise<TAccum> {

	let i4 = 0;for await (const item of lItems) {const i = i4++;
		const iter = reduceFunc(acc, item, i)
		if (defined(iter)) {
			if (isIterator(iter)) {
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
			else {
				acc = iter
			}
		}
	}
	return await acc
}
