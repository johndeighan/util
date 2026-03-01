"use strict";
// typescript.lib.civet

import {existsSync} from '@std/fs'
import {statSync} from 'node-fs'
import {
	SourceFile, Node, ScriptTarget, SyntaxKind, ModuleKind,
	NewLineKind, EmitHint, CompilerOptions, ModuleResolutionKind,
	createSourceFile, createPrinter, createProgram,
	transpileModule, getPreEmitDiagnostics, forEachChild,
	flattenDiagnosticMessageText, getLineAndCharacterOfPosition,
	} from 'npm-typescript'

import {
	undef, defined, notdefined, integer, hash, hashof,
	isHash, TFilterFunc, isString, isEmpty, nonEmpty, isNumber,
	assert, croak, isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	getOptions, spaces, o, words, hasKey,
	CStringSetMap, keys, sep,
	} from 'llutils'
import {f} from 'f-strings'
import {
	extract, TPathItem, getString, getNumber, getArray,
	} from 'extract'
import {TBlockDesc, Blockify} from 'indent'
import {
	LOG, DBG, ERR, LOGVALUE, INDENT, UNDENT, DBGVALUE,
	pushLogLevel, popLogLevel,
	} from 'logger'
import {isFile, slurp, barf, barfTempFile, fileExt} from 'fsys'
import {OL, toNice, TMapFunc, DUMP} from 'to-nice'
import {execCmdSync} from 'exec'
import {extractSourceMap} from 'source-map'
import {Walker, TVisitKind} from 'walker'
import {CMainScope, CScope} from 'scope'
import {getNeededImportStmts} from 'symbols'
import {MAP} from 'map'

const decoder = new TextDecoder("utf-8")

// ---------------------------------------------------------------------------

export const kindStr = (i: number): string => {

	return SyntaxKind[i]
}

// ---------------------------------------------------------------------------

export const ts2ast = (
		tsCode: string,
		hOptions: hash = {}
		): Node => {

	type opt = {
		fileName: string
		}
	const {fileName} = getOptions<opt>(hOptions, {
		fileName: 'temp.ts'
		})

	const [code, hSrcMap] = extractSourceMap(tsCode)
	const hAst = createSourceFile(fileName, code, ScriptTarget.Latest)
	return hAst
}

// ---------------------------------------------------------------------------

export const ast2ts = (node: Node): string => {

	assert((node.kind === 308), "Not a SourceFile node")
	const printer = createPrinter({newLine: NewLineKind.LineFeed})
	return printer.printNode(EmitHint.Unspecified, node, node as SourceFile)
}

// ---------------------------------------------------------------------------
// --- passed to toNice() to add a description to some nodes

export const descFunc: TMapFunc = (
		key: string,
		value: unknown,
		hParent: unknown
		): string => {

	return (key === 'kind') && isNumber(value) ? f`(${kindStr(value)})` : ''
}

// ---------------------------------------------------------------------------

export const astAsString = (
		hAst: Node,
		hOptions: hash = {}
		): string => {

	type opt = {
		lInclude: ((string[]) | undefined)
		}
	const {lInclude} = getOptions<opt>(hOptions, {
		lInclude: undef
		})

	return toNice(hAst, {
		ignoreEmptyKeys: true,
		descFunc,
		lInclude,
		lExclude: words(`pos end id flags modifierFlagsCache
transformFlags hasExtendedUnicodeEscape
numericLiteralFlags setExternalModuleIndicator
languageVersion languageVariant jsDocParsingMode
hasNoDefaultLib`)
		})
}

// ---------------------------------------------------------------------------

export const typeCheckTsFile = (path: string): string => {

	assert(isFile(path), `No such file: ${path}`)
	const {success, stderr} = execCmdSync('deno', ['check', path])
	if (success) {
		return ''
	}
	else {
		return stderr ? stderr : 'Unknown error'
	}
}

// ---------------------------------------------------------------------------
// --- We must place the TypeScript file at the project root
//     so that paths gotten from .symbols resolve correctly

