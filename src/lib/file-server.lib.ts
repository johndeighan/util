"use strict";
// file-server.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {serveFile, serveDir} from '@std/http/file-server'

import {
	undef, defined, notdefined, assert,
	hash, TStringFilterFunc, getErrStr,
	} from 'datatypes'
import {getOptions, croak} from 'llutils'
import {LOG, DBG, ERR} from 'logger'
import {mkpath, relpath, fileExt} from 'fsys'

const defPort = 8000

// ---------------------------------------------------------------------------

export class CFileServer {
	port: number
	verbose: boolean
	root: string
	server: Deno.HttpServer

	eventSource: (EventSource | undefined) = undef

	constructor(
			root1: string,
			hOptions: hash = {}
			) {

		this.root = root1;

		type opt = {
			port: number
			verbose: boolean
			allow: TStringFilterFunc
			}
		const {port, verbose, allow} = getOptions<opt>(hOptions, {
			port: defPort,
			verbose: true,
			allow: (s) => true
			})
		this.port = port
		this.verbose = verbose

		this.server = Deno.serve(
			{
				hostname: 'localhost',
				port: this.port,
				onListen: this.onListen
				},
			async (req: Request) => {

				const url = new URL(req.url)
				const path = decodeURIComponent(url.pathname)

				if (this.forbid(path, req)) {
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

	sseConnect(url: string): void {

		LOG("📡 Connecting to SSE stream...")

		// --- 🔌 Create EventSource connection
		this.eventSource = new EventSource(url)

		// --- 🎧 Listen for incoming messages
		this.eventSource.onmessage = (event) => {
			console.log(`📨 Message received: ${event.data}`)
			this.handleMessage(JSON.parse(event.data))
		}

		// --- ✅ Connection opened successfully
		this.eventSource.onopen = () => {
      	console.log("✅ SSE connection established!")
		}

		// --- ❌ Handle connection errors
		this.eventSource.onerror = (err) => {
			console.error(`❌ SSE connection error: ${getErrStr(err)}`)
		}

		// --- 🔍 Check connection state
		if (this.eventSource?.readyState === EventSource.CLOSED) {
			console.log("🔌 SSE connection closed")
		}
		else if (this.eventSource?.readyState === EventSource.CONNECTING) {
			console.log("🔄 SSE reconnecting...")
		}
		return
	}

	// ..........................................................

	sseDisconnect(): void {

		if (this.eventSource) {
			console.log("🔌 Closing SSE connection...")
			this.eventSource.close()
			this.eventSource = undef
		}
		return
	}

	// ..........................................................

	handleMessage(data: any): void {

		// --- Override in subclasses or provide callback
		console.log(`📥 Processing message: ${data}`)
		return
	}

	// ..........................................................

	onListen(): void {

		if (this.verbose) {
			LOG(`Listening on port ${this.port}`)
		}
		return
	}

	// ..........................................................

	forbid(path: string, req: Request): boolean {

		return false
	}

	// ..........................................................

	customResponse(
			contents: string,
			content_type: string = 'text/plain'
			): Response {

		return new Response(contents, {
			status: 200,
			headers: {
				'Content-type': content_type
				}
			})
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
				assert(defined(contents))
				return new Response(contents, {
					status: 200,
					headers: {
						'Content-type': content_type
						}
					})
			}
			default: {
				const contents = await Deno.readTextFile(mkpath(this.root, path))
				assert(defined(contents))
				return new Response(contents, {
					status: 200,
					headers: {
						'Content-type': content_type
						}
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

