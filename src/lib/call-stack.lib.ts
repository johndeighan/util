"use strict";
// call-stack.lib.civet

import {
	undef, defined, notdefined, assert, croak, nonEmptyString,
	} from 'datatypes'
import {spaces, tabs} from 'llutils'
import {LOG, ERR, getLog} from 'logger'
import {OL, OLS} from 'to-nice'

const mainName = '_MAIN_'
const noValue = Symbol('noValue')

// ---------------------------------------------------------------------------

class Node {

	id: number
	name: string
	lArgs: unknown[]
	caller: (Node | undefined)
	lCalling: Node[] = []
	isYielded: boolean = false
	doLog: boolean = false

	constructor(
			id1: number,
			name1: string,
			lArgs: unknown[] = [],
			caller1: (Node | undefined) = undef,
			doLog1 = false
			) {

		this.id = id1;

		this.name = name1;

		this.caller = caller1;

		this.doLog = doLog1;

		this.lArgs = structuredClone(lArgs)
	}
}

// ---------------------------------------------------------------------------

export class CallStack {

	nextID: number = 2
	root = new Node(1, mainName, [], undef, true)
	curFunc: Node = this.root
	level: number = 0
	logLevel: number = 0
	doLogCalls: boolean = true
	doDebugStack: boolean = true
	doThrowErrors: boolean = true

	// ........................................................................

	logCalls(flag: boolean = true): void {

		this.doLogCalls = flag
		return
	}

	// ........................................................................

	debug(flag: boolean = true): void {

		this.doDebugStack = flag
		return
	}

	// ........................................................................

	throwErrors(flag: boolean = true): void {

		this.doThrowErrors = flag
		return
	}

	// ........................................................................

	log(str: string): void {

		LOG(`${tabs(this.level)}${str}`)
		return
	}

	// ........................................................................

	reset(): void {

		if (this.doLogCalls) {
			this.log("RESET STACK")
		}
		this.nextID = 2
		this.curFunc = this.root = new Node(1, mainName, [], undef)
		this.level = this.logLevel = 0
		this.doLogCalls = this.doDebugStack = this.doThrowErrors = true
		this.setCurFunc(this.root)
		return
	}

	// ........................................................................

	setCurFunc(node: Node): void {

		this.curFunc = node
		return
	}

	// ........................................................................

	isActive(
			funcName: string,
			hNode = this.root
			): boolean {

		if (hNode.name === funcName) {
			return true
		}
		const {lCalling} = hNode
		for (const node of hNode.lCalling) {
			if (this.isActive(funcName, node) && !node.isYielded) {
				return true
			}
		}
		return false
	}

	// ........................................................................
	// ........................................................................

	enter(
			funcName: nonEmptyString,
			lArgs: unknown[] = [],
			doLog = false
			): void {

		if (this.doLogCalls) {
			if (lArgs.length === 0) {
				this.log(`ENTER ${OL(funcName)}`)
			}
			else {
				this.log(`ENTER ${OL(funcName)} ${OLS(lArgs)}`)
			}
		}

		const node = new Node(this.nextID, funcName, lArgs, this.curFunc, doLog)
		this.nextID += 1
		this.curFunc.lCalling.push(node)
		this.setCurFunc(node)

		this.incLevel()

		if (this.doDebugStack) {
			this.dump(this.level)
		}
		return
	}

	// ........................................................................

	returnFrom(funcName: string, val: unknown = noValue): void {
		// --- Always returns from the current function
		//     parameter is just a check for correct function name
		// --- We must use spread operator to distinguish between
		//        returnFrom('func', undef)
		//        returnFrom('func')

		// --- Adjust levels before logging
		this.decLevel()

		if (this.doLogCalls) {
			if (val === noValue) {
				this.log(`RETURN FROM ${OL(funcName)}`)
			}
			else {
				this.log(`RETURN FROM ${OL(funcName)} ${OL(val)}`)
			}
		}

		assert(defined(this.curFunc.caller), "return from main")
		assert((funcName === this.curFunc.name),
			`return from ${funcName}, but cur func is ${this.curFunc.name}`)
		if (notdefined(this.curFunc.caller)) {
			this.setCurFunc(this.curFunc.caller)
		}

		assert((this.curFunc.lCalling.length > 0), "calling stack empty")
		this.curFunc.lCalling.pop()

		if (this.doDebugStack) {
			this.dump(this.level)
		}
		return
	}

