"use strict";
// fetcher.lib.test.civet

import {undef} from 'datatypes'
import {range} from 'llutils'
import {Fetcher} from 'fetcher'
import {DBG} from 'logger'
import {equal, truthy, falsy} from 'unit-test'

// ---------------------------------------------------------------------------

DBG("class Fetcher");

(() => {
	const fetcher = new Fetcher<number>(range(3), -1)
	equal(fetcher.get(), 0)
	equal(fetcher.get(), 1)
	falsy(fetcher.atEnd())
	equal(fetcher.peek(), 2)
	equal(fetcher.peek(), 2)
	equal(fetcher.get(), 2)
	truthy(fetcher.atEnd())
}
	)();

(() => {
	const fetcher = new Fetcher<number>(range(3), -1)
	equal(fetcher.get(), 0)
	equal(fetcher.get(), 1)
	falsy(fetcher.atEnd())
	equal(fetcher.peek(), 2)
	equal(fetcher.peek(), 2)
	equal(fetcher.get(), 2)
	truthy(fetcher.atEnd())
}
	)()

const strIter = function*(lStrings: string[]): Generator<string, void, void> {
	for (const str of lStrings) {
		yield str
	}
	return
};

(() => {
	const fetcher = new Fetcher<(string | undefined)>(strIter(['a', 'b', 'c']), undef)
	equal(fetcher.toArray(), ['a', 'b', 'c'])
}
	)();

(() => {
	const fetcher = new Fetcher<string>(strIter(['a', 'b', 'c']), 'b')
	equal(fetcher.toArray(), ['a'])
}
	)();

(() => {
	const fetcher = new Fetcher<string>(strIter(['a', 'b', 'c']), 'c')
	equal(fetcher.toArray(), ['a', 'b'])
}
	)()
