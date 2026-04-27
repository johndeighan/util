croak
=====

This library contains symbols relating to exception
handling, including:

`assert(cond: boolean, msg: string)` - if cond is true,
does nothing, else throws an exception with the given message.

`obviously(cond: boolean)` - used when a given condition
should have been known by the typescript compiler, but
was not. Performs the necessary type narrowing.

`allStackFrames(trace: boolean = false)` - retrieve all
stack frames
