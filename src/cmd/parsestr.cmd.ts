"use strict";
// parsestr.cmd.civet

import {croak, assertIsDefined} from 'datatypes'
import {findFile} from 'fsys'
import {allNonOptions} from 'cmd-args'

// ---------------------------------------------------------------------------

const lNonOptions = allNonOptions()
let ref;switch(lNonOptions.length) {
		case 0:
			croak("No args!");
			['dummy', '']
		case 1:
			['test', lNonOptions[0]]
		default:
			ref = [lNonOptions[0], lNonOptions.slice(1).join(' ')]
};const [stub, str] =ref

// console.log "stub = #{stub}"
// console.log "str = #{str}"

const fileName = `${stub}.parser.ts`

// console.log "fileName = #{fileName}"

const path = findFile(fileName)

// console.log "path = #{path}"

assertIsDefined(path, `No such file: ${fileName}`)
const {parser} = await import(`file:///${path}`)

// console.log "parser found"

const result = parser.parse('aaabbbbb')
console.log(`RESULT IS: ${result}`)