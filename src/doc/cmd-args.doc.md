cmd-args
========

Very basic exports:

| export | description |
| ------ | ----------- |
| `getCmdArgs(<arg>)` | check for invalid cmd args, return flags, etc. |

There are 3 kinds of strings (whitespace delimited) that can appear
on the command line:

1. Flags, e.g. -fmx sets flags 'f', 'm' and 'x'
	- flag names are always single character

2. Values: e.g. -name=John sets key 'name' to 'John'
	- requires an '='
	- names must be at least 2 chars long
	- if the value looks like a number, it's a number

3. Non-options - everything else
	- if it looks like a number, it's a number, else a string

-h always displays help
-I always invokes Chrome Debugger
-D always sets log level to 'debug'
-S always sets log level to 'silent'

Example usage of getCmdArgs():

```text
{force, noCompile, label, lNonOptions} := getCmdArgs 'runtemp', {
	f:     {name: 'force',     desc: 'force recompile'}
	n:     {name: 'noCompile', desc: 'do not compile libs'}
	label: {type: 'string',    desc: 'provide a label'}
	_:     {range: [1,2],      desc: '1 or 2 file names'}
	}
```

NOTE:

1. Actual args from command line are used since no 3rd arg was passed
2. Flags are false by default, true if passed on command line
3. The 'name' of a flag is the key in the returned hash
4. For non-flags, the key in the passed hash is used
5. If the '_' key is missing, no