export const typeCheckTsCode = (
		tsCode: string
		): string => {

	const path = "./_typecheck_.ts"
	barf(path, tsCode)
	return typeCheckTsFile(path)
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

type TSplitResult = [string[], string]

export const splitFuncStr = (valueStr: string): (TSplitResult | undefined) => {

	let ref;if ((ref = valueStr.match(/^\(([^\)]*)\)\s*[\=\-]\>\s*(.*)$/))) {const lMatches = ref;
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

	let ref1;let ref2;if ((ref1 = typeStr.match(/^([A-Za-z][A-Za-z0-9+]*)(?:\<([A-Za-z][A-Za-z0-9+]*)\>)?$/))) {const lMatches = ref1;
		const [_, type, subtype] = lMatches
		return nonEmpty(subtype) ? [type, subtype] : [type]
	}
	else if ((ref2 = typeStr.match(/^\(\)\s*\=\>\s*([A-Za-z][A-Za-z0-9+]*)$/))) {const lMatches = ref2;
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

		return defined(this.filterFunc) ? this.filterFunc(node) : true
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

		// --- this condition should filter built-ins
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

export const assertIsNode: (
		x: unknown
		) => asserts x is Node = (x: unknown): asserts x is Node => {

	assert(hasKey(x, 'kind'), `Not a Node: ${typeof x}`)
}

// ---------------------------------------------------------------------------

export const getNode = (x: unknown, dspath: string | TPathItem[]): Node => {

	const val = extract(x, dspath)
	assertIsNode(val)
	return val
}

// ---------------------------------------------------------------------------

export const analyzeTS = (
		tsCode: string,
		hOptions: hash = {}
		): CAnalysis => {

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

	debugger
	const analysis = new CAnalysis()
	const walker = new AstWalker()

	const hAst = ts2ast(tsCode)

	if (dump) {
		DUMP(hAst, 'AST')
	}

	// ..........................................................

	const checkNode = (
			node: unknown,
			dspath: (string | undefined) = undef
			): void => {

		assertIsNode(node)
		if (defined(dspath)) {
			node = getNode(node, dspath)
			assertIsNode(node)
		}
		if (node.kind === 80) {   // --- Identifier
			const name = getString(node, '.escapedText')
			analysis.use(name)
		}
		return
	}

	// ..........................................................

	for (const [vkind, node] of walker.walkEx(hAst)) {
		const {kind} = node
		if (trace) {
			LOG(f`NODE ${kind}:3 (${kindStr(kind)})`)
		}

		if (vkind === 'exit') {
			switch(kind) {

				case 220:case 263: {   // ArrowFunction, FunctionDeclaration
					analysis.endScope();break;
				}
			}
		}

		else if (vkind === 'enter') {

			switch(kind) {

				case 220: {    // ArrowFunction
					{
						const lParms = MAP(getArray(node, '.parameters'), function*(x) {
							yield getString(x, '.name.escapedText')
						})

						if (trace) {
							LOG(`   Arrow Func := (${lParms.join(',')}) =>`)
						}
						analysis.newScope(undef, lParms)
					};break;
				}

				case 261: {    // VariableDeclaration
					try {
						const varName = getString(node, '.name.escapedText')
						analysis.define(varName)
					} catch(e) {};break;
				}

				case 263: {    // FunctionDeclaration
					// --- do creates a scope, a la an IIFE
					{
						const funcName = getString(node, '.name.escapedText')

						const lParms = MAP(getArray(node, '.parameters'), function*(x) {
							yield getString(x, '.name.escapedText')
						})
						if (trace) {
							LOG(`   function ${funcName}(${lParms.join(',')})`)
						}
						analysis.define(funcName)
						analysis.newScope(funcName, lParms)
					};break;
				}

				case 227: {    // BinaryExpression
					checkNode(node, '.left')
					checkNode(node, '.right');break;
				}

				case 214: {    // CallExpression
					checkNode(node, '.expression')
					for (const arg of getArray(node, '.arguments')) {
						checkNode(arg)
					};break;
				}

				case 273: {    // ImportDeclaration
					const lib = getString(node, '.moduleSpecifier.text')
					for (const h of getArray(node, '.importClause.namedBindings.elements')) {
						const name = getString(h, '.name.escapedText')
						if (trace) {
							console.log(`NAME: '${name}' in '${lib}'`)
						}
						analysis.addImport(lib, name)
					};break;
				}

				case 280: {    // NamedExports
					for (const elem of getArray(node, '.elements')) {
						const name = getString(elem, '.name.escapedText')
						analysis.addExport(name, 're-export')
					};break;
				}

				case 95: {     // ExportKeyword
					const parent = walker.parent()
					switch(getNumber(parent, '.kind')) {

						case 244: {    // FirstStatement
							for (const decl of getArray(parent, '.declarationList.declarations')) {
								switch(getNumber(decl, '.kind')) {

									case 261: {    // VariableDeclaration
										const name = getString(decl, '.name.escapedText')
										// --- Check initializer to find the type
										const initKind = getNumber(decl, '.initializer.kind')
										switch(initKind) {

											case 220: {    // ArrowFunction
												analysis.addExport(name, 'function');break;
											}

											case 9:case 261: { // FirstLiteralToken, VariableDeclaration
												analysis.addExport(name, 'const');break;
											}

											default:
												analysis.addExport(name, 'unknown')
										};break;
									}
								}
							};break;
						}

						case 263: {   // FunctionDeclaration
							const name = getString(parent, '.name.escapedText')
							analysis.addExport(name, 'function');break;
						}

						case 264: {   // ClassDeclaration
							const name = getString(parent, '.name.escapedText')
							analysis.addExport(name, 'class');break;
						}

						case 266: {   // TypeAliasDeclaration
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcdHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvdHlwZXNjcmlwdC5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSx1QkFBc0I7QUFDdEIsQUFBQTtBQUNBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQ2hDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3hELENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDOUQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsQ0FBQztBQUNoRCxDQUFDLGVBQWUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3RELENBQUMsNEJBQTRCLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQztBQUM3RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNuRCxDQUFDLE1BQU0sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUM1RCxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcs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RUFBQSxDQUFBO0FBQ3JCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsU0FBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDM0MsQUFBQTtBQUNBLEFBQUEsRUFBRSxJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQSxBQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUN6QixBQUFBLEVBQUUsSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUNkLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsU0FBVSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDNUMsQUFBQTtBQUNBLEFBQUEsRUFBRSxJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUMxQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUEsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSxFQUE0QixNQUExQixRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQyxBQUFBLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUM5QyxBQUFBLEVBQUUsTUFBTSxDQUFDLFE7Q0FBUSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUN2QixBQUFBO0FBQ0EsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFFBQVMsQ0FBQyxJQUFJLEMsQyxDQUFDLEFBQUMsTSxZLENBQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQy9DLEFBQUE7QUFDQSxBQUFBLEVBQUUsSSxDQUFDLFFBQVEsQyxDQUFFLENBQUMsSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzlDLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLEVBQU8sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLEksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQTtBQUN4QyxBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FB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ZXRcblxuaW1wb3J0IHtleGlzdHNTeW5jfSBmcm9tICdAc3RkL2ZzJ1xuaW1wb3J0IHtzdGF0U3luY30gZnJvbSAnbm9kZS1mcydcbmltcG9ydCB7XG5cdFNvdXJjZUZpbGUsIE5vZGUsIFNjcmlwdFRhcmdldCwgU3ludGF4S2luZCwgTW9kdWxlS2luZCxcblx0TmV3TGluZUtpbmQsIEVtaXRIaW50LCBDb21waWxlck9wdGlvbnMsIE1vZHVsZVJlc29sdXRpb25LaW5kLFxuXHRjcmVhdGVTb3VyY2VGaWxlLCBjcmVhdGVQcmludGVyLCBjcmVhdGVQcm9ncmFtLFxuXHR0cmFuc3BpbGVNb2R1bGUsIGdldFByZUVtaXREaWFnbm9zdGljcywgZm9yRWFjaENoaWxkLFxuXHRmbGF0dGVuRGlhZ25vc3RpY01lc3NhZ2VUZXh0LCBnZXRMaW5lQW5kQ2hhcmFjdGVyT2ZQb3NpdGlvbixcblx0fSBmcm9tICducG0tdHlwZXNjcmlwdCdcblxuaW1wb3J0IHtcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGludGVnZXIsIGhhc2gsIGhhc2hvZixcblx0aXNIYXNoLCBURmlsdGVyRnVuYywgaXNTdHJpbmcsIGlzRW1wdHksIG5vbkVtcHR5LCBpc051bWJlcixcblx0YXNzZXJ0LCBjcm9haywgaXNGdW5jdGlvbiwgZnVuY3Rpb25EZWYsIGlzQ2xhc3MsIGNsYXNzRGVmLFxuXHR9IGZyb20gJ2RhdGF0eXBlcydcbmltcG9ydCB7XG5cdGdldE9wdGlvbnMsIHNwYWNlcywgbywgd29yZHMsIGhhc0tleSxcblx0Q1N0cmluZ1NldE1hcCwga2V5cywgc2VwLFxuXHR9IGZyb20gJ2xsdXRpbHMnXG5pbXBvcnQge2Z9IGZyb20gJ2Ytc3RyaW5ncydcbmltcG9ydCB7XG5cdGV4dHJhY3QsIFRQYXRoSXRlbSwgZ2V0U3RyaW5nLCBnZXROdW1iZXIsIGdldEFycmF5LFxuXHR9IGZyb20gJ2V4dHJhY3QnXG5pbXBvcnQge1RCbG9ja0Rlc2MsIEJsb2NraWZ5fSBmcm9tICdpbmRlbnQnXG5pbXBvcnQge1xuXHRMT0csIERCRywgRVJSLCBMT0dWQUxVRSwgSU5ERU5ULCBVTkRFTlQsIERCR1ZBTFVFLFxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLFxuXHR9IGZyb20gJ2xvZ2dlcidcbmltcG9ydCB7aXNGaWxlLCBzbHVycCwgYmFyZiwgYmFyZlRlbXBGaWxlLCBmaWxlRXh0fSBmcm9tICdmc3lzJ1xuaW1wb3J0IHtPTCwgdG9OaWNlLCBUTWFwRnVuYywgRFVNUH0gZnJvbSAndG8tbmljZSdcbmltcG9ydCB7ZXhlY0NtZFN5bmN9IGZyb20gJ2V4ZWMnXG5pbXBvcnQge2V4dHJhY3RTb3VyY2VNYXB9IGZyb20gJ3NvdXJjZS1tYXAnXG5pbXBvcnQge1dhbGtlciwgVFZpc2l0S2luZH0gZnJvbSAnd2Fsa2VyJ1xuaW1wb3J0IHtDTWFpblNjb3BlLCBDU2NvcGV9IGZyb20gJ3Njb3BlJ1xuaW1wb3J0IHtnZXROZWVkZWRJbXBvcnRTdG10c30gZnJvbSAnc3ltYm9scydcbmltcG9ydCB7TUFQfSBmcm9tICdtYXAnXG5cbmRlY29kZXIgOj0gbmV3IFRleHREZWNvZGVyIFwidXRmLThcIlxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQga2luZFN0ciA6PSAoaTogbnVtYmVyKTogc3RyaW5nID0+XG5cblx0cmV0dXJuIFN5bnRheEtpbmRbaV1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHRzMmFzdCA6PSAoXG5cdFx0dHNDb2RlOiBzdHJpbmcsXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IE5vZGUgPT5cblxuXHR0eXBlIG9wdCA9IHtcblx0XHRmaWxlTmFtZTogc3RyaW5nXG5cdFx0fVxuXHR7ZmlsZU5hbWV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGZpbGVOYW1lOiAndGVtcC50cydcblx0XHR9XG5cblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAodHNDb2RlKVxuXHRoQXN0IDo9IGNyZWF0ZVNvdXJjZUZpbGUgZmlsZU5hbWUsIGNvZGUsIFNjcmlwdFRhcmdldC5MYXRlc3Rcblx0cmV0dXJuIGhBc3RcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGFzdDJ0cyA6PSAobm9kZTogTm9kZSk6IHN0cmluZyA9PlxuXG5cdGFzc2VydCAobm9kZS5raW5kID09IDMwOCksIFwiTm90IGEgU291cmNlRmlsZSBub2RlXCJcblx0cHJpbnRlciA6PSBjcmVhdGVQcmludGVyIG5ld0xpbmU6IE5ld0xpbmVLaW5kLkxpbmVGZWVkXG5cdHJldHVybiBwcmludGVyLnByaW50Tm9kZShFbWl0SGludC5VbnNwZWNpZmllZCwgbm9kZSwgbm9kZSBhcyBTb3VyY2VGaWxlKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyAtLS0gcGFzc2VkIHRvIHRvTmljZSgpIHRvIGFkZCBhIGRlc2NyaXB0aW9uIHRvIHNvbWUgbm9kZXNcblxuZXhwb3J0IGRlc2NGdW5jOiBUTWFwRnVuYyA6PSAoXG5cdFx0a2V5OiBzdHJpbmdcblx0XHR2YWx1ZTogdW5rbm93blxuXHRcdGhQYXJlbnQ6IHVua25vd25cblx0XHQpOiBzdHJpbmcgPT5cblxuXHRyZXR1cm4gKGtleSA9PSAna2luZCcpICYmIGlzTnVtYmVyKHZhbHVlKSA/IGZcIigje2tpbmRTdHIodmFsdWUpfSlcIiA6ICcnXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhc3RBc1N0cmluZyA6PSAoXG5cdFx0aEFzdDogTm9kZSxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogc3RyaW5nID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0bEluY2x1ZGU6IHN0cmluZ1tdP1xuXHRcdH1cblx0e2xJbmNsdWRlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRsSW5jbHVkZTogdW5kZWZcblx0XHR9XG5cblx0cmV0dXJuIHRvTmljZSBoQXN0LCB7XG5cdFx0aWdub3JlRW1wdHlLZXlzOiB0cnVlXG5cdFx0ZGVzY0Z1bmNcblx0XHRsSW5jbHVkZVxuXHRcdGxFeGNsdWRlOiB3b3JkcyhcIlwiXCJcblx0XHRcdHBvcyBlbmQgaWQgZmxhZ3MgbW9kaWZpZXJGbGFnc0NhY2hlXG5cdFx0XHR0cmFuc2Zvcm1GbGFncyBoYXNFeHRlbmRlZFVuaWNvZGVFc2NhcGVcblx0XHRcdG51bWVyaWNMaXRlcmFsRmxhZ3Mgc2V0RXh0ZXJuYWxNb2R1bGVJbmRpY2F0b3Jcblx0XHRcdGxhbmd1YWdlVmVyc2lvbiBsYW5ndWFnZVZhcmlhbnQganNEb2NQYXJzaW5nTW9kZVxuXHRcdFx0aGFzTm9EZWZhdWx0TGliXG5cdFx0XHRcIlwiXCIpXG5cdFx0fVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgdHlwZUNoZWNrVHNGaWxlIDo9IChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHRhc3NlcnQgaXNGaWxlKHBhdGgpLCBcIk5vIHN1Y2ggZmlsZTogI3twYXRofVwiXG5cdHtzdWNjZXNzLCBzdGRlcnJ9IDo9IGV4ZWNDbWRTeW5jICdkZW5vJywgWydjaGVjaycsIHBhdGhdXG5cdGlmIHN1Y2Nlc3Ncblx0XHRyZXR1cm4gJydcblx0ZWxzZVxuXHRcdHJldHVybiBzdGRlcnIgPyBzdGRlcnIgOiAnVW5rbm93biBlcnJvcidcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgLS0tIFdlIG11c3QgcGxhY2UgdGhlIFR5cGVTY3JpcHQgZmlsZSBhdCB0aGUgcHJvamVjdCByb290XG4jICAgICBzbyB0aGF0IHBhdGhzIGdvdHRlbiBmcm9tIC5zeW1ib2xzIHJlc29sdmUgY29ycmVjdGx5XG5cbmV4cG9ydCB0eXBlQ2hlY2tUc0NvZGUgOj0gKFxuXHRcdHRzQ29kZTogc3RyaW5nXG5cdFx0KTogc3RyaW5nID0+XG5cblx0cGF0aCA6PSBcIi4vX3R5cGVjaGVja18udHNcIlxuXHRiYXJmIHBhdGgsIHRzQ29kZVxuXHRyZXR1cm4gdHlwZUNoZWNrVHNGaWxlIHBhdGhcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuIyAtLS0gV2UgbmVlZCB0byBhZGQgJzp1bmtub3duJyB0byBhbnkgZnVuY3Rpb24gcGFyYW1ldGVyc1xuIyAgICAgdGhhdCBkb24ndCBoYXZlIGFuIGV4cGxpY2l0IHR5cGVcblxuZXhwb3J0IGdldFRzQ29kZSA6PSAoXG5cdFx0dHlwZVN0cjogc3RyaW5nLFxuXHRcdHZhbHVlU3RyOiBzdHJpbmdcblx0XHQpOiBzdHJpbmcgPT5cblxuXHREQkdWQUxVRSAndHlwZVN0cicsIHR5cGVTdHJcblx0REJHVkFMVUUgJ3ZhbHVlU3RyJywgdmFsdWVTdHJcblx0cmVzdWx0IDo9IHNwbGl0RnVuY1N0ciB2YWx1ZVN0clxuXHRpZiBkZWZpbmVkKHJlc3VsdClcblx0XHRbbFBhcm1zLCBib2R5XSA6PSByZXN1bHRcblx0XHRhZGRUeXBlIDo9IChwYXJtOiBzdHJpbmcpOiBzdHJpbmcgPT5cblx0XHRcdGlmIHBhcm0uaW5kZXhPZignOicpID49IDBcblx0XHRcdFx0cmV0dXJuIHBhcm1cblx0XHRcdGVsc2Vcblx0XHRcdFx0cmV0dXJuIFwiI3twYXJtfTogdW5rbm93blwiXG5cdFx0cGFybVN0ciA6PSBsUGFybXMubWFwKGFkZFR5cGUpLmpvaW4gJywgJ1xuXHRcdHJldHVybiBcImNvbnN0IHg6ICN7dHlwZVN0cn0gPSAoI3twYXJtU3RyfSkgPT4gI3tib2R5fVwiXG5cdGVsc2Vcblx0XHRyZXR1cm4gXCJjb25zdCB4OiAje3R5cGVTdHJ9ID0gI3t2YWx1ZVN0cn1cIlxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG50eXBlIFRTcGxpdFJlc3VsdCA9IFtzdHJpbmdbXSwgc3RyaW5nXVxuXG5leHBvcnQgc3BsaXRGdW5jU3RyIDo9ICh2YWx1ZVN0cjogc3RyaW5nKTogVFNwbGl0UmVzdWx0PyA9PlxuXG5cdGlmIChsTWF0Y2hlcyA6PSB2YWx1ZVN0ci5tYXRjaCgvXlxcKChbXlxcKV0qKVxcKVxccypbXFw9XFwtXVxcPlxccyooLiopJC8pKVxuXHRcdFtfLCBzdHJQYXJtcywgc3RyQm9keV0gOj0gbE1hdGNoZXNcblx0XHRpZiBpc0VtcHR5KHN0clBhcm1zKVxuXHRcdFx0cmV0dXJuIFtbXSwgc3RyQm9keV1cblx0XHRlbHNlXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRzdHJQYXJtcy5zcGxpdCgnLCcpLm1hcCgoeCkgPT4geC50cmltKCkpXG5cdFx0XHRcdHN0ckJvZHlcblx0XHRcdFx0XVxuXHRlbHNlXG5cdFx0cmV0dXJuIHVuZGVmXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBnZXRJbXBvcnRDb2RlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHREQkcgXCJDQUxMIGdldEltcG9ydENvZGUoKVwiXG5cdGxTeW1ib2xzIDo9IGdldFN5bWJvbHNGcm9tVHlwZSB0eXBlU3RyXG5cdERCR1ZBTFVFICdsU3ltYm9scycsIGxTeW1ib2xzXG5cdGlmIG5vbkVtcHR5KGxTeW1ib2xzKVxuXHRcdGxTdG10cyA6PSBnZXROZWVkZWRJbXBvcnRTdG10cyBsU3ltYm9sc1xuXHRcdERCR1ZBTFVFICdsU3RtdHMnLCBsU3RtdHNcblx0XHRyZXR1cm4gbFN0bXRzLmpvaW4gJ1xcbidcblx0ZWxzZVxuXHRcdHJldHVybiAnJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgZ2V0U3ltYm9sc0Zyb21UeXBlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxuXG5cdGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eKFtBLVphLXpdW0EtWmEtejAtOStdKikoPzpcXDwoW0EtWmEtel1bQS1aYS16MC05K10qKVxcPik/JC8pKVxuXHRcdFtfLCB0eXBlLCBzdWJ0eXBlXSA6PSBsTWF0Y2hlc1xuXHRcdHJldHVybiBub25FbXB0eShzdWJ0eXBlKSA/IFt0eXBlLCBzdWJ0eXBlXSA6IFt0eXBlXVxuXHRlbHNlIGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eXFwoXFwpXFxzKlxcPVxcPlxccyooW0EtWmEtel1bQS1aYS16MC05K10qKSQvKSlcblx0XHRyZXR1cm4gW2xNYXRjaGVzWzFdXVxuXHRlbHNlXG5cdFx0cmV0dXJuIFtdXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmhEZWZDb25maWc6IENvbXBpbGVyT3B0aW9ucyA6PSB7XG5cdFwiYWxsb3dKc1wiOiBmYWxzZVxuXHRcImFsbG93VW1kR2xvYmFsQWNjZXNzXCI6IGZhbHNlXG5cdFwiYWxsb3dVbnJlYWNoYWJsZUNvZGVcIjogZmFsc2Vcblx0XCJhbGxvd1VudXNlZExhYmVsc1wiOiBmYWxzZVxuXHRcImFsd2F5c1N0cmljdFwiOiB0cnVlXG5cdFwiYXNzdW1lQ2hhbmdlc09ubHlBZmZlY3REaXJlY3REZXBlbmRlbmNpZXNcIjogZmFsc2Vcblx0XCJjaGVja0pzXCI6IGZhbHNlXG5cdFwiY29tcG9zaXRlXCI6IGZhbHNlXG5cdFwiZGVjbGFyYXRpb25cIjogZmFsc2Vcblx0XCJkZWNsYXJhdGlvbkRpclwiOiB1bmRlZmluZWRcblx0XCJkZWNsYXJhdGlvbk1hcFwiOiBmYWxzZVxuXHRcImVtaXRCT01cIjogZmFsc2Vcblx0XCJlbWl0RGVjbGFyYXRpb25Pbmx5XCI6IGZhbHNlXG5cdFwiZXhhY3RPcHRpb25hbFByb3BlcnR5VHlwZXNcIjogZmFsc2Vcblx0XCJleHBlcmltZW50YWxEZWNvcmF0b3JzXCI6IGZhbHNlXG5cdFwiZm9yY2VDb25zaXN0ZW50Q2FzaW5nSW5GaWxlTmFtZXNcIjogdHJ1ZVxuXHRcImdlbmVyYXRlQ3B1UHJvZmlsZVwiOiBudWxsXG5cdFwiZ2VuZXJhdGVUcmFjZVwiOiBudWxsXG5cdFwiaWdub3JlRGVwcmVjYXRpb25zXCI6IFwiNS4wXCJcblx0XCJpbXBvcnRIZWxwZXJzXCI6IGZhbHNlXG5cdFwiaW5saW5lU291cmNlTWFwXCI6IGZhbHNlXG5cdFwiaW5saW5lU291cmNlc1wiOiBmYWxzZVxuXHRcImlzb2xhdGVkTW9kdWxlc1wiOiBmYWxzZVxuXHQjXHRcImpzeFwiOiBcInJlYWN0LWpzeFwiLFxuXHQjXHRcImpzeEZhY3RvcnlcIjogXCJSZWFjdC5jcmVhdGVFbGVtZW50XCIsXG5cdCNcdFwianN4RnJhZ21lbnRGYWN0b3J5XCI6IFwiUmVhY3QuRnJhZ21lbnRcIixcblx0I1x0XCJqc3hJbXBvcnRTb3VyY2VcIjogXCJyZWFjdFwiLFxuXHRcImxpYlwiOiBbXG5cdFx0XCJlc25leHRcIlxuXHRcdFwiZG9tXCJcblx0XHRcImRvbS5pdGVyYWJsZVwiXG5cdF1cblx0XCJtYXBSb290XCI6IHVuZGVmaW5lZFxuXHRcIm1heE5vZGVNb2R1bGVKc0RlcHRoXCI6IDBcblx0XCJtb2R1bGVcIjogTW9kdWxlS2luZC5FU05leHRcblx0XCJtb2R1bGVEZXRlY3Rpb25cIjogdW5kZWZpbmVkXG5cdFwibW9kdWxlUmVzb2x1dGlvblwiOiBNb2R1bGVSZXNvbHV0aW9uS2luZC5Ob2RlTmV4dFxuXHRcIm5ld0xpbmVcIjogTmV3TGluZUtpbmQuTGluZUZlZWRcblx0XCJub0VtaXRcIjogdHJ1ZVxuXHRcIm5vRW1pdEhlbHBlcnNcIjogZmFsc2Vcblx0XCJub0VtaXRPbkVycm9yXCI6IGZhbHNlXG5cdFwibm9FcnJvclRydW5jYXRpb25cIjogZmFsc2Vcblx0XCJub0ZhbGx0aHJvdWdoQ2FzZXNJblN3aXRjaFwiOiB0cnVlXG5cdFwibm9JbXBsaWNpdEFueVwiOiB0cnVlXG5cdFwibm9JbXBsaWNpdE92ZXJyaWRlXCI6IHRydWVcblx0XCJub0ltcGxpY2l0UmV0dXJuc1wiOiB0cnVlXG5cdFwibm9JbXBsaWNpdFRoaXNcIjogdHJ1ZVxuXHRcIm5vUHJvcGVydHlBY2Nlc3NGcm9tSW5kZXhTaWduYXR1cmVcIjogdHJ1ZVxuXHRcIm5vVW5jaGVja2VkSW5kZXhlZEFjY2Vzc1wiOiB0cnVlXG5cdFwibm9VbnVzZWRMb2NhbHNcIjogdHJ1ZVxuXHRcIm5vVW51c2VkUGFyYW1ldGVyc1wiOiB0cnVlXG5cdFwib3V0RGlyXCI6IHVuZGVmaW5lZFxuXHRcIm91dEZpbGVcIjogdW5kZWZpbmVkXG5cdFwicGF0aHNcIjoge31cblx0XCJwcmVzZXJ2ZUNvbnN0RW51bXNcIjogZmFsc2Vcblx0XCJwcmVzZXJ2ZVN5bWxpbmtzXCI6IGZhbHNlXG5cdFwicHJlc2VydmVWYWx1ZUltcG9ydHNcIjogZmFsc2Vcblx0XCJyZWFjdE5hbWVzcGFjZVwiOiBcIlJlYWN0XCJcblx0XCJyZW1vdmVDb21tZW50c1wiOiBmYWxzZVxuXHRcInJlc29sdmVKc29uTW9kdWxlXCI6IHRydWVcblx0XCJyb290RGlyXCI6IHVuZGVmaW5lZFxuXHRcInJvb3REaXJzXCI6IFtdXG5cdFwic2tpcERlZmF1bHRMaWJDaGVja1wiOiBmYWxzZVxuXHRcInNraXBMaWJDaGVja1wiOiBmYWxzZVxuXHRcInNvdXJjZU1hcFwiOiBmYWxzZVxuXHRcInNvdXJjZVJvb3RcIjogdW5kZWZpbmVkXG5cdFwic3RyaWN0XCI6IHRydWVcblx0XCJzdHJpY3RCaW5kQ2FsbEFwcGx5XCI6IHRydWVcblx0XCJzdHJpY3RGdW5jdGlvblR5cGVzXCI6IHRydWVcblx0XCJzdHJpY3ROdWxsQ2hlY2tzXCI6IHRydWVcblx0XCJzdHJpY3RQcm9wZXJ0eUluaXRpYWxpemF0aW9uXCI6IHRydWVcblx0XCJzdHJpcEludGVybmFsXCI6IGZhbHNlXG5cdFwic3VwcHJlc3NFeGNlc3NQcm9wZXJ0eUVycm9yc1wiOiBmYWxzZVxuXHRcInN1cHByZXNzSW1wbGljaXRBbnlJbmRleEVycm9yc1wiOiBmYWxzZVxuXHRcInRhcmdldFwiOiBTY3JpcHRUYXJnZXQuRVMyMDIyXG5cdFwidHJhY2VSZXNvbHV0aW9uXCI6IGZhbHNlXG5cdFwidHNCdWlsZEluZm9GaWxlXCI6IHVuZGVmaW5lZFxuXHRcInR5cGVSb290c1wiOiBbXVxuXHRcInVzZURlZmluZUZvckNsYXNzRmllbGRzXCI6IHRydWVcblx0XCJ1c2VVbmtub3duSW5DYXRjaFZhcmlhYmxlc1wiOiB0cnVlXG59XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnR5cGUgVEFzdEZpbHRlckZ1bmMgPSAobm9kZTogTm9kZSkgPT4gYm9vbGVhblxuXG5leHBvcnQgY2xhc3MgQXN0V2Fsa2VyIGV4dGVuZHMgV2Fsa2VyPE5vZGU+XG5cblx0ZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/XG5cdGhPcHRpb25zOiBoYXNoXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0XHRAZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/ID0gdW5kZWYsXG5cdFx0XHRAaE9wdGlvbnMgPSB7fVxuXHRcdFx0KVxuXHRcdHN1cGVyKClcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRkYmcob3A6ICdwdXNoJyB8ICdwb3AnLCBub2RlOiBOb2RlKTogdm9pZFxuXG5cdFx0cHJlZml4IDo9ICcgICAnXG5cdFx0a2luZCA6PSBub2RlLmtpbmRcblx0XHRjb25zb2xlLmxvZyBcIiN7cHJlZml4fSN7b3AudG9VcHBlckNhc2UoKX06ICN7a2luZH0gWyN7QHN0YWNrRGVzYygpfV1cIlxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdHN0YWNrRGVzYygpOiBzdHJpbmdcblxuXHRcdHJlc3VsdHMgOj0gW11cblx0XHRmb3Igbm9kZSBvZiBAbE5vZGVTdGFja1xuXHRcdFx0cmVzdWx0cy5wdXNoIG5vZGUua2luZC50b1N0cmluZygpXG5cdFx0bFN0YWNrIDo9IHJlc3VsdHNcblx0XHRyZXR1cm4gbFN0YWNrLmpvaW4gJywnXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0b3ZlcnJpZGUgcHVzaE5vZGUobm9kZTogTm9kZSk6IHZvaWRcblxuXHRcdHN1cGVyLnB1c2hOb2RlIG5vZGVcblx0XHRpZiBAaE9wdGlvbnMudHJhY2Vcblx0XHRcdEBkYmcgJ3B1c2gnLCBub2RlXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0b3ZlcnJpZGUgcG9wTm9kZSgpOiBOb2RlP1xuXG5cdFx0bm9kZSA6PSBzdXBlci5wb3BOb2RlKClcblx0XHRpZiBAaE9wdGlvbnMudHJhY2Vcblx0XHRcdGlmIGRlZmluZWQobm9kZSlcblx0XHRcdFx0QGRiZyAncG9wJywgbm9kZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRjb25zb2xlLmxvZyBcIlNUQUNLIEVNUFRZXCJcblx0XHRyZXR1cm4gbm9kZVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGlzTm9kZSh4OiBvYmplY3QpOiB4IGlzIE5vZGVcblxuXHRcdHJldHVybiBPYmplY3QuaGFzT3duIHgsICdraW5kJ1xuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGZpbHRlcihub2RlOiBOb2RlKTogYm9vbGVhblxuXG5cdFx0cmV0dXJuIGRlZmluZWQoQGZpbHRlckZ1bmMpID8gQGZpbHRlckZ1bmMobm9kZSkgOiB0cnVlXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBDQW5hbHlzaXNcblx0bUltcG9ydHM6IENTdHJpbmdTZXRNYXAgPSBuZXcgQ1N0cmluZ1NldE1hcCgpXG5cdG1FeHBvcnRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKVxuXHRtYWluU2NvcGU6IENNYWluU2NvcGUgPSBuZXcgQ01haW5TY29wZSgpXG5cdGN1clNjb3BlOiBDU2NvcGVcblx0ZmluaXNoZWQ6IGJvb2xlYW4gPSBmYWxzZVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGNvbnN0cnVjdG9yKClcblxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGVcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRkZWZpbmUobmFtZTogc3RyaW5nKTogdm9pZFxuXG5cdFx0QGN1clNjb3BlLmRlZmluZSBuYW1lXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0dXNlKG5hbWU6IHN0cmluZyk6IHZvaWRcblxuXHRcdCMgLS0tIHRoaXMgY29uZGl0aW9uIHNob3VsZCBmaWx0ZXIgYnVpbHQtaW5zXG5cdFx0aWYgbm90IGhhc0tleShnbG9iYWxUaGlzLCBuYW1lKVxuXHRcdFx0QGN1clNjb3BlLnVzZSBuYW1lXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0YWRkSW1wb3J0KGxpYjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkXG5cblx0XHRAbUltcG9ydHMuYWRkIGxpYiwgbmFtZVxuXHRcdEBkZWZpbmUgbmFtZVxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGFkZEV4cG9ydChuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyk6IHZvaWRcblxuXHRcdEBtRXhwb3J0cy5zZXQgbmFtZSwgdHlwZVxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGdldEltcG9ydHMoKTogVEJsb2NrRGVzY1xuXG5cdFx0aEltcG9ydHM6IGhhc2hvZjxzdHJpbmdbXT4gOj0ge31cblx0XHRmb3IgW2xpYiwgc05hbWVzXSBvZiBAbUltcG9ydHMuZW50cmllcygpXG5cdFx0XHRoSW1wb3J0c1tsaWJdID0gQXJyYXkuZnJvbShzTmFtZXMudmFsdWVzKCkpXG5cdFx0cmV0dXJuIGhJbXBvcnRzXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Z2V0RXhwb3J0cygpOiBzdHJpbmdbXVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQG1FeHBvcnRzLmtleXMoKVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG5ld1Njb3BlKG5hbWU6IHN0cmluZz8sIGxBcmdzOiBzdHJpbmdbXSk6IHZvaWRcblxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGUubmV3U2NvcGUobmFtZSwgbEFyZ3MpXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0ZW5kU2NvcGUoKTogdm9pZFxuXG5cdFx0c2NvcGUgOj0gQG1haW5TY29wZS5lbmRTY29wZSBAY3VyU2NvcGVcblx0XHRpZiBkZWZpbmVkKHNjb3BlKVxuXHRcdFx0QGN1clNjb3BlID0gc2NvcGVcblx0XHRlbHNlXG5cdFx0XHRAZmluaXNoZWQgPSB0cnVlXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Z2V0TWlzc2luZygpOiBzdHJpbmdbXVxuXG5cdFx0d2Fsa2VyIDo9IG5ldyBXYWxrZXI8Q1Njb3BlPigpXG5cdFx0d2Fsa2VyLmlzTm9kZSA9ICh4OiB1bmtub3duKSA9PlxuXHRcdFx0cmV0dXJuICh4IGluc3RhbmNlb2YgQ1Njb3BlKVxuXG5cdFx0IyAtLS0gRmluZCBhbGwgbmFtZXMgdGhhdCBhcmUgdXNlZCwgYnV0IG5vdCBkZWZpbmVkXG5cdFx0c05hbWVzIDo9IG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0Zm9yIHNjb3BlIG9mIHdhbGtlci53YWxrKEBtYWluU2NvcGUpXG5cdFx0XHRmb3IgbmFtZSBvZiBzY29wZS5hbGxVc2VkKClcblx0XHRcdFx0aWYgbm90IHNjb3BlLmlzRGVmaW5lZChuYW1lKVxuXHRcdFx0XHRcdHNOYW1lcy5hZGQgbmFtZVxuXHRcdHJldHVybiBBcnJheS5mcm9tIHNOYW1lcy52YWx1ZXMoKVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGdldEV4dHJhKCk6IHN0cmluZ1tdXG5cblx0XHR3YWxrZXIgOj0gbmV3IFdhbGtlcjxDU2NvcGU+KClcblx0XHR3YWxrZXIuaXNOb2RlID0gKHg6IHVua25vd24pID0+XG5cdFx0XHRyZXR1cm4gKHggaW5zdGFuY2VvZiBDU2NvcGUpXG5cblx0XHQjIC0tLSBGaW5kIGFsbCBuYW1lcyB0aGF0IGFyZSBkZWZpbmVkLCBidXQgbmV2ZXIgdXNlZCBvciBleHBvcnRlZFxuXHRcdHNOYW1lcyA6PSBuZXcgU2V0PHN0cmluZz4oKVxuXHRcdGZvciBzY29wZSBvZiB3YWxrZXIud2FsayhAbWFpblNjb3BlKVxuXHRcdFx0Zm9yIG5hbWUgb2Ygc2NvcGUuYWxsRGVmaW5lZCgpXG5cdFx0XHRcdGlmIG5vdCBzY29wZS5pc1VzZWQobmFtZSkgJiYgIUBtRXhwb3J0cy5oYXMobmFtZSlcblx0XHRcdFx0XHRzTmFtZXMuYWRkIG5hbWVcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBzTmFtZXMudmFsdWVzKClcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRhc1N0cmluZyh3aWR0aDogaW50ZWdlciA9IDY0KTogc3RyaW5nXG5cblx0XHRoOiBUQmxvY2tEZXNjIDo9IHtcblx0XHRcdElNUE9SVFM6IEBnZXRJbXBvcnRzKClcblx0XHRcdEVYUE9SVFM6IEBnZXRFeHBvcnRzKClcblx0XHRcdE1JU1NJTkc6IEBnZXRNaXNzaW5nKClcblx0XHRcdEVYVFJBOiBAZ2V0RXh0cmEoKVxuXHRcdFx0fVxuXG5cdFx0aWYgaXNFbXB0eShoLklNUE9SVFMpXG5cdFx0XHRkZWxldGUgaC5JTVBPUlRTXG5cdFx0aWYgaXNFbXB0eShoLkVYUE9SVFMpXG5cdFx0XHRkZWxldGUgaC5FWFBPUlRTXG5cdFx0aWYgaXNFbXB0eShoLk1JU1NJTkcpXG5cdFx0XHRkZWxldGUgaC5NSVNTSU5HXG5cdFx0aWYgaXNFbXB0eShoLkVYVFJBKVxuXHRcdFx0ZGVsZXRlIGguRVhUUkFcblx0XHRyZXR1cm4gQmxvY2tpZnkgaFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYXNzZXJ0SXNOb2RlOiAoXG5cdFx0eDogdW5rbm93blxuXHRcdCkgPT4gYXNzZXJ0cyB4IGlzIE5vZGUgOj0gKHg6IHVua25vd24pOiBhc3NlcnRzIHggaXMgTm9kZSA9PlxuXG5cdGFzc2VydCBoYXNLZXkoeCwgJ2tpbmQnKSwgXCJOb3QgYSBOb2RlOiAje3R5cGVvZiB4fVwiXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBnZXROb2RlIDo9ICh4OiB1bmtub3duLCBkc3BhdGg6IHN0cmluZyB8IFRQYXRoSXRlbVtdKTogTm9kZSA9PlxuXG5cdHZhbCA6PSBleHRyYWN0IHgsIGRzcGF0aFxuXHRhc3NlcnRJc05vZGUgdmFsXG5cdHJldHVybiB2YWxcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGFuYWx5emVUUyA6PSAoXG5cdFx0dHNDb2RlOiBzdHJpbmcsXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IENBbmFseXNpcyA9PlxuXG5cdHR5cGUgb3B0ID0ge1xuXHRcdGZpbGVOYW1lOiBzdHJpbmc/XG5cdFx0ZHVtcDogYm9vbGVhblxuXHRcdHRyYWNlOiBib29sZWFuXG5cdFx0fVxuXHR7ZmlsZU5hbWUsIGR1bXAsIHRyYWNlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRmaWxlTmFtZTogdW5kZWZcblx0XHRkdW1wOiBmYWxzZVxuXHRcdHRyYWNlOiBmYWxzZVxuXHRcdH1cblxuXHRkZWJ1Z2dlclxuXHRhbmFseXNpcyA6PSBuZXcgQ0FuYWx5c2lzKClcblx0d2Fsa2VyIDo9IG5ldyBBc3RXYWxrZXIoKVxuXG5cdGhBc3QgOj0gdHMyYXN0IHRzQ29kZVxuXG5cdGlmIGR1bXBcblx0XHREVU1QIGhBc3QsICdBU1QnXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Y2hlY2tOb2RlIDo9IChcblx0XHRcdG5vZGU6IHVua25vd24sXG5cdFx0XHRkc3BhdGg6IHN0cmluZz8gPSB1bmRlZlxuXHRcdFx0KTogdm9pZCA9PlxuXG5cdFx0YXNzZXJ0SXNOb2RlIG5vZGVcblx0XHRpZiBkZWZpbmVkKGRzcGF0aClcblx0XHRcdG5vZGUgPSBnZXROb2RlKG5vZGUsIGRzcGF0aClcblx0XHRcdGFzc2VydElzTm9kZSBub2RlXG5cdFx0aWYgKG5vZGUua2luZCA9PSA4MCkgICAjIC0tLSBJZGVudGlmaWVyXG5cdFx0XHRuYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLmVzY2FwZWRUZXh0J1xuXHRcdFx0YW5hbHlzaXMudXNlIG5hbWVcblx0XHRyZXR1cm5cblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRmb3IgW3ZraW5kLCBub2RlXSBvZiB3YWxrZXIud2Fsa0V4KGhBc3QpXG5cdFx0e2tpbmR9IDo9IG5vZGVcblx0XHRpZiB0cmFjZVxuXHRcdFx0TE9HIGZcIk5PREUgI3traW5kfTozICgje2tpbmRTdHIoa2luZCl9KVwiXG5cblx0XHRpZiAodmtpbmQgPT0gJ2V4aXQnKVxuXHRcdFx0c3dpdGNoIGtpbmRcblxuXHRcdFx0XHR3aGVuIDIyMCwgMjYzICAgIyBBcnJvd0Z1bmN0aW9uLCBGdW5jdGlvbkRlY2xhcmF0aW9uXG5cdFx0XHRcdFx0YW5hbHlzaXMuZW5kU2NvcGUoKVxuXG5cdFx0ZWxzZSBpZiAodmtpbmQgPT0gJ2VudGVyJylcblxuXHRcdFx0c3dpdGNoIGtpbmRcblxuXHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cblx0XHRcdFx0XHRkb1xuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IE1BUCBnZXRBcnJheShub2RlLCAnLnBhcmFtZXRlcnMnKSwgKHgpIC0+XG5cdFx0XHRcdFx0XHRcdHlpZWxkIGdldFN0cmluZyh4LCAnLm5hbWUuZXNjYXBlZFRleHQnKVxuXG5cdFx0XHRcdFx0XHRpZiB0cmFjZVxuXHRcdFx0XHRcdFx0XHRMT0cgXCIgICBBcnJvdyBGdW5jIDo9ICgje2xQYXJtcy5qb2luKCcsJyl9KSA9PlwiXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5uZXdTY29wZSB1bmRlZiwgbFBhcm1zXG5cblx0XHRcdFx0d2hlbiAyNjEgICAgIyBWYXJpYWJsZURlY2xhcmF0aW9uXG5cdFx0XHRcdFx0dHJ5XG5cdFx0XHRcdFx0XHR2YXJOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgdmFyTmFtZVxuXG5cdFx0XHRcdHdoZW4gMjYzICAgICMgRnVuY3Rpb25EZWNsYXJhdGlvblxuXHRcdFx0XHRcdCMgLS0tIGRvIGNyZWF0ZXMgYSBzY29wZSwgYSBsYSBhbiBJSUZFXG5cdFx0XHRcdFx0ZG9cblx0XHRcdFx0XHRcdGZ1bmNOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cblx0XHRcdFx0XHRcdGxQYXJtcyA6PSBNQVAgZ2V0QXJyYXkobm9kZSwgJy5wYXJhbWV0ZXJzJyksICh4KSAtPlxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0Jylcblx0XHRcdFx0XHRcdGlmIHRyYWNlXG5cdFx0XHRcdFx0XHRcdExPRyBcIiAgIGZ1bmN0aW9uICN7ZnVuY05hbWV9KCN7bFBhcm1zLmpvaW4oJywnKX0pXCJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmRlZmluZSBmdW5jTmFtZVxuXHRcdFx0XHRcdFx0YW5hbHlzaXMubmV3U2NvcGUgZnVuY05hbWUsIGxQYXJtc1xuXG5cdFx0XHRcdHdoZW4gMjI3ICAgICMgQmluYXJ5RXhwcmVzc2lvblxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmxlZnQnXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcucmlnaHQnXG5cblx0XHRcdFx0d2hlbiAyMTQgICAgIyBDYWxsRXhwcmVzc2lvblxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmV4cHJlc3Npb24nXG5cdFx0XHRcdFx0Zm9yIGFyZyBvZiBnZXRBcnJheShub2RlLCAnLmFyZ3VtZW50cycpXG5cdFx0XHRcdFx0XHRjaGVja05vZGUgYXJnXG5cblx0XHRcdFx0d2hlbiAyNzMgICAgIyBJbXBvcnREZWNsYXJhdGlvblxuXHRcdFx0XHRcdGxpYiA6PSBnZXRTdHJpbmcgbm9kZSwgJy5tb2R1bGVTcGVjaWZpZXIudGV4dCdcblx0XHRcdFx0XHRmb3IgaCBvZiBnZXRBcnJheShub2RlLCAnLmltcG9ydENsYXVzZS5uYW1lZEJpbmRpbmdzLmVsZW1lbnRzJylcblx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGgsICcubmFtZS5lc2NhcGVkVGV4dCdcblx0XHRcdFx0XHRcdGlmIHRyYWNlXG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nIFwiTkFNRTogJyN7bmFtZX0nIGluICcje2xpYn0nXCJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEltcG9ydCBsaWIsIG5hbWVcblxuXHRcdFx0XHR3aGVuIDI4MCAgICAjIE5hbWVkRXhwb3J0c1xuXHRcdFx0XHRcdGZvciBlbGVtIG9mIGdldEFycmF5KG5vZGUsICcuZWxlbWVudHMnKVxuXHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgZWxlbSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xuXHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdyZS1leHBvcnQnXG5cblx0XHRcdFx0d2hlbiA5NSAgICAgIyBFeHBvcnRLZXl3b3JkXG5cdFx0XHRcdFx0cGFyZW50IDo9IHdhbGtlci5wYXJlbnQoKVxuXHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIocGFyZW50LCAnLmtpbmQnKVxuXG5cdFx0XHRcdFx0XHR3aGVuIDI0NCAgICAjIEZpcnN0U3RhdGVtZW50XG5cdFx0XHRcdFx0XHRcdGZvciBkZWNsIG9mIGdldEFycmF5KHBhcmVudCwgJy5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zJylcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKGRlY2wsICcua2luZCcpXG5cblx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gMjYxICAgICMgVmFyaWFibGVEZWNsYXJhdGlvblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBkZWNsLCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCMgLS0tIENoZWNrIGluaXRpYWxpemVyIHRvIGZpbmQgdGhlIHR5cGVcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5pdEtpbmQgOj0gZ2V0TnVtYmVyIGRlY2wsICcuaW5pdGlhbGl6ZXIua2luZCdcblx0XHRcdFx0XHRcdFx0XHRcdFx0c3dpdGNoIGluaXRLaW5kXG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnZnVuY3Rpb24nXG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDksIDI2MSAjIEZpcnN0TGl0ZXJhbFRva2VuLCBWYXJpYWJsZURlY2xhcmF0aW9uXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NvbnN0J1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndW5rbm93bidcblxuXHRcdFx0XHRcdFx0d2hlbiAyNjMgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnZnVuY3Rpb24nXG5cblx0XHRcdFx0XHRcdHdoZW4gMjY0ICAgIyBDbGFzc0RlY2xhcmF0aW9uXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NsYXNzJ1xuXG5cdFx0XHRcdFx0XHR3aGVuIDI2NiAgICMgVHlwZUFsaWFzRGVjbGFyYXRpb25cblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndHlwZSdcblxuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0Y3JvYWsgXCJVbmV4cGVjdGVkIHN1YnR5cGUgb2YgOTU6ICN7cGFyZW50LmtpbmR9XCJcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRpZiB0cmFjZVxuXHRcdFx0XHRcdFx0TE9HIFwiICAgLi4uaWdub3JlZFwiXG5cdHJldHVybiBhbmFseXNpc1xuIl19