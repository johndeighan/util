to do

datatypes.lib.civet doesn't compiled because of function genIDs()

write a Map() function capable of mapping, filtering
and reducing.

work with datatypes unit test to get mapping correct

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
