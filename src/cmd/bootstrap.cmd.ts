// bootstrap.cmd.ts

import {red, green, yellow} from 'jsr:@std/fmt/colors'
import {expandGlob} from 'jsr:@std/fs/expand-glob'
import {relative} from 'jsr:@std/path'
import {sprintf} from 'jsr:@std/fmt/printf'
import {exists} from '@std/fs'

const force = (Deno.args[0] == '-f');

// --------------------------------------------------------------------------

const decoder = new TextDecoder();

function decode(str: AllowSharedBufferSource): string {
	return decoder.decode(str)
	}

// --------------------------------------------------------------------------
// ASYNC

type TExecResult = {
	code: number
	stdout: string
	stderr: string
	}

async function execCmd(
		cmdName: string,
		lArgs: string[] = [],
		quiet: boolean = false
		): Promise<TExecResult> {

	const cmd = new Deno.Command(cmdName, {
		args: lArgs,
		stdout: 'piped',
		stderr: 'piped'
		});

	if (!quiet) {
		console.log(`RUN: ${cmdName} ${lArgs.join(' ')}`);
		}
	const {code, stdout, stderr} = await cmd.output();
	return {
		code,
		stdout: decode(stdout),
		stderr: decode(stderr)
		}
	}

// --------------------------------------------------------------------------
// ASYNC

async function fireCmd(
		cmdName: string,
		lArgs: string[] = [],
		): Promise<number> {

	const cmd = new Deno.Command(cmdName, {
		args: lArgs,
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit'
		});

	const process = cmd.spawn();
	const status = await process.status;
	return status.code;
	}

// --------------------------------------------------------------------------

async function compile(path: string): Promise<void> {

	const {code, stdout, stderr} = await execCmd("deno", [
		'run',
		'-A',
		'@danielx/civet',
		'--inline-map',
		'-o', '.ts',
		'-c', path
		], true);

	if (code === 0) {
		// --- type check the TypeScript file
		const {code, stdout, stderr} = await execCmd("deno", [
			'check',
			withExt(path, '.ts')
			], true);

		if (code === 0) {
			console.log('   ' + green(path));
			}
		else {
			console.error(red(stderr));
			}
		}
	else {
		console.log(`error code is ${code}`);
		console.error(red(stderr));
		}
	}

// --------------------------------------------------------------------------

function withExt(
		path: string,
		ext: string
		): string {

	const i = path.lastIndexOf('.');
	return path.substring(0, i) + ext;
	}

// --------------------------------------------------------------------------

async function newerDestFileExists(
		srcPath: string,
		ext: string
		): Promise<boolean> {

	const destPath = withExt(srcPath, '.ts')
	if (!await exists(destPath)) {
		return false;
		}
	const srcStats  = await Deno.stat(srcPath);
	const destStats = await Deno.stat(destPath);
	// @ts-ignore
	return destStats.mtime > srcStats.mtime;
	}

// --------------------------------------------------------------------------

async function installCmd(
		cmdName: string,
		path: string
		): Promise<void> {

	const {code, stdout, stderr} = await execCmd('deno', [
		'install',
		'--global',
		'--force',
		'--config', 'deno.json',
		'-A',
		'--name', cmdName,
		path
		], true);
	if (code == 0) {
		console.log(`Command ${cmdName} installed`);
		}
	else {
		console.error(`Install of command ${cmdName} failed`);
		console.error(stderr);
		}
	}

// --------------------------------------------------------------------------

const t0 = Date.now()

let nCompiled = 0;

const lPromises = []
for await (const entry of expandGlob("**/*.civet")) {
	const path = relative(Deno.cwd(), entry.path);
	if (!path.includes('\\.')) {
		if (!force && await newerDestFileExists(path, '.ts')) {
			console.log('   ' + yellow(path));
			}
		else {
			lPromises.push(compile(path));
			nCompiled += 1;
			}
		}
	}

const results = await Promise.allSettled(lPromises);
const timeTaken = Date.now() - t0;
console.log(`${nCompiled} files compiled in ${sprintf("%.2f", timeTaken/1000)} secs`);

await installCmd('buildcmd', 'src/cmd/buildcmd.cmd.ts');
await fireCmd('buildcmd', ['all']);
await fireCmd('build-dot-symbols');
await fireCmd('buildpar', ['all']);
await fireCmd('utest', ['all']);
