"use strict";
// v8-stack.lib.civet

import {sprintf} from 'jsr:@std/fmt/printf'
import {CallSite} from 'npm:@types/node'

import {
	undef, defined, notdefined, assert, croak,
	isEmpty, nonEmpty, hash, isString,
	isNonEmptyString, isInteger, assertIsDefined,
	} from 'datatypes'
import {f, sep, rpad, getOptions, getErrStr} from 'llutils'
import {OL, ML, DUMP} from 'to-nice'
import {pushLogLevel, popLogLevel} from 'logger'
import {DBG, LOG} from 'logger'
import {
	isFile, mkpath, fileExt, withExt, normalizePath, relpath,
	} from 'fsys'
import {
	hSourceMaps, TFilePos, mapSourcePos, haveSourceMapFor,
	} from 'source-map'

// ---------------------------------------------------------------------------

export type TFrameType = (
	'eval' |
	'native' |
	'constructor' |
	'method' |
	'function' |
	'script' |
	'unknown'
	)

export type TStackFrame = {
	type?: string

	source: string      // source file name or 'unknown'
	line: number
	col: number

	org_source?: string      // source file name
	org_line?: number
	org_col?: number
	errMsg?: string       // reason mapping failed, if applicable

	functionName: string
	methodName: string

	isTopLevel: boolean
	isConstructor: boolean
	isAsync: boolean
	isEval: boolean
	isNative: boolean
	}

// ---------------------------------------------------------------------------

const fixPath = (source: string): string => {

	// --- Find position of instances of 'src'
	const lPos: number[] = []
	const lParts = source.split(/[\\\/]/)
	let i1 = 0;for (const word of lParts) {const i = i1++;
		if (word === 'src') {
			lPos.push(i)
		}
	}
	if (lPos.length > 1) {
		assert((lPos.length === 2), `Too many 'src's: ${lPos.length}`)
		const pos = lPos[1]
		return [
			...lParts.slice(0, pos),
			...lParts.slice(pos+2)
			].join('/')
	}
	else {
		return source
	}
}

// ---------------------------------------------------------------------------

const frameInThisLib = (frame: TStackFrame): boolean => {

	const {source} = frame
	return defined(source) &&
		defined(source.match(/\bv8-stack\.lib\.[^.]+$/))
}

// ---------------------------------------------------------------------------

export const dumpFrame = (
		frame: TStackFrame,
		i: (number | undefined) = undef,
		label: string = 'FRAME'
		): void => {

	const {type, source, line, col, org_source, org_line, org_col,
		functionName, methodName,
		isTopLevel, isConstructor, isAsync, isEval, isNative} = frame

	const lLines = [`type: ${type}`, `source: ${source}`]

	const addIfDefined = (label: string, value: unknown) => {
		if (defined(value)) {
			lLines.push(`${label}: ${OL(value)}`)
		}
	}

	const addIfTrue = (label: string, value: unknown) => {
		if (value) {
			lLines.push(`${label}: ${OL(value)}`)
		}
	}

	addIfDefined('line', line)
	addIfDefined('col', col)
	addIfDefined('org_source', org_source)
	addIfDefined('org_line', org_line)
	addIfDefined('org_col', org_col)
	addIfDefined('functionName', functionName)
	addIfDefined('methodName', methodName)

	addIfTrue('isTopLevel', isTopLevel)
	addIfTrue('isConstructor', isConstructor)
	addIfTrue('isAsync', isAsync)
	addIfTrue('isEval', isEval)
	addIfTrue('isNative', isNative)

	const block = lLines.join('\n')
	DUMP(block, label + (defined(i) ? `[${i}]` : ''))
	return
}

// ---------------------------------------------------------------------------
// --- return true to keep

export type TFrameFilter = (frame: TStackFrame) => boolean

const defaultFilter: TFrameFilter = (frame) => {

	return !frameInThisLib(frame) && (frame.source !== 'unknown')
}

// ---------------------------------------------------------------------------

// --- ignores any stack frames from this module
//     files will be mapped to original source files
//        if a source map is available

