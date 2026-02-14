"use strict";
// fsys.lib.test.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {
	undef, defined, hash, isString, deepEqual,
	} from 'datatypes'
import {
	o, spaces, sinceLoad, sinceLoadStr, sleep, pass,
	} from 'llutils'
import {LOG, DBG} from 'logger'
import {TPLLToken} from 'pll'
import {
	isFile, isDir, getPathType, fileExt, withExt,
	isStub, parsePath, allFilesMatching, allLinesIn,
	normalizePath, pathToURL, mkpath, relpath, pathSubDirs, myself,
	rmFile, rmDir, isExt, newerDestFileExists,
	clearDir, mkDir, mkDirsForFile, slurp, barf,
	removeFilesMatching, watchFile, FileEventHandler, TFsEventHandler,
	TPathType, TPathInfo, patchFirstLine, FsEvent, toFullPath,
	} from 'fsys'
import {
	equal, truthy, falsy, like, objListLike, matches,
	succeeds, fails, includesAll, setDirTree, fileOpsTable,
	} from 'unit-test'

// ---------------------------------------------------------------------------
// ASYNC

const setup = async (): AutoPromise<void> => {

	await setDirTree(`./src/test/fsys
dummy.txt
	dummy
tokens.txt
	if x==1
		print "OK"
	exit
file1.txt
	line1
	line2
	line3
file2.txt
	# test1.cielo

	LOG := (str) => console.log str
	LOG "Hello, World!"
file3.flags.txt
	# test1.cielo

	LOG := (str) => console.log str
	LOG "Hello, World!"
file4.cielo
	# file.cielo

	abc
file5.cielo
	this is the REAL first line
	# file.cielo

	abc
file.config.ts
	export default new Object({
		a: 1,
		b: 'abc',
		f: () => 'hello'
		})
/aaa
	/bbb
		newfile.txt
			abc
		oldfile.txt
			abc
		temp.txt
			abc
/subdir
	new.txt
		abc
		def`)
	return
}


await setup()

// ---------------------------------------------------------------------------

DBG("isFile()")

truthy(isFile('./deno.json'))
truthy(isFile('deno.json'))
falsy(isFile('./src/lib/notafile.txt'))
truthy(isFile("./src/test/fsys/dummy.txt"))
falsy( isFile("./src/test/fsys"))




DBG("isDir()")

truthy(isDir('src/test'))
falsy(isDir('nosuchdir'))
truthy(isDir("./src/test/fsys"))
falsy( isDir("./src/test/fsys/dummy.txt"))

DBG("type TPathType")

// isType  'TPathType', 'missing'
// isType  'TPathType', 'file'
// notType 'TPathType', 'xxx'

DBG("getPathType()")

equal(getPathType('./deno.json'), 'file')
equal(getPathType("./src/test/fsys"), 'dir')
equal(getPathType('./src/lib/notafile.txt'), 'missing')
equal(getPathType("./src/test"), 'dir')
equal(getPathType("./src/test/fsys.lib.test.civet"), 'file')
equal(getPathType("C:/temp/file.txt"), 'missing')

DBG("fileExt()")

equal(fileExt('C:/Users/johnd/util/deno.json'), '.json')
equal(fileExt("C:/temp/file.txt"), ".txt")
equal(fileExt("c:\\temp/to/file.txt"), ".txt")
equal(fileExt("c:\\temp/to/file.flag.txt"), ".txt")

DBG("withExt()")

equal(withExt('deno.json', '.txt'), 'deno.txt')
equal(withExt("C:/temp/file.txt", ".js"), "C:/temp/file.js")
equal(withExt("c:\\temp/to/file.txt", ".js"), "c:\\temp/to/file.js")
equal(withExt("c:\\temp/to/file.flag.txt", ".js"), "c:\\temp/to/file.flag.js")

DBG("isStub()")

truthy(isStub('abc'))
falsy( isStub('.js'))
falsy( isStub('abc/deno'))
falsy( isStub('abc\\deno'))

DBG("type TPathInfo", "parsePath()")

equal( parsePath("C:/temp/file.txt"), {
	root: 'C:/',
	dir: 'C:/temp',
	fileName: 'file.txt',
	stub: 'file',
	purpose: undefined,
	ext: '.txt'
	})

like(parsePath(import.meta.url), {
	fileName: 'fsys.lib.test.ts',
	stub: 'fsys.lib',
	purpose: 'test',
	ext: '.ts'
	});

(() => {
	const filterFunc = (path: string) => {
		const {fileName} = parsePath(path)
		return fileName.match(/^[a-z0-9]+\.txt$/)
	}

	const lPaths = Array.from(allFilesMatching('src/test/fsys/**'))
	equal(lPaths.filter(filterFunc).map((x) => parsePath(x).fileName), [
		'newfile.txt',
		'oldfile.txt',
		'temp.txt',
		'dummy.txt',
		'file1.txt',
		'file2.txt',
		'new.txt',
		'tokens.txt',
		])
}
	)()

