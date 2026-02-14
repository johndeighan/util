# debug.coffee

import {
	pass, undef, defined, notdefined, OL, OLS,
	isIdentifier, isFunctionName, isArrayOfStrings,
	isString, isFunction, isArray, isHash, isBoolean, isInteger,
	isEmpty, nonEmpty, arrayToBlock, getOptions,
	words, oneof, jsType, blockToArray,
	} from '@jdeighan/base-utils'
import {parsePath} from '@jdeighan/base-utils/ll-fs'
import {assert, croak} from '@jdeighan/base-utils/exceptions'
import {getPrefix} from '@jdeighan/base-utils/prefix'
import {
	LOG, LOGVALUE, stringFits, debugLogging,
	clearMyLogs, getMyLogs, echoLogs,
	} from '@jdeighan/base-utils/log'
import {toNICE} from '@jdeighan/base-utils/to-nice'
import {CallStack} from '@jdeighan/base-utils/stack'

export {debugLogging}

export debugStack = new CallStack()

# --- Comes from call to setDebugging()
lFuncList = []      # array of {funcName, plus}

export debugAll = false      # if true, always log
export internalDebugging = false
export shortvals = false

# --- Custom loggers, if defined
logEnter     = undef
logReturn    = undef
logYield     = undef
logResume    = undef
logString    = undef
logValue     = undef

export doDbg = true     # overall flag - if false, no debugging

# ---------------------------------------------------------------------------

export disableDbg = () ->

	doDbg = false
	return

# ---------------------------------------------------------------------------

export clearDebugLog = () =>

	return clearMyLogs()

# ---------------------------------------------------------------------------

export getDebugLog = () =>

	return getMyLogs()

# ---------------------------------------------------------------------------

export debugDebug = (debugFlag=true) =>

	internalDebugging = debugFlag
	if debugFlag
		console.log "turn on internal debugging in debug.coffee"
	else
		console.log "turn off internal debugging in debug.coffee"
	return

# ---------------------------------------------------------------------------

export dumpDebugLoggers = (label=undef) =>

	lLines = []
	if nonEmpty(label)
		lLines.push "LOGGERS (#{label})"
	else
		lLines.push "LOGGERS"
	lLines.push "   enter      - #{logType(logEnter, stdLogEnter)}"
	lLines.push "   return     - #{logType(logReturn, stdLogReturn)}"
	lLines.push "   yield      - #{logType(logYield, stdLogYield)}"
	lLines.push "   resume     - #{logType(logResume, stdLogResume)}"
	lLines.push "   string     - #{logType(logString, stdLogString)}"
	lLines.push "   value      - #{logType(logValue, stdLogValue)}"
	console.log arrayToBlock(lLines)

# ---------------------------------------------------------------------------

logType = (cur, std) =>

	if (cur == std)
		return 'std'
	else if defined(cur)
		return 'custom'
	else
		return 'undef'

# ---------------------------------------------------------------------------

export resetDebugging = () =>

	# --- reset everything
	debugStack.reset()
	lFuncList = []
	debugAll = false
	shortvals = false
	logEnter  = stdLogEnter
	logReturn = stdLogReturn
	logYield  = stdLogYield
	logResume = stdLogResume
	logString = stdLogString
	logValue  = stdLogValue
	clearMyLogs()
	return

# ---------------------------------------------------------------------------

