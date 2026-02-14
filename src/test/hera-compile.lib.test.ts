"use strict";
// hera-compile.lib.test.civet

import {esc, mesc} from 'unicode'
import {
	doCompileHera, preprocessHera,
	} from 'hera-compile'
import {
	equal, truthy, falsy, succeeds, fails,
	} from 'unit-test'

// ---------------------------------------------------------------------------

// --- Very simple rule

equal(esc(preprocessHera(`Main
	/abc/`)), 'Main↓˳˳/abc/')

// --- Very simple rule, with comment and blank like

equal(mesc(preprocessHera(`# file

Main
	/abc/`)), `#˳file↓
↓
Main↓
˳˳/abc/`)

// --- Some code to execute

equal(mesc(preprocessHera(`Main
	/abc/ ->
		write`)), `Main↓
˳˳/abc/˳->↓
˳˳˳˳write`)

// --- This should fail, '->' is missing

fails(() => preprocessHera(`Main
	/abc/
		write`))

// --- add a code block

equal(mesc(preprocessHera(`# --- my parser

\`\`\`
	console.log('Hello');
\`\`\`

Main
	/abc/ ->
		write`)), `#˳---˳my˳parser↓
↓
\`\`\`↓
˳˳console.log('Hello');↓
\`\`\`↓
↓
Main↓
˳˳/abc/˳->↓
˳˳˳˳write`)

// --- add a multiple code blocks

equal(mesc(preprocessHera(`# --- my parser

\`\`\`
	console.log('Hello');
\`\`\`

\`\`\`
	console.log('Hello');
\`\`\`

Main
	/abc/ ->
		write`)), `#˳---˳my˳parser↓
↓
\`\`\`↓
˳˳console.log('Hello');↓
\`\`\`↓
↓
\`\`\`↓
˳˳console.log('Hello');↓
\`\`\`↓
↓
Main↓
˳˳/abc/˳->↓
˳˳˳˳write`)

// --- Multiple Rules

equal(mesc(preprocessHera(`Main
	Root "abc" ->
		write $2

Root
	/\..*/ ->
		write $1
		exit`)), `Main↓
˳˳Root˳"abc"˳->↓
˳˳˳˳write˳$2↓
↓
Root↓
˳˳/\..*/˳->↓
˳˳˳˳write˳$1↓
˳˳˳˳exit`)

