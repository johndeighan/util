"use strict";
// typescript.lib.civet

import {cyan, blue} from 'jsr:@std/fmt/colors'
import {existsSync} from 'jsr:@std/fs'
import {statSync} from 'node:fs'
import {
	SourceFile, Node, ScriptTarget, SyntaxKind, ModuleKind,
	NewLineKind, EmitHint, CompilerOptions, ModuleResolutionKind,
	createSourceFile, createPrinter, createProgram,
	transpileModule, getPreEmitDiagnostics, forEachChild,
	flattenDiagnosticMessageText, getLineAndCharacterOfPosition,
	} from 'npm:typescript'

import {
	undef, defined, notdefined, integer, TStringGenerator,
	hash, hashof, isHash, TFilterFunc, isString, isEmpty, nonEmpty,
	assert, croak, isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	truncStr, getOptions, spaces, o, words, hasKey,
	CStringSetMap, keys, blockify, sep,
	} from 'llutils'
import {
	extract, TPathItem, getString, getNumber, getArray,
	} from 'extract'
import {TBlockDesc, Blockify} from 'indent'
import {
	LOG, DBG, LOGVALUE, INDENT, UNDENT, DBGVALUE,
	} from 'logger'
import {slurp, barf, barfTempFile, fileExt} from 'fsys'
import {OL, toNice, TMapFunc} from 'to-nice'
import {execCmdSync} from 'exec'
import {extractSourceMap} from 'source-map'
import {getNeededImportStmts} from 'symbols'
import {Walker, TVisitKind} from 'walker'
import {CMainScope, CScope} from 'scope'

const decoder = new TextDecoder("utf-8")

// ---------------------------------------------------------------------------

export const kindStr = (i: number): string => {

	return SyntaxKind[i]
}

// ---------------------------------------------------------------------------

export const ts2ast = (tsCode: string, hOptions: hash = {}): Node => {

	type opt = {
		fileName: string
		}
	const {fileName} = getOptions<opt>(hOptions, {
		fileName: 'temp.ts',
	})

	tsCode = extractSourceMap(tsCode)[0]
	const hAst = createSourceFile(fileName, tsCode, ScriptTarget.Latest)
	return hAst
}

// ---------------------------------------------------------------------------

export const ast2ts = (node: Node): string => {

	assert((node.kind === 308), "Not a SourceFile node")
	const printer = createPrinter({newLine: NewLineKind.LineFeed})
	return printer.printNode(EmitHint.Unspecified, node, node as SourceFile)
}

// ---------------------------------------------------------------------------

export const typeCheckFiles = (
		lFileNames: string | string[],
		hOptions: CompilerOptions = hDefConfig
		): string[] => {

	if (typeof lFileNames === 'string') {
		lFileNames = [lFileNames]
	}
	const program = createProgram(lFileNames, hOptions)
	const emitResult = program.emit()
	const lMsgs: string[] = []
	getPreEmitDiagnostics(program).forEach((diag): void => {
		const {file, start, messageText} = diag
		const msg = flattenDiagnosticMessageText(messageText, "\n")
		if (file) {
			const {fileName} = file
			const {line, character} = getLineAndCharacterOfPosition(file, start!)
			lMsgs.push(`${fileName}:(${line + 1}:${character + 1}): ${msg}`)
		}
		else {
			lMsgs.push(msg)
		}
	})
	return lMsgs
}

export const typeCheckFile = typeCheckFiles // --- synonym

// ---------------------------------------------------------------------------

export const tsMapFunc: TMapFunc = (key: string, value: unknown, hParent: hash): unknown => {

	if ((key === 'kind') && (typeof value === 'number')) {
		const desc = cyan(' (' + kindStr(value) + ')')
		return value.toString() + desc
	}
	return undef
}

// ---------------------------------------------------------------------------

export const astAsString = (hAst: Node, hOptions: hash = {}): string => {

	return toNice(hAst, {
		ignoreEmptyValues: true,
		mapFunc: tsMapFunc,
		lInclude: hOptions.lInclude,
		lExclude: words('pos end id flags modifierFlagsCache', 'transformFlags hasExtendedUnicodeEscape', 'numericLiteralFlags setExternalModuleIndicator', 'languageVersion languageVariant jsDocParsingMode', 'hasNoDefaultLib'),
	})
}

