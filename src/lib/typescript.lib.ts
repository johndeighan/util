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
	LOG, DBG, ERR, INDENT, UNDENT,
	} from 'logger'
import {extractSourceMap} from 'stack'
import {
	undef, defined, notdefined, croak, assert, getErrStr,
	withColors, decolorize, words, allLinesIn,
	} from 'base'
import {
	integer, hash, hashof, array,
	isHash, isString, isEmpty, nonEmpty, isNumber,
	isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	getOptions, spaces, o, hasKey,
	CStringSetMap, keys, sep, f,
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
	execCmd, CFileHandler, TExecResult,
	} from 'exec'
import {TProcSpec, procFiles, procOneFile} from 'proc-files'
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
			capture: false,
			inspect: false,
			lineNum: undef
			})

		const hResult = await execCmd('deno', [
				'test',
				'-A',
				'--trace-leaks',
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInR5cGVzY3JpcHQubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsdUJBQXNCO0FBQ3RCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMxQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUN4RCxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzlELENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUM7QUFDaEQsQ0FBQyxlQUFlLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN0RCxDQUFDLDRCQUE0QixDQUFDLENBQUMsNkJBQTZCLENBQUM7QUFDN0QsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUN4QixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDL0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDaEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU87QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDdEQsQ0FBQyxVQUFVLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUM7QUFDM0MsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU07QUFDZCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUM5QixDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUMvQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUM1QyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUNuQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUMvQixDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUNqQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDbEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDcEQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDakIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRO0FBQzNDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDO0FBQ3JELENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsbUJBQW1CLENBQUM7QUFDdEMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU07QUFDZCxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUNoRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ3BDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNO0FBQ2QsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZO0FBQzVELEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtBQUN6QyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU87QUFDeEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDNUMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRO0FBQzFCLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYztBQUM1QyxBQUFBO0FBQ0EsQUFBQSxBQUFPLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFBLEFBQUMsT0FBTyxDQUFBO0FBQ2xDLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBUSxNQUFQLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUN4QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDO0FBQUMsQ0FBQTtBQUNyQixBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQU8sTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDbEIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNqQixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDWixBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsTUFBTTtBQUNsQixFQUFFLENBQUM7QUFDSCxBQUFBLENBQVcsTUFBVixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQzFDLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxTQUFTO0FBQ3JCLEVBQUUsQ0FBQyxDQUFBO0FBQ0gsQUFBQTtBQUNBLEFBQUEsQ0FBZ0IsTUFBZixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7QUFDNUMsQUFBQSxDQUFLLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxnQkFBZ0IsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUE7QUFDN0QsQUFBQSxDQUFDLE1BQU0sQ0FBQyxJO0FBQUksQ0FBQTtBQUNaLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBTyxNQUFOLE1BQU0sQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNsQixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSTtBQUNaLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxNQUFNLENBQUEsQUFBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUE7QUFDbkQsQUFBQSxDQUFRLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxhQUFhLENBQUEsQUFBQyxDQUFBLE9BQU8sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUEsQ0FBQTtBQUN2RCxBQUFBLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDO0FBQUMsQ0FBQTtBQUN6RSxBQUFBO0FBQ0EsQUFBQSw4RUFBNkU7QUFDN0UsQUFBQSw0REFBMkQ7QUFDM0QsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQW1CLE1BQWxCLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUM5QixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFBO0FBQ2IsQUFBQSxFQUFFLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQTtBQUNoQixBQUFBLEVBQUUsT0FBTyxDQUFDLENBQUMsT0FBTztBQUNsQixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRTtBQUFFLENBQUE7QUFDeEUsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFZLE1BQVgsV0FBVyxDQUFDLENBQUUsQ0FBQyxDQUFDO0FBQ3ZCLEFBQUEsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDZixBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFBLENBQUE7QUFDZCxBQUFBO0FBQ0EsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixBQUFBLEVBQUUsUUFBUSxDLEMsQyxDQUFDLEFBQUMsTUFBTSxDQUFDLEMsQyxZLENBQUU7QUFDckIsRUFBRSxDQUFDO0FBQ0gsQUFBQSxDQUFXLE1BQVYsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFBLEFBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUMxQyxBQUFBLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSztBQUNqQixFQUFFLENBQUMsQ0FBQTtBQUNILEFBQUE7QUFDQSxBQUFBLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDdEIsQUFBQSxFQUFFLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUN2QixBQUFBLEVBQUUsUUFBUSxDQUFBO0FBQ1YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFHO0FBQ3JCO0FBQ0E7QUFDQTtBQUNBLGVBRUcsQ0FBRyxDQUFDO0FBQ1AsRUFBRSxDQUFDLEM7QUFBQSxDQUFBO0FBQ0gsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFjLE1BQWIsYUFBYSxDQUFDLENBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ3BELEFBQUE7QUFDQSxBQUFBLENBQUMsR0FBRyxDQUFBLEFBQUMsc0JBQXNCLENBQUE7QUFDM0IsQUFBQSxDQUFTLE1BQVIsUUFBUSxDQUFDLENBQUUsQ0FBQyxrQkFBa0IsQ0FBQSxBQUFDLE9BQU8sQ0FBQTtBQUN2QyxBQUFBLENBQUMsUUFBUSxDQUFBLEFBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFBO0FBQzlCLEFBQUEsQ0FBQyxHQUFHLENBQUEsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN0QixBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLG9CQUFvQixDQUFBLEFBQUMsUUFBUSxDQUFBO0FBQ3pDLEFBQUEsRUFBRSxRQUFRLENBQUEsQUFBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUE7QUFDM0IsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDO0NBQUEsQ0FBQTtBQUN6QixBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsTUFBTSxDQUFDLEU7Q0FBRSxDO0FBQUEsQ0FBQTtBQUNYLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBbUIsTUFBbEIsa0JBQWtCLENBQUMsQ0FBRSxDQUFDLENBQUM7QUFDOUIsQUFBQSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU07QUFDakIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2hCLEFBQUE7QUFDQSxBQUFBLEMsSSxHLEMsSSxJLENBQUMsR0FBRyxDLEMsR0FBUyxDQUFDLENBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLDJEQUEyRCxDLENBQUMsQ0FBQyxDQUFBLENBQS9FLE1BQVIsUSxHLEcsQ0FBdUY7QUFDNUYsQUFBQSxFQUFvQixNQUFsQixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUUsQ0FBQyxRQUFRO0FBQ2hDLEFBQUEsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQztDQUFDLENBQUE7QUFDckQsQUFBQSxDQUFDLElBQUksQ0FBQyxHQUFHLEMsQyxJQUFTLENBQUMsQ0FBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMseUNBQXlDLEMsQ0FBQyxDQUFDLENBQUEsQ0FBN0QsTUFBUixRLEcsSSxDQUFxRTtBQUMvRSxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDO0NBQUMsQ0FBQTtBQUN0QixBQUFBLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDTCxBQUFBLEVBQUUsTUFBTSxDQUFDLENBQUMsQztDQUFDLEM7QUFBQSxDQUFBO0FBQ1gsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQTJCLE1BQTNCLFVBQVUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUNoQyxBQUFBLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ2pCLEFBQUEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUM5QixBQUFBLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDOUIsQUFBQSxDQUFDLG1CQUFtQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQzNCLEFBQUEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDckIsQUFBQSxDQUFDLDJDQUEyQyxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ25ELEFBQUEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDakIsQUFBQSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUNuQixBQUFBLENBQUMsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3JCLEFBQUEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUM1QixBQUFBLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDeEIsQUFBQSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUNqQixBQUFBLENBQUMscUJBQXFCLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDN0IsQUFBQSxDQUFDLDRCQUE0QixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3BDLEFBQUEsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUNoQyxBQUFBLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDekMsQUFBQSxDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFBO0FBQzNCLEFBQUEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDdEIsQUFBQSxDQUFDLG9CQUFvQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDdkIsQUFBQSxDQUFDLGlCQUFpQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3pCLEFBQUEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDdkIsQUFBQSxDQUFDLGlCQUFpQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3pCLEFBQUEsQ0FBQyxzQkFBcUI7QUFDdEIsQUFBQSxDQUFDLHVDQUFzQztBQUN2QyxBQUFBLENBQUMsMENBQXlDO0FBQzFDLEFBQUEsQ0FBQyw4QkFBNkI7QUFDOUIsQUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDVCxBQUFBLEVBQUUsUUFBUSxDQUFBO0FBQ1YsQUFBQSxFQUFFLEtBQUssQ0FBQTtBQUNQLEFBQUEsRUFBRSxjQUFjO0FBQ2hCLEFBQUEsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBLENBQUMsU0FBUyxDQUFDLENBQUMsU0FBUyxDQUFBO0FBQ3JCLEFBQUEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMxQixBQUFBLENBQUMsUUFBUSxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQTtBQUM1QixBQUFBLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDN0IsQUFBQSxDQUFDLGtCQUFrQixDQUFDLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFBO0FBQ2xELEFBQUEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFBO0FBQ2hDLEFBQUEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDZixBQUFBLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDdkIsQUFBQSxDQUFDLG1CQUFtQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQzNCLEFBQUEsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUNuQyxBQUFBLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3RCLEFBQUEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUMzQixBQUFBLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDMUIsQUFBQSxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUMzQyxBQUFBLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDakMsQUFBQSxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUMzQixBQUFBLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxDQUFBO0FBQ3BCLEFBQUEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDckIsQUFBQSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1osQUFBQSxDQUFDLG9CQUFvQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQzVCLEFBQUEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUMxQixBQUFBLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDOUIsQUFBQSxDQUFDLGdCQUFnQixDQUFDLENBQUMsT0FBTyxDQUFBO0FBQzFCLEFBQUEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUN4QixBQUFBLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDMUIsQUFBQSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUNyQixBQUFBLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDZixBQUFBLENBQUMscUJBQXFCLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDN0IsQUFBQSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUN0QixBQUFBLENBQUMsV0FBVyxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ25CLEFBQUEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDeEIsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUNmLEFBQUEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUM1QixBQUFBLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDNUIsQUFBQSxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3pCLEFBQUEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUNyQyxBQUFBLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3ZCLEFBQUEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUN0QyxBQUFBLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDeEMsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUE7QUFDOUIsQUFBQSxDQUFDLGlCQUFpQixDQUFDLENBQUMsS0FBSyxDQUFBO0FBQ3pCLEFBQUEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUM3QixBQUFBLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsQUFBQSxDQUFDLHlCQUF5QixDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ2hDLEFBQUEsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLElBQUk7QUFDbkMsQ0FBQyxDQUFDO0FBQ0YsQUFBQTtBQUNBLEFBQUEsOEVBQTZFO0FBQzdFLEFBQUE7QUFDQSxBQUFBLEFBQUEsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSTtBQUNaLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUE7QUFDM0MsQUFBQTtBQUNBLEFBQUEsQ0FBQyxVQUFVLEMsQyxDQUFDLEFBQUMsYyxZLENBQWU7QUFDNUIsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUk7QUFDZixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFdBQVksQ0FBQztBQUNiLEFBQUEsR0FBSSxXQUFVLEMsQyxDQUFDLEFBQUMsYyxZLENBQWUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ3hDLEFBQUEsR0FBSSxTQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixHQUFHLENBQUMsQ0FBQSxDQUFBO0FBQ0osQUFBQSxFQUFFLEtBQUssQ0FBQyxDQURKO0FBQ0osQUFBQSxFQUhHLEtBQUMsVSxHQUFBLFcsQ0FFQTtBQUNKLEFBQUEsRUFGRyxLQUFDLFEsR0FBQSxTLEM7Q0FFSyxDQUFBO0FBQ1QsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxHQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQzFDLEFBQUE7QUFDQSxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLEtBQUs7QUFDakIsQUFBQSxFQUFNLE1BQUosSUFBSSxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSTtBQUNuQixBQUFBLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQSxBQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN2RSxBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFNBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUEsQ0FBQTtBQUNwQixBQUFBO0FBQ0EsQUFBQSxFQUFTLE1BQVAsT0FBTyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDZixBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLEksQ0FBQyxVQUFVLENBQUEsQ0FBQSxDQUFBO0FBQ3pCLEFBQUEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFBLEFBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDO0VBQUEsQ0FBQTtBQUNwQyxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLE9BQU87QUFDbkIsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBLEFBQUMsR0FBRyxDO0NBQUEsQ0FBQTtBQUN4QixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDQUFDLFFBQVEsQyxRQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUNwQyxBQUFBO0FBQ0EsQUFBQSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDckIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDcEIsQUFBQSxHQUFHLEksQ0FBQyxHQUFHLENBQUEsQUFBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEM7RUFBQSxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLENBQUMsUUFBUSxDLE9BQVEsQ0FBQyxDQUFDLEMsQyxDQUFDLEFBQUMsSSxZLENBQUssQ0FBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLEVBQU0sTUFBSixJQUFJLENBQUMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN6QixBQUFBLEVBQUUsR0FBRyxDQUFBLEksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNwQixBQUFBLEdBQUcsR0FBRyxDQUFBLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxJQUFJLEksQ0FBQyxHQUFHLENBQUEsQUFBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEM7R0FBQSxDQUFBO0FBQ3BCLEFBQUEsR0FBRyxJQUFJLENBQUEsQ0FBQTtBQUNQLEFBQUEsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFBLEFBQUMsYUFBYSxDO0dBQUEsQztFQUFBLENBQUE7QUFDN0IsQUFBQSxFQUFFLE1BQU0sQ0FBQyxJO0NBQUksQ0FBQTtBQUNiLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLENBQUMsUUFBUSxDLE1BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQztDQUFBLENBQUE7QUFDaEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxRQUFRLEMsTUFBTyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFBLENBQUE7QUFDckMsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLEksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSTtDQUFJLEM7QUFBQSxDQUFBO0FBQ3hELEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFBLENBQUE7QUFDdEIsQUFBQTtBQUNBLEFBQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUs7QUFDZCxBQUFBLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDL0IsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLEFBQUEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM3QixBQUFBLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDN0IsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU07QUFDakIsQUFBQSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSztBQUNqQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFdBQVksQ0FBRSxNQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUE7QUFDNUIsQUFBQTtBQUNBLEFBQUEsRUFGYSxLQUFDLEssR0FBQSxNLENBQWM7QUFDNUIsQUFBQTtBQUNBLEFBQUEsRUFBRSxJLENBQUMsUUFBUSxDLENBQUUsQ0FBQyxJLENBQUMsUztDQUFTLENBQUE7QUFDeEIsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxNQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUMzQixBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQSxJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNYLEFBQUEsR0FBRyxHQUFHLENBQUEsQUFBQyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDO0VBQUEsQ0FBQTtBQUMxQixBQUFBLEVBQUUsSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUE7QUFDdkIsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxHQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUN4QixBQUFBO0FBQ0EsQUFBQSxFQUFFLDZDQUE0QztBQUM5QyxBQUFBLEVBQUUsR0FBRyxDQUFBLENBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUNqQyxBQUFBLEdBQUcsR0FBRyxDQUFBLEksQ0FBQyxLQUFLLENBQUEsQ0FBQSxDQUFBO0FBQ1osQUFBQSxJQUFJLEdBQUcsQ0FBQSxBQUFDLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLEM7R0FBQSxDQUFBO0FBQ3hCLEFBQUEsR0FBRyxHQUFHLENBQUEsQ0FBSSxJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDbkMsQUFBQSxJQUFJLEdBQUcsQ0FBQSxJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNiLEFBQUEsS0FBSyxHQUFHLENBQUEsQUFBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDO0lBQUEsQ0FBQTtBQUM3QixBQUFBLElBQUksSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUEsQUFBQyxJQUFJLEM7R0FBQSxDQUFBO0FBQ3RCLEFBQUEsR0FBRyxJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQSxBQUFDLElBQUksQztFQUFBLENBQUE7QUFDckIsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxTQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUMzQyxBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQSxJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNYLEFBQUEsR0FBRyxHQUFHLENBQUEsQUFBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQztFQUFBLENBQUE7QUFDeEMsQUFBQSxFQUFFLEksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFBLEFBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3pCLEFBQUEsRUFBRSxJLENBQUMsTUFBTSxDQUFBLEFBQUMsSUFBSSxDQUFBO0FBQ2QsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxTQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUEsQ0FBQTtBQUM1QyxBQUFBO0FBQ0EsQUFBQSxFQUFFLEdBQUcsQ0FBQSxJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQTtBQUNYLEFBQUEsR0FBRyxHQUFHLENBQUEsQUFBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQztFQUFBLENBQUE7QUFDdkMsQUFBQSxFQUFFLEksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQzFCLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLElBQUksQyxDLENBQUMsQUFBQyxNLFksQ0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDL0MsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUEsSSxDQUFDLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBO0FBQzdELEFBQUEsRUFBRSxJLENBQUMsUUFBUSxDLENBQUUsQ0FBQyxJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDOUMsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUEsSSxDQUFDLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsY0FBYyxDO0VBQUEsQ0FBQTtBQUNyQixBQUFBLEVBQU8sTUFBTCxLQUFLLENBQUMsQ0FBRSxDQUFDLEksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQTtBQUN4QyxBQUFBLEVBQUUsR0FBRyxDQUFBLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDbkIsQUFBQSxHQUFHLEksQ0FBQyxRQUFRLEMsQ0FBRSxDQUFDLEs7RUFBSyxDQUFBO0FBQ3BCLEFBQUEsRUFBRSxJQUFJLENBQUEsQ0FBQTtBQUNOLEFBQUEsR0FBRyxJLENBQUMsUUFBUSxDLENBQUUsQ0FBQyxJO0VBQUksQ0FBQTtBQUNuQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQSxDQUFBO0FBQ3pCLEFBQUE7QUFDQSxBQUFBLEVBQTRCLE1BQTFCLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQztBQUNsQyxBQUFBLEVBQUUsR0FBRyxDQUFDLENBQUEsTUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQzFDLEFBQUEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLEMsQ0FBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7RUFBQyxDQUFBO0FBQzlDLEFBQUEsRUFBRSxNQUFNLENBQUMsUTtDQUFRLENBQUE7QUFDakIsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxVQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUE7QUFDQSxBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUEsQUFBQyxJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3BDLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUN2QixBQUFBO0FBQ0EsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUN0QyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFFBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDckIsQUFBQTtBQUNBLEFB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QUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUN6RSxBQUFBLENBQUMsR0FBRyxDQUFDLENBQUEsTUFBQSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN6QyxBQUFBLEVBQVEsTUFBTixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxJQUFJO0FBQ2hCLEFBQUEsRUFBRSxHQUFHLENBQUEsS0FBSyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUN2QyxBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsQztFQUFBLENBQUE7QUFDaEUsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBO0FBQ3RCLEFBQUEsR0FBRyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUEsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsSUFBSSxJQUFJLENBQUMsR0FBRyxDLEtBQUMsQUFBQyxHQUFHLENBQUEsQ0FBQSxDQUFBLEdBQUcscUNBQW9DO0FBQ3hELEFBQUEsS0FBSyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsTztJQUFBLEM7R0FBQSxDO0VBQUEsQ0FBQTtBQUN4QixBQUFBO0FBQ0EsQUFBQSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxD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QSxDQUFBLENBQUE7QUFDckMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQztDQUFDLEM7QUFBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDdEMiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgdHlwZXNjcmlwdC5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7ZXhpc3RzLCBleGlzdHNTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge1xyXG5cdFNvdXJjZUZpbGUsIE5vZGUsIFNjcmlwdFRhcmdldCwgU3ludGF4S2luZCwgTW9kdWxlS2luZCxcclxuXHROZXdMaW5lS2luZCwgRW1pdEhpbnQsIENvbXBpbGVyT3B0aW9ucywgTW9kdWxlUmVzb2x1dGlvbktpbmQsXHJcblx0Y3JlYXRlU291cmNlRmlsZSwgY3JlYXRlUHJpbnRlciwgY3JlYXRlUHJvZ3JhbSxcclxuXHR0cmFuc3BpbGVNb2R1bGUsIGdldFByZUVtaXREaWFnbm9zdGljcywgZm9yRWFjaENoaWxkLFxyXG5cdGZsYXR0ZW5EaWFnbm9zdGljTWVzc2FnZVRleHQsIGdldExpbmVBbmRDaGFyYWN0ZXJPZlBvc2l0aW9uLFxyXG5cdH0gZnJvbSAnbnBtLXR5cGVzY3JpcHQnXHJcblxyXG5pbXBvcnQge1xyXG5cdExPRywgREJHLCBFUlIsIElOREVOVCwgVU5ERU5ULFxyXG5cdH0gZnJvbSAnbG9nZ2VyJ1xyXG5pbXBvcnQge2V4dHJhY3RTb3VyY2VNYXB9IGZyb20gJ3N0YWNrJ1xyXG5pbXBvcnQge1xyXG5cdHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBjcm9haywgYXNzZXJ0LCBnZXRFcnJTdHIsXHJcblx0d2l0aENvbG9ycywgZGVjb2xvcml6ZSwgd29yZHMsIGFsbExpbmVzSW4sXHJcblx0fSBmcm9tICdiYXNlJ1xyXG5pbXBvcnQge1xyXG5cdGludGVnZXIsIGhhc2gsIGhhc2hvZiwgYXJyYXksXHJcblx0aXNIYXNoLCBpc1N0cmluZywgaXNFbXB0eSwgbm9uRW1wdHksIGlzTnVtYmVyLFxyXG5cdGlzRnVuY3Rpb24sIGZ1bmN0aW9uRGVmLCBpc0NsYXNzLCBjbGFzc0RlZixcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsIG8sIGhhc0tleSxcclxuXHRDU3RyaW5nU2V0TWFwLCBrZXlzLCBzZXAsIGYsXHJcblx0fSBmcm9tICdsbHV0aWxzJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7XHJcblx0ZXh0cmFjdCwgVFBhdGhJdGVtLCBnZXRTdHJpbmcsIGdldE51bWJlciwgZ2V0QXJyYXksXHJcblx0fSBmcm9tICdleHRyYWN0J1xyXG5pbXBvcnQge1RCbG9ja0Rlc2MsIEJsb2NraWZ5fSBmcm9tICdpbmRlbnQnXHJcbmltcG9ydCB7XHJcblx0aXNGaWxlLCBzbHVycCwgYmFyZiwgYmFyZlRlbXBGaWxlLCBmaWxlRXh0LCB3aXRoRXh0LFxyXG5cdHBhdGhTdHIsIG1rcGF0aCwgbmV3ZXJEZXN0RmlsZUV4aXN0cyxcclxuXHR9IGZyb20gJ2ZzeXMnXHJcbmltcG9ydCB7XHJcblx0T0wsIHRvTmljZSwgVE1hcEZ1bmMsIERVTVAsIExPR1ZBTFVFLCBEQkdWQUxVRSxcclxuXHR9IGZyb20gJ25pY2UnXHJcbmltcG9ydCB7XHJcblx0ZXhlY0NtZCwgQ0ZpbGVIYW5kbGVyLCBURXhlY1Jlc3VsdCxcclxuXHR9IGZyb20gJ2V4ZWMnXHJcbmltcG9ydCB7VFByb2NTcGVjLCBwcm9jRmlsZXMsIHByb2NPbmVGaWxlfSBmcm9tICdwcm9jLWZpbGVzJ1xyXG5pbXBvcnQge1dhbGtlciwgVFZpc2l0S2luZH0gZnJvbSAnd2Fsa2VyJ1xyXG5pbXBvcnQge0NNYWluU2NvcGUsIENTY29wZX0gZnJvbSAnc2NvcGUnXHJcbmltcG9ydCB7Z2V0TmVlZGVkSW1wb3J0U3RtdHN9IGZyb20gJ3N5bWJvbHMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcbmltcG9ydCB7dHlwZUNoZWNrVHNGaWxlfSBmcm9tICdsbHR5cGVzY3JpcHQnXHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlciBcInV0Zi04XCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQga2luZFN0ciA6PSAoaTogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBTeW50YXhLaW5kW2ldXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRzMmFzdCA6PSAoXHJcblx0XHR0c0NvZGU6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IE5vZGUgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHR9XHJcblx0e2ZpbGVOYW1lfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGZpbGVOYW1lOiAndGVtcC50cydcclxuXHRcdH1cclxuXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAodHNDb2RlKVxyXG5cdGhBc3QgOj0gY3JlYXRlU291cmNlRmlsZSBmaWxlTmFtZSwgY29kZSwgU2NyaXB0VGFyZ2V0LkxhdGVzdFxyXG5cdHJldHVybiBoQXN0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzdDJ0cyA6PSAoXHJcblx0XHRub2RlOiBOb2RlXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChub2RlLmtpbmQgPT0gMzA4KSwgXCJOb3QgYSBTb3VyY2VGaWxlIG5vZGVcIlxyXG5cdHByaW50ZXIgOj0gY3JlYXRlUHJpbnRlciBuZXdMaW5lOiBOZXdMaW5lS2luZC5MaW5lRmVlZFxyXG5cdHJldHVybiBwcmludGVyLnByaW50Tm9kZShFbWl0SGludC5VbnNwZWNpZmllZCwgbm9kZSwgbm9kZSBhcyBTb3VyY2VGaWxlKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gcGFzc2VkIHRvIHRvTmljZSgpIHRvIGFkZCBhIGRlc2NyaXB0aW9uIHRvIHNvbWUgbm9kZXNcclxuXHJcbmV4cG9ydCBkZXNjRnVuYzogVE1hcEZ1bmMgOj0gKFxyXG5cdFx0a2V5OiBzdHJpbmdcclxuXHRcdHZhbHVlOiB1bmtub3duXHJcblx0XHRoUGFyZW50OiB1bmtub3duXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChrZXkgPT0gJ2tpbmQnKSAmJiBpc051bWJlcih2YWx1ZSkgPyBmXCIoI3traW5kU3RyKHZhbHVlKX0pXCIgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3RBc1N0cmluZyA6PSAoXHJcblx0XHRoQXN0OiBvYmplY3QsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRsSW5jbHVkZTogc3RyaW5nW10/XHJcblx0XHR9XHJcblx0e2xJbmNsdWRlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGxJbmNsdWRlOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHRyZXR1cm4gdG9OaWNlIGhBc3QsIHtcclxuXHRcdGlnbm9yZUVtcHR5S2V5czogdHJ1ZVxyXG5cdFx0bEluY2x1ZGVcclxuXHRcdGxFeGNsdWRlOiB3b3JkcyhcIlwiXCJcclxuXHRcdFx0cG9zIGVuZCBpZCBmbGFncyBtb2RpZmllckZsYWdzQ2FjaGVcclxuXHRcdFx0dHJhbnNmb3JtRmxhZ3MgaGFzRXh0ZW5kZWRVbmljb2RlRXNjYXBlXHJcblx0XHRcdG51bWVyaWNMaXRlcmFsRmxhZ3Mgc2V0RXh0ZXJuYWxNb2R1bGVJbmRpY2F0b3JcclxuXHRcdFx0bGFuZ3VhZ2VWZXJzaW9uIGxhbmd1YWdlVmFyaWFudCBqc0RvY1BhcnNpbmdNb2RlXHJcblx0XHRcdGhhc05vRGVmYXVsdExpYlxyXG5cdFx0XHRcIlwiXCIpXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEltcG9ydENvZGUgOj0gKHR5cGVTdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHREQkcgXCJDQUxMIGdldEltcG9ydENvZGUoKVwiXHJcblx0bFN5bWJvbHMgOj0gZ2V0U3ltYm9sc0Zyb21UeXBlIHR5cGVTdHJcclxuXHREQkdWQUxVRSAnbFN5bWJvbHMnLCBsU3ltYm9sc1xyXG5cdGlmIG5vbkVtcHR5KGxTeW1ib2xzKVxyXG5cdFx0bFN0bXRzIDo9IGdldE5lZWRlZEltcG9ydFN0bXRzIGxTeW1ib2xzXHJcblx0XHREQkdWQUxVRSAnbFN0bXRzJywgbFN0bXRzXHJcblx0XHRyZXR1cm4gbFN0bXRzLmpvaW4gJ1xcbidcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0U3ltYm9sc0Zyb21UeXBlIDo9IChcclxuXHRcdHR5cGVTdHI6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL14oW0EtWmEtel1bQS1aYS16MC05K10qKSg/OlxcPChbQS1aYS16XVtBLVphLXowLTkrXSopXFw+KT8kLykpXHJcblx0XHRbXywgdHlwZSwgc3VidHlwZV0gOj0gbE1hdGNoZXNcclxuXHRcdHJldHVybiBub25FbXB0eShzdWJ0eXBlKSA/IFt0eXBlLCBzdWJ0eXBlXSA6IFt0eXBlXVxyXG5cdGVsc2UgaWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL15cXChcXClcXHMqXFw9XFw+XFxzKihbQS1aYS16XVtBLVphLXowLTkrXSopJC8pKVxyXG5cdFx0cmV0dXJuIFtsTWF0Y2hlc1sxXV1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gW11cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5oRGVmQ29uZmlnOiBDb21waWxlck9wdGlvbnMgOj0ge1xyXG5cdFwiYWxsb3dKc1wiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbWRHbG9iYWxBY2Nlc3NcIjogZmFsc2VcclxuXHRcImFsbG93VW5yZWFjaGFibGVDb2RlXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VudXNlZExhYmVsc1wiOiBmYWxzZVxyXG5cdFwiYWx3YXlzU3RyaWN0XCI6IHRydWVcclxuXHRcImFzc3VtZUNoYW5nZXNPbmx5QWZmZWN0RGlyZWN0RGVwZW5kZW5jaWVzXCI6IGZhbHNlXHJcblx0XCJjaGVja0pzXCI6IGZhbHNlXHJcblx0XCJjb21wb3NpdGVcIjogZmFsc2VcclxuXHRcImRlY2xhcmF0aW9uXCI6IGZhbHNlXHJcblx0XCJkZWNsYXJhdGlvbkRpclwiOiB1bmRlZmluZWRcclxuXHRcImRlY2xhcmF0aW9uTWFwXCI6IGZhbHNlXHJcblx0XCJlbWl0Qk9NXCI6IGZhbHNlXHJcblx0XCJlbWl0RGVjbGFyYXRpb25Pbmx5XCI6IGZhbHNlXHJcblx0XCJleGFjdE9wdGlvbmFsUHJvcGVydHlUeXBlc1wiOiBmYWxzZVxyXG5cdFwiZXhwZXJpbWVudGFsRGVjb3JhdG9yc1wiOiBmYWxzZVxyXG5cdFwiZm9yY2VDb25zaXN0ZW50Q2FzaW5nSW5GaWxlTmFtZXNcIjogdHJ1ZVxyXG5cdFwiZ2VuZXJhdGVDcHVQcm9maWxlXCI6IG51bGxcclxuXHRcImdlbmVyYXRlVHJhY2VcIjogbnVsbFxyXG5cdFwiaWdub3JlRGVwcmVjYXRpb25zXCI6IFwiNS4wXCJcclxuXHRcImltcG9ydEhlbHBlcnNcIjogZmFsc2VcclxuXHRcImlubGluZVNvdXJjZU1hcFwiOiBmYWxzZVxyXG5cdFwiaW5saW5lU291cmNlc1wiOiBmYWxzZVxyXG5cdFwiaXNvbGF0ZWRNb2R1bGVzXCI6IGZhbHNlXHJcblx0I1x0XCJqc3hcIjogXCJyZWFjdC1qc3hcIixcclxuXHQjXHRcImpzeEZhY3RvcnlcIjogXCJSZWFjdC5jcmVhdGVFbGVtZW50XCIsXHJcblx0I1x0XCJqc3hGcmFnbWVudEZhY3RvcnlcIjogXCJSZWFjdC5GcmFnbWVudFwiLFxyXG5cdCNcdFwianN4SW1wb3J0U291cmNlXCI6IFwicmVhY3RcIixcclxuXHRcImxpYlwiOiBbXHJcblx0XHRcImVzbmV4dFwiXHJcblx0XHRcImRvbVwiXHJcblx0XHRcImRvbS5pdGVyYWJsZVwiXHJcblx0XHRdXHJcblx0XCJtYXBSb290XCI6IHVuZGVmaW5lZFxyXG5cdFwibWF4Tm9kZU1vZHVsZUpzRGVwdGhcIjogMFxyXG5cdFwibW9kdWxlXCI6IE1vZHVsZUtpbmQuRVNOZXh0XHJcblx0XCJtb2R1bGVEZXRlY3Rpb25cIjogdW5kZWZpbmVkXHJcblx0XCJtb2R1bGVSZXNvbHV0aW9uXCI6IE1vZHVsZVJlc29sdXRpb25LaW5kLk5vZGVOZXh0XHJcblx0XCJuZXdMaW5lXCI6IE5ld0xpbmVLaW5kLkxpbmVGZWVkXHJcblx0XCJub0VtaXRcIjogdHJ1ZVxyXG5cdFwibm9FbWl0SGVscGVyc1wiOiBmYWxzZVxyXG5cdFwibm9FbWl0T25FcnJvclwiOiBmYWxzZVxyXG5cdFwibm9FcnJvclRydW5jYXRpb25cIjogZmFsc2VcclxuXHRcIm5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRBbnlcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdE92ZXJyaWRlXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRSZXR1cm5zXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRUaGlzXCI6IHRydWVcclxuXHRcIm5vUHJvcGVydHlBY2Nlc3NGcm9tSW5kZXhTaWduYXR1cmVcIjogdHJ1ZVxyXG5cdFwibm9VbmNoZWNrZWRJbmRleGVkQWNjZXNzXCI6IHRydWVcclxuXHRcIm5vVW51c2VkTG9jYWxzXCI6IHRydWVcclxuXHRcIm5vVW51c2VkUGFyYW1ldGVyc1wiOiB0cnVlXHJcblx0XCJvdXREaXJcIjogdW5kZWZpbmVkXHJcblx0XCJvdXRGaWxlXCI6IHVuZGVmaW5lZFxyXG5cdFwicGF0aHNcIjoge31cclxuXHRcInByZXNlcnZlQ29uc3RFbnVtc1wiOiBmYWxzZVxyXG5cdFwicHJlc2VydmVTeW1saW5rc1wiOiBmYWxzZVxyXG5cdFwicHJlc2VydmVWYWx1ZUltcG9ydHNcIjogZmFsc2VcclxuXHRcInJlYWN0TmFtZXNwYWNlXCI6IFwiUmVhY3RcIlxyXG5cdFwicmVtb3ZlQ29tbWVudHNcIjogZmFsc2VcclxuXHRcInJlc29sdmVKc29uTW9kdWxlXCI6IHRydWVcclxuXHRcInJvb3REaXJcIjogdW5kZWZpbmVkXHJcblx0XCJyb290RGlyc1wiOiBbXVxyXG5cdFwic2tpcERlZmF1bHRMaWJDaGVja1wiOiBmYWxzZVxyXG5cdFwic2tpcExpYkNoZWNrXCI6IGZhbHNlXHJcblx0XCJzb3VyY2VNYXBcIjogZmFsc2VcclxuXHRcInNvdXJjZVJvb3RcIjogdW5kZWZpbmVkXHJcblx0XCJzdHJpY3RcIjogdHJ1ZVxyXG5cdFwic3RyaWN0QmluZENhbGxBcHBseVwiOiB0cnVlXHJcblx0XCJzdHJpY3RGdW5jdGlvblR5cGVzXCI6IHRydWVcclxuXHRcInN0cmljdE51bGxDaGVja3NcIjogdHJ1ZVxyXG5cdFwic3RyaWN0UHJvcGVydHlJbml0aWFsaXphdGlvblwiOiB0cnVlXHJcblx0XCJzdHJpcEludGVybmFsXCI6IGZhbHNlXHJcblx0XCJzdXBwcmVzc0V4Y2Vzc1Byb3BlcnR5RXJyb3JzXCI6IGZhbHNlXHJcblx0XCJzdXBwcmVzc0ltcGxpY2l0QW55SW5kZXhFcnJvcnNcIjogZmFsc2VcclxuXHRcInRhcmdldFwiOiBTY3JpcHRUYXJnZXQuRVMyMDIyXHJcblx0XCJ0cmFjZVJlc29sdXRpb25cIjogZmFsc2VcclxuXHRcInRzQnVpbGRJbmZvRmlsZVwiOiB1bmRlZmluZWRcclxuXHRcInR5cGVSb290c1wiOiBbXVxyXG5cdFwidXNlRGVmaW5lRm9yQ2xhc3NGaWVsZHNcIjogdHJ1ZVxyXG5cdFwidXNlVW5rbm93bkluQ2F0Y2hWYXJpYWJsZXNcIjogdHJ1ZVxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRBc3RGaWx0ZXJGdW5jID0gKFxyXG5cdFx0bm9kZTogTm9kZVxyXG5cdFx0KSA9PiBib29sZWFuXHJcblxyXG5leHBvcnQgY2xhc3MgQXN0V2Fsa2VyIGV4dGVuZHMgV2Fsa2VyPE5vZGU+XHJcblxyXG5cdGZpbHRlckZ1bmM6IFRBc3RGaWx0ZXJGdW5jP1xyXG5cdGhPcHRpb25zOiBoYXNoXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdFx0QGZpbHRlckZ1bmM6IFRBc3RGaWx0ZXJGdW5jPyA9IHVuZGVmLFxyXG5cdFx0XHRAaE9wdGlvbnMgPSB7fVxyXG5cdFx0XHQpXHJcblx0XHRzdXBlcigpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRkYmcob3A6ICdwdXNoJyB8ICdwb3AnLCBub2RlOiBOb2RlKTogdm9pZFxyXG5cclxuXHRcdHByZWZpeCA6PSAnICAgJ1xyXG5cdFx0a2luZCA6PSBub2RlLmtpbmRcclxuXHRcdGNvbnNvbGUubG9nIFwiI3twcmVmaXh9I3tvcC50b1VwcGVyQ2FzZSgpfTogI3traW5kfSBbI3tAc3RhY2tEZXNjKCl9XVwiXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdHN0YWNrRGVzYygpOiBzdHJpbmdcclxuXHJcblx0XHRyZXN1bHRzIDo9IFtdXHJcblx0XHRmb3Igbm9kZSBvZiBAbE5vZGVTdGFja1xyXG5cdFx0XHRyZXN1bHRzLnB1c2ggbm9kZS5raW5kLnRvU3RyaW5nKClcclxuXHRcdGxTdGFjayA6PSByZXN1bHRzXHJcblx0XHRyZXR1cm4gbFN0YWNrLmpvaW4gJywnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBwdXNoTm9kZShub2RlOiBOb2RlKTogdm9pZFxyXG5cclxuXHRcdHN1cGVyLnB1c2hOb2RlIG5vZGVcclxuXHRcdGlmIEBoT3B0aW9ucy50cmFjZVxyXG5cdFx0XHRAZGJnICdwdXNoJywgbm9kZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBwb3BOb2RlKCk6IE5vZGU/XHJcblxyXG5cdFx0bm9kZSA6PSBzdXBlci5wb3BOb2RlKClcclxuXHRcdGlmIEBoT3B0aW9ucy50cmFjZVxyXG5cdFx0XHRpZiBkZWZpbmVkKG5vZGUpXHJcblx0XHRcdFx0QGRiZyAncG9wJywgbm9kZVxyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0Y29uc29sZS5sb2cgXCJTVEFDSyBFTVBUWVwiXHJcblx0XHRyZXR1cm4gbm9kZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaXNOb2RlKHg6IG9iamVjdCk6IHggaXMgTm9kZVxyXG5cclxuXHRcdHJldHVybiBPYmplY3QuaGFzT3duIHgsICdraW5kJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgZmlsdGVyKG5vZGU6IE5vZGUpOiBib29sZWFuXHJcblxyXG5cdFx0cmV0dXJuIGRlZmluZWQoQGZpbHRlckZ1bmMpID8gQGZpbHRlckZ1bmMobm9kZSkgOiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENBbmFseXNpc1xyXG5cclxuXHR0cmFjZSA9IGZhbHNlXHJcblx0bUltcG9ydHMgPSBuZXcgQ1N0cmluZ1NldE1hcCgpXHJcblx0bUV4cG9ydHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpXHJcblx0c01pc3NpbmcgPSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdG1haW5TY29wZSA9IG5ldyBDTWFpblNjb3BlKClcclxuXHRjdXJTY29wZTogQ1Njb3BlXHJcblx0ZmluaXNoZWQgPSBmYWxzZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoQHRyYWNlID0gZmFsc2UpXHJcblxyXG5cdFx0QGN1clNjb3BlID0gQG1haW5TY29wZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZGVmaW5lKG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZGVmaW5lICN7bmFtZX1cIlxyXG5cdFx0QGN1clNjb3BlLmRlZmluZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdHVzZShuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0IyAtLS0gdGhpcyBjb25kaXRpb24gc2hvdWxkIGZpbHRlciBidWlsdC1pbnNcclxuXHRcdGlmIG5vdCBoYXNLZXkoZ2xvYmFsVGhpcywgbmFtZSlcclxuXHRcdFx0aWYgQHRyYWNlXHJcblx0XHRcdFx0TE9HIFwiICAgdXNlICN7bmFtZX1cIlxyXG5cdFx0XHRpZiBub3QgQGN1clNjb3BlLmlzRGVmaW5lZChuYW1lKVxyXG5cdFx0XHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRcdFx0TE9HIFwiICAgbWlzc2luZyAje25hbWV9XCJcclxuXHRcdFx0XHRAc01pc3NpbmcuYWRkIG5hbWVcclxuXHRcdFx0QGN1clNjb3BlLnVzZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFkZEltcG9ydChsaWI6IHN0cmluZywgbmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBpbXBvcnQgJyN7bmFtZX0nIGluICcje2xpYn0nXCJcclxuXHRcdEBtSW1wb3J0cy5hZGQgbGliLCBuYW1lXHJcblx0XHRAZGVmaW5lIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YWRkRXhwb3J0KG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBleHBvcnQgJyN7bmFtZX0nOiAnI3t0eXBlfSdcIlxyXG5cdFx0QG1FeHBvcnRzLnNldCBuYW1lLCB0eXBlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG5ld1Njb3BlKG5hbWU6IHN0cmluZz8sIGxBcmdzOiBzdHJpbmdbXSk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgbmV3IHNjb3BlICN7bmFtZSB8fCAnPGFub24+J30oI3tsQXJncy5qb2luKCcsJyl9KVwiXHJcblx0XHRAY3VyU2NvcGUgPSBAbWFpblNjb3BlLm5ld1Njb3BlKG5hbWUsIGxBcmdzKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRlbmRTY29wZSgpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGVuZCBzY29wZVwiXHJcblx0XHRzY29wZSA6PSBAbWFpblNjb3BlLmVuZFNjb3BlIEBjdXJTY29wZVxyXG5cdFx0aWYgZGVmaW5lZChzY29wZSlcclxuXHRcdFx0QGN1clNjb3BlID0gc2NvcGVcclxuXHRcdGVsc2VcclxuXHRcdFx0QGZpbmlzaGVkID0gdHJ1ZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRJbXBvcnRzKCk6IFRCbG9ja0Rlc2NcclxuXHJcblx0XHRoSW1wb3J0czogaGFzaG9mPHN0cmluZ1tdPiA6PSB7fVxyXG5cdFx0Zm9yIFtsaWIsIHNOYW1lc10gb2YgQG1JbXBvcnRzLmVudHJpZXMoKVxyXG5cdFx0XHRoSW1wb3J0c1tsaWJdID0gQXJyYXkuZnJvbShzTmFtZXMudmFsdWVzKCkpXHJcblx0XHRyZXR1cm4gaEltcG9ydHNcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEV4cG9ydHMoKTogc3RyaW5nW11cclxuXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBAbUV4cG9ydHMua2V5cygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRNaXNzaW5nKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQHNNaXNzaW5nLnZhbHVlcygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRFeHRyYSgpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHdhbGtlciA6PSBuZXcgV2Fsa2VyPENTY29wZT4oKVxyXG5cdFx0d2Fsa2VyLmlzTm9kZSA9ICh4OiB1bmtub3duKSA9PlxyXG5cdFx0XHRyZXR1cm4gKHggaW5zdGFuY2VvZiBDU2NvcGUpXHJcblxyXG5cdFx0IyAtLS0gRmluZCBhbGwgbmFtZXMgdGhhdCBhcmUgZGVmaW5lZCwgYnV0IG5ldmVyIHVzZWQgb3IgZXhwb3J0ZWRcclxuXHRcdHNOYW1lcyA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdFx0Zm9yIHNjb3BlIG9mIHdhbGtlci53YWxrKEBtYWluU2NvcGUpXHJcblx0XHRcdGZvciBuYW1lIG9mIHNjb3BlLmFsbERlZmluZWQoKVxyXG5cdFx0XHRcdGlmIG5vdCBzY29wZS5pc1VzZWQobmFtZSkgJiYgIUBtRXhwb3J0cy5oYXMobmFtZSlcclxuXHRcdFx0XHRcdHNOYW1lcy5hZGQgbmFtZVxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gc05hbWVzLnZhbHVlcygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhc1N0cmluZyh3aWR0aDogaW50ZWdlciA9IDY0KTogc3RyaW5nXHJcblxyXG5cdFx0aDogVEJsb2NrRGVzYyA6PSB7XHJcblx0XHRcdElNUE9SVFM6IEBnZXRJbXBvcnRzKClcclxuXHRcdFx0RVhQT1JUUzogQGdldEV4cG9ydHMoKVxyXG5cdFx0XHRNSVNTSU5HOiBAZ2V0TWlzc2luZygpXHJcblx0XHRcdEVYVFJBOiBAZ2V0RXh0cmEoKVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0aWYgaXNFbXB0eShoLklNUE9SVFMpXHJcblx0XHRcdGRlbGV0ZSBoLklNUE9SVFNcclxuXHRcdGlmIGlzRW1wdHkoaC5FWFBPUlRTKVxyXG5cdFx0XHRkZWxldGUgaC5FWFBPUlRTXHJcblx0XHRpZiBpc0VtcHR5KGguTUlTU0lORylcclxuXHRcdFx0ZGVsZXRlIGguTUlTU0lOR1xyXG5cdFx0aWYgaXNFbXB0eShoLkVYVFJBKVxyXG5cdFx0XHRkZWxldGUgaC5FWFRSQVxyXG5cdFx0cmV0dXJuIEJsb2NraWZ5IGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0Tm9kZSA6PSAoXHJcblx0XHR4OiB1bmtub3duXHJcblx0XHRwYXRoc3RyOiBzdHJpbmdcclxuXHRcdCk6IE5vZGUgPT5cclxuXHJcblx0dmFsIDo9IGV4dHJhY3QoeCwgcGF0aHN0cikgYXMgTm9kZVxyXG5cdHJldHVybiB2YWxcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW5hbHl6ZVRzQ29kZSA6PSAoXHJcblx0XHR0c0NvZGU6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogQ0FuYWx5c2lzID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZz9cclxuXHRcdGR1bXBBU1Q6IGJvb2xlYW5cclxuXHRcdHRyYWNlOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2ZpbGVOYW1lLCBkdW1wQVNULCB0cmFjZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRmaWxlTmFtZTogdW5kZWZcclxuXHRcdGR1bXBBU1Q6IGZhbHNlXHJcblx0XHR0cmFjZTogZmFsc2VcclxuXHRcdH1cclxuXHJcblx0YW5hbHlzaXMgOj0gbmV3IENBbmFseXNpcyh0cmFjZSlcclxuXHR3YWxrZXIgOj0gbmV3IEFzdFdhbGtlcigpXHJcblxyXG5cdCMgLS0tIHRocm93cyBFcnJvciBpZiBub3QgdmFsaWQgVHlwZVNjcmlwdFxyXG5cdGhBc3QgOj0gdHMyYXN0IHRzQ29kZVxyXG5cclxuXHRpZiBkdW1wQVNUXHJcblx0XHREVU1QIGFzdEFzU3RyaW5nKGhBc3QpLCAnQVNUJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y2hlY2tOb2RlIDo9IChcclxuXHRcdFx0bm9kZTogTm9kZSxcclxuXHRcdFx0cGF0aHN0cjogc3RyaW5nPyA9IHVuZGVmXHJcblx0XHRcdCk6IHZvaWQgPT5cclxuXHJcblx0XHRpZiBkZWZpbmVkKHBhdGhzdHIpXHJcblx0XHRcdG5vZGUgPSBnZXROb2RlKG5vZGUsIHBhdGhzdHIpXHJcblx0XHRpZiAobm9kZS5raW5kID09IDgwKSAgICMgLS0tIElkZW50aWZpZXJcclxuXHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5lc2NhcGVkVGV4dCdcclxuXHRcdFx0YW5hbHlzaXMudXNlIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0c3ltIDo9ICh2a2luZDogVFZpc2l0S2luZCk6IHN0cmluZyA9PlxyXG5cdFx0c3dpdGNoIHZraW5kXHJcblx0XHRcdHdoZW4gJ2VudGVyJyB0aGVuIHJldHVybiAnLT4nXHJcblx0XHRcdHdoZW4gJ2V4aXQnICB0aGVuIHJldHVybiAnPC0nXHJcblx0XHRcdGVsc2UgICAgICAgICAgICAgIHJldHVybiAnOjonXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgdmtpbmQgaXMgb25lIG9mICdlbnRlcicsICdleGl0JywgJ3JlZidcclxuXHJcblx0bFRyYWNlS2luZCA6PSBbODAsIDk1LCAxNzAsIDIxNCwgMjIwLCAyMjcsIDI1NCwgMjYxLCAyNjMsIDI3MywgMjgwLCAzMDhdXHJcblx0Zm9yIFt2a2luZCwgbm9kZV0gb2Ygd2Fsa2VyLndhbGtFeChoQXN0KVxyXG5cdFx0e2tpbmR9IDo9IG5vZGVcclxuXHRcdGlmIHRyYWNlICYmIGxUcmFjZUtpbmQuaW5jbHVkZXMoa2luZClcclxuXHRcdFx0TE9HIGZcIiN7c3ltKHZraW5kKX0gTk9ERSAje2tpbmR9OjMgKCN7a2luZFN0cihraW5kKX06e2N5YW59KVwiXHJcblxyXG5cdFx0aWYgKHZraW5kID09ICdleGl0JylcclxuXHRcdFx0c3dpdGNoIGtpbmRcclxuXHJcblx0XHRcdFx0d2hlbiAyMjAsIDI2MyAgICMgQXJyb3dGdW5jdGlvbiwgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0YW5hbHlzaXMuZW5kU2NvcGUoKVxyXG5cclxuXHRcdGVsc2UgaWYgKHZraW5kID09ICdlbnRlcicpXHJcblxyXG5cdFx0XHRzd2l0Y2gga2luZFxyXG5cclxuXHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdGRvXHJcblx0XHRcdFx0XHRcdGxQYXJtcyA6PSBBcnJheS5mcm9tIE1BUCBnZXRBcnJheShub2RlLCAnLnBhcmFtZXRlcnMnKSwgKHgpIC0+XHJcblx0XHRcdFx0XHRcdFx0eWllbGQgZ2V0U3RyaW5nKHgsICcubmFtZS5lc2NhcGVkVGV4dCcpXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIHVuZGVmLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyNjEgICAgIyBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHR0cnlcclxuXHRcdFx0XHRcdFx0dmFyTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgdmFyTmFtZVxyXG5cclxuXHRcdFx0XHR3aGVuIDI2MyAgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdCMgLS0tIGRvIGNyZWF0ZXMgYSBzY29wZSwgYSBsYSBhbiBJSUZFXHJcblx0XHRcdFx0XHRkb1xyXG5cdFx0XHRcdFx0XHRmdW5jTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cclxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cclxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0JylcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuZGVmaW5lIGZ1bmNOYW1lXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIGZ1bmNOYW1lLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyMjcgICAgIyBCaW5hcnlFeHByZXNzaW9uXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5sZWZ0J1xyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcucmlnaHQnXHJcblxyXG5cdFx0XHRcdHdoZW4gMjE0ICAgICMgQ2FsbEV4cHJlc3Npb25cclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmV4cHJlc3Npb24nXHJcblx0XHRcdFx0XHRmb3IgYXJnIG9mIGdldEFycmF5KG5vZGUsICcuYXJndW1lbnRzJylcclxuXHRcdFx0XHRcdFx0Y2hlY2tOb2RlKGFyZyBhcyBOb2RlKVxyXG5cclxuXHRcdFx0XHR3aGVuIDI3MyAgICAjIEltcG9ydERlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRsaWIgOj0gZ2V0U3RyaW5nIG5vZGUsICcubW9kdWxlU3BlY2lmaWVyLnRleHQnXHJcblx0XHRcdFx0XHRmb3IgaCBvZiBnZXRBcnJheShub2RlLCAnLmltcG9ydENsYXVzZT8ubmFtZWRCaW5kaW5ncz8uZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBoLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEltcG9ydCBsaWIsIG5hbWVcclxuXHJcblx0XHRcdFx0d2hlbiAyODAgICAgIyBOYW1lZEV4cG9ydHNcclxuXHRcdFx0XHRcdGZvciBlbGVtIG9mIGdldEFycmF5KG5vZGUsICcuZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBlbGVtLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAncmUtZXhwb3J0J1xyXG5cclxuXHRcdFx0XHR3aGVuIDk1ICAgICAjIEV4cG9ydEtleXdvcmRcclxuXHRcdFx0XHRcdHBhcmVudCA6PSB3YWxrZXIucGFyZW50KClcclxuXHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIocGFyZW50LCAnLmtpbmQnKVxyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNDQgICAgIyBGaXJzdFN0YXRlbWVudFxyXG5cdFx0XHRcdFx0XHRcdGZvciBkZWNsIG9mIGdldEFycmF5KHBhcmVudCwgJy5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zJylcclxuXHRcdFx0XHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIoZGVjbCwgJy5raW5kJylcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gMjYxICAgICMgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGRlY2wsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHQjIC0tLSBDaGVjayBpbml0aWFsaXplciB0byBmaW5kIHRoZSB0eXBlXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5pdEtpbmQgOj0gZ2V0TnVtYmVyIGRlY2wsICcuaW5pdGlhbGl6ZXIua2luZCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggaW5pdEtpbmRcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdmdW5jdGlvbidcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDksIDI2MSAjIEZpcnN0TGl0ZXJhbFRva2VuLCBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnY29uc3QnXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd1bmtub3duJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjMgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjQgICAjIENsYXNzRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NsYXNzJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjYgICAjIFR5cGVBbGlhc0RlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd0eXBlJ1xyXG5cclxuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRjcm9hayBcIlVuZXhwZWN0ZWQgc3VidHlwZSBvZiA5NTogI3twYXJlbnQua2luZH1cIlxyXG5cdHJldHVybiBhbmFseXNpc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENVbml0VGVzdGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvVW5pdFRlc3QnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdGFzc2VydCBwYXRoLmVuZHNXaXRoKCcudGVzdC50cycpLCBcIk5vdCBhIHVuaXQgdGVzdCBmaWxlXCJcclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRjYXB0dXJlOiBib29sZWFuXHJcblx0XHRcdGluc3BlY3Q6IGJvb2xlYW5cclxuXHRcdFx0bGluZU51bTogc3RyaW5nP1xyXG5cdFx0XHR9XHJcblx0XHR7Y2FwdHVyZSwgaW5zcGVjdCwgbGluZU51bX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGNhcHR1cmU6IGZhbHNlXHJcblx0XHRcdGluc3BlY3Q6IGZhbHNlXHJcblx0XHRcdGxpbmVOdW06IHVuZGVmXHJcblx0XHRcdH1cclxuXHJcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdFx0J3Rlc3QnXHJcblx0XHRcdFx0Jy1BJ1xyXG5cdFx0XHRcdCctLXRyYWNlLWxlYWtzJ1xyXG5cdFx0XHRcdC4uLihpbnNwZWN0XHJcblx0XHRcdFx0XHQ/IFsnLS1pbnNwZWN0LWJyayddXHJcblx0XHRcdFx0XHQ6IFsnLS1jb3ZlcmFnZT0uL2NvdmVyYWdlJywgJy0tY292ZXJhZ2UtcmF3LWRhdGEtb25seSddXHJcblx0XHRcdFx0XHQpXHJcblx0XHRcdFx0Li4uKGRlZmluZWQobGluZU51bSlcclxuXHRcdFx0XHRcdD8gWyctLWZpbHRlcicsIFwiL15saW5lICN7bGluZU51bX0kL1wiXVxyXG5cdFx0XHRcdFx0OiBbXVxyXG5cdFx0XHRcdFx0KVxyXG5cdFx0XHRcdHBhdGhcclxuXHRcdFx0XHRdLCB7Y2FwdHVyZX1cclxuXHRcdHJldHVybiBoUmVzdWx0XHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBnZXRPdXRwdXQoaFJlc3VsdDogVEV4ZWNSZXN1bHQpOiBzdHJpbmdcclxuXHJcblx0XHR7c3Rkb3V0LCBzdGRlcnJ9IDo9IGhSZXN1bHRcclxuXHRcdG91dHB1dCA6PSBbc3Rkb3V0LCBzdGRlcnJdLmpvaW4oKVxyXG5cdFx0aWYgbm90IGhSZXN1bHQuc3VjY2VzcyB8fCBvdXRwdXQubWF0Y2goL2Nyb2FrfGVycm9yL2kpXHJcblx0XHRcdHJldHVybiBvdXRwdXRcclxuXHJcblx0XHRsTGluZXMgOj0gQXJyYXkuZnJvbSBNQVAgYWxsTGluZXNJbihkZWNvbG9yaXplKG91dHB1dCkpLCAobGluZSkgLT5cclxuXHRcdFx0aWYgbGluZS5zdGFydHNXaXRoKCdsaW5lJylcclxuXHRcdFx0XHRpZiBub3QgbGluZS5pbmNsdWRlcygnIG9rICcpXHJcblx0XHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcclxuXHRcdFx0XHRcdFx0ZmFpbGVkOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdE9LOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiBsaW5lLmluY2x1ZGVzKCdwYXNzZWQnKSAmJiBsaW5lLmluY2x1ZGVzKCdmYWlsZWQnKVxyXG5cdFx0XHRcdGlmIGxpbmUuaW5jbHVkZXMoJyAwIGZhaWxlZCAnKVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdHBhc3NlZDogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdHBhc3NlZDogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRmYWlsZWQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdEZBSUxFRDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmIGxpbmUuaW5jbHVkZXMoJ0xjb3YgY292ZXJhZ2UnKVxyXG5cdFx0XHRcdHlpZWxkICdjb3ZlcmFnZSByZXBvcnQgZ2VuZXJhdGVkJ1xyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuZXhwb3J0IGRvVW5pdFRlc3QgOj0gbmV3IENVbml0VGVzdGVyKClcclxuIl19