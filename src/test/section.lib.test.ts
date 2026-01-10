"use strict";
// section.lib.test.civet

import {isSectionName, Section} from 'section'
import {equal, truthy, falsy} from 'unit-test'

// ---------------------------------------------------------------------------

truthy(isSectionName('abc'))
truthy(isSectionName('aThing'))
falsy( isSectionName('ABC'));

(() => {
	const section = new Section('main')
	equal(section.name, 'main')
}
	)();

(() => {
	const section = new Section('main', 0, (x) => x.toUpperCase())
	section.add('abc', 'def')

	equal(section.name, 'main')
	equal(section.getBlock(), "ABC\nDEF")
}
	)();

(() => {
	const section = new Section('main', 1, (x) => x.toLowerCase())
	section.add('ABC')
	section.add('XYZ')
	equal(section.getBlock(), "\tabc\n\txyz")
}
	)()