"use strict";
// scope.lib.test.civet

import {undef, assert} from 'datatypes'
import {s} from 'llutils'
import {toNice} from 'to-nice'
import {CMainScope, CScope} from 'scope'
import {
	equal, truthy, falsy, succeeds, fails, codeLike,
	} from 'unit-test';

// ---------------------------------------------------------------------------

(() => {
	const mainScope = new CMainScope()
	mainScope.define('name')
	mainScope.define('gender')

	truthy(mainScope.isDefined('name'))
	truthy(mainScope.isDefined('gender'))
	falsy( mainScope.isDefined('dummy'))

	succeeds(() => {
		const scope = mainScope.newChildScope('func', ['age'])
		truthy(scope.isDefined('age'))
		truthy(scope.isDefined('name'))
		truthy(scope.isDefined('gender'))
		falsy( scope.isDefined('dummy'))

		falsy( mainScope.isDefined('age'))
	})
}
	)();

(() => {
	const mainScope = new CMainScope()
	mainScope.define('name')
	mainScope.define('gender')

	mainScope.use('name')
	mainScope.use('address')

	truthy(mainScope.isDefined('name'))
	truthy(mainScope.isDefined('gender'))
	falsy( mainScope.isDefined('dummy'))

	succeeds(() => {
		const scope = mainScope.newChildScope('func', ['age'])
		truthy(scope.isDefined('age'))
		truthy(scope.isDefined('name'))
		truthy(scope.isDefined('gender'))
		falsy( scope.isDefined('dummy'))

		falsy( mainScope.isDefined('age'))
	})
}
	)();

(() => {
	const mainScope = new CMainScope()
	mainScope.define('name')
	mainScope.define('gender')

	const childScope = mainScope.newChildScope('func', ['age'])
	childScope.define('temp')

	equal(toNice(mainScope), s`name: main
sDefined:
	-- name
	-- gender
sUsed: ｟emptySet｠
parent: ｟undef｠
lChildren:
	-
		name: func
		sDefined:
			-- age
			-- temp
		sUsed: ｟emptySet｠
		parent: ｟ref root｠
		lChildren: []`)
}
	)()