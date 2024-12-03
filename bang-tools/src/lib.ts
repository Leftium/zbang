import dayjs from 'dayjs'
import jetpack from 'fs-jetpack'
import { FSJetpack } from 'fs-jetpack/types.js'
import normalizeUrl from 'normalize-url'

export type Zbang = {
	code: string[]
	ddgr: number
	name: string
	nurl?: string
	rank?: number
	urls: {
		s: string
	}
}

export interface WithHttpStatus {
	status?: number
	statusText?: string
}

export async function doWithHistory(
	cwdOutput: FSJetpack,
	callback: { (): Promise<void>; (): unknown }
) {
	const datestamp = dayjs().format('YYYY.MM.DD__HH.mm__ss.SSS')
	const historyFolderName = `bangs.history/${datestamp}-${callback.name}`
	const cwdBefore = jetpack.dir(`${historyFolderName}/1-before`)
	const cwdAfter = jetpack.dir(`${historyFolderName}/2-after`)

	jetpack.copy(cwdOutput.path(), cwdBefore.path(), { overwrite: true })
	await callback()
	jetpack.copy(cwdOutput.path(), cwdAfter.path(), { overwrite: true })
}

export function deepUnescape(s: string) {
	let beforeEscape = s
	let afterEscape = unescape(s)

	while (beforeEscape !== afterEscape) {
		;[beforeEscape, afterEscape] = [afterEscape, unescape(beforeEscape)]
	}

	return afterEscape
}

export function getDomain(href: string) {
	try {
		const url = new URL(href)
		return url.hostname
	} catch {
		return href
	}
}

export function normalizeUrlTemplate(
	url: string,
	options: { keepCase?: boolean; stripWWW?: boolean } = {}
) {
	const { keepCase, stripWWW } = { keepCase: false, stripWWW: false, ...options }

	// console.log(url)
	if (url[0] === '/') {
		// User can switch between DuckDuckGo, Kagi, Google, etc.
		url = 'http://bang-provider' + url
	}

	url = deepUnescape(url).trim()
	url = normalizeUrl(url, { stripWWW })
	url = deepUnescape(url).trim() // Undo any additional escaping that was done.

	if (!keepCase) {
		url = url.toLowerCase()
	}

	url = url.replaceAll('{{{s}}}', '%s')

	return url
}
