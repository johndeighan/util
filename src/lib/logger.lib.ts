"use strict";
// logger.lib.civet

import {existsSync, ensureDirSync} from 'jsr:@std/fs'
import {LogLevels} from 'jsr:@std/log/levels'
import {
	ConsoleHandler, FileHandler, setup, getLogger, LogRecord,
	} from 'jsr:@std/log'
import {blue, black} from 'jsr:@std/fmt/colors'

import {decode} from 'llutils'
import {getPrefix} from 'unicode'
import {
	undef, defined, notdefined, hash, isString, nonEmpty, croak, assert,
	} from 'datatypes'
import {
	spaces, o, sinceLoadStr, pass, sep, encode,
	} from 'llutils'
import {OL, ML} from 'to-nice'
import {
	TLogLevel, isLogLevel, getLogLevel, setLogLevel,
	pushLogLevel, popLogLevel, resetLogLevel, isInactiveLevel,
	} from 'log-levels'
import {
	getFormatter, indentLog, undentLog,
	getConsoleLog, clearConsoleLog, logIndent
	} from 'log-formatter'

export {
	getLogLevel, isLogLevel, setLogLevel, pushLogLevel, popLogLevel,
	indentLog, undentLog, clearConsoleLog, getConsoleLog,
	}

export type {TLogLevel}
ensureDirSync('./logs')

// ---------------------------------------------------------------------------

const mainModule: string = new URL(Deno.mainModule).pathname.slice(1)
const logFileName = ( () => {
	const lMatches = mainModule.match(/[A-Za-z0-9_\-\.]+$/)
	if (lMatches === null) {
		return "logs/dummy.log"
	}
	const label = lMatches[0].replaceAll('.', '_')
	const time = new Date().toISOString().replaceAll(':', '-')
	return `logs/${label} ${time}.log`
}
)()

// ---------------------------------------------------------------------------

export const getLog = (from: string): string => {
	switch(from) {
		case 'console':
			return getConsoleLog()
		case 'file':
			if (existsSync(logFileName)) {
				const data = Deno.readFileSync(logFileName)
				return decode(data)
			}
			else {
				return ''
			}
		default:
			croak(`getLog(): invalid from = ${from}`)
			return ''
	}
}

// ---------------------------------------------------------------------------

export const clearLog = (which: string): void => {
	switch(which) {
		case 'console': {
			clearConsoleLog();break;
		}
		case 'file': {
			const encoder = new TextEncoder()
			const str = encode('')
			Deno.writeFileSync(logFileName, str);break;
		}
		case 'both': {
			clearConsoleLog()
			const str = encode('')
			Deno.writeFileSync(logFileName, str);break;
		}
		default:
			pass()
	}
	return
}

// ---------------------------------------------------------------------------

const hConfig: hash = {
	handlers: {
		console: new ConsoleHandler('DEBUG', {
			formatter: getFormatter('$msg', 'console')
		}
			),
		file: new FileHandler('DEBUG', {
			filename: logFileName,
			mode: 'a',
			formatter: getFormatter('$ll $msg', 'file')
		}
			),
		console_prof: new ConsoleHandler('DEBUG', {
			formatter: getFormatter('[$ts] $msg', 'console')
		}
			),
		file_prof: new FileHandler('DEBUG', {
			filename: logFileName,
			mode: 'a',
			formatter: getFormatter('[$ts] $ll $msg', 'file')
		}
			)
		},

	// --- assign handlers to loggers
	//     order from most verbose to least verbose
	loggers: {
		profile: {
			level: "DEBUG",
			num: 1,
			handlers: ["console_prof", "file_prof"]
			},
		debug: {
			level: "DEBUG",
			num: 2,
			handlers: ["console", "file"]
			},
		info: {
			level: "INFO",
			num: 3,
			handlers: ["console", "file"]
			},
		warn: {
			level: "WARN",
			num: 4,
			handlers: ["console", "file"]
			},
		error: {
			level: "ERROR",
			num: 5,
			handlers: ["console", "file"]
			},
		file: {
			level: "DEBUG",
			num: 6,
			handlers: ["file"]
			},
		silent: {
			level: "ERROR",
			num: 7,
			handlers: []
			}
		}
	}

setup(hConfig)
const hLoggers = hConfig.loggers
const hHandlers = hConfig.handlers
export const INDENT = Symbol('indent')
export const UNDENT = Symbol('undent')

