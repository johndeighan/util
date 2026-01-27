"use strict";
// compileall.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {red, cyan} from '@std/fmt/colors'
import {resolve, relative} from '@std/path'
import {expandGlob} from '@std/fs/expand-glob'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'
import {compile as compileCivet} from 'npm:@danielx/civet'

import {
	Iter, AsyncIter, mapper, reducer,
	} from 'var-free'

import hCivetConfig from "civetconfig" with {type: "json"}

const sourceMapPath = './sourcemap.json'

export const undef = undefined

// ---------------------------------------------------------------------------

export type TAssertFunc = (
		cond: unknown,
		msg?: string
		) => asserts cond

export const assert: TAssertFunc = (
		cond: unknown,
		msg: string = "An error occurred"
		): asserts cond => {

	if (!cond) {
		throw new Error(msg)
	}
	return
}

// ---------------------------------------------------------------------------

type TSourceMaps = {
	[path: string]: RawSourceMap
	}

const hSourceMaps: TSourceMaps = await (async () => {
	try {
		const {default: data} = await import(sourceMapPath, {with: {type: 'json'}})
			// --- Or 'assert: { type: "json" }' depending on Deno version
		return data as TSourceMaps
	}
	catch (err) {
		return {}
	}
}
	)()


// ---------------------------------------------------------------------------

// --- if verbose, output info about each civet file
//     else, only ouput errors & files actually compiled and type checked
export const verbose: boolean = false

export const encoder = new TextEncoder()

// ---------------------------------------------------------------------------

export const encode = (str: string) => {

	return encoder.encode(str)
}

// ---------------------------------------------------------------------------

export const LOG = (msg: string, level: number = 0): void => {

	console.log('   '.repeat(level) + msg)
	return
}

// ---------------------------------------------------------------------------

export const ERR = (msg: string, level: number = 0): void => {

	console.log('   '.repeat(level) + red(msg))
	return
}

// ---------------------------------------------------------------------------

export const DBG = (msg: string, level: number = 0): void => {

	if (verbose) {
		console.log('   '.repeat(level) + msg)
	}
	return
}

// ---------------------------------------------------------------------------

export const croak = (msg: string): never => {

	throw new Error(msg)
}

// ---------------------------------------------------------------------------

export const centered = (
		label: string,
		width: number = 64,
		char: string = '-'
		): string => {

	const totSpaces = width - label.length
	const numLeft = Math.floor(totSpaces / 2)
	const numRight = totSpaces - numLeft
	const buf = '  '
	const left = '='.repeat(numLeft - 2)
	const right = '='.repeat(numRight - 2)
	return left + buf + cyan(label) + buf + right
}

// ---------------------------------------------------------------------------

export const getErrStr = (err: unknown): string => {

	if (typeof err === 'string') {
		return err
	}
	else if (err instanceof Error) {
		return err.message
	}
	else {
		return "Serious Error"
	}
}

// ---------------------------------------------------------------------------

export const isDir = (path: string): boolean => {

	try {
		return Deno.statSync(path).isDirectory
	}
	catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false
		}
		else {
			throw err
		}
	}
}

// ---------------------------------------------------------------------------

export const isFile = (path: string): boolean => {

	try {
		return Deno.statSync(path).isFile
	}
	catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false
		}
		else {
			throw err
		}
	}
}

// ---------------------------------------------------------------------------

export const normalizePath = (path: string): string => {

	return path.replace(/^c:/, 'C:').replaceAll('\\', '/')
}

// ---------------------------------------------------------------------------

export const toFullPath = (path: string): string => {

	return normalizePath(resolve('.', path))
}

// ---------------------------------------------------------------------------

export const alreadyCompiled = (civetPath: string): boolean => {

	try {
		assert(civetPath.endsWith('.civet'))
		assert(isFile(civetPath))
		const tsPath = civetPath.replace('.civet', '.ts')
		assert(isFile(tsPath))

		const civetModTime = Deno.statSync(civetPath).mtime
		assert((civetModTime !== null))
		const tsModTime = Deno.statSync(tsPath).mtime
		assert((tsModTime !== null))

		return (tsModTime > civetModTime)
	}
	catch (err) {
		return false
	}
}

// ---------------------------------------------------------------------------

const hGlobOptions = {
	exclude: [
		'src/temp/*',
		'src/save/*',
		'src/test/**/*'
		]
	}

