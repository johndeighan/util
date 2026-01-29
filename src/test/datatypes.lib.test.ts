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
	isIterator, isAsyncIterator,
	} from 'datatypes'
import {DBG} from 'logger'
import {
	equal, truthy, falsy, fails, succeeds, isType, notType,
	val,
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

truthy(isGenerator(val.genFunc))
truthy(isAsyncGenerator(val.asyncGenFunc))
falsy( isGenerator(val.regularFunc))
falsy( isGenerator(val.lambdaFunc))

if (isGenerator(val.genFunc)) {
	truthy(isIterator(val.genFunc()))
}
if (isAsyncGenerator(val.asyncGenFunc)) {
	truthy(isAsyncIterator(val.asyncGenFunc()))
}

falsy( isIterator(val.genFunc))
falsy( isIterator(val.regularFunc))
falsy( isIterator(val.lambdaFunc))