export setDebugging = (debugWhat=undef, hOptions={}) =>
	# --- debugWhat can be:
	#        1. a boolean (false=disable, true=debug all)
	#        2. a string
	#        3. an array of strings
	# --- Valid options:
	#        'noecho' - don't echo logs to console
	#        'shortvals' - args and return values always on one line
	#        'enter', 'returnFrom',
	#           'yield', 'resume',
	#           'string', 'value'
	#         - to set custom loggers

	if internalDebugging
		console.log "setDebugging #{OL(debugWhat)}, #{OL(hOptions)}"

	assert defined(debugWhat), "arg 1 must be defined"
	resetDebugging()

	customSet = false     # were any custom loggers set?

	# --- First, process any options
	hOptions = getOptions(hOptions)
	if hOptions.noecho
		echoLogs false
		if internalDebugging
			console.log "TURN OFF ECHO"
	else
		echoLogs true
		if internalDebugging
			console.log "TURN ON ECHO"
	if hOptions.shortvals
		shortvals = true
	for key in words('enter returnFrom yield resume string value')
		if defined(hOptions[key])
			setCustomDebugLogger key, hOptions[key]
			customSet = true

	# --- process debugWhat if defined
	[type, subtype] = jsType(debugWhat)
	switch type
		when undef
			pass()
		when 'boolean'
			if internalDebugging
				console.log "set debugAll to #{OL(debugWhat)}"
			debugAll = debugWhat
		when 'string', 'array'
			if internalDebugging
				console.log "debugWhat is #{OL(debugWhat)}"
			lFuncList = getFuncList(debugWhat)
		else
			croak "Bad arg 1: #{OL(debugWhat)}"

	if internalDebugging
		dumpFuncList()
		if customSet
			dumpDebugLoggers()
	return

# ---------------------------------------------------------------------------

export dumpFuncList = () =>

	console.log 'lFuncList: --------------------------------'
	console.log toNICE(lFuncList)
	console.log '-------------------------------------------'
	return

# ---------------------------------------------------------------------------

export setCustomDebugLogger = (type, func) =>

	assert isFunction(func), "Not a function"
	if internalDebugging
		console.log "set custom logger #{OL(type)}"
	switch type
		when 'enter'
			logEnter = func
		when 'returnFrom'
			logReturn = func
		when 'yield'
			logYield = func
		when 'resume'
			logResume = func
		when 'string'
			logString = func
		when 'value'
			logValue = func
		else
			throw new Error("Unknown type: #{OL(type)}")
	return

# ---------------------------------------------------------------------------

export getFuncList = (funcs) =>
	# --- funcs can be a string or an array of strings

	lFuncs = []    # return value

	# --- Allow passing in an array of strings
	if isArray(funcs)
		assert isArrayOfStrings(funcs), "not an array of strings"
		for str in funcs
			lItems = getFuncList(str)   # recursive call
			lFuncs.push lItems...
		return lFuncs

	assert isString(funcs), "not a string"
	for word in words(funcs)
		if (word == 'debug')
			internalDebugging = true
		[fullName, modifier] = parseFunc(word)
		assert defined(fullName), "Bad debug object: #{OL(word)}"
		lFuncs.push {
			fullName
			plus: (modifier == '+')
			}
	return lFuncs

# ---------------------------------------------------------------------------
# Stack is only modified in these 8 functions (it is reset in setDebugging())
# ---------------------------------------------------------------------------

export dbgEnter = (funcName, lValues...) =>

	doLog = doDebugFunc(funcName)
	if internalDebugging
		if (lValues.length == 0)
			console.log "dbgEnter #{OL(funcName)}"
		else
			console.log "dbgEnter #{OL(funcName)}, #{OLS(lValues)}"
		console.log "   - doLog = #{OL(doLog)}"

	if doLog
		level = debugStack.logLevel
		if ! logEnter level, funcName, lValues
			stdLogEnter level, funcName, lValues

	debugStack.enter funcName, lValues, doLog
	return true

# ---------------------------------------------------------------------------

export doDebugFunc = (funcName) =>

	return debugAll || funcMatch(funcName)

# ---------------------------------------------------------------------------

export funcMatch = (funcName) =>
	# --- funcName came from a call to dbgEnter()
	#     it might be of form <object>.<method>
	# --- We KNOW that funcName is active!

	if internalDebugging
		console.log "CHECK funcMatch(#{OL(funcName)})"
		console.log lFuncList
		debugStack.dump 1

	lParts = isFunctionName(funcName)
	assert defined(lParts), "not a valid function name: #{OL(funcName)}"

	for h in lFuncList
		if (h.fullName == funcName)
			if internalDebugging
				console.log "   - TRUE - #{OL(funcName)} is in lFuncList"
			return true
		if h.plus && debugStack.isActive(h.fullName)
			if internalDebugging
				console.log "   - TRUE - #{OL(h.fullName)} is active"
			return true

	if (lParts.length == 2)   # came from dbgEnter()
		methodName = lParts[1]
		for h in lFuncList
			if (h.fullName == methodName)
				if internalDebugging
					console.log "   - TRUE - #{OL(methodName)} is in lFuncList"
				return true
	if internalDebugging
		console.log "   - FALSE"
	return false

