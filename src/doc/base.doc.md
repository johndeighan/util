base
====

This library contains these symbols:

`deepCopy(x: unknown)` - creates a deep copy of any value

await `sleep(secs: number)` - pause execution for n seconds

`undef` - a synonym for `undefined`

`defined(x: unknown)` - returns false if x is undef or null, else returns true

`notdefined(x: unknown)` - returns not defined(x)

`anyDefined(...x: unknown)` - returns true iff any x is defined

`anyNotDefined(...x: unknown)` - returns true iff any x is notdefined

`LOG(x: unknown)` - executes console.log(x), and saves to internal log

`ERR(x: unknown)` - executes console.error(x), and saves to internal log

`getLog()` - retrieve internal log

`clearLog()` - clear the internal log
