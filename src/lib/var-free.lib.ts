"use strict";
// var-free.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	undef, defined, notdefined,
	isIterator, isAsyncIterator, isPromise, assertIsDefined,
	} from 'datatypes'

export type TMaybeCmd = 'stop' | undefined | void

// ---------------------------------------------------------------------------
// ASYNC

export async function* mapper<TIn, TOut>(
		lItems:  Generator<TIn> |
					AsyncGenerator<TIn> |
					TIn[],
		mapFunc: (x: TIn, i: number) =>
			(TOut | undefined) |
			Promise<(TOut | undefined)> |
			Generator<TOut, TMaybeCmd> |
			AsyncGenerator<TOut, TMaybeCmd>
		): AsyncGenerator<TOut> {

	// --- NOTE: You can await something even if it's not async
	let i1 = 0;for await (const item of lItems) {const i = i1++;
		const iter = mapFunc(item, i)
		if (isIterator(iter)) {
			while(true) {
				const {done, value} = iter.next()
				if (done) {
					if (value === 'stop') {  // value returned from mapFunc()
						return
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					yield value
				}
			}
		}
		else if (isAsyncIterator(iter)) {
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					if (value === 'stop') {  // value returned from mapFunc()
						return
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					yield value
				}
			}
		}
		else if (iter !== undefined) {
			if (isPromise(iter)) {
				// --- iter is a TOut
				const result = await iter
				if (result !== undefined) {
					yield result
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
// ASYNC

export const reducer = async function<TIn, TAccum>(
		lItems: Generator<TIn> |
				AsyncGenerator<TIn> |
				TIn[],
		acc: TAccum,
		redFunc: (acc: TAccum, x: TIn, i: number) =>
			(TAccum | undefined) |
			Promise<(TAccum | undefined)> |
			Generator<TAccum, TMaybeCmd> |
			AsyncGenerator<TAccum, TMaybeCmd>
		): AutoPromise<TAccum> {

	let i2 = 0;for await (const item of lItems) {const i = i2++;
		const iter = redFunc(acc, item, i)
		if (isIterator(iter) || isAsyncIterator(iter)) {
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					if (value === 'stop') {
						return await acc
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					acc = value
				}
			}
		}
		else if (iter !== undefined) {
			if (isPromise(iter)) {
				const result = await iter
				if (result !== undefined) {
					acc = result
				}
			}
			else {
				acc = iter
			}
		}
	}
	return await acc
}

// ---------------------------------------------------------------------------

export function* syncMapper<TIn, TOut>(
		lItems:  IterableIterator<TIn> | TIn[],
		mapFunc: (x: TIn, i: number) =>
			(TOut | undefined) |
			Generator<TOut, TMaybeCmd>
		): Generator<TOut, TMaybeCmd> {

	let i3 = 0;for (const item of lItems) {const i = i3++;
		const iter = mapFunc(item, i)
		if (isIterator(iter) || isAsyncIterator(iter)) {
			assertIsDefined(iter)
			while(true) {
				// --- I'm tired of wrestling with TypeScript !
				// @ts-ignore
				const {done, value} = iter.next()
				if (done) {
					if (value === 'stop') {
						return
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					yield value
				}
			}
		}
		else if (defined(iter)) {
			yield iter
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const syncReducer = function<TIn, TAccum>(
		lItems: Generator<TIn> | TIn[],
		acc: TAccum,
		redFunc: (acc: TAccum, x: TIn, i: number) =>
			(TAccum | undefined) |
			Generator<TAccum, TMaybeCmd>
		): TAccum {

	let i4 = 0;for (const item of lItems) {const i = i4++;
		const iter = redFunc(acc, item, i)
		if (iter !== undefined) {
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
					else if (value !== undefined) {
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