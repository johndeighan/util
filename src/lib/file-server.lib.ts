"use strict";
// file-server.lib.civet

import {serveFile, serveDir} from '@std/http/file-server'

import {hash, TStringFilterFunc} from 'datatypes'
import {getOptions} from 'llutils'
import {LOG, DBG, ERR} from 'logger'
import {mkpath, relpath} from 'fsys'

const defPort = 8000

// ---------------------------------------------------------------------------

export class CFileServer {
	port: number
	root: string
	server: Deno.HttpServer

	constructor(root1: string, hOptions: hash = {}) {

		this.root = root1;

		type opt = {
			port: number
			verbose: boolean
			allow: TStringFilterFunc
			}
		const {port: port1, verbose, allow} = getOptions<opt>(hOptions, {
			port: defPort,
			verbose: true,
			allow: (s) => true
			});this.port = port1;

		const onListen = () => {
			if (verbose) {
				LOG(`Listening on port ${this.port}`)
			}
		}

		this.server = Deno.serve({onListen}, (req: Request) => {

			if (!allow(req.url)) {
				return new Response("403: Forbidden", {status: 403})
			}

			LOG("Starting file server")
			return serveDir(req, {
				fsRoot: this.root,
				showDirListing: true,
				showIndex: false,
				enableCors: true,
				quiet: !verbose
				})
		})
	}

	[Symbol.dispose](): void {
		LOG("stopping file server")
		return
	}
}