DBG("allLinesIn()")

const lLines: string[] = []
for await (const line of allLinesIn('./src/test/fsys/file1.txt')) {
	lLines.push(line)
}

equal(lLines, [
	'line1',
	'line2',
	'line3'
	])

DBG("normalizePath()")

equal(normalizePath("C:/temp/file.txt"), "C:/temp/file.txt")
equal(normalizePath("C:\\temp/to/file.txt"), "C:/temp/to/file.txt")
equal(normalizePath("C:\\temp/to/file.flag.txt"), "C:/temp/to/file.flag.txt")
equal(normalizePath('C:\\Users\\johnd'), 'C:/Users/johnd')

DBG("pathToURL()")

equal(pathToURL('c:/x/temp.txt'), "file:///c:/x/temp.txt")

DBG("mkpath()")

equal(mkpath("C:/temp/file.txt"), "C:/temp/file.txt")
equal(mkpath("C:/temp", "file.txt"), "C:/temp/file.txt")
equal(mkpath("C:\\temp/to/file.txt"), "C:/temp/to/file.txt")
equal(mkpath("C:\\temp/to/file.flag.txt"), "C:/temp/to/file.flag.txt")
equal(mkpath("C:/temp", "file.txt"), "C:/temp/file.txt")
equal(mkpath("C:\\temp/to", "file.txt"), "C:/temp/to/file.txt")
equal(mkpath("C:\\temp", "to/file.flag.txt"), "C:/temp/to/file.flag.txt")
equal(mkpath('c:\\', 'Users', 'johnd'), 'C:/Users/johnd')

DBG("relpath()")

equal(relpath('C:/Users/johnd/util/deno.json'), 'deno.json')

DBG("type TPathDesc", "pathSubDirs()");

(() => {
	const fullPath = "C:/Users/johnd/util/src/test/fsys/deno.json"
	const relPath  = "src/test/fsys/deno.json"

	// --- try both full and relative paths
	equal(pathSubDirs(fullPath), {
		dir: 'C:/Users/johnd/util/src/test/fsys',
		root: "C:/",
		lParts: ['Users', 'johnd', 'util', 'src', 'test', 'fsys']
		})
	equal(pathSubDirs(relPath), {
		dir: 'C:/Users/johnd/util/src/test/fsys',
		root: "C:/",
		lParts: ['Users', 'johnd', 'util', 'src', 'test', 'fsys']
		})
}
	)()

DBG("myself()")

equal(myself(import.meta.url), 'src/test/fsys.lib.test.ts')

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

DBG("slurp(path)")

equal(slurp('./src/test/fsys/file1.txt'), `line1
line2
line3`)

const barfPath = 'src/test/fsys/barfed.txt'

DBG("barf(path, contents)");

(() => {
	const contents = `abc

xyz`

	barf(barfPath, contents)
	equal(slurp(barfPath), `abc

xyz`)
}
	)()

DBG("isExt(str)")

truthy(isExt('.something'))
falsy( isExt('./windows/temp.txt'))

DBG("newerDestFileExists(srcPath, destPath)")

truthy(newerDestFileExists('src/test/fsys/file1.txt', barfPath))
falsy( newerDestFileExists(barfPath, 'src/test/fsys/file1.txt'))

DBG("mkDir()")

falsy( isDir('src/test/fsys/tempdir'))
falsy( isFile('src/test/fsys/tempdir/file42.txt'))
mkDir('src/test/fsys/tempdir')
barf('src/test/fsys/tempdir/file42.txt', 'abc')
truthy(isDir('src/test/fsys/tempdir'))
truthy(isFile('src/test/fsys/tempdir/file42.txt'))

DBG("rmFile()")

truthy(isFile(barfPath))
rmFile(barfPath)
falsy( isFile(barfPath))

DBG("rmDir()")

truthy(isDir('src/test/fsys/tempdir'))
rmDir('src/test/fsys/tempdir', o`clear`)
falsy( isDir('src/test/fsys/tempdir'))

const path = 'src/test/fsys/aaa/bbb/newfile.txt'

DBG("mkDirsForFile(path)");

(() => {
	mkDirsForFile(path)
	truthy(isDir('src/test/fsys'))
	truthy(isDir('src/test/fsys/aaa'))
	truthy(isDir('src/test/fsys/aaa/bbb'))
	falsy( isDir('src/test/fsys/aaa/bbb/ccc'))
	truthy(isFile(path))
	barf(path, 'abc')
	truthy(isFile(path))
}
	)()

DBG("clearDir(dir)");

(async () => {
	await setup()
}
//	clearDir 'src/test/fsys/aaa'

//	truthy isDir('src/test/fsys/aaa')
//	falsy  isDir('src/test/fsys/aaa/bbb')
//	falsy  isFile(path)
	)()

DBG("removeFilesMatching()");

