"use strict";
// civet.lib.civet

import {Node, SourceFile} from 'npm:typescript'

import {
	undef, defined, notdefined, hash, assert, isString, isHash,
	} from 'datatypes'
import {getOptions, o} from 'llutils'
import {OL, ML} from 'to-nice'
import {DBG, DBGVALUE} from 'logger'
import {
	isFile, fileExt, withExt, slurp, barf, barfTempFile, parsePath,
	} from 'fsys'
import {TExecResult, execCmdSync, execCmd} from 'exec'
import {ts2ast, analyze} from 'typescript'

// ---------------------------------------------------------------------------

export const civet2tsFile = (
		path: string,
		tsPath: string = withExt(path, '.ts'),
		hOptions: hash = {}
		): string => {

	assert((fileExt(path) === '.civet'), `Not a civet file: ${OL(path)}`)
	assert(isFile(path), `No such file: ${OL(path)}`)
	type opt = {
		nomap: boolean
		}
	const {nomap} = getOptions<opt>(hOptions, {
		nomap: false
		})

	execCmdSync('deno', [
		'run',
		'-A',
		'npm:@danielx/civet',
		...(nomap? [] : ['--inline-map']),
		'-o',
		tsPath,
		'-c',
		path
	])
	assert(isFile(tsPath), `File not created: ${OL(tsPath)}`)
	return tsPath
}

// ---------------------------------------------------------------------------

export const civet2ts = (civetCode: string, hOptions: hash = {}): string => {

	const tempFilePath = barfTempFile(civetCode)
	const tsFilePath = withExt(tempFilePath, '.ts')
	civet2tsFile(tempFilePath, tsFilePath, hOptions)
	const contents = slurp(tsFilePath)
	return contents
}

// ---------------------------------------------------------------------------

export const civet2ast = (civetCode: string): Node => {

	const tsCode = civet2ts(civetCode)
	return ts2ast(tsCode)
}

// ---------------------------------------------------------------------------

// --- template literals to simplify displaying
//     the analysis of civet code

export const a = (lStrings: TemplateStringsArray): string => {
	return analyze(civet2ts(lStrings[0])).asString()
}

export const A = (lStrings: TemplateStringsArray): string => {
	return analyze(civet2ts(lStrings[0]), o`dump`).asString()
}