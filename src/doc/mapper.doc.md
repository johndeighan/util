mapper
======

The main useful function in this library is called MAP.

This function processses a sequence of objects of
any type. The sequence can be passed in as an array
or as a generator function, possibly async.

This function can be used in 3 distinct ways.

To produce only an iterator
---------------------------

In this mode, the arguments passed to MAP() are:

1. the input sequence (an array or iterator)
2. a generator function that takes arguments:
	1. an item from the input sequence
	2. an integer - position in the sequence

	- items yielded, which can be of any type, contribute
		to the output sequence
	- should not return anything (i.e. void return value)

- the output is the resulting output sequence.
- note that this not only replaces the usual map() and filter()
	methods, but may even return an array that is longer
	than the input sequence

Examples:

```ts
lItems := MAP [1,2,3,4,5], (n, i) =>
	if (n % 2 == 0)
		yield n
	return
// ----------------------------------------
// [2, 4]
```

```ts
lResults: TExecResult[] := [
	{success: true, infile: 'temp.civet'}
	{success: true, notNeeded: true, infile: 'temp2.civet'}
	{success: false, infile: 'temp3.civet'}
	]
lFiles := MAP lResults, (h, i) ->
	if h.success && not h.notNeeded
		yield h.infile

// ----------------------------------------
// ['temp.civet']
```

To produce some kind of summary of the input sequence
-----------------------------------------------------

In this mode, it basically replaces the usual reduce() method.

In this mode, the arguments passed to MAP() are:

1. the input sequence (an array or generator function)
2. an initial 'accumulator'
2. a plain function that takes arguments:
	1. an item from the input sequence
	2. an integer - position in the sequence
	3. 'accumulator' value before processing this item

	- return value is a new 'accumulator', which will be passed
		to the function when the next item in the input sequence
		is processed

- the output is the resulting final 'accumulator' value

Examples:

```ts
sum := MAP [1,2,3,4,5], 0, (n, i, acc) =>
	return acc + n
// 15
```

To produce both an iterator and a summary of the input
------------------------------------------------------


