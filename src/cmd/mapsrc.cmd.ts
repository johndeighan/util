"use strict";
// mapsrc.cmd.civet

import {stdChecks} from 'llutils'
import {flag, nonOption} from 'cmd-args'
import {assert, defined} from 'datatypes'
import {isFile} from 'fsys'
import {mapSourcePos} from 'source-map'

stdChecks("mapsrc <lineNum> <path>")

// ---------------------------------------------------------------------------

const line = nonOption(0)
assert(defined(line), "Missing line number")
assert(line.match(/^\d+$/), `Bad line number: ${line}`)
const source = nonOption(1)
assert(defined(source), "Missing file path")
assert(isFile(source), `No such file: ${source}`)

const hPos = mapSourcePos({
	source,
	line: parseInt(line),
	col: 1
	})
console.dir(hPos)