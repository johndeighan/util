"use strict";
// analyze.cmd.civet

import {TNoArgPredicate} from 'predicates'
import {
	undef, defined, notdefined, assert,
	} from 'datatypes'
import {stdChecks, croak} from 'llutils'
import {LOG, DBG, ERR} from 'logger'
import {flag, nonOption} from 'cmd-args'
import {DUMP} from 'to-nice'
import {findFile, slurp, fileExt, relpath} from 'fsys'
import {analyzeTS} from 'typescript'
import {civet2ts} from 'civet'

stdChecks(`analyze [-v] <filename>
	-v - dump analysis data structure`)

// ---------------------------------------------------------------------------

const fileName = nonOption(0)
assert(defined(fileName), "No file name provided")
const path = (
	  fileName.match(/[\\\/]/)
	? fileName
	: findFile(fileName, {lIgnoreDirs: []})
	)
assert(defined(path), `No such file: ${fileName}`)
LOG(`-----  ANALYZE ${relpath(path)}  -----`)
let ref;switch(fileExt(path)) {
	case '.ts': {
		ref = slurp(path);break;
	}
	case '.civet': {
		ref = civet2ts(slurp(path));break;
	}
	default:
		ref = croak(`Bad path: ${path}`)
};const tsCode =ref

const analysis = analyzeTS(tsCode, {dumpAST: true, trace: true})
DUMP(analysis)

if (flag('v')) {
	DUMP(analysis, 'ANALYSIS')
}
else {
	DUMP(analysis.asString(), 'ANALYSIS')
}
