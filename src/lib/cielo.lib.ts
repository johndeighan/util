"use strict";
// cielo.lib.civet

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
import {civet2ts, civet2tsFile} from 'civet'

// ---------------------------------------------------------------------------

export const cielo2civet = (code: string): string => {

	return code
}

// ---------------------------------------------------------------------------

export const cielo2ts = (code: string): string => {

	return civet2ts(cielo2civet(code))
}

// ---------------------------------------------------------------------------

export const cielo2civetFile = (cieloPath: string, civetPath: string = withExt(cieloPath, '.civet')): string => {

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

export const configFromFile = (path: string): hash => {

	const {purpose, ext} = parsePath(path)
	assert((purpose === 'config'), `Not a config file: ${OL(path)}`)
	DBGVALUE("path", path)
	const srcPath = (ext === '.civet') ? civet2tsFile(path) : path
	assert((fileExt(srcPath) === '.ts'), `config not a .ts or .civet file: ${OL(path)}`)
	DBGVALUE('srcPath', srcPath)
	const url = pathToFileURL(srcPath)
	DBGVALUE('url', url)
	const hImported = require(srcPath)
	DBGVALUE('hImported', hImported)
	const hResult = hImported?.default || hImported
	DBGVALUE("hResult", hResult)
	assert(isHash(hResult), `Default import in ${OL(srcPath)} not a hash: ${ML(hResult)}`)
	return hResult
}

// ---------------------------------------------------------------------------