"use strict";
// compileall.lib.civet

import {relative} from '@std/path'
import {compile as compileCivet} from '@danielx/civet'

import {
	undef, defined, notdefined, croak, assert, nonEmpty,
	} from 'datatypes'
import {centered, getErrStr} from 'llutils'
import {LOG, ERR, DBG} from 'logger'
import {flag, nonOption, allNonOptions} from 'cmd-args'
import {
	isFile, isDir, toFullPath,
	newerDestFileExists, allFilesMatching,
	} from 'fsys'
import {
	extractSourceMap, addSourceMap, RawSourceMap,
	} from 'source-map'

import hCivetConfig from "civetconfig" with {type: "json"}

const force = flag('f')
if (force) {
	console.log("force = true")
}

// ---------------------------------------------------------------------------
// --- sanity check

assert(isFile('./compileall.civet'), "No file ./compileall.civet")
assert(isDir('src'),                 "No dir src")
assert(isFile('civetconfig.json'),   "No file civetconfig.json")
assert(isFile('.gitignore'),         "No file .gitignore")

// ---------------------------------------------------------------------------

export type TOkResult = {
	status: 'ok'
	destPath: string
	code: string
	hSrcMap: RawSourceMap
	}

export type TResult = TOkResult |
	{
		status: 'error'
		destPath: string
		errMsg: string
		} |
	{
		status: 'alreadyCompiled'
		destPath: string
		}

// ---------------------------------------------------------------------------
// --- ASYNC GENERATOR

export const compileCivetFile = async function*(
		path: string
		): AsyncGenerator<TResult> {

	const civetPath = toFullPath(path)
	const relPath = relative('.', civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relative('.', destPath)

	if (!force && newerDestFileExists(path, '.ts')) {
		yield {
			status: 'alreadyCompiled',
			destPath
			}
		return
	}

	try {
		LOG(`COMPILE: ${relPath}`)

		const civetCode = await Deno.readTextFile(civetPath)
		const tsCode: string = await compileCivet(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: civetPath
			})
		assert(tsCode && !tsCode.startsWith('COMPILE FAILED'),
			`CIVET COMPILE FAILED: ${relPath}`)
		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undef), "Missing source map")
		await Deno.writeTextFile(destPath, code)
		addSourceMap(destPath, hSrcMap)
		yield {
			status: 'ok',
			destPath,
			code,
			hSrcMap
			}
	}

	catch (err) {
		ERR(`ERROR in ${relDestPath}:\n${err}`)
		yield {
			status: 'error',
			destPath,
			errMsg: getErrStr(err)
			}
	}
	return
}
