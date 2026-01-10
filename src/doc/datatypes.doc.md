datatypes
=========

Very basic exports:

| export | description |
| ------ | ----------- |
| `croak(<msg>)` | throws an error obj with the given message, never returns |
| `assert(<cond>, <msg>)` | if <cond> is false, throws an error obj w/ `<msg>` |
| `undef` | a synonym for the (too long) JavaScript value undefined |

JavaScript has these build-in datatypes.
You can test an unknown value using `valueof x`:

```text
undefined
boolean
number
bigint
string
symbol
function
object
```

Note that `typeof null` will return 'object'

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

