"use strict";
// v8-stack.lib.civet

import {sprintf} from '@std/fmt/printf'
import {CallSite} from 'npm-@types/node'

import {
	undef, defined, notdefined, assert, croak,
	isEmpty, nonEmpty, hash, isString, getErrStr,
	isNonEmptyString, isInteger, assertIsDefined,
	} from 'datatypes'
import {f, sep, rpad, getOptions} from 'llutils'
import {OL, ML, DUMP} from 'to-nice'
import {
	LOG, DBG, ERR, pushLogLevel, popLogLevel,
	} from 'logger'
import {
	isFile, fileExt, withExt, normalizePath, relpath,
	} from 'fsys'
import {mapSourcePos} from 'source-map'

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

	source: string        // relative file path or 'unknown'
	line: number
	col: number
	name: string          // name of function or method

	org_source?: string   // original source file name
	org_line?: number
	org_col?: number
	errMsg?: string       // reason mapping failed, if applicable

	isTopLevel: boolean
	isConstructor: boolean
	isAsync: boolean
	isEval: boolean
	isNative: boolean
	}

// ---------------------------------------------------------------------------

export type TFrameFilter = (frame: TStackFrame) => boolean

// ---------------------------------------------------------------------------

export const dumpFrame = (
		frame: TStackFrame,
		i: number,
		filter: TFrameFilter
		): void => {

	const {type, source, line, col, name, org_source, org_line, org_col,
		isTopLevel, isConstructor, isAsync, isEval, isNative} = frame

	const lLines = [
		`type: ${OL(type)}`,
		`source: ${OL(source)}`
		]

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
	addIfDefined('name', name)

	addIfTrue('isTopLevel', isTopLevel)
	addIfTrue('isConstructor', isConstructor)
	addIfTrue('isAsync', isAsync)
	addIfTrue('isEval', isEval)
	addIfTrue('isNative', isNative)
	lLines.push(`filter: ${filter(frame)}`)

	const block = lLines.join('\n')

	const label = `FRAME[${i}]`
	DUMP(block, f`${label}:{red}`)
	return
}

// ---------------------------------------------------------------------------
// --- return true to keep

const defaultFilter: TFrameFilter = (frame) => {

	const {type, source, name} = frame
	if (
			   (type === 'method')
			&& !source
			&& ['next','from'].includes(name)
			) {
		return false
	}
	return !source.includes('v8-stack.lib')
}

// ---------------------------------------------------------------------------

// --- by default, ignores any stack frames from this module
//     files will be mapped to original source files
//        if a source map is available

export const allStackFrames = function*(
		hOptions: hash = {}
		): Generator<TStackFrame> {

	type opt = {
		trace: boolean
		useSourceMap: boolean
		filter: TFrameFilter    // keep if returns true
		}
	const {trace, useSourceMap, filter} = getOptions<opt>(hOptions, {
		trace: false,
		useSourceMap: true,
		filter: defaultFilter
		})

	try {
		// @ts-ignore
		const oldLimit = Error.stackTraceLimit
		// @ts-ignore
		const oldPreparer = Error.prepareStackTrace
		// @ts-ignore
		Error.stackTraceLimit = 99

		let prevFrame: (TStackFrame | undefined) = undef

		// @ts-ignore
		Error.prepareStackTrace = (error, lOrgFrames) => {

			const results=[];let i1 = 0;for (const orgFrame of lOrgFrames) {const i = i1++;
				const fileName = orgFrame.getFileName()
				const functionName = orgFrame.getFunctionName()
				const methodName = orgFrame.getMethodName()
				const name = functionName || methodName || ''
				const source = fileName
				const frame: TStackFrame = {
					type:          undef,
					source,
					line :         orgFrame.getLineNumber(),
					col:           orgFrame.getColumnNumber(),
					name,

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
					: methodName          ? 'method'
					: functionName        ? 'function'
					: frame.isTopLevel    ? 'script'
					:                       'unknown'
					)
				// --- fix a bug in the V8 engine where calls inside a
				//     top level anonymous function is reported as
				//     being of type 'script'

				if (defined(prevFrame)) {
					if ((frame.type === 'script') && (prevFrame.type === 'script')) {
						DBG("Patch current TOS")
						prevFrame.type = 'function'
						prevFrame.name = '<anon>'
					}
				}

				if (source && useSourceMap) {
					const h = mapSourcePos(frame)
					if (defined(h)) {
						frame.org_source = relpath(frame.source)
						frame.org_line   = frame.line
						frame.org_col    = frame.col
						frame.source     = relpath(h.source)
						frame.line       = h.line
						frame.col        = h.col
					}
				}
				if (trace) {
					dumpFrame(frame, i, filter)
				}
				prevFrame = frame
				results.push(frame)
			};const lFrames: TStackFrame[] =results

			return lFrames
		}

		const obj: hash = {}
		Error.captureStackTrace(obj)
		// @ts-ignore
		const lStack: TStackFrame[] = obj.stack

		// --- reset to previous values
		// @ts-ignore
		Error.stackTraceLimit = oldLimit
		// @ts-ignore
		Error.prepareStackTrace = oldPreparer

		if (lStack.length === 0) {
			debugger
		}
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
		const {type, name, source, line, col} = h
		const nameStr = (name ? `${type} ${name}` : type)
		const lineStr = f`${line}:3`
		const colStr = f`${col}:3`
		const sourceStr = [
			f`${source}:32`,
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
	let i2 = 0;for (const frame of allStackFrames()) {const i = i2++;
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
	const filter = (frame: TStackFrame): boolean => {
		return true
	}
	let source: string = ''
	const lFrames = Array.from(allStackFrames({filter}))
	let i3 = 0;for (const frame of lFrames) {const i = i3++;
		if (!source) {
			if (frame.source && !frame.source.includes('v8-stack')) {
				source = frame.source
			}
		}
		else {
			if (frame.source !== source) {
				return frame
			}
		}
	}

	ERR("NO OUTSIDE CALLER FOUND")
	DUMP(lFrames, 'STACK')
	return undef
}