	// ........................................................................

	yield(funcName: string, val: unknown = noValue): void {

		// --- Adjust levels before logging
		this.decLevel()

		if (this.doLogCalls) {
			if (val === noValue) {
				this.log(`YIELD FROM ${OL(funcName)}`)
			}
			else {
				this.log(`YIELD FROM ${OL(funcName)} ${OL(val)}`)
			}
		}

		assert(defined(this.curFunc.caller), "return from main")
		assert((funcName === this.curFunc.name),
			`yield ${funcName}, but cur func is ${this.curFunc.name}`)

		this.curFunc.isYielded = true

		let newCurFunc: (Node | undefined) = this.curFunc.caller
		while (defined(newCurFunc.caller) && (newCurFunc.isYielded)) {
			newCurFunc = newCurFunc.caller
		}
		this.setCurFunc(newCurFunc)

		if (this.doDebugStack) {
			this.dump(this.level)
		}
		return
	}

	// ........................................................................

	resume(funcName: string): void {

		if (this.doLogCalls) {
			this.log(`RESUME ${OL(funcName)}`)
		}

		this.setCurFunc(this.curFunc.lCalling[this.curFunc.lCalling.length - 1])
		assert((this.curFunc.name === funcName),
			`resume ${funcName} but resumed @curFunc.name`)
		assert(this.curFunc.isYielded, `resume ${funcName} but it's not yielded`)
		this.curFunc.isYielded = false

		this.incLevel()

		if (this.doDebugStack) {
			this.dump(this.level)
		}
		return
	}

	// ........................................................................
	// ........................................................................

	incLevel(): void {

		this.level += 1
		if (this.curFunc.doLog) {
			this.logLevel += 1
		}
		return
	}

	// ........................................................................

	decLevel(): void {

		assert((this.level > 0), "dec level when level is 0")
		this.level -= 1
		if (this.curFunc.doLog) {
			assert((this.logLevel > 0), "dec logLevel when logLevel is 0")
			this.logLevel -= 1
		}
		return
	}

	// ........................................................................

	dump(
			level=0,
			oneIndent = spaces(5)
			): void {

		const prefix = oneIndent.repeat(level)
		LOG(prefix + '-------- CALL STACK --------')
		LOG(prefix + `(curFunc = ${this.curFunc.name})`)
		LOG(this.dumpStr(this.root, level, oneIndent))
		LOG(prefix + '----------------------------')
		return
	}

	// ........................................................................

	dumpStr(
			node: Node,
			level: number,
			oneIndent: string
			): string {

		const results=[];for (const item of node.lCalling) {const node: Node = item;
			results.push(this.dumpStr(node, level+1, oneIndent))
		};const lLines =results
		return [
			oneIndent.repeat(level) + this.callStr(node),
			...lLines
			].join("\n")
	}

	// ........................................................................

	callStr(hNode: Node): string {

		const curSym = (hNode === this.curFunc) ? '> ' : '. '

		const {caller, lCalling} = hNode
		const callerStr = defined(caller) ? caller.id.toString(10) : '-'
		const callingStr = this.idStr(lCalling)

		const sym = (
			(hNode.doLog?
				(hNode.isYielded ? ' LY' : ' L')
			:
				(hNode.isYielded ? ' Y' : ''))
			)
		return `${curSym}[${hNode.id}] ${hNode.name} ${callerStr} ${callingStr} ${sym}`
	}

	// ........................................................................

	idStr(lNodes: Node[]): string {

		if (lNodes.length === 0) {
			return '-'
		}
		const results1=[];for (const node of lNodes) {
			results1.push(node.id.toString(10))
		};const lIDs =results1
		return lIDs.join(',')
	}
}

// ---------------------------------------------------------------------------

export var getStackLog = (): string => {

	return getLog() || ''
}


