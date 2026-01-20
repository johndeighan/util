"use strict";
// source-map.lib.civet

import {parse as parseFilePath} from 'node:path'
import {existsSync} from 'jsr:@std/fs'
import {
	RawSourceMap, SourceMapConsumer,
	} from 'npm:source-map'              // was source-map-sync

import {
	undef, assert, assertIsDefined, defined, notdefined, hash, croak,
	} from 'datatypes'
import {
	getOptions, THashEntry, TEntryFilter, filterHash,
	} from 'llutils'
import {OL, DUMP} from 'to-nice'
import {
	fromJsonFile, parsePath, mkpath, normalizePath, relpath,
	} from 'fsys'

// --- Get info about all known source maps
export const hSourceMaps = fromJsonFile('./sourcemap.json')

// ---------------------------------------------------------------------------

export const haveSourceMapFor = (path: (string | undefined)): boolean => {

	if (defined(path)) {
		assert(!path.includes('\\'), "Path not normalized")
		return defined(hSourceMaps[path])
	}
	else {
		return false
	}
}

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

export const extractSourceMap = (
		contents: string
		): [string, RawSourceMap?] => {

	const lMatches = contents.match(/^(.*)\/\/\#\s+sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/s)
	if (notdefined(lMatches)) {
		return [contents, undef]
	}
	assert(defined(lMatches), "Missing source map")
	const code = lMatches[1].trim()
	const hSrcMap = JSON.parse(atob(lMatches[2].trim())) as RawSourceMap
	const {file} = hSrcMap
	assert(defined(file), "File not defined in source map")
	hSrcMap.file = normalizePath(file.replace('.tsx', '.ts'))
	const results=[];for (const path of hSrcMap.sources) {
		results.push(normalizePath(path))
	};hSrcMap.sources = results
	return [code, hSrcMap]
}

// ---------------------------------------------------------------------------

export const decodeLine = (line: string): number[][] => {

	if (line === '') {
		return []
	}

	return (()=>{const results1=[];for (const token of line.split(',')) {
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
		results1.push(lOutput)
	}return results1})()
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

	let hSrcMap = hSourceMaps[path] as RawSourceMap
	assert(defined(hSrcMap), `Not found in source map: ${path}`)
	const {version, sources, mappings, names} = hSrcMap
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