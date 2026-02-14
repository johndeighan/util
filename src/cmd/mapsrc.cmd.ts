"use strict";
// mapsrc.cmd.civet

import {stdChecks} from 'llutils'
import {flag, nonOption, allNonOptions} from 'cmd-args'
import {assert, defined} from 'datatypes'
import {isFile} from 'fsys'
import {mapSourcePos} from 'source-map'

stdChecks("mapsrc <path> <lineNum>")

// ---------------------------------------------------------------------------

const source = nonOption(0)
assert(defined(source), "Missing file path")
assert(isFile(source), `No such file: ${source}`)

let i1 = 0;for (const str of allNonOptions()) {const i = i1++;
	if (i === 0) {
		// --- skip the path
		continue
	}
	assert(defined(str), "Missing line number")
	assert(str.match(/^\d+$/), `Bad line number: ${str}`)

	const hPos = mapSourcePos({
		source,
		line: parseInt(str),
		col: 1
		})
	console.log(`Line ${str} maps to:`)
	console.dir(hPos)
}