# ---------------------------------------------------------------------------

export dbgReturn = (lArgs...) =>

	if (lArgs.length > 1)
		return dbgReturnVal lArgs...
	funcName = lArgs[0]
	assert isFunctionName(funcName), "not a valid function name"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgReturn #{OL(funcName)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logReturn level, funcName
			stdLogReturn level, funcName

	debugStack.returnFrom funcName
	return true

# ---------------------------------------------------------------------------

dbgReturnVal = (funcName, val) =>

	assert isFunctionName(funcName), "not a valid function name"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgReturn #{OL(funcName)}, #{OL(val)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logReturn level, funcName, val
			stdLogReturn level, funcName, val

	debugStack.returnFrom funcName, val
	return true

# ---------------------------------------------------------------------------

export dbgYield = (lArgs...) =>

	nArgs = lArgs.length
	assert (nArgs==1) || (nArgs==2), "Bad num args: #{nArgs}"
	[funcName, val] = lArgs
	if (nArgs==1)
		return dbgYieldFrom(funcName)

	assert isFunctionName(funcName), "not a function name: #{OL(funcName)}"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgYield #{OL(funcName)} #{OL(val)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logYield level, funcName, val
			stdLogYield level, funcName, val

	debugStack.yield funcName, val
	return true

# ---------------------------------------------------------------------------

dbgYieldFrom = (funcName) =>

	assert isFunctionName(funcName), "not a function name: #{OL(funcName)}"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgYieldFrom #{OL(funcName)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logYieldFrom level, funcName
			stdLogYieldFrom level, funcName

	debugStack.yield funcName
	return true

# ---------------------------------------------------------------------------

export dbgResume = (funcName) =>

	assert isFunctionName(funcName), "not a valid function name"
	debugStack.resume funcName
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgResume #{OL(funcName)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logResume funcName, level-1
			stdLogResume funcName, level-1

	return true

# ---------------------------------------------------------------------------

export dbgCall = (func) =>

	assert isFunction(func), "not a function"
	doLog = debugAll || debugStack.isLogging()
	if doLog
		return func()
	else
		return

# ---------------------------------------------------------------------------

export dbg = (lArgs...) =>

	if ! doDbg
		return
	if lArgs.length == 1
		return dbgString lArgs[0]
	else
		return dbgValue lArgs[0], lArgs[1]

# ---------------------------------------------------------------------------
# --- str can be a multi-line string