// ---------------------------------------------------------------------------
// --- We must place the TypeScript file at the project root
//     so that paths gotten from .symbols resolve correctly

export const typeCheckCode = (tsCode: string): ((string[]) | undefined) => {

	const path = "./_typecheck_.ts"
	barf(path, tsCode)
	const {success, stderr} = execCmdSync('deno', [
		'check',
		path
		])
	if (success) {
		return []
	}
	else if (defined(stderr)) {
		return [stderr]
	}
	else {
		return ['Unknown error']
	}
}

// ---------------------------------------------------------------------------

export const checkType = (
		typeStr: string,
		value: unknown,
		expectSuccess: boolean = true
		): string[] => {

	DBG("CALL checkType():", INDENT)
	const valueStr = (
		  isFunction(value) ? functionDef(value)
		: isClass(value)    ? classDef(value)
		:                     JSON.stringify(value)
		)
	const tsCode = getTsCode(typeStr, valueStr)
	DBGVALUE('tsCode', tsCode)
	// --- check if we need to import the type
	const importCode = getImportCode(typeStr)
	DBGVALUE('importCode', importCode)
	const code = `\${importCode}
\${tsCode}`
	const lDiagnostics = typeCheckCode(code)
	if (expectSuccess && nonEmpty(lDiagnostics)) {
		LOG("typeCheckCode FAILED:")
		LOG("CODE:")
		LOG(code)
		LOGVALUE('lDiagnostics', lDiagnostics)
	}
	else if (!expectSuccess && isEmpty(lDiagnostics)) {
		LOG("typeCheckCode SUCCEEDED:")
		LOG("CODE:")
		LOG(code)
	}
	DBG(UNDENT)
	return lDiagnostics || []
}

// ---------------------------------------------------------------------------

// --- We need to add ':unknown' to any function parameters
//     that don't have an explicit type

export const getTsCode = (
		typeStr: string,
		valueStr: string
		): string => {

	DBGVALUE('typeStr', typeStr)
	DBGVALUE('valueStr', valueStr)
	const result = splitFuncStr(valueStr)
	if (defined(result)) {
		const [lParms, body] = result
		const addType = (parm: string): string => {
			if (parm.indexOf(':') >= 0) {
				return parm
			}
			else {
				return `${parm}: unknown`
			}
		}
		const parmStr = lParms.map(addType).join(', ')
		return `const x: ${typeStr} = (${parmStr}) => ${body}`
	}
	else {
		return `const x: ${typeStr} = ${valueStr}`
	}
}

// ---------------------------------------------------------------------------

type splitResult = [string[], string]

export const splitFuncStr = (valueStr: string): (splitResult | undefined) => {

	let ref
	if (ref = valueStr.match(/^\(([^\)]*)\)\s*[\=\-]\>\s*(.*)$/)) {
		const lMatches = ref
		const [_, strParms, strBody] = lMatches
		if (isEmpty(strParms)) {
			return [[], strBody]
		}
		else {
			return [
				strParms.split(',').map((x) => x.trim()),
				strBody
				]
		}
	}
	else {
		return undef
	}
}

// ---------------------------------------------------------------------------

export const getImportCode = (typeStr: string): string => {

	DBG("CALL getImportCode()")
	const lSymbols = getSymbolsFromType(typeStr)
	DBGVALUE('lSymbols', lSymbols)
	if (nonEmpty(lSymbols)) {
		const lStmts = getNeededImportStmts(lSymbols)
		DBGVALUE('lStmts', lStmts)
		return lStmts.join('\n')
	}
	else {
		return ''
	}
}

// ---------------------------------------------------------------------------

export const getSymbolsFromType = (typeStr: string): string[] => {

	let ref1
	let ref2
	if (ref1 = typeStr.match(/^([A-Za-z][A-Za-z0-9+]*)(?:\<([A-Za-z][A-Za-z0-9+]*)\>)?$/)) {
		const lMatches = ref1
		const [_, type, subtype] = lMatches
		return (nonEmpty(subtype)? [type, subtype] : [type])
	}
	else if (ref2 = typeStr.match(/^\(\)\s*\=\>\s*([A-Za-z][A-Za-z0-9+]*)$/)) {
		const lMatches = ref2
		return [lMatches[1]]
	}
	else {
		return []
	}
}

