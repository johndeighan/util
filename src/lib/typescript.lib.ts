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

import {croak, getErrStr} from 'croak'
import {
	undef, defined, notdefined, integer, hash, hashof,
	isHash, isString, isEmpty, nonEmpty, isNumber,
	assert, isFunction, functionDef, isClass, classDef,
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2xpYlxcdHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInNyYy9saWIvdHlwZXNjcmlwdC5saWIuY2l2ZXQiXSwibWFwcGluZ3MiOiI7QUFBQSx1QkFBc0I7QUFDdEIsQUFBQTtBQUNBLEssVyx5QjtBQUFBLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQzFDLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3hELENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDOUQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsQ0FBQztBQUNoRCxDQUFDLGVBQWUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsWUFBWSxDQUFDO0FBQ3RELENBQUMsNEJBQTRCLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQztBQUM3RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQ3hCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU87QUFDdEMsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDbkQsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDL0MsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FB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QixBQUFBLEVBQUUsSSxDQUFDLE1BQU0sQ0FBQSxBQUFDLElBQUksQ0FBQTtBQUNkLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsU0FBVSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBLENBQUE7QUFDNUMsQUFBQTtBQUNBLEFBQUEsRUFBRSxHQUFHLENBQUEsSSxDQUFDLEtBQUssQ0FBQSxDQUFBLENBQUE7QUFDWCxBQUFBLEdBQUcsR0FBRyxDQUFBLEFBQUMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEM7RUFBQSxDQUFBO0FBQ3ZDLEFBQUEsRUFBRSxJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUMxQixBQUFBLEVBQUUsTTtDQUFNLENBQUE7QUFDUixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFFBQVMsQ0FBQyxJQUFJLEMsQyxDQUFDLEFBQUMsTSxZLENBQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQy9DLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFBLEksQ0FBQyxLQUFLLENBQUEsQ0FBQSxDQUFBO0FBQ1gsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDO0VBQUEsQ0FBQTtBQUM3RCxBQUFBLEVBQUUsSSxDQUFDLFFBQVEsQyxDQUFFLENBQUMsSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzlDLEFBQUEsRUFBRSxNO0NBQU0sQ0FBQTtBQUNSLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFBLEksQ0FBQyxLQUFLLENBQUEsQ0FBQSxDQUFBO0FBQ1gsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLGNBQWMsQztFQUFBLENBQUE7QUFDckIsQUFBQSxFQUFPLE1BQUwsS0FBSyxDQUFDLENBQUUsQ0FBQyxJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUE7QUFDeEMsQUFBQSxFQUFFLEdBQUcsQ0FBQSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ25CLEFBQUEsR0FBRyxJLENBQUMsUUFBUSxDLENBQUUsQ0FBQyxLO0VBQUssQ0FBQTtBQUNwQixBQUFBLEVBQUUsSUFBSSxDQUFBLENBQUE7QUFDTixBQUFBLEdBQUcsSSxDQUFDLFFBQVEsQyxDQUFFLENBQUMsSTtFQUFJLENBQUE7QUFDbkIsQUFBQSxFQUFFLE07Q0FBTSxDQUFBO0FBQ1IsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUEsQ0FBQTtBQUN6QixBQUFBO0FBQ0EsQUFBQSxFQUE0QixNQUExQixRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQyxBQUFBLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUM5QyxBQUFBLEVBQUUsTUFBTSxDQUFDLFE7Q0FBUSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUN2QixBQUFBO0FBQ0EsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3JCLEFBQUE7QUFDQSxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNoQyxBQUFBLEVBQUUsTUFBTSxDQUFDLE1BQU0sQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUEsQ0FBQTtBQUNqQyxBQUFBLEdB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TyxDQUFBLENBQUEsQ0FBSyxDQUFDLE1BQU0sQ0FBQyxJO0dBQUksQ0FBQTtBQUNoQyxBQUFBLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQSxDQUFBLENBQU0sQ0FBQyxNQUFNLENBQUMsSTtHQUFJLENBQUE7QUFDaEMsQUFBQSxHQUFHLE9BQUksQ0FBQSxDQUFBLENBQUEsY0FBYyxNQUFNLENBQUMsSUFBSSxDQUFBLEM7RUFBQSxDO0NBQUEsQ0FBQTtBQUNoQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBLENBQUMseUNBQXdDO0FBQ3pDLEFBQUE7QUFDQSxBQUFBLENBQVcsTUFBVixVQUFVLENBQUMsQ0FBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ3pFLEFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxNQUFBLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3pDLEFBQUEsRUFBUSxNQUFOLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxDQUFDLElBQUk7QUFDaEIsQUFBQSxFQUFFLEdBQUcsQ0FBQSxLQUFLLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3ZDLEFBQUEsR0FBRyxHQUFHLENBQUEsQUFBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDO0VBQUEs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QSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3RDIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIHR5cGVzY3JpcHQubGliLmNpdmV0XG5cbmltcG9ydCB7ZXhpc3RzLCBleGlzdHNTeW5jfSBmcm9tICdAc3RkL2ZzJ1xuaW1wb3J0IHtcblx0U291cmNlRmlsZSwgTm9kZSwgU2NyaXB0VGFyZ2V0LCBTeW50YXhLaW5kLCBNb2R1bGVLaW5kLFxuXHROZXdMaW5lS2luZCwgRW1pdEhpbnQsIENvbXBpbGVyT3B0aW9ucywgTW9kdWxlUmVzb2x1dGlvbktpbmQsXG5cdGNyZWF0ZVNvdXJjZUZpbGUsIGNyZWF0ZVByaW50ZXIsIGNyZWF0ZVByb2dyYW0sXG5cdHRyYW5zcGlsZU1vZHVsZSwgZ2V0UHJlRW1pdERpYWdub3N0aWNzLCBmb3JFYWNoQ2hpbGQsXG5cdGZsYXR0ZW5EaWFnbm9zdGljTWVzc2FnZVRleHQsIGdldExpbmVBbmRDaGFyYWN0ZXJPZlBvc2l0aW9uLFxuXHR9IGZyb20gJ25wbS10eXBlc2NyaXB0J1xuXG5pbXBvcnQge2Nyb2FrLCBnZXRFcnJTdHJ9IGZyb20gJ2Nyb2FrJ1xuaW1wb3J0IHtcblx0dW5kZWYsIGRlZmluZWQsIG5vdGRlZmluZWQsIGludGVnZXIsIGhhc2gsIGhhc2hvZixcblx0aXNIYXNoLCBpc1N0cmluZywgaXNFbXB0eSwgbm9uRW1wdHksIGlzTnVtYmVyLFxuXHRhc3NlcnQsIGlzRnVuY3Rpb24sIGZ1bmN0aW9uRGVmLCBpc0NsYXNzLCBjbGFzc0RlZixcblx0fSBmcm9tICdkYXRhdHlwZXMnXG5pbXBvcnQge1xuXHRnZXRPcHRpb25zLCBzcGFjZXMsIG8sIHdvcmRzLCBoYXNLZXksXG5cdENTdHJpbmdTZXRNYXAsIGtleXMsIHNlcCwgYWxsTGluZXNJbkJsb2NrLFxuXHR9IGZyb20gJ2xsdXRpbHMnXG5pbXBvcnQge2YsIHdpdGhDb2xvcnMsIGRlY29sb3JpemV9IGZyb20gJ2Ytc3RyaW5ncydcbmltcG9ydCB7ZGVidWdnaW5nfSBmcm9tICdjbWQtYXJncydcbmltcG9ydCB7XG5cdGV4dHJhY3QsIFRQYXRoSXRlbSwgZ2V0U3RyaW5nLCBnZXROdW1iZXIsIGdldEFycmF5LFxuXHR9IGZyb20gJ2V4dHJhY3QnXG5pbXBvcnQge1RCbG9ja0Rlc2MsIEJsb2NraWZ5fSBmcm9tICdpbmRlbnQnXG5pbXBvcnQge1xuXHRMT0csIERCRywgRVJSLCBMT0dWQUxVRSwgSU5ERU5ULCBVTkRFTlQsIERCR1ZBTFVFLFxuXHRwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLFxuXHR9IGZyb20gJ2xvZ2dlcidcbmltcG9ydCB7XG5cdGlzRmlsZSwgc2x1cnAsIGJhcmYsIGJhcmZUZW1wRmlsZSwgZmlsZUV4dCwgd2l0aEV4dCxcblx0cGF0aFN0ciwgbWtwYXRoLCBuZXdlckRlc3RGaWxlRXhpc3RzLFxuXHR9IGZyb20gJ2ZzeXMnXG5pbXBvcnQge09MLCB0b05pY2UsIFRNYXBGdW5jLCBEVU1QfSBmcm9tICd0by1uaWNlJ1xuaW1wb3J0IHtcblx0ZXhlY0NtZCwgZXhlY0NtZFN5bmMsIENGaWxlSGFuZGxlciwgVFByb2NTcGVjLCBURXhlY1Jlc3VsdCxcblx0cHJvY09uZUZpbGUsIHByb2NGaWxlcyxcblx0fSBmcm9tICdleGVjJ1xuaW1wb3J0IHtleHRyYWN0U291cmNlTWFwfSBmcm9tICdzb3VyY2UtbWFwJ1xuaW1wb3J0IHtXYWxrZXIsIFRWaXNpdEtpbmR9IGZyb20gJ3dhbGtlcidcbmltcG9ydCB7Q01haW5TY29wZSwgQ1Njb3BlfSBmcm9tICdzY29wZSdcbmltcG9ydCB7Z2V0TmVlZGVkSW1wb3J0U3RtdHN9IGZyb20gJ3N5bWJvbHMnXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xuXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlciBcInV0Zi04XCJcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGtpbmRTdHIgOj0gKGk6IG51bWJlcik6IHN0cmluZyA9PlxuXG5cdHJldHVybiBTeW50YXhLaW5kW2ldXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0czJhc3QgOj0gKFxuXHRcdHRzQ29kZTogc3RyaW5nLFxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHQpOiBOb2RlID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xuXHRcdH1cblx0e2ZpbGVOYW1lfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRmaWxlTmFtZTogJ3RlbXAudHMnXG5cdFx0fVxuXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwKHRzQ29kZSlcblx0aEFzdCA6PSBjcmVhdGVTb3VyY2VGaWxlIGZpbGVOYW1lLCBjb2RlLCBTY3JpcHRUYXJnZXQuTGF0ZXN0XG5cdHJldHVybiBoQXN0XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhc3QydHMgOj0gKG5vZGU6IE5vZGUpOiBzdHJpbmcgPT5cblxuXHRhc3NlcnQgKG5vZGUua2luZCA9PSAzMDgpLCBcIk5vdCBhIFNvdXJjZUZpbGUgbm9kZVwiXG5cdHByaW50ZXIgOj0gY3JlYXRlUHJpbnRlciBuZXdMaW5lOiBOZXdMaW5lS2luZC5MaW5lRmVlZFxuXHRyZXR1cm4gcHJpbnRlci5wcmludE5vZGUoRW1pdEhpbnQuVW5zcGVjaWZpZWQsIG5vZGUsIG5vZGUgYXMgU291cmNlRmlsZSlcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgLS0tIHBhc3NlZCB0byB0b05pY2UoKSB0byBhZGQgYSBkZXNjcmlwdGlvbiB0byBzb21lIG5vZGVzXG5cbmV4cG9ydCBkZXNjRnVuYzogVE1hcEZ1bmMgOj0gKFxuXHRcdGtleTogc3RyaW5nXG5cdFx0dmFsdWU6IHVua25vd25cblx0XHRoUGFyZW50OiB1bmtub3duXG5cdFx0KTogc3RyaW5nID0+XG5cblx0cmV0dXJuIChrZXkgPT0gJ2tpbmQnKSAmJiBpc051bWJlcih2YWx1ZSkgPyBmXCIoI3traW5kU3RyKHZhbHVlKX0pXCIgOiAnJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYXN0QXNTdHJpbmcgOj0gKFxuXHRcdGhBc3Q6IG9iamVjdCxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogc3RyaW5nID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0bEluY2x1ZGU6IHN0cmluZ1tdP1xuXHRcdH1cblx0e2xJbmNsdWRlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcblx0XHRsSW5jbHVkZTogdW5kZWZcblx0XHR9XG5cblx0cmV0dXJuIHRvTmljZSBoQXN0LCB7XG5cdFx0aWdub3JlRW1wdHlLZXlzOiB0cnVlXG4jXHRcdGRlc2NGdW5jXG5cdFx0bEluY2x1ZGVcblx0XHRsRXhjbHVkZTogd29yZHMoXCJcIlwiXG5cdFx0XHRwb3MgZW5kIGlkIGZsYWdzIG1vZGlmaWVyRmxhZ3NDYWNoZVxuXHRcdFx0dHJhbnNmb3JtRmxhZ3MgaGFzRXh0ZW5kZWRVbmljb2RlRXNjYXBlXG5cdFx0XHRudW1lcmljTGl0ZXJhbEZsYWdzIHNldEV4dGVybmFsTW9kdWxlSW5kaWNhdG9yXG5cdFx0XHRsYW5ndWFnZVZlcnNpb24gbGFuZ3VhZ2VWYXJpYW50IGpzRG9jUGFyc2luZ01vZGVcblx0XHRcdGhhc05vRGVmYXVsdExpYlxuXHRcdFx0XCJcIlwiKVxuXHRcdH1cblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGVDaGVja1RzRmlsZSA6PSAocGF0aDogc3RyaW5nKTogc3RyaW5nID0+XG5cblx0YXNzZXJ0IGlzRmlsZShwYXRoKSwgXCJObyBzdWNoIGZpbGU6ICN7cGF0aH1cIlxuXHR7c3VjY2Vzcywgc3RkZXJyfSA6PSBleGVjQ21kU3luYyAnZGVubycsIFsnY2hlY2snLCBwYXRoXVxuXHRyZXR1cm4gc3VjY2VzcyA/ICcnIDogKHN0ZGVyciB8fCAnVW5rbm93biBlcnJvcicpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIC0tLSBXZSBtdXN0IHBsYWNlIHRoZSBUeXBlU2NyaXB0IGZpbGUgYXQgdGhlIHByb2plY3Qgcm9vdFxuIyAgICAgc28gdGhhdCBwYXRocyBnb3R0ZW4gZnJvbSAuc3ltYm9scyByZXNvbHZlIGNvcnJlY3RseVxuXG5leHBvcnQgdHlwZUNoZWNrVHNDb2RlIDo9IChcblx0XHR0c0NvZGU6IHN0cmluZ1xuXHRcdCk6IHN0cmluZyA9PlxuXG5cdHBhdGggOj0gXCIuL190eXBlY2hlY2tfLnRzXCJcblx0YmFyZiBwYXRoLCB0c0NvZGVcblx0cmV0dXJuIHR5cGVDaGVja1RzRmlsZSBwYXRoXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBnZXRJbXBvcnRDb2RlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cblxuXHREQkcgXCJDQUxMIGdldEltcG9ydENvZGUoKVwiXG5cdGxTeW1ib2xzIDo9IGdldFN5bWJvbHNGcm9tVHlwZSB0eXBlU3RyXG5cdERCR1ZBTFVFICdsU3ltYm9scycsIGxTeW1ib2xzXG5cdGlmIG5vbkVtcHR5KGxTeW1ib2xzKVxuXHRcdGxTdG10cyA6PSBnZXROZWVkZWRJbXBvcnRTdG10cyBsU3ltYm9sc1xuXHRcdERCR1ZBTFVFICdsU3RtdHMnLCBsU3RtdHNcblx0XHRyZXR1cm4gbFN0bXRzLmpvaW4gJ1xcbidcblx0ZWxzZVxuXHRcdHJldHVybiAnJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgZ2V0U3ltYm9sc0Zyb21UeXBlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxuXG5cdGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eKFtBLVphLXpdW0EtWmEtejAtOStdKikoPzpcXDwoW0EtWmEtel1bQS1aYS16MC05K10qKVxcPik/JC8pKVxuXHRcdFtfLCB0eXBlLCBzdWJ0eXBlXSA6PSBsTWF0Y2hlc1xuXHRcdHJldHVybiBub25FbXB0eShzdWJ0eXBlKSA/IFt0eXBlLCBzdWJ0eXBlXSA6IFt0eXBlXVxuXHRlbHNlIGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eXFwoXFwpXFxzKlxcPVxcPlxccyooW0EtWmEtel1bQS1aYS16MC05K10qKSQvKSlcblx0XHRyZXR1cm4gW2xNYXRjaGVzWzFdXVxuXHRlbHNlXG5cdFx0cmV0dXJuIFtdXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmhEZWZDb25maWc6IENvbXBpbGVyT3B0aW9ucyA6PSB7XG5cdFwiYWxsb3dKc1wiOiBmYWxzZVxuXHRcImFsbG93VW1kR2xvYmFsQWNjZXNzXCI6IGZhbHNlXG5cdFwiYWxsb3dVbnJlYWNoYWJsZUNvZGVcIjogZmFsc2Vcblx0XCJhbGxvd1VudXNlZExhYmVsc1wiOiBmYWxzZVxuXHRcImFsd2F5c1N0cmljdFwiOiB0cnVlXG5cdFwiYXNzdW1lQ2hhbmdlc09ubHlBZmZlY3REaXJlY3REZXBlbmRlbmNpZXNcIjogZmFsc2Vcblx0XCJjaGVja0pzXCI6IGZhbHNlXG5cdFwiY29tcG9zaXRlXCI6IGZhbHNlXG5cdFwiZGVjbGFyYXRpb25cIjogZmFsc2Vcblx0XCJkZWNsYXJhdGlvbkRpclwiOiB1bmRlZmluZWRcblx0XCJkZWNsYXJhdGlvbk1hcFwiOiBmYWxzZVxuXHRcImVtaXRCT01cIjogZmFsc2Vcblx0XCJlbWl0RGVjbGFyYXRpb25Pbmx5XCI6IGZhbHNlXG5cdFwiZXhhY3RPcHRpb25hbFByb3BlcnR5VHlwZXNcIjogZmFsc2Vcblx0XCJleHBlcmltZW50YWxEZWNvcmF0b3JzXCI6IGZhbHNlXG5cdFwiZm9yY2VDb25zaXN0ZW50Q2FzaW5nSW5GaWxlTmFtZXNcIjogdHJ1ZVxuXHRcImdlbmVyYXRlQ3B1UHJvZmlsZVwiOiBudWxsXG5cdFwiZ2VuZXJhdGVUcmFjZVwiOiBudWxsXG5cdFwiaWdub3JlRGVwcmVjYXRpb25zXCI6IFwiNS4wXCJcblx0XCJpbXBvcnRIZWxwZXJzXCI6IGZhbHNlXG5cdFwiaW5saW5lU291cmNlTWFwXCI6IGZhbHNlXG5cdFwiaW5saW5lU291cmNlc1wiOiBmYWxzZVxuXHRcImlzb2xhdGVkTW9kdWxlc1wiOiBmYWxzZVxuXHQjXHRcImpzeFwiOiBcInJlYWN0LWpzeFwiLFxuXHQjXHRcImpzeEZhY3RvcnlcIjogXCJSZWFjdC5jcmVhdGVFbGVtZW50XCIsXG5cdCNcdFwianN4RnJhZ21lbnRGYWN0b3J5XCI6IFwiUmVhY3QuRnJhZ21lbnRcIixcblx0I1x0XCJqc3hJbXBvcnRTb3VyY2VcIjogXCJyZWFjdFwiLFxuXHRcImxpYlwiOiBbXG5cdFx0XCJlc25leHRcIlxuXHRcdFwiZG9tXCJcblx0XHRcImRvbS5pdGVyYWJsZVwiXG5cdF1cblx0XCJtYXBSb290XCI6IHVuZGVmaW5lZFxuXHRcIm1heE5vZGVNb2R1bGVKc0RlcHRoXCI6IDBcblx0XCJtb2R1bGVcIjogTW9kdWxlS2luZC5FU05leHRcblx0XCJtb2R1bGVEZXRlY3Rpb25cIjogdW5kZWZpbmVkXG5cdFwibW9kdWxlUmVzb2x1dGlvblwiOiBNb2R1bGVSZXNvbHV0aW9uS2luZC5Ob2RlTmV4dFxuXHRcIm5ld0xpbmVcIjogTmV3TGluZUtpbmQuTGluZUZlZWRcblx0XCJub0VtaXRcIjogdHJ1ZVxuXHRcIm5vRW1pdEhlbHBlcnNcIjogZmFsc2Vcblx0XCJub0VtaXRPbkVycm9yXCI6IGZhbHNlXG5cdFwibm9FcnJvclRydW5jYXRpb25cIjogZmFsc2Vcblx0XCJub0ZhbGx0aHJvdWdoQ2FzZXNJblN3aXRjaFwiOiB0cnVlXG5cdFwibm9JbXBsaWNpdEFueVwiOiB0cnVlXG5cdFwibm9JbXBsaWNpdE92ZXJyaWRlXCI6IHRydWVcblx0XCJub0ltcGxpY2l0UmV0dXJuc1wiOiB0cnVlXG5cdFwibm9JbXBsaWNpdFRoaXNcIjogdHJ1ZVxuXHRcIm5vUHJvcGVydHlBY2Nlc3NGcm9tSW5kZXhTaWduYXR1cmVcIjogdHJ1ZVxuXHRcIm5vVW5jaGVja2VkSW5kZXhlZEFjY2Vzc1wiOiB0cnVlXG5cdFwibm9VbnVzZWRMb2NhbHNcIjogdHJ1ZVxuXHRcIm5vVW51c2VkUGFyYW1ldGVyc1wiOiB0cnVlXG5cdFwib3V0RGlyXCI6IHVuZGVmaW5lZFxuXHRcIm91dEZpbGVcIjogdW5kZWZpbmVkXG5cdFwicGF0aHNcIjoge31cblx0XCJwcmVzZXJ2ZUNvbnN0RW51bXNcIjogZmFsc2Vcblx0XCJwcmVzZXJ2ZVN5bWxpbmtzXCI6IGZhbHNlXG5cdFwicHJlc2VydmVWYWx1ZUltcG9ydHNcIjogZmFsc2Vcblx0XCJyZWFjdE5hbWVzcGFjZVwiOiBcIlJlYWN0XCJcblx0XCJyZW1vdmVDb21tZW50c1wiOiBmYWxzZVxuXHRcInJlc29sdmVKc29uTW9kdWxlXCI6IHRydWVcblx0XCJyb290RGlyXCI6IHVuZGVmaW5lZFxuXHRcInJvb3REaXJzXCI6IFtdXG5cdFwic2tpcERlZmF1bHRMaWJDaGVja1wiOiBmYWxzZVxuXHRcInNraXBMaWJDaGVja1wiOiBmYWxzZVxuXHRcInNvdXJjZU1hcFwiOiBmYWxzZVxuXHRcInNvdXJjZVJvb3RcIjogdW5kZWZpbmVkXG5cdFwic3RyaWN0XCI6IHRydWVcblx0XCJzdHJpY3RCaW5kQ2FsbEFwcGx5XCI6IHRydWVcblx0XCJzdHJpY3RGdW5jdGlvblR5cGVzXCI6IHRydWVcblx0XCJzdHJpY3ROdWxsQ2hlY2tzXCI6IHRydWVcblx0XCJzdHJpY3RQcm9wZXJ0eUluaXRpYWxpemF0aW9uXCI6IHRydWVcblx0XCJzdHJpcEludGVybmFsXCI6IGZhbHNlXG5cdFwic3VwcHJlc3NFeGNlc3NQcm9wZXJ0eUVycm9yc1wiOiBmYWxzZVxuXHRcInN1cHByZXNzSW1wbGljaXRBbnlJbmRleEVycm9yc1wiOiBmYWxzZVxuXHRcInRhcmdldFwiOiBTY3JpcHRUYXJnZXQuRVMyMDIyXG5cdFwidHJhY2VSZXNvbHV0aW9uXCI6IGZhbHNlXG5cdFwidHNCdWlsZEluZm9GaWxlXCI6IHVuZGVmaW5lZFxuXHRcInR5cGVSb290c1wiOiBbXVxuXHRcInVzZURlZmluZUZvckNsYXNzRmllbGRzXCI6IHRydWVcblx0XCJ1c2VVbmtub3duSW5DYXRjaFZhcmlhYmxlc1wiOiB0cnVlXG59XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnR5cGUgVEFzdEZpbHRlckZ1bmMgPSAobm9kZTogTm9kZSkgPT4gYm9vbGVhblxuXG5leHBvcnQgY2xhc3MgQXN0V2Fsa2VyIGV4dGVuZHMgV2Fsa2VyPE5vZGU+XG5cblx0ZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/XG5cdGhPcHRpb25zOiBoYXNoXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0XHRAZmlsdGVyRnVuYzogVEFzdEZpbHRlckZ1bmM/ID0gdW5kZWYsXG5cdFx0XHRAaE9wdGlvbnMgPSB7fVxuXHRcdFx0KVxuXHRcdHN1cGVyKClcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRkYmcob3A6ICdwdXNoJyB8ICdwb3AnLCBub2RlOiBOb2RlKTogdm9pZFxuXG5cdFx0cHJlZml4IDo9ICcgICAnXG5cdFx0a2luZCA6PSBub2RlLmtpbmRcblx0XHRjb25zb2xlLmxvZyBcIiN7cHJlZml4fSN7b3AudG9VcHBlckNhc2UoKX06ICN7a2luZH0gWyN7QHN0YWNrRGVzYygpfV1cIlxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdHN0YWNrRGVzYygpOiBzdHJpbmdcblxuXHRcdHJlc3VsdHMgOj0gW11cblx0XHRmb3Igbm9kZSBvZiBAbE5vZGVTdGFja1xuXHRcdFx0cmVzdWx0cy5wdXNoIG5vZGUua2luZC50b1N0cmluZygpXG5cdFx0bFN0YWNrIDo9IHJlc3VsdHNcblx0XHRyZXR1cm4gbFN0YWNrLmpvaW4gJywnXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0b3ZlcnJpZGUgcHVzaE5vZGUobm9kZTogTm9kZSk6IHZvaWRcblxuXHRcdHN1cGVyLnB1c2hOb2RlIG5vZGVcblx0XHRpZiBAaE9wdGlvbnMudHJhY2Vcblx0XHRcdEBkYmcgJ3B1c2gnLCBub2RlXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0b3ZlcnJpZGUgcG9wTm9kZSgpOiBOb2RlP1xuXG5cdFx0bm9kZSA6PSBzdXBlci5wb3BOb2RlKClcblx0XHRpZiBAaE9wdGlvbnMudHJhY2Vcblx0XHRcdGlmIGRlZmluZWQobm9kZSlcblx0XHRcdFx0QGRiZyAncG9wJywgbm9kZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRjb25zb2xlLmxvZyBcIlNUQUNLIEVNUFRZXCJcblx0XHRyZXR1cm4gbm9kZVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGlzTm9kZSh4OiBvYmplY3QpOiB4IGlzIE5vZGVcblxuXHRcdHJldHVybiBPYmplY3QuaGFzT3duIHgsICdraW5kJ1xuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGZpbHRlcihub2RlOiBOb2RlKTogYm9vbGVhblxuXG5cdFx0cmV0dXJuIGRlZmluZWQoQGZpbHRlckZ1bmMpID8gQGZpbHRlckZ1bmMobm9kZSkgOiB0cnVlXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBDQW5hbHlzaXNcblxuXHR0cmFjZSA9IGZhbHNlXG5cdG1JbXBvcnRzID0gbmV3IENTdHJpbmdTZXRNYXAoKVxuXHRtRXhwb3J0cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcblx0c01pc3NpbmcgPSBuZXcgU2V0PHN0cmluZz4oKVxuXHRtYWluU2NvcGUgPSBuZXcgQ01haW5TY29wZSgpXG5cdGN1clNjb3BlOiBDU2NvcGVcblx0ZmluaXNoZWQgPSBmYWxzZVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGNvbnN0cnVjdG9yKEB0cmFjZSA9IGZhbHNlKVxuXG5cdFx0QGN1clNjb3BlID0gQG1haW5TY29wZVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGRlZmluZShuYW1lOiBzdHJpbmcpOiB2b2lkXG5cblx0XHRpZiBAdHJhY2Vcblx0XHRcdExPRyBcIiAgIGRlZmluZSAje25hbWV9XCJcblx0XHRAY3VyU2NvcGUuZGVmaW5lIG5hbWVcblx0XHRyZXR1cm5cblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHR1c2UobmFtZTogc3RyaW5nKTogdm9pZFxuXG5cdFx0IyAtLS0gdGhpcyBjb25kaXRpb24gc2hvdWxkIGZpbHRlciBidWlsdC1pbnNcblx0XHRpZiBub3QgaGFzS2V5KGdsb2JhbFRoaXMsIG5hbWUpXG5cdFx0XHRpZiBAdHJhY2Vcblx0XHRcdFx0TE9HIFwiICAgdXNlICN7bmFtZX1cIlxuXHRcdFx0aWYgbm90IEBjdXJTY29wZS5pc0RlZmluZWQobmFtZSlcblx0XHRcdFx0aWYgQHRyYWNlXG5cdFx0XHRcdFx0TE9HIFwiICAgbWlzc2luZyAje25hbWV9XCJcblx0XHRcdFx0QHNNaXNzaW5nLmFkZCBuYW1lXG5cdFx0XHRAY3VyU2NvcGUudXNlIG5hbWVcblx0XHRyZXR1cm5cblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRhZGRJbXBvcnQobGliOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWRcblxuXHRcdGlmIEB0cmFjZVxuXHRcdFx0TE9HIFwiICAgaW1wb3J0ICcje25hbWV9JyBpbiAnI3tsaWJ9J1wiXG5cdFx0QG1JbXBvcnRzLmFkZCBsaWIsIG5hbWVcblx0XHRAZGVmaW5lIG5hbWVcblx0XHRyZXR1cm5cblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRhZGRFeHBvcnQobmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcpOiB2b2lkXG5cblx0XHRpZiBAdHJhY2Vcblx0XHRcdExPRyBcIiAgIGV4cG9ydCAnI3tuYW1lfSc6ICcje3R5cGV9J1wiXG5cdFx0QG1FeHBvcnRzLnNldCBuYW1lLCB0eXBlXG5cdFx0cmV0dXJuXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0bmV3U2NvcGUobmFtZTogc3RyaW5nPywgbEFyZ3M6IHN0cmluZ1tdKTogdm9pZFxuXG5cdFx0aWYgQHRyYWNlXG5cdFx0XHRMT0cgXCIgICBuZXcgc2NvcGUgI3tuYW1lIHx8ICc8YW5vbj4nfSgje2xBcmdzLmpvaW4oJywnKX0pXCJcblx0XHRAY3VyU2NvcGUgPSBAbWFpblNjb3BlLm5ld1Njb3BlKG5hbWUsIGxBcmdzKVxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGVuZFNjb3BlKCk6IHZvaWRcblxuXHRcdGlmIEB0cmFjZVxuXHRcdFx0TE9HIFwiICAgZW5kIHNjb3BlXCJcblx0XHRzY29wZSA6PSBAbWFpblNjb3BlLmVuZFNjb3BlIEBjdXJTY29wZVxuXHRcdGlmIGRlZmluZWQoc2NvcGUpXG5cdFx0XHRAY3VyU2NvcGUgPSBzY29wZVxuXHRcdGVsc2Vcblx0XHRcdEBmaW5pc2hlZCA9IHRydWVcblx0XHRyZXR1cm5cblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Z2V0SW1wb3J0cygpOiBUQmxvY2tEZXNjXG5cblx0XHRoSW1wb3J0czogaGFzaG9mPHN0cmluZ1tdPiA6PSB7fVxuXHRcdGZvciBbbGliLCBzTmFtZXNdIG9mIEBtSW1wb3J0cy5lbnRyaWVzKClcblx0XHRcdGhJbXBvcnRzW2xpYl0gPSBBcnJheS5mcm9tKHNOYW1lcy52YWx1ZXMoKSlcblx0XHRyZXR1cm4gaEltcG9ydHNcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRnZXRFeHBvcnRzKCk6IHN0cmluZ1tdXG5cblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBAbUV4cG9ydHMua2V5cygpXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Z2V0TWlzc2luZygpOiBzdHJpbmdbXVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQHNNaXNzaW5nLnZhbHVlcygpXG5cblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXG5cblx0Z2V0RXh0cmEoKTogc3RyaW5nW11cblxuXHRcdHdhbGtlciA6PSBuZXcgV2Fsa2VyPENTY29wZT4oKVxuXHRcdHdhbGtlci5pc05vZGUgPSAoeDogdW5rbm93bikgPT5cblx0XHRcdHJldHVybiAoeCBpbnN0YW5jZW9mIENTY29wZSlcblxuXHRcdCMgLS0tIEZpbmQgYWxsIG5hbWVzIHRoYXQgYXJlIGRlZmluZWQsIGJ1dCBuZXZlciB1c2VkIG9yIGV4cG9ydGVkXG5cdFx0c05hbWVzIDo9IG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0Zm9yIHNjb3BlIG9mIHdhbGtlci53YWxrKEBtYWluU2NvcGUpXG5cdFx0XHRmb3IgbmFtZSBvZiBzY29wZS5hbGxEZWZpbmVkKClcblx0XHRcdFx0aWYgbm90IHNjb3BlLmlzVXNlZChuYW1lKSAmJiAhQG1FeHBvcnRzLmhhcyhuYW1lKVxuXHRcdFx0XHRcdHNOYW1lcy5hZGQgbmFtZVxuXHRcdHJldHVybiBBcnJheS5mcm9tIHNOYW1lcy52YWx1ZXMoKVxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdGFzU3RyaW5nKHdpZHRoOiBpbnRlZ2VyID0gNjQpOiBzdHJpbmdcblxuXHRcdGg6IFRCbG9ja0Rlc2MgOj0ge1xuXHRcdFx0SU1QT1JUUzogQGdldEltcG9ydHMoKVxuXHRcdFx0RVhQT1JUUzogQGdldEV4cG9ydHMoKVxuXHRcdFx0TUlTU0lORzogQGdldE1pc3NpbmcoKVxuXHRcdFx0RVhUUkE6IEBnZXRFeHRyYSgpXG5cdFx0XHR9XG5cblx0XHRpZiBpc0VtcHR5KGguSU1QT1JUUylcblx0XHRcdGRlbGV0ZSBoLklNUE9SVFNcblx0XHRpZiBpc0VtcHR5KGguRVhQT1JUUylcblx0XHRcdGRlbGV0ZSBoLkVYUE9SVFNcblx0XHRpZiBpc0VtcHR5KGguTUlTU0lORylcblx0XHRcdGRlbGV0ZSBoLk1JU1NJTkdcblx0XHRpZiBpc0VtcHR5KGguRVhUUkEpXG5cdFx0XHRkZWxldGUgaC5FWFRSQVxuXHRcdHJldHVybiBCbG9ja2lmeSBoXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhc3NlcnRJc05vZGU6IChcblx0XHR4OiB1bmtub3duXG5cdFx0KSA9PiBhc3NlcnRzIHggaXMgTm9kZSA6PSAoeDogdW5rbm93bik6IGFzc2VydHMgeCBpcyBOb2RlID0+XG5cblx0YXNzZXJ0IGhhc0tleSh4LCAna2luZCcpLCBcIk5vdCBhIE5vZGU6ICN7dHlwZW9mIHh9XCJcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGdldE5vZGUgOj0gKHg6IHVua25vd24sIGRzcGF0aDogc3RyaW5nIHwgVFBhdGhJdGVtW10pOiBOb2RlID0+XG5cblx0dmFsIDo9IGV4dHJhY3QgeCwgZHNwYXRoXG5cdGFzc2VydElzTm9kZSB2YWxcblx0cmV0dXJuIHZhbFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYW5hbHl6ZVRTIDo9IChcblx0XHR0c0NvZGU6IHN0cmluZyxcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XG5cdFx0KTogQ0FuYWx5c2lzID0+XG5cblx0dHlwZSBvcHQgPSB7XG5cdFx0ZmlsZU5hbWU6IHN0cmluZz9cblx0XHRkdW1wQVNUOiBib29sZWFuXG5cdFx0dHJhY2U6IGJvb2xlYW5cblx0XHR9XG5cdHtmaWxlTmFtZSwgZHVtcEFTVCwgdHJhY2V9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdGZpbGVOYW1lOiB1bmRlZlxuXHRcdGR1bXBBU1Q6IGZhbHNlXG5cdFx0dHJhY2U6IGZhbHNlXG5cdFx0fVxuXG5cdGFuYWx5c2lzIDo9IG5ldyBDQW5hbHlzaXModHJhY2UpXG5cdHdhbGtlciA6PSBuZXcgQXN0V2Fsa2VyKClcblxuXHRoQXN0IDo9IHRzMmFzdCB0c0NvZGVcblxuXHRpZiBkdW1wQVNUXG5cdFx0RFVNUCBhc3RBc1N0cmluZyhoQXN0KSwgJ0FTVCdcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblxuXHRjaGVja05vZGUgOj0gKFxuXHRcdFx0bm9kZTogdW5rbm93bixcblx0XHRcdGRzcGF0aDogc3RyaW5nPyA9IHVuZGVmXG5cdFx0XHQpOiB2b2lkID0+XG5cblx0XHRhc3NlcnRJc05vZGUgbm9kZVxuXHRcdGlmIGRlZmluZWQoZHNwYXRoKVxuXHRcdFx0bm9kZSA9IGdldE5vZGUobm9kZSwgZHNwYXRoKVxuXHRcdFx0YXNzZXJ0SXNOb2RlIG5vZGVcblx0XHRpZiAobm9kZS5raW5kID09IDgwKSAgICMgLS0tIElkZW50aWZpZXJcblx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcuZXNjYXBlZFRleHQnXG5cdFx0XHRhbmFseXNpcy51c2UgbmFtZVxuXHRcdHJldHVyblxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdHN5bSA6PSAodmtpbmQ6IFRWaXNpdEtpbmQpOiBzdHJpbmcgPT5cblx0XHRzd2l0Y2ggdmtpbmRcblx0XHRcdHdoZW4gJ2VudGVyJyB0aGVuIHJldHVybiAnLT4nXG5cdFx0XHR3aGVuICdleGl0JyAgdGhlbiByZXR1cm4gJzwtJ1xuXHRcdFx0ZWxzZSAgICAgICAgICAgICAgcmV0dXJuICc6OidcblxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cblx0IyB2a2luZCBpcyBvbmUgb2YgJ2VudGVyJywgJ2V4aXQnLCAncmVmJ1xuXG5cdGxUcmFjZUtpbmQgOj0gWzgwLCA5NSwgMTcwLCAyMTQsIDIyMCwgMjI3LCAyNTQsIDI2MSwgMjYzLCAyNzMsIDI4MCwgMzA4XVxuXHRmb3IgW3ZraW5kLCBub2RlXSBvZiB3YWxrZXIud2Fsa0V4KGhBc3QpXG5cdFx0e2tpbmR9IDo9IG5vZGVcblx0XHRpZiB0cmFjZSAmJiBsVHJhY2VLaW5kLmluY2x1ZGVzKGtpbmQpXG5cdFx0XHRMT0cgZlwiI3tzeW0odmtpbmQpfSBOT0RFICN7a2luZH06MyAoI3traW5kU3RyKGtpbmQpfTp7Y3lhbn0pXCJcblxuXHRcdGlmICh2a2luZCA9PSAnZXhpdCcpXG5cdFx0XHRzd2l0Y2gga2luZFxuXG5cdFx0XHRcdHdoZW4gMjIwLCAyNjMgICAjIEFycm93RnVuY3Rpb24sIEZ1bmN0aW9uRGVjbGFyYXRpb25cblx0XHRcdFx0XHRhbmFseXNpcy5lbmRTY29wZSgpXG5cblx0XHRlbHNlIGlmICh2a2luZCA9PSAnZW50ZXInKVxuXG5cdFx0XHRzd2l0Y2gga2luZFxuXG5cdFx0XHRcdHdoZW4gMjIwICAgICMgQXJyb3dGdW5jdGlvblxuXHRcdFx0XHRcdGRvXG5cdFx0XHRcdFx0XHRsUGFybXMgOj0gQXJyYXkuZnJvbSBNQVAgZ2V0QXJyYXkobm9kZSwgJy5wYXJhbWV0ZXJzJyksICh4KSAtPlxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0Jylcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIHVuZGVmLCBsUGFybXNcblxuXHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cblx0XHRcdFx0XHR0cnlcblx0XHRcdFx0XHRcdHZhck5hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcubmFtZS5lc2NhcGVkVGV4dCdcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmRlZmluZSB2YXJOYW1lXG5cblx0XHRcdFx0d2hlbiAyNjMgICAgIyBGdW5jdGlvbkRlY2xhcmF0aW9uXG5cdFx0XHRcdFx0IyAtLS0gZG8gY3JlYXRlcyBhIHNjb3BlLCBhIGxhIGFuIElJRkVcblx0XHRcdFx0XHRkb1xuXHRcdFx0XHRcdFx0ZnVuY05hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcubmFtZS5lc2NhcGVkVGV4dCdcblxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cblx0XHRcdFx0XHRcdFx0eWllbGQgZ2V0U3RyaW5nKHgsICcubmFtZS5lc2NhcGVkVGV4dCcpXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgZnVuY05hbWVcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIGZ1bmNOYW1lLCBsUGFybXNcblxuXHRcdFx0XHR3aGVuIDIyNyAgICAjIEJpbmFyeUV4cHJlc3Npb25cblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5sZWZ0J1xuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLnJpZ2h0J1xuXG5cdFx0XHRcdHdoZW4gMjE0ICAgICMgQ2FsbEV4cHJlc3Npb25cblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5leHByZXNzaW9uJ1xuXHRcdFx0XHRcdGZvciBhcmcgb2YgZ2V0QXJyYXkobm9kZSwgJy5hcmd1bWVudHMnKVxuXHRcdFx0XHRcdFx0Y2hlY2tOb2RlIGFyZ1xuXG5cdFx0XHRcdHdoZW4gMjczICAgICMgSW1wb3J0RGVjbGFyYXRpb25cblx0XHRcdFx0XHRsaWIgOj0gZ2V0U3RyaW5nIG5vZGUsICcubW9kdWxlU3BlY2lmaWVyLnRleHQnXG5cdFx0XHRcdFx0Zm9yIGggb2YgZ2V0QXJyYXkobm9kZSwgJy5pbXBvcnRDbGF1c2UubmFtZWRCaW5kaW5ncy5lbGVtZW50cycpXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBoLCAnLm5hbWUuZXNjYXBlZFRleHQnXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRJbXBvcnQgbGliLCBuYW1lXG5cblx0XHRcdFx0d2hlbiAyODAgICAgIyBOYW1lZEV4cG9ydHNcblx0XHRcdFx0XHRmb3IgZWxlbSBvZiBnZXRBcnJheShub2RlLCAnLmVsZW1lbnRzJylcblx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGVsZW0sICcubmFtZS5lc2NhcGVkVGV4dCdcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAncmUtZXhwb3J0J1xuXG5cdFx0XHRcdHdoZW4gOTUgICAgICMgRXhwb3J0S2V5d29yZFxuXHRcdFx0XHRcdHBhcmVudCA6PSB3YWxrZXIucGFyZW50KClcblx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKHBhcmVudCwgJy5raW5kJylcblxuXHRcdFx0XHRcdFx0d2hlbiAyNDQgICAgIyBGaXJzdFN0YXRlbWVudFxuXHRcdFx0XHRcdFx0XHRmb3IgZGVjbCBvZiBnZXRBcnJheShwYXJlbnQsICcuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucycpXG5cdFx0XHRcdFx0XHRcdFx0c3dpdGNoIGdldE51bWJlcihkZWNsLCAnLmtpbmQnKVxuXG5cdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgZGVjbCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQjIC0tLSBDaGVjayBpbml0aWFsaXplciB0byBmaW5kIHRoZSB0eXBlXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGluaXRLaW5kIDo9IGdldE51bWJlciBkZWNsLCAnLmluaXRpYWxpemVyLmtpbmQnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHN3aXRjaCBpbml0S2luZFxuXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiAyMjAgICAgIyBBcnJvd0Z1bmN0aW9uXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiA5LCAyNjEgIyBGaXJzdExpdGVyYWxUb2tlbiwgVmFyaWFibGVEZWNsYXJhdGlvblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdjb25zdCdcblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3Vua25vd24nXG5cblx0XHRcdFx0XHRcdHdoZW4gMjYzICAgIyBGdW5jdGlvbkRlY2xhcmF0aW9uXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xuXG5cdFx0XHRcdFx0XHR3aGVuIDI2NCAgICMgQ2xhc3NEZWNsYXJhdGlvblxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdjbGFzcydcblxuXHRcdFx0XHRcdFx0d2hlbiAyNjYgICAjIFR5cGVBbGlhc0RlY2xhcmF0aW9uXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3R5cGUnXG5cblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdGNyb2FrIFwiVW5leHBlY3RlZCBzdWJ0eXBlIG9mIDk1OiAje3BhcmVudC5raW5kfVwiXG5cdHJldHVybiBhbmFseXNpc1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBDVHlwZXNjcmlwdENvbXBpbGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXG5cblx0Z2V0IG9wKClcblx0XHRyZXR1cm4gJ2RvQ29tcGlsZVRTJ1xuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGhhbmRsZShcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHRcdCk6IFRFeGVjUmVzdWx0XG5cblx0XHRMT0cgXCJkb0NvbXBpbGVUUyAnI3twYXRofSdcIlxuXG5cdFx0dHlwZSBvcHQgPSB7XG5cdFx0XHRmb3JjZTogYm9vbGVhblxuXHRcdFx0fVxuXHRcdHtmb3JjZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XG5cdFx0XHRmb3JjZTogZmFsc2Vcblx0XHRcdH1cblxuXHRcdGFzc2VydCAoZmlsZUV4dChwYXRoKSA9PSAnLnRzJyksIFwiTm90IGEgdHlwZXNjcmlwdCBmaWxlOiAje3BhdGh9XCJcblx0XHRqc1BhdGggOj0gd2l0aEV4dCBwYXRoLCAnLmpzJ1xuXG5cdFx0IyAtLS0gQ2hlY2sgaWYgYSBuZXdlciBjb21waWxlZCB2ZXJzaW9uIGFscmVhZHkgZXhpc3RzXG5cdFx0aWYgKFxuXHRcdFx0XHQgICBub3QgZm9yY2Vcblx0XHRcdFx0JiYgYXdhaXQgZXhpc3RzKGpzUGF0aClcblx0XHRcdFx0JiYgbmV3ZXJEZXN0RmlsZUV4aXN0cyhwYXRoLCBqc1BhdGgpXG5cdFx0XHRcdClcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWVcblx0XHRcdFx0bm90TmVlZGVkOiB0cnVlXG5cdFx0XHRcdH1cblxuXHRcdHRyeVxuXHRcdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xuXHRcdFx0XHQnYnVuZGxlJ1xuXHRcdFx0XHQnLS1taW5pZnknXG5cdFx0XHRcdHBhdGhcblx0XHRcdFx0anNQYXRoXG5cdFx0XHRcdF1cblx0XHRcdGlmIG5vdCBoUmVzdWx0LnN1Y2Nlc3Ncblx0XHRcdFx0Y29uc29sZS5sb2cgQGdldE91dHB1dChoUmVzdWx0KVxuXHRcdFx0XHRjcm9hayBcIkNvbXBpbGUgZmFpbGVkXCJcblx0XHRcdHJldHVybiBoUmVzdWx0XG5cblx0XHRjYXRjaCBlcnJcblx0XHRcdGlmIGRlYnVnZ2luZ1xuXHRcdFx0XHRMT0cgZ2V0RXJyU3RyKGVycilcblx0XHRcdGVyck1zZyA6PSBcIkNPTVBJTEUgRkFJTEVEOiAje3BhdGhTdHIocGF0aCl9IC0gI3tnZXRFcnJTdHIoZXJyKX1cIlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2Vcblx0XHRcdFx0c3RkZXJyOiBlcnJNc2dcblx0XHRcdFx0fVxuXG5leHBvcnQgZG9Db21waWxlVFMgOj0gbmV3IENUeXBlc2NyaXB0Q29tcGlsZXIoKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBBU1lOQ1xuXG5leHBvcnQgY29tcGlsZUFsbFRTIDo9IChcblx0XHRyb290ID0gJy4nXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxuXHRcdCk6IFRFeGVjUmVzdWx0W10gPT5cblxuXHQjIC0tLSB3aXRoICdxdWlldCcgb3B0aW9uLCBzdGlsbCByZXBvcnRzIGVycm9yc1xuXHRwYXR0ZXJuIDo9IG1rcGF0aChyb290LCAnKiovKi5saWIudHMnKVxuXHRMT0cgXCJwYXR0ZXJuID0gJyN7cGF0dGVybn0nXCJcblx0c3BlYzogVFByb2NTcGVjIDo9IFtkb0NvbXBpbGVUUywgW3BhdHRlcm5dXVxuXHRyZXR1cm4gYXdhaXQgcHJvY0ZpbGVzIHNwZWMsIHtcblx0XHQuLi5oT3B0aW9uc1xuXHRcdHF1aWV0OiB0cnVlXG5cdFx0YWJvcnRPbkVycm9yOiB0cnVlXG5cdFx0fVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBDVW5pdFRlc3RlciBleHRlbmRzIENGaWxlSGFuZGxlclxuXG5cdGdldCBvcCgpXG5cdFx0cmV0dXJuICdkb1VuaXRUZXN0J1xuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGhhbmRsZShcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cblx0XHRcdCk6IFRFeGVjUmVzdWx0XG5cblx0XHRhc3NlcnQgcGF0aC5lbmRzV2l0aCgnLnRlc3QudHMnKSwgXCJOb3QgYSB1bml0IHRlc3QgZmlsZVwiXG5cdFx0dHlwZSBvcHQgPSB7XG5cdFx0XHRjYXB0dXJlOiBib29sZWFuXG5cdFx0XHRpbnNwZWN0OiBib29sZWFuXG5cdFx0XHRsaW5lTnVtOiBzdHJpbmc/XG5cdFx0XHR9XG5cdFx0e2NhcHR1cmUsIGluc3BlY3QsIGxpbmVOdW19IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xuXHRcdFx0Y2FwdHVyZTogdHJ1ZVxuXHRcdFx0aW5zcGVjdDogZmFsc2Vcblx0XHRcdGxpbmVOdW06IHVuZGVmXG5cdFx0XHR9XG5cblx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXG5cdFx0XHRcdCd0ZXN0J1xuXHRcdFx0XHQnLUEnXG5cdFx0XHRcdC4uLihpbnNwZWN0ID8gWyctLWluc3BlY3QtYnJrJ10gOiBbJy0tY292ZXJhZ2U9Li9jb3ZlcmFnZSddKVxuXHRcdFx0XHQuLi4oZGVmaW5lZChsaW5lTnVtKSA/IFsnLS1maWx0ZXInLCBcIi9ebGluZSAje2xpbmVOdW19JC9cIl0gOiBbXSlcblx0XHRcdFx0cGF0aFxuXHRcdFx0XHRdLCB7Y2FwdHVyZX1cblx0XHRyZXR1cm4gaFJlc3VsdFxuXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxuXG5cdG92ZXJyaWRlIGdldE91dHB1dChoUmVzdWx0OiBURXhlY1Jlc3VsdCk6IHN0cmluZ1xuXG5cdFx0e3N0ZG91dCwgc3RkZXJyfSA6PSBoUmVzdWx0XG5cdFx0b3V0cHV0IDo9IFtzdGRvdXQsIHN0ZGVycl0uam9pbigpXG5cdFx0aWYgbm90IGhSZXN1bHQuc3VjY2VzcyB8fCBvdXRwdXQubWF0Y2goL2Nyb2FrfGVycm9yL2kpXG5cdFx0XHRyZXR1cm4gb3V0cHV0XG5cblx0XHRsTGluZXMgOj0gQXJyYXkuZnJvbSBNQVAgYWxsTGluZXNJbkJsb2NrKGRlY29sb3JpemUob3V0cHV0KSksIChsaW5lKSAtPlxuXHRcdFx0aWYgbGluZS5zdGFydHNXaXRoKCdydW5uaW5nJylcblx0XHRcdFx0eWllbGQgbGluZVxuXHRcdFx0XHR5aWVsZCAnJ1xuXHRcdFx0ZWxzZSBpZiBsaW5lLnN0YXJ0c1dpdGgoJ2xpbmUnKVxuXHRcdFx0XHRpZiBub3QgbGluZS5pbmNsdWRlcygnIG9rICcpXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XG5cdFx0XHRcdFx0XHRmYWlsZWQ6ICdyZWQnXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xuXHRcdFx0XHRcdFx0T0s6ICdncmVlbidcblx0XHRcdFx0XHRcdH1cblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygncGFzc2VkJykgJiYgbGluZS5pbmNsdWRlcygnZmFpbGVkJylcblx0XHRcdFx0aWYgbGluZS5pbmNsdWRlcygnIDAgZmFpbGVkICcpXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xuXHRcdFx0XHRcdFx0cGFzc2VkOiAnZ3JlZW4nXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Vcblx0XHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcblx0XHRcdFx0XHRcdG9rOiAnZ3JlZW4nXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcblx0XHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcblx0XHRcdFx0XHRcdEZBSUxFRDogJ3JlZCdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0eWllbGQgJydcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygnTGNvdiBjb3ZlcmFnZScpXG5cdFx0XHRcdHlpZWxkICdjb3ZlcmFnZSByZXBvcnQgZ2VuZXJhdGVkJ1xuXHRcdHJldHVybiBsTGluZXMuam9pbignXFxuJylcblxuZXhwb3J0IGRvVW5pdFRlc3QgOj0gbmV3IENVbml0VGVzdGVyKClcbiJdfQ==