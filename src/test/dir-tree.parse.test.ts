"use strict";
// dir-tree.lib.test.civet

import {doParse} from 'hera-parse'
import {equal} from 'unit-test'

// ---------------------------------------------------------------------------

equal(await doParse('dir-tree', `./src
file.txt
	abcdef`), [
	{ op: 'barf', path: './src/file.txt', contents: "abcdef"}
	])

equal(await doParse('dir-tree', `./src clear
file.txt
	abc`), [
	{ op: 'clearDir', path: './src'},
	{ op: 'barf', path: './src/file.txt', contents: "abc"}
	])

equal(await doParse('dir-tree', `./src clear
/temp
	file.txt
		abc
		def`), [
	{ op: 'clearDir', path: './src'},
	{ op: 'barf', path: './src/temp/file.txt', contents: "abc\ndef"}
	])

equal(await doParse('dir-tree', `./src/test clear
/temp
	/next
		file.txt
			abc
			def`), [
	{ op: 'clearDir', path: './src/test'},
	{ op: 'barf', path: './src/test/temp/next/file.txt', contents: "abc\ndef"}
	])