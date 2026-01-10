"use strict";
// walker.lib.test.civet

import {undef, hash} from 'datatypes'
import {hasKey, hasKeys} from 'llutils'
import {LOG, DBG} from 'logger'
import {Walker} from 'walker'
import {equal, truthy, falsy} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("class Walker");

(() => {
	// --- Try a very simple class

	type TGender = 'male' | 'female'

	class Person {
		name: string
		gender: TGender
		constructor(name1: string, gender1: TGender){this.name = name1;this.gender = gender1;}
	}

	class PersonWalker extends Walker<Person> {
		override isNode = (x: object): x is Person => {
			return x instanceof Person
		}
	}

	const walker = new PersonWalker()

	// --- Walk a single node
	const person = new Person('John', 'male')
	const results=[];for (const {name, gender} of walker.walk(person)) {
		results.push(`${name} is ${gender}`)
	};const lStrings =results
	equal(lStrings, ['John is male'])

	// --- Walk an array
	const results1=[];for (const {name, gender} of walker.walk([
			new Person('John', 'male'),
			new Person('Julie', 'female')
			])) {
		results1.push(`${name} is ${gender}`)
	};const lStrings2 =results1
	equal(lStrings2, ['John is male', 'Julie is female'])

	// --- Walk an object
	const results2=[];for (const {name, gender} of walker.walk({
			first: new Person('John', 'male'),
			second: new Person('Julie', 'female')
			})) {
		results2.push(`${name} is ${gender}`)
	};const lStrings3 =results2
	equal(lStrings3, [
		'John is male',
		'Julie is female'     // TODO add key by querying for parent
		])

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

	const results3=[];for (const {name} of walker.walk(h)) {
		results3.push(name)
	};const lNames =results3
	equal(lNames, ['John Bowling', 'Julie Booker'])

	// --- put it in an array
	const arr = [{
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
		}] as const

	const results4=[];for (const {name} of walker.walk(arr)) {
		results4.push(name)
	};const lNames2 =results4
	equal(lNames2, ['John Bowling', 'Julie Booker'])

	// --- put it in a hash
	const h3 = { stuff: {
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
		}} as const

	const results5=[];for (const {name} of walker.walk(h3)) {
		results5.push(`${walker.level} ${name}`)
	};const lNames3 =results5
	equal(lNames3, ['0 John Bowling', '0 Julie Booker'])
}
	)();

// --- NOTE: In the above, the nodes must be Person objects,
//           not just hashes with the keys 'name' and 'gender'
// --- However, if you just want to check for those keys,
//        you can overried the isNode() method

(() => {
	// --- A node is a hash with keys 'name' and 'gender'

	type Person = {
		name: string
		gender: 'male' | 'female'
		}

	class PersonWalker extends Walker<Person> {
		override isNode = (x: object): x is Person => {
			return hasKeys(x, 'name', 'gender')
		}
	}
	const walker = new PersonWalker()

	// --- Walk a single node
	const person = {name: 'John', gender: 'male'}
	const results6=[];for (const {name, gender} of walker.walk(person)) {
		results6.push(`${name} is ${gender}`)
	};const lStrings =results6
	equal(lStrings, ['John is male'])

	// --- Walk an array
	const results7=[];for (const {name, gender} of walker.walk([
			{name: 'John', gender: 'male'},
			{name: 'Julie', gender: 'female'}
			])) {
		results7.push(`${name} is ${gender}`)
	};const lStrings2 =results7
	equal(lStrings2, ['John is male', 'Julie is female'])

	// --- Walk an object
	const results8=[];for (const node of walker.walk({
			first: {name: 'John', gender: 'male'},
			second: {name: 'Julie', gender: 'female'}
			})) {
		results8.push(`${node.name} is ${node.gender}`)
	};const lStrings3 =results8
	equal(lStrings3, [
		'John is male',
		'Julie is female'
		])

	const h = {
		friends: [
			{name: 'John Bowling', gender: 'male'},
			{name: 'Julie Booker', gender: 'female'}
			],
		name: 'John Deighan',
		gender: 'male',
		address: {
			street: '1749 Main St.',
			city: 'Blacksburg',
			state: 'VA'
			}
		} as const

	const results9=[];for (const node of walker.walk(h)) {
		results9.push(node.name)
	};const lNames =results9
	equal(lNames, ['John Deighan', 'John Bowling', 'Julie Booker'])

	// --- put it in an array
	const h2 = [{
		friends: [
			{name: 'John Bowling', gender: 'male'},
			{name: 'Julie Booker', gender: 'female'}
			],
		name: 'John Deighan',
		gender: 'male',
		address: {
			street: '1749 Main St.',
			city: 'Blacksburg',
			state: 'VA'
			}
		}] as const

	const results10=[];for (const node of walker.walk(h2)) {
		results10.push(node.name)
	};const lNames2 =results10
	equal(lNames2, ['John Deighan', 'John Bowling', 'Julie Booker'])

	// --- put it in a hash
	const h3 = { stuff: {
		friends: [
			{name: 'John Bowling', gender: 'male'},
			{name: 'Julie Booker', gender: 'female'}
			],
		name: 'John Deighan',
		gender: 'male',
		address: {
			street: '1749 Main St.',
			city: 'Blacksburg',
			state: 'VA'
			}
		}} as const

	const results11=[];for (const node of walker.walk(h3)) {
		results11.push(node.name)
	};const lNames3 =results11
	equal(lNames3, ['John Deighan', 'John Bowling', 'Julie Booker'])
}
	)();

