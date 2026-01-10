NOTES

Convert *.ts back to *.civet

- remove initial 'use strict' line
- replace // with #
- change 'export const X ='
	to 'export X :='

	in TextPad:
		find: export const ([a-z]+) =
		repl: export \1 :=

- replace '=> {' with '=>
- remove lines containing only } and whitespace
	in TextPad:
		find: ^[}\s]+$
		repl: <empty>

- replace !== with !=
- replace === with ==
- replace "if \((.*)\) {" with "if \1"

- replace "let X;if <cond>const Y = X

- replace const item: unknown = x[key]
   with   item: unknown := x[key]

- replace `...` with "..." while replacing
	${...} with #{...} inside the string


