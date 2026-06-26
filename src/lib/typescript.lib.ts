"use strict";
// typescript.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {exists, existsSync} from '@std/fs'
import {
	SourceFile, Node, ScriptTarget, SyntaxKind, ModuleKind,
	NewLineKind, EmitHint, CompilerOptions, ModuleResolutionKind,
	createSourceFile, createPrinter, createProgram,
	transpileModule, getPreEmitDiagnostics, forEachChild,
	flattenDiagnosticMessageText, getLineAndCharacterOfPosition,
	} from 'npm-typescript'

import {
	LOG, DBG, ERR, INDENT, UNDENT, pushLogLevel, popLogLevel,
	} from 'logger'
import {
	undef, defined, notdefined, croak, assert, getErrStr,
	extractSourceMap, withColors, decolorize,
	} from 'base'
import {
	integer, hash, hashof, array,
	isHash, isString, isEmpty, nonEmpty, isNumber,
	isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	getOptions, spaces, o, words, hasKey,
	CStringSetMap, keys, sep, allLinesIn, f,
	} from 'llutils'
import {debugging} from 'cmd-args'
import {
	extract, TPathItem, getString, getNumber, getArray,
	} from 'extract'
import {TBlockDesc, Blockify} from 'indent'
import {
	isFile, slurp, barf, barfTempFile, fileExt, withExt,
	pathStr, mkpath, newerDestFileExists,
	} from 'fsys'
import {
	OL, toNice, TMapFunc, DUMP, LOGVALUE, DBGVALUE,
	} from 'nice'
import {
	execCmd, CFileHandler, TProcSpec, TExecResult,
	procOneFile, procFiles,
	} from 'exec'
import {Walker, TVisitKind} from 'walker'
import {CMainScope, CScope} from 'scope'
import {getNeededImportStmts} from 'symbols'
import {MAP} from 'mapper'
import {typeCheckTsFile} from 'lltypescript'

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

export const ast2ts = (
		node: Node
		): string => {

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
		hAst: object,
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
		lInclude,
		lExclude: words(`pos end id flags modifierFlagsCache
transformFlags hasExtendedUnicodeEscape
numericLiteralFlags setExternalModuleIndicator
languageVersion languageVariant jsDocParsingMode
hasNoDefaultLib`)
		})
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

