Commands
========

How to build and install a command:

1. Make sure libraries all compile and type check:
	compile_all_libs
	check_all_libs

2. Create a file <name>.cmd.civet in src/cmd folder

3. Compile the command
	deno run -A npm:@danielx/civet --config c:/Users/johnd/civetconfig.json -o .ts --inline-map -c <path to <name>.cmd.civet>
	OR
	cfile src/cmd/<name>.cmd

4. Check to be sure <name>.cmd.ts exists

5. Install the command
	deno install -f -c deno.jsonc -A -g -n <name> <path to <name>.cmd.ts>
	OR
	ifile src/cmd/<name>.cmd <name>

To update, modify <name>.cmd.civet and repeat 3-5

