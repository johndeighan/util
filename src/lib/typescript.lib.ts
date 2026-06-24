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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdC5saWIudHMiLCJzb3VyY2VzIjpbInR5cGVzY3JpcHQubGliLmNpdmV0Il0sIm1hcHBpbmdzIjoiO0FBQUEsdUJBQXNCO0FBQ3RCLEFBQUE7QUFDQSxLLFcseUI7QUFBQSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMxQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUN4RCxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzlELENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUM7QUFDaEQsQ0FBQyxlQUFlLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFlBQVksQ0FBQztBQUN0RCxDQUFDLDRCQUE0QixDQUFDLENBQUMsNkJBQTZCLENBQUM7QUFDN0QsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUN4QixBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDMUQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDaEIsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDdEQsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUMxQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUNkLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzlCLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQy9DLENBQUMsVUFBVSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQzVDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXO0FBQ25CLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQztBQUNSLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3RDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTO0FBQ2pCLEFBQUEsQUFBQSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUNsQyxBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUM7QUFDUixDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUNwRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztBQUNqQixBQUFBLEFBQUEsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFDM0MsQUFBQSxBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxL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O0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEU7QUFBRSxDQUFBO0FBQ3hFLEFBQUE7QUFDQSxBQUFBLDhFQUE2RTtBQUM3RSxBQUFBO0FBQ0EsQUFBQSxBQUFBLE1BQU0sQ0FBWSxNQUFYLFdBQVcsQ0FBQyxDQUFFLENBQUMsQ0FBQztBQUN2QixBQUFBLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2YsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQSxDQUFBO0FBQ2QsQUFBQTtBQUNBLEFBQUEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQUFBQSxFQUFFLFFBQVEsQyxDLEMsQ0FBQyxBQUFDLE1BQU0sQ0FBQyxDLEMsWSxDQUFFO0FBQ3JCLEVBQUUsQ0FBQztBQUNILEFBQUEsQ0FBVyxNQUFWLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxBQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDMUMsQUFBQSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUs7QUFDakIsRUFBRSxDQUFDLENBQUE7QUFDSCxBQUFBO0FBQ0EsQUFBQSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3RCLEFBQUEsRUFBRSxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDdkIsQUFBQSxFQUFFLFFBQVEsQ0FBQTtBQUNWLEFBQUEsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFL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QyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUMxQyxBQUFBLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDO0VBQUMsQ0FBQTtBQUM5QyxBQUFBLEVBQUUsTUFBTSxDQUFDLFE7Q0FBUSxDQUFBO0FBQ2pCLEFBQUE7QUFDQSxBQUFBLENBQUMsNkRBQTREO0FBQzdELEFBQUE7QUFDQSxBQUFBLEMsVUFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsQ0FBQTtBQUN2QixBQUFBO0FBQ0EsQUFBQSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFBLEFBQUMsSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDO0NBQUEsQ0FBQTtBQUNwQyxBQUFBO0FBQ0EsQUFBQSxDQUFDLDZEQUE0RDtBQUM3RCxBQUFBO0FBQ0EsQUFBQSxDLFVBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBLENBQUE7QUFDdkIsQUFBQTtBQUNBLEFBQUEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQSxBQUFDLEksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQztDQUFBLENBQUE7QUFDdEMsQUFBQTtBQUNBLEFBQUEsQ0FBQyw2REFBNEQ7QUFDN0QsQUFBQTtBQUNBLEFBQUEsQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxDQUFBO0FBQ3JCLEFBQUE7QUFDQSxBQUFBLEVBQVEsTUFBTixNQUFNLENBQUMsQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFB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QUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDekUsQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFBLE1BQUEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDekMsQUFBQSxFQUFRLE1BQU4sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSTtBQUNoQixBQUFBLEVBQUUsR0FBRyxDQUFBLEtBQUssQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDdkMsQUFBQSxHQUFHLEdBQUcsQ0FBQSxBQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEM7RUFBQSxDQUFBO0FBQ2hFLEFBQUE7QUFDQSxBQUFBLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQTtBQUN0QixBQUFBLEdBQUcsTUFBTSxDQUFBLEFBQUMsSUFBSSxDQUFBLENBQUEsQ0FBQTtBQUNkLEFBQUE7QUFDQSxBQUFBLElBQUksSUFBSSxDQUFDLEdBQUcsQyxLQUFDLEFBQUMsR0FBRyxDQUFBLENBQUEsQ0FBQSxHQUFHLHFDQUFvQztBQUN4RCxBQUFBLEtBQUssUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE87SUFBQSxDO0dBQUEsQztFQUFBLENBQUE7QUFDeEIsQUFBQTtBQUNBLEFBQUEsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFFLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQTtBQUM1QixBQUFBO0FBQ0EsQUFBQSxH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QUFDLENBQUMsQ0FBQyxDQUFRLFEsQ0FBUCxDQUFDLElBQUksQ0FBQyxDQUFHLENBQUE7QUFDcEUsQUFBQSxHQUFHLEdBQUcsQ0FBQSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM3QixBQUFBLElBQUksR0FBRyxDQUFBLENBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDaEMsQUFBQSxLQUFLLEtBQUssQ0FBQyxVQUFVLENBQUEsQUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzdCLEFBQUEsTUFBTSxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUE7QUFDbkIsQUFBQSxNQUFNLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUNuQixBQUFBLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFBO0FBQ2pCLEFBQUEsTUFBTSxFQUFFLENBQUMsQ0FBQyxPQUFPO0FBQ2pCLE1BQU0sQ0FBQyxDO0lBQUEsQztHQUFBLENBQUE7QUFDUCxBQUFBLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUEsQ0FBQTtBQUM3RCxBQUFBLElBQUksR0FBRyxDQUFBLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUEsQ0FBQSxDQUFBO0FBQ2xDLEFBQUEsS0FBSyxLQUFLLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUM3QixBQUFBLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFBO0FBQ2pCLEFBQUEsTUFBTSxNQUFNLENBQUMsQ0FBQyxPQUFPO0FBQ3JCLE1BQU0sQ0FBQyxDO0lBQUEsQ0FBQTtBQUNQLEFBQUEsSUFBSSxJQUFJLENBQUEsQ0FBQTtBQUNSLEFBQUEsS0FBSyxLQUFLLENBQUMsVUFBVSxDQUFBLEFBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUM3QixBQUFBLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFBO0FBQ2pCLEFBQUEsTUFBTSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUE7QUFDckIsQUFBQSxNQUFNLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUNuQixBQUFBLE1BQU0sTUFBTSxDQUFDLENBQUMsS0FBSztBQUNuQixNQUFNLENBQUMsQztJQUFBLEM7R0FBQSxDQUFBO0FBQ1AsQUFBQSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQSxDQUFBLENBQUE7QUFDekMsQUFBQSxJQUFJLEtBQUssQ0FBQywyQjtHQUEyQixDO0VBQUEsQ0FBQSxDQUFBLENBQUE7QUFDckMsQUFBQSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQztDQUFDLEM7QUFBQSxDQUFBO0FBQzFCLEFBQUE7QUFDQSxBQUFBLEFBQUEsTUFBTSxDQUFXLE1BQVYsVUFBVSxDQUFDLENBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDdEMiLCJuYW1lcyI6W10sInNvdXJjZXNDb250ZW50IjpbIiMgdHlwZXNjcmlwdC5saWIuY2l2ZXRcclxuXHJcbmltcG9ydCB7ZXhpc3RzLCBleGlzdHNTeW5jfSBmcm9tICdAc3RkL2ZzJ1xyXG5pbXBvcnQge1xyXG5cdFNvdXJjZUZpbGUsIE5vZGUsIFNjcmlwdFRhcmdldCwgU3ludGF4S2luZCwgTW9kdWxlS2luZCxcclxuXHROZXdMaW5lS2luZCwgRW1pdEhpbnQsIENvbXBpbGVyT3B0aW9ucywgTW9kdWxlUmVzb2x1dGlvbktpbmQsXHJcblx0Y3JlYXRlU291cmNlRmlsZSwgY3JlYXRlUHJpbnRlciwgY3JlYXRlUHJvZ3JhbSxcclxuXHR0cmFuc3BpbGVNb2R1bGUsIGdldFByZUVtaXREaWFnbm9zdGljcywgZm9yRWFjaENoaWxkLFxyXG5cdGZsYXR0ZW5EaWFnbm9zdGljTWVzc2FnZVRleHQsIGdldExpbmVBbmRDaGFyYWN0ZXJPZlBvc2l0aW9uLFxyXG5cdH0gZnJvbSAnbnBtLXR5cGVzY3JpcHQnXHJcblxyXG5pbXBvcnQge1xyXG5cdExPRywgREJHLCBFUlIsIElOREVOVCwgVU5ERU5ULCBwdXNoTG9nTGV2ZWwsIHBvcExvZ0xldmVsLFxyXG5cdH0gZnJvbSAnbG9nZ2VyJ1xyXG5pbXBvcnQge1xyXG5cdHVuZGVmLCBkZWZpbmVkLCBub3RkZWZpbmVkLCBjcm9haywgYXNzZXJ0LCBnZXRFcnJTdHIsXHJcblx0ZXh0cmFjdFNvdXJjZU1hcCwgd2l0aENvbG9ycywgZGVjb2xvcml6ZSxcclxuXHR9IGZyb20gJ2Jhc2UnXHJcbmltcG9ydCB7XHJcblx0aW50ZWdlciwgaGFzaCwgaGFzaG9mLCBhcnJheSxcclxuXHRpc0hhc2gsIGlzU3RyaW5nLCBpc0VtcHR5LCBub25FbXB0eSwgaXNOdW1iZXIsXHJcblx0aXNGdW5jdGlvbiwgZnVuY3Rpb25EZWYsIGlzQ2xhc3MsIGNsYXNzRGVmLFxyXG5cdH0gZnJvbSAnZGF0YXR5cGVzJ1xyXG5pbXBvcnQge1xyXG5cdGdldE9wdGlvbnMsIHNwYWNlcywgbywgd29yZHMsIGhhc0tleSxcclxuXHRDU3RyaW5nU2V0TWFwLCBrZXlzLCBzZXAsIGFsbExpbmVzSW4sIGYsXHJcblx0fSBmcm9tICdsbHV0aWxzJ1xyXG5pbXBvcnQge2RlYnVnZ2luZ30gZnJvbSAnY21kLWFyZ3MnXHJcbmltcG9ydCB7XHJcblx0ZXh0cmFjdCwgVFBhdGhJdGVtLCBnZXRTdHJpbmcsIGdldE51bWJlciwgZ2V0QXJyYXksXHJcblx0fSBmcm9tICdleHRyYWN0J1xyXG5pbXBvcnQge1RCbG9ja0Rlc2MsIEJsb2NraWZ5fSBmcm9tICdpbmRlbnQnXHJcbmltcG9ydCB7XHJcblx0aXNGaWxlLCBzbHVycCwgYmFyZiwgYmFyZlRlbXBGaWxlLCBmaWxlRXh0LCB3aXRoRXh0LFxyXG5cdHBhdGhTdHIsIG1rcGF0aCwgbmV3ZXJEZXN0RmlsZUV4aXN0cyxcclxuXHR9IGZyb20gJ2ZzeXMnXHJcbmltcG9ydCB7XHJcblx0T0wsIHRvTmljZSwgVE1hcEZ1bmMsIERVTVAsIExPR1ZBTFVFLCBEQkdWQUxVRSxcclxuXHR9IGZyb20gJ25pY2UnXHJcbmltcG9ydCB7XHJcblx0ZXhlY0NtZCwgQ0ZpbGVIYW5kbGVyLCBUUHJvY1NwZWMsIFRFeGVjUmVzdWx0LFxyXG5cdHByb2NPbmVGaWxlLCBwcm9jRmlsZXMsXHJcblx0fSBmcm9tICdleGVjJ1xyXG5pbXBvcnQge1dhbGtlciwgVFZpc2l0S2luZH0gZnJvbSAnd2Fsa2VyJ1xyXG5pbXBvcnQge0NNYWluU2NvcGUsIENTY29wZX0gZnJvbSAnc2NvcGUnXHJcbmltcG9ydCB7Z2V0TmVlZGVkSW1wb3J0U3RtdHN9IGZyb20gJ3N5bWJvbHMnXHJcbmltcG9ydCB7TUFQfSBmcm9tICdtYXBwZXInXHJcbmltcG9ydCB7dHlwZUNoZWNrVHNGaWxlfSBmcm9tICdsbHR5cGVzY3JpcHQnXHJcblxyXG5kZWNvZGVyIDo9IG5ldyBUZXh0RGVjb2RlciBcInV0Zi04XCJcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQga2luZFN0ciA6PSAoaTogbnVtYmVyKTogc3RyaW5nID0+XHJcblxyXG5cdHJldHVybiBTeW50YXhLaW5kW2ldXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IHRzMmFzdCA6PSAoXHJcblx0XHR0c0NvZGU6IHN0cmluZyxcclxuXHRcdGhPcHRpb25zOiBoYXNoID0ge31cclxuXHRcdCk6IE5vZGUgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRmaWxlTmFtZTogc3RyaW5nXHJcblx0XHR9XHJcblx0e2ZpbGVOYW1lfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGZpbGVOYW1lOiAndGVtcC50cydcclxuXHRcdH1cclxuXHJcblx0W2NvZGUsIGhTcmNNYXBdIDo9IGV4dHJhY3RTb3VyY2VNYXAodHNDb2RlKVxyXG5cdGhBc3QgOj0gY3JlYXRlU291cmNlRmlsZSBmaWxlTmFtZSwgY29kZSwgU2NyaXB0VGFyZ2V0LkxhdGVzdFxyXG5cdHJldHVybiBoQXN0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGFzdDJ0cyA6PSAoXHJcblx0XHRub2RlOiBOb2RlXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0YXNzZXJ0IChub2RlLmtpbmQgPT0gMzA4KSwgXCJOb3QgYSBTb3VyY2VGaWxlIG5vZGVcIlxyXG5cdHByaW50ZXIgOj0gY3JlYXRlUHJpbnRlciBuZXdMaW5lOiBOZXdMaW5lS2luZC5MaW5lRmVlZFxyXG5cdHJldHVybiBwcmludGVyLnByaW50Tm9kZShFbWl0SGludC5VbnNwZWNpZmllZCwgbm9kZSwgbm9kZSBhcyBTb3VyY2VGaWxlKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyAtLS0gcGFzc2VkIHRvIHRvTmljZSgpIHRvIGFkZCBhIGRlc2NyaXB0aW9uIHRvIHNvbWUgbm9kZXNcclxuXHJcbmV4cG9ydCBkZXNjRnVuYzogVE1hcEZ1bmMgOj0gKFxyXG5cdFx0a2V5OiBzdHJpbmdcclxuXHRcdHZhbHVlOiB1bmtub3duXHJcblx0XHRoUGFyZW50OiB1bmtub3duXHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0cmV0dXJuIChrZXkgPT0gJ2tpbmQnKSAmJiBpc051bWJlcih2YWx1ZSkgPyBmXCIoI3traW5kU3RyKHZhbHVlKX0pXCIgOiAnJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3RBc1N0cmluZyA6PSAoXHJcblx0XHRoQXN0OiBvYmplY3QsXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBzdHJpbmcgPT5cclxuXHJcblx0dHlwZSBvcHQgPSB7XHJcblx0XHRsSW5jbHVkZTogc3RyaW5nW10/XHJcblx0XHR9XHJcblx0e2xJbmNsdWRlfSA6PSBnZXRPcHRpb25zPG9wdD4gaE9wdGlvbnMsIHtcclxuXHRcdGxJbmNsdWRlOiB1bmRlZlxyXG5cdFx0fVxyXG5cclxuXHRyZXR1cm4gdG9OaWNlIGhBc3QsIHtcclxuXHRcdGlnbm9yZUVtcHR5S2V5czogdHJ1ZVxyXG5cdFx0bEluY2x1ZGVcclxuXHRcdGxFeGNsdWRlOiB3b3JkcyhcIlwiXCJcclxuXHRcdFx0cG9zIGVuZCBpZCBmbGFncyBtb2RpZmllckZsYWdzQ2FjaGVcclxuXHRcdFx0dHJhbnNmb3JtRmxhZ3MgaGFzRXh0ZW5kZWRVbmljb2RlRXNjYXBlXHJcblx0XHRcdG51bWVyaWNMaXRlcmFsRmxhZ3Mgc2V0RXh0ZXJuYWxNb2R1bGVJbmRpY2F0b3JcclxuXHRcdFx0bGFuZ3VhZ2VWZXJzaW9uIGxhbmd1YWdlVmFyaWFudCBqc0RvY1BhcnNpbmdNb2RlXHJcblx0XHRcdGhhc05vRGVmYXVsdExpYlxyXG5cdFx0XHRcIlwiXCIpXHJcblx0XHR9XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGdldEltcG9ydENvZGUgOj0gKHR5cGVTdHI6IHN0cmluZyk6IHN0cmluZyA9PlxyXG5cclxuXHREQkcgXCJDQUxMIGdldEltcG9ydENvZGUoKVwiXHJcblx0bFN5bWJvbHMgOj0gZ2V0U3ltYm9sc0Zyb21UeXBlIHR5cGVTdHJcclxuXHREQkdWQUxVRSAnbFN5bWJvbHMnLCBsU3ltYm9sc1xyXG5cdGlmIG5vbkVtcHR5KGxTeW1ib2xzKVxyXG5cdFx0bFN0bXRzIDo9IGdldE5lZWRlZEltcG9ydFN0bXRzIGxTeW1ib2xzXHJcblx0XHREQkdWQUxVRSAnbFN0bXRzJywgbFN0bXRzXHJcblx0XHRyZXR1cm4gbFN0bXRzLmpvaW4gJ1xcbidcclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gJydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0U3ltYm9sc0Zyb21UeXBlIDo9IChcclxuXHRcdHR5cGVTdHI6IHN0cmluZ1xyXG5cdFx0KTogc3RyaW5nW10gPT5cclxuXHJcblx0aWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL14oW0EtWmEtel1bQS1aYS16MC05K10qKSg/OlxcPChbQS1aYS16XVtBLVphLXowLTkrXSopXFw+KT8kLykpXHJcblx0XHRbXywgdHlwZSwgc3VidHlwZV0gOj0gbE1hdGNoZXNcclxuXHRcdHJldHVybiBub25FbXB0eShzdWJ0eXBlKSA/IFt0eXBlLCBzdWJ0eXBlXSA6IFt0eXBlXVxyXG5cdGVsc2UgaWYgKGxNYXRjaGVzIDo9IHR5cGVTdHIubWF0Y2goL15cXChcXClcXHMqXFw9XFw+XFxzKihbQS1aYS16XVtBLVphLXowLTkrXSopJC8pKVxyXG5cdFx0cmV0dXJuIFtsTWF0Y2hlc1sxXV1cclxuXHRlbHNlXHJcblx0XHRyZXR1cm4gW11cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5oRGVmQ29uZmlnOiBDb21waWxlck9wdGlvbnMgOj0ge1xyXG5cdFwiYWxsb3dKc1wiOiBmYWxzZVxyXG5cdFwiYWxsb3dVbWRHbG9iYWxBY2Nlc3NcIjogZmFsc2VcclxuXHRcImFsbG93VW5yZWFjaGFibGVDb2RlXCI6IGZhbHNlXHJcblx0XCJhbGxvd1VudXNlZExhYmVsc1wiOiBmYWxzZVxyXG5cdFwiYWx3YXlzU3RyaWN0XCI6IHRydWVcclxuXHRcImFzc3VtZUNoYW5nZXNPbmx5QWZmZWN0RGlyZWN0RGVwZW5kZW5jaWVzXCI6IGZhbHNlXHJcblx0XCJjaGVja0pzXCI6IGZhbHNlXHJcblx0XCJjb21wb3NpdGVcIjogZmFsc2VcclxuXHRcImRlY2xhcmF0aW9uXCI6IGZhbHNlXHJcblx0XCJkZWNsYXJhdGlvbkRpclwiOiB1bmRlZmluZWRcclxuXHRcImRlY2xhcmF0aW9uTWFwXCI6IGZhbHNlXHJcblx0XCJlbWl0Qk9NXCI6IGZhbHNlXHJcblx0XCJlbWl0RGVjbGFyYXRpb25Pbmx5XCI6IGZhbHNlXHJcblx0XCJleGFjdE9wdGlvbmFsUHJvcGVydHlUeXBlc1wiOiBmYWxzZVxyXG5cdFwiZXhwZXJpbWVudGFsRGVjb3JhdG9yc1wiOiBmYWxzZVxyXG5cdFwiZm9yY2VDb25zaXN0ZW50Q2FzaW5nSW5GaWxlTmFtZXNcIjogdHJ1ZVxyXG5cdFwiZ2VuZXJhdGVDcHVQcm9maWxlXCI6IG51bGxcclxuXHRcImdlbmVyYXRlVHJhY2VcIjogbnVsbFxyXG5cdFwiaWdub3JlRGVwcmVjYXRpb25zXCI6IFwiNS4wXCJcclxuXHRcImltcG9ydEhlbHBlcnNcIjogZmFsc2VcclxuXHRcImlubGluZVNvdXJjZU1hcFwiOiBmYWxzZVxyXG5cdFwiaW5saW5lU291cmNlc1wiOiBmYWxzZVxyXG5cdFwiaXNvbGF0ZWRNb2R1bGVzXCI6IGZhbHNlXHJcblx0I1x0XCJqc3hcIjogXCJyZWFjdC1qc3hcIixcclxuXHQjXHRcImpzeEZhY3RvcnlcIjogXCJSZWFjdC5jcmVhdGVFbGVtZW50XCIsXHJcblx0I1x0XCJqc3hGcmFnbWVudEZhY3RvcnlcIjogXCJSZWFjdC5GcmFnbWVudFwiLFxyXG5cdCNcdFwianN4SW1wb3J0U291cmNlXCI6IFwicmVhY3RcIixcclxuXHRcImxpYlwiOiBbXHJcblx0XHRcImVzbmV4dFwiXHJcblx0XHRcImRvbVwiXHJcblx0XHRcImRvbS5pdGVyYWJsZVwiXHJcblx0XHRdXHJcblx0XCJtYXBSb290XCI6IHVuZGVmaW5lZFxyXG5cdFwibWF4Tm9kZU1vZHVsZUpzRGVwdGhcIjogMFxyXG5cdFwibW9kdWxlXCI6IE1vZHVsZUtpbmQuRVNOZXh0XHJcblx0XCJtb2R1bGVEZXRlY3Rpb25cIjogdW5kZWZpbmVkXHJcblx0XCJtb2R1bGVSZXNvbHV0aW9uXCI6IE1vZHVsZVJlc29sdXRpb25LaW5kLk5vZGVOZXh0XHJcblx0XCJuZXdMaW5lXCI6IE5ld0xpbmVLaW5kLkxpbmVGZWVkXHJcblx0XCJub0VtaXRcIjogdHJ1ZVxyXG5cdFwibm9FbWl0SGVscGVyc1wiOiBmYWxzZVxyXG5cdFwibm9FbWl0T25FcnJvclwiOiBmYWxzZVxyXG5cdFwibm9FcnJvclRydW5jYXRpb25cIjogZmFsc2VcclxuXHRcIm5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRBbnlcIjogdHJ1ZVxyXG5cdFwibm9JbXBsaWNpdE92ZXJyaWRlXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRSZXR1cm5zXCI6IHRydWVcclxuXHRcIm5vSW1wbGljaXRUaGlzXCI6IHRydWVcclxuXHRcIm5vUHJvcGVydHlBY2Nlc3NGcm9tSW5kZXhTaWduYXR1cmVcIjogdHJ1ZVxyXG5cdFwibm9VbmNoZWNrZWRJbmRleGVkQWNjZXNzXCI6IHRydWVcclxuXHRcIm5vVW51c2VkTG9jYWxzXCI6IHRydWVcclxuXHRcIm5vVW51c2VkUGFyYW1ldGVyc1wiOiB0cnVlXHJcblx0XCJvdXREaXJcIjogdW5kZWZpbmVkXHJcblx0XCJvdXRGaWxlXCI6IHVuZGVmaW5lZFxyXG5cdFwicGF0aHNcIjoge31cclxuXHRcInByZXNlcnZlQ29uc3RFbnVtc1wiOiBmYWxzZVxyXG5cdFwicHJlc2VydmVTeW1saW5rc1wiOiBmYWxzZVxyXG5cdFwicHJlc2VydmVWYWx1ZUltcG9ydHNcIjogZmFsc2VcclxuXHRcInJlYWN0TmFtZXNwYWNlXCI6IFwiUmVhY3RcIlxyXG5cdFwicmVtb3ZlQ29tbWVudHNcIjogZmFsc2VcclxuXHRcInJlc29sdmVKc29uTW9kdWxlXCI6IHRydWVcclxuXHRcInJvb3REaXJcIjogdW5kZWZpbmVkXHJcblx0XCJyb290RGlyc1wiOiBbXVxyXG5cdFwic2tpcERlZmF1bHRMaWJDaGVja1wiOiBmYWxzZVxyXG5cdFwic2tpcExpYkNoZWNrXCI6IGZhbHNlXHJcblx0XCJzb3VyY2VNYXBcIjogZmFsc2VcclxuXHRcInNvdXJjZVJvb3RcIjogdW5kZWZpbmVkXHJcblx0XCJzdHJpY3RcIjogdHJ1ZVxyXG5cdFwic3RyaWN0QmluZENhbGxBcHBseVwiOiB0cnVlXHJcblx0XCJzdHJpY3RGdW5jdGlvblR5cGVzXCI6IHRydWVcclxuXHRcInN0cmljdE51bGxDaGVja3NcIjogdHJ1ZVxyXG5cdFwic3RyaWN0UHJvcGVydHlJbml0aWFsaXphdGlvblwiOiB0cnVlXHJcblx0XCJzdHJpcEludGVybmFsXCI6IGZhbHNlXHJcblx0XCJzdXBwcmVzc0V4Y2Vzc1Byb3BlcnR5RXJyb3JzXCI6IGZhbHNlXHJcblx0XCJzdXBwcmVzc0ltcGxpY2l0QW55SW5kZXhFcnJvcnNcIjogZmFsc2VcclxuXHRcInRhcmdldFwiOiBTY3JpcHRUYXJnZXQuRVMyMDIyXHJcblx0XCJ0cmFjZVJlc29sdXRpb25cIjogZmFsc2VcclxuXHRcInRzQnVpbGRJbmZvRmlsZVwiOiB1bmRlZmluZWRcclxuXHRcInR5cGVSb290c1wiOiBbXVxyXG5cdFwidXNlRGVmaW5lRm9yQ2xhc3NGaWVsZHNcIjogdHJ1ZVxyXG5cdFwidXNlVW5rbm93bkluQ2F0Y2hWYXJpYWJsZXNcIjogdHJ1ZVxyXG5cdH1cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50eXBlIFRBc3RGaWx0ZXJGdW5jID0gKFxyXG5cdFx0bm9kZTogTm9kZVxyXG5cdFx0KSA9PiBib29sZWFuXHJcblxyXG5leHBvcnQgY2xhc3MgQXN0V2Fsa2VyIGV4dGVuZHMgV2Fsa2VyPE5vZGU+XHJcblxyXG5cdGZpbHRlckZ1bmM6IFRBc3RGaWx0ZXJGdW5jP1xyXG5cdGhPcHRpb25zOiBoYXNoXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdFx0QGZpbHRlckZ1bmM6IFRBc3RGaWx0ZXJGdW5jPyA9IHVuZGVmLFxyXG5cdFx0XHRAaE9wdGlvbnMgPSB7fVxyXG5cdFx0XHQpXHJcblx0XHRzdXBlcigpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRkYmcob3A6ICdwdXNoJyB8ICdwb3AnLCBub2RlOiBOb2RlKTogdm9pZFxyXG5cclxuXHRcdHByZWZpeCA6PSAnICAgJ1xyXG5cdFx0a2luZCA6PSBub2RlLmtpbmRcclxuXHRcdGNvbnNvbGUubG9nIFwiI3twcmVmaXh9I3tvcC50b1VwcGVyQ2FzZSgpfTogI3traW5kfSBbI3tAc3RhY2tEZXNjKCl9XVwiXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdHN0YWNrRGVzYygpOiBzdHJpbmdcclxuXHJcblx0XHRyZXN1bHRzIDo9IFtdXHJcblx0XHRmb3Igbm9kZSBvZiBAbE5vZGVTdGFja1xyXG5cdFx0XHRyZXN1bHRzLnB1c2ggbm9kZS5raW5kLnRvU3RyaW5nKClcclxuXHRcdGxTdGFjayA6PSByZXN1bHRzXHJcblx0XHRyZXR1cm4gbFN0YWNrLmpvaW4gJywnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBwdXNoTm9kZShub2RlOiBOb2RlKTogdm9pZFxyXG5cclxuXHRcdHN1cGVyLnB1c2hOb2RlIG5vZGVcclxuXHRcdGlmIEBoT3B0aW9ucy50cmFjZVxyXG5cdFx0XHRAZGJnICdwdXNoJywgbm9kZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBwb3BOb2RlKCk6IE5vZGU/XHJcblxyXG5cdFx0bm9kZSA6PSBzdXBlci5wb3BOb2RlKClcclxuXHRcdGlmIEBoT3B0aW9ucy50cmFjZVxyXG5cdFx0XHRpZiBkZWZpbmVkKG5vZGUpXHJcblx0XHRcdFx0QGRiZyAncG9wJywgbm9kZVxyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0Y29uc29sZS5sb2cgXCJTVEFDSyBFTVBUWVwiXHJcblx0XHRyZXR1cm4gbm9kZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgaXNOb2RlKHg6IG9iamVjdCk6IHggaXMgTm9kZVxyXG5cclxuXHRcdHJldHVybiBPYmplY3QuaGFzT3duIHgsICdraW5kJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0b3ZlcnJpZGUgZmlsdGVyKG5vZGU6IE5vZGUpOiBib29sZWFuXHJcblxyXG5cdFx0cmV0dXJuIGRlZmluZWQoQGZpbHRlckZ1bmMpID8gQGZpbHRlckZ1bmMobm9kZSkgOiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuZXhwb3J0IGNsYXNzIENBbmFseXNpc1xyXG5cclxuXHR0cmFjZSA9IGZhbHNlXHJcblx0bUltcG9ydHMgPSBuZXcgQ1N0cmluZ1NldE1hcCgpXHJcblx0bUV4cG9ydHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpXHJcblx0c01pc3NpbmcgPSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdG1haW5TY29wZSA9IG5ldyBDTWFpblNjb3BlKClcclxuXHRjdXJTY29wZTogQ1Njb3BlXHJcblx0ZmluaXNoZWQgPSBmYWxzZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y29uc3RydWN0b3IoQHRyYWNlID0gZmFsc2UpXHJcblxyXG5cdFx0QGN1clNjb3BlID0gQG1haW5TY29wZVxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0ZGVmaW5lKG5hbWU6IHN0cmluZyk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgZGVmaW5lICN7bmFtZX1cIlxyXG5cdFx0QGN1clNjb3BlLmRlZmluZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdHVzZShuYW1lOiBzdHJpbmcpOiB2b2lkXHJcblxyXG5cdFx0IyAtLS0gdGhpcyBjb25kaXRpb24gc2hvdWxkIGZpbHRlciBidWlsdC1pbnNcclxuXHRcdGlmIG5vdCBoYXNLZXkoZ2xvYmFsVGhpcywgbmFtZSlcclxuXHRcdFx0aWYgQHRyYWNlXHJcblx0XHRcdFx0TE9HIFwiICAgdXNlICN7bmFtZX1cIlxyXG5cdFx0XHRpZiBub3QgQGN1clNjb3BlLmlzRGVmaW5lZChuYW1lKVxyXG5cdFx0XHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRcdFx0TE9HIFwiICAgbWlzc2luZyAje25hbWV9XCJcclxuXHRcdFx0XHRAc01pc3NpbmcuYWRkIG5hbWVcclxuXHRcdFx0QGN1clNjb3BlLnVzZSBuYW1lXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGFkZEltcG9ydChsaWI6IHN0cmluZywgbmFtZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBpbXBvcnQgJyN7bmFtZX0nIGluICcje2xpYn0nXCJcclxuXHRcdEBtSW1wb3J0cy5hZGQgbGliLCBuYW1lXHJcblx0XHRAZGVmaW5lIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0YWRkRXhwb3J0KG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nKTogdm9pZFxyXG5cclxuXHRcdGlmIEB0cmFjZVxyXG5cdFx0XHRMT0cgXCIgICBleHBvcnQgJyN7bmFtZX0nOiAnI3t0eXBlfSdcIlxyXG5cdFx0QG1FeHBvcnRzLnNldCBuYW1lLCB0eXBlXHJcblx0XHRyZXR1cm5cclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG5ld1Njb3BlKG5hbWU6IHN0cmluZz8sIGxBcmdzOiBzdHJpbmdbXSk6IHZvaWRcclxuXHJcblx0XHRpZiBAdHJhY2VcclxuXHRcdFx0TE9HIFwiICAgbmV3IHNjb3BlICN7bmFtZSB8fCAnPGFub24+J30oI3tsQXJncy5qb2luKCcsJyl9KVwiXHJcblx0XHRAY3VyU2NvcGUgPSBAbWFpblNjb3BlLm5ld1Njb3BlKG5hbWUsIGxBcmdzKVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRlbmRTY29wZSgpOiB2b2lkXHJcblxyXG5cdFx0aWYgQHRyYWNlXHJcblx0XHRcdExPRyBcIiAgIGVuZCBzY29wZVwiXHJcblx0XHRzY29wZSA6PSBAbWFpblNjb3BlLmVuZFNjb3BlIEBjdXJTY29wZVxyXG5cdFx0aWYgZGVmaW5lZChzY29wZSlcclxuXHRcdFx0QGN1clNjb3BlID0gc2NvcGVcclxuXHRcdGVsc2VcclxuXHRcdFx0QGZpbmlzaGVkID0gdHJ1ZVxyXG5cdFx0cmV0dXJuXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRJbXBvcnRzKCk6IFRCbG9ja0Rlc2NcclxuXHJcblx0XHRoSW1wb3J0czogaGFzaG9mPHN0cmluZ1tdPiA6PSB7fVxyXG5cdFx0Zm9yIFtsaWIsIHNOYW1lc10gb2YgQG1JbXBvcnRzLmVudHJpZXMoKVxyXG5cdFx0XHRoSW1wb3J0c1tsaWJdID0gQXJyYXkuZnJvbShzTmFtZXMudmFsdWVzKCkpXHJcblx0XHRyZXR1cm4gaEltcG9ydHNcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdGdldEV4cG9ydHMoKTogc3RyaW5nW11cclxuXHJcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSBAbUV4cG9ydHMua2V5cygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRNaXNzaW5nKCk6IHN0cmluZ1tdXHJcblxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gQHNNaXNzaW5nLnZhbHVlcygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRnZXRFeHRyYSgpOiBzdHJpbmdbXVxyXG5cclxuXHRcdHdhbGtlciA6PSBuZXcgV2Fsa2VyPENTY29wZT4oKVxyXG5cdFx0d2Fsa2VyLmlzTm9kZSA9ICh4OiB1bmtub3duKSA9PlxyXG5cdFx0XHRyZXR1cm4gKHggaW5zdGFuY2VvZiBDU2NvcGUpXHJcblxyXG5cdFx0IyAtLS0gRmluZCBhbGwgbmFtZXMgdGhhdCBhcmUgZGVmaW5lZCwgYnV0IG5ldmVyIHVzZWQgb3IgZXhwb3J0ZWRcclxuXHRcdHNOYW1lcyA6PSBuZXcgU2V0PHN0cmluZz4oKVxyXG5cdFx0Zm9yIHNjb3BlIG9mIHdhbGtlci53YWxrKEBtYWluU2NvcGUpXHJcblx0XHRcdGZvciBuYW1lIG9mIHNjb3BlLmFsbERlZmluZWQoKVxyXG5cdFx0XHRcdGlmIG5vdCBzY29wZS5pc1VzZWQobmFtZSkgJiYgIUBtRXhwb3J0cy5oYXMobmFtZSlcclxuXHRcdFx0XHRcdHNOYW1lcy5hZGQgbmFtZVxyXG5cdFx0cmV0dXJuIEFycmF5LmZyb20gc05hbWVzLnZhbHVlcygpXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRhc1N0cmluZyh3aWR0aDogaW50ZWdlciA9IDY0KTogc3RyaW5nXHJcblxyXG5cdFx0aDogVEJsb2NrRGVzYyA6PSB7XHJcblx0XHRcdElNUE9SVFM6IEBnZXRJbXBvcnRzKClcclxuXHRcdFx0RVhQT1JUUzogQGdldEV4cG9ydHMoKVxyXG5cdFx0XHRNSVNTSU5HOiBAZ2V0TWlzc2luZygpXHJcblx0XHRcdEVYVFJBOiBAZ2V0RXh0cmEoKVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0aWYgaXNFbXB0eShoLklNUE9SVFMpXHJcblx0XHRcdGRlbGV0ZSBoLklNUE9SVFNcclxuXHRcdGlmIGlzRW1wdHkoaC5FWFBPUlRTKVxyXG5cdFx0XHRkZWxldGUgaC5FWFBPUlRTXHJcblx0XHRpZiBpc0VtcHR5KGguTUlTU0lORylcclxuXHRcdFx0ZGVsZXRlIGguTUlTU0lOR1xyXG5cdFx0aWYgaXNFbXB0eShoLkVYVFJBKVxyXG5cdFx0XHRkZWxldGUgaC5FWFRSQVxyXG5cdFx0cmV0dXJuIEJsb2NraWZ5IGhcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZ2V0Tm9kZSA6PSAoXHJcblx0XHR4OiB1bmtub3duXHJcblx0XHRwYXRoc3RyOiBzdHJpbmdcclxuXHRcdCk6IE5vZGUgPT5cclxuXHJcblx0dmFsIDo9IGV4dHJhY3QoeCwgcGF0aHN0cikgYXMgTm9kZVxyXG5cdHJldHVybiB2YWxcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgYW5hbHl6ZVRzQ29kZSA6PSAoXHJcblx0XHR0c0NvZGU6IHN0cmluZ1xyXG5cdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0KTogQ0FuYWx5c2lzID0+XHJcblxyXG5cdHR5cGUgb3B0ID0ge1xyXG5cdFx0ZmlsZU5hbWU6IHN0cmluZz9cclxuXHRcdGR1bXBBU1Q6IGJvb2xlYW5cclxuXHRcdHRyYWNlOiBib29sZWFuXHJcblx0XHR9XHJcblx0e2ZpbGVOYW1lLCBkdW1wQVNULCB0cmFjZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRmaWxlTmFtZTogdW5kZWZcclxuXHRcdGR1bXBBU1Q6IGZhbHNlXHJcblx0XHR0cmFjZTogZmFsc2VcclxuXHRcdH1cclxuXHJcblx0YW5hbHlzaXMgOj0gbmV3IENBbmFseXNpcyh0cmFjZSlcclxuXHR3YWxrZXIgOj0gbmV3IEFzdFdhbGtlcigpXHJcblxyXG5cdCMgLS0tIHRocm93cyBFcnJvciBpZiBub3QgdmFsaWQgVHlwZVNjcmlwdFxyXG5cdGhBc3QgOj0gdHMyYXN0IHRzQ29kZVxyXG5cclxuXHRpZiBkdW1wQVNUXHJcblx0XHREVU1QIGFzdEFzU3RyaW5nKGhBc3QpLCAnQVNUJ1xyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0Y2hlY2tOb2RlIDo9IChcclxuXHRcdFx0bm9kZTogTm9kZSxcclxuXHRcdFx0cGF0aHN0cjogc3RyaW5nPyA9IHVuZGVmXHJcblx0XHRcdCk6IHZvaWQgPT5cclxuXHJcblx0XHRpZiBkZWZpbmVkKHBhdGhzdHIpXHJcblx0XHRcdG5vZGUgPSBnZXROb2RlKG5vZGUsIHBhdGhzdHIpXHJcblx0XHRpZiAobm9kZS5raW5kID09IDgwKSAgICMgLS0tIElkZW50aWZpZXJcclxuXHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5lc2NhcGVkVGV4dCdcclxuXHRcdFx0YW5hbHlzaXMudXNlIG5hbWVcclxuXHRcdHJldHVyblxyXG5cclxuXHQjIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuXHJcblx0c3ltIDo9ICh2a2luZDogVFZpc2l0S2luZCk6IHN0cmluZyA9PlxyXG5cdFx0c3dpdGNoIHZraW5kXHJcblx0XHRcdHdoZW4gJ2VudGVyJyB0aGVuIHJldHVybiAnLT4nXHJcblx0XHRcdHdoZW4gJ2V4aXQnICB0aGVuIHJldHVybiAnPC0nXHJcblx0XHRcdGVsc2UgICAgICAgICAgICAgIHJldHVybiAnOjonXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cdCMgdmtpbmQgaXMgb25lIG9mICdlbnRlcicsICdleGl0JywgJ3JlZidcclxuXHJcblx0bFRyYWNlS2luZCA6PSBbODAsIDk1LCAxNzAsIDIxNCwgMjIwLCAyMjcsIDI1NCwgMjYxLCAyNjMsIDI3MywgMjgwLCAzMDhdXHJcblx0Zm9yIFt2a2luZCwgbm9kZV0gb2Ygd2Fsa2VyLndhbGtFeChoQXN0KVxyXG5cdFx0e2tpbmR9IDo9IG5vZGVcclxuXHRcdGlmIHRyYWNlICYmIGxUcmFjZUtpbmQuaW5jbHVkZXMoa2luZClcclxuXHRcdFx0TE9HIGZcIiN7c3ltKHZraW5kKX0gTk9ERSAje2tpbmR9OjMgKCN7a2luZFN0cihraW5kKX06e2N5YW59KVwiXHJcblxyXG5cdFx0aWYgKHZraW5kID09ICdleGl0JylcclxuXHRcdFx0c3dpdGNoIGtpbmRcclxuXHJcblx0XHRcdFx0d2hlbiAyMjAsIDI2MyAgICMgQXJyb3dGdW5jdGlvbiwgRnVuY3Rpb25EZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0YW5hbHlzaXMuZW5kU2NvcGUoKVxyXG5cclxuXHRcdGVsc2UgaWYgKHZraW5kID09ICdlbnRlcicpXHJcblxyXG5cdFx0XHRzd2l0Y2gga2luZFxyXG5cclxuXHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdGRvXHJcblx0XHRcdFx0XHRcdGxQYXJtcyA6PSBBcnJheS5mcm9tIE1BUCBnZXRBcnJheShub2RlLCAnLnBhcmFtZXRlcnMnKSwgKHgpIC0+XHJcblx0XHRcdFx0XHRcdFx0eWllbGQgZ2V0U3RyaW5nKHgsICcubmFtZS5lc2NhcGVkVGV4dCcpXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIHVuZGVmLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyNjEgICAgIyBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHR0cnlcclxuXHRcdFx0XHRcdFx0dmFyTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cdFx0XHRcdFx0XHRhbmFseXNpcy5kZWZpbmUgdmFyTmFtZVxyXG5cclxuXHRcdFx0XHR3aGVuIDI2MyAgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdCMgLS0tIGRvIGNyZWF0ZXMgYSBzY29wZSwgYSBsYSBhbiBJSUZFXHJcblx0XHRcdFx0XHRkb1xyXG5cdFx0XHRcdFx0XHRmdW5jTmFtZSA6PSBnZXRTdHJpbmcgbm9kZSwgJy5uYW1lLmVzY2FwZWRUZXh0J1xyXG5cclxuXHRcdFx0XHRcdFx0bFBhcm1zIDo9IEFycmF5LmZyb20gTUFQIGdldEFycmF5KG5vZGUsICcucGFyYW1ldGVycycpLCAoeCkgLT5cclxuXHRcdFx0XHRcdFx0XHR5aWVsZCBnZXRTdHJpbmcoeCwgJy5uYW1lLmVzY2FwZWRUZXh0JylcclxuXHRcdFx0XHRcdFx0YW5hbHlzaXMuZGVmaW5lIGZ1bmNOYW1lXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLm5ld1Njb3BlIGZ1bmNOYW1lLCBsUGFybXNcclxuXHJcblx0XHRcdFx0d2hlbiAyMjcgICAgIyBCaW5hcnlFeHByZXNzaW9uXHJcblx0XHRcdFx0XHRjaGVja05vZGUgbm9kZSwgJy5sZWZ0J1xyXG5cdFx0XHRcdFx0Y2hlY2tOb2RlIG5vZGUsICcucmlnaHQnXHJcblxyXG5cdFx0XHRcdHdoZW4gMjE0ICAgICMgQ2FsbEV4cHJlc3Npb25cclxuXHRcdFx0XHRcdGNoZWNrTm9kZSBub2RlLCAnLmV4cHJlc3Npb24nXHJcblx0XHRcdFx0XHRmb3IgYXJnIG9mIGdldEFycmF5KG5vZGUsICcuYXJndW1lbnRzJylcclxuXHRcdFx0XHRcdFx0Y2hlY2tOb2RlKGFyZyBhcyBOb2RlKVxyXG5cclxuXHRcdFx0XHR3aGVuIDI3MyAgICAjIEltcG9ydERlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRsaWIgOj0gZ2V0U3RyaW5nIG5vZGUsICcubW9kdWxlU3BlY2lmaWVyLnRleHQnXHJcblx0XHRcdFx0XHRmb3IgaCBvZiBnZXRBcnJheShub2RlLCAnLmltcG9ydENsYXVzZT8ubmFtZWRCaW5kaW5ncz8uZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBoLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEltcG9ydCBsaWIsIG5hbWVcclxuXHJcblx0XHRcdFx0d2hlbiAyODAgICAgIyBOYW1lZEV4cG9ydHNcclxuXHRcdFx0XHRcdGZvciBlbGVtIG9mIGdldEFycmF5KG5vZGUsICcuZWxlbWVudHMnKVxyXG5cdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBlbGVtLCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAncmUtZXhwb3J0J1xyXG5cclxuXHRcdFx0XHR3aGVuIDk1ICAgICAjIEV4cG9ydEtleXdvcmRcclxuXHRcdFx0XHRcdHBhcmVudCA6PSB3YWxrZXIucGFyZW50KClcclxuXHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIocGFyZW50LCAnLmtpbmQnKVxyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNDQgICAgIyBGaXJzdFN0YXRlbWVudFxyXG5cdFx0XHRcdFx0XHRcdGZvciBkZWNsIG9mIGdldEFycmF5KHBhcmVudCwgJy5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zJylcclxuXHRcdFx0XHRcdFx0XHRcdHN3aXRjaCBnZXROdW1iZXIoZGVjbCwgJy5raW5kJylcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdHdoZW4gMjYxICAgICMgVmFyaWFibGVEZWNsYXJhdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWUgOj0gZ2V0U3RyaW5nIGRlY2wsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHQjIC0tLSBDaGVjayBpbml0aWFsaXplciB0byBmaW5kIHRoZSB0eXBlXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5pdEtpbmQgOj0gZ2V0TnVtYmVyIGRlY2wsICcuaW5pdGlhbGl6ZXIua2luZCdcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggaW5pdEtpbmRcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDIyMCAgICAjIEFycm93RnVuY3Rpb25cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICdmdW5jdGlvbidcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR3aGVuIDksIDI2MSAjIEZpcnN0TGl0ZXJhbFRva2VuLCBWYXJpYWJsZURlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFuYWx5c2lzLmFkZEV4cG9ydCBuYW1lLCAnY29uc3QnXHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd1bmtub3duJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjMgICAjIEZ1bmN0aW9uRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2Z1bmN0aW9uJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjQgICAjIENsYXNzRGVjbGFyYXRpb25cclxuXHRcdFx0XHRcdFx0XHRuYW1lIDo9IGdldFN0cmluZyBwYXJlbnQsICcubmFtZS5lc2NhcGVkVGV4dCdcclxuXHRcdFx0XHRcdFx0XHRhbmFseXNpcy5hZGRFeHBvcnQgbmFtZSwgJ2NsYXNzJ1xyXG5cclxuXHRcdFx0XHRcdFx0d2hlbiAyNjYgICAjIFR5cGVBbGlhc0RlY2xhcmF0aW9uXHJcblx0XHRcdFx0XHRcdFx0bmFtZSA6PSBnZXRTdHJpbmcgcGFyZW50LCAnLm5hbWUuZXNjYXBlZFRleHQnXHJcblx0XHRcdFx0XHRcdFx0YW5hbHlzaXMuYWRkRXhwb3J0IG5hbWUsICd0eXBlJ1xyXG5cclxuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0XHRjcm9hayBcIlVuZXhwZWN0ZWQgc3VidHlwZSBvZiA5NTogI3twYXJlbnQua2luZH1cIlxyXG5cdHJldHVybiBhbmFseXNpc1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENUeXBlc2NyaXB0Q29tcGlsZXIgZXh0ZW5kcyBDRmlsZUhhbmRsZXJcclxuXHJcblx0Z2V0IG9wKClcclxuXHRcdHJldHVybiAnZG9Db21waWxlVFMnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdExPRyBcImRvQ29tcGlsZVRTICcje3BhdGh9J1wiXHJcblxyXG5cdFx0dHlwZSBvcHQgPSB7XHJcblx0XHRcdGZvcmNlOiBib29sZWFuXHJcblx0XHRcdH1cclxuXHRcdHtmb3JjZX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGZvcmNlOiBmYWxzZVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0YXNzZXJ0IChmaWxlRXh0KHBhdGgpID09ICcudHMnKSwgXCJOb3QgYSB0eXBlc2NyaXB0IGZpbGU6ICN7cGF0aH1cIlxyXG5cdFx0anNQYXRoIDo9IHdpdGhFeHQgcGF0aCwgJy5qcydcclxuXHJcblx0XHQjIC0tLSBDaGVjayBpZiBhIG5ld2VyIGNvbXBpbGVkIHZlcnNpb24gYWxyZWFkeSBleGlzdHNcclxuXHRcdGlmIChcclxuXHRcdFx0XHQgICBub3QgZm9yY2VcclxuXHRcdFx0XHQmJiBhd2FpdCBleGlzdHMoanNQYXRoKVxyXG5cdFx0XHRcdCYmIG5ld2VyRGVzdEZpbGVFeGlzdHMocGF0aCwganNQYXRoKVxyXG5cdFx0XHRcdClcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlXHJcblx0XHRcdFx0bm90TmVlZGVkOiB0cnVlXHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdHRyeVxyXG5cdFx0XHRoUmVzdWx0IDo9IGF3YWl0IGV4ZWNDbWQgJ2Rlbm8nLCBbXHJcblx0XHRcdFx0J2J1bmRsZSdcclxuXHRcdFx0XHQnLS1taW5pZnknXHJcblx0XHRcdFx0cGF0aFxyXG5cdFx0XHRcdGpzUGF0aFxyXG5cdFx0XHRcdF1cclxuXHRcdFx0aWYgbm90IGhSZXN1bHQuc3VjY2Vzc1xyXG5cdFx0XHRcdGNvbnNvbGUubG9nIEBnZXRPdXRwdXQoaFJlc3VsdClcclxuXHRcdFx0XHRjcm9hayBcIkNvbXBpbGUgZmFpbGVkXCJcclxuXHRcdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcblx0XHRjYXRjaCBlcnJcclxuXHRcdFx0aWYgZGVidWdnaW5nXHJcblx0XHRcdFx0TE9HIGdldEVyclN0cihlcnIpXHJcblx0XHRcdGVyck1zZyA6PSBcIkNPTVBJTEUgRkFJTEVEOiAje3BhdGhTdHIocGF0aCl9IC0gI3tnZXRFcnJTdHIoZXJyKX1cIlxyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlXHJcblx0XHRcdFx0c3RkZXJyOiBlcnJNc2dcclxuXHRcdFx0XHR9XHJcblxyXG5leHBvcnQgZG9Db21waWxlVFMgOj0gbmV3IENUeXBlc2NyaXB0Q29tcGlsZXIoKVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBU1lOQ1xyXG5cclxuZXhwb3J0IGNvbXBpbGVBbGxUUyA6PSAoXHJcblx0XHRyb290ID0gJy4nXHJcblx0XHRoT3B0aW9uczogaGFzaCA9IHt9XHJcblx0XHQpOiBURXhlY1Jlc3VsdFtdID0+XHJcblxyXG5cdCMgLS0tIHdpdGggJ3F1aWV0JyBvcHRpb24sIHN0aWxsIHJlcG9ydHMgZXJyb3JzXHJcblx0cGF0dGVybiA6PSBta3BhdGgocm9vdCwgJyoqLyoubGliLnRzJylcclxuXHRMT0cgXCJwYXR0ZXJuID0gJyN7cGF0dGVybn0nXCJcclxuXHRzcGVjOiBUUHJvY1NwZWMgOj0gW2RvQ29tcGlsZVRTLCBbcGF0dGVybl1dXHJcblx0cmV0dXJuIGF3YWl0IHByb2NGaWxlcyBzcGVjLCB7XHJcblx0XHQuLi5oT3B0aW9uc1xyXG5cdFx0cXVpZXQ6IHRydWVcclxuXHRcdGFib3J0T25FcnJvcjogdHJ1ZVxyXG5cdFx0fVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIENVbml0VGVzdGVyIGV4dGVuZHMgQ0ZpbGVIYW5kbGVyXHJcblxyXG5cdGdldCBvcCgpXHJcblx0XHRyZXR1cm4gJ2RvVW5pdFRlc3QnXHJcblxyXG5cdCMgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLlxyXG5cclxuXHRvdmVycmlkZSBoYW5kbGUoXHJcblx0XHRcdHBhdGg6IHN0cmluZyxcclxuXHRcdFx0aE9wdGlvbnM6IGhhc2ggPSB7fVxyXG5cdFx0XHQpOiBURXhlY1Jlc3VsdFxyXG5cclxuXHRcdGFzc2VydCBwYXRoLmVuZHNXaXRoKCcudGVzdC50cycpLCBcIk5vdCBhIHVuaXQgdGVzdCBmaWxlXCJcclxuXHRcdHR5cGUgb3B0ID0ge1xyXG5cdFx0XHRjYXB0dXJlOiBib29sZWFuXHJcblx0XHRcdGluc3BlY3Q6IGJvb2xlYW5cclxuXHRcdFx0bGluZU51bTogc3RyaW5nP1xyXG5cdFx0XHR9XHJcblx0XHR7Y2FwdHVyZSwgaW5zcGVjdCwgbGluZU51bX0gOj0gZ2V0T3B0aW9uczxvcHQ+IGhPcHRpb25zLCB7XHJcblx0XHRcdGNhcHR1cmU6IHRydWVcclxuXHRcdFx0aW5zcGVjdDogZmFsc2VcclxuXHRcdFx0bGluZU51bTogdW5kZWZcclxuXHRcdFx0fVxyXG5cclxuXHRcdGhSZXN1bHQgOj0gYXdhaXQgZXhlY0NtZCAnZGVubycsIFtcclxuXHRcdFx0XHQndGVzdCdcclxuXHRcdFx0XHQnLUEnXHJcblx0XHRcdFx0Li4uKGluc3BlY3RcclxuXHRcdFx0XHRcdD8gWyctLWluc3BlY3QtYnJrJ11cclxuXHRcdFx0XHRcdDogWyctLWNvdmVyYWdlPS4vY292ZXJhZ2UnLCAnLS1jb3ZlcmFnZS1yYXctZGF0YS1vbmx5J11cclxuXHRcdFx0XHRcdClcclxuXHRcdFx0XHQuLi4oZGVmaW5lZChsaW5lTnVtKVxyXG5cdFx0XHRcdFx0PyBbJy0tZmlsdGVyJywgXCIvXmxpbmUgI3tsaW5lTnVtfSQvXCJdXHJcblx0XHRcdFx0XHQ6IFtdXHJcblx0XHRcdFx0XHQpXHJcblx0XHRcdFx0cGF0aFxyXG5cdFx0XHRcdF0sIHtjYXB0dXJlfVxyXG5cdFx0cmV0dXJuIGhSZXN1bHRcclxuXHJcblx0IyAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcblxyXG5cdG92ZXJyaWRlIGdldE91dHB1dChoUmVzdWx0OiBURXhlY1Jlc3VsdCk6IHN0cmluZ1xyXG5cclxuXHRcdHtzdGRvdXQsIHN0ZGVycn0gOj0gaFJlc3VsdFxyXG5cdFx0b3V0cHV0IDo9IFtzdGRvdXQsIHN0ZGVycl0uam9pbigpXHJcblx0XHRpZiBub3QgaFJlc3VsdC5zdWNjZXNzIHx8IG91dHB1dC5tYXRjaCgvY3JvYWt8ZXJyb3IvaSlcclxuXHRcdFx0cmV0dXJuIG91dHB1dFxyXG5cclxuXHRcdGxMaW5lcyA6PSBBcnJheS5mcm9tIE1BUCBhbGxMaW5lc0luKGRlY29sb3JpemUob3V0cHV0KSksIChsaW5lKSAtPlxyXG5cdFx0XHRpZiBsaW5lLnN0YXJ0c1dpdGgoJ2xpbmUnKVxyXG5cdFx0XHRcdGlmIG5vdCBsaW5lLmluY2x1ZGVzKCcgb2sgJylcclxuXHRcdFx0XHRcdHlpZWxkIHdpdGhDb2xvcnMgbGluZSwge1xyXG5cdFx0XHRcdFx0XHRmYWlsZWQ6ICdyZWQnXHJcblx0XHRcdFx0XHRcdEZBSUxFRDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0b2s6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0T0s6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmIGxpbmUuaW5jbHVkZXMoJ3Bhc3NlZCcpICYmIGxpbmUuaW5jbHVkZXMoJ2ZhaWxlZCcpXHJcblx0XHRcdFx0aWYgbGluZS5pbmNsdWRlcygnIDAgZmFpbGVkICcpXHJcblx0XHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcclxuXHRcdFx0XHRcdFx0b2s6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0cGFzc2VkOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHR5aWVsZCB3aXRoQ29sb3JzIGxpbmUsIHtcclxuXHRcdFx0XHRcdFx0b2s6ICdncmVlbidcclxuXHRcdFx0XHRcdFx0cGFzc2VkOiAnZ3JlZW4nXHJcblx0XHRcdFx0XHRcdGZhaWxlZDogJ3JlZCdcclxuXHRcdFx0XHRcdFx0RkFJTEVEOiAncmVkJ1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgbGluZS5pbmNsdWRlcygnTGNvdiBjb3ZlcmFnZScpXHJcblx0XHRcdFx0eWllbGQgJ2NvdmVyYWdlIHJlcG9ydCBnZW5lcmF0ZWQnXHJcblx0XHRyZXR1cm4gbExpbmVzLmpvaW4oJ1xcbicpXHJcblxyXG5leHBvcnQgZG9Vbml0VGVzdCA6PSBuZXcgQ1VuaXRUZXN0ZXIoKVxyXG4iXX0=