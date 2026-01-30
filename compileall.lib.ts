"use strict";
// compileall.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {red, cyan} from '@std/fmt/colors'
import {resolve, relative} from '@std/path'
import {expandGlob} from '@std/fs/expand-glob'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'
import {compile as compileCivet} from 'npm:@danielx/civet'

import hCivetConfig from "civetconfig" with {type: "json"}

const sourceMapPath = './sourcemap.json'

export const undef = undefined

type TDefined = NonNullable<unknown>
export const defined = (x: unknown): x is TDefined => {
	return (x !== undef) && (x !== null)
}

type TNotDefined = null | undefined
export const notdefined = (x: unknown): x is TNotDefined => {
	return !defined(x)
}

// ---------------------------------------------------------------------------

export const DUMP = (x: unknown): void => {

	console.dir(x, {depth: null})
	return
}

// ---------------------------------------------------------------------------

export const isIterator = <T,>(x: unknown): x is IterableIterator<T> => {

	if (
			   (x === undef)
			|| (x === null)
			|| (typeof x !== 'object')
			|| (!('next' in x))
			|| (typeof x.next !== 'function')
			|| (!(Symbol.iterator in x))
			) {
		return false
	}
	const iter = x[Symbol.iterator]
	return (typeof iter === 'function') && (iter.call(x) === x)
}

// ---------------------------------------------------------------------------

export const isAsyncIterator = <T,>(x: unknown): x is AsyncIterableIterator<T> => {

	if (
			   (x === undef)
			|| (x === null)
			|| (typeof x !== 'object')
			|| (!('next' in x))
			|| (typeof x.next !== 'function')
			|| (!(Symbol.asyncIterator in x))
			) {
		return false
	}
	const iter = x[Symbol.asyncIterator]
	return (typeof iter === 'function') && (iter.call(x) === x)
}

// ---------------------------------------------------------------------------

export const isPromise = <T,>(x: unknown): x is Promise<T> => {

	return (
		   (typeof x === 'object')
		&& (x !== null)
		&& ('then' in x)
		&& (typeof x.then === 'function')
		)
}

// ---------------------------------------------------------------------------

export type TMaybeCmd = 'stop' | undefined | void

// ---------------------------------------------------------------------------

export async function* mapper<TIn, TOut>(
		lItems:  Generator<TIn> |
					AsyncGenerator<TIn> |
					TIn[],
		mapFunc: (x: TIn, i: number) =>
			(TOut | undefined) |
			Promise<(TOut | undefined)> |
			Generator<TOut, TMaybeCmd> |
			AsyncGenerator<TOut, TMaybeCmd>
		): AsyncGenerator<TOut> {

	// --- NOTE: You can await something even if it's not async
	let i1 = 0;for await (const item of lItems) {const i = i1++;
		const iter = mapFunc(item, i)
		if (isIterator(iter) || isAsyncIterator(iter)) {
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					if (value === 'stop') {  // value returned from mapFunc()
						return
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					yield value
				}
			}
		}
		else if (iter !== undefined) {
			if (isPromise(iter)) {
				// --- iter is a TOut
				const result = await iter
				if (result !== undefined) {
					yield result
				}
			}
			else {
				yield iter
			}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const reducer = async function<TIn, TAccum>(
		lItems: Generator<TIn> |
				AsyncGenerator<TIn> |
				TIn[],
		acc: TAccum,
		redFunc: (acc: TAccum, x: TIn, i: number) =>
			(TAccum | undefined) |
			Promise<(TAccum | undefined)> |
			Generator<TAccum, TMaybeCmd> |
			AsyncGenerator<TAccum, TMaybeCmd>
		): AutoPromise<TAccum> {

	let i2 = 0;for await (const item of lItems) {const i = i2++;
		const iter = redFunc(acc, item, i)
		if (isIterator(iter) || isAsyncIterator(iter)) {
			while(true) {
				const {done, value} = await iter.next()
				if (done) {
					if (value === 'stop') {
						return await acc
					}
					else {
						break
					}
				}
				else if (value !== undefined) {
					acc = value
				}
			}
		}
		else if (iter !== undefined) {
			if (isPromise(iter)) {
				const result = await iter
				if (result !== undefined) {
					acc = result
				}
			}
			else {
				acc = iter
			}
		}
	}
	return await acc
}

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

// ---------------------------------------------------------------------------
// ASYNC

export const allCivetFiles = async function*(): AsyncGenerator<string> {

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

// export type TStatus = 'ok' | 'error' | 'alreadyCompiled'
// export type TResult = {
// 		status: TStatus
// 		destPath: string
// 		code: string
// 		hSrcMap: RawSourceMap
// 		}

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
		): AsyncGenerator<TResult, void, void> {

	const civetPath = toFullPath(path)
	const relPath = relative('.', civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relative('.', destPath)

	if (alreadyCompiled(path)) {
		DBG(centered(`COMPILE: ${relPath}`))
		DBG(`already compiled to ${relDestPath}`, 1)
		yield {
			status: 'alreadyCompiled',
			destPath
			}
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
		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undef), "Missing source map")
		await Deno.writeTextFile(destPath, code)
		addSourceMap(destPath, hSrcMap)
		LOG(`compile OK, wrote ${relDestPath}, source map added`, 1)
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

// ---------------------------------------------------------------------------
// --- ASYNC

export const typeCheckTsFile = async (h: TOkResult, i: number):AutoPromise<(boolean | undefined)> => {

	const {destPath, code, hSrcMap} = h
	const relDestPath = relative('.', destPath)
	LOG(centered(`TYPE CHECK: ${relDestPath}`))
	try {
		const success = await typeCheck(destPath)
		assert(success, `type check failed for ${relDestPath}`)

		LOG("type check OK", 1)
		addSourceMap(destPath, hSrcMap)
		return true
	}

	catch (err) {
		ERR(`ERROR in ${relDestPath}:\n${getErrStr(err)}`)
		return false
	}
}

// ---------------------------------------------------------------------------
