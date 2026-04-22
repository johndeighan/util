"use strict";
// temp.civet

import {sleep} from 'base-utils'
import {
	allValuesFromAsync, accumFromAsync,
	arrayAndAccumFrom, asyncArrayAndAccumFrom,
	} from 'iter-utils'
import {MAPv6, MAP} from 'mapper'

// ---------------------------------------------------------------------------

const lItems = [1, 2, 3]
const gen = function*() {
	yield 1
	yield 2
	yield 3
	return
}
const agen = async function*() {
	await sleep(0.1)
	yield 1
	await sleep(0.1)
	yield 2
	await sleep(0.1)
	yield 3
	return
}

// ---------------------------------------------------------------------------

const [lAllItems, acc] = await asyncArrayAndAccumFrom(MAPv6(agen(), 0, function*(n, acc) {
	yield n
	return acc + n
}))
console.log(lAllItems)
console.log(acc)
