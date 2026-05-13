"use strict";
// temp.civet

import {procOneFile} from 'exec'
import {DUMP} from 'to-nice'
import {compileHera} from 'llhera'
import {doCompileHera} from 'hera-compile'
import {doParse} from 'hera-parse'

// ---------------------------------------------------------------------------

debugger
const result = await doParse('dir-tree', `./src/test/base clear
file.txt
	abc
	def`)
DUMP(result, 'result')
