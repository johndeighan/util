datatypes
=========

Very basic exports:

| export | description |
| ------ | ----------- |
| `croak(<msg>)` | throws an error obj with the given message, never returns |
| `assert(<cond>, <msg>)` | if `<cond>` is false, throws an error obj w/ `<msg>` |
| `undef` | a synonym for the (too long) JavaScript value undefined |
| `defined(<val>)` | return true iff `<val>` is not null and not undefined |
| `notdefined(<val>)` | return true iff `<val>` is null or undefined |

JavaScript has these build-in datatypes.
You can test an unknown value using `typeof x` which returns a string:

```text
'undefined'
'boolean'
'number'
'bigint'
'string'
'symbol'
'function'
'object'
```

Note that `typeof null` will return 'object'

The function `jsType(<val>)` has better resolution and will return
these strings :

| returns | if all of |
| ------- | --------- |
| 'undef' | `<val>` is undefined |
| 'boolean' | typeof `<val>` is 'boolean' or `<val>` instanceof Boolean |
| 'string' | typeof `<val>` is 'string' or `<val>` instanceof String |
| 'symbol' | typeof `<val>` is 'symbol' |
| 'bigint' | typeof `<val>` is 'bigint' |
| 'integer' | typeof `<val>` is 'number' <br> Number.isFinite(`<val>`) is true <br> Number.isInteger(`<val>`) is true |
| 'float' | typeof `<val>` is 'number' <br> Number.isFinite(`<val>`) is true <br> Number.isInteger(`<val>`) is false |
| 'NaN' | typeof `<val>` is 'number' <br> Number.isFinite(`<val>`) is false <br> Number.isNaN(`<val>`) is true |
| 'inf' | typeof `<val>` is 'number' <br> Number.isFinite(`<val>`) is false <br> Number.isNaN(`<val>`) is false  <br> `<val>` > 0|
| 'neginf' | typeof `<val>` is 'number' <br> Number.isFinite(`<val>`) is false <br> Number.isNaN(`<val>`) is false  <br> `<val>` < 0|
| 'null' | typeof `<val>` is 'object' <br> `<val>` == null |
| 'regexp' | typeof `<val>` is 'object' <br> `<val>` instanceof RegExp |
| 'set' | typeof `<val>` is 'object' <br> `<val>` instanceof Set |
| 'map' | typeof `<val>` is 'object' <br> `<val>` instanceof Map |
| 'array' | typeof `<val>` is 'object' <br> Array.isArray(`<val>`) is true |
| 'iterator' | typeof `<val>` is 'object' <br> `<val>` != null <br> `<val>` has key Symbol.iterator |
| 'asyncIterator' | typeof `<val>` is 'object' <br> `<val>` != null <br> `<val>` has key Symbol.asyncIterator |
| 'hash' | typeof `<val>` is 'object' and none of the above apply |
| 'class' | typeof `<val>` is 'function' <br> `<val>`.toString() starts with 'class ' |
| 'generator' | typeof `<val>` is 'function' <br> `<val>` instanceof (function* () {}).constructor |
| 'asyncGenerator' | typeof `<val>` is 'function' <br> `<val>` instanceof (function* () {}).constructor |
| 'plainFunction' | typeof `<val>` is 'function' <br> none of the above apply |

A value is considered a primitive if jsType() returns one of:

	'undefined'
	'boolean'
	'number'
	'bigint'
	'string'
	'symbol'

In addition, the value null, though an 'object', is considered primitive

All other values are considered non-primitive

We define further restricted types that are essentially
subsets of these types:

| type | description |
| ---- | ----------- |
| char | strings of length 1 |
| nonEmptyString | a string that includes <br>at least one non-whitespace char |
| integer | a number that is an integer |
| regexp | an object that is a regular expression |

This library exports the following useful TypeScript types:

| type              | description                               |
| ----------------- | ----------------------------------------- |
| TDefined          | any value with is not undef nor null      |
| TNotDefined       | either undef or null                      |
| hashof`<T>`       | an object with string or symbol keys,<br>excluding array, regexp, promise |
| hash              | same as hashof<unknown>                   |
| arrayof`<T>`      | an array that holds only values of type T |
| array             | same as arrayof<unknown>                  |
| TVoidFunc         | () => void                                |
| TFilterFunc       | (item: unknown) => boolean                |
| TStringifier      | (item: unknown) => string                 |
| TStringMapper     | (str: string) => string                   |
| THashCompareFunc  | (h1: hash, h2: hash) => number            |
| THashLikeFunc     | (h: hash, hPat: hash) => boolean          |
| THashToStringFunc | (h: hash) => string                       |

