"use strict";
// temp.civet

import {expandGlobSync} from '@std/fs/expand-glob'
import {TextLineStream} from "jsr:@std/streams/text-line-stream"

import {EXEC, SKIP, LOG, TAsyncIterator} from 'base'
import {s, toBlock} from 'llutils'
import {fromFSM} from 'fsm'
import {indented} from 'indent'
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
import {
	TTextBlock, TMacroBlock, TBlock,
	TMacroFunc, TMacroLib, isMacroLib,
	mkBlk, expand, mapString, mapFile,
	} from 'macros'
import {setDirTree} from 'unit-test'
import {CRule, CRuleBranch, mkCodeBlock} from 'rule'

// ---------------------------------------------------------------------------

EXEC(async () => {
	const hMarkdownLib: TMacroLib = {
		'#preproc': (block) => {
			return `# --- my file
${block}`
		},
		def: (block) => {
			const lLines = block.split('\n')
			const lOutput = [
				`<p style="font-weight: bold">
	${lLines[0]}
</p>
<p>`
				]
			for (const line of lLines.slice(1)) {
				lOutput.push(`\t${line}<br>`)
			}
			return lOutput.join('\n') + '\n</p>'
		}
		}
	const str = `#def
	deepEqual(x: unknown, y: unknown): boolean
	- test for deep equality`
	const result = await mapString(str, hMarkdownLib)
	DUMP(result, 'result')

	const expected = `# --- my file
<p style="font-weight: bold">
	deepEqual(x: unknown, y: unknown): boolean
</p>
<p>
	- test for deep equality<br>
</p>`
})

SKIP(async () => {
	const result = await parseText('dir-tree', `./src
file
	abc

	def`)
	DUMP(result, 'result')
})

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
	const tsCode = await compileHera(heraCode, type, 'nice.parse.hera')
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
