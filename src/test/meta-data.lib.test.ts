"use strict";
// meta-data.lib.test.civet

import {convertMetaData} from 'meta-data'
import {
	equal, truthy, falsy, succeeds, fails, matches,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// --- Create 3 log records for use in testing

equal(convertMetaData('---', `fname: John
lname: Deighan`), {
		fname: 'John',
		lname: 'Deighan'
		})