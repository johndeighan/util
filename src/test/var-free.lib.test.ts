"use strict";
// var-free.lib.test.civet

import {
	mapper, syncMapper, reducer, syncReducer,
	ITERATOR, ASYNC_ITERATOR,
	} from 'var-free'
import {getFakeData, equal} from 'unit-test';

// ---------------------------------------------------------------------------
// --- test syncMapper()

(() => {
	const lNums = [1, 2, 3, 4]

	// --- pure mapping

	const lItems = syncMapper(lNums, function*(n) {
		yield `number is ${n}`
	})

	equal(Array.from(lItems), [
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
	const lNewItems = Array.from(syncMapper(lItems, func, abort_func))

	equal(lNewItems, [
		"number is 1",
		"number is 2"
		])
}
	)();

(() => {
	// --- pure mapping, using a generator

	const gen = function*(): ITERATOR<number> {
		for (let i1 = 1; i1 <= 4; ++i1) {const i = i1;
			yield i
		}
		return
	}

	const lNewItems = Array.from(syncMapper(gen(), function*(n) {
		yield `number is ${n}`
	}))

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
	const lNewItems = Array.from(syncMapper(lItems, function*(i: number) {
		if (i % 2 === 0) {
			yield i
		}
	}))

	equal(lNewItems, [2, 4])
}
	)();

(() => {
	// --- pure filtering, early abort

	const func = function*(n: number) {
		if (n % 2 === 0) {
			yield n
		}
	}
	const abortFunc = function(i: number) {
		return (i === 3)
	}
	const lItems = Array.from(syncMapper([1,2,3,4,5,6], func, abortFunc))

	equal(lItems, [2])
}
	)();

(() => {
	// --- combined filtering and mapping

	const lItems = Array.from(syncMapper([1,2,3,4], function*(i: number) {
		if (i % 2 === 0) {
			yield `2i = ${2*i}`
			yield `number is ${10 * i}`
		}
		return
	}))

	equal(lItems,
		[
			"2i = 4",
			"number is 20",
			"2i = 8",
			"number is 40"
			])
}
	)();

// ---------------------------------------------------------------------------
// --- test syncReducer()

(() => {
	// --- reducing (getting the sum, use JavaScript's reduce)

	const sum = [1,2,3,4].reduce((acc, n) => acc + n, 0)
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum)

	const sum = syncReducer([1,2,3,4], 0, (acc, n) => acc + n)
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum, early abort)

	const sum = syncReducer([1,2,3,4], 0,
			(acc,n) => acc+n,
			function(n) { return (n===3) })
	equal(sum, 3)
}
	)();

(() => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]
	const func = (accum: TAcc, n: number): TAcc => {
		const [sum, sumsq] = accum
		return [sum + n, sumsq + n*n]
	}

	const [sum, sumsq] = syncReducer([1,2,3,4], [0, 0], func)
	equal(sum, 10)
	equal(sumsq, 30)
}
	)();

(() => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]
	const func = (accum: TAcc, n: number): TAcc => {
		if (n % 2 === 0) {
			const [sum, sumsq] = accum
			return [sum + n, sumsq + n*n]
		}
		else {
			return accum
		}
	}

	const [sum, sumsq] = syncReducer([1,2,3,4], [0, 0], func)
	equal(sum, 6)
	equal(sumsq, 20)
}
	)();

// ---------------------------------------------------------------------------
// --- test mapper()

(async () => {
	// --- pure mapping

	// --- an async iterator of integers
	const iterData = getFakeData([1,2,3,4])

	// --- an async iterator of strings
	const iterStrings = mapper(iterData, function*(n) { yield `number is ${n}` })

	equal(await Array.fromAsync(iterStrings), [
		"number is 1",
		"number is 2",
		"number is 3",
		"number is 4"
		])
}
	)()

// ---------------------------------------------------------------------------