export const allStackFrames = function*(
		hOptions: hash = {}
		): Generator<TStackFrame, void, void> {

	type opt = {
		debug: boolean
		useSourceMap: boolean
		filter: TFrameFilter
		}
	const {debug, useSourceMap, filter} = getOptions<opt>(hOptions, {
		debug: false,
		useSourceMap: true,
		filter: defaultFilter
		})

	try {
		// @ts-ignore
		const oldLimit = Error.stackTraceLimit
		// @ts-ignore
		const oldPreparer = Error.prepareStackTrace
		// @ts-ignore
		Error.stackTraceLimit = Infinity

		// @ts-ignore
		Error.prepareStackTrace = (error, lOrgFrames) => {

			let prevFrame: (TStackFrame | undefined) = undef

			const results=[];let i2 = 0;for (const orgFrame of lOrgFrames) {const i = i2++;
				const fileName = orgFrame.getFileName()
				const source: string = fileName ? normalizePath(fileName) : 'unknown'
				if (source !== 'unknown') {
					assert(isFile(source), `No such file: ${source}`)
					assert(!source.includes('\\ext'))
				}

				const frame: TStackFrame = {
					type:          undef,
					source,
					line :         orgFrame.getLineNumber(),
					col:           orgFrame.getColumnNumber(),
					functionName:  orgFrame.getFunctionName(),
					methodName:    orgFrame.getMethodName(),

					isTopLevel:    orgFrame.isToplevel(),
					isConstructor: orgFrame.isConstructor(),
					isAsync:       orgFrame.isAsync(),
					isEval:        orgFrame.isEval(),
					isNative:      orgFrame.isNative()
					}
				frame.type = (
					  frame.isEval        ? 'eval'
					: frame.isNative      ? 'native'
					: frame.isConstructor ? 'constructor'
					: frame.methodName    ? 'method'
					: frame.functionName  ? 'function'
					: frame.isTopLevel    ? 'script'
					:                       'unknown'
					)
				if (frame.type === 'script') {
					frame.functionName = ''
					frame.methodName = ''
				}

				// --- fix a bug in the V8 engine where calls inside a
				//     top level anonymous function is reported as
				//     being of type 'script'

				if (defined(prevFrame)) {
					if ((frame.type === 'script') && (prevFrame.type === 'script')) {
						DBG("Patch current TOS")
						prevFrame.type = 'function'
						prevFrame.functionName = '<anon>'
					}
				}

				if (useSourceMap) {
					try {
						const h = mapSourcePos(frame, {debug})
						if (defined(h)) {
							frame.org_source = frame.source
							frame.org_line   = frame.line
							frame.org_col    = frame.col
							frame.source     = h.source || 'unknown'
							frame.line       = h.line
							frame.col        = h.col
						}
					}
					catch (err) {
						const msg = getErrStr(err)
						if (debug) {
							console.log(`MAP ERROR: ${msg}`)
						}
						frame.errMsg = msg
					}
				}
				if (debug) {
					dumpFrame(frame, i)
				}
				prevFrame = frame
				results.push(frame)
			};const lFrames: TStackFrame[] =results

			return lFrames
		}

		// --- This kicks everything off
		const errObj = new Error()

		// @ts-ignore - because errObj.stack will be an array
		const lStack: TStackFrame[] = errObj.stack

		// --- reset to previous values
		// @ts-ignore
		Error.stackTraceLimit = oldLimit
		// @ts-ignore
		Error.prepareStackTrace = oldPreparer

		for (const frame of lStack) {
			if (filter(frame)) {
				yield frame
			}
		}
		return
	}

	catch (e) {
		LOG(getErrStr(e))
		return
	}
}

// ---------------------------------------------------------------------------

export const getV8Stack = (
		hOptions: hash = {}
		): TStackFrame[] => {

	return Array.from(allStackFrames(hOptions))
}

// ---------------------------------------------------------------------------

export const getV8StackStr = (lStack: ((TStackFrame[]) | undefined) = undef): string => {

	if (notdefined(lStack)) {
		lStack = getV8Stack()
	}

	const lLines = lStack.map((h) => {
		const {type, functionName, methodName, source, line, col} = h
		const name = functionName || methodName || ''
		const nameStr = (name ? `${type} ${name}` : type)
		const lineStr = f`${line}:3`
		const colStr = f`${col}:3`
		const sourceStr = [
			f`${relpath(source)}:32`,
			f`${line}:3`,
			f`${col}:3`
			].join(':')
		return f`[${nameStr}:18] ${sourceStr}`
	})
	return lLines.join('\n')
}

// ---------------------------------------------------------------------------

export const getMyCaller = (): (TStackFrame | undefined) => {

	// --- First frame will be where this was called from
	//     Second frame will be who called that
	let i3 = 0;for (const frame of allStackFrames()) {const i = i3++;
		if (i === 1) {
			return frame
		}
	}
	return undef
}

// ---------------------------------------------------------------------------

export const getMyOutsideCaller = (
		hOptions: hash = {}
		): (TStackFrame | undefined) => {

	// --- First frame will be where this was called from
	//     Save that source and return next frame with a different source
	//     All frames will have a defined and existing source
	let source: string = ''
	let i4 = 0;for (const frame of allStackFrames()) {const i = i4++;
		if (i === 0) {
			assertIsDefined(frame.source)
			source = frame.source
		}
		else {
			if (frame.source !== source) {
				return frame
			}
		}
	}
	return undef
}
