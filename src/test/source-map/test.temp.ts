"use strict";
import {undef} from 'datatypes'

const lNames = ['John', 'Billy']
export const sum = (x: number, y: number) => {

	let i1 = 0;for (const name of lNames) {const i = i1++;
		console.log(`${i}: ${name}`)
	}
	return x + y
}