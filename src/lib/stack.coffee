# call-stack.lib.civet

import {
	undef, defined, notdefined, assert, croak,
	integer, isNonEmptyString,
	} from 'datatypes'
import {LOG, WARN, ERR, LOGVALUE, getLog} from 'logger'
import {OL, OLS} from 'to-nice'

mainName := '_MAIN_'

# ---------------------------------------------------------------------------

class CallStackNode

	id: number
	funcName: string
	lArgs: unknown[]
	lCalling: CallStackNode[]? = []
	caller: CallStackNode?
	isYielded: boolean = false
	doLog: boolean

	constructor: (
			@id
			@funcName
			@lArgs
			@caller
			@doLog = false
			) =>

# ---------------------------------------------------------------------------

export getStackLog = () =>

	return getLog() || ''

# ---------------------------------------------------------------------------

export class CallStack

	@nextID: 2    # --- static field

	root = new CallStackNode(1, mainName, [], undef, true)
	curFunc: CallStackNode
	curFuncName: string
	level: integer = 0
	logLevel: integer = 0
	doLogCalls: boolean = true
	doDebugStack: boolean = true
	doThrowErrors: boolean = true

	# ........................................................................

	logCalls: (flag = true) =>

		@doLogCalls = flag
		return

	# ........................................................................

	debug: (flag = true) =>

		@doDebugStack = flag
		return

	# ........................................................................

	throwErrors: (flag = true) ->

		@doThrowErrors = flag
		return

	# ........................................................................

	log: (str) ->

		LOG "#{tabs(@level)}#{str}"
		return

	# ........................................................................

	reset: () ->

		if @doLogCalls
			@log "RESET STACK"
		@level = @logLevel = 0
		@root = @getNewNode(mainName, [], undef)
		@setCurFunc(@root)
		return

	# ........................................................................

	getNewNode: (
			funcName
			lArgs
			caller
			doLog = false
			) =>

		assert isNonEmptyString(funcName), "funcName not a non-empty string"
		id = CallStack.nextID
		CallStack.nextID += 1
		return new CallStackNode(id, funcName, deepCopy(lArgs), caller, doLog)

	# ........................................................................

	setCurFunc: (node: CallStackNode) =>

		assert defined(node), "node is undef"
		@curFunc = node
		@curFuncName = node.funcName
		return

	# ........................................................................

	isEmpty: () =>

		return (@curFunc == @root)

	# ........................................................................

	nonEmpty: () =>

		return not @isEmpty()

	# ........................................................................

	isActive: (
			funcName: string
			node = @root
			) =>

		if (node.funcName == funcName)
			return true
		for node in node.lCalling
			if @isActive(funcName, node) && not node.isYielded
				return true
		return false

	# ........................................................................
	# ........................................................................

	enter: (
			funcName: string
			lArgs: unknown[] = [],
			doLog = false
			) ->

		assert isNonEmptyString(funcName), "funcName not a non-empty string"
		if @doLogCalls
			if (lArgs.length == 0)
				@log "ENTER #{OL(funcName)}"
			else
				@log "ENTER #{OL(funcName)} #{OLS(lArgs)}"

		node = @getNewNode(funcName, lArgs, @curFunc, doLog)
		@curFunc.lCalling.push node
		@setCurFunc node

		@incLevel()

		if @doDebugStack
			@dump(@level)
		return

	# ........................................................................

	returnFrom: (...lParms: unknown[]) ->
		# --- Always returns from the current function
		#     parameter is just a check for correct function name
		# --- We must use spread operator to distinguish between
		#        returnFrom('func', undef)
		#        returnFrom('func')

		nArgs := lParms.length
		assert (nArgs==1) || (nArgs==2), "Bad num args: #{nArgs}"
		[funcName: string, val: unknown] = lParms

		# --- Adjust levels before logging
		decLevel()

		if @doLogCalls
			if (nArgs == 1)
				@log "RETURN FROM #{OL(funcName)}"
			else
				@log "RETURN FROM #{OL(funcName)} #{OL(val)}"

		assert (@curFuncName != mainName), "Return from #{mainName}"
		assert (funcName == @curFuncName),
			"return from #{funcName}, but cur func is #{@curFuncName}"

		@setCurFunc @curFunc.caller
		assert (@curFunc.lCalling.length > 0), "calling stack empty"
		@curFunc.lCalling.pop()

		if @doDebugStack
			@dump(@level)
		return

	# ........................................................................

	yield: (...lArgs: unknown[]) ->
		# --- We must use spread operator to distinguish between
		#        yield('func', undef)
		#        yield('func')

		nArgs = lArgs.length
		assert (nArgs==1) || (nArgs==2), "Bad num args: #{nArgs}"
		[funcName: string, val: unknown] = lArgs

		# --- Adjust levels before logging
		@level -= 1
		if @curFunc.doLog
			@logLevel -= 1

		if @doLogCalls
			if (nArgs == 1)
				@log "YIELD FROM #{OL(funcName)}"
			else
				@log "YIELD FROM #{OL(funcName)} #{OL(val)}"

		assert (@curFuncName != mainName), "yield from #{mainName}"
		assert (funcName == @curFuncName),
			"yield #{funcName}, but cur func is #{@curFuncName}"

		@curFunc.isYielded = true
		newCurFunc = @curFunc.caller
		while (newCurFunc.isYielded)
			newCurFunc = newCurFunc.caller
		@setCurFunc newCurFunc

		if @doDebugStack
			@dump(@level)
		return

	# ........................................................................

	resume: (funcName: string) ->

		if @doLogCalls
			@log "RESUME #{OL(funcName)}"

		@setCurFunc @curFunc.lCalling[@curFunc.lCalling.length - 1]
		assert (@curFunc.funcName == funcName),
			"resume #{funcName} but resumed @curFunc.funcName"
		assert @curFunc.isYielded, "resume #{funcName} but it's not yielded"
		@curFunc.isYielded = false

		@incLevel()

		if @doDebugStack
			@dump(@level)
		return

	# ........................................................................
	# ........................................................................

	incLevel: (): void ->

		@level += 1
		if @curFunc.doLog
			@logLevel += 1
		return

	# ........................................................................

	decLevel: (): void ->

		assert (@level > 0), "dec level when level is 0"
		@level -= 1
		if @curFunc.doLog
			assert (@logLevel > 0), "dec logLevel when logLevel is 0"
			@logLevel -= 1
		return

	# ........................................................................

	stackAssert: (cond, msg) =>
		# --- We don't really want to throw exceptions here

		if not cond
			if @doThrowErrors
				croak "#{msg}\n#{@dumpStr(@root)}"
			else
				WARN "#{msg}\n#{@dumpStr(@root)}"
		return

	# ........................................................................

	dump: (
			level=0,
			oneIndent = spaces(5)
			) =>

		prefix = oneIndent.repeat(level)
		LOG prefix + '-------- CALL STACK --------'
		LOG prefix + "(curFunc = #{@curFuncName})"
		LOG @dumpStr @root, level, oneIndent
		LOG prefix + '----------------------------'
		return

	# ........................................................................

	dumpStr: (node, level, oneIndent): string ->

		assert (node instanceof CallStackNode),
				"not a CallStackNode obj in dump()"
		lLines: string[] = []
		lLines.push oneIndent.repeat(level) + @callStr(node)
		lLines := for node in node.lCalling
			@dumpStr(node, level+1, oneIndent)
		str = lLines.join("\n")
		return str

	# ........................................................................

	callStr: (hNode: CallStackNode): string ->

		if (hNode == @curFunc)
			curSym = '> '
		else
			curSym = '. '

		{caller, lCalling} = hNode

		if defined(caller)
			callerStr = caller.id.toString(10)
		else
			callerStr = '-'

		callingStr = @idStr(lCalling)

		sym := (
			if hNode.doLog
				hNode.isYielded ? ' LY' : ' L'
			else
				hNode.isYielded ? ' Y' : ''
			)
		str = "#{curSym}[#{hNode.id}] #{hNode.funcName} #{callerStr} #{callingStr} #{sym}"
		return str

	# ........................................................................

	idStr: (lNodes: CallStackNode[]) ->

		if (lNodes.length == 0)
			return '-'
		lIDs := for node in lNodes
			node.id.toString(10)
		return lIDs.join(',')
