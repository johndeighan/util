"use strict";
// exec.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {undef, isEmpty, nonEmpty} from 'datatypes'
import {o} from 'llutils'
import {DBG} from 'logger'
import {
	mkstr, getCmdLine, execCmd, execCmdSync, TExecResult,
	joinNonEmpty,
	} from 'exec'
import {
	equal, like, succeeds, fails, truthy, falsy, setDirTree,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	DBG("setDirTree()")

	await setDirTree(`./src/test/exec
bad.civet
	str: string := undef
`)
}

await setup()

// ---------------------------------------------------------------------------

DBG("joinNonEmpty(...lParts)")

equal(joinNonEmpty('abc'), 'abc')
equal(joinNonEmpty('abc', undef), 'abc')
equal(joinNonEmpty('abc', ''), 'abc')
equal(joinNonEmpty('abc', '   '), 'abc')

DBG("mkstr(x)")

const buffer = new ArrayBuffer(3)
const view = new Int8Array(buffer)

view[0] = 97
view[1] = 98
view[2] = 99

equal(mkstr('abc'), 'abc')
equal(mkstr(buffer), 'abc')
equal(mkstr(view), 'abc')

DBG("getCmdLine()")

equal(getCmdLine('dothis', ['-a', 'willy']), 'dothis -a willy')

DBG("execCmd()", "type TExecResult");

(async () => {
	const {stdout} = await execCmd('echo', ["Hello"])
	equal(stdout, "Hello\n")
}
	)()

DBG("execCmdSync()", "type TExecResult")

truthy(execCmdSync("echo", ["Hello"]).success)

