"use strict";
// var-free.lib.test.civet

import {undef, TIterator, TAsyncIterator} from 'datatypes'
import {
	syncMapper, syncReducer, mapper, reducer, TMaybeString,
	} from 'var-free'
import {getAsync, equal} from 'unit-test';

// ---------------------------------------------------------------------------
// --- test syncMapper()

(() => {
	// --- pure mapping

	const iterItems = syncMapper([1, 2, 3, 4], function*(n) {
		yield `number is ${n}`
		return
	})

	equal(Array.from(iterItems), [
		"number is 1",
		"number is 2",
		"number is 3",
		"number is 4"
		])
}
	)();

(() => {
	// --- pure mapping, early abort
	const iterItems = syncMapper([1, 2, 3, 4], function*(n) {
		yield `number is ${n}`
		if (n === 2) {
			return 'stop'
		}
	})

	equal(Array.from(iterItems), [
		"number is 1",
		"number is 2"
		])
}
	)();

(() => {
	// --- pure mapping, using a generator

	const gen = function*(): TIterator<number, TMaybeString> {
		for (let i1 = 1; i1 <= 4; ++i1) {const i = i1;
			yield i
		}
		return
	}

	const iterItems = syncMapper(gen(), function*(n) {
		yield `number is ${n}`
	})

	equal(Array.from(iterItems),
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

	const iterItems = syncMapper([1, 2, 3, 4], function*(n) {
		if (n % 2 === 0) {
			yield n
		}
	})

	equal(Array.from(iterItems), [2, 4])
}
	)();

(() => {
	// --- pure filtering, early abort

	const iterItems = syncMapper([1, 2, 3, 4, 5, 6], function*(n) {
		if (n % 2 === 0) {
			yield n
		}
		return (n===3) ? 'stop' : undef
	})

	equal(Array.from(iterItems), [2])
}
	)();

(() => {
	// --- combined filtering and mapping

	const iterItems = syncMapper([1, 2, 3, 4], function*(n) {
		if (n % 2 === 0) {
			yield `2n = ${2*n}`
			yield `number is ${10 * n}`
		}
		return
	})

	equal(Array.from(iterItems),
		[
			"2n = 4",
			"number is 20",
			"2n = 8",
			"number is 40"
			])
}
	)();

// ---------------------------------------------------------------------------
// --- test syncMapper() with pure functions

(() => {
	// --- pure mapping

	const iterItems = syncMapper([1, 2, 3, 4], function(n) {
		return `number is ${n}`
	})

	equal(Array.from(iterItems), [
		"number is 1",
		"number is 2",
		"number is 3",
		"number is 4"
		])
}
	)();

(() => {
	// --- pure mapping, using a generator

	const gen = function*(): TIterator<number, TMaybeString> {
		for (let i2 = 1; i2 <= 4; ++i2) {const i = i2;
			yield i
		}
		return
	}

	const iterItems = syncMapper(gen(), function(n) {
		return `number is ${n}`
	})

	equal(Array.from(iterItems),
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

	const iterItems = syncMapper([1, 2, 3, 4], function(n) {
		return (n % 2 === 0) ? n : undef
	})

	equal(Array.from(iterItems), [2, 4])
}
	)();

(() => {
	// --- combined filtering and mapping

	const iterItems = syncMapper([1, 2, 3, 4], function(n) {
		return (n % 2 === 0) ? `number is ${10 * n}` : undef
	})

	equal(Array.from(iterItems),
		[
			"number is 20",
			"number is 40"
			])
}
	)();

// ---------------------------------------------------------------------------
// --- test syncReducer()

(() => {
	// --- reducing (getting the sum, use JavaScript's reduce)

	const sum = [1, 2, 3, 4].reduce((acc, n) => acc + n, 0)
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum)

	const sum = syncReducer([1, 2, 3, 4], 0, function*(acc, n) {
		yield acc + n
		return
	})
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum, early abort)

	const sum = syncReducer([1, 2, 3, 4], 0, function*(acc, n) {
		yield acc + n
		if (n===2) {
			return 'stop'
		}
		else {
			return
		}
	})
	equal(sum, 3)
}
	)();

(() => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = syncReducer([1, 2, 3, 4], [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield [sum + n, sumsq + n*n]
		return
	})
	equal(sum, 10)
	equal(sumsq, 30)
}
	)();

(() => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = syncReducer([1, 2, 3, 4], [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
		return
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)();

// ---------------------------------------------------------------------------
// --- test syncReducer() with pure functions

(() => {
	// --- reducing (getting the sum)

	const sum = syncReducer([1, 2, 3, 4], 0, (acc, n) => {
		return acc + n
	})
	equal(sum, 10)
}
	)();

(() => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = syncReducer([1, 2, 3, 4], [0, 0], function(acc, n) {
		const [sum, sumsq] = acc
		return [sum + n, sumsq + n*n]
	})
	equal(sum, 10)
	equal(sumsq, 30)
}
	)();

(() => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = syncReducer([1, 2, 3, 4], [0, 0], function(acc, n) {
		const [sum, sumsq] = acc
		return (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)()

// ---------------------------------------------------------------------------
// --- test mapper()

await (async () => {
	// --- pure mapping

	const iterStrings = mapper(getAsync([1, 2, 3, 4]), function*(n) {
		yield `number is ${n}`
		return
	})

	equal(await Array.fromAsync(iterStrings), [
		"number is 1",
		"number is 2",
		"number is 3",
		"number is 4"
		])
}
	)()

await (async () => {
	// --- pure mapping

	const iterStrings = mapper(getAsync([1, 2, 3, 4]), function*(n) {
		yield `number is ${n}`
		return (n===2) ? 'stop' : undef
	})

	equal(await Array.fromAsync(iterStrings), [
		"number is 1",
		"number is 2"
		])
}
	)()

await (async () => {
	// --- pure filtering

	const iterItems = mapper(getAsync([1, 2, 3, 4]), function*(n) {
		if (n % 2 === 0) {
			yield n
		}
		return
	})

	equal(await Array.fromAsync(iterItems), [2, 4])
}
	)()

await (async () => {
	// --- pure filtering, early abort

	const abortFunc = function(n: number) {
		return (n === 3)
	}

	const iterNum = mapper(getAsync([1, 2, 3, 4]), function*(n) {
		if (n % 2 === 0) {
			yield n
		}
		return (n===2) ? 'stop' : undef
	})

	equal(await Array.fromAsync(iterNum), [2])
}
	)()

await (async () => {
	// --- combined filtering and mapping

	const iterStr = mapper(getAsync([1, 2, 3, 4]), function*(n) {
		if (n % 2 === 0) {
			yield `2n = ${2*n}`
			yield `number is ${10 * n}`
		}
		return (n===2) ? 'stop' : undef
	})

	equal(await Array.fromAsync(iterStr),
		[
			"2n = 4",
			"number is 20"
			])
}
	)()

// ---------------------------------------------------------------------------
// --- test mapper() with pure functions

await (async () => {
	// --- pure mapping

	const iterStrings = mapper(getAsync([1, 2, 3, 4]), (n) => {
		return `number is ${n}`
	})

	equal(await Array.fromAsync(iterStrings), [
		"number is 1",
		"number is 2",
		"number is 3",
		"number is 4"
		])
}
	)()

await (async () => {
	// --- pure mapping

	const iterStrings = mapper(getAsync([1, 2, 3, 4]), (n) => {
		return (n < 3) ? `number is ${n}` : undef
	})

	equal(await Array.fromAsync(iterStrings), [
		"number is 1",
		"number is 2"
		])
}
	)()

await (async () => {
	// --- pure filtering

	const iterItems = mapper(getAsync([1, 2, 3, 4]), (n) => {
		return (n % 2 === 0) ? n : undef
	})

	equal(await Array.fromAsync(iterItems), [2, 4])
}
	)()

await (async () => {
	// --- combined filtering and mapping

	const iterStr = mapper(getAsync([1, 2, 3, 4]), (n) => {
		return (n % 2 === 0) ? `number is ${10 * n}` : undef
	})

	equal(await Array.fromAsync(iterStr),
		[
			"number is 20",
			"number is 40"
			])
}
	)()

// ---------------------------------------------------------------------------
// --- test reducer()

await (async () => {
	// --- reducing (getting the sum)

	const sum = await reducer(getAsync([1, 2, 3, 4]), 0, function*(acc, n) {
		yield acc + n
		return
	})

	equal(sum, 10)
}
	)()

await (async () => {
	// --- reducing (getting the sum)

	const sum = await reducer([1, 2, 3, 4], 0, function*(acc, n) {
		yield acc + n
		return
	})

	equal(sum, 10)
}
	)()

await (async () => {
	// --- reducing (getting the sum, early abort)

	const sum = await reducer(getAsync([1, 2, 3, 4]), 0, function*(acc, n) {
		yield acc + n
		return (n===2) ? 'stop' : undef
	})

	equal(sum, 3)
}
	)()

await (async () => {
	// --- reducing (getting the sum, early abort)

	const sum = await reducer([1, 2, 3, 4], 0, function*(acc, n) {
		yield acc + n
		return (n===2) ? 'stop' : undef
	})

	equal(sum, 3)
}
	)()

await (async () => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer(getAsync([1, 2, 3, 4]), [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield [sum + n, sumsq + n*n]
		return
	})

	equal(sum, 10)
	equal(sumsq, 30)
}
	)()

await (async () => {
	// --- reducing (getting the sum AND sum of squares)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer([1, 2, 3, 4], [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield [sum + n, sumsq + n*n]
		return
	})

	equal(sum, 10)
	equal(sumsq, 30)
}
	)()

await (async () => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer(getAsync([1, 2, 3, 4]), [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
		return
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)()

await (async () => {
	// --- reducing
	//     (getting the sum AND sum of squares of only even nums)

	type TAcc = [number, number]

	const [sum, sumsq] = await reducer([1, 2, 3, 4], [0, 0], function*(acc, n) {
		const [sum, sumsq] = acc
		yield (n % 2 === 0) ? [sum + n, sumsq + n*n] : acc
		return
	})

	equal(sum, 6)
	equal(sumsq, 20)
}
	)()

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
