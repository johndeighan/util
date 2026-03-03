"use strict";
// dir-tree.parse.test.civet

import {DUMP} from 'to-nice'
import {doParse} from 'hera-parse'
import {equal} from 'unit-test'

const lOps1 = await doParse('dir-tree', `./src
file.txt
	abcdef`)

const lOps2 = await doParse('dir-tree', `./src clear
file.txt
	abc`)

const lOps3 = await doParse('dir-tree', `./src
/temp
	file.txt
		abc
		def`)

const lOps4 = await doParse('dir-tree', `./src/test clear
/temp
	/subdir
		file.txt
			abc
			def`)

// ---------------------------------------------------------------------------

DUMP(lOps1)
equal(lOps1, [
	{ op: 'mkDir', path: './src'},
	{ op: 'barf', path: './src/file.txt', contents: "abcdef"}
	])

DUMP(lOps2)
equal(lOps2, [
	{ op: 'clearDir', path: './src'},
	{ op: 'barf', path: './src/file.txt', contents: "abc"}
	])

DUMP(lOps3)
equal(lOps3, [
	{ op: 'mkDir', path: './src'},
	{ op: 'mkDir', path: './src/temp'},
	{ op: 'barf', path: './src/temp/file.txt', contents: "abc\ndef"}
	])

DUMP(lOps4)
equal(lOps4, [
	{ op: 'clearDir', path: './src/test'},
	{ op: 'mkDir', path: './src/test/temp'},
	{ op: 'mkDir', path: './src/test/temp/subdir'},
	{ op: 'barf', path: './src/test/temp/subdir/file.txt', contents: "abc\ndef"}
	])

