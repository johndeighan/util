"use strict";
// html-window.lib.civet

type AutoPromise<T> = Promise<Awaited<T>>;
import {createResponse} from '@mwid/better-sse'
import {Webview} from '@webview/webview'
import {WebUI} from '@webui'

import {
	undef, defined, notdefined, assert, croak, getErrStr,
	TVoidFunc, hash, hashof,
	} from 'datatypes'
import {getOptions, sleep} from 'llutils'
import {LOG, DBG, WARN, ERR} from 'logger'
import {mkpath, slurp, isFile, isDir} from 'fsys'
import {execCmd} from 'exec'
import {CFileServer} from 'file-server'

// ---------------------------------------------------------------------------
// uses deno-webui

export class CHtmlWindow {

	webui = new WebUI()

	constructor() {

		this.webui.setPublic(true)
	}

	// ..........................................................

	defineFunc(funcName: string, func: TVoidFunc): void {

		this.webui.bind(funcName, func)
		return
	}

	// ..........................................................
	// ASYNC

	// --- source can be HTML or a file name

	async show(
			source: string,
			hOptions: hash = {}
			): AutoPromise<void> {

		type opt = {
			width: number
			height: number
			}
		const {width, height} = getOptions<opt>(hOptions, {
			width: 400,
			height: 300
			})

		const html = (
			(()=>{if (source.startsWith('<html')) {
				return source
			}
			else {
				const path = mkpath(Deno.cwd(), source)
				LOG(`CHtmlWindow path = ${path}`)
				if (isFile(path)) {
					return slurp(path)
				}
				else {
					return croak(`Expected HTML or name of HTML file
GOT source = ${source}`)
				}
			}})()
			)
		this.webui.setSize(width, height)

		// --- Bind a backend function to a frontend element
		this.webui.bind("exit", () => {
			// --- Closes all windows and exits the Deno process
			WebUI.exit();
		})

		await this.webui.showBrowser(html, WebUI.Browser.Chrome)
		return
	}

	// ..........................................................

	sendEvent(evtName: string, data: unknown): void {

		const json = JSON.stringify(data)
		return
	}

	// ..........................................................

	async [Symbol.dispose](): AutoPromise<never> {

		console.log("disposing HTML window")
		await WebUI.wait()
		await WebUI.exit()
		Deno.exit()
	}
}

