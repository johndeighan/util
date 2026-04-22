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

import {undef, defined, notdefined} from 'base-utils'
import {croak, assert, getErrStr} from 'croak'
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
//		descFunc
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
	return success ? '' : (stderr || 'Unknown error')
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcdHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvdHlwZXNjcmlwdC5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSx1QkFBc0I7QUFDdEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3hELENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDOUQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsQ0FBQztBQUNoRCxDQUFDLGVBQWUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3RELENBQUMsNEJBQTRCLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQztBQUM3RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVk7QUFDckQsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPO0FBQzlDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3ZCLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFB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LENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQyxDQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQztFQUFDLENBQUE7QUFDOUMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxRO0NBQVEsQ0FBQTtBQUNqQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDcEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxVQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUE7QUFDQSxBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUEsQUFBQyxJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUNyQixBQUFBO0FBQ0EsQUFBQSxFQUFRLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDaEMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLEMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENB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QUMsSUFBSSxDO0NBQUMsQztBQUFBLENBQUE7QUFDMUIsQUFBQTtBQUNBLEFBQUEsQUFBQSxNQUFNLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN0QyIsIm5hbWVzIjpbXSwic291cmNlc0NvbnRlbnQiOlsiIyB0eXBlc2NyaXB0LmxpYi5jaXZldFxyXG5cclxuaW1wb3J0IHtleGlzdHMsIGV4aXN0c1N5bmN9IGZyb20gJ0BzdGQvZnMnXHJcbmltcG9ydCB7XHJcblx0U291cmNlRmlsZSwgTm9kZSwgU2NyaXB0VGFyZ2V0LCBTeW50YXhLaW5kLCBNb2R1bGVLaW5kLFxyXG5cdE5ld0xpbmVLaW5kLCBFbWl0SGludCwgQ29tcGlsZXJPcHRpb25zLCBNb2R1bGVSZXNvbHV0aW9uS2luZCxcclxuXHRjcmVhdGVTb3VyY2VGaWxlLCBjcmVhdGVQcmludGVyLCBjcmVhdGVQcm9ncmFtLFxyXG5cdHRyYW5zcGlsZU1vZHVsZSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLCBmb3JFYWNoQ2hpbGQsXHJcblx0ZmxhdHRlbkRpYWdub3N0aWNNZXNzYWdlVGV4dCwgZ2V0TGluZUFuZENoYXJhY3Rlck9mUG9zaXRpb24sXHJcblx0fSBmcm9tICducG0tdHlwZXNjcmlwdCdcclxuXHJcbmltcG9ydCB7dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWR9IGZyb20gJ2Jhc2UtdXRpbHMnXHJcbmltcG9ydCB7Y3JvYWssIGFzc2VydCwgZ2V0RXJyU3RyfSBmcm9tICdjcm9haydcclxuaW1wb3J0IHtcclxuXHRpbnRlZ2VyLCBoYXNoLCBoYXNob2YsXHJcblx0aXNIYXNoLCBpc1N0cmluZywgaXNFbXB0eSwgbm9uRW1wdHksIGlzTnVtYmVyLFxyXG5cdGlzRnVuY3Rpb24sIGZ1bmN0aW9uRGVmLCBpc0NsYXNzLCBjbGFzc0RlZixcclxuXHR9IGZyb20gJ2RhdGF0eXBlcydcclxuaW1wb3J0IHtcclxuXHRnZXRPcHRpb25zLCBzcGFjZXMsIG8sIHdvcmRzLCBoYXNLZXksXHJcblx0Q1N0cmluZ1NldE1hcCwga2V5cywgc2VwLCBhbGxMaW5lc0luQmxvY2ssXHJcblx0fSBmcm9tICdsbHV0aWxzJ1xyXG5pbXBvcnQge2YsIHdpdGhDb2xvcnMsIGRlY29sb3JpemV9IGZyb20gJ2Ytc3RyaW5ncydcclxuaW1wb3J0IHtkZWJ1Z2dpbmd9IGZyb20gJ2NtZC1hcmdzJ1xyXG5pbXBvcnQge1xyXG5cdGV4dHJhY3QsIFRQYXRoSXRlbSwgZ2V0U3RyaW5nLCBnZXROdW1iZXIsIGdldEFycmF5LFxyXG5cdH0gZnJvbSAnZXh0cmFjdCdcclxuaW1wb3J0IHtUQmxvY2tEZXNjLCBCbG9ja2lmeX0gZnJvbSAnaW5kZW50J1xyXG5pbXBvcnQge1xyXG5cdExPRywgREJHLCBFUlIsIExPR1ZBTFVFLCBJTkRFTlQsIFVOREVOVCwgREJHVkFMVUUsXHJcblx0cHVzaExvZ0xldmVsLCBwb3BMb2dMZXZlbCxcclxuXHR9IGZyb20gJ2xvZ2dlcidcclxuaW1wb3J0IHtcclxuXHRpc0ZpbGUsIHNsdXJwLCBiYXJmLCBiYXJmVGVtcEZpbGUsIGZpbGVFeHQsIHdpdGhFeHQsXHJcblx0cGF0aFN0ciwgbWtwYXRoLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxyXG5cdH0gZnJvbSAnZnN5cydcclxuaW1wb3J0IHtPTCwgdG9OaWNlLCBUTWFwRnVuYywgRFVNUH0gZnJvbSAndG8tbmljZSdcclxuaW1wb3J0IHtcclxuXHRleGVjQ21kLCBleGVjQ21kU3luYywgQ0ZpbGVIYW5kbGVyLCBUUHJvY1NwZWMsIFRFeGVjUmVzdWx0LFxyXG5cdHByb2NPbmVGaWxlLCBwcm9jRmlsZXMsXHJcblx0fSBmcm9tICdleGVjJ1xyXG5pbXBvcnQge2V4dHJhY3RTb3VyY2VNYXB9IGZyb20gJ3NvdXJjZS1tYXAnXHJcbmltcG9ydCB7V2Fsa2VyLCBUVmlzaXRLaW5kfSBmcm9tICd3YWxrZXInXHJcbmltcG9ydCB7Q01haW5TY29wZSwgQ1Njb3BlfSBmcm9tICdzY29wZSdcclxuaW1wb3J0IHtnZXROZWVkZWRJbXBvcnRTdG10c30gZnJvbSAnc3ltYm9scydcclxuaW1wb3J0IHtNQVB9IGZyb20gJ21hcHBlcidcclxuXHJcbmRlY29kZXIgOj0gbmV3IFRleHREZWNvZGVyIFwidXRmLThcIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBraW5kU3RyIDo9IChpOiBudW1iZXIpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIFN5bnRheEtpbmRbaV1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgdHMyYXN0IDo9IChcclxuXHRcdHRzQ29kZTogc3RyaW5nLFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogTm9kZSA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmdcclxuXHRcdH1cclxuXHR7ZmlsZU5hbWV9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZmlsZU5hbWU6ICd0ZW1wLnRzJ1xyXG5cdFx0fVxyXG5cclxuXHRbY29kZSwgaFNyY01hcF0gOj0gZXh0cmFjdFNvdXJjZU1hcCh0c0NvZGUpXHJcblx0aEFzdCA6PSBjcmVhdGVTb3VyY2VGaWxlIGZpbGVOYW1lLCBjb2RlLCBTY3JpcHRUYXJnZXQuTGF0ZXN0XHJcblx0cmV0dXJuIGhBc3RcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0MnRzIDo9IChub2RlOiBOb2RlKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAobm9kZS5raW5kID09IDMwOCksIFwiTm90IGEgU291cmNlRmlsZSBub2RlXCJcclxuXHRwcmludGVyIDo9IGNyZWF0ZVByaW50ZXIgbmV3TGluZTogTmV3TGluZUtpbmQuTGluZUZlZWRcclxuXHRyZXR1cm4gcHJpbnRlci5wcmludE5vZGUoRW1pdEhpbnQuVW5zcGVjaWZpZWQsIG5vZGUsIG5vZGUgYXMgU291cmNlRmlsZSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIHBhc3NlZCB0byB0b05pY2UoKSB0byBhZGQgYSBkZXNjcmlwdGlvbiB0byBzb21lIG5vZGVzXHJcblxyXG5leHBvcnQgZGVzY0Z1bmM6IFRNYXBGdW5jIDo9IChcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0aFBhcmVudDogdW5rbm93blxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAoa2V5ID09ICdraW5kJykgJiYgaXNOdW1iZXIodmFsdWUpID8gZlwiKCN7a2luZFN0cih2YWx1ZSl9KVwiIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0QXNTdHJpbmcgOj0gKFxyXG5cdFx0aEFzdDogb2JqZWN0LFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0bEluY2x1ZGU6IHN0cmluZ1tdP1xyXG5cdFx0fVxyXG5cdHtsSW5jbHVkZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRsSW5jbHVkZTogdW5kZWZcclxuXHRcdH1cclxuXHJcblx0cmV0dXJuIHRvTmljZSBoQXN0LCB7XHJcblx0XHRpZ25vcmVFbXB0eUtleXM6IHRydWVcclxuI1x0XHRkZXNjRnVuY1xyXG5cdFx0bEluY2x1ZGVcclxuXHRcdGxFeGNsdWRlOiB3b3JkcyhcIlwiXCJcclxuXHRcdFx0cG9zIGVuZCBpZCBmbGFncyBtb2RpZmllckZsYWdzQ2FjaGVcclxuXHRcdFx0dHJhbnNmb3JtRmxhZ3MgaGFzRXh0ZW5kZWRVbmljb2RlRXNjYXBlXHJcblx0XHRcdG51bWVyaWNMaXRlcmFsRmxhZ3Mgc2V0RXh0ZXJuYWxNb2R1bGVJbmRpY2F0b3JcclxuXHRcdFx0bGFuZ3VhZ2VWZXJzaW9uIGxhbmd1YWdlVmFyaWFudCBqc0RvY1BhcnNpbmdNb2RlXHJcblx0XHRcdGhhc05vRGVmYXVsdExpYlxyXG5cdFx0XHRcIlwiXCIpXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHR5cGVDaGVja1RzRmlsZSA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCBpc0ZpbGUocGF0aCksIFwiTm8gc3VjaCBmaWxlOiAje3BhdGh9XCJcclxuXHR7c3VjY2Vzcywgc3RkZXJyfSA6PSBleGVjQ21kU3luYyAnZGVubycsIFsnY2hlY2snLCBwYXRoXVxyXG5cdHJldHVybiBzdWNjZXNzID8gJycgOiAoc3RkZXJyIHx8ICdVbmtub3duIGVycm9yJylcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIFdlIG11c3QgcGxhY2UgdGhlIFR5cGVTY3JpcHQgZmlsZSBhdCB0aGUgcHJvamVjdCByb290XHJcbiMgICAgIHNvIHRoYXQgcGF0aHMgZ290dGVuIGZyb20gLnN5bWJvbHMgcmVzb2x2ZSBjb3JyZWN0bHlcclxuXHJcbmV4cG9ydCB0eXBlQ2hlY2tUc0NvZGUgOj0gKFxyXG5cdFx0dHNDb2RlOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZyA9PlxyXG5cclxuXHRwYXRoIDo9IFwiLi9fdHlwZWNoZWNrXy50c1wiXHJcblx0YmFyZiBwYXRoLCB0c0NvZGVcclxuXHRyZXR1cm4gdHlwZUNoZWNrVHNGaWxlIHBhdGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0SW1wb3J0Q29kZSA6PSAodHlwZVN0cjogc3RyaW5nKTogc3RyaW5nID0+XHJcblxyXG5cdERCRyBcIkNBTEwgZ2V0SW1wb3J0Q29kZSgpXCJcclxuXHRsU3ltYm9scyA6PSBnZXRTeW1ib2xzRnJvbVR5cGUgdHlwZVN0clxyXG5cdERCR1ZBTFVFICdsU3ltYm9scycsIGxTeW1ib2xzXHJcblx0aWYgbm9uRW1wdHkobFN5bWJvbHMpXHJcblx0XHRsU3RtdHMgOj0gZ2V0TmVlZGVkSW1wb3J0U3RtdHMgbFN5bWJvbHNcclxuXHRcdERCR1ZBTFVFICdsU3RtdHMnLCBsU3RtdHNcclxuXHRcdHJldHVybiBsU3RtdHMuam9pbiAnXFxuJ1xyXG5cdGVsc2VcclxuXHRcdHJldHVybiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRTeW1ib2xzRnJvbVR5cGUgOj0gKHR5cGVTdHI6IHN0cmluZyk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eKFtBLVphLXpdW0EtWmEtejAtOStdKikoPzpcXDwoW0EtWmEtel1bQS1aYS16MC05K10qKVxcPik/JC8pKVxyXG5cdFx0W18sIHR5cGUsIHN1YnR5cGVdIDo9IGxNYXRjaGVzXHJcblx0XHRyZXR1cm4gbm9uRW1wdHkoc3VidHlwZSkgPyBbdHlwZSwgc3VidHlwZV0gOiBbdHlwZV1cclxuXHRlbHNlIGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eXFwoXFwpXFxzKlxcPVxcPlxccyooW0EtWmEtel1bQS1aYS16MC05K10qKSQvKSlcclxuXHRcdHJldHVybiBbbE1hdGNoZXNbMV1dXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIFtdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuaERlZkNvbmZpZzogQ29tcGlsZXJPcHRpb25zIDo9IHtcclxuXHRcImFsbG93SnNcIjogZmFsc2VcclxuXHRcImFsbG93VW1kR2xvYmFsQWNjZXNzXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VucmVhY2hhYmxlQ29kZVwiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbnVzZWRMYWJlbHNcIjogZmFsc2VcclxuXHRcImFsd2F5c1N0cmljdFwiOiB0cnVlXHJcblx0XCJhc3N1bWVDaGFuZ2VzT25seUFmZmVjdERpcmVjdERlcGVuZGVuY2llc1wiOiBmYWxzZVxyXG5cdFwiY2hlY2tKc1wiOiBmYWxzZVxyXG5cdFwiY29tcG9zaXRlXCI6IGZhbHNlXHJcblx0XCJkZWNsYXJhdGlvblwiOiBmYWxzZVxyXG5cdFwiZGVjbGFyYXRpb25EaXJcIjogdW5kZWZpbmVkXHJcblx0XCJkZWNsYXJhdGlvbk1hcFwiOiBmYWxzZVxyXG5cdFwiZW1pdEJPTVwiOiBmYWxzZVxyXG5cdFwiZW1pdERlY2xhcmF0aW9uT25seVwiOiBmYWxzZVxyXG5cdFwiZXhhY3RPcHRpb25hbFByb3BlcnR5VHlwZXNcIjogZmFsc2VcclxuXHRcImV4cGVyaW1lbnRhbERlY29yYXRvcnNcIjogZmFsc2VcclxuXHRcImZvcmNlQ29uc2lzdGVudENhc2luZ0luRmlsZU5hbWVzXCI6IHRydWVcclxuXHRcImdlbmVyYXRlQ3B1UHJvZmlsZVwiOiBudWxsXHJcblx0XCJnZW5lcmF0ZVRyYWNlXCI6IG51bGxcclxuXHRcImlnbm9yZURlcHJlY2F0aW9uc1wiOiBcIjUuMFwiXHJcblx0XCJpbXBvcnRIZWxwZXJzXCI6IGZhbHNlXHJcblx0XCJpbmxpbmVTb3VyY2VNYXBcIjogZmFsc2VcclxuXHRcImlubGluZVNvdXJjZXNcIjogZmFsc2VcclxuXHRcImlzb2xhdGVkTW9kdWxlc1wiOiBmYWxzZVxyXG5cdCNcdFwianN4XCI6IFwicmVhY3QtanN4XCIsXHJcblx0I1x0XCJqc3hGYWN0b3J5XCI6IFwiUmVhY3QuY3JlYXRlRWxlbWVudFwiLFxyXG5cdCNcdFwianN4RnJhZ21lbnRGYWN0b3J5XCI6IFwiUmVhY3QuRnJhZ21lbnRcIixcclxuXHQjXHRcImpzeEltcG9ydFNvdXJjZVwiOiBcInJlYWN0XCIsXHJcblx0XCJsaWJcIjogW1xyXG5cdFx0XCJlc25leHRcIlxyXG5cdFx0XCJkb21cIlxyXG5cdFx0XCJkb20uaXRlcmFibGVcIlxyXG5cdF1cclxuXHRcIm1hcFJvb3RcIjogdW5kZWZpbmVkXHJcblx0XCJtYXhOb2RlTW9kdWxlSnNEZXB0aFwiOiAwXHJcblx0XCJtb2R1bGVcIjogTW9kdWxlS2luZC5FU05leHRcclxuXHRcIm1vZHVsZURldGVjdGlvblwiOiB1bmRlZmluZWRcclxuXHRcIm1vZHVsZVJlc29sdXRpb25cIjogTW9kdWxlUmVzb2x1dGlvbktpbmQuTm9kZU5leHRcclxuXHRcIm5ld0xpbmVcIjogTmV3TGluZUtpbmQuTGluZUZlZWRcclxuXHRcIm5vRW1pdFwiOiB0cnVlXHJcblx0XCJub0VtaXRIZWxwZXJzXCI6IGZhbHNlXHJcblx0XCJub0VtaXRPbkVycm9yXCI6IGZhbHNlXHJcblx0XCJub0Vycm9yVHJ1bmNhdGlvblwiOiBmYWxzZVxyXG5cdFwibm9GYWxsdGhyb3VnaENhc2VzSW5Td2l0Y2hcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdEFueVwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0T3ZlcnJpZGVcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdFJldHVybnNcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdFRoaXNcIjogdHJ1ZVxyXG5cdFwibm9Qcm9wZXJ0eUFjY2Vzc0Zyb21JbmRleFNpZ25hdHVyZVwiOiB0cnVlXHJcblx0XCJub1VuY2hlY2tlZEluZGV4ZWRBY2Nlc3NcIjogdHJ1ZVxyXG5cdFwibm9VbnVzZWRMb2NhbHNcIjogdHJ1ZVxyXG5cdFwibm9VbnVzZWRQYXJhbWV0ZXJzXCI6IHRydWVcclxuXHRcIm91dERpclwiOiB1bmRlZmluZWRcclxuXHRcIm91dEZpbGVcIjogdW5kZWZpbmVkXHJcblx0XCJwYXRoc1wiOiB7fVxyXG5cdFwicHJlc2VydmVDb25zdEVudW1zXCI6IGZhbHNlXHJcblx0XCJwcmVzZXJ2ZVN5bWxpbmtzXCI6IGZhbHNlXHJcblx0XCJwcmVzZXJ2ZVZhbHVlSW1wb3J0c1wiOiBmYWxzZVxyXG5cdFwicmVhY3ROYW1lc3BhY2VcIjogXCJSZWFjdFwiXHJcblx0XCJyZW1vdmVDb21tZW50c1wiOiBmYWxzZVxyXG5cdFwicmVzb2x2ZUpzb25Nb2R1bGVcIjogdHJ1ZVxyXG5cdFwicm9vdERpclwiOiB1bmRlZmluZWRcclxuXHRcInJvb3REaXJzXCI6IFtdXHJcblx0XCJza2lwRGVmYXVsdExpYkNoZWNrXCI6IGZhbHNlXHJcblx0XCJza2lwTGliQ2hlY2tcIjogZmFsc2VcclxuXHRcInNvdXJjZU1hcFwiOiBmYWxzZVxyXG5cdFwic291cmNlUm9vdFwiOiB1bmRlZmluZWRcclxuXHRcInN0cmljdFwiOiB0cnVlXHJcblx0XCJzdHJpY3RCaW5kQ2FsbEFwcGx5XCI6IHRydWVcclxuXHRcInN0cmljdEZ1bmN0aW9uVHlwZXNcIjogdHJ1ZVxyXG5cdFwic3RyaWN0TnVsbENoZWNrc1wiOiB0cnVlXHJcblx0XCJzdHJpY3RQcm9wZXJ0eUluaXRpYWxpemF0aW9uXCI6IHRydWVcclxuXHRcInN0cmlwSW50ZXJuYWxcIjogZmFsc2VcclxuXHRcInN1cHByZXNzRXhjZXNzUHJvcGVydHlFcnJvcnNcIjogZmFsc2VcclxuXHRcInN1cHByZXNzSW1wbGljaXRBbnlJbmRleEVycm9yc1wiOiBmYWxzZVxyXG5cdFwidGFyZ2V0XCI6IFNjcmlwdFRhcmdldC5FUzIwMjJcclxuXHRcInRyYWNlUmVzb2x1dGlvblwiOiBmYWxzZVxyXG5cdFwidHNCdWlsZEluZm9GaWxlXCI6IHVuZGVmaW5lZFxyXG5cdFwidHlwZVJvb3RzXCI6IFtdXHJcblx0XCJ1c2VEZWZpbmVGb3JDbGFzc0ZpZWxkc1wiOiB0cnVlXHJcblx0XCJ1c2VVbmtub3duSW5DYXRjaFZhcmlhYmxlc1wiOiB0cnVlXHJcbn1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRBc3RGaWx0ZXJGdW5jID0gKG5vZGU6IE5vZGUpID0+IGJvb2xlYW5cclxuXHJcbmV4cG9ydCBjbGFzcyBBc3RXYWxrZXIgZXh0ZW5kcyBXYWxrZXI8Tm9kZT5cclxuXHJcblx0ZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/XHJcblx0aE9wdGlvbnM6IGhhc2hcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKFxyXG5cdFx0XHRAZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/ID0gdW5kZWYsXHJcblx0XHRcdEBoT3B0aW9ucyA9IHt9XHJcblx0XHRcdClcclxuXHRcdHN1cGVyKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGRiZyhvcDogJ3B1c2gnIHwgJ3BvcCcsIG5vZGU6IE5vZGUpOiB2b2lkXHJcblxyXG5cdFx0cHJlZml4IDo9ICcgICAnXHJcblx0XHRraW5kIDo9IG5vZGUua2luZFxyXG5cdFx0Y29uc29sZS5sb2cgXCIje3ByZWZpeH0je29wLnRvVXBwZXJDYXNlKCl9OiAje2tpbmR9IFsje0BzdGFja0Rlc2MoKX1dXCJcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0c3RhY2tEZXNjKCk6IHN0cmluZ1xyXG5cclxuXHRcdHJlc3VsdHMgOj0gW11cclxuXHRcdGZvciBub2RlIG9mIEBsTm9kZVN0YWNrXHJcblx0XHRcdHJlc3VsdHMucHVzaCBub2RlLmtpbmQudG9TdHJpbmcoKVxyXG5cdFx0bFN0YWNrIDo9IHJlc3VsdHNcclxuXHRcdHJldHVybiBsU3RhY2suam9pbiAnLCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIHB1c2hOb2RlKG5vZGU6IE5vZGUpOiB2b2lkXHJcblxyXG5cdFx0c3VwZXIucHVzaE5vZGUgbm9kZVxyXG5cdFx0aWYgQGhPcHRpb25zLnRyYWNlXHJcblx0XHRcdEBkYmcgJ3B1c2gnLCBub2RlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIHBvcE5vZGUoKTogTm9kZT9cclxuXHJcblx0XHRub2RlIDo9IHN1cGVyLnBvcE5vZGUoKVxyXG5cdFx0aWYgQGhPcHRpb25zLnRyYWNlXHJcblx0XHRcdGlmIGRlZmluZWQobm9kZSlcclxuXHRcdFx0XHRAZGJnICdwb3AnLCBub2RlXHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBcIlNUQUNLIEVNUFRZXCJcclxuXHRcdHJldHVybiBub2RlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBpc05vZGUoeDogb2JqZWN0KTogeCBpcyBOb2RlXHJcblxyXG5cdFx0cmV0dXJuIE9iamVjdC5oYXNPd24geCwgJ2tpbmQnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBmaWx0ZXIobm9kZTogTm9kZSk6IGJvb2xlYW5cclxuXHJcblx0XHRyZXR1cm4gZGVmaW5lZChAZmlsdGVyRnVuYykgPyBAZmlsdGVyRnVuYyhub2RlKSA6IHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY2xhc3MgQ0FuYWx5c2lzXHJcblxyXG5cdHRyYWNlID0gZmFsc2VcclxuXHRtSW1wb3J0cyA9IG5ldyBDU3RyaW5nU2V0TWFwKClcclxuXHRtRXhwb3J0cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcclxuXHRzTWlzc2luZyA9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0bWFpblNjb3BlID0gbmV3IENNYWluU2NvcGUoKVxyXG5cdGN1clNjb3BlOiBDU2NvcGVcclxuXHRmaW5pc2hlZCA9IGZhbHNlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihAdHJhY2UgPSBmYWxzZSlcclxuXHJcblx0XHRAY3VyU2NvcGUgPSBAbWFpblNjb3BlXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRkZWZpbmUobmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBkZWZpbmUgI3tuYW1lfVwiXHJcblx0XHRAY3VyU2NvcGUuZGVmaW5lIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0dXNlKG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHQjIC0tLSB0aGlzIGNvbmRpdGlvbiBzaG91bGQgZmlsdGVyIGJ1aWx0LWluc1xyXG5cdFx0aWYgbm90IGhhc0tleShnbG9iYWxUaGlzLCBuYW1lKVxyXG5cdFx0XHRpZiBAdHJhY2VcclxuXHRcdFx0XHRMT0cgXCIgICB1c2UgI3tuYW1lfVwiXHJcblx0XHRcdGlmIG5vdCBAY3VyU2NvcGUuaXNEZWZpbmVkKG5hbWUpXHJcblx0XHRcdFx0aWYgQHRyYWNlXHJcblx0XHRcdFx0XHRMT0cgXCIgICBtaXNzaW5nICN7bmFtZX1cIlxyXG5cdFx0XHRcdEBzTWlzc2luZy5hZGQgbmFtZVxyXG5cdFx0XHRAY3VyU2NvcGUudXNlIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YWRkSW1wb3J0KGxpYjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGltcG9ydCAnI3tuYW1lfScgaW4gJyN7bGlifSdcIlxyXG5cdFx0QG1JbXBvcnRzLmFkZCBsaWIsIG5hbWVcclxuXHRcdEBkZWZpbmUgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhZGRFeHBvcnQobmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGV4cG9ydCAnI3tuYW1lfSc6ICcje3R5cGV9J1wiXHJcblx0XHRAbUV4cG9ydHMuc2V0IG5hbWUsIHR5cGVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0bmV3U2NvcGUobmFtZTogc3RyaW5nPywgbEFyZ3M6IHN0cmluZ1tdKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBuZXcgc2NvcGUgI3tuYW1lIHx8ICc8YW5vbj4nfSgje2xBcmdzLmpvaW4oJywnKX0pXCJcclxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGUubmV3U2NvcGUobmFtZSwgbEFyZ3MpXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGVuZFNjb3BlKCk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZW5kIHNjb3BlXCJcclxuXHRcdHNjb3BlIDo9IEBtYWluU2NvcGUuZW5kU2NvcGUgQGN1clNjb3BlXHJcblx0XHRpZiBkZWZpbmVkKHNjb3BlKVxyXG5cdFx0XHRAY3VyU2NvcGUgPSBzY29wZVxyXG5cdFx0ZWxzZVxyXG5cdFx0XHRAZmluaXNoZWQgPSB0cnVlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEltcG9ydHMoKTogVEJsb2NrRGVzY1xyXG5cclxuXHRcdGhJbXBvcnRzOiBoYXNob2Y8c3RyaW5nW10+IDo9IHt9XHJcblx0XHRmb3IgW2xpYiwgc05hbWVzXSBvZiBAbUltcG9ydHMuZW50cmllcygpXHJcblx0XHRcdGhJbXBvcnRzW2xpYl0gPSBBcnJheS5mcm9tKHNOYW1lcy52YWx1ZXMoKSlcclxuXHRcdHJldHVybiBoSW1wb3J0c1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0RXhwb3J0cygpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHJldHVybiBBcnJheS5mcm9tIEBtRXhwb3J0cy5rZXlzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldE1pc3NpbmcoKTogc3RyaW5nW11cclxuXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBAc01pc3NpbmcudmFsdWVzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEV4dHJhKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0d2Fsa2VyIDo9IG5ldyBXYWxrZXI8Q1Njb3BlPigpXHJcblx0XHR3YWxrZXIuaXNOb2RlID0gKHg6IHVua25vd24pID0+XHJcblx0XHRcdHJldHVybiAoeCBpbnN0YW5jZW9mIENTY29wZSlcclxuXHJcblx0XHQjIC0tLSBGaW5kIGFsbCBuYW1lcyB0aGF0IGFyZSBkZWZpbmVkLCBidXQgbmV2ZXIgdXNlZCBvciBleHBvcnRlZFxyXG5cdFx0c05hbWVzIDo9IG5ldyBTZXQ8c3RyaW5nPigpXHJcblx0XHRmb3Igc2NvcGUgb2Ygd2Fsa2VyLndhbGsoQG1haW5TY29wZSlcclxuXHRcdFx0Zm9yIG5hbWUgb2Ygc2NvcGUuYWxsRGVmaW5lZCgpXHJcblx0XHRcdFx0aWYgbm90IHNjb3BlLmlzVXNlZChuYW1lKSAmJiAhQG1FeHBvcnRzLmhhcyhuYW1lKVxyXG5cdFx0XHRcdFx0c05hbWVzLmFkZCBuYW1lXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBzTmFtZXMudmFsdWVzKClcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFzU3RyaW5nKHdpZHRoOiBpbnRlZ2VyID0gNjQpOiBzdHJpbmdcclxuXHJcblx0XHRoOiBUQmxvY2tEZXNjIDo9IHtcclxuXHRcdFx0SU1QT1JUUzogQGdldEltcG9ydHMoKVxyXG5cdFx0XHRFWFBPUlRTOiBAZ2V0RXhwb3J0cygpXHJcblx0XHRcdE1JU1NJTkc6IEBnZXRNaXNzaW5nKClcclxuXHRcdFx0RVhUUkE6IEBnZXRFeHRyYSgpXHJcblx0XHRcdH1cclxuXHJcblx0XHRpZiBpc0VtcHR5KGguSU1QT1JUUylcclxuXHRcdFx0ZGVsZXRlIGguSU1QT1JUU1xyXG5cdFx0aWYgaXNFbXB0eShoLkVYUE9SVFMpXHJcblx0XHRcdGRlbGV0ZSBoLkVYUE9SVFNcclxuXHRcdGlmIGlzRW1wdHkoaC5NSVNTSU5HKVxyXG5cdFx0XHRkZWxldGUgaC5NSVNTSU5HXHJcblx0XHRpZiBpc0VtcHR5KGguRVhUUkEpXHJcblx0XHRcdGRlbGV0ZSBoLkVYVFJBXHJcblx0XHRyZXR1cm4gQmxvY2tpZnkgaFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3NlcnRJc05vZGU6IChcclxuXHRcdHg6IHVua25vd25cclxuXHRcdCkgPT4gYXNzZXJ0cyB4IGlzIE5vZGUgOj0gKHg6IHVua25vd24pOiBhc3NlcnRzIHggaXMgTm9kZSA9PlxyXG5cclxuXHRhc3NlcnQgaGFzS2V5KHgsICdraW5kJyksIFwiTm90IGEgTm9kZTogI3t0eXBlb2YgeH1cIlxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXROb2RlIDo9ICh4OiB1bmtub3duLCBkc3BhdGg6IHN0cmluZyB8IFRQYXRoSXRlbVtdKTogTm9kZSA9PlxyXG5cclxuXHR2YWwgOj0gZXh0cmFjdCB4LCBkc3BhdGhcclxuXHRhc3NlcnRJc05vZGUgdmFsXHJcblx0cmV0dXJuIHZhbFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhbmFseXplVFMgOj0gKFxyXG5cdFx0dHNDb2RlOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBDQW5hbHlzaXMgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRmaWxlTmFtZTogc3RyaW5nP1xyXG5cdFx0ZHVtcEFTVDogYm9vbGVhblxyXG5cdFx0dHJhY2U6IGJvb2xlYW5cclxuXHRcdH1cclxuXHR7ZmlsZU5hbWUsIGR1bXBBU1QsIHRyYWNlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGZpbGVOYW1lOiB1bmRlZlxyXG5cdFx0ZHVtcEFTVDogZmFsc2VcclxuXHRcdHRyYWNlOiBmYWxzZVxyXG5cdFx0fVxyXG5cclxuXHRhbmFseXNpcyA6PSBuZXcgQ0FuYWx5c2lzKHRyYWNlKVxyXG5cdHdhbGtlciA6PSBuZXcgQXN0V2Fsa2VyKClcclxuXHJcblx0aEFzdCA6PSB0czJhc3QgdHNDb2RlXHJcblxyXG5cdGlmIGR1bXBBU1RcclxuXHRcdERVTVAgYXN0QXNTdHJpbmcoaEFzdCksICdBU1QnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjaGVja05vZGUgOj0gKFxyXG5cdFx0XHRub2RlOiB1bmtub3duLFxyXG5cdFx0XHRkc3BhdGg6IHN0cmluZz8gPSB1bmRlZlxyXG5cdFx0XHQpOiB2b2lkID0+XHJcblxyXG5cdFx0YXNzZXJ0SXNOb2RlIG5vZGVcclxuXHRcdGlmIGRlZmluZWQoZHNwYXRoKVxyXG5cdFx0XHRub2RlID0gZ2V0Tm9kZShub2RlLCBkc3BhdGgpXHJcblx0XHRcdGFzc2VydElzTm9kZSBub2RlXHJcblx0XHRpZiAobm9kZS5raW5kID09IDgwKSAgICMgLS0tIElkZW50aWZpZXJcclxuXHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5lc2NhcGVkVGV4dCdcclxuXHRcdFx0YW5hbHlzaXMudXNlIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0c3ltIDo9ICh2a2luZDogVFZpc2l0S2luZCk6IHN0cmluZyA9PlxyXG5cdFx0c3dpdGNoIHZraW5kXHJcblx0XHRcdHdoZW4gJ2VudGVyJyB0aGVuIHJldHVybiAnLT4nXHJcblx0XHRcdHdoZW4gJ2V4aXQnICB0aGVuIHJldHVybiAnPC0nXHJcblx0XHRcdGVsc2UgICAgICAgICAgICAgIHJldHVybiAnOjonXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgdmtpbmQgaXMgb25lIG9mICdlbnRlcicsICdleGl0JywgJ3JlZidcclxuXHJcblx0bFRyYWNlS2luZCA6PSBbODAsIDk1LCAxNzAsIDIxNCwgMjIwLCAyMjcsIDI1NCwgMjYxLCAyNjMsIDI3MywgMjgwLCAzMDhdXHJcblx0Zm9yIFt2a2luZCwgbm9kZV0gb2Ygd2Fsa2VyLndhbGtFeChoQXN0KVxyXG5cdFx0e2tpbmR9IDo9IG5vZGVcclxuXHRcdGlmIHRyYWNlICYmIGxUcmFjZUtpbmQuaW5jbHVkZXMoa2luZClcclxuXHRcdFx0TE9HIGZcIiN7c3ltKHZraW5kKX0gTk9ERSAje2tpbmR9OjMgKCN7a2luZFN0cihraW5kKX06e2N5YW59KVwiXHJcblxyXG5cdFx0aWYgKHZraW5kID09ICdleGl0JylcclxuXHRcdFx0c3dpdGNoIGtpbmRcclxuXHJcblx0XHRcdFx0d2hlbiAyMjAsIDI2MyAgICMgQXJyb3dGdW5jdGlvbiwgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0YW5hbHlzaXMuZW5kU2NvcGUoKVxyXG5cclxuXHRcdGVsc2UgaWYgKHZraW5kID09ICdlbnRlcicpXHJcblxyXG5cdFx0XHRzd2l0Y2gga2luZFxyXG5cclxuXHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdGRvXHJcblx0XHRcdFx0XHRcdGxQYXJtcyA6PSBBcnJheS5mcm9tIE1BUCBnZXRBcnJheShub2RlLCAnLnBhcmFtZXRlcnMnKSwgKHgpIC0+XHJcblx0XHRcdFx0XHRcdFx0eWllbGQgZ2V0U3RyaW5nKHgsICcubmFtZS5lc2NhcGVkVGV4dCcpXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIHVuZGVmLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyNjEgICAgIyBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHR0cnlcclxuXHRcdFx0XHRcdFx0dmFyTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgdmFyTmFtZVxyXG5cclxuXHRcdFx0XHR3aGVuIDI2MyAgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdCMgLS0tIGRvIGNyZWF0ZXMgYSBzY29wZSwgYSBsYSBhbiBJSUZFXHJcblx0XHRcdFx0XHRkb1xyXG5cdFx0XHRcdFx0XHRmdW5jTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cclxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cclxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0JylcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuZGVmaW5lIGZ1bmNOYW1lXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIGZ1bmNOYW1lLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyMjcgICAgIyBCaW5hcnlFeHByZXNzaW9uXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5sZWZ0J1xyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcucmlnaHQnXHJcblxyXG5cdFx0XHRcdHdoZW4gMjE0ICAgICMgQ2FsbEV4cHJlc3Npb25cclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmV4cHJlc3Npb24nXHJcblx0XHRcdFx0XHRmb3IgYXJnIG9mIGdldEFycmF5KG5vZGUsICcuYXJndW1lbnRzJylcclxuXHRcdFx0XHRcdFx0Y2hlY2tOb2RlIGFyZ1xyXG5cclxuXHRcdFx0XHR3aGVuIDI3MyAgICAjIEltcG9ydERlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRsaWIgOj0gZ2V0U3RyaW5nIG5vZGUsICcubW9kdWxlU3BlY2lmaWVyLnRleHQnXHJcblx0XHRcdFx0XHRmb3IgaCBvZiBnZXRBcnJheShub2RlLCAnLmltcG9ydENsYXVzZS5uYW1lZEJpbmRpbmdzLmVsZW1lbnRzJylcclxuXHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgaCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRJbXBvcnQgbGliLCBuYW1lXHJcblxyXG5cdFx0XHRcdHdoZW4gMjgwICAgICMgTmFtZWRFeHBvcnRzXHJcblx0XHRcdFx0XHRmb3IgZWxlbSBvZiBnZXRBcnJheShub2RlLCAnLmVsZW1lbnRzJylcclxuXHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgZWxlbSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3JlLWV4cG9ydCdcclxuXHJcblx0XHRcdFx0d2hlbiA5NSAgICAgIyBFeHBvcnRLZXl3b3JkXHJcblx0XHRcdFx0XHRwYXJlbnQgOj0gd2Fsa2VyLnBhcmVudCgpXHJcblx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKHBhcmVudCwgJy5raW5kJylcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjQ0ICAgICMgRmlyc3RTdGF0ZW1lbnRcclxuXHRcdFx0XHRcdFx0XHRmb3IgZGVjbCBvZiBnZXRBcnJheShwYXJlbnQsICcuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucycpXHJcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKGRlY2wsICcua2luZCcpXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBkZWNsLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0IyAtLS0gQ2hlY2sgaW5pdGlhbGl6ZXIgdG8gZmluZCB0aGUgdHlwZVxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGluaXRLaW5kIDo9IGdldE51bWJlciBkZWNsLCAnLmluaXRpYWxpemVyLmtpbmQnXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0c3dpdGNoIGluaXRLaW5kXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiAyMjAgICAgIyBBcnJvd0Z1bmN0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnZnVuY3Rpb24nXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiA5LCAyNjEgIyBGaXJzdExpdGVyYWxUb2tlbiwgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NvbnN0J1xyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndW5rbm93bidcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjYzICAgIyBGdW5jdGlvbkRlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdmdW5jdGlvbidcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjY0ICAgIyBDbGFzc0RlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdjbGFzcydcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjY2ICAgIyBUeXBlQWxpYXNEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndHlwZSdcclxuXHJcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdFx0Y3JvYWsgXCJVbmV4cGVjdGVkIHN1YnR5cGUgb2YgOTU6ICN7cGFyZW50LmtpbmR9XCJcclxuXHRyZXR1cm4gYW5hbHlzaXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5jbGFzcyBDVHlwZXNjcmlwdENvbXBpbGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvQ29tcGlsZVRTJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRMT0cgXCJkb0NvbXBpbGVUUyAnI3twYXRofSdcIlxyXG5cclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRmb3JjZTogYm9vbGVhblxyXG5cdFx0XHR9XHJcblx0XHR7Zm9yY2V9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRmb3JjZTogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRcdGFzc2VydCAoZmlsZUV4dChwYXRoKSA9PSAnLnRzJyksIFwiTm90IGEgdHlwZXNjcmlwdCBmaWxlOiAje3BhdGh9XCJcclxuXHRcdGpzUGF0aCA6PSB3aXRoRXh0IHBhdGgsICcuanMnXHJcblxyXG5cdFx0IyAtLS0gQ2hlY2sgaWYgYSBuZXdlciBjb21waWxlZCB2ZXJzaW9uIGFscmVhZHkgZXhpc3RzXHJcblx0XHRpZiAoXHJcblx0XHRcdFx0ICAgbm90IGZvcmNlXHJcblx0XHRcdFx0JiYgYXdhaXQgZXhpc3RzKGpzUGF0aClcclxuXHRcdFx0XHQmJiBuZXdlckRlc3RGaWxlRXhpc3RzKHBhdGgsIGpzUGF0aClcclxuXHRcdFx0XHQpXHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0c3VjY2VzczogdHJ1ZVxyXG5cdFx0XHRcdG5vdE5lZWRlZDogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHR0cnlcclxuXHRcdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xyXG5cdFx0XHRcdCdidW5kbGUnXHJcblx0XHRcdFx0Jy0tbWluaWZ5J1xyXG5cdFx0XHRcdHBhdGhcclxuXHRcdFx0XHRqc1BhdGhcclxuXHRcdFx0XHRdXHJcblx0XHRcdGlmIG5vdCBoUmVzdWx0LnN1Y2Nlc3NcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBAZ2V0T3V0cHV0KGhSZXN1bHQpXHJcblx0XHRcdFx0Y3JvYWsgXCJDb21waWxlIGZhaWxlZFwiXHJcblx0XHRcdHJldHVybiBoUmVzdWx0XHJcblxyXG5cdFx0Y2F0Y2ggZXJyXHJcblx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdExPRyBnZXRFcnJTdHIoZXJyKVxyXG5cdFx0XHRlcnJNc2cgOj0gXCJDT01QSUxFIEZBSUxFRDogI3twYXRoU3RyKHBhdGgpfSAtICN7Z2V0RXJyU3RyKGVycil9XCJcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZVxyXG5cdFx0XHRcdHN0ZGVycjogZXJyTXNnXHJcblx0XHRcdFx0fVxyXG5cclxuZXhwb3J0IGRvQ29tcGlsZVRTIDo9IG5ldyBDVHlwZXNjcmlwdENvbXBpbGVyKClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb21waWxlQWxsVFMgOj0gKFxyXG5cdFx0cm9vdCA9ICcuJ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVEV4ZWNSZXN1bHRbXSA9PlxyXG5cclxuXHQjIC0tLSB3aXRoICdxdWlldCcgb3B0aW9uLCBzdGlsbCByZXBvcnRzIGVycm9yc1xyXG5cdHBhdHRlcm4gOj0gbWtwYXRoKHJvb3QsICcqKi8qLmxpYi50cycpXHJcblx0TE9HIFwicGF0dGVybiA9ICcje3BhdHRlcm59J1wiXHJcblx0c3BlYzogVFByb2NTcGVjIDo9IFtkb0NvbXBpbGVUUywgW3BhdHRlcm5dXVxyXG5cdHJldHVybiBhd2FpdCBwcm9jRmlsZXMgc3BlYywge1xyXG5cdFx0Li4uaE9wdGlvbnNcclxuXHRcdHF1aWV0OiB0cnVlXHJcblx0XHRhYm9ydE9uRXJyb3I6IHRydWVcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5jbGFzcyBDVW5pdFRlc3RlciBleHRlbmRzIENGaWxlSGFuZGxlclxyXG5cclxuXHRnZXQgb3AoKVxyXG5cdFx0cmV0dXJuICdkb1VuaXRUZXN0J1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRhc3NlcnQgcGF0aC5lbmRzV2l0aCgnLnRlc3QudHMnKSwgXCJOb3QgYSB1bml0IHRlc3QgZmlsZVwiXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0XHRpbnNwZWN0OiBib29sZWFuXHJcblx0XHRcdGxpbmVOdW06IHN0cmluZz9cclxuXHRcdFx0fVxyXG5cdFx0e2NhcHR1cmUsIGluc3BlY3QsIGxpbmVOdW19IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRjYXB0dXJlOiB0cnVlXHJcblx0XHRcdGluc3BlY3Q6IGZhbHNlXHJcblx0XHRcdGxpbmVOdW06IHVuZGVmXHJcblx0XHRcdH1cclxuXHJcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdFx0J3Rlc3QnXHJcblx0XHRcdFx0Jy1BJ1xyXG5cdFx0XHRcdC4uLihpbnNwZWN0ID8gWyctLWluc3BlY3QtYnJrJ10gOiBbJy0tY292ZXJhZ2U9Li9jb3ZlcmFnZSddKVxyXG5cdFx0XHRcdC4uLihkZWZpbmVkKGxpbmVOdW0pID8gWyctLWZpbHRlcicsIFwiL15saW5lICN7bGluZU51bX0kL1wiXSA6IFtdKVxyXG5cdFx0XHRcdHBhdGhcclxuXHRcdFx0XHRdLCB7Y2FwdHVyZX1cclxuXHRcdHJldHVybiBoUmVzdWx0XHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBnZXRPdXRwdXQoaFJlc3VsdDogVEV4ZWNSZXN1bHQpOiBzdHJpbmdcclxuXHJcblx0XHR7c3Rkb3V0LCBzdGRlcnJ9IDo9IGhSZXN1bHRcclxuXHRcdG91dHB1dCA6PSBbc3Rkb3V0LCBzdGRlcnJdLmpvaW4oKVxyXG5cdFx0aWYgbm90IGhSZXN1bHQuc3VjY2VzcyB8fCBvdXRwdXQubWF0Y2goL2Nyb2FrfGVycm9yL2kpXHJcblx0XHRcdHJldHVybiBvdXRwdXRcclxuXHJcblx0XHRsTGluZXMgOj0gQXJyYXkuZnJvbSBNQVAgYWxsTGluZXNJbkJsb2NrKGRlY29sb3JpemUob3V0cHV0KSksIChsaW5lKSAtPlxyXG5cdFx0XHRpZiBsaW5lLnN0YXJ0c1dpdGgoJ3J1bm5pbmcnKVxyXG5cdFx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0XHR5aWVsZCAnJ1xyXG5cdFx0XHRlbHNlIGlmIGxpbmUuc3RhcnRzV2l0aCgnbGluZScpXHJcblx0XHRcdFx0aWYgbm90IGxpbmUuaW5jbHVkZXMoJyBvayAnKVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0RkFJTEVEOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRPSzogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygncGFzc2VkJykgJiYgbGluZS5pbmNsdWRlcygnZmFpbGVkJylcclxuXHRcdFx0XHRpZiBsaW5lLmluY2x1ZGVzKCcgMCBmYWlsZWQgJylcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0ZmFpbGVkOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHR5aWVsZCAnJ1xyXG5cdFx0XHRlbHNlIGlmIGxpbmUuaW5jbHVkZXMoJ0xjb3YgY292ZXJhZ2UnKVxyXG5cdFx0XHRcdHlpZWxkICdjb3ZlcmFnZSByZXBvcnQgZ2VuZXJhdGVkJ1xyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuZXhwb3J0IGRvVW5pdFRlc3QgOj0gbmV3IENVbml0VGVzdGVyKClcclxuIl19