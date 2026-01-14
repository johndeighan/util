hera
====

How to produce a TypeScript file from
a hera file

1. Create file src/parse/<name>.parse.hera

2. Compile the *.hera file to TypeScript
	- convert each TAB character to 2 spaces
	- deno run -A npm:@danielx/hear --module <file>
	- add //@ts-nocheck at the top of the file
	- change @danielx to npm:@danielx globally
	- see example in .bashrc

To make it easy to debug, in the *.hera file:
	- import {CParseMatches} from 'parse-utils'
	- export let pm = new CParseMatches();
	- call pm.match(name, loc, data); at start of each code block


