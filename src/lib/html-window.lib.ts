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

// ---------------------------------------------------------------------------
// uses deno-webui

export class CHtmlWindow {

	window = new WebUI()

	constructor() {

		this.window.setPublic(true)
	}

	// ..........................................................

	defineFunc(funcName: string, func: TVoidFunc): void {

		this.window.bind(funcName, func)
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
		this.window.setSize(width, height)

		// --- Bind a backend function to a frontend element
		this.window.bind("exit", () => {
			// --- Closes all windows and exits the Deno process
			WebUI.exit();
		})

		await this.window.showBrowser(html, WebUI.Browser.Chrome)
		return
	}

	// ..........................................................run

	sendEvent(evtName: string, data: unknown): void {

		const json = JSON.stringify(data)
		return
	}

	// ..........................................................

	async [Symbol.dispose](): AutoPromise<void> {

		console.log("disposing HTML window")
		await WebUI.exit()
		console.log("cleaning up HTML window")
		await WebUI.clean()
	}
}