export dbgString = (str) =>

	assert isString(str), "not a string"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgString(#{OL(str)})"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logString level, str
			console.log "   - using stdLogString"
			stdLogString level, str

	return true

# ---------------------------------------------------------------------------

export dbgValue = (label, val) =>

	assert isString(label), "not a string"
	doLog = debugAll || debugStack.isLogging()
	if internalDebugging
		console.log "dbgValue #{OL(label)}, #{OL(val)}"
		console.log "   - doLog = #{OL(doLog)}"
	if doLog
		level = debugStack.logLevel
		if ! logValue level, label, val
			stdLogValue level, label, val

	return true

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
#    Only these 8 functions ever call LOG or LOGVALUE

export stdLogEnter = (level, funcName, lArgs) =>

	assert isFunctionName(funcName), "bad function name"
	assert isArray(lArgs), "not an array"
	assert isInteger(level), "level not an integer"

	labelPre = getPrefix(level, 'plain')
	if (lArgs.length == 0)
		LOG labelPre + "enter #{funcName}"
	else
		hOptions = {short: shortvals}
		str = "enter #{funcName} #{OLS(lArgs, hOptions)}"
		if stringFits("#{labelPre}#{str}")
			LOG labelPre + str
		else
			idPre = getPrefix(level+1, 'plain')
			itemPre = getPrefix(level+2, 'noLastVbar')
			LOG labelPre + "enter #{funcName}"
			for arg,i in lArgs
				LOGVALUE "arg[#{i}]", arg, {
						prefix: idPre
						itemPrefix: itemPre
						short: shortvals
						}
	return true

# ---------------------------------------------------------------------------

export stdLogReturn = (lArgs...) =>

	[level, funcName, val] = lArgs
	if (lArgs.length == 3)
		return stdLogReturnVal level, funcName, val
	assert isFunctionName(funcName), "bad function name"
	assert isInteger(level), "level not an integer"

	labelPre = getPrefix(level, 'withArrow')
	LOG labelPre + "return from #{funcName}"
	return true

# ---------------------------------------------------------------------------

stdLogReturnVal = (level, funcName, val) =>

	assert isFunctionName(funcName), "bad function name"
	assert isInteger(level), "level not an integer"

	labelPre = getPrefix(level, 'withArrow')
	str = "return #{OL(val)} from #{funcName}"
	if stringFits(str)
		LOG labelPre + str
	else
		pre = getPrefix(level, 'noLastVbar')
		LOG labelPre + "return from #{funcName}"
		LOGVALUE "val", val, {
			prefix: pre
			itemPrefix: pre
			short: shortvals
			}
	return true

# ---------------------------------------------------------------------------

export stdLogYield = (lArgs...) =>

	[level, funcName, val] = lArgs
	if (lArgs.length == 2)
		return stdLogYieldFrom level, funcName
	labelPre = getPrefix(level, 'withYield')
	valStr = OL(val)
	str = "yield #{valStr}"
	if stringFits(str)
		LOG labelPre + str
	else
		pre = getPrefix(level, 'plain')
		LOGVALUE undef, val, {prefix: pre, itemPrefix: pre}
	return true

# ---------------------------------------------------------------------------

export stdLogYieldFrom = (level, funcName) =>

	labelPre = getPrefix(level, 'withFlat')
	LOG labelPre + "yieldFrom"
	return true

# ---------------------------------------------------------------------------

export stdLogResume = (funcName, level) =>

	assert isInteger(level), "level not an integer"
	labelPre = getPrefix(level+1, 'withResume')
	LOG labelPre + "resume"
	return true

# ---------------------------------------------------------------------------

export stdLogString = (level, str) =>

	assert isString(str), "not a string"
	assert isInteger(level), "level not an integer"

	labelPre = getPrefix(level, 'plain')
	for part in blockToArray(str)
		LOG labelPre + part
	return true

# ---------------------------------------------------------------------------

export stdLogValue = (level, label, val) =>

	assert isInteger(level), "level not an integer"

	labelPre = getPrefix(level, 'plain')
	LOGVALUE label, val, {prefix: labelPre}
	return true

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------

export getType = (label, lValues=[]) =>
	# --- returns [type, funcName]
	#     <type> is one of:
	#        'enter'      - funcName is set
	#        'returnFrom' - funcName is set
	#        'yield'      - funcName is set
	#        'resume'     - funcName is set
	#        'string'     - funcName is undef
	#        'value'      - funcName is undef

	if lMatches = label.match(///^
			( enter | yield | resume )
			\s+
			(
				[A-Za-z_][A-Za-z0-9_]*
				(?:
					\.
					[A-Za-z_][A-Za-z0-9_]*
					)?
				)
			(?: \( \) )?
			$///)
		return [lMatches[1], lMatches[2]]

	if lMatches = label.match(///^
			return
			\s+
			from
			\s+
			(
				[A-Za-z_][A-Za-z0-9_]*
				(?:
					\.
					[A-Za-z_][A-Za-z0-9_]*
					)?
				)
			(?: \( \) )?
			$///)
		return ['returnFrom', lMatches[1]]

	# --- if none of the above returned, then...
	if (lValues.length == 1)
		return ['value', undef]
	else if (lValues.length == 0)
		return ['string', undef]
	else
		throw new Error("More than 1 object not allowed here")

# ........................................................................

export parseFunc = (str) =>
	# --- returns [fullName, modifier]

	if lMatches = str.match(///^
			(
				[A-Za-z_][A-Za-z0-9_]*
				(?:
					\.
					[A-Za-z_][A-Za-z0-9_]*
					)?
				)
			(\+)?
			$///)
		[_, fullName, modifier] = lMatches
		return [fullName, modifier]
	else
		return [undef, undef]

# ---------------------------------------------------------------------------

resetDebugging()
