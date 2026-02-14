"use strict";
// section.lib.civet

import {
	undef, defined, assert, croak, TStringMapper,
	isArray, isEmpty, isFunction, isInteger,
	} from 'datatypes'
import {toBlock} from 'llutils'
import {OL} from 'to-nice'
import {indented} from 'indent'

// ---------------------------------------------------------------------------

export const isSectionName = (name: string): boolean => {

	return defined(name.match(/^[a-z][A-Za-z0-9_-]*/))
}

// ---------------------------------------------------------------------------

export class Section {

	name: string
	mapper?: TStringMapper
	level?: number

	lLines: string[] = []

	constructor(
			name1: string,
			level: (number | undefined) = undef,
			mapper: (TStringMapper | undefined) = undef) {

		this.name = name1;

		assert(isSectionName(this.name), `Bad Section Name: ${this.name}`)
		if (defined(mapper)) {
			assert(isFunction(mapper),
					`bad mapper in section ${OL(this.name)}`)
			this.mapper = mapper
		}
		if (defined(level)) {
			this.level = level
		}
	}

	// ..........................................................

	add(...lLines: string[]): void {

		if (isInteger(lLines[0])) {
			const level = lLines[0]
			let i1 = 0;for (const line of lLines) {const i = i1++;
				if (i > 0) {
					this.lLines.push(indented(line, level))
				}
			}
		}
		else {
			for (const line of lLines) {
				this.lLines.push(line)
			}
		}
		return
	}

	// ..........................................................

	prepend(...lLines: string[]) {

		if (isInteger(lLines[0])) {
			const level = lLines[0]
			let i2 = 0;for (const line of lLines.toReversed()) {const i = i2++;
				if (i < lLines.length-1) {
					this.lLines.unshift(indented(line, level))
				}
			}
		}
		else {
			for (const line of lLines.toReversed()) {
				this.lLines.unshift(line)
			}
		}
		return
	}

	// ..........................................................

	getBlock(): (string | undefined) {

		if (this.lLines.length === 0) {
			return undef
		}
		const block = toBlock(this.lLines)
		const mapped = defined(this.mapper) ? this.mapper(block) : block
		return this.level ? indented(mapped, this.level) : mapped
	}
}

