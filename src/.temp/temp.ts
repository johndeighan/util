"use strict";
// temp.civet

import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from "jsr:@std/streams/text-line-stream"

import {TRY, SKIP, LOG, TAsyncIterator} from 'base'
import {s} from 'llutils'
import {procOneFile} from 'exec'
import {
	withExt, openTextFile, openAndReadTextFile, rmFile,
	} from 'fsys'
import {DUMP, toNice, OL, ML} from 'nice'
import {TextTable, splitRows} from 'text-table'
import {
	doCompileHera, testHeraCode, preprocHera, preprocHeraFile,
	} from 'hera-compile'
import {parseText, str2indents} from 'hera-parse'
import {compileHera} from 'llhera'
import {symbolsFromString} from 'symbols'
import {CAnalysis, analyzeTsCode} from 'typescript'
import {CBlock} from 'macros'

// ---------------------------------------------------------------------------

TRY(() => {
	const str = `Line
	/[^\\n\\r\\x0F\\x0E]+/
		assert defined($0), "result not defined!!!"
		return $0

INDENT
	/\x0F/

UNDENT
	/\x0E/`

	LOG(ML(str))
})
//	fixed := str2indents(str)

// 	contents := """
// 		#beginParse
//
// 		Content
// 			INDENT Line+ UNDENT
// 				return $2
//
// 		Line
// 			/[^\n\r\x0F\x0E]+/
// 				assert defined($0), "result not defined!!!"
// 				return $0
//
// 		INDENT
// 			/\x0F/
//
// 		UNDENT
// 			/\x0E/
//
// 		"""
//	result := await preprocHera contents, {trace: true}
//	LOG result

SKIP(async () => {
	const result = await parseText('macros', `abc
	#h1
		def`)

	DUMP(result, 'result')

	const expected = [
		{
			type: "text",
			firstLine: "abc",
			lContent: [
				{
					type: "macro",
					name: "h1",
					args: "",
					lContent: [
						{
							type: 'text',
							firstLine: 'def',
							lContent: []
							}
						],
					}
				],
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
	const [heraCode, type] = await preprocHeraFile(path, withExt(path, '.temp.hera'))
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
