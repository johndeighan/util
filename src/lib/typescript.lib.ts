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

import {undef, defined, notdefined, croak, assert, getErrStr} from 'base'
import {
	integer, hash, hashof,
	isHash, isString, isEmpty, nonEmpty, isNumber,
	isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	getOptions, spaces, o, words, hasKey,
	CStringSetMap, keys, sep, allLinesInBlock,
	} from 'llutils'
import {f, withColors, decolorize} from 'f-strings'
import {debugging} from 'cmd-args'
import {
	extract, TPathItem, getString, getNumber, getArray,
	} from 'extract'
import {TBlockDesc, Blockify} from 'indent'
import {
	LOG, DBG, ERR, LOGVALUE, INDENT, UNDENT, DBGVALUE,
	pushLogLevel, popLogLevel,
	} from 'logger'
import {
	isFile, slurp, barf, barfTempFile, fileExt, withExt,
	pathStr, mkpath, newerDestFileExists,
	} from 'fsys'
import {OL, toNice, TMapFunc, DUMP} from 'to-nice'
import {
	execCmd, execCmdSync, CFileHandler, TProcSpec, TExecResult,
	procOneFile, procFiles,
	} from 'exec'
import {extractSourceMap} from 'source-map'
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

export const getSymbolsFromType = (typeStr: string): string[] => {

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

	const hAst = ts2ast(tsCode)

	if (dumpAST) {
		DUMP(astAsString(hAst), 'AST')
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
						checkNode(arg)
					};break;
				}

				case 273: {    // ImportDeclaration
					const lib = getString(node, '.moduleSpecifier.text')
					for (const h of getArray(node, '.importClause.namedBindings.elements')) {
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

class CTypescriptCompiler extends CFileHandler {

	get op() {
		return 'doCompileTS'
	}

	// ..........................................................

	override async handle(
			path: string,
			hOptions: hash = {}
			): AutoPromise<TExecResult> {

		LOG(`doCompileTS '${path}'`)

		type opt = {
			force: boolean
			}
		const {force} = getOptions<opt>(hOptions, {
			force: false
			})

		assert((fileExt(path) === '.ts'), `Not a typescript file: ${path}`)
		const jsPath = withExt(path, '.js')

		// --- Check if a newer compiled version already exists
		if (
				   !force
				&& await exists(jsPath)
				&& newerDestFileExists(path, jsPath)
				) {
			return {
				success: true,
				notNeeded: true
				}
		}

		try {
			const hResult = await execCmd('deno', [
				'bundle',
				'--minify',
				path,
				jsPath
				])
			if (!hResult.success) {
				console.log(this.getOutput(hResult))
				croak("Compile failed")
			}
			return hResult
		}

		catch (err) {
			if (debugging) {
				LOG(getErrStr(err))
			}
			const errMsg = `COMPILE FAILED: ${pathStr(path)} - ${getErrStr(err)}`
			return {
				success: false,
				stderr: errMsg
				}
		}
	}
}

export const doCompileTS = new CTypescriptCompiler()

// ---------------------------------------------------------------------------
// ASYNC

export const compileAllTS = async (
		root = '.',
		hOptions: hash = {}
		): AutoPromise<TExecResult[]> => {

	// --- with 'quiet' option, still reports errors
	const pattern = mkpath(root, '**/*.lib.ts')
	LOG(`pattern = '${pattern}'`)
	const spec: TProcSpec = [doCompileTS, [pattern]]
	return await procFiles(spec, {
		...hOptions,
		quiet: true,
		abortOnError: true
		})
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
				...(inspect ? ['--inspect-brk'] : ['--coverage=./coverage']),
				...(defined(lineNum) ? ['--filter', `/^line ${lineNum}$/`] : []),
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

		const lLines = Array.from(MAP(allLinesInBlock(decolorize(output)), function*(line) {
			if (line.startsWith('running')) {
				yield line
				yield ''
			}
			else if (line.startsWith('line')) {
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
				yield ''
			}
			else if (line.includes('Lcov coverage')) {
				yield 'coverage report generated'
			}
		}))
		return lLines.join('\n')
	}
}

export const doUnitTest = new CUnitTester()

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcdHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvdHlwZXNjcmlwdC5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSx1QkFBc0I7QUFDdEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3hELENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDOUQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsQ0FBQztBQUNoRCxDQUFDLGVBQWUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3RELENBQUMsNEJBQTRCLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQztBQUM3RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU07QUFDekUsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDdkIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDL0MsQ0FBQyxVQUFVLENBQUMsQ0FB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R0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQyxDQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQztFQUFDLENBQUE7QUFDOUMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxRO0NBQVEsQ0FBQTtBQUNqQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDcEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxVQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUE7QUFDQSxBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUEsQUFBQyxJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUNyQixBQUFBO0FBQ0EsQUFBQSxFQUFRLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDaEMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLEMsQ0FBRSxDQUFDLENBQUMsQ0FB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QyxJQUFJLENBQUMsSUFBSSxDO0NBQUMsQztBQUFBLENBQUE7QUFDMUIsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN0QyIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyB0eXBlc2NyaXB0LmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtleGlzdHMsIGV4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7XHJcblx0U291cmNlRmlsZSwgTm9kZSwgU2NyaXB0VGFyZ2V0LCBTeW50YXhLaW5kLCBNb2R1bGVLaW5kLFxyXG5cdE5ld0xpbmVLaW5kLCBFbWl0SGludCwgQ29tcGlsZXJPcHRpb25zLCBNb2R1bGVSZXNvbHV0aW9uS2luZCxcclxuXHRjcmVhdGVTb3VyY2VGaWxlLCBjcmVhdGVQcmludGVyLCBjcmVhdGVQcm9ncmFtLFxyXG5cdHRyYW5zcGlsZU1vZHVsZSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLCBmb3JFYWNoQ2hpbGQsXHJcblx0ZmxhdHRlbkRpYWdub3N0aWNNZXNzYWdlVGV4dCwgZ2V0TGluZUFuZENoYXJhY3Rlck9mUG9zaXRpb24sXHJcblx0fSBmcm9tICducG0tdHlwZXNjcmlwdCdcclxuXHJcbmltcG9ydCB7dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGNyb2FrLCBhc3NlcnQsIGdldEVyclN0cn0gZnJvbSAnYmFzZSdcclxuaW1wb3J0IHtcclxuXHRpbnRlZ2VyLCBoYXNoLCBoYXNob2YsXHJcblx0aXNIYXNoLCBpc1N0cmluZywgaXNFbXB0eSwgbm9uRW1wdHksIGlzTnVtYmVyLFxyXG5cdGlzRnVuY3Rpb24sIGZ1bmN0aW9uRGVmLCBpc0NsYXNzLCBjbGFzc0RlZixcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsIG8sIHdvcmRzLCBoYXNLZXksXHJcblx0Q1N0cmluZ1NldE1hcCwga2V5cywgc2VwLCBhbGxMaW5lc0luQmxvY2ssXHJcblx0fSBmcm9tICdsbHV0aWxzJ1xyXG5pbXBvcnQge2YsIHdpdGhDb2xvcnMsIGRlY29sb3JpemV9IGZyb20gJ2Ytc3RyaW5ncydcclxuaW1wb3J0IHtkZWJ1Z2dpbmd9IGZyb20gJ2NtZC1hcmdzJ1xyXG5pbXBvcnQge1xyXG5cdGV4dHJhY3QsIFRQYXRoSXRlbSwgZ2V0U3RyaW5nLCBnZXROdW1iZXIsIGdldEFycmF5LFxyXG5cdH0gZnJvbSAnZXh0cmFjdCdcclxuaW1wb3J0IHtUQmxvY2tEZXNjLCBCbG9ja2lmeX0gZnJvbSAnaW5kZW50J1xyXG5pbXBvcnQge1xyXG5cdExPRywgREJHLCBFUlIsIExPR1ZBTFVFLCBJTkRFTlQsIFVOREVOVCwgREJHVkFMVUUsXHJcblx0cHVzaExvZ0xldmVsLCBwb3BMb2dMZXZlbCxcclxuXHR9IGZyb20gJ2xvZ2dlcidcclxuaW1wb3J0IHtcclxuXHRpc0ZpbGUsIHNsdXJwLCBiYXJmLCBiYXJmVGVtcEZpbGUsIGZpbGVFeHQsIHdpdGhFeHQsXHJcblx0cGF0aFN0ciwgbWtwYXRoLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxyXG5cdH0gZnJvbSAnZnN5cydcclxuaW1wb3J0IHtPTCwgdG9OaWNlLCBUTWFwRnVuYywgRFVNUH0gZnJvbSAndG8tbmljZSdcclxuaW1wb3J0IHtcclxuXHRleGVjQ21kLCBleGVjQ21kU3luYywgQ0ZpbGVIYW5kbGVyLCBUUHJvY1NwZWMsIFRFeGVjUmVzdWx0LFxyXG5cdHByb2NPbmVGaWxlLCBwcm9jRmlsZXMsXHJcblx0fSBmcm9tICdleGVjJ1xyXG5pbXBvcnQge2V4dHJhY3RTb3VyY2VNYXB9IGZyb20gJ3NvdXJjZS1tYXAnXHJcbmltcG9ydCB7V2Fsa2VyLCBUVmlzaXRLaW5kfSBmcm9tICd3YWxrZXInXHJcbmltcG9ydCB7Q01haW5TY29wZSwgQ1Njb3BlfSBmcm9tICdzY29wZSdcclxuaW1wb3J0IHtnZXROZWVkZWRJbXBvcnRTdG10c30gZnJvbSAnc3ltYm9scydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuaW1wb3J0IHt0eXBlQ2hlY2tUc0ZpbGV9IGZyb20gJ2xsdHlwZXNjcmlwdCdcclxuXHJcbmRlY29kZXIgOj0gbmV3IFRleHREZWNvZGVyIFwidXRmLThcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBraW5kU3RyIDo9IChpOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIFN5bnRheEtpbmRbaV1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHMyYXN0IDo9IChcclxuXHRcdHRzQ29kZTogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogTm9kZSA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZmlsZU5hbWV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZmlsZU5hbWU6ICd0ZW1wLnRzJ1xyXG5cdFx0fVxyXG5cclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCh0c0NvZGUpXHJcblx0aEFzdCA6PSBjcmVhdGVTb3VyY2VGaWxlIGZpbGVOYW1lLCBjb2RlLCBTY3JpcHRUYXJnZXQuTGF0ZXN0XHJcblx0cmV0dXJuIGhBc3RcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0MnRzIDo9IChub2RlOiBOb2RlKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAobm9kZS5raW5kID09IDMwOCksIFwiTm90IGEgU291cmNlRmlsZSBub2RlXCJcclxuXHRwcmludGVyIDo9IGNyZWF0ZVByaW50ZXIgbmV3TGluZTogTmV3TGluZUtpbmQuTGluZUZlZWRcclxuXHRyZXR1cm4gcHJpbnRlci5wcmludE5vZGUoRW1pdEhpbnQuVW5zcGVjaWZpZWQsIG5vZGUsIG5vZGUgYXMgU291cmNlRmlsZSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIHBhc3NlZCB0byB0b05pY2UoKSB0byBhZGQgYSBkZXNjcmlwdGlvbiB0byBzb21lIG5vZGVzXHJcblxyXG5leHBvcnQgZGVzY0Z1bmM6IFRNYXBGdW5jIDo9IChcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0aFBhcmVudDogdW5rbm93blxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAoa2V5ID09ICdraW5kJykgJiYgaXNOdW1iZXIodmFsdWUpID8gZlwiKCN7a2luZFN0cih2YWx1ZSl9KVwiIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0QXNTdHJpbmcgOj0gKFxyXG5cdFx0aEFzdDogb2JqZWN0LFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0bEluY2x1ZGU6IHN0cmluZ1tdP1xyXG5cdFx0fVxyXG5cdHtsSW5jbHVkZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRsSW5jbHVkZTogdW5kZWZcclxuXHRcdH1cclxuXHJcblx0cmV0dXJuIHRvTmljZSBoQXN0LCB7XHJcblx0XHRpZ25vcmVFbXB0eUtleXM6IHRydWVcclxuXHRcdGxJbmNsdWRlXHJcblx0XHRsRXhjbHVkZTogd29yZHMoXCJcIlwiXHJcblx0XHRcdHBvcyBlbmQgaWQgZmxhZ3MgbW9kaWZpZXJGbGFnc0NhY2hlXHJcblx0XHRcdHRyYW5zZm9ybUZsYWdzIGhhc0V4dGVuZGVkVW5pY29kZUVzY2FwZVxyXG5cdFx0XHRudW1lcmljTGl0ZXJhbEZsYWdzIHNldEV4dGVybmFsTW9kdWxlSW5kaWNhdG9yXHJcblx0XHRcdGxhbmd1YWdlVmVyc2lvbiBsYW5ndWFnZVZhcmlhbnQganNEb2NQYXJzaW5nTW9kZVxyXG5cdFx0XHRoYXNOb0RlZmF1bHRMaWJcclxuXHRcdFx0XCJcIlwiKVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRJbXBvcnRDb2RlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0REJHIFwiQ0FMTCBnZXRJbXBvcnRDb2RlKClcIlxyXG5cdGxTeW1ib2xzIDo9IGdldFN5bWJvbHNGcm9tVHlwZSB0eXBlU3RyXHJcblx0REJHVkFMVUUgJ2xTeW1ib2xzJywgbFN5bWJvbHNcclxuXHRpZiBub25FbXB0eShsU3ltYm9scylcclxuXHRcdGxTdG10cyA6PSBnZXROZWVkZWRJbXBvcnRTdG10cyBsU3ltYm9sc1xyXG5cdFx0REJHVkFMVUUgJ2xTdG10cycsIGxTdG10c1xyXG5cdFx0cmV0dXJuIGxTdG10cy5qb2luICdcXG4nXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldFN5bWJvbHNGcm9tVHlwZSA6PSAodHlwZVN0cjogc3RyaW5nKTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL14oW0EtWmEtel1bQS1aYS16MC05K10qKSg/OlxcPChbQS1aYS16XVtBLVphLXowLTkrXSopXFw+KT8kLykpXHJcblx0XHRbXywgdHlwZSwgc3VidHlwZV0gOj0gbE1hdGNoZXNcclxuXHRcdHJldHVybiBub25FbXB0eShzdWJ0eXBlKSA/IFt0eXBlLCBzdWJ0eXBlXSA6IFt0eXBlXVxyXG5cdGVsc2UgaWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL15cXChcXClcXHMqXFw9XFw+XFxzKihbQS1aYS16XVtBLVphLXowLTkrXSopJC8pKVxyXG5cdFx0cmV0dXJuIFtsTWF0Y2hlc1sxXV1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gW11cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5oRGVmQ29uZmlnOiBDb21waWxlck9wdGlvbnMgOj0ge1xyXG5cdFwiYWxsb3dKc1wiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbWRHbG9iYWxBY2Nlc3NcIjogZmFsc2VcclxuXHRcImFsbG93VW5yZWFjaGFibGVDb2RlXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VudXNlZExhYmVsc1wiOiBmYWxzZVxyXG5cdFwiYWx3YXlzU3RyaWN0XCI6IHRydWVcclxuXHRcImFzc3VtZUNoYW5nZXNPbmx5QWZmZWN0RGlyZWN0RGVwZW5kZW5jaWVzXCI6IGZhbHNlXHJcblx0XCJjaGVja0pzXCI6IGZhbHNlXHJcblx0XCJjb21wb3NpdGVcIjogZmFsc2VcclxuXHRcImRlY2xhcmF0aW9uXCI6IGZhbHNlXHJcblx0XCJkZWNsYXJhdGlvbkRpclwiOiB1bmRlZmluZWRcclxuXHRcImRlY2xhcmF0aW9uTWFwXCI6IGZhbHNlXHJcblx0XCJlbWl0Qk9NXCI6IGZhbHNlXHJcblx0XCJlbWl0RGVjbGFyYXRpb25Pbmx5XCI6IGZhbHNlXHJcblx0XCJleGFjdE9wdGlvbmFsUHJvcGVydHlUeXBlc1wiOiBmYWxzZVxyXG5cdFwiZXhwZXJpbWVudGFsRGVjb3JhdG9yc1wiOiBmYWxzZVxyXG5cdFwiZm9yY2VDb25zaXN0ZW50Q2FzaW5nSW5GaWxlTmFtZXNcIjogdHJ1ZVxyXG5cdFwiZ2VuZXJhdGVDcHVQcm9maWxlXCI6IG51bGxcclxuXHRcImdlbmVyYXRlVHJhY2VcIjogbnVsbFxyXG5cdFwiaWdub3JlRGVwcmVjYXRpb25zXCI6IFwiNS4wXCJcclxuXHRcImltcG9ydEhlbHBlcnNcIjogZmFsc2VcclxuXHRcImlubGluZVNvdXJjZU1hcFwiOiBmYWxzZVxyXG5cdFwiaW5saW5lU291cmNlc1wiOiBmYWxzZVxyXG5cdFwiaXNvbGF0ZWRNb2R1bGVzXCI6IGZhbHNlXHJcblx0I1x0XCJqc3hcIjogXCJyZWFjdC1qc3hcIixcclxuXHQjXHRcImpzeEZhY3RvcnlcIjogXCJSZWFjdC5jcmVhdGVFbGVtZW50XCIsXHJcblx0I1x0XCJqc3hGcmFnbWVudEZhY3RvcnlcIjogXCJSZWFjdC5GcmFnbWVudFwiLFxyXG5cdCNcdFwianN4SW1wb3J0U291cmNlXCI6IFwicmVhY3RcIixcclxuXHRcImxpYlwiOiBbXHJcblx0XHRcImVzbmV4dFwiXHJcblx0XHRcImRvbVwiXHJcblx0XHRcImRvbS5pdGVyYWJsZVwiXHJcblx0XVxyXG5cdFwibWFwUm9vdFwiOiB1bmRlZmluZWRcclxuXHRcIm1heE5vZGVNb2R1bGVKc0RlcHRoXCI6IDBcclxuXHRcIm1vZHVsZVwiOiBNb2R1bGVLaW5kLkVTTmV4dFxyXG5cdFwibW9kdWxlRGV0ZWN0aW9uXCI6IHVuZGVmaW5lZFxyXG5cdFwibW9kdWxlUmVzb2x1dGlvblwiOiBNb2R1bGVSZXNvbHV0aW9uS2luZC5Ob2RlTmV4dFxyXG5cdFwibmV3TGluZVwiOiBOZXdMaW5lS2luZC5MaW5lRmVlZFxyXG5cdFwibm9FbWl0XCI6IHRydWVcclxuXHRcIm5vRW1pdEhlbHBlcnNcIjogZmFsc2VcclxuXHRcIm5vRW1pdE9uRXJyb3JcIjogZmFsc2VcclxuXHRcIm5vRXJyb3JUcnVuY2F0aW9uXCI6IGZhbHNlXHJcblx0XCJub0ZhbGx0aHJvdWdoQ2FzZXNJblN3aXRjaFwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0QW55XCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRPdmVycmlkZVwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0UmV0dXJuc1wiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0VGhpc1wiOiB0cnVlXHJcblx0XCJub1Byb3BlcnR5QWNjZXNzRnJvbUluZGV4U2lnbmF0dXJlXCI6IHRydWVcclxuXHRcIm5vVW5jaGVja2VkSW5kZXhlZEFjY2Vzc1wiOiB0cnVlXHJcblx0XCJub1VudXNlZExvY2Fsc1wiOiB0cnVlXHJcblx0XCJub1VudXNlZFBhcmFtZXRlcnNcIjogdHJ1ZVxyXG5cdFwib3V0RGlyXCI6IHVuZGVmaW5lZFxyXG5cdFwib3V0RmlsZVwiOiB1bmRlZmluZWRcclxuXHRcInBhdGhzXCI6IHt9XHJcblx0XCJwcmVzZXJ2ZUNvbnN0RW51bXNcIjogZmFsc2VcclxuXHRcInByZXNlcnZlU3ltbGlua3NcIjogZmFsc2VcclxuXHRcInByZXNlcnZlVmFsdWVJbXBvcnRzXCI6IGZhbHNlXHJcblx0XCJyZWFjdE5hbWVzcGFjZVwiOiBcIlJlYWN0XCJcclxuXHRcInJlbW92ZUNvbW1lbnRzXCI6IGZhbHNlXHJcblx0XCJyZXNvbHZlSnNvbk1vZHVsZVwiOiB0cnVlXHJcblx0XCJyb290RGlyXCI6IHVuZGVmaW5lZFxyXG5cdFwicm9vdERpcnNcIjogW11cclxuXHRcInNraXBEZWZhdWx0TGliQ2hlY2tcIjogZmFsc2VcclxuXHRcInNraXBMaWJDaGVja1wiOiBmYWxzZVxyXG5cdFwic291cmNlTWFwXCI6IGZhbHNlXHJcblx0XCJzb3VyY2VSb290XCI6IHVuZGVmaW5lZFxyXG5cdFwic3RyaWN0XCI6IHRydWVcclxuXHRcInN0cmljdEJpbmRDYWxsQXBwbHlcIjogdHJ1ZVxyXG5cdFwic3RyaWN0RnVuY3Rpb25UeXBlc1wiOiB0cnVlXHJcblx0XCJzdHJpY3ROdWxsQ2hlY2tzXCI6IHRydWVcclxuXHRcInN0cmljdFByb3BlcnR5SW5pdGlhbGl6YXRpb25cIjogdHJ1ZVxyXG5cdFwic3RyaXBJbnRlcm5hbFwiOiBmYWxzZVxyXG5cdFwic3VwcHJlc3NFeGNlc3NQcm9wZXJ0eUVycm9yc1wiOiBmYWxzZVxyXG5cdFwic3VwcHJlc3NJbXBsaWNpdEFueUluZGV4RXJyb3JzXCI6IGZhbHNlXHJcblx0XCJ0YXJnZXRcIjogU2NyaXB0VGFyZ2V0LkVTMjAyMlxyXG5cdFwidHJhY2VSZXNvbHV0aW9uXCI6IGZhbHNlXHJcblx0XCJ0c0J1aWxkSW5mb0ZpbGVcIjogdW5kZWZpbmVkXHJcblx0XCJ0eXBlUm9vdHNcIjogW11cclxuXHRcInVzZURlZmluZUZvckNsYXNzRmllbGRzXCI6IHRydWVcclxuXHRcInVzZVVua25vd25JbkNhdGNoVmFyaWFibGVzXCI6IHRydWVcclxufVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbnR5cGUgVEFzdEZpbHRlckZ1bmMgPSAobm9kZTogTm9kZSkgPT4gYm9vbGVhblxyXG5cclxuZXhwb3J0IGNsYXNzIEFzdFdhbGtlciBleHRlbmRzIFdhbGtlcjxOb2RlPlxyXG5cclxuXHRmaWx0ZXJGdW5jOiBUQXN0RmlsdGVyRnVuYz9cclxuXHRoT3B0aW9uczogaGFzaFxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoXHJcblx0XHRcdEBmaWx0ZXJGdW5jOiBUQXN0RmlsdGVyRnVuYz8gPSB1bmRlZixcclxuXHRcdFx0QGhPcHRpb25zID0ge31cclxuXHRcdFx0KVxyXG5cdFx0c3VwZXIoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZGJnKG9wOiAncHVzaCcgfCAncG9wJywgbm9kZTogTm9kZSk6IHZvaWRcclxuXHJcblx0XHRwcmVmaXggOj0gJyAgICdcclxuXHRcdGtpbmQgOj0gbm9kZS5raW5kXHJcblx0XHRjb25zb2xlLmxvZyBcIiN7cHJlZml4fSN7b3AudG9VcHBlckNhc2UoKX06ICN7a2luZH0gWyN7QHN0YWNrRGVzYygpfV1cIlxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRzdGFja0Rlc2MoKTogc3RyaW5nXHJcblxyXG5cdFx0cmVzdWx0cyA6PSBbXVxyXG5cdFx0Zm9yIG5vZGUgb2YgQGxOb2RlU3RhY2tcclxuXHRcdFx0cmVzdWx0cy5wdXNoIG5vZGUua2luZC50b1N0cmluZygpXHJcblx0XHRsU3RhY2sgOj0gcmVzdWx0c1xyXG5cdFx0cmV0dXJuIGxTdGFjay5qb2luICcsJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgcHVzaE5vZGUobm9kZTogTm9kZSk6IHZvaWRcclxuXHJcblx0XHRzdXBlci5wdXNoTm9kZSBub2RlXHJcblx0XHRpZiBAaE9wdGlvbnMudHJhY2VcclxuXHRcdFx0QGRiZyAncHVzaCcsIG5vZGVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgcG9wTm9kZSgpOiBOb2RlP1xyXG5cclxuXHRcdG5vZGUgOj0gc3VwZXIucG9wTm9kZSgpXHJcblx0XHRpZiBAaE9wdGlvbnMudHJhY2VcclxuXHRcdFx0aWYgZGVmaW5lZChub2RlKVxyXG5cdFx0XHRcdEBkYmcgJ3BvcCcsIG5vZGVcclxuXHRcdFx0ZWxzZVxyXG5cdFx0XHRcdGNvbnNvbGUubG9nIFwiU1RBQ0sgRU1QVFlcIlxyXG5cdFx0cmV0dXJuIG5vZGVcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGlzTm9kZSh4OiBvYmplY3QpOiB4IGlzIE5vZGVcclxuXHJcblx0XHRyZXR1cm4gT2JqZWN0Lmhhc093biB4LCAna2luZCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGZpbHRlcihub2RlOiBOb2RlKTogYm9vbGVhblxyXG5cclxuXHRcdHJldHVybiBkZWZpbmVkKEBmaWx0ZXJGdW5jKSA/IEBmaWx0ZXJGdW5jKG5vZGUpIDogdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGFzcyBDQW5hbHlzaXNcclxuXHJcblx0dHJhY2UgPSBmYWxzZVxyXG5cdG1JbXBvcnRzID0gbmV3IENTdHJpbmdTZXRNYXAoKVxyXG5cdG1FeHBvcnRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKVxyXG5cdHNNaXNzaW5nID0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRtYWluU2NvcGUgPSBuZXcgQ01haW5TY29wZSgpXHJcblx0Y3VyU2NvcGU6IENTY29wZVxyXG5cdGZpbmlzaGVkID0gZmFsc2VcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKEB0cmFjZSA9IGZhbHNlKVxyXG5cclxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGVcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGRlZmluZShuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGRlZmluZSAje25hbWV9XCJcclxuXHRcdEBjdXJTY29wZS5kZWZpbmUgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHR1c2UobmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdCMgLS0tIHRoaXMgY29uZGl0aW9uIHNob3VsZCBmaWx0ZXIgYnVpbHQtaW5zXHJcblx0XHRpZiBub3QgaGFzS2V5KGdsb2JhbFRoaXMsIG5hbWUpXHJcblx0XHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRcdExPRyBcIiAgIHVzZSAje25hbWV9XCJcclxuXHRcdFx0aWYgbm90IEBjdXJTY29wZS5pc0RlZmluZWQobmFtZSlcclxuXHRcdFx0XHRpZiBAdHJhY2VcclxuXHRcdFx0XHRcdExPRyBcIiAgIG1pc3NpbmcgI3tuYW1lfVwiXHJcblx0XHRcdFx0QHNNaXNzaW5nLmFkZCBuYW1lXHJcblx0XHRcdEBjdXJTY29wZS51c2UgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhZGRJbXBvcnQobGliOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgaW1wb3J0ICcje25hbWV9JyBpbiAnI3tsaWJ9J1wiXHJcblx0XHRAbUltcG9ydHMuYWRkIGxpYiwgbmFtZVxyXG5cdFx0QGRlZmluZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFkZEV4cG9ydChuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZXhwb3J0ICcje25hbWV9JzogJyN7dHlwZX0nXCJcclxuXHRcdEBtRXhwb3J0cy5zZXQgbmFtZSwgdHlwZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRuZXdTY29wZShuYW1lOiBzdHJpbmc/LCBsQXJnczogc3RyaW5nW10pOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIG5ldyBzY29wZSAje25hbWUgfHwgJzxhbm9uPid9KCN7bEFyZ3Muam9pbignLCcpfSlcIlxyXG5cdFx0QGN1clNjb3BlID0gQG1haW5TY29wZS5uZXdTY29wZShuYW1lLCBsQXJncylcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZW5kU2NvcGUoKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBlbmQgc2NvcGVcIlxyXG5cdFx0c2NvcGUgOj0gQG1haW5TY29wZS5lbmRTY29wZSBAY3VyU2NvcGVcclxuXHRcdGlmIGRlZmluZWQoc2NvcGUpXHJcblx0XHRcdEBjdXJTY29wZSA9IHNjb3BlXHJcblx0XHRlbHNlXHJcblx0XHRcdEBmaW5pc2hlZCA9IHRydWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0SW1wb3J0cygpOiBUQmxvY2tEZXNjXHJcblxyXG5cdFx0aEltcG9ydHM6IGhhc2hvZjxzdHJpbmdbXT4gOj0ge31cclxuXHRcdGZvciBbbGliLCBzTmFtZXNdIG9mIEBtSW1wb3J0cy5lbnRyaWVzKClcclxuXHRcdFx0aEltcG9ydHNbbGliXSA9IEFycmF5LmZyb20oc05hbWVzLnZhbHVlcygpKVxyXG5cdFx0cmV0dXJuIGhJbXBvcnRzXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRFeHBvcnRzKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQG1FeHBvcnRzLmtleXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0TWlzc2luZygpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHJldHVybiBBcnJheS5mcm9tIEBzTWlzc2luZy52YWx1ZXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0RXh0cmEoKTogc3RyaW5nW11cclxuXHJcblx0XHR3YWxrZXIgOj0gbmV3IFdhbGtlcjxDU2NvcGU+KClcclxuXHRcdHdhbGtlci5pc05vZGUgPSAoeDogdW5rbm93bikgPT5cclxuXHRcdFx0cmV0dXJuICh4IGluc3RhbmNlb2YgQ1Njb3BlKVxyXG5cclxuXHRcdCMgLS0tIEZpbmQgYWxsIG5hbWVzIHRoYXQgYXJlIGRlZmluZWQsIGJ1dCBuZXZlciB1c2VkIG9yIGV4cG9ydGVkXHJcblx0XHRzTmFtZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRcdGZvciBzY29wZSBvZiB3YWxrZXIud2FsayhAbWFpblNjb3BlKVxyXG5cdFx0XHRmb3IgbmFtZSBvZiBzY29wZS5hbGxEZWZpbmVkKClcclxuXHRcdFx0XHRpZiBub3Qgc2NvcGUuaXNVc2VkKG5hbWUpICYmICFAbUV4cG9ydHMuaGFzKG5hbWUpXHJcblx0XHRcdFx0XHRzTmFtZXMuYWRkIG5hbWVcclxuXHRcdHJldHVybiBBcnJheS5mcm9tIHNOYW1lcy52YWx1ZXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YXNTdHJpbmcod2lkdGg6IGludGVnZXIgPSA2NCk6IHN0cmluZ1xyXG5cclxuXHRcdGg6IFRCbG9ja0Rlc2MgOj0ge1xyXG5cdFx0XHRJTVBPUlRTOiBAZ2V0SW1wb3J0cygpXHJcblx0XHRcdEVYUE9SVFM6IEBnZXRFeHBvcnRzKClcclxuXHRcdFx0TUlTU0lORzogQGdldE1pc3NpbmcoKVxyXG5cdFx0XHRFWFRSQTogQGdldEV4dHJhKClcclxuXHRcdFx0fVxyXG5cclxuXHRcdGlmIGlzRW1wdHkoaC5JTVBPUlRTKVxyXG5cdFx0XHRkZWxldGUgaC5JTVBPUlRTXHJcblx0XHRpZiBpc0VtcHR5KGguRVhQT1JUUylcclxuXHRcdFx0ZGVsZXRlIGguRVhQT1JUU1xyXG5cdFx0aWYgaXNFbXB0eShoLk1JU1NJTkcpXHJcblx0XHRcdGRlbGV0ZSBoLk1JU1NJTkdcclxuXHRcdGlmIGlzRW1wdHkoaC5FWFRSQSlcclxuXHRcdFx0ZGVsZXRlIGguRVhUUkFcclxuXHRcdHJldHVybiBCbG9ja2lmeSBoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzc2VydElzTm9kZTogKFxyXG5cdFx0eDogdW5rbm93blxyXG5cdFx0KSA9PiBhc3NlcnRzIHggaXMgTm9kZSA6PSAoeDogdW5rbm93bik6IGFzc2VydHMgeCBpcyBOb2RlID0+XHJcblxyXG5cdGFzc2VydCBoYXNLZXkoeCwgJ2tpbmQnKSwgXCJOb3QgYSBOb2RlOiAje3R5cGVvZiB4fVwiXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE5vZGUgOj0gKHg6IHVua25vd24sIGRzcGF0aDogc3RyaW5nIHwgVFBhdGhJdGVtW10pOiBOb2RlID0+XHJcblxyXG5cdHZhbCA6PSBleHRyYWN0IHgsIGRzcGF0aFxyXG5cdGFzc2VydElzTm9kZSB2YWxcclxuXHRyZXR1cm4gdmFsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFuYWx5emVUUyA6PSAoXHJcblx0XHR0c0NvZGU6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IENBbmFseXNpcyA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmc/XHJcblx0XHRkdW1wQVNUOiBib29sZWFuXHJcblx0XHR0cmFjZTogYm9vbGVhblxyXG5cdFx0fVxyXG5cdHtmaWxlTmFtZSwgZHVtcEFTVCwgdHJhY2V9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZmlsZU5hbWU6IHVuZGVmXHJcblx0XHRkdW1wQVNUOiBmYWxzZVxyXG5cdFx0dHJhY2U6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGFuYWx5c2lzIDo9IG5ldyBDQW5hbHlzaXModHJhY2UpXHJcblx0d2Fsa2VyIDo9IG5ldyBBc3RXYWxrZXIoKVxyXG5cclxuXHRoQXN0IDo9IHRzMmFzdCB0c0NvZGVcclxuXHJcblx0aWYgZHVtcEFTVFxyXG5cdFx0RFVNUCBhc3RBc1N0cmluZyhoQXN0KSwgJ0FTVCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNoZWNrTm9kZSA6PSAoXHJcblx0XHRcdG5vZGU6IHVua25vd24sXHJcblx0XHRcdGRzcGF0aDogc3RyaW5nPyA9IHVuZGVmXHJcblx0XHRcdCk6IHZvaWQgPT5cclxuXHJcblx0XHRhc3NlcnRJc05vZGUgbm9kZVxyXG5cdFx0aWYgZGVmaW5lZChkc3BhdGgpXHJcblx0XHRcdG5vZGUgPSBnZXROb2RlKG5vZGUsIGRzcGF0aClcclxuXHRcdFx0YXNzZXJ0SXNOb2RlIG5vZGVcclxuXHRcdGlmIChub2RlLmtpbmQgPT0gODApICAgIyAtLS0gSWRlbnRpZmllclxyXG5cdFx0XHRuYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRhbmFseXNpcy51c2UgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRzeW0gOj0gKHZraW5kOiBUVmlzaXRLaW5kKTogc3RyaW5nID0+XHJcblx0XHRzd2l0Y2ggdmtpbmRcclxuXHRcdFx0d2hlbiAnZW50ZXInIHRoZW4gcmV0dXJuICctPidcclxuXHRcdFx0d2hlbiAnZXhpdCcgIHRoZW4gcmV0dXJuICc8LSdcclxuXHRcdFx0ZWxzZSAgICAgICAgICAgICAgcmV0dXJuICc6OidcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyB2a2luZCBpcyBvbmUgb2YgJ2VudGVyJywgJ2V4aXQnLCAncmVmJ1xyXG5cclxuXHRsVHJhY2VLaW5kIDo9IFs4MCwgOTUsIDE3MCwgMjE0LCAyMjAsIDIyNywgMjU0LCAyNjEsIDI2MywgMjczLCAyODAsIDMwOF1cclxuXHRmb3IgW3ZraW5kLCBub2RlXSBvZiB3YWxrZXIud2Fsa0V4KGhBc3QpXHJcblx0XHR7a2luZH0gOj0gbm9kZVxyXG5cdFx0aWYgdHJhY2UgJiYgbFRyYWNlS2luZC5pbmNsdWRlcyhraW5kKVxyXG5cdFx0XHRMT0cgZlwiI3tzeW0odmtpbmQpfSBOT0RFICN7a2luZH06MyAoI3traW5kU3RyKGtpbmQpfTp7Y3lhbn0pXCJcclxuXHJcblx0XHRpZiAodmtpbmQgPT0gJ2V4aXQnKVxyXG5cdFx0XHRzd2l0Y2gga2luZFxyXG5cclxuXHRcdFx0XHR3aGVuIDIyMCwgMjYzICAgIyBBcnJvd0Z1bmN0aW9uLCBGdW5jdGlvbkRlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRhbmFseXNpcy5lbmRTY29wZSgpXHJcblxyXG5cdFx0ZWxzZSBpZiAodmtpbmQgPT0gJ2VudGVyJylcclxuXHJcblx0XHRcdHN3aXRjaCBraW5kXHJcblxyXG5cdFx0XHRcdHdoZW4gMjIwICAgICMgQXJyb3dGdW5jdGlvblxyXG5cdFx0XHRcdFx0ZG9cclxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cclxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0JylcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMubmV3U2NvcGUgdW5kZWYsIGxQYXJtc1xyXG5cclxuXHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdHRyeVxyXG5cdFx0XHRcdFx0XHR2YXJOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmRlZmluZSB2YXJOYW1lXHJcblxyXG5cdFx0XHRcdHdoZW4gMjYzICAgICMgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0IyAtLS0gZG8gY3JlYXRlcyBhIHNjb3BlLCBhIGxhIGFuIElJRkVcclxuXHRcdFx0XHRcdGRvXHJcblx0XHRcdFx0XHRcdGZ1bmNOYW1lIDo9IGdldFN0cmluZyBub2RlLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblxyXG5cdFx0XHRcdFx0XHRsUGFybXMgOj0gQXJyYXkuZnJvbSBNQVAgZ2V0QXJyYXkobm9kZSwgJy5wYXJhbWV0ZXJzJyksICh4KSAtPlxyXG5cdFx0XHRcdFx0XHRcdHlpZWxkIGdldFN0cmluZyh4LCAnLm5hbWUuZXNjYXBlZFRleHQnKVxyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgZnVuY05hbWVcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMubmV3U2NvcGUgZnVuY05hbWUsIGxQYXJtc1xyXG5cclxuXHRcdFx0XHR3aGVuIDIyNyAgICAjIEJpbmFyeUV4cHJlc3Npb25cclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmxlZnQnXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5yaWdodCdcclxuXHJcblx0XHRcdFx0d2hlbiAyMTQgICAgIyBDYWxsRXhwcmVzc2lvblxyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcuZXhwcmVzc2lvbidcclxuXHRcdFx0XHRcdGZvciBhcmcgb2YgZ2V0QXJyYXkobm9kZSwgJy5hcmd1bWVudHMnKVxyXG5cdFx0XHRcdFx0XHRjaGVja05vZGUgYXJnXHJcblxyXG5cdFx0XHRcdHdoZW4gMjczICAgICMgSW1wb3J0RGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdGxpYiA6PSBnZXRTdHJpbmcgbm9kZSwgJy5tb2R1bGVTcGVjaWZpZXIudGV4dCdcclxuXHRcdFx0XHRcdGZvciBoIG9mIGdldEFycmF5KG5vZGUsICcuaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MuZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBoLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEltcG9ydCBsaWIsIG5hbWVcclxuXHJcblx0XHRcdFx0d2hlbiAyODAgICAgIyBOYW1lZEV4cG9ydHNcclxuXHRcdFx0XHRcdGZvciBlbGVtIG9mIGdldEFycmF5KG5vZGUsICcuZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBlbGVtLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAncmUtZXhwb3J0J1xyXG5cclxuXHRcdFx0XHR3aGVuIDk1ICAgICAjIEV4cG9ydEtleXdvcmRcclxuXHRcdFx0XHRcdHBhcmVudCA6PSB3YWxrZXIucGFyZW50KClcclxuXHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIocGFyZW50LCAnLmtpbmQnKVxyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNDQgICAgIyBGaXJzdFN0YXRlbWVudFxyXG5cdFx0XHRcdFx0XHRcdGZvciBkZWNsIG9mIGdldEFycmF5KHBhcmVudCwgJy5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zJylcclxuXHRcdFx0XHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIoZGVjbCwgJy5raW5kJylcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gMjYxICAgICMgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGRlY2wsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHQjIC0tLSBDaGVjayBpbml0aWFsaXplciB0byBmaW5kIHRoZSB0eXBlXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5pdEtpbmQgOj0gZ2V0TnVtYmVyIGRlY2wsICcuaW5pdGlhbGl6ZXIua2luZCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggaW5pdEtpbmRcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdmdW5jdGlvbidcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDksIDI2MSAjIEZpcnN0TGl0ZXJhbFRva2VuLCBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnY29uc3QnXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd1bmtub3duJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjMgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjQgICAjIENsYXNzRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NsYXNzJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjYgICAjIFR5cGVBbGlhc0RlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd0eXBlJ1xyXG5cclxuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRjcm9hayBcIlVuZXhwZWN0ZWQgc3VidHlwZSBvZiA5NTogI3twYXJlbnQua2luZH1cIlxyXG5cdHJldHVybiBhbmFseXNpc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENUeXBlc2NyaXB0Q29tcGlsZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9Db21waWxlVFMnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdExPRyBcImRvQ29tcGlsZVRTICcje3BhdGh9J1wiXHJcblxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdGZvcmNlOiBib29sZWFuXHJcblx0XHRcdH1cclxuXHRcdHtmb3JjZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGZvcmNlOiBmYWxzZVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0YXNzZXJ0IChmaWxlRXh0KHBhdGgpID09ICcudHMnKSwgXCJOb3QgYSB0eXBlc2NyaXB0IGZpbGU6ICN7cGF0aH1cIlxyXG5cdFx0anNQYXRoIDo9IHdpdGhFeHQgcGF0aCwgJy5qcydcclxuXHJcblx0XHQjIC0tLSBDaGVjayBpZiBhIG5ld2VyIGNvbXBpbGVkIHZlcnNpb24gYWxyZWFkeSBleGlzdHNcclxuXHRcdGlmIChcclxuXHRcdFx0XHQgICBub3QgZm9yY2VcclxuXHRcdFx0XHQmJiBhd2FpdCBleGlzdHMoanNQYXRoKVxyXG5cdFx0XHRcdCYmIG5ld2VyRGVzdEZpbGVFeGlzdHMocGF0aCwganNQYXRoKVxyXG5cdFx0XHRcdClcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlXHJcblx0XHRcdFx0bm90TmVlZGVkOiB0cnVlXHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdHRyeVxyXG5cdFx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdFx0J2J1bmRsZSdcclxuXHRcdFx0XHQnLS1taW5pZnknXHJcblx0XHRcdFx0cGF0aFxyXG5cdFx0XHRcdGpzUGF0aFxyXG5cdFx0XHRcdF1cclxuXHRcdFx0aWYgbm90IGhSZXN1bHQuc3VjY2Vzc1xyXG5cdFx0XHRcdGNvbnNvbGUubG9nIEBnZXRPdXRwdXQoaFJlc3VsdClcclxuXHRcdFx0XHRjcm9hayBcIkNvbXBpbGUgZmFpbGVkXCJcclxuXHRcdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcblx0XHRjYXRjaCBlcnJcclxuXHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0TE9HIGdldEVyclN0cihlcnIpXHJcblx0XHRcdGVyck1zZyA6PSBcIkNPTVBJTEUgRkFJTEVEOiAje3BhdGhTdHIocGF0aCl9IC0gI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlXHJcblx0XHRcdFx0c3RkZXJyOiBlcnJNc2dcclxuXHRcdFx0XHR9XHJcblxyXG5leHBvcnQgZG9Db21waWxlVFMgOj0gbmV3IENUeXBlc2NyaXB0Q29tcGlsZXIoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGNvbXBpbGVBbGxUUyA6PSAoXHJcblx0XHRyb290ID0gJy4nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBURXhlY1Jlc3VsdFtdID0+XHJcblxyXG5cdCMgLS0tIHdpdGggJ3F1aWV0JyBvcHRpb24sIHN0aWxsIHJlcG9ydHMgZXJyb3JzXHJcblx0cGF0dGVybiA6PSBta3BhdGgocm9vdCwgJyoqLyoubGliLnRzJylcclxuXHRMT0cgXCJwYXR0ZXJuID0gJyN7cGF0dGVybn0nXCJcclxuXHRzcGVjOiBUUHJvY1NwZWMgOj0gW2RvQ29tcGlsZVRTLCBbcGF0dGVybl1dXHJcblx0cmV0dXJuIGF3YWl0IHByb2NGaWxlcyBzcGVjLCB7XHJcblx0XHQuLi5oT3B0aW9uc1xyXG5cdFx0cXVpZXQ6IHRydWVcclxuXHRcdGFib3J0T25FcnJvcjogdHJ1ZVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENVbml0VGVzdGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvVW5pdFRlc3QnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdGFzc2VydCBwYXRoLmVuZHNXaXRoKCcudGVzdC50cycpLCBcIk5vdCBhIHVuaXQgdGVzdCBmaWxlXCJcclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRjYXB0dXJlOiBib29sZWFuXHJcblx0XHRcdGluc3BlY3Q6IGJvb2xlYW5cclxuXHRcdFx0bGluZU51bTogc3RyaW5nP1xyXG5cdFx0XHR9XHJcblx0XHR7Y2FwdHVyZSwgaW5zcGVjdCwgbGluZU51bX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGNhcHR1cmU6IHRydWVcclxuXHRcdFx0aW5zcGVjdDogZmFsc2VcclxuXHRcdFx0bGluZU51bTogdW5kZWZcclxuXHRcdFx0fVxyXG5cclxuXHRcdGhSZXN1bHQgOj0gYXdhaXQgZXhlY0NtZCAnZGVubycsIFtcclxuXHRcdFx0XHQndGVzdCdcclxuXHRcdFx0XHQnLUEnXHJcblx0XHRcdFx0Li4uKGluc3BlY3QgPyBbJy0taW5zcGVjdC1icmsnXSA6IFsnLS1jb3ZlcmFnZT0uL2NvdmVyYWdlJ10pXHJcblx0XHRcdFx0Li4uKGRlZmluZWQobGluZU51bSkgPyBbJy0tZmlsdGVyJywgXCIvXmxpbmUgI3tsaW5lTnVtfSQvXCJdIDogW10pXHJcblx0XHRcdFx0cGF0aFxyXG5cdFx0XHRcdF0sIHtjYXB0dXJlfVxyXG5cdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGdldE91dHB1dChoUmVzdWx0OiBURXhlY1Jlc3VsdCk6IHN0cmluZ1xyXG5cclxuXHRcdHtzdGRvdXQsIHN0ZGVycn0gOj0gaFJlc3VsdFxyXG5cdFx0b3V0cHV0IDo9IFtzdGRvdXQsIHN0ZGVycl0uam9pbigpXHJcblx0XHRpZiBub3QgaFJlc3VsdC5zdWNjZXNzIHx8IG91dHB1dC5tYXRjaCgvY3JvYWt8ZXJyb3IvaSlcclxuXHRcdFx0cmV0dXJuIG91dHB1dFxyXG5cclxuXHRcdGxMaW5lcyA6PSBBcnJheS5mcm9tIE1BUCBhbGxMaW5lc0luQmxvY2soZGVjb2xvcml6ZShvdXRwdXQpKSwgKGxpbmUpIC0+XHJcblx0XHRcdGlmIGxpbmUuc3RhcnRzV2l0aCgncnVubmluZycpXHJcblx0XHRcdFx0eWllbGQgbGluZVxyXG5cdFx0XHRcdHlpZWxkICcnXHJcblx0XHRcdGVsc2UgaWYgbGluZS5zdGFydHNXaXRoKCdsaW5lJylcclxuXHRcdFx0XHRpZiBub3QgbGluZS5pbmNsdWRlcygnIG9rICcpXHJcblx0XHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcclxuXHRcdFx0XHRcdFx0ZmFpbGVkOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdE9LOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiBsaW5lLmluY2x1ZGVzKCdwYXNzZWQnKSAmJiBsaW5lLmluY2x1ZGVzKCdmYWlsZWQnKVxyXG5cdFx0XHRcdGlmIGxpbmUuaW5jbHVkZXMoJyAwIGZhaWxlZCAnKVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdHBhc3NlZDogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdHBhc3NlZDogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRmYWlsZWQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdEZBSUxFRDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdHlpZWxkICcnXHJcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygnTGNvdiBjb3ZlcmFnZScpXHJcblx0XHRcdFx0eWllbGQgJ2NvdmVyYWdlIHJlcG9ydCBnZW5lcmF0ZWQnXHJcblx0XHRyZXR1cm4gbExpbmVzLmpvaW4oJ1xcbicpXHJcblxyXG5leHBvcnQgZG9Vbml0VGVzdCA6PSBuZXcgQ1VuaXRUZXN0ZXIoKVxyXG4iXX0=