// ---------------------------------------------------------------------------

const hDefConfig: CompilerOptions = {
	"allowJs": false,
	"allowUmdGlobalAccess": false,
	"allowUnreachableCode": false,
	"allowUnusedLabels": false,
	"alwaysStrict": true,
	"assumeChangesOnlyAffectDirectDependencies": false,
	"checkJs": false,
	"composite": false,
	"declaration": false,
	"declarationDir": undefined,
	"declarationMap": false,
	"emitBOM": false,
	"emitDeclarationOnly": false,
	"exactOptionalPropertyTypes": false,
	"experimentalDecorators": false,
	"forceConsistentCasingInFileNames": true,
	"generateCpuProfile": null,
	"generateTrace": null,
	"ignoreDeprecations": "5.0",
	"importHelpers": false,
	"inlineSourceMap": false,
	"inlineSources": false,
	"isolatedModules": false,
	//	"jsx": "react-jsx",
	//	"jsxFactory": "React.createElement",
	//	"jsxFragmentFactory": "React.Fragment",
	//	"jsxImportSource": "react",
	"lib": [
		"esnext",
		"dom",
		"dom.iterable"
	],
	"mapRoot": undefined,
	"maxNodeModuleJsDepth": 0,
	"module": ModuleKind.ESNext,
	"moduleDetection": undefined,
	"moduleResolution": ModuleResolutionKind.NodeNext,
	"newLine": NewLineKind.LineFeed,
	"noEmit": true,
	"noEmitHelpers": false,
	"noEmitOnError": false,
	"noErrorTruncation": false,
	"noFallthroughCasesInSwitch": true,
	"noImplicitAny": true,
	"noImplicitOverride": true,
	"noImplicitReturns": true,
	"noImplicitThis": true,
	"noPropertyAccessFromIndexSignature": true,
	"noUncheckedIndexedAccess": true,
	"noUnusedLocals": true,
	"noUnusedParameters": true,
	"outDir": undefined,
	"outFile": undefined,
	"paths": {},
	"preserveConstEnums": false,
	"preserveSymlinks": false,
	"preserveValueImports": false,
	"reactNamespace": "React",
	"removeComments": false,
	"resolveJsonModule": true,
	"rootDir": undefined,
	"rootDirs": [],
	"skipDefaultLibCheck": false,
	"skipLibCheck": false,
	"sourceMap": false,
	"sourceRoot": undefined,
	"strict": true,
	"strictBindCallApply": true,
	"strictFunctionTypes": true,
	"strictNullChecks": true,
	"strictPropertyInitialization": true,
	"stripInternal": false,
	"suppressExcessPropertyErrors": false,
	"suppressImplicitAnyIndexErrors": false,
	"target": ScriptTarget.ES2022,
	"traceResolution": false,
	"tsBuildInfoFile": undefined,
	"typeRoots": [],
	"useDefineForClassFields": true,
	"useUnknownInCatchVariables": true
}

// ---------------------------------------------------------------------------

type TAstFilterFunc = (node: Node) => boolean

export class AstWalker extends Walker<Node> {

	filterFunc: (TAstFilterFunc | undefined)
	hOptions: hash

	// ..........................................................

	constructor(
			filterFunc1: (TAstFilterFunc | undefined) = undef,
			hOptions1 = {}
			) {
		super()
		this.filterFunc = filterFunc1;
		this.hOptions = hOptions1;
	}

	// ..........................................................

	dbg(op: 'push' | 'pop', node: Node): void {
		const prefix = '   '
		const kind = node.kind
		console.log(`${prefix}${op.toUpperCase()}: ${kind} [${this.stackDesc()}]`)
		return
	}

	// ..........................................................

	stackDesc(): string {
		const results = []
		for (const node of this.lNodeStack) {
			results.push(node.kind.toString())
		}
		const lStack = results
		return lStack.join(',')
	}

	// ..........................................................

	override pushNode(node: Node): void {
		super.pushNode(node)
		if (this.hOptions.trace) {
			this.dbg('push', node)
		}
		return
	}

