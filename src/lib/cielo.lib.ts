"use strict";
// cielo.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {pathToFileURL} from 'node-url'

import {
	undef, defined, notdefined, assert, croak, hash, isHash,
	} from 'datatypes'
import {pass, keys, require} from 'llutils'
import {OL, ML} from 'to-nice'
import {
	DBG, LOG, DBGVALUE, pushLogLevel, popLogLevel,
	} from 'logger'
import {
	isFile, fileExt, withExt, slurp, barf, barfTempFile, parsePath,
	} from 'fsys'
import {CFileHandler, TExecResult} from 'exec'
import {civet2ts, civet2tsFile, doCompileCivet} from 'civet'

// ---------------------------------------------------------------------------

export const cielo2civet = (code: string): string => {

	return code
}

// ---------------------------------------------------------------------------

export const cielo2ts = (code: string): string => {

	return civet2ts(cielo2civet(code))
}

// ---------------------------------------------------------------------------

export const cielo2civetFile = (
		cieloPath: string,
		civetPath: string = withExt(cieloPath, '.civet'),
		hOptions: hash = {}
		): string => {

	assert(isFile(cieloPath), `No such file: ${OL(cieloPath)} (cielo2civet)`)
	assert((fileExt(cieloPath) === '.cielo'), `Not a cielo file: ${OL(cieloPath)}`)
	assert((fileExt(civetPath) === '.civet'), `Not a civet file: ${OL(civetPath)}`)
	const code = slurp(cieloPath)
	barf(civetPath, cielo2civet(code))
	assert(isFile(civetPath), `File not created: ${OL(civetPath)}`)
	return civetPath
}

// ---------------------------------------------------------------------------

export const cielo2tsFile = (cieloPath: string, tsPath: string = withExt(cieloPath, '.ts')): string => {

	assert(isFile(cieloPath), `No such file: ${OL(cieloPath)} (cielo2ts)`)
	assert((fileExt(cieloPath) === '.cielo'), `Not a cielo file: ${OL(cieloPath)}`)
	assert((fileExt(tsPath) === '.ts'), `Not a ts file: ${OL(tsPath)}`)
	const code = slurp(cieloPath)
	barf(tsPath, cielo2ts(code))
	assert(isFile(tsPath), `File not created: ${OL(tsPath)}`)
	return tsPath
}

// ---------------------------------------------------------------------------

class CCieloCompiler extends CFileHandler {

	get op() {
		return 'doCompileCielo'
	}

	// ..........................................................
	// ASYNC

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert((fileExt(path) === '.cielo'), `Not a cielo file: ${path}`)
		const civetPath = withExt(path, '.temp.civet')
		cielo2civetFile(path, civetPath, hOptions)
		return await doCompileCivet.handle(civetPath, hOptions)
	}

	// ..........................................................
	// SYNC

	handleSync(
			path: string,
			hOptions: hash = {}
			): TExecResult {

		assert((fileExt(path) === '.cielo'), `Not a cielo file: ${path}`)
		const civetPath = withExt(path, '.temp.civet')
		cielo2civetFile(path, civetPath, hOptions)
		return doCompileCivet.handleSync(civetPath, hOptions)
	}
}

export const doCompileCielo = new CCieloCompiler()

// ---------------------------------------------------------------------------

