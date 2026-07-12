"use strict";
// file-server.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {serveFile, serveDir} from '@std/http/file-server'

import {LOG, DBG, ERR} from 'logger'
import {
	undef, defined, notdefined, croak, assert, getErrStr,
	} from 'base'
import {hash, TStringFilterFunc} from 'datatypes'
import {getOptions} from 'llutils'
import {mkpath, fileExt} from 'fsys'

type TFileResponse = [true, string] | [false, number]

// ---------------------------------------------------------------------------

export class CFileServer {
	root: string
	port: number
	hostname: string
	server: Deno.HttpServer

	// ..........................................................

	constructor(
			root1: string,
			port1: number = 8000,
			hostname1 = 'localhost'
			) {

		this.root = root1;

		this.port = port1;

		this.hostname = hostname1;

		this.server = Deno.serve(
			{
				hostname: this.hostname,
				port: this.port,
				onListen: this.onListen
				},
			async (req: Request) => {

				const url = new URL(req.url)
				const path = decodeURIComponent(url.pathname)

				if (!this.allow(path, req)) {
					return new Response("403: Forbidden", {status: 403})
				}

				try {
					return await this.getResponse(path, req)
				}
				catch {
					return new Response("404 Not Found", {status: 404})
				}
			})
	}

	// ..........................................................

	onListen(): void {

		DBG(`Listening on port ${this.port}`)
		return
	}

	// ..........................................................

	allow(
			path: string,
			req: Request
			): boolean {

		return true
	}

	// ..........................................................

	async getResponse(
			path: string,
			req: Request
			): AutoPromise<Response> {

		return await this.getFileResponse(path, req)
	}

	// ..........................................................
	// ASYNC

	async getFileResponse(
			path: string,
			req: Request
			): AutoPromise<Response> {

		const content_type = this.getContentType(path, req)
		switch(content_type) {
			case 'text/typescript': {
				const contents = await Deno.readTextFile(mkpath(this.root, path))
				assert(defined(contents),
						"in getFileResponse(): undef contents")
				return new Response(contents, {
					status: 200,
					headers: {'Content-type': content_type}
					})
			}
			default: {
				const contents = await Deno.readTextFile(mkpath(this.root, path))
				assert(defined(contents),
						"in getFileResponse()2: undef contents")
				return new Response(contents, {
					status: 200,
					headers: {'Content-type': content_type}
					})
			}
		}
	}

	// ..........................................................

	getContentType(
			path: string,
			req: Request
			): string {

		return (()=>{switch(fileExt(path)) {
			case '.civet': { return 'text/civet'
			}
			case '.js': { return 'text/javascript'
			}
			case '.ts': { return 'text/typescript'
			}
			case '.html':case '.htm': { return 'text/html'
			}
			default: { return 'text/plain' }
		}})()
		return ''
	}

	// ..........................................................

	[Symbol.dispose](): void {
		LOG("stopping file server")
		this.server.shutdown()
		return
	}
}

// ---------------------------------------------------------------------------
// ASYNC

export const getFile = async (
		fileName: string,
		port: number = 8000,
		hostname: string = 'localhost'
		): AutoPromise<TFileResponse> => {

	const response = await fetch(`http://${hostname}:${port}/${fileName}`)
	const {ok, status, type} = response
	if (ok) {
		return [true, await response.text()]
	}
	else {
		return [false, status]
	}
}


