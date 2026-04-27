Basic Philosophy
================

Using a backslash in file paths is one of the worst
ideas that Microsoft ever had. Fortunately, you can
pass paths with forward slashes to Microsoft's file
handling functions. Therefore, I use forward slashes
throughout these libraries and before displaying any
file paths, backslashes are converted to forward
slashes and drive letters are upper-cased. Being
consistent about these things makes it possible to
directly compare file paths.

Even though the Microsoft file system is case
insensitive, file paths are considered case sensitive
in these libraries.

There is a standard notion of file extensions. For
example, the file 'temp.civet' has file extension
'.civet'. Note that file extensions always start with
a '.'. I further extend this notion with a file's
'purpose'. For example, the file 'temp.test.civet'
has the purpose 'test'. Note that the period is not
included in the file's purpose. If a file name has
only one period in it, the purpose is empty. Here are
some common `purpose`s:

`lib` - file is meant to be a library of names which
	can be imported and used in commands and other
	libraries.

`cmd` - file is meant to be executed as a `command`.

`test` - file is meant to be a set of unit tests

`doc` - file is documentation

`parse` - file implements a parser.

`config` - the file exports a symbol named `hConfig` which
	is a configuration object

`temp` - file is meant to be temporary, usually an
	intermediate file when converting one type of file
	to another type of file

With the combination of file extensions and a file
purpose, there really is not reason to enforce a
directory structure on a project. You can put your
files anywhere you please, as long as it's somewhere
inside your project folder.

I program in the civet language, which the civet
compiler converts to TypeScript. I also use deno as an
execution environment, and deno will type check and
execute TypeScript files directly. Neither of these
things are required - my project includes both the
`*.civet` and `*.ts` files.

For example, when I look for library files to be
compiled, I can simply search for any files that match
the glob pattern `*.lib.*`, then invoke the appropriate
compiler by checking the file extension.

I have no use for the JavaScript/TypeScript value known
as `null`. Instead, I use the value `undefined`, which
I abbreviate as `undef' to indicate an empty value.
I realize that many JavaScript functions return the
`null` value to indicate no results (e.g. String.match()).
To handle these cases, my `base` library exports
functions defined() and notdefined(), for which both
`null` and `undef` are considered not defined.

I rarely use TypeScript's `function` keyword. Instead,
I create constants and assign functions to them using
a lambda expression. Some things, however, don't work
when doing it this way and I'm forced to use the `function`
keyword. Here is an example:

```ts
export func := (a: string, b: number): string =>
	return a.repeat(b)
```

Note that in civet, the `:=` means create func as a
constant, not a variable.

for loops
---------

All my `for` loops are `for...of` loops, never `for...in`
loops. The purpose of a JavaScript/TypeScript `for...in`
loop is to iterate over the properties (i.e. keys) of an
object. I think it's more clear to simply do:

```ts
for key of Object.keys(obj)
	...etc.
```

or utilizing my `keys()` function,


```ts
for key of keys(obj)
	...etc.
```

Generator Functions and Iterators
---------------------------------

I try to use these wherever possible. However, to make
things easier for new programmers, I always create an
`iterator` by creating and calling a `generator
function`. JavaScript has the types Iterator, Iterable,
IterableIterator and Generator. That's just too much to
learn. Also, it confuses the concepts of a `Generator`
and a `Generator Function`.

These libraries define types `TIterator` and
`TAsyncIterator` (more about async functions later). The
idea is that you write a `generator function`. When you
call a `generator function`, the return value is an
`iterator`. For example:

```ts
range := (max: number): TIterator<number> =>
	for n of [0...max]
		yield n
	return
```

Remember that `:=` means we're creating a constant

The `TIterator<number>` means that the return value from
calling the function will be an iterator of numbers.
Google "TypeScript generics" for more info about the
syntax.

In civet, `[<min>...<max>]` creates an iterator that
yields numbers from `<min>` to `<max>-1`.

Although there is the concept of a `generator function`,
there is no corresponding type. There is, however, a
function `isGeneratorFunction()` that can be used to
determine whether a function is a `generator function`.

Given the above definition of the `range()` function,
the following code will result in the displayed output:

```ts
for i of range(3)
	console.log i
```

```text
0
1
2
```
