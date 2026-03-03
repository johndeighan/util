"use strict";
// html-window.lib.civet

import {Webview} from '@webview/webview'

// ---------------------------------------------------------------------------

export class HtmlWindow {

	readonly view: Webview = new Webview()
	html: string = ''

	display(html1: string): void {
		this.html = html1;
		this.view.navigate(`data:text/html,${encodeURIComponent(this.html)}`)
		this.view.run()
		return
	}
}

