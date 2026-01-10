"use strict";
// automate.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {defined, isHash, isFunction} from 'datatypes'
import {o} from 'llutils'
import {withExt, TPathInfo, isFile} from 'fsys'
import {DBG} from 'logger'
import {execCmd} from 'exec'
import {
	TTesterFunc, TCompileStatus, TCompilerFunc, TPostProcessor,
	TCompilerInfo, isCompilerInfo, TCompilerConfig, isCompilerConfig,
	TCompileResult, TUnitTestResult,
	build, getCompilerConfig, getCompilerInfo, getPostProcessor,
	compileFile,
	} from 'automate'
import {
	equal, like, succeeds, fails, truthy, falsy, setDirTree,
	matches, objListLike, strListLike,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	await setDirTree(`./src/test/automate clear
test1.cielo
	# test1.cielo

	LOG := (str: string) => console.log str
	LOG "Hello, World!"
test2.civet
	# test2.civet

	LOG := (str: string) => console.log str
	LOG "Hello, World!"
test3.coffee
	# test3.coffee

	LOG = (str: string) => console.log str
	LOG "Hello, World!"
graph.dot
	EE -> EO | OE | OO
	EO -> EE
	OE -> EE
	OO -> EE
hello.ts
	console.log("Hello, World!");
comp.config.civet
	import {withExt} from 'fsys'
	export default new Object {
		hCompilers: {
			'.test': {
				getOutPaths: (path: string) => [withExt(path, '.out')],
				tester: () => true,
				compiler: (path: string) => undefined
				}
			},
		hPostProcessors: {}
		}`)
	return
}

await setup()

// ---------------------------------------------------------------------------

DBG("type TTesterFunc")

// isType 'TTesterFunc', () =>
//	console.log "Hello, World!"
//	return true

DBG("type TCompileStatus")

// isType 'TCompileStatus', 'temp'
// isType 'TCompileStatus', 'exists'
// isType 'TCompileStatus', 'compiled'
// notType 'TCompileStatus', 'dummy'

DBG("type TCompilerFunc")

// isType 'TCompilerFunc', (path: string) =>
//	console.log path
//	return 'compiled'

DBG("type TPostProcessor");

(() => {
	const logit = (hInfo: TPathInfo) => {
		console.log("done")
		return
	}
}
	// isType 'TPostProcessor', logit
	)()

DBG("type TCompilerInfo")

// isType 'TCompilerInfo', {
//	tester: () => true
//	compiler: (path: string) => return 'compiled',
//	getOutPaths: (path: string) => return ['temp.ts']
//	}

DBG("type TCompilerConfig", "isCompilerConfig()")

// isType 'TCompilerConfig', {
//	hCompilers: {}
//	hPostProcessors: {}
//	}

DBG("type TCompileResult")

// isType 'TCompileResult', {
//	status: 'compiled'
//	path: 'temp.civet'
//	}

DBG("type TUnitTestResult")

// isType 'TUnitTestResult', {
//	stub: 'temp'
//	success: true
//	}

DBG("getCompilerConfig(path)");

(() => {
	const civetPath = 'src/test/automate/comp.config.civet'
	const hConfig = getCompilerConfig(civetPath)
}
	// isType 'TCompilerConfig', hConfig, isCompilerConfig
	)()

DBG("getCompilerInfo()")

// isType 'TCompilerInfo', getCompilerInfo('.dot'), isCompilerInfo

DBG("getPostProcessor()");

(() => {
	const pp = getPostProcessor('test')
	truthy(defined(pp))
	truthy(isFunction(pp))
}
	)();

(() => {
	const pp = getPostProcessor('lib')
	truthy(defined(pp))
	truthy(isFunction(pp))
}
	)();

(() => {
	const pp = getPostProcessor('cmd')
	truthy(defined(pp))
	truthy(isFunction(pp))
}
	)()

DBG("compileFile()")

fails(() => compileFile('nosuchfile.civet'));

(() => {
	const hResult = compileFile('src/test/automate/test1.cielo', o`nopp`)
	truthy(isFile('src/test/automate/test1.temp.civet'))
}
	)()