"use strict";
// console-utils.lib.civet

import {encode} from 'llutils'

// ---------------------------------------------------------------------------

export const write = (str: string): void => {
	Deno.stdout.writeSync(encode(str))
	return
}

// ---------------------------------------------------------------------------

export const writeln = (str: string = ''): void => {
	write(str)
	write('\n')
	return
}

// ---------------------------------------------------------------------------

export const clearScreen = (): void => {
	write('\x1b[H\x1b[2J')
	return
}

// ---------------------------------------------------------------------------

export const resetLine = (): void => {
	write('\r')
	write("\x1b[K")
	return
}
// ---------------------------------------------------------------------------