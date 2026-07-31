// boot.lib.ts

import {red, green, yellow} from 'jsr:@std/fmt/colors'
import {sprintf} from 'jsr:@std/fmt/printf'
import {exists, existsSync} from '@std/fs'
import {expandGlob} from 'jsr:@std/fs/expand-glob'
import {relative} from 'jsr:@std/path'
import {parse} from "jsr:@std/path";

// --------------------------------------------------------------------------

export async function execBatch(
		glob:      string | string[],
		handle:    (path: string) => Promise<number>,
		opName: string,
		notNeeded: (path: string) => boolean = ((path) => false)
		): Promise<string[]> {

	// --- Build the list of files to be processed
	let nNotNeeded = 0;
	let lFiles: string[] = []
	if (typeof glob == 'string') {
		for await (const entry of expandGlob(glob)) {
			const path = relative(Deno.cwd(), entry.path);
			if (!path.includes('\\.')) {
				if (notNeeded(path)) {
					nNotNeeded += 1
					}
				else {
					lFiles.push(path);
					}
				}
			}
		}
	else {
		for (const path of glob) {
			if (notNeeded(path)) {
				nNotNeeded += 1
				}
			else {
				lFiles.push(path);
				}
			}
		}

	const lPromises = [];
	const t0 = Date.now();
	for (const path of lFiles) {
		lPromises.push(handle(path));
		}
	const lResults = await Promise.allSettled(lPromises);

	const total = nNotNeeded + lFiles.length;
	logTimeTaken(lFiles.length, total, opName, (Date.now() - t0)/1000);

	if (anyRejected(lResults)) {
		console.log("Exiting due to errors");
		Deno.exit(-1);
		}
	return lFiles;
	}

// --------------------------------------------------------------------------

export async function compile(path: string): Promise<void> {

	await execCmd("deno", [
		'run',
		'-A',
		'@danielx/civet',
		'--inline-map',
		'-o', '.ts',
		'-c', path
		]);
	return;
	}

// --------------------------------------------------------------------------

export async function typeCheck(path: string): Promise<void> {

	await execCmd("deno", [
		'check',
		withExt(path, '.ts')
		]);
	return;
	}

// --------------------------------------------------------------------------

export async function installCmd(
		path: string
		): Promise<void> {

	const {name} = parse(path);
	const cmdName = name.replace('.cmd', '');

	await execCmd('deno', [
		'install',
		'--global',
		'--force',
		'--config', 'deno.json',
		'-A',
		'--name', cmdName,
		path
		]);
	return;
	}

// --------------------------------------------------------------------------
// ASYNC

export async function execCmd(
		cmdName: string,
		lArgs: string[] = []
		): Promise<void> {

	const cmdStr = getCmdStr(cmdName, lArgs);
	console.log(`EXEC ${cmdStr}`);
	const cmd = new Deno.Command(cmdName, {
		args: lArgs,
		stdout: 'inherit',
		stderr: 'inherit'
		});

	const {code} = await cmd.output();
	assert((code == 0), `Command ${cmdName} failed with code ${code}`);
	console.log(green(`   ${cmdStr} SUCCEEDED`));
	return;
	}

// --------------------------------------------------------------------------

export function anyRejected(
		lResults: PromiseSettledResult<unknown>[]
		): boolean {

	for (const result of lResults) {
		if (result.status == 'rejected') {
			return true;
			}
		}
	return false;
	}

// --------------------------------------------------------------------------

export function withExt(
		path: string,
		ext: string
		): string {

	const i = path.lastIndexOf('.');
	return path.substring(0, i) + ext;
	}

// --------------------------------------------------------------------------

export function newerDestFileExists(
		srcPath: string,
		ext: string
		): boolean {

	const destPath = withExt(srcPath, '.ts')
	if (!existsSync(destPath)) {
		return false;
		}
	const srcStats  = Deno.statSync(srcPath);
	const destStats = Deno.statSync(destPath);
	// @ts-ignore
	return destStats.mtime > srcStats.mtime;
	}

// --------------------------------------------------------------------------

export function logTimeTaken(
		n: number,
		tot: number,
		op: string,
		secs: number
		) {

	console.log(`${n} of ${tot} files ${op} in ${sprintf("%.2f", secs)} secs`);
	}

// --------------------------------------------------------------------------

const decoder = new TextDecoder();

export function decode(str: AllowSharedBufferSource): string {
	return decoder.decode(str)
	}

// --------------------------------------------------------------------------

export function assert(cond: boolean, errMsg: string): void {
	if (!cond) {
		console.log(red(`ERROR: ${errMsg}`))
		Deno.exit(99)
		}
	return;
	}

// --------------------------------------------------------------------------

function getCmdStr(
		cmdName: string,
		lArgs: string[] = []
		): string {

	let cmdStr = `${cmdName} ${lArgs.join(' ')}`;
	if (cmdStr.length > 64) {
		cmdStr = cmdStr.substring(0, 61) + '...';
		}
	return cmdStr;
	}
