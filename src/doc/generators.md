Generators, Iterators, Iterables
================================

We use the following definitions:

**generator**
: a function that includes a `yield` statement

**iterator**
: an object that has a `next()` method conforming to the iterator protocol, described below.

**iterable**
: an object that has a `[Symbol.iterator]()` method that when called returns an **iterator**
: an iterable can be used in `for..of` loops
: objects of type Array, Map, Set, String, Int32Array, Uint32Array are all iterables

**iterable iterator**
: An object that is both an **iterator** and an **iterable**

When a **generator** is called, the returned value is an **iterable iterator**.

When an iterator's `next()` method is called, the returned value is
an object (call it "obj") with 2 keys, `value` and `done`.

When `obj.done` is false, it indicates that there are more values to be fetched
and `obj.value` is a value yielded by the generator.

When `obj.done` is true, it indicates that there are no more values to be fetched
and `obj.value` is the value returned by the generator.

Unfortunately, in TypeScript, the type `Generator` is really
an **iterable iterator**, i.e. a type `IterableIterator`

TypeScript types
----------------

**GeneratorFunction<T, TReturn, TNext>**
: What we call a **generator** above

**Generator<T, TReturn, TNext>**
: same as a **GeneratorFunction** (sic)

**GeneratorObject**
: What we call an **iterable iterator** above

**IteratorResult**
: the type of the value returned by calling `next()`

**Iterator<T>**
: an iterator

**Iterable<T>**
: an iterable

**IterableIterator<T>**
: an object which can return a sequence of objects of type T
