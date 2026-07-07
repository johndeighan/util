// compile-all.cmd.ts

import {cyan, red, green, yellow} from 'jsr:@std/fmt/colors'
import {expandGlob} from 'jsr:@std/fs/expand-glob'
import {relative} from 'jsr:@std/path'
import {sprintf} from 'jsr:@std/fmt/printf'

// --------------------------------------------------------------------------

const decoder = new TextDecoder();

function decode(str: AllowSharedBufferSource): string {
	return decoder.decode(str)
	}

// --------------------------------------------------------------------------

async function compile(path: string): Promise<void> {

	// --- deno run -A @danielx/civet --inline-map -o .ts -c <path>

	const command = new Deno.Command("deno", {
		args: [
			'run',
			'-A',
			'@danielx/civet',
			'--inline-map',
			'-o', '.ts',
			'-c', path
			],
		stdout: 'piped',
		stderr: 'piped'
		});

	const {code, stdout, stderr} = await command.output();

	if (code === 0) {
		console.log('   ' + green(path));
		}
	else {
		console.log(`error code is ${code}`);
		console.error(red(decode(stderr)));
		}
	}

// --------------------------------------------------------------------------

const t0 = Date.now()
let nCompiled = 0;
for await (const entry of expandGlob("**/*.civet")) {
	const path = relative(Deno.cwd(), entry.path);
	const lMatches = path.match(/^src\\test\\[A-Za-z-]+\\[^\\]+\.civet$/);
	if (lMatches === null) {
		await compile(path);
		nCompiled += 1;
		}
	}
const timeTaken = Date.now() - t0;
console.log(`${nCompiled} files compiled in ${sprintf("%.2f", timeTaken/1000)} secs`);
