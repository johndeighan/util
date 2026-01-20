"use strict";
// compileall.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {assert} from "jsr:@std/assert"
import {red, cyan} from 'jsr:@std/fmt/colors'
import {sprintf} from 'jsr:@std/fmt/printf'
import {compile} from 'npm:@danielx/civet'
import {existsSync} from 'jsr:@std/fs'
import {statSync} from 'node:fs'
import {resolve, relative} from 'jsr:@std/path'
import {expandGlob} from 'jsr:@std/fs/expand-glob'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'

import hCivetConfig from "civetconfig" with { type: "json" }

// --- This is where source maps are stored, keyed by
//     the normalized file path
const sourceMapPath = './sourcemap.json'

const encoder = new TextEncoder()
const LOG = console.log

// ---------------------------------------------------------------------------

const isDir = (path: string): boolean => {

	try {
		stats = statSync(path)
		return stats.isDirectory
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
// --- sanity check

assert(existsSync('./compileall.civet'))
assert(existsSync('src'))
assert(existsSync('civetconfig.json'))
assert(existsSync('.gitignore'))

// ---------------------------------------------------------------------------

type TMaps = {
	[key: string]: RawSourceMap
	}

const getSourceMaps = async (path: string): AutoPromise<TMaps> => {

	try {
		const {default: data} = await import(path, {with: {type: 'json'}})
			// --- Or 'assert: { type: "json" }' depending on Deno version
		return data as TMaps
	}
	catch (err) {
		return {}
	}
}

// ---------------------------------------------------------------------------

const centered = (
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

const normalizePath = (path: string): string => {

	return path.replace(/^c:/, 'C:').replaceAll('\\', '/')
}

// ---------------------------------------------------------------------------

const addSourceMap = (path: string, hSrcMap: RawSourceMap): void => {

	hSourceMaps[path] = hSrcMap
	return
}

// ---------------------------------------------------------------------------

const extractSourceMap = (
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
// ASYNC - just returns true or false, stdout & stderr 'inherit'

export const execCmd = async (
		cmdName: string,
		lArgs: string[] = []
		): AutoPromise<boolean> => {

	const cmd = new Deno.Command(cmdName, {args: lArgs})
	const child = cmd.spawn()
	const {success} = await child.status
	return success
}

// ---------------------------------------------------------------------------

const hGlobOptions = {
	exclude: [
		'src/temp/*',
		'src/save/*',
		'src/test/**/*'
		]
	}

const allFiles = async function*(): AsyncGenerator<string, void, void> {
	const path = Deno.args[0]
	if (path) {
		assert(existsSync(path))
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

const t0 = Date.now()
const hSourceMaps: TMaps = await getSourceMaps(sourceMapPath)

// --- Add to this list as files are successfully compiled
type TRecord = [string, string]   // [<TS filename>, <TS code>]
let lToTypeCheck: TRecord[] = []

let numFiles = 0, numCompiled = 0, numFailed = 0
for await (const path of allFiles()) {
	numFiles += 1
	const civetPath = normalizePath(resolve('.', path))
	const relPath = relative('.', civetPath)
	const destPath = civetPath.replace('.civet', '.ts')
	const relDestPath = relative('.', destPath)
	try {
		assert(existsSync(civetPath), `   No such file: ${relPath}`)
		assert(civetPath.endsWith('.civet'), `   Not a civet file: ${relPath}`)

		if (existsSync(destPath)
				&& (statSync(destPath).mtimeMs >= statSync(civetPath).mtimeMs)
				&& (destPath in hSourceMaps)
				) {
			continue
		}

		LOG(centered(relPath))
		LOG(`   destPath = ${relDestPath}`)

		// --- log info about why file had to be compiled
		if (!existsSync(destPath)) {
			LOG(`   destPath ${relDestPath} does not exist`)
		}
		if (statSync(destPath).mtimeMs < statSync(civetPath).mtimeMs) {
			LOG(`    ${relDestPath} is older than ${relPath}`)
		}
		if (!(civetPath in hSourceMaps)) {
			LOG(`    there is no source map for ${relDestPath}`)
		}

		const civetCode = await Deno.readTextFile(civetPath)
		const tsCode: string = await compile(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: civetPath
			})
		assert(tsCode && !tsCode.startsWith('COMPILE FAILED'),
			`CIVET COMPILE FAILED: ${relPath}`)
		LOG("   compile succeeded")
		numCompiled += 1
		lToTypeCheck.push([destPath, tsCode])
	}

	catch (err) {
		LOG(`${red('ERROR')} in ${relDestPath}:\n${err}`)
		numFailed += 1
		continue
	}
}

// --- If any files failed to compile, there's no point
//     to type checking because it will probably fail

if (numFailed > 0) {
	LOG(red(`${numFailed} files failed to compile`))
	Deno.exit(-1)
}

// --- type check files that were compiled
//     tsCode will include the inline source map

numFailed = 0
for (const [destPath, tsCode] of lToTypeCheck) {
	const relDestPath = relative('.', destPath)
	try {

		const [code, hSrcMap] = extractSourceMap(tsCode)
		assert((hSrcMap !== undefined), "No source map found in file")
		const encoded = encoder.encode(code)

		// --- Unfortunately, we have to write the code to a file
		//     in order to type check it :-(

		const tempPath = 'src/temp/_tempcode_.ts'
		await Deno.writeFile(tempPath, encoded)
		const success = await execCmd('deno', ['check', tempPath])
//		if not success
//			console.log "#{red('ERROR ERROR ERROR')}"
		assert(success, `type check failed for ${relDestPath}`)

		await Deno.writeFile(destPath, encoded)
		LOG("   TS file written")
		LOG("   type check OK")
		LOG(`   adding source map for ${relDestPath}`)
		addSourceMap(destPath, hSrcMap)
	}

	catch (err) {
		LOG(`${red('ERROR')} in ${relDestPath}:\n${err}`)
		numFailed += 1
		continue
	}
}

if (numFailed > 0) {
	LOG(red(`${numFailed} files failed to compile`))
}
else {
	if (numCompiled > 0) {
		// --- Save source maps
		LOG(`saving ${numCompiled} source maps`)
		await Deno.writeTextFile(
			sourceMapPath,
			JSON.stringify(hSourceMaps, null, 3)
			)
	}
	const secs = (Date.now() - t0) / 1000
	LOG(`DONE in ${sprintf('%.2d', secs)} secs.`)
}