// ---------------------------------------------------------------------------

(() => {
	const h = {
		name: 'John D',
		age: 72,
		friends: [
			{
				name: 'John B',
				alias: {name: 'male JB'}
				},
			{
				name: 'Julie',
				aliases: [{name: 'female JB'}]
				},
			{name: 'Aaron'},
			{notname: 'building'}
			],
		enemies: {
			a: {name: 'Donald', kind: 'scumbag'},
			b: {name: 'Satan',  kind: 'devil'},
			c: {notname: 'woods', key: 'nothing'}
			}
		}

	class PersonWalker extends Walker<Person> {
		override isNode(x: object): x is Person {
			return hasKey(x, 'name')
		}
	}

	const walker = new PersonWalker()

	const results12=[];for (const node of walker.walk(h)) {
		results12.push([walker.level, node.name])
	};const lItems =results12

	equal(lItems, [
		[ 0, "John D" ],
		[ 1, "John B" ],
		[ 2, "male JB" ],
		[ 1, "Julie" ],
		[ 2, "female JB" ],
		[ 1, "Aaron" ],
		[ 1, "Donald" ],
		[ 1, "Satan" ]
		])
}
	)()

// ---------------------------------------------------------------------------
// --- Define some classes to use in subsequent tests

class Person {
	name: string
	gender: 'male' | 'female'
	email: (string | undefined)
	constructor(
			name2: string,
			gender2: 'male' | 'female',
			email1: (string | undefined) = undef
			){this.name = name2;this.gender = gender2;this.email = email1;}
}

class PersonWalker extends Walker<Person> {
	override isNode(x: object): x is Person {
		return x instanceof Person
	}
};

// ---------------------------------------------------------------------------
// --- Walk a single node

(() => {
	const hAst = new Person('John', 'male')

	const walker = new PersonWalker()

	const results13=[];for (const {name} of walker.walk(hAst)) {
		results13.push(name)
	};const lNames =results13
	const results14=[];for (const {gender} of walker.walk(hAst)) {
		results14.push(gender)
	};const lGenders =results14
	const results15=[];for (const {name, gender} of walker.walk(hAst)) {
		results15.push(`${name} is ${gender}`)
	};const lDesc =results15

	equal(lNames,   ['John'])
	equal(lGenders, ['male'])
	equal(lDesc,    ['John is male'])
}
	)();

// ---------------------------------------------------------------------------
// --- Walk an array of nodes

(() => {
	const hAst = [
		new Person('John', 'male'),
		new Person('Julie', 'female')
		]

	const walker = new PersonWalker()

	const results16=[];for (const {name} of walker.walk(hAst)) {
		results16.push(name)
	};const lNames   =results16
	const results17=[];for (const {gender} of walker.walk(hAst)) {
		results17.push(gender)
	};const lGenders =results17
	const results18=[];for (const {name, gender} of walker.walk(hAst)) {
		results18.push(`${name} is ${gender}`)
	};const lDesc    =results18

	equal(lNames,   ['John', 'Julie'])
	equal(lGenders, ['male', 'female'])
	equal(lDesc,    ['John is male', 'Julie is female'])
}
	)();

