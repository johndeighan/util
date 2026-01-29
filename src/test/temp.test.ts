"use strict";
// temp.test.civet

import {undef} from 'datatypes'
import {
	TMapper, TAsyncMapper, TIterator, TAsyncIterator, TMaybeString,
	syncMapper, syncReducer, mapper, reducer,
	} from 'var-free'
import {equal, getAsync} from 'unit-test'

// ---------------------------------------------------------------------------
// --- test reducer() with plain function

await (async () => {
	// --- reducing (getting the sum)

	const sum = await reducer(getAsync([1, 2, 3, 4]), 0, (acc, n) => {
		return acc + n
	})

	equal(sum, 10)
}
	)()

await (async () => {
	// --- reducing (getting the sum)

	const sum = await reducer([1, 2, 3, 4], 0, (acc, n) => {
		return acc + n
	})

	equal(sum, 10)
}
	)()

await (async () => {
	// --- reducing (getting the sum, early abort)

	const sum = await reducer(getAsync([1, 2, 3, 4]), 0, (acc, n) => {
		return (n < 3) ? acc + n : undef
	})

	equal(sum, 3)
}
	)()

await (async () => {
	// --- reducing (getting the sum, early abort)

	const sum = await reducer([1, 2, 3, 4], 0, (acc, n) => {
		return (n < 3) ? acc + n : undef
	})

	equal(sum, 3)
}
	)()

await (async () => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer(getAsync([1, 2, 3, 4]), [0, 0], (acc, n) => {
		const [sum, sumsq] = acc
		return [sum + n, sumsq + n*n]
	})

	equal(sum, 10)
	equal(sumsq, 30)
}
	)()

await (async () => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer([1, 2, 3, 4], [0, 0], (acc, n) => {
		const [sum, sumsq] = acc
		return [sum + n, sumsq + n*n]
	})

	equal(sum, 10)
	equal(sumsq, 30)
}
	)()

await (async () => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer(getAsync([1, 2, 3, 4]), [0, 0], (acc, n) => {
		const [sum, sumsq] = acc
		return (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)()

await (async () => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer([1, 2, 3, 4], [0, 0], (acc, n) => {
		const [sum, sumsq] = acc
		return (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)()

