"use strict";
// extract.lib.test.civet

import {
	TPathItem, extract, getString, getNumber,
	} from 'extract'

import {
	equal, truthy, falsy, succeeds, fails, codeLike,
	} from 'unit-test'

// ---------------------------------------------------------------------------

equal(extract({n: 42}, '.n'), 42)

class Person {
	name: string
	gender: TGender
	constructor(name1: string, gender1: TGender){this.name = name1;this.gender = gender1;}
}

type TGender = 'male' | 'female'

const h = {
	friends: [
		new Person('John Bowling', 'male'),
		new Person('Julie Booker', 'female')
		],
	name: 'John Deighan',
	gender: 'male',
	address: {
		street: '1749 Main St.',
		city: 'Blacksburg',
		state: 'VA'
		}
	} as const

equal(extract(h, '.name'), 'John Deighan')
equal(extract(h, '.friends[1].name'), 'Julie Booker')
equal(extract(h, '.friends[0].gender'), 'male')
equal(extract(h, '.friends[1]'), new Person('Julie Booker', 'female'))
equal(extract(h, ''), h)
equal(extract(h, '.address.city'), 'Blacksburg');

// ---------------------------------------------------------------------------

(() => {
	const h = {
		a: 1,
		b: 2,
		c: [
			'abc',
			'def'
			]
		}

	const s = getString(h, '.c[1]')
	equal(s, 'def')
	equal(s.length, 3)

	const n = getNumber(h, '.b')
	equal(n, 2)
}
	)()

// ---------------------------------------------------------------------------