"use strict";
// section-map.lib.test.civet

import {
	undef, defined, notdefined,
	} from 'datatypes'
import {keys, numKeys} from 'llutils'
import {Section} from 'section'
import {
	isSetName, TSectionTree, isSectionTree,
	SectionMap,
	} from 'section-map'
import {equal, truthy, falsy} from 'unit-test'

// ---------------------------------------------------------------------------

truthy(isSetName('ABC'))
truthy(isSetName('Nothing'))
falsy( isSetName('aBCE'))

truthy(isSectionTree({
	name: 'ALL',
	mapper: undef,
	lChildren: []
	}))

const hTree = {
	name: 'ALL',
	mapper: (s: string) => s.toUpperCase(),
	lChildren: [
		'top',
		'bottom'
		]
	}

truthy(isSectionTree(hTree));

(() => {
	const hTree = {
		name: 'ALL',
		mapper: (s: string) => s.toLowerCase(),
		lChildren: ['top', 'middle', 'bottom']
		}
	const smap = new SectionMap(hTree)
	equal(numKeys(smap.hSections), 3)
	equal(numKeys(smap.hSets), 1)
	truthy((smap.hTree.lChildren[1] instanceof Section))

	smap.add('middle', 'abc')
	equal(smap.getBlock(), 'abc')

	smap.add('top', 'xyz')
	equal(smap.getBlock(), 'xyz\nabc')
}
	)()