	// ..........................................................

	override popNode(): (Node | undefined) {
		const node = super.popNode()
		if (this.hOptions.trace) {
			if (defined(node)) {
				this.dbg('pop', node)
			}
			else {
				console.log("STACK EMPTY")
			}
		}
		return node
	}

	// ..........................................................

	override isNode(x: object): x is Node {
		return Object.hasOwn(x, 'kind')
	}

	// ..........................................................

	override filter(node: Node): boolean {
		return (defined(this.filterFunc)? this.filterFunc(node) : true)
	}
}

// ---------------------------------------------------------------------------

export class CAnalysis {
	mImports: CStringSetMap = new CStringSetMap()
	mExports: Map<string, string> = new Map<string, string>()
	mainScope: CMainScope = new CMainScope()
	curScope: CScope
	finished: boolean = false

	// ..........................................................

	constructor() {
		this.curScope = this.mainScope
	}

	// ..........................................................

	define(name: string): void {
		this.curScope.define(name)
		return
	}

	// ..........................................................

	use(name: string): void {
		if (!hasKey(globalThis, name)) {
			this.curScope.use(name)
		}
		return
	}

	// ..........................................................

	addImport(lib: string, name: string): void {
		this.mImports.add(lib, name)
		this.define(name)
		return
	}

	// ..........................................................

	addExport(name: string, type: string): void {
		this.mExports.set(name, type)
		return
	}

	// ..........................................................

	getImports(): TBlockDesc {
		const hImports: hashof<string[]> = {}
		for (const [lib, sNames] of this.mImports.entries()) {
			hImports[lib] = Array.from(sNames.values())
		}
		return hImports
	}

	// ..........................................................

	getExports(): string[] {
		return Array.from(this.mExports.keys())
	}

	// ..........................................................

	newScope(name: (string | undefined), lArgs: string[]): void {
		this.curScope = this.mainScope.newScope(name, lArgs)
		return
	}

	// ..........................................................

	endScope(): void {
		const scope = this.mainScope.endScope(this.curScope)
		if (defined(scope)) {
			this.curScope = scope
		}
		else {
			this.finished = true
		}
		return
	}

	// ..........................................................

	getMissing(): string[] {
		const walker = new Walker<CScope>()
		walker.isNode = (x: unknown) => {
			return (x instanceof CScope)
		}
		// --- Find all names that are used, but not defined
		const sNames = new Set<string>()
		for (const scope of walker.walk(this.mainScope)) {
			for (const name of scope.allUsed()) {
				if (!scope.isDefined(name)) {
					sNames.add(name)
				}
			}
		}
		return Array.from(sNames.values())
	}

	// ..........................................................

	getExtra(): string[] {
		const walker = new Walker<CScope>()
		walker.isNode = (x: unknown) => {
			return (x instanceof CScope)
		}
		// --- Find all names that are defined, but never used or exported
		const sNames = new Set<string>()
		for (const scope of walker.walk(this.mainScope)) {
			for (const name of scope.allDefined()) {
				if (!scope.isUsed(name) && !this.mExports.has(name)) {
					sNames.add(name)
				}
			}
		}
		return Array.from(sNames.values())
	}

	// ..........................................................

	asString(width: integer = 64): string {
		const h: TBlockDesc = {
			IMPORTS: this.getImports(),
			EXPORTS: this.getExports(),
			MISSING: this.getMissing(),
			EXTRA: this.getExtra()
			}

		if (isEmpty(h.IMPORTS)) {
			delete h.IMPORTS
		}
		if (isEmpty(h.EXPORTS)) {
			delete h.EXPORTS
		}
		if (isEmpty(h.MISSING)) {
			delete h.MISSING
		}
		if (isEmpty(h.EXTRA)) {
			delete h.EXTRA
		}
		return Blockify(h)
	}
}

// ---------------------------------------------------------------------------

export const assertIsNode: (x: unknown) => asserts x is Node = (x: unknown): asserts x is Node => {

	assert(hasKey(x, 'kind'), `Not a Node: ${typeof x}`)
}

// ---------------------------------------------------------------------------

export const getNode = (x: unknown, dspath: string | TPathItem[]): Node => {

	const val = extract(x, dspath)
	assertIsNode(val)
	return val
}

