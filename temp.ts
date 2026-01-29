function isIterator<T>(x: unknown): x is Iterator<T> {

	return (
		   (x !== null)
		&& (x !== undefined)
		&& (typeof x === 'object')
		&& (typeof x.next === 'function')
		&& (typeof x[Symbol.iterator] == 'function')
		&& (x[Symbol.iterator].call(x) === x)
		)

	}