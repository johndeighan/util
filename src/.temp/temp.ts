"use strict";
// temp.civet

import {mkTempFile, mkTempFileSync} from 'base'

// ---------------------------------------------------------------------------

const path = mkTempFileSync('.civet')
Deno.writeTextFileSync(path, "Hello")
const str = Deno.readTextFileSync(path)
console.log(str)
console.log(`file at ${path}`)
