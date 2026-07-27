// boot.cmd.ts

import {expandGlob} from 'jsr:@std/fs/expand-glob'
import {relative} from 'jsr:@std/path'

import {
	execCmd, compile, typeCheck, execBatch,
	newerDestFileExists, installCmd, anyRejected, logTimeTaken,
	} from './boot.lib.ts'
const force = (Deno.args[0] == '-f') || (Deno.args[1] == '-f');

debugger

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// --- First, compile all *.civet files to *.ts files

const lToCheck = await execBatch(
	'**/*.civet',
	compile, 'compiled',
	(path) => newerDestFileExists(path, '.ts')
	);

// --------------------------------------------------------------------------
// --- Next, type check all files in lToCheck

if (lToCheck.length > 0) {
	await execBatch(lToCheck, typeCheck, 'type checked');
	}

// --------------------------------------------------------------------------

await execBatch('**/*.cmd.ts', installCmd, 'installed');
// const code1 = await execCmd('build-dot-symbols');
const code2 = await execCmd('buildpar', ['all']);

if (true) {
	const result4 = await execCmd('utest', ['all']);
	}
