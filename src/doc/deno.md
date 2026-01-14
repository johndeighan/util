deno
====

Install the command buildcmd
----------------------------

1. compile file buildcmd.cmd.civet to .ts
2. execute:
	deno install --global --force --config deno.jsonc
		-A --name buildcmd src/cmd/buildcmd.cmd.ts

Debug a command
---------------

1. compile file buildcmd.cmd.civet to .ts
2. execute:
	deno run -A --inspect-brk src/cmd/buildcmd.cmd.ts