(async () => {
	await setup()
}
//	removeFilesMatching '**/*file.txt'

//	falsy  isFile('src/test/fsys/aaa/newfile.txt')
//	falsy  isFile('src/test/fsys/aaa/bbb/newfile.txt')
//	falsy  isFile('src/test/fsys/aaa/bbb/oldfile.txt')
//	truthy isFile('src/test/fsys/aaa/bbb/temp.txt')
	)()

DBG("type TFsEventHandler", "class FileEventHandler");

(async () => {
	const lChanges: string[] = []
	const fileChangeFunc: TFsEventHandler = (kind, path) => {
		lChanges.push(kind)
		return
	}

	const handler = new FileEventHandler(fileChangeFunc)
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp2.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})

	await sleep(2)

	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})

	await sleep(2)

	const expected = [
		{kind: 'modify', paths: ['/usr/lib/temp2.txt']},
		{kind: 'modify', paths: ['/usr/lib/temp.txt']},
		{kind: 'modify', paths: ['/usr/lib/temp.txt']}
		]

	equal(lChanges, expected)
}
	)();

(async () => {
	await setup()

	const lChanges: hash[] = []
	const handler = new FileEventHandler((kind, path) => {
		lChanges.push({kind, path})
		return
	}
		)
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp2.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})

	await sleep(2)

	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})
	handler.handle({
		kind: 'modify',
		paths: ['/usr/lib/temp.txt']
		})

	await sleep(2)

	const expected = [
		{kind: 'modify', path: '/usr/lib/temp2.txt'},
		{kind: 'modify', path: '/usr/lib/temp.txt'},
		{kind: 'modify', path: '/usr/lib/temp.txt'}
		]

	equal(lChanges, expected)
}
	)()

DBG("type TFsEventHandler", "watchFile()", "watchFiles()")

await (async () => {
	// --- Set contents of dummy.txt to standard contents
	const path = toFullPath('src/test/fsys/dummy.txt')
	barf(path, 'dummy')

	let doStop: boolean = false
	const lChanges: hash[] = []
	const add = (str: string, stop: boolean=false): void => {
		if (stop) {
			doStop = true
		}
		barf(path, str, o`append`)
		return
	}

	const callback: TFsEventHandler = (kind, path) => {
		lChanges.push({
			kind,
			path,
			ms: sinceLoad()
			})
		return doStop
	}

	const promise = watchFile(path, callback)

	add('A')
	add('B')
	add('C')
//	await sleep 0.3
	add('D')
	add('E', true)

	await Promise.allSettled([promise])

	equal(slurp(path), 'dummyABCDE')

	objListLike(lChanges, [
		{kind: 'modify', path},
		{kind: 'modify', path}
		])
}
	)       // ()

DBG("patchFirstLine(path, str, newstr)");

(() => {
	const path1 = 'src/test/fsys/file4.cielo'
	const path2 ='src/test/fsys/file5.cielo'
	patchFirstLine(path1, '.cielo', '.civet')
	patchFirstLine(path2, '.cielo', '.civet')
	truthy(slurp(path1).includes('file.civet'))
	falsy( slurp(path2).includes('file.civet'))
}
	)()

// ---------------------------------------------------------------------------
// --- These tests depend on my particular directory structure

DBG("allFilesMatching()");

(() => {
	const lFiles = Array.from(allFilesMatching('src/test/fsys/file*.txt'))
	equal(lFiles.map((x) => relpath(x)), [
		'src/test/fsys/file1.txt',
		'src/test/fsys/file2.txt',
		'src/test/fsys/file3.flags.txt'
		])
}
	)();

(() => {
	const lFiles =  Array.from(allFilesMatching('src/test/fsys/**', o`includeDirs`))
	equal(lFiles.map((x) => parsePath(x).fileName), [
		'fsys',
		'aaa',
		'bbb',
		'newfile.txt',
		'oldfile.txt',
		'temp.txt',
		'dummy.txt',
		'file.config.ts',
		'file1.txt',
		'file2.txt',
		'file3.flags.txt',
		'file4.cielo',
		'file5.cielo',
		'subdir',
		'new.txt',
		'tokens.txt',
		])
}
	)();

(() => {
	const filterFunc = (path: string) => {
		if (isDir(path)) {
			return parsePath(path).fileName !== 'fsys'
		}
		else if (isFile(path)) {
			const {fileName} = parsePath(path)
			return defined(fileName.match(/^[a-z0-9]+\.txt$/))
		}
		else {
			return false
		}
	}

	const lPaths = Array.from(allFilesMatching('src/test/fsys/**', {includeDirs: true}))
	equal(lPaths.filter(filterFunc).map((x) => parsePath(x).fileName), [
		'aaa',
		'bbb',
		'newfile.txt',
		'oldfile.txt',
		'temp.txt',
		'dummy.txt',
		'file1.txt',
		'file2.txt',
		'subdir',
		'new.txt',
		'tokens.txt',
		])
}
	)()

