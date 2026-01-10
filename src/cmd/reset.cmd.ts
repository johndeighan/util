"use strict";
// reset.cmd.civet

import {stdChecks } from 'llutils'
import {
	procFiles, doRemoveTsFile, doRemoveFile, doInstallCmd, doUninstallCmd,
	} from 'exec'
import {isDir, rmDir, rmFile, allFilesMatching } from 'fsys'

stdChecks("reset")

// ---------------------------------------------------------------------------

// --- 1. remove file civetconfig.ts
console.log("Remove civetconfig.ts")
rmFile('civetconfig.ts')

// --- 2. remove all *.ts files corresponding to *.civet files
//           if purpose is 'lib', 'cmd', 'parse', or 'test'
console.log("Remove *.{lib,cmd,parse,text}.ts")
await procFiles(['*.{lib,cmd,parse,test}.ts', doRemoveTsFile])

// 3. remove all temp files
console.log("Remove temp files")
await procFiles(['*.temp.*', doRemoveFile])

// 4. If there is a directory named 'test', remove any subfolders
console.log("Remove test subfolders")
for (const path of allFilesMatching("**/test/*", {includeDirs: true})) {
	if (isDir(path)) {
		rmDir(path, {clear: true})
	}
}

// 5. remove all log files
console.log("Remove log files")
await procFiles(['log/*', doRemoveFile])

// 6. uninstall all commands installed by this project
console.log("Uninstall cmd files")
await procFiles(['*.cmd.ts', doUninstallCmd])