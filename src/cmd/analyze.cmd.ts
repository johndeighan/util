"use strict";
// analyze.cmd.civet

import {stdChecks} from 'llutils'
import {
	undef, defined, notdefined, assert, assertIsDefined, croak,
	} from 'datatypes'
import {
	pushLogLevel, popLogLevel, LOG, DBG, DBGVALUE,
	} from 'logger'
import {flag, nonOption, checkCmdArgs} from 'cmd-args'
import {toNice, DUMP} from 'to-nice'
import {findFile, slurp, fileExt} from 'fsys'
import {ts2ast, astAsString, analyze} from 'typescript'
import {civet2ast, civet2ts} from 'civet'

stdChecks()
checkCmdArgs({
	_: {
		desc: "name of file to analyze",
		range: [0, 1],
	},
	t: 'debug walk of AST',
	d: 'dump AST',
	v: 'dump verbose analysis'
	})

// ---------------------------------------------------------------------------

pushLogLevel('info')     // --- temp disable debugging
const fileName = nonOption(0) || 'ast.civet'
const path = fileName.match(/[\\\/]/) ? fileName : findFile(fileName)
assertIsDefined(path)
LOG(`-----  ANALYZE ${path}  -----`)
popLogLevel()
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
const hOptions = {
	dump: flag('d'),
	trace: flag('t')
	}
const analysis = analyze(tsCode, hOptions)
if (flag('v')) {
	DUMP(toNice(analysis), 'ANALYSIS')
}
else {
	DUMP(analysis.asString(), 'ANALYSIS')
}