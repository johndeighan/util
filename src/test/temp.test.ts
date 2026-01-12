"use strict";
// temp.test.civet

import {undef, assert, croak, deepEqual} from 'datatypes'
import {equal, truthy} from 'unti-test'

// ---------------------------------------------------------------------------

const lItems = ['a', 'b']

equal(lItems, ['a', 'b'])

truthy(deepEqual(lItems, ['a', 'b']))
