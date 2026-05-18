"use strict";
// temp.civet

import {TRY, SKIP} from 'base'
import {procOneFile} from 'exec'
import {withExt} from 'fsys'
import {DUMP} from 'to-nice'
import {
	doCompileHera, testHeraCode, preprocessHeraFile,
	} from 'hera-compile'
import {parseText} from 'hera-parse'
import {compileHera} from 'llhera'

// ---------------------------------------------------------------------------

TRY(async () => {
	debugger
	const path = 'src/parse/nice.parse.hera'

	// --- preprocess file
	const [heraCode, type] = await preprocessHeraFile(path, withExt(path, '.temp.hera'))
	DUMP(heraCode, type)

	// --- hera compile to get TypeScript file
	const tsCode = compileHera(heraCode, type, 'nice.parse.hera')
	Deno.writeTextFileSync(withExt(path, '.ts'), tsCode)
	DUMP(tsCode, 'RESULT')

	console.log('DONE')
})

SKIP(() => {
	const path = 'src/parse/macro.parse.hera'
	procOneFile(path, doCompileHera)
	const result = parseText('macro', `abc
def
	ghi
		jkl
		mno
	pqr
stu`, {debug: true})
	DUMP(result, 'RESULT')
})
