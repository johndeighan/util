"use strict";
// sample-values.lib.civet

// ---------------------------------------------------------------------------
// --- Create some values for testing

export const val = {
	str: 'abc',
	i: 42,
	f: 3.14159,
	genFunc: function*() {
		yield 42
	},
	regularFunc: function() {
		return 42
	},
	lambdaFunc: () => {
		return 42
	},
	emptyHash: {},
	fullHash: {a: 42},
	emptyList: [],
	fullList: [42]
	}
