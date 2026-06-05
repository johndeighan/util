"use strict";
// temp.civet

import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from "jsr:@std/streams/text-line-stream"

import {TRY, SKIP, LOG, TAsyncIterator} from 'base'
import {s} from 'llutils'
import {procOneFile} from 'exec'
import {withExt, openTextFile, openAndReadTextFile} from 'fsys'
import {DUMP, toNice} from 'nice'
import {TextTable, splitRows} from 'text-table'
import {
	doCompileHera, testHeraCode, preprocessHeraFile,
	} from 'hera-compile'
import {parseText} from 'hera-parse'
import {compileHera} from 'llhera'
import {symbolsFromString} from 'symbols'
import {CAnalysis, analyzeTsCode} from 'typescript'
import {CBlock} from 'macros'

// ---------------------------------------------------------------------------

TRY(async () => {
	const lBlocks: CBlock[] = await parseText('macros', `abc
	def`)
	DUMP(lBlocks, 'lBlocks')

	const expected = [
		{
			blockType: 'text',
			firstLine: 'abc',
			macroName: '',
			args: '',
			lContent: []
			}
		]
})

SKIP(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.fullsep('-')
	table.title(  'My Expenses')
	table.fullsep('-')
	table.labels( ['', 'Jan', 'Feb'])
	table.sep()
	table.data(   ['coffee', 30, 40])
	table.fullsep('=')
	LOG(table.asString({trace: true}))

	const expected = `-----------------------
      My Expenses
-----------------------
           Jan    Feb
-------- ------- ------
coffee     30.00  40.00
=======================`
})

SKIP(async () => {
	const path = 'src/.temp/bug.txt'
	const [hMetaData, reader] = await openTextFile(path)
	LOG(hMetaData)
	for await (const line of reader) {
		LOG("LINE: " + line)
	}
})

SKIP(async () => {
	const result = await parseText('nice', `abc: 1
def: 2`)
	LOG(result)


	const expected = {abc:1, def:2}
})

SKIP(async () => {
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