export const allCivetFiles = async function*(): AsyncIter<string> {
	const path = Deno.args[0]
	if (path) {
		assert(isFile(path))
		yield path
	}
	else {
		for await (const {path} of expandGlob("src/**/*.civet", hGlobOptions)) {
			yield path
		}
	}
	return
}

// ---------------------------------------------------------------------------
// ASYNC - just returns true or false, stdout & stderr 'inherit'

const execCmd = async (
		cmdName: string,
		lArgs: string[] = []
		): AutoPromise<boolean> => {

	const cmd = new Deno.Command(cmdName, {args: lArgs})
	const child = cmd.spawn()
	const {success} = await child.status
	return success
}

// ---------------------------------------------------------------------------
// ASYNC - just returns true or false

export const typeCheck = async (path: string): AutoPromise<boolean> => {

	return await execCmd('deno', ['check', path])
}

// ---------------------------------------------------------------------------

export const haveSourceMapFor = (path: string): boolean => {

	return (toFullPath(path) in hSourceMaps)
}

// ---------------------------------------------------------------------------

export const addSourceMap = (
		path: string,
		hSrcMap: RawSourceMap
		): void => {

	hSourceMaps[normalizePath(path)] = hSrcMap
	return
}

// ---------------------------------------------------------------------------

export const extractSourceMap = (
		contents: string
		): [string, RawSourceMap?] => {

	const lMatches = contents.match(/^(.*)\/\/\#\s+sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/s)
	if (lMatches === null) {
		return [contents, undefined]
	}
	const code = lMatches[1].trim()
	const hSrcMap = JSON.parse(atob(lMatches[2].trim())) as RawSourceMap
	const {file} = hSrcMap
	hSrcMap.file = normalizePath(file.replace('.tsx', '.ts'))
	const results=[];for (const path of hSrcMap.sources) {
		results.push(normalizePath(path))
	};hSrcMap.sources = results
	return [code, hSrcMap]
}

// ---------------------------------------------------------------------------
// ASYNC

export const saveSourceMaps = async (): AutoPromise<void> => {

	await Deno.writeTextFile(
		sourceMapPath,
		JSON.stringify(hSourceMaps, null, 3)
		)
	return
}

// ---------------------------------------------------------------------------

export type TOkResult = {
		destPath: string
		code: string
		hSrcMap: RawSourceMap
		}

// ---------------------------------------------------------------------------
// --- ASYNC GENERATOR

export const compileCivetFile = async function*(
		path: string
		): AsyncIter<TOkResult> {

	const civetPath = toFullPath(path)
	const relPath = relative('.', civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relative('.', destPath)

	if (alreadyCompiled(path)) {
		DBG(centered(`COMPILE: ${relPath}`))
		DBG(`already compiled to ${relDestPath}`, 1)
		return
	}

	try {
		LOG(centered(`COMPILE: ${relPath}`))
		LOG(`destPath = ${relDestPath}`, 1)

		const civetCode = await Deno.readTextFile(civetPath)
		const tsCode: string = await compileCivet(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: civetPath
			})
		assert(tsCode && !tsCode.startsWith('COMPILE FAILED'),
			`CIVET COMPILE FAILED: ${relPath}`)
		LOG("compile succeeded", 1)
		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undef), "Missing source map")
		yield {
			destPath,
			code,
			hSrcMap
			}
	}

	catch (err) {
		ERR(`ERROR in ${relDestPath}:\n${err}`)
	}
	return
}

// ---------------------------------------------------------------------------
// --- ASYNC

export const typeCheckTsFile = async (
		hResult: TOkResult
		): AutoPromise<boolean> => {

	const {destPath, code, hSrcMap} = hResult
	const relDestPath = relative('.', destPath)
	LOG(centered(`TYPE CHECK: ${relDestPath}`))
	try {
		// --- Unfortunately, we have to write the code to a file
		//     in order to type check it :-(

		const tempPath = 'src/temp/_tempcode_.ts'
		const encoded = encoder.encode(code)
		await Deno.writeFile(tempPath, encoded)
		const success = await typeCheck(tempPath)
		assert(success, `type check failed for ${relDestPath}`)

		await Deno.writeFile(destPath, encoded)
		LOG("TS file written", 1)
		LOG("type check OK", 1)
		LOG(`adding source map for ${relDestPath}`, 1)
		addSourceMap(destPath, hSrcMap)
		return true
	}

	catch (err) {
		ERR(`ERROR in ${relDestPath}:\n${getErrStr(err)}`)
		return false
	}
}

// ---------------------------------------------------------------------------
