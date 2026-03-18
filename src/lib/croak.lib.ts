"use strict";
// croak.lib.civet

import {red} from '@std/fmt/colors'

type hash = {
	[key: string | symbol]: unknown
	}

export let onlyThrow = false

// ---------------------------------------------------------------------------

export const justThrow = (flag: boolean): void => {

	onlyThrow = flag
	return
}

// ---------------------------------------------------------------------------

export const normalizePath = (path: string): string => {

	const newpath = path.replaceAll('\\', '/')
	if (newpath.charAt(1) === ':') {
		return newpath.charAt(0).toUpperCase() + newpath.substring(1)
	}
	else {
		return newpath
	}
}

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
	type: string
	source: string        // relative file path or 'unknown'
	line: number
	col: number
	name: string          // name of function or method
	}

// ---------------------------------------------------------------------------

export type TFrameFilter = (frame: TStackFrame) => boolean

// ---------------------------------------------------------------------------

export const defaultFilter = (frame: TStackFrame): boolean => {

	const {source, type, name} = frame
	return (
		   !source.match(/croak\.lib\.(?:civet|ts)/)
		&& ((type !== 'method') || ((name !== 'next') && (name !== 'from')))
		)
}

// ---------------------------------------------------------------------------

export const dumpFrame = (
		frame: TStackFrame,
		i: number,
		): void => {

	const {type, source, line, col, name} = frame
	console.log(`FRAME[${i}]: ${type} ${name} ${source}:${line}:${col}`)
	return
}

// ---------------------------------------------------------------------------

// --- by default, ignores any stack frames from this module
//     files will be mapped to original source files
//        if a source map is available

export const allStackFrames = function*(
		hOptions: hash = {}
		): Generator<TStackFrame> {

	const trace = hOptions.trace || false
	const filter = defaultFilter

	try {
		// @ts-ignore
		const oldLimit = Error.stackTraceLimit
		// @ts-ignore
		const oldPreparer = Error.prepareStackTrace
		// @ts-ignore
		Error.stackTraceLimit = 99

		let prevFrame: (TStackFrame | undefined) = undefined

		// @ts-ignore
		Error.prepareStackTrace = (error, lOrgFrames) => {

			const results=[];let i1 = 0;for (const orgFrame of lOrgFrames) {const i = i1++;
				const fileName = orgFrame.getFileName()
				if (!fileName) {
					continue
				}

				const functionName = orgFrame.getFunctionName()
				const methodName = orgFrame.getMethodName()
				const frame: TStackFrame = {
					type: (
						  orgFrame.isEval()        ? 'eval'
						: orgFrame.isNative()      ? 'native'
						: orgFrame.isConstructor() ? 'constructor'
						: methodName               ? 'method'
						: functionName             ? 'function'
						: orgFrame.isToplevel()    ? 'script'
						:                            'unknown'
						),
					source: normalizePath(fileName),
					line :  orgFrame.getLineNumber(),
					col:    orgFrame.getColumnNumber(),
					name:   functionName || methodName || ''
					}

				// --- fix a bug in the V8 engine where calls inside a
				//     top level anonymous function is reported as
				//     being of type 'script'

				if (prevFrame) {
					if ((frame.type === 'script') && (prevFrame.type === 'script')) {
						prevFrame.type = 'function'
						prevFrame.name = '<anon>'
					}
				}

				if (trace) {
					const {type, source, line, col, name} = frame
					console.log(`${type} ${name} ${source}:${line}:${col}`)
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

		for (const frame of lStack) {
			if (filter(frame)) {
				yield frame
			}
		}
		return
	}

	catch (err) {
		console.error(`${red('ERROR')} ${err}`)
		return
	}
}

// ---------------------------------------------------------------------------

type TNeverFunc = (errMsg: string) => never;

export const croak: TNeverFunc = (errMsg: string): never => {

	if (onlyThrow) {
		throw new Error(errMsg)
	}
	else {
		console.error(red('CROAK') + ': ' + errMsg)
		for (const {type, name, line} of allStackFrames()) {
			console.log(`   ${type} ${name}:${line}`)
		}
		Deno.exit()
	}
}

