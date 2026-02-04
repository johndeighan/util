"use strict";
// source-map.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {parse as parseFilePath} from 'node-path'
import {existsSync} from '@std/fs'
import {SourceMapConsumer} from 'npm-source-map'

import {
	undef, assert, defined, notdefined, hash, croak,
	assertIsDefined, assertIsString,
	} from 'datatypes'
import {
	getOptions, THashEntry, TEntryFilter, filterHash,
	} from 'llutils'
import {OL, DUMP} from 'to-nice'
import {
	fromJsonFile, parsePath, mkpath, normalizePath, relpath,
	toFullPath,
	} from 'fsys'

// --- Get info about all known source maps
const sourceMapPath = './sourcemap.json'

// ---------------------------------------------------------------------------

export type RawSourceMap = {
	version: number;        // The version of the source map spec (usually 3)
	file: string;           // The generated file this map is associated with
	sources: string[];      // Array of URLs to the original source files
	names: string[];        // Array of identifiers (names) used in the mappings
	sourceRoot?: string;    // Optional: URL root for the sources
	sourcesContent?: string[]; // Optional: Content of the original source files
	mappings: string;       // The actual encoded mappings (Base64 VLQ)
	}

// ---------------------------------------------------------------------------
// --- This allows the file to be missing

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

export const filePosStr = (h: TFilePos): string => {

	const {source, line, col} = h
	if (defined(source)) {
		const fileName = parsePath(source).fileName
		return `${fileName}:${line}:${col}`
	}
	else {
		return `unknown:${line}:${col}`
	}
}

// ---------------------------------------------------------------------------

export const decodeLine = (line: string): number[][] => {

	if (line === '') {
		return []
	}

	return (()=>{const results=[];for (const token of line.split(',')) {
		const lOutput: number[] = []
		let i = 0
		while (i < token.length) {
			let v = 0, d = atob("AAA" + token[i]).charCodeAt(2)
			i += 1
			v |= (d & 31)          // put lowest 5 bits of d into v
			let shift = 5
			while (d & 32) {         // repeat if high bit of d is set
				d = atob("AAA" + token[i]).charCodeAt(2)
				i += 1
				v |= (d & 31) << shift   // put lowest 5 bits of d into v
				shift += 5
			}
			lOutput.push(v & 1 ? -(v >> 1) : v >> 1)
		} // low bit is sign
		results.push(lOutput)
	}return results})()
}

// ---------------------------------------------------------------------------

export const getMappings = (
		data: string,
		): number[][] => {

	const lMappings: number[][] = []
	var sum: number[] = [0, 0, 0, 0]
	let i1 = 0;for (const line of data.split(";")) {const lineNum = i1++;
		sum[0] = 0
		decodeLine(line).forEach((p) => {
			for (let end1 = p.length, i2 = 0, asc = 0 <= end1; asc ? i2 < end1 : i2 > end1; asc ? ++i2 : --i2) {const i = i2;
				sum[i] += p[i]
			}
			lMappings.push([lineNum, sum[0], sum[1], sum[2], sum[3]])
		})
	}
	return lMappings
}

// ---------------------------------------------------------------------------

type TOrgPos = [fileNum: number, line: number, col: number]
type TCompareResult = -1 | 0 | 1

const compare = (
		find: [number, number],
		gen:  [number, number]
		): TCompareResult => {

	return (
		  (find[0] < gen[0]) ? -1
		: (find[0] > gen[0]) ?  1
		: (find[1] < gen[1]) ? -1
		: (find[1] > gen[1]) ?  1
		:                       0
		)
}

export const orgPos = (
		lMappings: number[][],
		findLine: number,
		findCol: number
		): TOrgPos => {

	assert((lMappings.length > 0), "Empty mappings array")
	let pos = 0, end = lMappings.length - 1
	while (pos <= end) {

		// --- Calculate the middle index
		const mid = Math.floor((pos + end) / 2)
		const [genLine, genCol, orgFile, orgLine, orgCol] = lMappings[mid]
		switch(compare([findLine, findCol], [genLine, genCol])) {
			case 0: {
				return [orgFile, orgLine, orgCol]
			}
			case -1: {
				end = mid - 1;;break;
			}
			case 1: {
				pos = mid + 1;;break;
			}
		}
	}

	// --- If the loop finishes, the target is not in the array
	if (pos < lMappings.length) {
		const usePos = (pos === 0) ? pos : pos-1
		const [genLine, genCol, orgFile, orgLine, orgCol] = lMappings[usePos]
		return [orgFile, orgLine, orgCol]
	}
	else {
		const last = lMappings.at(-1)
		assertIsDefined(last)
		const [genLine, genCol, orgFile, orgLine, orgCol] = last
		return [orgFile, orgLine, orgCol]
	}
}

// ---------------------------------------------------------------------------

type TStrictFilePos = {
	source: (string | undefined)
	line: number
	col: number
	}

export type TFilePos = TStrictFilePos & {
	[key: string | symbol]: unknown
	}

export const mapSourcePos = (
		h: TFilePos,
		hOptions: hash = {}
		): TFilePos => {

	type opt = {
		debug: boolean
		}
	const {debug} = getOptions<opt>(hOptions, {
		debug: false
		})

	const {source, line, col} = h

	assert(source, "EMPTY source in mapSourcePos")
	assert((source !== 'unknown'), "unknown source in mapSourcePos")
	assert(existsSync(source), `No such file: ${source}`)

	const path = mkpath(source)
	if (debug) {
		console.log(`Search for key ${path} in sourcemap.json`)
	}

	const hSrcMap: RawSourceMap = hSourceMaps[path] as RawSourceMap
	assert(defined(hSrcMap), `Not found in source map: ${path}`)
	// @ts-ignore
	const {version, sources, mappings, names} = hSrcMap as RawSourceMap
	assert((version === 3), `Bad version: ${version}`)
	const lMappings = getMappings(mappings)
	const [fileNum, srcLine, srcCol] = orgPos(lMappings, line, col)

//	# --- Use the with() helper for automatic consumer handling
//	let newSource, newLine, newCol
//	SourceMapConsumer.with hSrcMap, null, (consumer) =>
//		# --- Find the original position
//		{
//			source: newSource,
//			line: newLine,
//			column: newCol
//			} = consumer.originalPositionFor {line, column: col}

//	assert defined(newLine), "OPF returned line #{newLine}"
//	assert defined(newCol), "OPF returned #{newCol}"
//	assert defined(newSource), "OPF returned source #{newSource}"

	if (debug) {
		console.log(`   FOUND: ${source}`)
	}
	return {
		source: sources[fileNum],
		line: srcLine,
		col: srcCol
		}
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
	const results1=[];for (const path of hSrcMap.sources) {
		results1.push(normalizePath(path))
	};hSrcMap.sources = results1
	return [code, hSrcMap]
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
// ASYNC

export const saveSourceMaps = async (): AutoPromise<void> => {

	await Deno.writeTextFile(
		sourceMapPath,
		JSON.stringify(hSourceMaps, null, 3)
		)
	return
}