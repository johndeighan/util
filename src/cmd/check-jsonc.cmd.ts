"use strict"
// check-jsonc.cmd.civet
"use strict";
import { parse as parseJSONC } from "jsr:@std/jsonc"
// ---------------------------------------------------------------------------
try {
	const contents = Deno.readTextFileSync(Deno.args[0])
	const data = parseJSONC(contents)
	console.log("OK")
}
catch (err) {
	console.error("Error reading or parsing JSONC file:", err)
}