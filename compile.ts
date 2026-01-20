"use strict";
// compile.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {assert} from "jsr:@std/assert"
import {compile} from 'npm:@danielx/civet'
import {existsSync} from 'jsr:@std/fs'
import {statSync} from 'node:fs'
import {resolve, relative} from 'jsr:@std/path'
import {RawSourceMap, SourceMapConsumer} from 'npm:source-map'

import hCivetConfig from "civetconfig" with { type: "json" }
import data from "sourcemap" with { type: "json" }

type TMaps = {
	[key: string]: RawSourceMap
	}
const hSourceMaps: TMaps = data as TMaps

const encoder = new TextEncoder()

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

// console.dir hSourceMaps, {depth: null}

for (const arg of Deno.args) {
	const path = normalizePath(resolve('.', arg))
	console.log(relative('.', path))
	try {
		assert(existsSync(path), `   No such file: ${path}`)
		assert(path.endsWith('.civet'), `   Not a civet file: ${path}`)
		const destPath = path.replace('.civet', '.ts')
		console.log(`   destPath = ${relative('.', destPath)}`)

		if (existsSync(destPath)
				&& (statSync(destPath).mtimeMs >= statSync(path).mtimeMs)
				&& (destPath in hSourceMaps)
				) {
			console.log("   already compiled")
			continue
		}
		else {
			if (!existsSync(destPath)) {
				console.log(`   destPath ${destPath} does not exist`)
			}
			if (statSync(destPath).mtimeMs < statSync(path).mtimeMs) {
				console.log("    destPath is older than path")
			}
			if (!(path in hSourceMaps)) {
				console.log("    there is no source map for path")
			}
		}

		const civetCode = await Deno.readTextFile(path)
		const tsCode: string = await compile(civetCode, {
			...hCivetConfig,
			inlineMap: true,
			filename: path
			})
		if (!tsCode || tsCode.startsWith('COMPILE FAILED')) {
			console.log(`CIVET COMPILE FAILED: ${path}`)
			continue
		}

		console.log("   compile succeeded")
		const [code, hSrcMap] = extractSourceMap(tsCode)
		await Deno.writeFile(destPath, encoder.encode(code))
		console.log("   TS file written")

		const success = await execCmd('deno', ['check', destPath])
		if (success) {
			console.log("   type check OK")
		}
		else {
			console.log("   type check failed")
			continue
		}

		if (hSrcMap === undefined) {
			console.log("   No source map found")
		}
		else {
			console.log(`   adding source map for ${destPath}`)
//			console.dir hSrcMap, {depth: null}
			addSourceMap(destPath, hSrcMap)
		}
	}

	catch (err) {
		console.log(`ERROR: ${err} for ${arg}`)
		continue
	}
}

// --- Save source maps
console.log("saving source maps")
// console.dir hSourceMaps, {depth: null}
await Deno.writeTextFile('./sourcemap.json', JSON.stringify(hSourceMaps, null, 3))
console.log("DONE")