// ---------------------------------------------------------------------------
// --- Walk a hash with node values

(() => {
	const hAst = {
		first: new Person('John', 'male'),
		second: new Person('Julie', 'female')
		}

	const walker = new PersonWalker()

	const results19=[];for (const {name} of walker.walk(hAst)) {
		results19.push(name)
	};const lNames   =results19
	const results20=[];for (const {gender} of walker.walk(hAst)) {
		results20.push(gender)
	};const lGenders =results20
	const results21=[];for (const {name, gender} of walker.walk(hAst)) {
		results21.push(`${name} is ${gender}`)
	};const lDesc    =results21

	equal(lNames,   ['John', 'Julie'])
	equal(lGenders, ['male', 'female'])
	equal(lDesc,    ['John is male', 'Julie is female'])
}
	)();

// ---------------------------------------------------------------------------
// --- Walk a complex structure with nodes inside
//     including hashes that look like a Person, but it's not

(() => {
	const hAst = {
		first: new Person('John', 'male'),
		third: {name: 'Julie', gender: 'female'},
		fourth: {name: 'Bob', gender: 'male', email: 'bob@gmail.com'},
		pos: 1,
		end: 42,
		second: [
			{
				person: new Person('Julie', 'female'),
				index: 13.2,
				for: 'me'
				},
			[1,2,3]
			]
		}

	const walker = new PersonWalker()

	const results22=[];for (const {name} of walker.walk(hAst)) {
		results22.push(name)
	};const lNames   =results22
	const results23=[];for (const {gender} of walker.walk(hAst)) {
		results23.push(gender)
	};const lGenders =results23
	const results24=[];for (const {name, gender} of walker.walk(hAst)) {
		results24.push(`${name} is ${gender}`)
	};const lDesc    =results24

	equal(lNames,   ['John', 'Julie'])
	equal(lGenders, ['male', 'female'])
	equal(lDesc,    ['John is male', 'Julie is female'])
}
	)();

// ---------------------------------------------------------------------------
// --- Redefine node to be anything with name and gender

(() => {
	const hAst = {
		first: new Person('John', 'male'),
		third: {name: 'Julie', gender: 'female'},
		fourth: {name: 'Bob', gender: 'male', email: 'bob@gmail.com'},
		pos: 1,
		end: 42,
		second: [
			{
				person: new Person('Jane', 'female'),
				index: 13.2,
				for: 'me'
				},
			[1,2,3]
			]
		}

	class NewPersonWalker extends Walker<Person> {
		override isNode(x: object): x is Person {
			return hasKeys(x, 'name', 'gender')
		}
	}

	const walker = new NewPersonWalker()

	const results25=[];for (const {name, gender} of walker.walk(hAst)) {
		results25.push(`${name} is ${gender}`)
	};const lDesc =results25

	equal(lDesc, [
		'John is male',
		'Julie is female',
		'Bob is male',
		'Jane is female'
		])

	// --- Try extended walking

	const results26=[];for (const [vkind, {name, gender}] of walker.walkEx(hAst)) {if (!(vkind === 'enter')) continue;
		results26.push(`${name} is ${gender}`)
	};const lDesc2 =results26

	equal(lDesc2, [
		'John is male',
		'Julie is female',
		'Bob is male',
		'Jane is female'
		])
}
	)();

// ---------------------------------------------------------------------------
// --- test extended walking

(() => {
	const hAst = {
		kind: 'top',
		first: 'first',
		next: {
			kind: 'next',
			a: 'one',
			b: 'two',
			c: 'three'
			},
		last: {
			kind: 'last',
			A: 'one',
			B: 'two'
			}
		}


	const walker = new Walker()
	const results27=[];for (const [vkind, item] of walker.walkEx(hAst)) {
		results27.push(`${vkind} ${item.kind}`)
	};const lItems =results27
	equal(lItems, [
		'enter top',
		'enter next',
		'exit next',
		'enter last',
		'exit last',
		'exit top'
		])
}
	)()