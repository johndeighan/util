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

export async function compile(path: string): Promise<number> {

	const code = await execCmd("deno", [
		'run',
		'-A',
		'@danielx/civet',
		'--inline-map',
		'-o', '.ts',
		'-c', path
		]);

	if (code === 0) {
		console.log(`   COMPILE ${green(path)}`);
		}
	else {
		throw new Error(`compile of ${path} failed with code ${code}`);
		}
	return code;
	}

// --------------------------------------------------------------------------

export async function typeCheck(path: string): Promise<number> {

	const code = await execCmd("deno", [
		'check',
		withExt(path, '.ts')
		]);

	if (code === 0) {
		console.log(`   TYPE CHECK ${green(path)}`);
		}
	else {
		throw new Error(`type check of ${path} failed with code ${code}`);
		}
	return code;
	}

// --------------------------------------------------------------------------

export async function installCmd(
		path: string
		): Promise<number> {

	const {name} = parse(path);
	const cmdName = name.replace('.cmd', '');

	const code = await execCmd('deno', [
		'install',
		'--global',
		'--force',
		'--config', 'deno.json',
		'-A',
		'--name', cmdName,
		path
		]);
	if (code == 0) {
		console.log(`   INSTALL ${green(cmdName)}`);
		}
	else {
		throw new Error(`Install of command ${cmdName} failed with code ${code}`);
		}
	return code;
	}

// --------------------------------------------------------------------------
// ASYNC

export async function execCmd(
		cmdName: string,
		lArgs: string[] = [],
		): Promise<number> {

	const cmd = new Deno.Command(cmdName, {
		args: lArgs,
		stdout: 'inherit',
		stderr: 'inherit'
		});

	const {code} = await cmd.output();
	return code
	}

// --------------------------------------------------------------------------

export function anyRejected(lResults: PromiseSettledResult<unknown>[]): boolean {

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
