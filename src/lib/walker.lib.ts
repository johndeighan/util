"use strict";
// walker.lib.civet

import {
	undef, defined, notdefined, integer, hash, array,
	isArray, isHash, isPrimitive, assert, croak, isEmpty,
	assertIsString, assertIsArray,
	} from 'datatypes'
import {OL} from 'to-nice'
import {DBG} from 'logger'

// ---------------------------------------------------------------------------

const hasChildren = (x: unknown) => {
	return isHash(x) || isArray(x)
}

export type TVisitKind = 'enter' | 'exit' | 'ref'

export class Walker<T extends object = hash> {

	// --- Keep track of nodes visited to avoid infinite loops
	setVisited: WeakSet<hash | array> = new WeakSet<hash | array>()
	lNodeStack: T[] = []

	// ..........................................................

	protected pushNode(item: T): void {
		this.lNodeStack.push(item)
		return
	}

	// ..........................................................

	protected popNode(): (T | undefined) {
		return this.lNodeStack.pop()
		return
	}

	// ..........................................................

	get level(): integer {
		return this.lNodeStack.length
	}

	// ..........................................................

	parent(n: integer = 1): T {
		const len = this.lNodeStack.length
		assert((n >= 0) && (n < len), `Bad index: ${n} of ${len}`)
		return this.lNodeStack[len - n]
	}

	// ..........................................................

	isNode(x: unknown): x is T {
		return true
	}

	// ..........................................................

	filter(node: T): boolean {
		return true
	}

	// ..........................................................
	// GENERATOR

	*walk(x: unknown): Generator<T, void, void> {
		if (hasChildren(x)) {
			this.setVisited = new WeakSet<hash | array>()
			yield *this.walkItem(x)
		}
		return
	}

	// ..........................................................
	// GENERATOR

	*walkItem(item: hash | array): Generator<T, void, void> {
		if (this.setVisited.has(item)) {
			return
		}
		if (this.isNode(item)) {
			// --- type narrowing ensures that item is a T
			if (this.filter(item)) {
				DBG(`YIELD NODE: ${OL(item)}`)
				yield item
			}
			// --- item is parent of yielded items
			this.pushNode(item)
		}
		this.setVisited.add(item)
		if (isArray(item)) {
			let i1 = 0
			for (const x of item) {
				const i = i1++
				if (isHash(x) || isArray(x)) {
					yield *this.walkItem(x)
				}
			}
		}
		else {
			for (const [key, x] of Object.entries(item)) {
				if (isHash(x) || isArray(x)) {
					yield *this.walkItem(x)
				}
			}
		}
		if (this.isNode(item)) {
			this.popNode()
		}
		return
	}

	// ..........................................................
	// GENERATOR

	*walkEx(x: unknown): Generator<[TVisitKind, T], void, void> {
		if (hasChildren(x)) {
			this.setVisited = new WeakSet<hash | array>()
			yield *this.walkItemEx(x)
		}
		return
	}

	// ..........................................................
	// GENERATOR

	*walkItemEx(item: hash | array): Generator<[TVisitKind, T], void, void> {
		if (this.setVisited.has(item)) {
			if (this.isNode(item)) {
				yield ['ref', item]
			}
			return
		}
		if (this.isNode(item)) {
			// --- type narrowing ensures that item is a T
			if (this.filter(item)) {
				DBG(`YIELD NODE: ${OL(item)}`)
				yield ['enter', item]
			}
			// --- item is parent of yielded items
			this.pushNode(item)
		}
		this.setVisited.add(item)
		if (isArray(item)) {
			let i2 = 0
			for (const x of item) {
				const i = i2++
				if (isHash(x) || isArray(x)) {
					yield *this.walkItemEx(x)
				}
			}
		}
		else {
			for (const [key, x] of Object.entries(item)) {
				if (isHash(x) || isArray(x)) {
					yield *this.walkItemEx(x)
				}
			}
		}
		if (this.isNode(item)) {
			yield ['exit', item]
			this.popNode()
		}
		return
	}
}