// ---------------------------------------------------------------------------

export const analyze = (tsCode: string, hOptions: hash = {}): CAnalysis => {

	type opt = {
		fileName: (string | undefined)
		dump: boolean
		trace: boolean
		}
	const {fileName, dump, trace} = getOptions<opt>(hOptions, {
		fileName: undef,
		dump: false,
		trace: false
		})

	const analysis = new CAnalysis()
	const walker = new AstWalker()
	const hAst = ts2ast(tsCode)
	if (dump) {
		LOG(sep('=', 'AST'))
		LOG(astAsString(hAst))
		LOG(sep('='))
	}

	// ..........................................................

	const checkNode = (node: unknown, dspath: (string | undefined) = undef): void => {
		assertIsNode(node)
		if (defined(dspath)) {
			node = getNode(node, dspath)
			assertIsNode(node)
		}
		if (node.kind === 80) {
			const name = getString(node, '.escapedText')
			analysis.use(name)
		}
		return
	}

	// ..........................................................

	for (const [vkind, node] of walker.walkEx(hAst)) {
		const {kind} = node
		if (trace) {
			LOG(`NODE KIND: ${kind} (${kindStr(kind)})`)
		}
		if (vkind === 'exit') {
			switch(kind) {
				case 220:
				case 263: {
					analysis.endScope();break;
				}
			}
		}
		else if (vkind === 'enter') {
			switch(kind) {
				case 220: {
					{
						const results1 = []
						for (const parm of getArray(node, '.parameters')) {
							results1.push(getString(parm, '.name.escapedText'))
						}
						const lParms = results1
						analysis.newScope(undef, lParms)
					};break;
				}
				case 261: {
					try {
						const varName = getString(node, '.name.escapedText')
						analysis.define(varName)
					} catch(e) {};break;
				}
				case 263: {
					{
						const funcName = getString(node, '.name.escapedText')
						const results2 = []
						for (const parm of getArray(node, '.parameters')) {
							results2.push(getString(parm, '.name.escapedText'))
						}
						const lParms = results2
						analysis.define(funcName)
						analysis.newScope(funcName, lParms)
					};break;
				}
				case 227: {
					checkNode(node, '.left')
					checkNode(node, '.right');break;
				}
				case 214: {
					checkNode(node, '.expression')
					for (const arg of getArray(node, '.arguments')) {
						checkNode(arg)
					};break;
				}
				case 273: {
					const lib = getString(node, '.moduleSpecifier.text')
					for (const h of getArray(node, '.importClause.namedBindings.elements')) {
						const name = getString(h, '.name.escapedText')
						if (trace) {
							console.log(`NAME: '${name}' in '${lib}'`)
						}
						analysis.addImport(lib, name)
					};break;
				}
				case 280: {
					for (const elem of getArray(node, '.elements')) {
						const name = getString(elem, '.name.escapedText')
						analysis.addExport(name, 're-export')
					};break;
				}
				case 95: {
					const parent = walker.parent()
					switch(getNumber(parent, '.kind')) {
						case 244: {
							for (const decl of getArray(parent, '.declarationList.declarations')) {
								switch(getNumber(decl, '.kind')) {
									case 261: {
										const name = getString(decl, '.name.escapedText')
										// --- Check initializer to find the type
										const initKind = getNumber(decl, '.initializer.kind')
										switch(initKind) {
											case 220: {
												analysis.addExport(name, 'function');break;
											}
											case 261:
											case 9: {
												analysis.addExport(name, 'const');break;
											}
											default:
												analysis.addExport(name, 'unknown')
										};break;
									}
								}
							};break;
						}
						case 263: {
							const name = getString(parent, '.name.escapedText')
							analysis.addExport(name, 'function');break;
						}
						case 264: {
							const name = getString(parent, '.name.escapedText')
							analysis.addExport(name, 'class');break;
						}
						case 266: {
							const name = getString(parent, '.name.escapedText')
							analysis.addExport(name, 'type');break;
						}
						default:
							croak(`Unexpected subtype of 95: ${parent.kind}`)
					};break;
				}
				default:
					if (trace) {
						LOG("   ...ignored")
					}
			}
		}
	}
	return analysis
}