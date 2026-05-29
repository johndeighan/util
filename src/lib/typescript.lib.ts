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
	undef, defined, notdefined, croak, assert, getErrStr,
	extractSourceMap, withColors, decolorize,
	LOG, DBG, ERR, INDENT, UNDENT,
	pushLogLevel, popLogLevel,
	} from 'base'
import {
	integer, hash, hashof,
	isHash, isString, isEmpty, nonEmpty, isNumber,
	isFunction, functionDef, isClass, classDef,
	} from 'datatypes'
import {
	getOptions, spaces, o, words, hasKey,
	CStringSetMap, keys, sep, allLinesInBlock, f,
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
	} from 'to-nice'
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
		dspath: string | TPathItem[]
		): Node => {

	const val = extract(x, dspath) as Node
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
			dspath: (string | undefined) = undef
			): void => {

		if (defined(dspath)) {
			node = getNode(node, dspath)
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInR5cGVzY3JpcHQubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsdUJBQXNCO0FBQ3RCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMxQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUN4RCxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzlELENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUM7QUFDaEQsQ0FBQyxlQUFlLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN0RCxDQUFDLDRCQUE0QixDQUFDLENBQUMsNkJBQTZCLENBQUM7QUFDN0QsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUN4QixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDdEQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUMxQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUMvQixDQUFDLFlBQVksQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUMzQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFB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QUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDMUMsQUFBQSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQyxDQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQztFQUFDLENBQUE7QUFDOUMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxRO0NBQVEsQ0FBQTtBQUNqQixBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDcEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxVQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3ZCLEFBQUE7QUFDQSxBQUFBLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUEsQUFBQyxJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEM7Q0FBQSxDQUFBO0FBQ3RDLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUNyQixBQUFBO0FBQ0EsQUFBQSxFQUFRLE1BQU4sTUFBTSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDaEMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLEMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFD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Q0FBQSxBQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDN0IsQUFBQSxNQUFNLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQTtBQUNqQixBQUFBLE1BQU0sTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFBO0FBQ3JCLEFBQUEsTUFBTSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDbkIsQUFBQSxNQUFNLE1BQU0sQ0FBQyxDQUFDLEtBQUs7QUFDbkIsTUFBTSxDQUFDLEM7SUFBQSxDQUFBO0FBQ1AsQUFBQSxJQUFJLEtBQUssQ0FBQyxFO0dBQUUsQ0FBQTtBQUNaLEFBQUEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFBLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ3pDLEFBQUEsSUFBSSxLQUFLLENBQUMsMkI7R0FBMkIsQztFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ3JDLEFBQUEsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEM7Q0FBQyxDO0FBQUEsQ0FBQTtBQUMxQixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBVyxNQUFWLFVBQVUsQ0FBQyxDQUFFLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3RDIiwibmFtZXMiOltdLCJzb3VyY2VzQ29udGVudCI6WyIjIHR5cGVzY3JpcHQubGliLmNpdmV0XHJcblxyXG5pbXBvcnQge2V4aXN0cywgZXhpc3RzU3luY30gZnJvbSAnQHN0ZC9mcydcclxuaW1wb3J0IHtcclxuXHRTb3VyY2VGaWxlLCBOb2RlLCBTY3JpcHRUYXJnZXQsIFN5bnRheEtpbmQsIE1vZHVsZUtpbmQsXHJcblx0TmV3TGluZUtpbmQsIEVtaXRIaW50LCBDb21waWxlck9wdGlvbnMsIE1vZHVsZVJlc29sdXRpb25LaW5kLFxyXG5cdGNyZWF0ZVNvdXJjZUZpbGUsIGNyZWF0ZVByaW50ZXIsIGNyZWF0ZVByb2dyYW0sXHJcblx0dHJhbnNwaWxlTW9kdWxlLCBnZXRQcmVFbWl0RGlhZ25vc3RpY3MsIGZvckVhY2hDaGlsZCxcclxuXHRmbGF0dGVuRGlhZ25vc3RpY01lc3NhZ2VUZXh0LCBnZXRMaW5lQW5kQ2hhcmFjdGVyT2ZQb3NpdGlvbixcclxuXHR9IGZyb20gJ25wbS10eXBlc2NyaXB0J1xyXG5cclxuaW1wb3J0IHtcclxuXHR1bmRlZiwgZGVmaW5lZCwgbm90ZGVmaW5lZCwgY3JvYWssIGFzc2VydCwgZ2V0RXJyU3RyLFxyXG5cdGV4dHJhY3RTb3VyY2VNYXAsIHdpdGhDb2xvcnMsIGRlY29sb3JpemUsXHJcblx0TE9HLCBEQkcsIEVSUiwgSU5ERU5ULCBVTkRFTlQsXHJcblx0cHVzaExvZ0xldmVsLCBwb3BMb2dMZXZlbCxcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0aW50ZWdlciwgaGFzaCwgaGFzaG9mLFxyXG5cdGlzSGFzaCwgaXNTdHJpbmcsIGlzRW1wdHksIG5vbkVtcHR5LCBpc051bWJlcixcclxuXHRpc0Z1bmN0aW9uLCBmdW5jdGlvbkRlZiwgaXNDbGFzcywgY2xhc3NEZWYsXHJcblx0fSBmcm9tICdkYXRhdHlwZXMnXHJcbmltcG9ydCB7XHJcblx0Z2V0T3B0aW9ucywgc3BhY2VzLCBvLCB3b3JkcywgaGFzS2V5LFxyXG5cdENTdHJpbmdTZXRNYXAsIGtleXMsIHNlcCwgYWxsTGluZXNJbkJsb2NrLCBmLFxyXG5cdH0gZnJvbSAnbGx1dGlscydcclxuaW1wb3J0IHtkZWJ1Z2dpbmd9IGZyb20gJ2NtZC1hcmdzJ1xyXG5pbXBvcnQge1xyXG5cdGV4dHJhY3QsIFRQYXRoSXRlbSwgZ2V0U3RyaW5nLCBnZXROdW1iZXIsIGdldEFycmF5LFxyXG5cdH0gZnJvbSAnZXh0cmFjdCdcclxuaW1wb3J0IHtUQmxvY2tEZXNjLCBCbG9ja2lmeX0gZnJvbSAnaW5kZW50J1xyXG5pbXBvcnQge1xyXG5cdGlzRmlsZSwgc2x1cnAsIGJhcmYsIGJhcmZUZW1wRmlsZSwgZmlsZUV4dCwgd2l0aEV4dCxcclxuXHRwYXRoU3RyLCBta3BhdGgsIG5ld2VyRGVzdEZpbGVFeGlzdHMsXHJcblx0fSBmcm9tICdmc3lzJ1xyXG5pbXBvcnQge1xyXG5cdE9MLCB0b05pY2UsIFRNYXBGdW5jLCBEVU1QLCBMT0dWQUxVRSwgREJHVkFMVUUsXHJcblx0fSBmcm9tICd0by1uaWNlJ1xyXG5pbXBvcnQge1xyXG5cdGV4ZWNDbWQsIENGaWxlSGFuZGxlciwgVFByb2NTcGVjLCBURXhlY1Jlc3VsdCxcclxuXHRwcm9jT25lRmlsZSwgcHJvY0ZpbGVzLFxyXG5cdH0gZnJvbSAnZXhlYydcclxuaW1wb3J0IHtXYWxrZXIsIFRWaXNpdEtpbmR9IGZyb20gJ3dhbGtlcidcclxuaW1wb3J0IHtDTWFpblNjb3BlLCBDU2NvcGV9IGZyb20gJ3Njb3BlJ1xyXG5pbXBvcnQge2dldE5lZWRlZEltcG9ydFN0bXRzfSBmcm9tICdzeW1ib2xzJ1xyXG5pbXBvcnQge01BUH0gZnJvbSAnbWFwcGVyJ1xyXG5pbXBvcnQge3R5cGVDaGVja1RzRmlsZX0gZnJvbSAnbGx0eXBlc2NyaXB0J1xyXG5cclxuZGVjb2RlciA6PSBuZXcgVGV4dERlY29kZXIgXCJ1dGYtOFwiXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGtpbmRTdHIgOj0gKGk6IG51bWJlcik6IHN0cmluZyA9PlxyXG5cclxuXHRyZXR1cm4gU3ludGF4S2luZFtpXVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCB0czJhc3QgOj0gKFxyXG5cdFx0dHNDb2RlOiBzdHJpbmcsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBOb2RlID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ1xyXG5cdFx0fVxyXG5cdHtmaWxlTmFtZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRmaWxlTmFtZTogJ3RlbXAudHMnXHJcblx0XHR9XHJcblxyXG5cdFtjb2RlLCBoU3JjTWFwXSA6PSBleHRyYWN0U291cmNlTWFwKHRzQ29kZSlcclxuXHRoQXN0IDo9IGNyZWF0ZVNvdXJjZUZpbGUgZmlsZU5hbWUsIGNvZGUsIFNjcmlwdFRhcmdldC5MYXRlc3RcclxuXHRyZXR1cm4gaEFzdFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3QydHMgOj0gKFxyXG5cdFx0bm9kZTogTm9kZVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdGFzc2VydCAobm9kZS5raW5kID09IDMwOCksIFwiTm90IGEgU291cmNlRmlsZSBub2RlXCJcclxuXHRwcmludGVyIDo9IGNyZWF0ZVByaW50ZXIgbmV3TGluZTogTmV3TGluZUtpbmQuTGluZUZlZWRcclxuXHRyZXR1cm4gcHJpbnRlci5wcmludE5vZGUoRW1pdEhpbnQuVW5zcGVjaWZpZWQsIG5vZGUsIG5vZGUgYXMgU291cmNlRmlsZSlcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgLS0tIHBhc3NlZCB0byB0b05pY2UoKSB0byBhZGQgYSBkZXNjcmlwdGlvbiB0byBzb21lIG5vZGVzXHJcblxyXG5leHBvcnQgZGVzY0Z1bmM6IFRNYXBGdW5jIDo9IChcclxuXHRcdGtleTogc3RyaW5nXHJcblx0XHR2YWx1ZTogdW5rbm93blxyXG5cdFx0aFBhcmVudDogdW5rbm93blxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiAoa2V5ID09ICdraW5kJykgJiYgaXNOdW1iZXIodmFsdWUpID8gZlwiKCN7a2luZFN0cih2YWx1ZSl9KVwiIDogJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYXN0QXNTdHJpbmcgOj0gKFxyXG5cdFx0aEFzdDogb2JqZWN0LFxyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogc3RyaW5nID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0bEluY2x1ZGU6IHN0cmluZ1tdP1xyXG5cdFx0fVxyXG5cdHtsSW5jbHVkZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRsSW5jbHVkZTogdW5kZWZcclxuXHRcdH1cclxuXHJcblx0cmV0dXJuIHRvTmljZSBoQXN0LCB7XHJcblx0XHRpZ25vcmVFbXB0eUtleXM6IHRydWVcclxuXHRcdGxJbmNsdWRlXHJcblx0XHRsRXhjbHVkZTogd29yZHMoXCJcIlwiXHJcblx0XHRcdHBvcyBlbmQgaWQgZmxhZ3MgbW9kaWZpZXJGbGFnc0NhY2hlXHJcblx0XHRcdHRyYW5zZm9ybUZsYWdzIGhhc0V4dGVuZGVkVW5pY29kZUVzY2FwZVxyXG5cdFx0XHRudW1lcmljTGl0ZXJhbEZsYWdzIHNldEV4dGVybmFsTW9kdWxlSW5kaWNhdG9yXHJcblx0XHRcdGxhbmd1YWdlVmVyc2lvbiBsYW5ndWFnZVZhcmlhbnQganNEb2NQYXJzaW5nTW9kZVxyXG5cdFx0XHRoYXNOb0RlZmF1bHRMaWJcclxuXHRcdFx0XCJcIlwiKVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBnZXRJbXBvcnRDb2RlIDo9ICh0eXBlU3RyOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuXHJcblx0REJHIFwiQ0FMTCBnZXRJbXBvcnRDb2RlKClcIlxyXG5cdGxTeW1ib2xzIDo9IGdldFN5bWJvbHNGcm9tVHlwZSB0eXBlU3RyXHJcblx0REJHVkFMVUUgJ2xTeW1ib2xzJywgbFN5bWJvbHNcclxuXHRpZiBub25FbXB0eShsU3ltYm9scylcclxuXHRcdGxTdG10cyA6PSBnZXROZWVkZWRJbXBvcnRTdG10cyBsU3ltYm9sc1xyXG5cdFx0REJHVkFMVUUgJ2xTdG10cycsIGxTdG10c1xyXG5cdFx0cmV0dXJuIGxTdG10cy5qb2luICdcXG4nXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuICcnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldFN5bWJvbHNGcm9tVHlwZSA6PSAoXHJcblx0XHR0eXBlU3RyOiBzdHJpbmdcclxuXHRcdCk6IHN0cmluZ1tdID0+XHJcblxyXG5cdGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eKFtBLVphLXpdW0EtWmEtejAtOStdKikoPzpcXDwoW0EtWmEtel1bQS1aYS16MC05K10qKVxcPik/JC8pKVxyXG5cdFx0W18sIHR5cGUsIHN1YnR5cGVdIDo9IGxNYXRjaGVzXHJcblx0XHRyZXR1cm4gbm9uRW1wdHkoc3VidHlwZSkgPyBbdHlwZSwgc3VidHlwZV0gOiBbdHlwZV1cclxuXHRlbHNlIGlmIChsTWF0Y2hlcyA6PSB0eXBlU3RyLm1hdGNoKC9eXFwoXFwpXFxzKlxcPVxcPlxccyooW0EtWmEtel1bQS1aYS16MC05K10qKSQvKSlcclxuXHRcdHJldHVybiBbbE1hdGNoZXNbMV1dXHJcblx0ZWxzZVxyXG5cdFx0cmV0dXJuIFtdXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuaERlZkNvbmZpZzogQ29tcGlsZXJPcHRpb25zIDo9IHtcclxuXHRcImFsbG93SnNcIjogZmFsc2VcclxuXHRcImFsbG93VW1kR2xvYmFsQWNjZXNzXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VucmVhY2hhYmxlQ29kZVwiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbnVzZWRMYWJlbHNcIjogZmFsc2VcclxuXHRcImFsd2F5c1N0cmljdFwiOiB0cnVlXHJcblx0XCJhc3N1bWVDaGFuZ2VzT25seUFmZmVjdERpcmVjdERlcGVuZGVuY2llc1wiOiBmYWxzZVxyXG5cdFwiY2hlY2tKc1wiOiBmYWxzZVxyXG5cdFwiY29tcG9zaXRlXCI6IGZhbHNlXHJcblx0XCJkZWNsYXJhdGlvblwiOiBmYWxzZVxyXG5cdFwiZGVjbGFyYXRpb25EaXJcIjogdW5kZWZpbmVkXHJcblx0XCJkZWNsYXJhdGlvbk1hcFwiOiBmYWxzZVxyXG5cdFwiZW1pdEJPTVwiOiBmYWxzZVxyXG5cdFwiZW1pdERlY2xhcmF0aW9uT25seVwiOiBmYWxzZVxyXG5cdFwiZXhhY3RPcHRpb25hbFByb3BlcnR5VHlwZXNcIjogZmFsc2VcclxuXHRcImV4cGVyaW1lbnRhbERlY29yYXRvcnNcIjogZmFsc2VcclxuXHRcImZvcmNlQ29uc2lzdGVudENhc2luZ0luRmlsZU5hbWVzXCI6IHRydWVcclxuXHRcImdlbmVyYXRlQ3B1UHJvZmlsZVwiOiBudWxsXHJcblx0XCJnZW5lcmF0ZVRyYWNlXCI6IG51bGxcclxuXHRcImlnbm9yZURlcHJlY2F0aW9uc1wiOiBcIjUuMFwiXHJcblx0XCJpbXBvcnRIZWxwZXJzXCI6IGZhbHNlXHJcblx0XCJpbmxpbmVTb3VyY2VNYXBcIjogZmFsc2VcclxuXHRcImlubGluZVNvdXJjZXNcIjogZmFsc2VcclxuXHRcImlzb2xhdGVkTW9kdWxlc1wiOiBmYWxzZVxyXG5cdCNcdFwianN4XCI6IFwicmVhY3QtanN4XCIsXHJcblx0I1x0XCJqc3hGYWN0b3J5XCI6IFwiUmVhY3QuY3JlYXRlRWxlbWVudFwiLFxyXG5cdCNcdFwianN4RnJhZ21lbnRGYWN0b3J5XCI6IFwiUmVhY3QuRnJhZ21lbnRcIixcclxuXHQjXHRcImpzeEltcG9ydFNvdXJjZVwiOiBcInJlYWN0XCIsXHJcblx0XCJsaWJcIjogW1xyXG5cdFx0XCJlc25leHRcIlxyXG5cdFx0XCJkb21cIlxyXG5cdFx0XCJkb20uaXRlcmFibGVcIlxyXG5cdFx0XVxyXG5cdFwibWFwUm9vdFwiOiB1bmRlZmluZWRcclxuXHRcIm1heE5vZGVNb2R1bGVKc0RlcHRoXCI6IDBcclxuXHRcIm1vZHVsZVwiOiBNb2R1bGVLaW5kLkVTTmV4dFxyXG5cdFwibW9kdWxlRGV0ZWN0aW9uXCI6IHVuZGVmaW5lZFxyXG5cdFwibW9kdWxlUmVzb2x1dGlvblwiOiBNb2R1bGVSZXNvbHV0aW9uS2luZC5Ob2RlTmV4dFxyXG5cdFwibmV3TGluZVwiOiBOZXdMaW5lS2luZC5MaW5lRmVlZFxyXG5cdFwibm9FbWl0XCI6IHRydWVcclxuXHRcIm5vRW1pdEhlbHBlcnNcIjogZmFsc2VcclxuXHRcIm5vRW1pdE9uRXJyb3JcIjogZmFsc2VcclxuXHRcIm5vRXJyb3JUcnVuY2F0aW9uXCI6IGZhbHNlXHJcblx0XCJub0ZhbGx0aHJvdWdoQ2FzZXNJblN3aXRjaFwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0QW55XCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRPdmVycmlkZVwiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0UmV0dXJuc1wiOiB0cnVlXHJcblx0XCJub0ltcGxpY2l0VGhpc1wiOiB0cnVlXHJcblx0XCJub1Byb3BlcnR5QWNjZXNzRnJvbUluZGV4U2lnbmF0dXJlXCI6IHRydWVcclxuXHRcIm5vVW5jaGVja2VkSW5kZXhlZEFjY2Vzc1wiOiB0cnVlXHJcblx0XCJub1VudXNlZExvY2Fsc1wiOiB0cnVlXHJcblx0XCJub1VudXNlZFBhcmFtZXRlcnNcIjogdHJ1ZVxyXG5cdFwib3V0RGlyXCI6IHVuZGVmaW5lZFxyXG5cdFwib3V0RmlsZVwiOiB1bmRlZmluZWRcclxuXHRcInBhdGhzXCI6IHt9XHJcblx0XCJwcmVzZXJ2ZUNvbnN0RW51bXNcIjogZmFsc2VcclxuXHRcInByZXNlcnZlU3ltbGlua3NcIjogZmFsc2VcclxuXHRcInByZXNlcnZlVmFsdWVJbXBvcnRzXCI6IGZhbHNlXHJcblx0XCJyZWFjdE5hbWVzcGFjZVwiOiBcIlJlYWN0XCJcclxuXHRcInJlbW92ZUNvbW1lbnRzXCI6IGZhbHNlXHJcblx0XCJyZXNvbHZlSnNvbk1vZHVsZVwiOiB0cnVlXHJcblx0XCJyb290RGlyXCI6IHVuZGVmaW5lZFxyXG5cdFwicm9vdERpcnNcIjogW11cclxuXHRcInNraXBEZWZhdWx0TGliQ2hlY2tcIjogZmFsc2VcclxuXHRcInNraXBMaWJDaGVja1wiOiBmYWxzZVxyXG5cdFwic291cmNlTWFwXCI6IGZhbHNlXHJcblx0XCJzb3VyY2VSb290XCI6IHVuZGVmaW5lZFxyXG5cdFwic3RyaWN0XCI6IHRydWVcclxuXHRcInN0cmljdEJpbmRDYWxsQXBwbHlcIjogdHJ1ZVxyXG5cdFwic3RyaWN0RnVuY3Rpb25UeXBlc1wiOiB0cnVlXHJcblx0XCJzdHJpY3ROdWxsQ2hlY2tzXCI6IHRydWVcclxuXHRcInN0cmljdFByb3BlcnR5SW5pdGlhbGl6YXRpb25cIjogdHJ1ZVxyXG5cdFwic3RyaXBJbnRlcm5hbFwiOiBmYWxzZVxyXG5cdFwic3VwcHJlc3NFeGNlc3NQcm9wZXJ0eUVycm9yc1wiOiBmYWxzZVxyXG5cdFwic3VwcHJlc3NJbXBsaWNpdEFueUluZGV4RXJyb3JzXCI6IGZhbHNlXHJcblx0XCJ0YXJnZXRcIjogU2NyaXB0VGFyZ2V0LkVTMjAyMlxyXG5cdFwidHJhY2VSZXNvbHV0aW9uXCI6IGZhbHNlXHJcblx0XCJ0c0J1aWxkSW5mb0ZpbGVcIjogdW5kZWZpbmVkXHJcblx0XCJ0eXBlUm9vdHNcIjogW11cclxuXHRcInVzZURlZmluZUZvckNsYXNzRmllbGRzXCI6IHRydWVcclxuXHRcInVzZVVua25vd25JbkNhdGNoVmFyaWFibGVzXCI6IHRydWVcclxuXHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudHlwZSBUQXN0RmlsdGVyRnVuYyA9IChcclxuXHRcdG5vZGU6IE5vZGVcclxuXHRcdCkgPT4gYm9vbGVhblxyXG5cclxuZXhwb3J0IGNsYXNzIEFzdFdhbGtlciBleHRlbmRzIFdhbGtlcjxOb2RlPlxyXG5cclxuXHRmaWx0ZXJGdW5jOiBUQXN0RmlsdGVyRnVuYz9cclxuXHRoT3B0aW9uczogaGFzaFxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoXHJcblx0XHRcdEBmaWx0ZXJGdW5jOiBUQXN0RmlsdGVyRnVuYz8gPSB1bmRlZixcclxuXHRcdFx0QGhPcHRpb25zID0ge31cclxuXHRcdFx0KVxyXG5cdFx0c3VwZXIoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZGJnKG9wOiAncHVzaCcgfCAncG9wJywgbm9kZTogTm9kZSk6IHZvaWRcclxuXHJcblx0XHRwcmVmaXggOj0gJyAgICdcclxuXHRcdGtpbmQgOj0gbm9kZS5raW5kXHJcblx0XHRjb25zb2xlLmxvZyBcIiN7cHJlZml4fSN7b3AudG9VcHBlckNhc2UoKX06ICN7a2luZH0gWyN7QHN0YWNrRGVzYygpfV1cIlxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRzdGFja0Rlc2MoKTogc3RyaW5nXHJcblxyXG5cdFx0cmVzdWx0cyA6PSBbXVxyXG5cdFx0Zm9yIG5vZGUgb2YgQGxOb2RlU3RhY2tcclxuXHRcdFx0cmVzdWx0cy5wdXNoIG5vZGUua2luZC50b1N0cmluZygpXHJcblx0XHRsU3RhY2sgOj0gcmVzdWx0c1xyXG5cdFx0cmV0dXJuIGxTdGFjay5qb2luICcsJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgcHVzaE5vZGUobm9kZTogTm9kZSk6IHZvaWRcclxuXHJcblx0XHRzdXBlci5wdXNoTm9kZSBub2RlXHJcblx0XHRpZiBAaE9wdGlvbnMudHJhY2VcclxuXHRcdFx0QGRiZyAncHVzaCcsIG5vZGVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgcG9wTm9kZSgpOiBOb2RlP1xyXG5cclxuXHRcdG5vZGUgOj0gc3VwZXIucG9wTm9kZSgpXHJcblx0XHRpZiBAaE9wdGlvbnMudHJhY2VcclxuXHRcdFx0aWYgZGVmaW5lZChub2RlKVxyXG5cdFx0XHRcdEBkYmcgJ3BvcCcsIG5vZGVcclxuXHRcdFx0ZWxzZVxyXG5cdFx0XHRcdGNvbnNvbGUubG9nIFwiU1RBQ0sgRU1QVFlcIlxyXG5cdFx0cmV0dXJuIG5vZGVcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGlzTm9kZSh4OiBvYmplY3QpOiB4IGlzIE5vZGVcclxuXHJcblx0XHRyZXR1cm4gT2JqZWN0Lmhhc093biB4LCAna2luZCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGZpbHRlcihub2RlOiBOb2RlKTogYm9vbGVhblxyXG5cclxuXHRcdHJldHVybiBkZWZpbmVkKEBmaWx0ZXJGdW5jKSA/IEBmaWx0ZXJGdW5jKG5vZGUpIDogdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBjbGFzcyBDQW5hbHlzaXNcclxuXHJcblx0dHJhY2UgPSBmYWxzZVxyXG5cdG1JbXBvcnRzID0gbmV3IENTdHJpbmdTZXRNYXAoKVxyXG5cdG1FeHBvcnRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKVxyXG5cdHNNaXNzaW5nID0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRtYWluU2NvcGUgPSBuZXcgQ01haW5TY29wZSgpXHJcblx0Y3VyU2NvcGU6IENTY29wZVxyXG5cdGZpbmlzaGVkID0gZmFsc2VcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNvbnN0cnVjdG9yKEB0cmFjZSA9IGZhbHNlKVxyXG5cclxuXHRcdEBjdXJTY29wZSA9IEBtYWluU2NvcGVcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGRlZmluZShuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGRlZmluZSAje25hbWV9XCJcclxuXHRcdEBjdXJTY29wZS5kZWZpbmUgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHR1c2UobmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdCMgLS0tIHRoaXMgY29uZGl0aW9uIHNob3VsZCBmaWx0ZXIgYnVpbHQtaW5zXHJcblx0XHRpZiBub3QgaGFzS2V5KGdsb2JhbFRoaXMsIG5hbWUpXHJcblx0XHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRcdExPRyBcIiAgIHVzZSAje25hbWV9XCJcclxuXHRcdFx0aWYgbm90IEBjdXJTY29wZS5pc0RlZmluZWQobmFtZSlcclxuXHRcdFx0XHRpZiBAdHJhY2VcclxuXHRcdFx0XHRcdExPRyBcIiAgIG1pc3NpbmcgI3tuYW1lfVwiXHJcblx0XHRcdFx0QHNNaXNzaW5nLmFkZCBuYW1lXHJcblx0XHRcdEBjdXJTY29wZS51c2UgbmFtZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhZGRJbXBvcnQobGliOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgaW1wb3J0ICcje25hbWV9JyBpbiAnI3tsaWJ9J1wiXHJcblx0XHRAbUltcG9ydHMuYWRkIGxpYiwgbmFtZVxyXG5cdFx0QGRlZmluZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFkZEV4cG9ydChuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZXhwb3J0ICcje25hbWV9JzogJyN7dHlwZX0nXCJcclxuXHRcdEBtRXhwb3J0cy5zZXQgbmFtZSwgdHlwZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRuZXdTY29wZShuYW1lOiBzdHJpbmc/LCBsQXJnczogc3RyaW5nW10pOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIG5ldyBzY29wZSAje25hbWUgfHwgJzxhbm9uPid9KCN7bEFyZ3Muam9pbignLCcpfSlcIlxyXG5cdFx0QGN1clNjb3BlID0gQG1haW5TY29wZS5uZXdTY29wZShuYW1lLCBsQXJncylcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZW5kU2NvcGUoKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBlbmQgc2NvcGVcIlxyXG5cdFx0c2NvcGUgOj0gQG1haW5TY29wZS5lbmRTY29wZSBAY3VyU2NvcGVcclxuXHRcdGlmIGRlZmluZWQoc2NvcGUpXHJcblx0XHRcdEBjdXJTY29wZSA9IHNjb3BlXHJcblx0XHRlbHNlXHJcblx0XHRcdEBmaW5pc2hlZCA9IHRydWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0SW1wb3J0cygpOiBUQmxvY2tEZXNjXHJcblxyXG5cdFx0aEltcG9ydHM6IGhhc2hvZjxzdHJpbmdbXT4gOj0ge31cclxuXHRcdGZvciBbbGliLCBzTmFtZXNdIG9mIEBtSW1wb3J0cy5lbnRyaWVzKClcclxuXHRcdFx0aEltcG9ydHNbbGliXSA9IEFycmF5LmZyb20oc05hbWVzLnZhbHVlcygpKVxyXG5cdFx0cmV0dXJuIGhJbXBvcnRzXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRFeHBvcnRzKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQG1FeHBvcnRzLmtleXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0TWlzc2luZygpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHJldHVybiBBcnJheS5mcm9tIEBzTWlzc2luZy52YWx1ZXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Z2V0RXh0cmEoKTogc3RyaW5nW11cclxuXHJcblx0XHR3YWxrZXIgOj0gbmV3IFdhbGtlcjxDU2NvcGU+KClcclxuXHRcdHdhbGtlci5pc05vZGUgPSAoeDogdW5rbm93bikgPT5cclxuXHRcdFx0cmV0dXJuICh4IGluc3RhbmNlb2YgQ1Njb3BlKVxyXG5cclxuXHRcdCMgLS0tIEZpbmQgYWxsIG5hbWVzIHRoYXQgYXJlIGRlZmluZWQsIGJ1dCBuZXZlciB1c2VkIG9yIGV4cG9ydGVkXHJcblx0XHRzTmFtZXMgOj0gbmV3IFNldDxzdHJpbmc+KClcclxuXHRcdGZvciBzY29wZSBvZiB3YWxrZXIud2FsayhAbWFpblNjb3BlKVxyXG5cdFx0XHRmb3IgbmFtZSBvZiBzY29wZS5hbGxEZWZpbmVkKClcclxuXHRcdFx0XHRpZiBub3Qgc2NvcGUuaXNVc2VkKG5hbWUpICYmICFAbUV4cG9ydHMuaGFzKG5hbWUpXHJcblx0XHRcdFx0XHRzTmFtZXMuYWRkIG5hbWVcclxuXHRcdHJldHVybiBBcnJheS5mcm9tIHNOYW1lcy52YWx1ZXMoKVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YXNTdHJpbmcod2lkdGg6IGludGVnZXIgPSA2NCk6IHN0cmluZ1xyXG5cclxuXHRcdGg6IFRCbG9ja0Rlc2MgOj0ge1xyXG5cdFx0XHRJTVBPUlRTOiBAZ2V0SW1wb3J0cygpXHJcblx0XHRcdEVYUE9SVFM6IEBnZXRFeHBvcnRzKClcclxuXHRcdFx0TUlTU0lORzogQGdldE1pc3NpbmcoKVxyXG5cdFx0XHRFWFRSQTogQGdldEV4dHJhKClcclxuXHRcdFx0fVxyXG5cclxuXHRcdGlmIGlzRW1wdHkoaC5JTVBPUlRTKVxyXG5cdFx0XHRkZWxldGUgaC5JTVBPUlRTXHJcblx0XHRpZiBpc0VtcHR5KGguRVhQT1JUUylcclxuXHRcdFx0ZGVsZXRlIGguRVhQT1JUU1xyXG5cdFx0aWYgaXNFbXB0eShoLk1JU1NJTkcpXHJcblx0XHRcdGRlbGV0ZSBoLk1JU1NJTkdcclxuXHRcdGlmIGlzRW1wdHkoaC5FWFRSQSlcclxuXHRcdFx0ZGVsZXRlIGguRVhUUkFcclxuXHRcdHJldHVybiBCbG9ja2lmeSBoXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldE5vZGUgOj0gKFxyXG5cdFx0eDogdW5rbm93blxyXG5cdFx0ZHNwYXRoOiBzdHJpbmcgfCBUUGF0aEl0ZW1bXVxyXG5cdFx0KTogTm9kZSA9PlxyXG5cclxuXHR2YWwgOj0gZXh0cmFjdCh4LCBkc3BhdGgpIGFzIE5vZGVcclxuXHRyZXR1cm4gdmFsXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFuYWx5emVUc0NvZGUgOj0gKFxyXG5cdFx0dHNDb2RlOiBzdHJpbmdcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IENBbmFseXNpcyA9PlxyXG5cclxuXHR0eXBlIG9wdCA9IHtcclxuXHRcdGZpbGVOYW1lOiBzdHJpbmc/XHJcblx0XHRkdW1wQVNUOiBib29sZWFuXHJcblx0XHR0cmFjZTogYm9vbGVhblxyXG5cdFx0fVxyXG5cdHtmaWxlTmFtZSwgZHVtcEFTVCwgdHJhY2V9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0ZmlsZU5hbWU6IHVuZGVmXHJcblx0XHRkdW1wQVNUOiBmYWxzZVxyXG5cdFx0dHJhY2U6IGZhbHNlXHJcblx0XHR9XHJcblxyXG5cdGFuYWx5c2lzIDo9IG5ldyBDQW5hbHlzaXModHJhY2UpXHJcblx0d2Fsa2VyIDo9IG5ldyBBc3RXYWxrZXIoKVxyXG5cclxuXHQjIC0tLSB0aHJvd3MgRXJyb3IgaWYgbm90IHZhbGlkIFR5cGVTY3JpcHRcclxuXHRoQXN0IDo9IHRzMmFzdCB0c0NvZGVcclxuXHJcblx0aWYgZHVtcEFTVFxyXG5cdFx0RFVNUCBhc3RBc1N0cmluZyhoQXN0KSwgJ0FTVCdcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGNoZWNrTm9kZSA6PSAoXHJcblx0XHRcdG5vZGU6IE5vZGUsXHJcblx0XHRcdGRzcGF0aDogc3RyaW5nPyA9IHVuZGVmXHJcblx0XHRcdCk6IHZvaWQgPT5cclxuXHJcblx0XHRpZiBkZWZpbmVkKGRzcGF0aClcclxuXHRcdFx0bm9kZSA9IGdldE5vZGUobm9kZSwgZHNwYXRoKVxyXG5cdFx0aWYgKG5vZGUua2luZCA9PSA4MCkgICAjIC0tLSBJZGVudGlmaWVyXHJcblx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcuZXNjYXBlZFRleHQnXHJcblx0XHRcdGFuYWx5c2lzLnVzZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdHN5bSA6PSAodmtpbmQ6IFRWaXNpdEtpbmQpOiBzdHJpbmcgPT5cclxuXHRcdHN3aXRjaCB2a2luZFxyXG5cdFx0XHR3aGVuICdlbnRlcicgdGhlbiByZXR1cm4gJy0+J1xyXG5cdFx0XHR3aGVuICdleGl0JyAgdGhlbiByZXR1cm4gJzwtJ1xyXG5cdFx0XHRlbHNlICAgICAgICAgICAgICByZXR1cm4gJzo6J1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHQjIHZraW5kIGlzIG9uZSBvZiAnZW50ZXInLCAnZXhpdCcsICdyZWYnXHJcblxyXG5cdGxUcmFjZUtpbmQgOj0gWzgwLCA5NSwgMTcwLCAyMTQsIDIyMCwgMjI3LCAyNTQsIDI2MSwgMjYzLCAyNzMsIDI4MCwgMzA4XVxyXG5cdGZvciBbdmtpbmQsIG5vZGVdIG9mIHdhbGtlci53YWxrRXgoaEFzdClcclxuXHRcdHtraW5kfSA6PSBub2RlXHJcblx0XHRpZiB0cmFjZSAmJiBsVHJhY2VLaW5kLmluY2x1ZGVzKGtpbmQpXHJcblx0XHRcdExPRyBmXCIje3N5bSh2a2luZCl9IE5PREUgI3traW5kfTozICgje2tpbmRTdHIoa2luZCl9OntjeWFufSlcIlxyXG5cclxuXHRcdGlmICh2a2luZCA9PSAnZXhpdCcpXHJcblx0XHRcdHN3aXRjaCBraW5kXHJcblxyXG5cdFx0XHRcdHdoZW4gMjIwLCAyNjMgICAjIEFycm93RnVuY3Rpb24sIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdGFuYWx5c2lzLmVuZFNjb3BlKClcclxuXHJcblx0XHRlbHNlIGlmICh2a2luZCA9PSAnZW50ZXInKVxyXG5cclxuXHRcdFx0c3dpdGNoIGtpbmRcclxuXHJcblx0XHRcdFx0d2hlbiAyMjAgICAgIyBBcnJvd0Z1bmN0aW9uXHJcblx0XHRcdFx0XHRkb1xyXG5cdFx0XHRcdFx0XHRsUGFybXMgOj0gQXJyYXkuZnJvbSBNQVAgZ2V0QXJyYXkobm9kZSwgJy5wYXJhbWV0ZXJzJyksICh4KSAtPlxyXG5cdFx0XHRcdFx0XHRcdHlpZWxkIGdldFN0cmluZyh4LCAnLm5hbWUuZXNjYXBlZFRleHQnKVxyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5uZXdTY29wZSB1bmRlZiwgbFBhcm1zXHJcblxyXG5cdFx0XHRcdHdoZW4gMjYxICAgICMgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0dHJ5XHJcblx0XHRcdFx0XHRcdHZhck5hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuZGVmaW5lIHZhck5hbWVcclxuXHJcblx0XHRcdFx0d2hlbiAyNjMgICAgIyBGdW5jdGlvbkRlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHQjIC0tLSBkbyBjcmVhdGVzIGEgc2NvcGUsIGEgbGEgYW4gSUlGRVxyXG5cdFx0XHRcdFx0ZG9cclxuXHRcdFx0XHRcdFx0ZnVuY05hbWUgOj0gZ2V0U3RyaW5nIG5vZGUsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHJcblx0XHRcdFx0XHRcdGxQYXJtcyA6PSBBcnJheS5mcm9tIE1BUCBnZXRBcnJheShub2RlLCAnLnBhcmFtZXRlcnMnKSwgKHgpIC0+XHJcblx0XHRcdFx0XHRcdFx0eWllbGQgZ2V0U3RyaW5nKHgsICcubmFtZS5lc2NhcGVkVGV4dCcpXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmRlZmluZSBmdW5jTmFtZVxyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5uZXdTY29wZSBmdW5jTmFtZSwgbFBhcm1zXHJcblxyXG5cdFx0XHRcdHdoZW4gMjI3ICAgICMgQmluYXJ5RXhwcmVzc2lvblxyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcubGVmdCdcclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLnJpZ2h0J1xyXG5cclxuXHRcdFx0XHR3aGVuIDIxNCAgICAjIENhbGxFeHByZXNzaW9uXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5leHByZXNzaW9uJ1xyXG5cdFx0XHRcdFx0Zm9yIGFyZyBvZiBnZXRBcnJheShub2RlLCAnLmFyZ3VtZW50cycpXHJcblx0XHRcdFx0XHRcdGNoZWNrTm9kZShhcmcgYXMgTm9kZSlcclxuXHJcblx0XHRcdFx0d2hlbiAyNzMgICAgIyBJbXBvcnREZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0bGliIDo9IGdldFN0cmluZyBub2RlLCAnLm1vZHVsZVNwZWNpZmllci50ZXh0J1xyXG5cdFx0XHRcdFx0Zm9yIGggb2YgZ2V0QXJyYXkobm9kZSwgJy5pbXBvcnRDbGF1c2U/Lm5hbWVkQmluZGluZ3M/LmVsZW1lbnRzJylcclxuXHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgaCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRJbXBvcnQgbGliLCBuYW1lXHJcblxyXG5cdFx0XHRcdHdoZW4gMjgwICAgICMgTmFtZWRFeHBvcnRzXHJcblx0XHRcdFx0XHRmb3IgZWxlbSBvZiBnZXRBcnJheShub2RlLCAnLmVsZW1lbnRzJylcclxuXHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgZWxlbSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ3JlLWV4cG9ydCdcclxuXHJcblx0XHRcdFx0d2hlbiA5NSAgICAgIyBFeHBvcnRLZXl3b3JkXHJcblx0XHRcdFx0XHRwYXJlbnQgOj0gd2Fsa2VyLnBhcmVudCgpXHJcblx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKHBhcmVudCwgJy5raW5kJylcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjQ0ICAgICMgRmlyc3RTdGF0ZW1lbnRcclxuXHRcdFx0XHRcdFx0XHRmb3IgZGVjbCBvZiBnZXRBcnJheShwYXJlbnQsICcuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucycpXHJcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggZ2V0TnVtYmVyKGRlY2wsICcua2luZCcpXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDI2MSAgICAjIFZhcmlhYmxlRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBkZWNsLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0IyAtLS0gQ2hlY2sgaW5pdGlhbGl6ZXIgdG8gZmluZCB0aGUgdHlwZVxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGluaXRLaW5kIDo9IGdldE51bWJlciBkZWNsLCAnLmluaXRpYWxpemVyLmtpbmQnXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0c3dpdGNoIGluaXRLaW5kXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiAyMjAgICAgIyBBcnJvd0Z1bmN0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnZnVuY3Rpb24nXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0d2hlbiA5LCAyNjEgIyBGaXJzdExpdGVyYWxUb2tlbiwgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NvbnN0J1xyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndW5rbm93bidcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjYzICAgIyBGdW5jdGlvbkRlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdmdW5jdGlvbidcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjY0ICAgIyBDbGFzc0RlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdjbGFzcydcclxuXHJcblx0XHRcdFx0XHRcdHdoZW4gMjY2ICAgIyBUeXBlQWxpYXNEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIHBhcmVudCwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAndHlwZSdcclxuXHJcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdFx0Y3JvYWsgXCJVbmV4cGVjdGVkIHN1YnR5cGUgb2YgOTU6ICN7cGFyZW50LmtpbmR9XCJcclxuXHRyZXR1cm4gYW5hbHlzaXNcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5jbGFzcyBDVHlwZXNjcmlwdENvbXBpbGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvQ29tcGlsZVRTJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRMT0cgXCJkb0NvbXBpbGVUUyAnI3twYXRofSdcIlxyXG5cclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRmb3JjZTogYm9vbGVhblxyXG5cdFx0XHR9XHJcblx0XHR7Zm9yY2V9IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRmb3JjZTogZmFsc2VcclxuXHRcdFx0fVxyXG5cclxuXHRcdGFzc2VydCAoZmlsZUV4dChwYXRoKSA9PSAnLnRzJyksIFwiTm90IGEgdHlwZXNjcmlwdCBmaWxlOiAje3BhdGh9XCJcclxuXHRcdGpzUGF0aCA6PSB3aXRoRXh0IHBhdGgsICcuanMnXHJcblxyXG5cdFx0IyAtLS0gQ2hlY2sgaWYgYSBuZXdlciBjb21waWxlZCB2ZXJzaW9uIGFscmVhZHkgZXhpc3RzXHJcblx0XHRpZiAoXHJcblx0XHRcdFx0ICAgbm90IGZvcmNlXHJcblx0XHRcdFx0JiYgYXdhaXQgZXhpc3RzKGpzUGF0aClcclxuXHRcdFx0XHQmJiBuZXdlckRlc3RGaWxlRXhpc3RzKHBhdGgsIGpzUGF0aClcclxuXHRcdFx0XHQpXHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0c3VjY2VzczogdHJ1ZVxyXG5cdFx0XHRcdG5vdE5lZWRlZDogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHR0cnlcclxuXHRcdFx0aFJlc3VsdCA6PSBhd2FpdCBleGVjQ21kICdkZW5vJywgW1xyXG5cdFx0XHRcdCdidW5kbGUnXHJcblx0XHRcdFx0Jy0tbWluaWZ5J1xyXG5cdFx0XHRcdHBhdGhcclxuXHRcdFx0XHRqc1BhdGhcclxuXHRcdFx0XHRdXHJcblx0XHRcdGlmIG5vdCBoUmVzdWx0LnN1Y2Nlc3NcclxuXHRcdFx0XHRjb25zb2xlLmxvZyBAZ2V0T3V0cHV0KGhSZXN1bHQpXHJcblx0XHRcdFx0Y3JvYWsgXCJDb21waWxlIGZhaWxlZFwiXHJcblx0XHRcdHJldHVybiBoUmVzdWx0XHJcblxyXG5cdFx0Y2F0Y2ggZXJyXHJcblx0XHRcdGlmIGRlYnVnZ2luZ1xyXG5cdFx0XHRcdExPRyBnZXRFcnJTdHIoZXJyKVxyXG5cdFx0XHRlcnJNc2cgOj0gXCJDT01QSUxFIEZBSUxFRDogI3twYXRoU3RyKHBhdGgpfSAtICN7Z2V0RXJyU3RyKGVycil9XCJcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZVxyXG5cdFx0XHRcdHN0ZGVycjogZXJyTXNnXHJcblx0XHRcdFx0fVxyXG5cclxuZXhwb3J0IGRvQ29tcGlsZVRTIDo9IG5ldyBDVHlwZXNjcmlwdENvbXBpbGVyKClcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQVNZTkNcclxuXHJcbmV4cG9ydCBjb21waWxlQWxsVFMgOj0gKFxyXG5cdFx0cm9vdCA9ICcuJ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogVEV4ZWNSZXN1bHRbXSA9PlxyXG5cclxuXHQjIC0tLSB3aXRoICdxdWlldCcgb3B0aW9uLCBzdGlsbCByZXBvcnRzIGVycm9yc1xyXG5cdHBhdHRlcm4gOj0gbWtwYXRoKHJvb3QsICcqKi8qLmxpYi50cycpXHJcblx0TE9HIFwicGF0dGVybiA9ICcje3BhdHRlcm59J1wiXHJcblx0c3BlYzogVFByb2NTcGVjIDo9IFtkb0NvbXBpbGVUUywgW3BhdHRlcm5dXVxyXG5cdHJldHVybiBhd2FpdCBwcm9jRmlsZXMgc3BlYywge1xyXG5cdFx0Li4uaE9wdGlvbnNcclxuXHRcdHF1aWV0OiB0cnVlXHJcblx0XHRhYm9ydE9uRXJyb3I6IHRydWVcclxuXHRcdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5jbGFzcyBDVW5pdFRlc3RlciBleHRlbmRzIENGaWxlSGFuZGxlclxyXG5cclxuXHRnZXQgb3AoKVxyXG5cdFx0cmV0dXJuICdkb1VuaXRUZXN0J1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaGFuZGxlKFxyXG5cdFx0XHRwYXRoOiBzdHJpbmcsXHJcblx0XHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdFx0KTogVEV4ZWNSZXN1bHRcclxuXHJcblx0XHRhc3NlcnQgcGF0aC5lbmRzV2l0aCgnLnRlc3QudHMnKSwgXCJOb3QgYSB1bml0IHRlc3QgZmlsZVwiXHJcblx0XHR0eXBlIG9wdCA9IHtcclxuXHRcdFx0Y2FwdHVyZTogYm9vbGVhblxyXG5cdFx0XHRpbnNwZWN0OiBib29sZWFuXHJcblx0XHRcdGxpbmVOdW06IHN0cmluZz9cclxuXHRcdFx0fVxyXG5cdFx0e2NhcHR1cmUsIGluc3BlY3QsIGxpbmVOdW19IDo9IGdldE9wdGlvbnM8b3B0PiBoT3B0aW9ucywge1xyXG5cdFx0XHRjYXB0dXJlOiB0cnVlXHJcblx0XHRcdGluc3BlY3Q6IGZhbHNlXHJcblx0XHRcdGxpbmVOdW06IHVuZGVmXHJcblx0XHRcdH1cclxuXHJcblx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdFx0J3Rlc3QnXHJcblx0XHRcdFx0Jy1BJ1xyXG5cdFx0XHRcdC4uLihpbnNwZWN0ID8gWyctLWluc3BlY3QtYnJrJ10gOiBbJy0tY292ZXJhZ2U9Li9jb3ZlcmFnZSddKVxyXG5cdFx0XHRcdC4uLihkZWZpbmVkKGxpbmVOdW0pID8gWyctLWZpbHRlcicsIFwiL15saW5lICN7bGluZU51bX0kL1wiXSA6IFtdKVxyXG5cdFx0XHRcdHBhdGhcclxuXHRcdFx0XHRdLCB7Y2FwdHVyZX1cclxuXHRcdHJldHVybiBoUmVzdWx0XHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBnZXRPdXRwdXQoaFJlc3VsdDogVEV4ZWNSZXN1bHQpOiBzdHJpbmdcclxuXHJcblx0XHR7c3Rkb3V0LCBzdGRlcnJ9IDo9IGhSZXN1bHRcclxuXHRcdG91dHB1dCA6PSBbc3Rkb3V0LCBzdGRlcnJdLmpvaW4oKVxyXG5cdFx0aWYgbm90IGhSZXN1bHQuc3VjY2VzcyB8fCBvdXRwdXQubWF0Y2goL2Nyb2FrfGVycm9yL2kpXHJcblx0XHRcdHJldHVybiBvdXRwdXRcclxuXHJcblx0XHRsTGluZXMgOj0gQXJyYXkuZnJvbSBNQVAgYWxsTGluZXNJbkJsb2NrKGRlY29sb3JpemUob3V0cHV0KSksIChsaW5lKSAtPlxyXG5cdFx0XHRpZiBsaW5lLnN0YXJ0c1dpdGgoJ3J1bm5pbmcnKVxyXG5cdFx0XHRcdHlpZWxkIGxpbmVcclxuXHRcdFx0XHR5aWVsZCAnJ1xyXG5cdFx0XHRlbHNlIGlmIGxpbmUuc3RhcnRzV2l0aCgnbGluZScpXHJcblx0XHRcdFx0aWYgbm90IGxpbmUuaW5jbHVkZXMoJyBvayAnKVxyXG5cdFx0XHRcdFx0eWllbGQgd2l0aENvbG9ycyBsaW5lLCB7XHJcblx0XHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0RkFJTEVEOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRPSzogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygncGFzc2VkJykgJiYgbGluZS5pbmNsdWRlcygnZmFpbGVkJylcclxuXHRcdFx0XHRpZiBsaW5lLmluY2x1ZGVzKCcgMCBmYWlsZWQgJylcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRvazogJ2dyZWVuJ1xyXG5cdFx0XHRcdFx0XHRwYXNzZWQ6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0ZmFpbGVkOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHRGQUlMRUQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHR5aWVsZCAnJ1xyXG5cdFx0XHRlbHNlIGlmIGxpbmUuaW5jbHVkZXMoJ0xjb3YgY292ZXJhZ2UnKVxyXG5cdFx0XHRcdHlpZWxkICdjb3ZlcmFnZSByZXBvcnQgZ2VuZXJhdGVkJ1xyXG5cdFx0cmV0dXJuIGxMaW5lcy5qb2luKCdcXG4nKVxyXG5cclxuZXhwb3J0IGRvVW5pdFRlc3QgOj0gbmV3IENVbml0VGVzdGVyKClcclxuIl19