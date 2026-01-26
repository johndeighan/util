"use strict";
// scope.lib.civet

import {
	undef, defined, notdefined, assert, croak, hash,
	} from 'datatypes'
import {hasKey} from 'llutils'
import {LOG} from 'logger'

// ---------------------------------------------------------------------------

export class CScope {
	name: (string | undefined) // --- undef for anonymous functions
	sDefined = new Set<string>()
	sUsed = new Set<string>()
	parent: (CScope | undefined)
	lChildren: CScope[]

	// ..........................................................

	*allDefined(): Generator<string, void, void> {

		for (const name of this.sDefined.values()) {
			yield name
		}
		return
	}

	// ..........................................................

	getDefined(): string[] {

		return Array.from(this.sDefined.keys())
	}

	// ..........................................................

	*allUsed(): Generator<string, void, void> {

		for (const name of this.sUsed.values()) {
			yield name
		}
		return
	}

	// ..........................................................

	getUsed(): string[] {

		return Array.from(this.sUsed.keys())
	}

	// ..........................................................

	asString(): string {

		return `----------
NAME: ${this.name || '.undef'}
DEFINED: ${this.getDefined().join(' ')}
USED: ${this.getUsed().join(' ')}
PARENT: ${defined(this.parent) ? this.parent.name : '.undef'}
CHILDREN: ${this.lChildren.length}`
	}

	// ..........................................................

	constructor(
			name1: (string | undefined),
			lArgs: string[],
			parent1: (CScope | undefined) = undef
			) {

		this.name = name1;

		this.parent = parent1;

		for (const name of lArgs) {
			this.define(name)
		}
		this.lChildren = []
	}

	// ..........................................................

	newChildScope(name: (string | undefined), lArgs: string[]) {

		const scope = new CScope(name, lArgs, this)
		this.lChildren.push(scope)
		return scope
	}

	// ..........................................................

	define(name: string): void {

		this.sDefined.add(name)
		return
	}

	// ..........................................................

	use(name: string): void {

		this.sUsed.add(name)
		return
	}

	// ..........................................................
	// --- is name defined in current function or any ancestor

	isDefined(name: string): boolean {

		if (this.sDefined.has(name)) {
			return true
		}
		if (defined(this.parent)) {
			return this.parent.isDefined(name)
		}
		return false
	}

	// ..........................................................
	// --- is name used in the current scope or in child scopes

	isUsed(name: string): boolean {

		if (this.sUsed.has(name)) {
			return true
		}
		for (const childScope of this.lChildren) {
			if (childScope.isUsed(name)) {
				return true
			}
		}
		return false
	}
}

// ---------------------------------------------------------------------------

export class CMainScope extends CScope {

	constructor() {
		super('main', [])
	}

	// ..........................................................

	newScope(name: (string | undefined), lArgs: string[]): CScope {

		return this.newChildScope(name, lArgs)
	}

	// ..........................................................

	endScope(scope: CScope): (CScope | undefined) {

		return scope.parent
	}
}