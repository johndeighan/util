"use strict";
// section-map.lib.civet

import {
	undef, defined, notdefined, assert, croak, hash, hashof,
	TStringMapper, assertIsHash,
	isEmpty, nonEmpty, isString, isHash, isArray, isFunction,
	} from 'datatypes'
import {
	f, toBlock, isTAML, fromTAML, hasKey, hasKeys,
	} from 'llutils'
import {OL, ML} from 'to-nice'
import {isSectionName, Section} from 'section'

// ---------------------------------------------------------------------------

export const isSetName = (name: string): boolean => {

	return defined(name.match(/^[A-Z][A-Za-z0-9_-]*/))
}

// ---------------------------------------------------------------------------
// --- NOTE: section names begin with a lower case letter
//           set names begin with an upper case letter
// --- tree is a tree of section/set names
// --- hMappers are callbacks that are called
//        when a set or section is processed
//        should be <name> -> <function>
//     <name> can be a section name or a set name
//     <function> should be <block> -> <block>

export type TSectionTree = {
	name: string
	mapper?: TStringMapper
	level?: number
	lChildren: (string | Section | TSectionTree)[]
	}

// ---------------------------------------------------------------------------

export const isSectionTree = (h: unknown): h is TSectionTree => {

	if (isHash(h)) {
		if (!hasKeys(h, 'name', 'mapper', 'lChildren')) {
			return false
		}
		const {name, mapper, lChildren} = h
		if (!isString(name) || !isSetName(name)) {
			return false
		}
		if (defined(mapper) && !isFunction(mapper)) {
			return false
		}
		if (!isArray(lChildren)) {
			return false
		}
		for (const item of lChildren) {
			if (!isString(item)
					&& (!(item instanceof Section))
					&& !isSectionTree(item)
					) {
				return false
			}
		}
		return true
	}
	else {
		return false
	}
}

// ---------------------------------------------------------------------------

const emptyTree: TSectionTree = {
	name: '',
	mapper: undef,
	lChildren: []
	}

// ---------------------------------------------------------------------------

export const nonEmptyFilter = (x: unknown) => {

	return nonEmpty(x)
}

// ---------------------------------------------------------------------------

export class SectionMap {

	hTree: TSectionTree = emptyTree

	// --- These index parts of @hTree
	hSections: hashof<Section>       = {}
	hSets:     hashof<TSectionTree>  = {}
	hMappers:  hashof<TStringMapper> = {}

	constructor(
			tree: string | TSectionTree,
			hMappers1: hashof<TStringMapper> = {}
			) {

		this.hMappers = hMappers1;

		if (isString(tree)) {
			if (isTAML(tree)) {
				const x = fromTAML(tree)
				if (isSectionTree(x)) {
					this.hTree = x
				}
				else {
					croak(`Bad Section Tree: ${tree}`)
				}
			}
			else {
				croak(`Bad Section Tree: ${tree}`)
			}
		}
		else {
			this.hTree = tree
		}
		this.analyze(this.hTree)
	}

	// ..........................................................
	// --- converts all children that are strings
	//     into true Section objects

	analyze(hTree: TSectionTree): void {

		const {name: rootName, lChildren} = hTree
		this.hSets[rootName] = hTree

		let i1 = 0;for (const child of lChildren) {const i = i1++;
			if (isString(child)) {
				// --- convert to a Section object
				const sec = new Section(child)
				this.hSections[child] = lChildren[i] = sec
				if (child in this.hMappers) {
					sec.mapper = this.hMappers[child]
				}
			}
			else if (child instanceof Section) {
				const {name, mapper} = child
				this.hSections[name] = child
				if (defined(mapper)) {
					this.hMappers[name] = mapper
				}
				else if (name in this.hMappers) {
					child.mapper = this.hMappers[name]
				}
			}
			else {                // --- (child instanceof TSectionTree)
				this.analyze(child)
			}
		}
	}

	// ..........................................................

	add(name: string, ...lLines: string[]): void {

		assert(isSectionName(name), `Bad section name: ${name}`)
		assert((name in this.hSections), `No such section: ${name}`)
		const section = this.hSections[name]
		section.add(...lLines)
		return
	}

	// ..........................................................

	getTreeBlock(tree: TSectionTree): string {

		const {name, mapper, level, lChildren} = tree
		const results=[];for (const child of lChildren) {
			if (isString(child)) {
				results.push(croak("child is a string"))
			}
			else if (child instanceof Section) {
				results.push(child.getBlock())
			}
			else {
				results.push(this.getTreeBlock(child))
			}
		};const lParts =results
		return lParts.filter(nonEmptyFilter).join('\n')
	}

	// ..........................................................

	getBlock(name: (string | undefined) = undef): (string | undefined) {

		if (defined(name)) {
			if (isSectionName(name)) {
				assert((name in this.hSections), `No such section: ${name}`)
				const section = this.hSections[name]
				return section.getBlock()
			}
			else if (isSetName(name)) {
				assert((name in this.hSets), `No such set: ${name}`)
				return this.getTreeBlock(this.hSets[name])
			}
		}
		else {
			return this.getTreeBlock(this.hTree)
		}
	}
}


