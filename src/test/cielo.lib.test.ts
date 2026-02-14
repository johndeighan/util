"use strict";
// cielo.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {defined, isFunction} from 'datatypes'
import {DBG} from 'logger'
import {
	cielo2civet, cielo2civetFile, configFromFile,
	} from 'cielo'
import {
	equal, like, succeeds, fails, truthy, falsy, setDirTree,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	DBG("setDirTree()")

	await setDirTree(`./src/test/cielo
file.config.ts
	export default new Object({
		a: 1,
		b: 'abc',
		f: () => 'hello'
		})`)
}

await setup()

// ---------------------------------------------------------------------------

DBG("cielo2civet(code)", "cielo2civetFile()")

equal(cielo2civet('abc'), 'abc')

DBG("configFromFile(path)");

(() => {
	const hConfig = configFromFile('src/test/cielo/file.config.ts')
	truthy(defined(hConfig))
	truthy(defined(hConfig.a))
	falsy( defined(hConfig.x))
	if (isFunction(hConfig.f)) {
		equal(hConfig.f(), 'hello')
	}
}
	)

