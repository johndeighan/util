Iterators and Generators
========================

Iterator<T, TReturn, TNext>
	- an object with a next() method
	- can iterate using {value, done} := x.next()

Iterable<T>
	- an object that has a [Symbol.iterator] key
	- can be used in for...of loop and with spread operator
	- when [Symbol.iterator] is called, must return an Iterator<...> object
	- Array, Map and Set are Iterables
		their methods keys(), values() and entries() are Iterators

IterableIterator<T>
	- is both an Iterator and an Iterable

Generator<T, TReturn, TNext>
	- extends IterableIterator
	- is an Iterator created via a generator function
	- includes methods return() and throw()

IteratorResult<T, TReturn>
	- a union of:
	   { done: false; value: T }
	   { done: true; value: TReturn }


AsyncIterator<T>
	- Similar to Iterator, but its methods (next, return, throw)
		return a Promise<IteratorResult<T>>

AsyncIterable<T>
	- An object with a [Symbol.asyncIterator] method,
		usable with for await...of loops

AsyncGenerator<T, TReturn, TNext>
	- The return type for async function* declarations,
		combining async iteration with generator functionality

