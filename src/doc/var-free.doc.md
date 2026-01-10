lib var-free
============

The 'var-free' library makes it easy to implement
what I call 'variable free programming', where
no variables are ever created - just constants.

SYNOPSIS

There are currently only 2 functions in this library,
'mapper' and 'reducer'

```ts
lItems := [1, 2, 3, 4]

lNewItems := mapper lItems, (i: number) ->
	yield "number is #{i}"

lExpected := [
	"number is 1"
	"number is 2"
	"number is 3"
	"number is 4"
	]
```
NOTE:
	1. lItems can be any iterator, e.g. calling a generator
	2. You can pass a function that takes one item of the
		same type in the array/iterator and returns a boolean
		that, when true, causes early abort.

```ts
	lItems := [1, 2, 3, 4]
	type acc = [number, number]    # --- sum and sum of squares
	func := (accum: acc, n: number) =>
		[sum, sumsq] := accum
		return [sum + n, sumsq + n*n]
	[sum, sumsq] := reducer lItems, [0, 0], func
	expected := [10, 30]

```
NOTE:
	1. lItems can be any iterator, e.g. calling a generator
	2. You can pass a function that takes one item of the
		same type in the array/iterator and returns a boolean
		that, when true, causes early abort.

