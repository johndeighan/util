to do

deno is running v8 version 14.7.173.20-rusty
	in deno repl: console.log(process.versions.v8);
chrome is running v8 version 14.8.178.21
	chrome://version  key 'JavaScript'

on 6/12/2026
	deno: 14.9.207.2-rusty
	chrome: V8 14.9.207.27

on 6/27/2026
	deno: 14.9.207.2-rusty
	chrome: V8 14.9.207.35

------------------------------------------
Test parsing:
	counter - OK
	dir-tree - OK
	nice - OK
	symbols - OK
	macro
Use:
	mkpar <stub> - to build the parser
	upar <stub>  - to test the parser
	parstr <stub> <string> - to parse a string
	parfile <stub> <filename> - to parse file contents
------------------------------------------

pare down unit tests for: eval and proc-files

Use:
	deno run -A --inspect-brk src/cmd/utest.cmd.ts exec
	- to trace through and try to get immediate output

test procFiles(), both serially and concurrently
procFiles() should probably return an array of results
allow multiple ops and lPatterns in procFiles()

there's still a bug in the exec unit tests when using CCmdInstaller
	- try using procOneFile with CCmdInstaller in temp.civet

extract unit tests
	- extract when eval fails
	- getString - not a string, not expected string
	- getNumber - not a number, not expected number
	- getArray - not an array, not expected array
	- getTuple(x, dspath, length)

IDEA: create a bootstrap command that first checks if
all .civet files have been compiled. If not, print a
warning with instructions.

get unit test for fsys lib to 80%

check doInstallCmd and doUninstallCmd

check all calls to execCmd() to see if
	they use parameters correctly

temp craps out: 'acc is not iterable' ???

all files should allow meta-data

in text-table, if all columns have a defined width,
	then output immediately on data(), sep(), etc.
	- or have option for immediate output
	- use in cmd utest

run unit tests via a command buildlib all -t
	coverage report should only be generated when using 'all'

in procFIles, allow passing multiple TProcSpecs

setDirTree outputs some incorrect blank lines

in hera-parse, str2indents(), allow option to not include
blank lines, i.e. collapse consecutive newline chars

test isType() and notType() in unit-test
	- consolidate functions

automate unit tests fail

parseText()
	- doesn't allow returned values to span multiple lines
	- interprets '#' as meaning a comment, even inside quote chars

civet2ts and civet2tsSync should display bad civet code,

Can toNice() display the class of an object?

This is incorrect NICE:
- - Main
- - “0
- - “3
-
   - abc
   - def

In parse-utils matchesTable(), build multi-line structures

Allow returned values to span multiple lines in hera files

in unify, implement functions weakerThan() and strongerThan()
	- and use them in unit tests

see if bootstrap command works

get src/.temp/map-pos.lib.civet working !!!!

mapPosSync() doesn't adjust the source file name
for its directory location

a test in base.lib.test.civet fails badly

test creating DBG error log file

civet file in base.lib.test.civet isn't compiled !

Get all unit tests to pass
	- automate.lib.civet doesn't pass

find low-level way to compile a hera file

in automate.lib.test.civet, replace isType() with
succeeds and a block of civet code (which must be compiled, then type checked)

in fsys::findFile(), remove lIgnoreDirs and ignore . files

op doUnitTest is displaying long output, not summary

get fails() and succeeds() to test a function without
producing any output

in fsys::allFilesMatching(), if any positive path contains 'temp' or 'save',
	exclude those from lExclude

??? instead of compiling serially, do it in dependency order

work on temp.civet, getting SSE to work
	- file src/temp/public/sse.lib.ts isn't being compiled to JS

test function compileFile(), add to unit tests for automate lib

test compiling of .cielo files
   - use temp.civet, it currently names final file as *.temp.ts, which is wrong

use automate's doCompileFile in the file compile.cmd.civet

in unit test for automate.lib.civet, test1.cielo isn't compiled to test1.ts
setDirTree() can't compile cielo files!

IDEA: name hidden folders with a leading period
IDEA: in logger, always log tagged with a given level
	then allow getting log for a particular level and below

running 'reBuild lib' fails
	deno run -A src/cmd/buildlib.cmd.ts -f all


dir-tree unit tests fail
also, they don't even run with 'utest dir-tree'

using 'utest symbols', results are not summarized, coverage is printed

'buildlib -t v8-stack' - some unit tests fail

'buildlib -t unit-test' - says running 40 unit tests,
	but none pass, none fail ???

write function unify() and unit test unifies()

continue work on call-stack.lib.civet
	- currently a problem with returnFrom()

to-nice unit tests fail

unit-test lib tests fail

get isType, notType tests working

cover all & document datatypes.lib.civet

last unit test in typescript.lib.test.civet fails !
	- use runtemp to see why

there are also failures in automate.lib.test.civet

create function compileAllLibs()
	- where to put it?

Run  clear && buildlib to-nice && runtemp -I
Output includes a single item map that should be
	put on a new line

v8-stack unit tests fail

respond to issue in github civet page

Run 'ttest' and figure out why all frames are being filtered

in hera-parse.doParse()
	display matched string along with matches

run unit tests from bottom up

doUnitTest should just display a summary unless there were errors

Execute this:
	clear && buildpar -n dir-tree && runtemp
It indicates an error, but provides no information
Actually, I think the tests should pass???

in unit-test
	work with temp.civet to be sure of the file ops created
	modify execFileOps to keep an array of path parts
		- ops pushWD and popWD should operate on that array
		- barf should construct the file path using that array

try using mapSourcePos() and command mapsrc to see
	why unit tests don't display correct line numbers

Test procFiles() using the doEchoFile handler

work on compile-all-libs.civet
	- use doCompileCivet and procFiles() to compile
	- continue testing
	- consider making allFilesMatching() root '.'
	- create compiled exe file

in setDirTree() in unit-test, don't change current directory
just remember the current path

continue running utest X (fails for cmd-args)

In compileall.civet, after Deno.watchFs, compile file if
it's a civet file

Remove all prefixes (e.g. jsr: npm:) from all imports

doInstallCmd needs to uninstall previous version AND remove the .json file
mapsrc command needs to display a nice error message if the source map
	isn't in the mapping file
mapsrc should have a -v option to display detailed contents of the source map

get command build-dot-symbols working

document lib console-utils

use console-utils everywhere in place of logger

return logger, log-formatter, log-levels

continue documenting datatypes lib

in source-map's mapSourcePos, if there's directory info
in the input parameter, but not in the mapped object
- add it

setDirTree() still doesn't work correctly
causing fsys.lib.test.civet to fail
(fsys now passes with some tests removed)

unit test pass until pll, which fails because
of the problem with setDirTree()

write and test getBlock() in section-map.lib.civet
test with TAML input

fsys has a working openTextFile()
use it to enhance hera-compile to allow meta-data
	---
	lang: 'civet'
	---

to convert all code from civet to TypeScript

??? if a rule body has no ->, automatically add
return $0 along with the ruleMatch() call

continue using src/parse/dir-tree.parse.ts
to create new src/parse/dir-tree.parse.hera

work out how to create and install a command

use 'utest <stub>' to run unit tests
	- cmd-args unit test fails



Search for and fix:
	::=      defines a type
	.=       let
	`        interpolation