// ---------------------------------------------------------------------------

const output = (level: TLogLevel, lItems: unknown[]): void => {
	if (isInactiveLevel(level)) {
		return
	}
	let logger = getLogger(getLogLevel())
	if (lItems.length === 0) {
		switch(level) {
			case 'debug': {
				logger.debug('\n');break;
			}
			case 'info': {
				logger.info('\n');break;
			}
			case 'warn': {
				logger.warn('\n');break;
			}
			case 'error': {
				logger.error('\n');break;
			}
			default:
				pass()
		}
		return
	}
	for (const item of lItems) {
		switch(item) {
			case INDENT: {
				indentLog();break;
			}
			case UNDENT: {
				undentLog();break;
			}
			default:
				let ref;if (isString(item)) { ref = item} else ref = ML(item);const str =ref
				if (nonEmpty(str)) {
					switch(level) {
						case 'debug': {
							logger.debug(str);break;
						}
						case 'info': {
							logger.info(black(str));break;
						}
						case 'warn': {
							logger.warn(str);break;
						}
						case 'error': {
							logger.error(str);break;
						}
						default:
							pass()
					}
				}
		}
	}
	return
}

// ---------------------------------------------------------------------------

export const DBG = (...lItems: unknown[]): void => {
	output('debug', lItems)
	return
}
export const LOG = (...lItems: unknown[]): void => {
	output('info', lItems)
	return
}
export const WARN = (...lItems: unknown[]): void => {
	output('warn', lItems)
	return
}
export const ERR = (...lItems: unknown[]): void => {
	output('error', lItems)
	return
}
export const LOGVALUE = (label: string, value: unknown): void => {
	if (isInactiveLevel('info')) {
		return
	}
	LOG(`${label} = ${ML(value)}`)
	return
}
export const LOGLABELED = (label: string, value: unknown): void => {
	if (isInactiveLevel('info')) {
		return
	}
	LOG(labeledBlock(label, value))
	return
}
export const DBGVALUE = (label: string, value: unknown): void => {
	if (isInactiveLevel('debug')) {
		return
	}
	DBG(blue(label) + ` = ${ML(value)}`)
	return
}
export const DBGLABELED = (label: string, value: unknown): void => {
	if (isInactiveLevel('debug')) {
		return
	}
	DBG(labeledBlock(label, value))
	return
}

// ---------------------------------------------------------------------------

export const labeledBlock = (label: string, value: unknown): string => {
	const block = ML(value)
	if (block.includes('\n')) {
		return [
			sep('-', blue(label)),
			block,
			sep('-')
		].join('\n')
	}
	else {
		return blue(label) + " = " + block
	}
}

// ---------------------------------------------------------------------------

export const removeLogFile = (): void => {
	if (existsSync(logFileName)) {
		Deno.removeSync(logFileName)
	}
	return
}

// ---------------------------------------------------------------------------

export type TFormatter<T> = (desc: string, item: (T | undefined)) => string

export class TreeLogger<T> {
	// --- data fields
	indentLevel: number = 0
	logLevel: TLogLevel = 'debug'
	formatter: TFormatter<T>

	constructor(formatter1 = (desc: string, item: (T | undefined)) => desc, logLevel: string = 'debug') {
		this.formatter = formatter1
		if (isLogLevel(logLevel)) {
			this.logLevel = logLevel
		}
	}

	start(desc: string, item: (T | undefined) = undef): void {
		const str = this.formatter(desc, item)
		const pre = getPrefix(this.indentLevel, 'plain')
		output(this.logLevel, [pre + str])
		this.indentLevel += 1
		return
	}

	log(desc: string, item: (T | undefined) = undef): void {
		const str = this.formatter(desc, item)
		const pre = getPrefix(this.indentLevel, 'plain')
		output(this.logLevel, [pre + str])
		return
	}

	succeed(desc: string, item: (T | undefined) = undef): void {
		const str = this.formatter(desc, item)
		const pre = getPrefix(this.indentLevel, 'withArrow')
		output(this.logLevel, [pre + str])
		this.indentLevel -= 1
		return
	}

	fail(desc: string, item: (T | undefined) = undef): void {
		const str = this.formatter(desc, item)
		const pre = getPrefix(this.indentLevel, 'withArrow')
		output(this.logLevel, [pre + str])
		this.indentLevel -= 1
		return
	}
}