export const getSymbolsFromType = (
		typeStr: string
		): string[] => {

	let ref;let ref1;if ((ref = typeStr.match(/^([A-Za-z][A-Za-z0-9+]*)(?:\<([A-Za-z][A-Za-z0-9+]*)\>)?$/))) {const lMatches = ref;
		const [_, type, subtype] = lMatches
		return nonEmpty(subtype) ? [type, subtype] : [type]
	}
	else if ((ref1 = typeStr.match(/^\(\)\s*\=\>\s*([A-Za-z][A-Za-z0-9+]*)$/))) {const lMatches = ref1;
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

type TAstFilterFunc = (
		node: Node
		) => boolean

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

	trace = false
	mImports = new CStringSetMap()
	mExports = new Map<string, string>()
	sMissing = new Set<string>()
	mainScope = new CMainScope()
	curScope: CScope
	finished = false

	// ..........................................................

	constructor(trace1 = false) {

		this.trace = trace1;

		this.curScope = this.mainScope
	}

	// ..........................................................

	define(name: string): void {

		if (this.trace) {
			LOG(`   define ${name}`)
		}
		this.curScope.define(name)
		return
	}

	// ..........................................................

	use(name: string): void {

		// --- this condition should filter built-ins
		if (!hasKey(globalThis, name)) {
			if (this.trace) {
				LOG(`   use ${name}`)
			}
			if (!this.curScope.isDefined(name)) {
				if (this.trace) {
					LOG(`   missing ${name}`)
				}
				this.sMissing.add(name)
			}
			this.curScope.use(name)
		}
		return
	}

	// ..........................................................

	addImport(lib: string, name: string): void {

		if (this.trace) {
			LOG(`   import '${name}' in '${lib}'`)
		}
		this.mImports.add(lib, name)
		this.define(name)
		return
	}

	// ..........................................................

	addExport(name: string, type: string): void {

		if (this.trace) {
			LOG(`   export '${name}': '${type}'`)
		}
		this.mExports.set(name, type)
		return
	}

	// ..........................................................

	newScope(name: (string | undefined), lArgs: string[]): void {

		if (this.trace) {
			LOG(`   new scope ${name || '<anon>'}(${lArgs.join(',')})`)
		}
		this.curScope = this.mainScope.newScope(name, lArgs)
		return
	}

	// ..........................................................

	endScope(): void {

		if (this.trace) {
			LOG("   end scope")
		}
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

	getMissing(): string[] {

		return Array.from(this.sMissing.values())
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

export const getNode = (
		x: unknown,
		pathstr: string
		): Node => {

	const val = extract(x, pathstr) as Node
	return val
}

// ---------------------------------------------------------------------------

export const analyzeTsCode = (
		tsCode: string,
		hOptions: hash = {}
		): CAnalysis => {

	type opt = {
		fileName: (string | undefined)
		dumpAST: boolean
		trace: boolean
		}
	const {fileName, dumpAST, trace} = getOptions<opt>(hOptions, {
		fileName: undef,
		dumpAST: false,
		trace: false
		})

	const analysis = new CAnalysis(trace)
	const walker = new AstWalker()

	// --- throws Error if not valid TypeScript
	const hAst = ts2ast(tsCode)

	if (dumpAST) {
		DUMP(astAsString(hAst), 'AST')
	}

	// ..........................................................

	const checkNode = (
			node: Node,
			pathstr: (string | undefined) = undef
			): void => {

		if (defined(pathstr)) {
			node = getNode(node, pathstr)
		}
		if (node.kind === 80) {   // --- Identifier
			const name = getString(node, '.escapedText')
			analysis.use(name)
		}
		return
	}

	// ..........................................................

	const sym = (vkind: TVisitKind): string => {
		switch(vkind) {
			case 'enter': { return '->'
			}
			case 'exit': { return '<-'
			}
			default: {              return '::' }
		}
	}

	// ..........................................................
	// vkind is one of 'enter', 'exit', 'ref'

	const lTraceKind = [80, 95, 170, 214, 220, 227, 254, 261, 263, 273, 280, 308]
	for (const [vkind, node] of walker.walkEx(hAst)) {
		const {kind} = node
		if (trace && lTraceKind.includes(kind)) {
			LOG(f`${sym(vkind)} NODE ${kind}:3 (${kindStr(kind)}:{cyan})`)
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
						const lParms = Array.from(MAP(getArray(node, '.parameters'), function*(x) {
							yield getString(x, '.name.escapedText')
						}))
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

						const lParms = Array.from(MAP(getArray(node, '.parameters'), function*(x) {
							yield getString(x, '.name.escapedText')
						}))
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
						checkNode(arg as Node)
					};break;
				}

				case 273: {    // ImportDeclaration
					const lib = getString(node, '.moduleSpecifier.text')
					for (const h of getArray(node, '.importClause?.namedBindings?.elements')) {
						const name = getString(h, '.name.escapedText')
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
			}
		}
	}
	return analysis
}

// ---------------------------------------------------------------------------

class CUnitTester extends CFileHandler {

	get op() {
		return 'doUnitTest'
	}

	// ..........................................................

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		assert(path.endsWith('.test.ts'), "Not a unit test file")
		type opt = {
			capture: boolean
			inspect: boolean
			lineNum: (string | undefined)
			}
		const {capture, inspect, lineNum} = getOptions<opt>(hOptions, {
			capture: true,
			inspect: false,
			lineNum: undef
			})

		const hResult = await execCmd('deno', [
				'test',
				'-A',
				...(inspect
					? ['--inspect-brk']
					: ['--coverage=./coverage', '--coverage-raw-data-only']
					),
				...(defined(lineNum)
					? ['--filter', `/^line ${lineNum}$/`]
					: []
					),
				path
				], {capture})
		return hResult
	}

	// ..........................................................

	override getOutput(hResult: TExecResult): string {

		const {stdout, stderr} = hResult
		const output = [stdout, stderr].join()
		if (!hResult.success || output.match(/croak|error/i)) {
			return output
		}

		const lLines = Array.from(MAP(allLinesIn(decolorize(output)), function*(line) {
			if (line.startsWith('line')) {
				if (!line.includes(' ok ')) {
					yield withColors(line, {
						failed: 'red',
						FAILED: 'red',
						ok: 'green',
						OK: 'green'
						})
				}
			}
			else if (line.includes('passed') && line.includes('failed')) {
				if (line.includes(' 0 failed ')) {
					yield withColors(line, {
						ok: 'green',
						passed: 'green'
						})
				}
				else {
					yield withColors(line, {
						ok: 'green',
						passed: 'green',
						failed: 'red',
						FAILED: 'red'
						})
				}
			}
			else if (line.includes('Lcov coverage')) {
				yield 'coverage report generated'
			}
		}))
		return lLines.join('\n')
	}
}

export const doUnitTest = new CUnitTester()

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInR5cGVzY3JpcHQubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsdUJBQXNCO0FBQ3RCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMxQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUN4RCxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzlELENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUM7QUFDaEQsQ0FBQyxlQUFlLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN0RCxDQUFDLDRCQUE0QixDQUFDLENBQUMsNkJBQTZCLENBQUM7QUFDN0QsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUN4QixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDMUQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDaEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDdEQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUMxQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzlCLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQy9DLENBQUMsVUFBVSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzVDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQ25CLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3RDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQ2pCLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUNwRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUNqQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxL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O0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEU7QUFBRSxDQUFBO0FBQ3hFLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBWSxNQUFYLFdBQVcsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQUFBQSxFQUFFLFFBQVEsQyxDLEMsQ0FBQyxBQUFDLE1BQU0sQ0FBQyxDLEMsWSxDQUFFO0FBQ3JCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBVyxNQUFWLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDMUMsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUs7QUFDakIsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDdkIsQUFBQSxFQUFFLFFBQVEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFL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QyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQyxBQUFBLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUM5QyxBQUFBLEVBQUUsTUFBTSxDQUFDLFE7Q0FBUSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUN2QixBQUFBO0FBQ0EsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3JCLEFBQUE7QUFDQSxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNoQyxBQUFBLEVBQUUsTUFBTSxDQUFDLE1BQU0sQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNqQyxBQUFBLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEM7RUFBQyxDQUFBO0FBQy9CLEFBQUE7QUFDQSxBQUFBLEVBQUUsa0VBQWlFO0FBQ25FLEFBQUEsRUFBUSxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdCLEFBQUEsRUFBRSxHQUFHLENBQUMsQ0FBQSxNQUFBLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJLENBQUMsU0FBUyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3RDLEFBQUEsR0FBRyxHQUFHLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2pDLEFBQUEsSUFBSSxHQUFHLENBQUEsQ0FBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNyRCxBQUFBLEtBQUssTUFBTSxDQUFDLEdBQUcsQ0FBQSxBQUFDLElBQUksQztJQUFBLEM7R0FBQSxDO0VBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUEsQUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDbkMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLEVBQWUsTUFBYixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDcEIsQUFBQSxHQUFHLE9BQU8sQ0FBQyxDQUFDLEksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFBO0FBQ3pCLEFBQUEsR0FBRyxPQUFPLENBQUMsQ0FBQyxJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQTtBQUN6QixBQUFBLEdBQUcsT0FBTyxDQUFDLENBQUMsSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUE7QUFDekIsQUFBQSxHQUFHLEtBQUssQ0FBQyxDQUFDLEksQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNyQixHQUFHLENBQUM7QUFDSixBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQSxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QixBQUFBLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxPO0VBQU8sQ0FBQTtBQUNuQixBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUEsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLE87RUFBTyxDQUFBO0FBQ25CLEFBQUEsRUFBRSxHQUFHLENBQUEsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkIsQUFBQSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsTztFQUFPLENBQUE7QUFDbkIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNyQixBQUFBLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxLO0VBQUssQ0FBQTtBQUNqQixBQUFBLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQSxBQUFDLENBQUMsQztDQUFBLEM7QUFBQSxDQUFBO0FBQ25CLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNuQixBQUFBLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFBO0FBQ1osQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU07QUFDakIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSxDQUFJLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUk7QUFDbkMsQUFBQSxDQUFDLE1BQU0sQ0FBQyxHO0FBQUcsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBYyxNQUFiLGFBQWEsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN6QixBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFBO0FBQ2hCLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQixFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNqQixBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsUUFBUSxDLEMsQ0FBQyxBQUFDLE0sWSxDQUFPO0FBQ25CLEFBQUEsRUFBRSxPQUFPLENBQUMsQ0FBQyxPQUFPO0FBQ2xCLEFBQUEsRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPO0FBQ2hCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBMkIsTUFBMUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUMxRCxBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ2pCLEFBQUEsRUFBRSxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDaEIsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUs7QUFDZCxFQUFFLENBQUMsQ0FBQTtBQUNILEFBQUE7QUFDQSxBQUFBLENBQVMsTUFBUixRQUFRLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO0FBQ2pDLEFBQUEsQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzFCLEFBQUE7QUFDQSxBQUFBLENBQUMsMkNBQTBDO0FBQzNDLEFBQUEsQ0FBSyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFBLEFBQUMsTUFBTSxDQUFBO0FBQ3RCLEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLE9BQU8sQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEVBQUUsSUFBSSxDQUFBLEFBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDO0NBQUEsQ0FBQTtBQUMvQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDQUFVLE1BQVQsU0FBUyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ2YsQUFBQSxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNkLEFBQUEsR0FBRyxPQUFPLEMsQyxDQUFDLEFBQUMsTSxZLENBQU8sQ0FBQyxDQUFDLENBQUMsS0FBSztBQUMzQixHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDckIsQUFBQSxHQUFHLElBQUksQyxDQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQztFQUFDLENBQUE7QUFDaEMsQUFBQSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFBLEdBQUcsaUJBQWdCO0FBQ3pDLEFBQUEsR0FBTyxNQUFKLElBQUksQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFBO0FBQ3pDLEFBQUEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFBLEFBQUMsSUFBSSxDO0VBQUEsQ0FBQTtBQUNwQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDQUFJLE1BQUgsR0FBRyxDQUFDLENBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3RDLEFBQUEsRUFBRSxNQUFNLENBQUEsQUFBQyxLQUFLLENBQUEsQ0FBQSxDQUFBO0FBQ2QsQUFBQSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQSxDQUFLLENBQUMsTUFBTSxDQUFDLEk7R0FBSSxDQUFBO0FBQ2hDLEFBQUEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFBLENBQUEsQ0FBTSxDQUFDLE1BQU0sQ0FBQyxJO0dBQUksQ0FBQTtBQUNoQyxBQUFBLEdBQUcsT0FBSSxDQUFBLENBQUEsQ0FBQSxjQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUEsQztFQUFBLEM7Q0FBQSxDQUFBO0FBQ2hDLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUEsQ0FBQyx5Q0FBd0M7QUFDekMsQUFBQTtBQUNBLEFBQUEsQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDekUsQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDekMsQUFBQSxFQUFRLE1BQU4sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUNoQixBQUFBLEVBQUUsR0FBRyxDQUFBLEtBQUssQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkMsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEM7RUFBQSxDQUFBO0FBQ2hFLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUN0QixBQUFBLEdBQUcsTUFBTSxDQUFBLEFBQUMsSUFBSSxDQUFBLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLElBQUksSUFBSSxDQUFDLEdBQUcsQyxLQUFDLEFBQUMsR0FBRyxDQUFBLENBQUEsQ0FBQSxHQUFHLHFDQUFvQztBQUN4RCxBQUFBLEtBQUssUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE87SUFBQSxDO0dBQUEsQztFQUFBLENBQUE7QUFDeEIsQUFBQTtBQUNBLEFBQUEsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQTtBQUM1QixBQUFBO0FBQ0EsQUFBQSxH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QUFDMUIsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN0QyIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyB0eXBlc2NyaXB0LmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtleGlzdHMsIGV4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7XHJcblx0U291cmNlRmlsZSwgTm9kZSwgU2NyaXB0VGFyZ2V0LCBTeW50YXhLaW5kLCBNb2R1bGVLaW5kLFxyXG5cdE5ld0xpbmVLaW5kLCBFbWl0SGludCwgQ29tcGlsZXJPcHRpb25zLCBNb2R1bGVSZXNvbHV0aW9uS2luZCxcclxuXHRjcmVhdGVTb3VyY2VGaWxlLCBjcmVhdGVQcmludGVyLCBjcmVhdGVQcm9ncmFtLFxyXG5cdHRyYW5zcGlsZU1vZHVsZSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLCBmb3JFYWNoQ2hpbGQsXHJcblx0ZmxhdHRlbkRpYWdub3N0aWNNZXNzYWdlVGV4dCwgZ2V0TGluZUFuZENoYXJhY3Rlck9mUG9zaXRpb24sXHJcblx0fSBmcm9tICducG0tdHlwZXNjcmlwdCdcclxuXHJcbmltcG9ydCB7XHJcblx0TE9HLCBEQkcsIEVSUiwgSU5ERU5ULCBVTkRFTlQsIHB1c2hMb2dMZXZlbCwgcG9wTG9nTGV2ZWwsXHJcblx0fSBmcm9tICdsb2dnZXInXHJcbmltcG9ydCB7XHJcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGNyb2FrLCBhc3NlcnQsIGdldEVyclN0cixcclxuXHRleHRyYWN0U291cmNlTWFwLCB3aXRoQ29sb3JzLCBkZWNvbG9yaXplLFxyXG5cdH0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtcclxuXHRpbnRlZ2VyLCBoYXNoLCBoYXNob2YsIGFycmF5LFxyXG5cdGlzSGFzaCwgaXNTdHJpbmcsIGlzRW1wdHksIG5vbkVtcHR5LCBpc051bWJlcixcclxuXHRpc0Z1bmN0aW9uLCBmdW5jdGlvbkRlZiwgaXNDbGFzcywgY2xhc3NEZWYsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7XHJcblx0Z2V0T3B0aW9ucywgc3BhY2VzLCBvLCB3b3JkcywgaGFzS2V5LFxyXG5cdENTdHJpbmdTZXRNYXAsIGtleXMsIHNlcCwgYWxsTGluZXNJbiwgZixcclxuXHR9IGZyb20gJ2xsdXRpbHMnXHJcbmltcG9ydCB7ZGVidWdnaW5nfSBmcm9tICdjbWQtYXJncydcclxuaW1wb3J0IHtcclxuXHRleHRyYWN0LCBUUGF0aEl0ZW0sIGdldFN0cmluZywgZ2V0TnVtYmVyLCBnZXRBcnJheSxcclxuXHR9IGZyb20gJ2V4dHJhY3QnXHJcbmltcG9ydCB7VEJsb2NrRGVzYywgQmxvY2tpZnl9IGZyb20gJ2luZGVudCdcclxuaW1wb3J0IHtcclxuXHRpc0ZpbGUsIHNsdXJwLCBiYXJmLCBiYXJmVGVtcEZpbGUsIGZpbGVFeHQsIHdpdGhFeHQsXHJcblx0cGF0aFN0ciwgbWtwYXRoLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxyXG5cdH0gZnJvbSAnZnN5cydcclxuaW1wb3J0IHtcclxuXHRPTCwgdG9OaWNlLCBUTWFwRnVuYywgRFVNUCwgTE9HVkFMVUUsIERCR1ZBTFVFLFxyXG5cdH0gZnJvbSAnbmljZSdcclxuaW1wb3J0IHtcclxuXHRleGVjQ21kLCBDRmlsZUhhbmRsZXIsIFRQcm9jU3BlYywgVEV4ZWNSZXN1bHQsXHJcblx0cHJvY09uZUZpbGUsIHByb2NGaWxlcyxcclxuXHR9IGZyb20gJ2V4ZWMnXHJcbmltcG9ydCB7V2Fsa2VyLCBUVmlzaXRLaW5kfSBmcm9tICd3YWxrZXInXHJcbmltcG9ydCB7Q01haW5TY29wZSwgQ1Njb3BlfSBmcm9tICdzY29wZSdcclxuaW1wb3J0IHtnZXROZWVkZWRJbXBvcnRTdG10c30gZnJvbSAnc3ltYm9scydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuaW1wb3J0IHt0eXBlQ2hlY2tUc0ZpbGV9IGZyb20gJ2xsdHlwZXNjcmlwdCdcclxuXHJcbmRlY29kZXIgOj0gbmV3IFRleHREZWNvZGVyIFwidXRmLThcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBraW5kU3RyIDo9IChpOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIFN5bnRheEtpbmRbaV1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHMyYXN0IDo9IChcclxuXHRcdHRzQ29kZTogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogTm9kZSA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZmlsZU5hbWV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZmlsZU5hbWU6ICd0ZW1wLnRzJ1xyXG5cdFx0fVxyXG5cclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCh0c0NvZGUpXHJcblx0aEFzdCA6PSBjcmVhdGVTb3VyY2VGaWxlIGZpbGVOYW1lLCBjb2RlLCBTY3JpcHRUYXJnZXQuTGF0ZXN0XHJcblx0cmV0dXJuIGhBc3RcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0MnRzIDo9IChcclxuXHRcdG5vZGU6IE5vZGVcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRhc3NlcnQgKG5vZGUua2luZCA9PSAzMDgpLCBcIk5vdCBhIFNvdXJjZUZpbGUgbm9kZVwiXHJcblx0cHJpbnRlciA6PSBjcmVhdGVQcmludGVyIG5ld0xpbmU6IE5ld0xpbmVLaW5kLkxpbmVGZWVkXHJcblx0cmV0dXJuIHByaW50ZXIucHJpbnROb2RlKEVtaXRIaW50LlVuc3BlY2lmaWVkLCBub2RlLCBub2RlIGFzIFNvdXJjZUZpbGUpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIC0tLSBwYXNzZWQgdG8gdG9OaWNlKCkgdG8gYWRkIGEgZGVzY3JpcHRpb24gdG8gc29tZSBub2Rlc1xyXG5cclxuZXhwb3J0IGRlc2NGdW5jOiBUTWFwRnVuYyA6PSAoXHJcblx0XHRrZXk6IHN0cmluZ1xyXG5cdFx0dmFsdWU6IHVua25vd25cclxuXHRcdGhQYXJlbnQ6IHVua25vd25cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gKGtleSA9PSAna2luZCcpICYmIGlzTnVtYmVyKHZhbHVlKSA/IGZcIigje2tpbmRTdHIodmFsdWUpfSlcIiA6ICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzdEFzU3RyaW5nIDo9IChcclxuXHRcdGhBc3Q6IG9iamVjdCxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGxJbmNsdWRlOiBzdHJpbmdbXT9cclxuXHRcdH1cclxuXHR7bEluY2x1ZGV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0bEluY2x1ZGU6IHVuZGVmXHJcblx0XHR9XHJcblxyXG5cdHJldHVybiB0b05pY2UgaEFzdCwge1xyXG5cdFx0aWdub3JlRW1wdHlLZXlzOiB0cnVlXHJcblx0XHRsSW5jbHVkZVxyXG5cdFx0bEV4Y2x1ZGU6IHdvcmRzKFwiXCJcIlxyXG5cdFx0XHRwb3MgZW5kIGlkIGZsYWdzIG1vZGlmaWVyRmxhZ3NDYWNoZVxyXG5cdFx0XHR0cmFuc2Zvcm1GbGFncyBoYXNFeHRlbmRlZFVuaWNvZGVFc2NhcGVcclxuXHRcdFx0bnVtZXJpY0xpdGVyYWxGbGFncyBzZXRFeHRlcm5hbE1vZHVsZUluZGljYXRvclxyXG5cdFx0XHRsYW5ndWFnZVZlcnNpb24gbGFuZ3VhZ2VWYXJpYW50IGpzRG9jUGFyc2luZ01vZGVcclxuXHRcdFx0aGFzTm9EZWZhdWx0TGliXHJcblx0XHRcdFwiXCJcIilcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0SW1wb3J0Q29kZSA6PSAodHlwZVN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdERCRyBcIkNBTEwgZ2V0SW1wb3J0Q29kZSgpXCJcclxuXHRsU3ltYm9scyA6PSBnZXRTeW1ib2xzRnJvbVR5cGUgdHlwZVN0clxyXG5cdERCR1ZBTFVFICdsU3ltYm9scycsIGxTeW1ib2xzXHJcblx0aWYgbm9uRW1wdHkobFN5bWJvbHMpXHJcblx0XHRsU3RtdHMgOj0gZ2V0TmVlZGVkSW1wb3J0U3RtdHMgbFN5bWJvbHNcclxuXHRcdERCR1ZBTFVFICdsU3RtdHMnLCBsU3RtdHNcclxuXHRcdHJldHVybiBsU3RtdHMuam9pbiAnXFxuJ1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRTeW1ib2xzRnJvbVR5cGUgOj0gKFxyXG5cdFx0dHlwZVN0cjogc3RyaW5nXHJcblx0XHQpOiBzdHJpbmdbXSA9PlxyXG5cclxuXHRpZiAobE1hdGNoZXMgOj0gdHlwZVN0ci5tYXRjaCgvXihbQS1aYS16XVtBLVphLXowLTkrXSopKD86XFw8KFtBLVphLXpdW0EtWmEtejAtOStdKilcXD4pPyQvKSlcclxuXHRcdFtfLCB0eXBlLCBzdWJ0eXBlXSA6PSBsTWF0Y2hlc1xyXG5cdFx0cmV0dXJuIG5vbkVtcHR5KHN1YnR5cGUpID8gW3R5cGUsIHN1YnR5cGVdIDogW3R5cGVdXHJcblx0ZWxzZSBpZiAobE1hdGNoZXMgOj0gdHlwZVN0ci5tYXRjaCgvXlxcKFxcKVxccypcXD1cXD5cXHMqKFtBLVphLXpdW0EtWmEtejAtOStdKikkLykpXHJcblx0XHRyZXR1cm4gW2xNYXRjaGVzWzFdXVxyXG5cdGVsc2VcclxuXHRcdHJldHVybiBbXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmhEZWZDb25maWc6IENvbXBpbGVyT3B0aW9ucyA6PSB7XHJcblx0XCJhbGxvd0pzXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VtZEdsb2JhbEFjY2Vzc1wiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbnJlYWNoYWJsZUNvZGVcIjogZmFsc2VcclxuXHRcImFsbG93VW51c2VkTGFiZWxzXCI6IGZhbHNlXHJcblx0XCJhbHdheXNTdHJpY3RcIjogdHJ1ZVxyXG5cdFwiYXNzdW1lQ2hhbmdlc09ubHlBZmZlY3REaXJlY3REZXBlbmRlbmNpZXNcIjogZmFsc2VcclxuXHRcImNoZWNrSnNcIjogZmFsc2VcclxuXHRcImNvbXBvc2l0ZVwiOiBmYWxzZVxyXG5cdFwiZGVjbGFyYXRpb25cIjogZmFsc2VcclxuXHRcImRlY2xhcmF0aW9uRGlyXCI6IHVuZGVmaW5lZFxyXG5cdFwiZGVjbGFyYXRpb25NYXBcIjogZmFsc2VcclxuXHRcImVtaXRCT01cIjogZmFsc2VcclxuXHRcImVtaXREZWNsYXJhdGlvbk9ubHlcIjogZmFsc2VcclxuXHRcImV4YWN0T3B0aW9uYWxQcm9wZXJ0eVR5cGVzXCI6IGZhbHNlXHJcblx0XCJleHBlcmltZW50YWxEZWNvcmF0b3JzXCI6IGZhbHNlXHJcblx0XCJmb3JjZUNvbnNpc3RlbnRDYXNpbmdJbkZpbGVOYW1lc1wiOiB0cnVlXHJcblx0XCJnZW5lcmF0ZUNwdVByb2ZpbGVcIjogbnVsbFxyXG5cdFwiZ2VuZXJhdGVUcmFjZVwiOiBudWxsXHJcblx0XCJpZ25vcmVEZXByZWNhdGlvbnNcIjogXCI1LjBcIlxyXG5cdFwiaW1wb3J0SGVscGVyc1wiOiBmYWxzZVxyXG5cdFwiaW5saW5lU291cmNlTWFwXCI6IGZhbHNlXHJcblx0XCJpbmxpbmVTb3VyY2VzXCI6IGZhbHNlXHJcblx0XCJpc29sYXRlZE1vZHVsZXNcIjogZmFsc2VcclxuXHQjXHRcImpzeFwiOiBcInJlYWN0LWpzeFwiLFxyXG5cdCNcdFwianN4RmFjdG9yeVwiOiBcIlJlYWN0LmNyZWF0ZUVsZW1lbnRcIixcclxuXHQjXHRcImpzeEZyYWdtZW50RmFjdG9yeVwiOiBcIlJlYWN0LkZyYWdtZW50XCIsXHJcblx0I1x0XCJqc3hJbXBvcnRTb3VyY2VcIjogXCJyZWFjdFwiLFxyXG5cdFwibGliXCI6IFtcclxuXHRcdFwiZXNuZXh0XCJcclxuXHRcdFwiZG9tXCJcclxuXHRcdFwiZG9tLml0ZXJhYmxlXCJcclxuXHRcdF1cclxuXHRcIm1hcFJvb3RcIjogdW5kZWZpbmVkXHJcblx0XCJtYXhOb2RlTW9kdWxlSnNEZXB0aFwiOiAwXHJcblx0XCJtb2R1bGVcIjogTW9kdWxlS2luZC5FU05leHRcclxuXHRcIm1vZHVsZURldGVjdGlvblwiOiB1bmRlZmluZWRcclxuXHRcIm1vZHVsZVJlc29sdXRpb25cIjogTW9kdWxlUmVzb2x1dGlvbktpbmQuTm9kZU5leHRcclxuXHRcIm5ld0xpbmVcIjogTmV3TGluZUtpbmQuTGluZUZlZWRcclxuXHRcIm5vRW1pdFwiOiB0cnVlXHJcblx0XCJub0VtaXRIZWxwZXJzXCI6IGZhbHNlXHJcblx0XCJub0VtaXRPbkVycm9yXCI6IGZhbHNlXHJcblx0XCJub0Vycm9yVHJ1bmNhdGlvblwiOiBmYWxzZVxyXG5cdFwibm9GYWxsdGhyb3VnaENhc2VzSW5Td2l0Y2hcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdEFueVwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0T3ZlcnJpZGVcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdFJldHVybnNcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdFRoaXNcIjogdHJ1ZVxyXG5cdFwibm9Qcm9wZXJ0eUFjY2Vzc0Zyb21JbmRleFNpZ25hdHVyZVwiOiB0cnVlXHJcblx0XCJub1VuY2hlY2tlZEluZGV4ZWRBY2Nlc3NcIjogdHJ1ZVxyXG5cdFwibm9VbnVzZWRMb2NhbHNcIjogdHJ1ZVxyXG5cdFwibm9VbnVzZWRQYXJhbWV0ZXJzXCI6IHRydWVcclxuXHRcIm91dERpclwiOiB1bmRlZmluZWRcclxuXHRcIm91dEZpbGVcIjogdW5kZWZpbmVkXHJcblx0XCJwYXRoc1wiOiB7fVxyXG5cdFwicHJlc2VydmVDb25zdEVudW1zXCI6IGZhbHNlXHJcblx0XCJwcmVzZXJ2ZVN5bWxpbmtzXCI6IGZhbHNlXHJcblx0XCJwcmVzZXJ2ZVZhbHVlSW1wb3J0c1wiOiBmYWxzZVxyXG5cdFwicmVhY3ROYW1lc3BhY2VcIjogXCJSZWFjdFwiXHJcblx0XCJyZW1vdmVDb21tZW50c1wiOiBmYWxzZVxyXG5cdFwicmVzb2x2ZUpzb25Nb2R1bGVcIjogdHJ1ZVxyXG5cdFwicm9vdERpclwiOiB1bmRlZmluZWRcclxuXHRcInJvb3REaXJzXCI6IFtdXHJcblx0XCJza2lwRGVmYXVsdExpYkNoZWNrXCI6IGZhbHNlXHJcblx0XCJza2lwTGliQ2hlY2tcIjogZmFsc2VcclxuXHRcInNvdXJjZU1hcFwiOiBmYWxzZVxyXG5cdFwic291cmNlUm9vdFwiOiB1bmRlZmluZWRcclxuXHRcInN0cmljdFwiOiB0cnVlXHJcblx0XCJzdHJpY3RCaW5kQ2FsbEFwcGx5XCI6IHRydWVcclxuXHRcInN0cmljdEZ1bmN0aW9uVHlwZXNcIjogdHJ1ZVxyXG5cdFwic3RyaWN0TnVsbENoZWNrc1wiOiB0cnVlXHJcblx0XCJzdHJpY3RQcm9wZXJ0eUluaXRpYWxpemF0aW9uXCI6IHRydWVcclxuXHRcInN0cmlwSW50ZXJuYWxcIjogZmFsc2VcclxuXHRcInN1cHByZXNzRXhjZXNzUHJvcGVydHlFcnJvcnNcIjogZmFsc2VcclxuXHRcInN1cHByZXNzSW1wbGljaXRBbnlJbmRleEVycm9yc1wiOiBmYWxzZVxyXG5cdFwidGFyZ2V0XCI6IFNjcmlwdFRhcmdldC5FUzIwMjJcclxuXHRcInRyYWNlUmVzb2x1dGlvblwiOiBmYWxzZVxyXG5cdFwidHNCdWlsZEluZm9GaWxlXCI6IHVuZGVmaW5lZFxyXG5cdFwidHlwZVJvb3RzXCI6IFtdXHJcblx0XCJ1c2VEZWZpbmVGb3JDbGFzc0ZpZWxkc1wiOiB0cnVlXHJcblx0XCJ1c2VVbmtub3duSW5DYXRjaFZhcmlhYmxlc1wiOiB0cnVlXHJcblx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVEFzdEZpbHRlckZ1bmMgPSAoXHJcblx0XHRub2RlOiBOb2RlXHJcblx0XHQpID0+IGJvb2xlYW5cclxuXHJcbmV4cG9ydCBjbGFzcyBBc3RXYWxrZXIgZXh0ZW5kcyBXYWxrZXI8Tm9kZT5cclxuXHJcblx0ZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/XHJcblx0aE9wdGlvbnM6IGhhc2hcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKFxyXG5cdFx0XHRAZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/ID0gdW5kZWYsXHJcblx0XHRcdEBoT3B0aW9ucyA9IHt9XHJcblx0XHRcdClcclxuXHRcdHN1cGVyKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGRiZyhvcDogJ3B1c2gnIHwgJ3BvcCcsIG5vZGU6IE5vZGUpOiB2b2lkXHJcblxyXG5cdFx0cHJlZml4IDo9ICcgICAnXHJcblx0XHRraW5kIDo9IG5vZGUua2luZFxyXG5cdFx0Y29uc29sZS5sb2cgXCIje3ByZWZpeH0je29wLnRvVXBwZXJDYXNlKCl9OiAje2tpbmR9IFsje0BzdGFja0Rlc2MoKX1dXCJcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0c3RhY2tEZXNjKCk6IHN0cmluZ1xyXG5cclxuXHRcdHJlc3VsdHMgOj0gW11cclxuXHRcdGZvciBub2RlIG9mIEBsTm9kZVN0YWNrXHJcblx0XHRcdHJlc3VsdHMucHVzaCBub2RlLmtpbmQudG9TdHJpbmcoKVxyXG5cdFx0bFN0YWNrIDo9IHJlc3VsdHNcclxuXHRcdHJldHVybiBsU3RhY2suam9pbiAnLCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIHB1c2hOb2RlKG5vZGU6IE5vZGUpOiB2b2lkXHJcblxyXG5cdFx0c3VwZXIucHVzaE5vZGUgbm9kZVxyXG5cdFx0aWYgQGhPcHRpb25zLnRyYWNlXHJcblx0XHRcdEBkYmcgJ3B1c2gnLCBub2RlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIHBvcE5vZGUoKTogTm9kZT9cclxuXHJcblx0XHRub2RlIDo9IHN1cGVyLnBvcE5vZGUoKVxyXG5cdFx0aWYgQGhPcHRpb25zLnRyYWNlXHJcblx0XHRcdGlmIGRlZmluZWQobm9kZSlcclxuXHRcdFx0XHRAZGJnICdwb3AnLCBub2RlXHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBcIlNUQUNLIEVNUFRZXCJcclxuXHRcdHJldHVybiBub2RlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBpc05vZGUoeDogb2JqZWN0KTogeCBpcyBOb2RlXHJcblxyXG5cdFx0cmV0dXJuIE9iamVjdC5oYXNPd24geCwgJ2tpbmQnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBmaWx0ZXIobm9kZTogTm9kZSk6IGJvb2xlYW5cclxuXHJcblx0XHRyZXR1cm4gZGVmaW5lZChAZmlsdGVyRnVuYykgPyBAZmlsdGVyRnVuYyhub2RlKSA6IHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ0FuYWx5c2lzXHJcblxyXG5cdHRyYWNlID0gZmFsc2VcclxuXHRtSW1wb3J0cyA9IG5ldyBDU3RyaW5nU2V0TWFwKClcclxuXHRtRXhwb3J0cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcclxuXHRzTWlzc2luZyA9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0bWFpblNjb3BlID0gbmV3IENNYWluU2NvcGUoKVxyXG5cdGN1clNjb3BlOiBDU2NvcGVcclxuXHRmaW5pc2hlZCA9IGZhbHNlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihAdHJhY2UgPSBmYWxzZSlcclxuXHJcblx0XHRAY3VyU2NvcGUgPSBAbWFpblNjb3BlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRkZWZpbmUobmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBkZWZpbmUgI3tuYW1lfVwiXHJcblx0XHRAY3VyU2NvcGUuZGVmaW5lIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0dXNlKG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHQjIC0tLSB0aGlzIGNvbmRpdGlvbiBzaG91bGQgZmlsdGVyIGJ1aWx0LWluc1xyXG5cdFx0aWYgbm90IGhhc0tleShnbG9iYWxUaGlzLCBuYW1lKVxyXG5cdFx0XHRpZiBAdHJhY2VcclxuXHRcdFx0XHRMT0cgXCIgICB1c2UgI3tuYW1lfVwiXHJcblx0XHRcdGlmIG5vdCBAY3VyU2NvcGUuaXNEZWZpbmVkKG5hbWUpXHJcblx0XHRcdFx0aWYgQHRyYWNlXHJcblx0XHRcdFx0XHRMT0cgXCIgICBtaXNzaW5nICN7bmFtZX1cIlxyXG5cdFx0XHRcdEBzTWlzc2luZy5hZGQgbmFtZVxyXG5cdFx0XHRAY3VyU2NvcGUudXNlIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YWRkSW1wb3J0KGxpYjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGltcG9ydCAnI3tuYW1lfScgaW4gJyN7bGlifSdcIlxyXG5cdFx0QG1JbXBvcnRzLmFkZCBsaWIsIG5hbWVcclxuXHRcdEBkZWZpbmUgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhZGRFeHBvcnQobmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGV4cG9ydCAnI3tuYW1lfSc6ICcje3R5cGV9J1wiXHJcblx0XHRAbUV4cG9ydHMuc2V0IG5hbWUsIHR5cGVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0bmV3U2NvcGUobmFtZTogc3RyaW5nPywgbEFyZ3M6IHN0cmluZ1tdKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBuZXcgc2NvcGUgI3tuYW1lIHx8ICc8YW5vbj4nfSgje2xBcmdzLmpvaW4oJywnKX0pXCJcclxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGUubmV3U2NvcGUobmFtZSwgbEFyZ3MpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGVuZFNjb3BlKCk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZW5kIHNjb3BlXCJcclxuXHRcdHNjb3BlIDo9IEBtYWluU2NvcGUuZW5kU2NvcGUgQGN1clNjb3BlXHJcblx0XHRpZiBkZWZpbmVkKHNjb3BlKVxyXG5cdFx0XHRAY3VyU2NvcGUgPSBzY29wZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRAZmluaXNoZWQgPSB0cnVlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEltcG9ydHMoKTogVEJsb2NrRGVzY1xyXG5cclxuXHRcdGhJbXBvcnRzOiBoYXNob2Y8c3RyaW5nW10+IDo9IHt9XHJcblx0XHRmb3IgW2xpYiwgc05hbWVzXSBvZiBAbUltcG9ydHMuZW50cmllcygpXHJcblx0XHRcdGhJbXBvcnRzW2xpYl0gPSBBcnJheS5mcm9tKHNOYW1lcy52YWx1ZXMoKSlcclxuXHRcdHJldHVybiBoSW1wb3J0c1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0RXhwb3J0cygpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHJldHVybiBBcnJheS5mcm9tIEBtRXhwb3J0cy5rZXlzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldE1pc3NpbmcoKTogc3RyaW5nW11cclxuXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBAc01pc3NpbmcudmFsdWVzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEV4dHJhKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0d2Fsa2VyIDo9IG5ldyBXYWxrZXI8Q1Njb3BlPigpXHJcblx0XHR3YWxrZXIuaXNOb2RlID0gKHg6IHVua25vd24pID0+XHJcblx0XHRcdHJldHVybiAoeCBpbnN0YW5jZW9mIENTY29wZSlcclxuXHJcblx0XHQjIC0tLSBGaW5kIGFsbCBuYW1lcyB0aGF0IGFyZSBkZWZpbmVkLCBidXQgbmV2ZXIgdXNlZCBvciBleHBvcnRlZFxyXG5cdFx0c05hbWVzIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0XHRmb3Igc2NvcGUgb2Ygd2Fsa2VyLndhbGsoQG1haW5TY29wZSlcclxuXHRcdFx0Zm9yIG5hbWUgb2Ygc2NvcGUuYWxsRGVmaW5lZCgpXHJcblx0XHRcdFx0aWYgbm90IHNjb3BlLmlzVXNlZChuYW1lKSAmJiAhQG1FeHBvcnRzLmhhcyhuYW1lKVxyXG5cdFx0XHRcdFx0c05hbWVzLmFkZCBuYW1lXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBzTmFtZXMudmFsdWVzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFzU3RyaW5nKHdpZHRoOiBpbnRlZ2VyID0gNjQpOiBzdHJpbmdcclxuXHJcblx0XHRoOiBUQmxvY2tEZXNjIDo9IHtcclxuXHRcdFx0SU1QT1JUUzogQGdldEltcG9ydHMoKVxyXG5cdFx0XHRFWFBPUlRTOiBAZ2V0RXhwb3J0cygpXHJcblx0XHRcdE1JU1NJTkc6IEBnZXRNaXNzaW5nKClcclxuXHRcdFx0RVhUUkE6IEBnZXRFeHRyYSgpXHJcblx0XHRcdH1cclxuXHJcblx0XHRpZiBpc0VtcHR5KGguSU1QT1JUUylcclxuXHRcdFx0ZGVsZXRlIGguSU1QT1JUU1xyXG5cdFx0aWYgaXNFbXB0eShoLkVYUE9SVFMpXHJcblx0XHRcdGRlbGV0ZSBoLkVYUE9SVFNcclxuXHRcdGlmIGlzRW1wdHkoaC5NSVNTSU5HKVxyXG5cdFx0XHRkZWxldGUgaC5NSVNTSU5HXHJcblx0XHRpZiBpc0VtcHR5KGguRVhUUkEpXHJcblx0XHRcdGRlbGV0ZSBoLkVYVFJBXHJcblx0XHRyZXR1cm4gQmxvY2tpZnkgaFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXROb2RlIDo9IChcclxuXHRcdHg6IHVua25vd25cclxuXHRcdHBhdGhzdHI6IHN0cmluZ1xyXG5cdFx0KTogTm9kZSA9PlxyXG5cclxuXHR2YWwgOj0gZXh0cmFjdCh4LCBwYXRoc3RyKSBhcyBOb2RlXHJcblx0cmV0dXJuIHZhbFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbmFseXplVHNDb2RlIDo9IChcclxuXHRcdHRzQ29kZTogc3RyaW5nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBDQW5hbHlzaXMgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRmaWxlTmFtZTogc3RyaW5nP1xyXG5cdFx0ZHVtcEFTVDogYm9vbGVhblxyXG5cdFx0dHJhY2U6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7ZmlsZU5hbWUsIGR1bXBBU1QsIHRyYWNlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGZpbGVOYW1lOiB1bmRlZlxyXG5cdFx0ZHVtcEFTVDogZmFsc2VcclxuXHRcdHRyYWNlOiBmYWxzZVxyXG5cdFx0fVxyXG5cclxuXHRhbmFseXNpcyA6PSBuZXcgQ0FuYWx5c2lzKHRyYWNlKVxyXG5cdHdhbGtlciA6PSBuZXcgQXN0V2Fsa2VyKClcclxuXHJcblx0IyAtLS0gdGhyb3dzIEVycm9yIGlmIG5vdCB2YWxpZCBUeXBlU2NyaXB0XHJcblx0aEFzdCA6PSB0czJhc3QgdHNDb2RlXHJcblxyXG5cdGlmIGR1bXBBU1RcclxuXHRcdERVTVAgYXN0QXNTdHJpbmcoaEFzdCksICdBU1QnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjaGVja05vZGUgOj0gKFxyXG5cdFx0XHRub2RlOiBOb2RlLFxyXG5cdFx0XHRwYXRoc3RyOiBzdHJpbmc/ID0gdW5kZWZcclxuXHRcdFx0KTogdm9pZCA9PlxyXG5cclxuXHRcdGlmIGRlZmluZWQocGF0aHN0cilcclxuXHRcdFx0bm9kZSA9IGdldE5vZGUobm9kZSwgcGF0aHN0cilcclxuXHRcdGlmIChub2RlLmtpbmQgPT0gODApICAgIyAtLS0gSWRlbnRpZmllclxyXG5cdFx0XHRuYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRhbmFseXNpcy51c2UgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRzeW0gOj0gKHZraW5kOiBUVmlzaXRLaW5kKTogc3RyaW5nID0+XHJcblx0XHRzd2l0Y2ggdmtpbmRcclxuXHRcdFx0d2hlbiAnZW50ZXInIHRoZW4gcmV0dXJuICctPidcclxuXHRcdFx0d2hlbiAnZXhpdCcgIHRoZW4gcmV0dXJuICc8LSdcclxuXHRcdFx0ZWxzZSAgICAgICAgICAgICAgcmV0dXJuICc6OidcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyB2a2luZCBpcyBvbmUgb2YgJ2VudGVyJywgJ2V4aXQnLCAncmVmJ1xyXG5cclxuXHRsVHJhY2VLaW5kIDo9IFs4MCwgOTUsIDE3MCwgMjE0LCAyMjAsIDIyNywgMjU0LCAyNjEsIDI2MywgMjczLCAyODAsIDMwOF1cclxuXHRmb3IgW3ZraW5kLCBub2RlXSBvZiB3YWxrZXIud2Fsa0V4KGhBc3QpXHJcblx0XHR7a2luZH0gOj0gbm9kZVxyXG5cdFx0aWYgdHJhY2UgJiYgbFRyYWNlS2luZC5pbmNsdWRlcyhraW5kKVxyXG5cdFx0XHRMT0cgZlwiI3tzeW0odmtpbmQpfSBOT0RFICN7a2luZH06MyAoI3traW5kU3RyKGtpbmQpfTp7Y3lhbn0pXCJcclxuXHJcblx0XHRpZiAodmtpbmQgPT0gJ2V4aXQnKVxyXG5cdFx0XHRzd2l0Y2gga2luZFxyXG5cclxuXHRcdFx0XHR3aGVuIDIyMCwgMjYzICAgIyBBcnJvd0Z1bmN0aW9uLCBGdW5jdGlvbkRlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRhbmFseXNpcy5lbmRTY29wZSgpXHJcblxyXG5cdFx0ZWxzZSBpZiAodmtpbmQgPT0gJ2VudGVyJylcclxuXHJcblx0XHRcdHN3aXRjaCBraW5kXHJcblxyXG5cdFx0XHRcdHdoZW4gMjIwICAgICMgQXJyb3dGdW5jdGlvblxyXG5cdFx0XHRcdFx0ZG9cclxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cclxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0JylcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMubmV3U2NvcGUgdW5kZWYsIGxQYXJtc1xyXG5cclxuXHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdHRyeVxyXG5cdFx0XHRcdFx0XHR2YXJOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmRlZmluZSB2YXJOYW1lXHJcblxyXG5cdFx0XHRcdHdoZW4gMjYzICAgICMgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0IyAtLS0gZG8gY3JlYXRlcyBhIHNjb3BlLCBhIGxhIGFuIElJRkVcclxuXHRcdFx0XHRcdGRvXHJcblx0XHRcdFx0XHRcdGZ1bmNOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblxyXG5cdFx0XHRcdFx0XHRsUGFybXMgOj0gQXJyYXkuZnJvbSBNQVAgZ2V0QXJyYXkobm9kZSwgJy5wYXJhbWV0ZXJzJyksICh4KSAtPlxyXG5cdFx0XHRcdFx0XHRcdHlpZWxkIGdldFN0cmluZyh4LCAnLm5hbWUuZXNjYXBlZFRleHQnKVxyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgZnVuY05hbWVcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMubmV3U2NvcGUgZnVuY05hbWUsIGxQYXJtc1xyXG5cclxuXHRcdFx0XHR3aGVuIDIyNyAgICAjIEJpbmFyeUV4cHJlc3Npb25cclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmxlZnQnXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5yaWdodCdcclxuXHJcblx0XHRcdFx0d2hlbiAyMTQgICAgIyBDYWxsRXhwcmVzc2lvblxyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcuZXhwcmVzc2lvbidcclxuXHRcdFx0XHRcdGZvciBhcmcgb2YgZ2V0QXJyYXkobm9kZSwgJy5hcmd1bWVudHMnKVxyXG5cdFx0XHRcdFx0XHRjaGVja05vZGUoYXJnIGFzIE5vZGUpXHJcblxyXG5cdFx0XHRcdHdoZW4gMjczICAgICMgSW1wb3J0RGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdGxpYiA6PSBnZXRTdHJpbmcgbm9kZSwgJy5tb2R1bGVTcGVjaWZpZXIudGV4dCdcclxuXHRcdFx0XHRcdGZvciBoIG9mIGdldEFycmF5KG5vZGUsICcuaW1wb3J0Q2xhdXNlPy5uYW1lZEJpbmRpbmdzPy5lbGVtZW50cycpXHJcblx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGgsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkSW1wb3J0IGxpYiwgbmFtZVxyXG5cclxuXHRcdFx0XHR3aGVuIDI4MCAgICAjIE5hbWVkRXhwb3J0c1xyXG5cdFx0XHRcdFx0Zm9yIGVsZW0gb2YgZ2V0QXJyYXkobm9kZSwgJy5lbGVtZW50cycpXHJcblx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGVsZW0sICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdyZS1leHBvcnQnXHJcblxyXG5cdFx0XHRcdHdoZW4gOTUgICAgICMgRXhwb3J0S2V5d29yZFxyXG5cdFx0XHRcdFx0cGFyZW50IDo9IHdhbGtlci5wYXJlbnQoKVxyXG5cdFx0XHRcdFx0c3dpdGNoIGdldE51bWJlcihwYXJlbnQsICcua2luZCcpXHJcblxyXG5cdFx0XHRcdFx0XHR3aGVuIDI0NCAgICAjIEZpcnN0U3RhdGVtZW50XHJcblx0XHRcdFx0XHRcdFx0Zm9yIGRlY2wgb2YgZ2V0QXJyYXkocGFyZW50LCAnLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMnKVxyXG5cdFx0XHRcdFx0XHRcdFx0c3dpdGNoIGdldE51bWJlcihkZWNsLCAnLmtpbmQnKVxyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0d2hlbiAyNjEgICAgIyBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgZGVjbCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCMgLS0tIENoZWNrIGluaXRpYWxpemVyIHRvIGZpbmQgdGhlIHR5cGVcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpbml0S2luZCA6PSBnZXROdW1iZXIgZGVjbCwgJy5pbml0aWFsaXplci5raW5kJ1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHN3aXRjaCBpbml0S2luZFxyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gMjIwICAgICMgQXJyb3dGdW5jdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gOSwgMjYxICMgRmlyc3RMaXRlcmFsVG9rZW4sIFZhcmlhYmxlRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdjb25zdCdcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OlxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3Vua25vd24nXHJcblxyXG5cdFx0XHRcdFx0XHR3aGVuIDI2MyAgICMgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnZnVuY3Rpb24nXHJcblxyXG5cdFx0XHRcdFx0XHR3aGVuIDI2NCAgICMgQ2xhc3NEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnY2xhc3MnXHJcblxyXG5cdFx0XHRcdFx0XHR3aGVuIDI2NiAgICMgVHlwZUFsaWFzRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3R5cGUnXHJcblxyXG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxyXG5cdFx0XHRcdFx0XHRcdGNyb2FrIFwiVW5leHBlY3RlZCBzdWJ0eXBlIG9mIDk1OiAje3BhcmVudC5raW5kfVwiXHJcblx0cmV0dXJuIGFuYWx5c2lzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuY2xhc3MgQ1VuaXRUZXN0ZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9Vbml0VGVzdCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGhhbmRsZShcclxuXHRcdFx0cGF0aDogc3RyaW5nLFxyXG5cdFx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHRcdCk6IFRFeGVjUmVzdWx0XHJcblxyXG5cdFx0YXNzZXJ0IHBhdGguZW5kc1dpdGgoJy50ZXN0LnRzJyksIFwiTm90IGEgdW5pdCB0ZXN0IGZpbGVcIlxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdGNhcHR1cmU6IGJvb2xlYW5cclxuXHRcdFx0aW5zcGVjdDogYm9vbGVhblxyXG5cdFx0XHRsaW5lTnVtOiBzdHJpbmc/XHJcblx0XHRcdH1cclxuXHRcdHtjYXB0dXJlLCBpbnNwZWN0LCBsaW5lTnVtfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdFx0Y2FwdHVyZTogdHJ1ZVxyXG5cdFx0XHRpbnNwZWN0OiBmYWxzZVxyXG5cdFx0XHRsaW5lTnVtOiB1bmRlZlxyXG5cdFx0XHR9XHJcblxyXG5cdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xyXG5cdFx0XHRcdCd0ZXN0J1xyXG5cdFx0XHRcdCctQSdcclxuXHRcdFx0XHQuLi4oaW5zcGVjdFxyXG5cdFx0XHRcdFx0PyBbJy0taW5zcGVjdC1icmsnXVxyXG5cdFx0XHRcdFx0OiBbJy0tY292ZXJhZ2U9Li9jb3ZlcmFnZScsICctLWNvdmVyYWdlLXJhdy1kYXRhLW9ubHknXVxyXG5cdFx0XHRcdFx0KVxyXG5cdFx0XHRcdC4uLihkZWZpbmVkKGxpbmVOdW0pXHJcblx0XHRcdFx0XHQ/IFsnLS1maWx0ZXInLCBcIi9ebGluZSAje2xpbmVOdW19JC9cIl1cclxuXHRcdFx0XHRcdDogW11cclxuXHRcdFx0XHRcdClcclxuXHRcdFx0XHRwYXRoXHJcblx0XHRcdFx0XSwge2NhcHR1cmV9XHJcblx0XHRyZXR1cm4gaFJlc3VsdFxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgZ2V0T3V0cHV0KGhSZXN1bHQ6IFRFeGVjUmVzdWx0KTogc3RyaW5nXHJcblxyXG5cdFx0e3N0ZG91dCwgc3RkZXJyfSA6PSBoUmVzdWx0XHJcblx0XHRvdXRwdXQgOj0gW3N0ZG91dCwgc3RkZXJyXS5qb2luKClcclxuXHRcdGlmIG5vdCBoUmVzdWx0LnN1Y2Nlc3MgfHwgb3V0cHV0Lm1hdGNoKC9jcm9ha3xlcnJvci9pKVxyXG5cdFx0XHRyZXR1cm4gb3V0cHV0XHJcblxyXG5cdFx0bExpbmVzIDo9IEFycmF5LmZyb20gTUFQIGFsbExpbmVzSW4oZGVjb2xvcml6ZShvdXRwdXQpKSwgKGxpbmUpIC0+XHJcblx0XHRcdGlmIGxpbmUuc3RhcnRzV2l0aCgnbGluZScpXHJcblx0XHRcdFx0aWYgbm90IGxpbmUuaW5jbHVkZXMoJyBvayAnKVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0RkFJTEVEOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRPSzogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygncGFzc2VkJykgJiYgbGluZS5pbmNsdWRlcygnZmFpbGVkJylcclxuXHRcdFx0XHRpZiBsaW5lLmluY2x1ZGVzKCcgMCBmYWlsZWQgJylcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0ZmFpbGVkOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiBsaW5lLmluY2x1ZGVzKCdMY292IGNvdmVyYWdlJylcclxuXHRcdFx0XHR5aWVsZCAnY292ZXJhZ2UgcmVwb3J0IGdlbmVyYXRlZCdcclxuXHRcdHJldHVybiBsTGluZXMuam9pbignXFxuJylcclxuXHJcbmV4cG9ydCBkb1VuaXRUZXN0IDo9IG5ldyBDVW5pdFRlc3RlcigpXHJcbiJdfQ==