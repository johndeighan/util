"use strict";
// fetcher.civet

import {
	undef, defined, notdefined, assert, deepEqual,
	} from 'datatypes'

// ---------------------------------------------------------------------------

export class Fetcher<T> {
	iter: Iterator<T>
	eofValue: T
	buffer: (T | undefined) = undef

	constructor(iter1: Iterator<T>, eofValue1: T) {
		this.iter = iter1
		this.eofValue = eofValue1
	}

	toArray(): T[] {
		const lItems: T[] = []
		let item = this.get()
		while (defined(item) && (item !== this.eofValue)) {
			lItems.push(item)
			item = this.get()
		}
		return lItems
	}

	peek(): T {
		if (defined(this.buffer)) {
			return this.buffer
		}
		else {
			const {value, done} = this.iter.next()
			if (done) {
				return this.eofValue
			}
			else {
				this.buffer = value
				return value
			}
		}
	}

	get(expected: (T | undefined) = undef): T {
		let result: T = this.eofValue
		if (defined(this.buffer)) {
			result = this.buffer
			this.buffer = undef
		}
		else {
			const {value, done} = this.iter.next()
			let ref;if (done) { ref = this.eofValue} else ref = value;result = ref
		}
		if (defined(expected)) {
			assert(deepEqual(result, expected), `${expected} expected`)
		}
		return result
	}

	skip(expected: (T | undefined) = undef): void {
		this.get(expected)
		return
	}

	atEnd(): boolean {
		if (defined(this.buffer)) {
			return false
		}
		const {value, done} = this.iter.next()
		if (done || (value === this.eofValue)) {
			return true
		}
		else {
			this.buffer = value
			return false
		}
	}
}
