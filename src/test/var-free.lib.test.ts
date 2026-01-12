"use strict";
// var-free.lib.test.civet

import {mapper, reducer } from 'var-free'
import {equal} from 'unit-test';

// ---------------------------------------------------------------------------

(() => {
	// --- pure mapping

	const lItems = [1, 2, 3, 4]
	const lNewItems = mapper(lItems, function*(i: number) {
		yield `number is ${i}`
	})

	equal(lNewItems,
		[
			"number is 1",
			"number is 2",
			"number is 3",
			"number is 4"
			])
}
	)();

(() => {
	// --- pure mapping, early abort

	const lItems = [1, 2, 3, 4]
	const func = function*(i: number) {
		yield `number is ${i}`
		if (i === 2) {
			return
		}
	}
	const abort_func = function(i: number) {
		return (i === 3)
	}
	const lNewItems = mapper(lItems, func, abort_func)

	equal(lNewItems,
		[
			"number is 1",
			"number is 2"
			])
}
	)();

(() => {
	// --- pure mapping, using a generator

	const gen = function*(): Generator<number, void, void> {
		yield 1
		yield 2
		yield 3
		yield 4
	}

	const lNewItems = mapper(gen(), function*(i: number) {
		yield `number is ${i}`
	})

	equal(lNewItems,
		[
			"number is 1",
			"number is 2",
			"number is 3",
			"number is 4"
			])
}
	)();

(() => {
	// --- pure filtering

	const lItems = [1, 2, 3, 4]
	const lNewItems = mapper(lItems, function*(i: number) {
		if (i % 2 === 0) {
			yield i
		}
	})

	equal(lNewItems, [2, 4])
}
	)();

(() => {
	// --- pure filtering, early abort

	const lItems = [1, 2, 3, 4]
	const func = function*(i: number) {
		if (i % 2 === 0) {
			yield i
		}
	}
	const abort_func = function(i: number) {
		return (i === 3)
	}
	const lNewItems = mapper(lItems, func, abort_func)

	equal(lNewItems, [2])
}
	)();

(() => {
	// --- combined filtering and mapping

	const lItems = [1, 2, 3, 4]
	const lNewItems = mapper(lItems, function*(i: number) {
		if (i % 2 === 0) {
			yield `2i = ${2*i}`
			yield `number is ${10 * i}`
		}
		return
	})

	equal(lNewItems,
		[
			"2i = 4",
			"number is 20",
			"2i = 8",
			"number is 40"
			])
}
	)();

(() => {
	// --- reducing (getting the sum, use JavaScript's reduce)

	const lItems = [1, 2, 3, 4]
	const func = (accum: number, n: number) => {
		return accum + n
	}
	const sum = lItems.reduce(func, 0)
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum)

	const lItems = [1, 2, 3, 4]
	const func = (accum: number, n: number) => {
		return accum + n
	}
	const sum = reducer(lItems, 0, func)
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum, early abort)

	const lItems = [1, 2, 3, 4]
	const func = (accum: number, n: number) => {
		return accum + n
	}
	const abort_func = function(i: number) {
		return (i === 3)
	}
	const sum = reducer(lItems, 0, func, abort_func)
	equal(sum, 3)
}
	)();

(() => {
	// --- reducing (getting the sum AND sum of squares)

	const lItems = [1, 2, 3, 4]
	type acc = [number, number]
	const func = (accum: acc, n: number): acc => {
		const [sum, sumsq] = accum
		return [sum + n, sumsq + n*n]
	}

	const [sum, sumsq] = reducer(lItems, [0, 0], func)
	equal(sum, 10)
	equal(sumsq, 30)
}
	)();

(() => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	const lItems = [1, 2, 3, 4]
	type acc = [number, number]
	const func = (accum: acc, n: number): acc => {
		if (n % 2 === 0) {
			const [sum, sumsq] = accum
			return [sum + n, sumsq + n*n]
		}
		else {
			return accum
		}
	}

	const [sum, sumsq] = reducer(lItems, [0, 0], func)
	equal(sum, 6)
	equal(sumsq, 20)
}
	)()
