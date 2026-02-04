"use strict";
// datatypes.lib.test.civet

import {
	deepEqual, undef, defined, notdefined,
	croak, assert,
	addFunctionNames, removeFunctionNames,
	normalizeCode, normalizeExpr,
	array, arrayof, isArray,
	hash, hashof, isHash,
	TVoidFunc, nonEmptyString,
	isString, char, isChar, isNonEmptyString, isBoolean,
	isNumber, isPrimitive, isNonPrimitive, isInteger,
	isArrayOfStrings, isArrayOfIntegers,
	isFunction, isRegExp,
	isEmpty, nonEmpty,
	isClass, className, isPromise, isClassInstance,
	isSymbol, symbolName, functionName, functionDef,
	classDef, regexpDef, hashLike,
	isObject, isGenerator, isAsyncGenerator,
	isIterator, isAsyncIterator, jsType,
	} from 'datatypes'
import {DBG} from 'logger'
import {
	equal, truthy, falsy, fails, succeeds, isType, notType,
	sampleVal,
	} from 'unit-test'

// ---------------------------------------------------------------------------

truthy(deepEqual('a', 'a'))
truthy(deepEqual(['a'], ['a']))

// ---------------------------------------------------------------------------

fails(() => croak("Bad"))

// ---------------------------------------------------------------------------

const nonsense = (): boolean => {
	return false
}
fails(() => assert(nonsense()))

// ---------------------------------------------------------------------------

truthy(defined(42))
falsy( defined(undef))
falsy( notdefined(42))
truthy(notdefined(undef))

// ---------------------------------------------------------------------------

isType('number', 42)

// ---------------------------------------------------------------------------

truthy(isGenerator(sampleVal.genFunc))
truthy(isAsyncGenerator(sampleVal.asyncGenFunc))
falsy( isGenerator(sampleVal.regularFunc))
falsy( isGenerator(sampleVal.lambdaFunc))

if (isGenerator(sampleVal.genFunc)) {
	truthy(isIterator(sampleVal.genFunc()))
}
if (isAsyncGenerator(sampleVal.asyncGenFunc)) {
	truthy(isAsyncIterator(sampleVal.asyncGenFunc()))
}

falsy( isIterator(sampleVal.genFunc))
falsy( isIterator(sampleVal.regularFunc))
falsy( isIterator(sampleVal.lambdaFunc))

// ---------------------------------------------------------------------------

equal(jsType(sampleVal.undef), 'undef')
equal(jsType(sampleVal.null), 'null')
equal(jsType(sampleVal.emptyStr), 'string')
equal(jsType(sampleVal.str), 'string')
equal(jsType(sampleVal.i), 'integer')
equal(jsType(sampleVal.f), 'float')
equal(jsType(sampleVal.b), 'boolean')
equal(jsType(sampleVal.genFunc), 'generator')
equal(jsType(sampleVal.asyncGenFunc), 'asyncGenerator')
equal(jsType(sampleVal.regularFunc), 'plainFunction')
equal(jsType(sampleVal.lambdaFunc), 'plainFunction')
equal(jsType(sampleVal.emptyHash), 'hash')
equal(jsType(sampleVal.fullHash), 'hash')
equal(jsType(sampleVal.emptyList), 'array')
equal(jsType(sampleVal.fullList), 'array')