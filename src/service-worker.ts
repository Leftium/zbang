/// <reference lib="webworker" />

import { readExecutionSettings, readMyBangs } from './lib/bang-data';
import { getBangSuggestions } from './lib/bang-suggestions';
import { defaultExecutionSettings } from './lib/execution-settings';
import {
	getBangExecutionItems,
	getSearchUrl,
	hasBangToken,
	resolveBangExecution
} from './lib/launcher/bang-resolver';
import { loadShippedBangCatalog } from './lib/shipped-bang-catalog';

declare const self: ServiceWorkerGlobalScope;

const SUGGESTION_LIMIT = 8;

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (url.origin !== self.location.origin) return;
	if (request.method !== 'GET') return;

	if (url.pathname === '/suggest') {
		event.respondWith(handleSuggestRequest(request, url));
		return;
	}

	if (request.mode !== 'navigate') return;

	if (url.pathname === '/go/open') {
		event.respondWith(handleGoOpenRequest(url));
		return;
	}

	if (url.pathname !== '/go') return;

	const query = url.searchParams.get('q')?.trim() ?? '';

	if (!query) return;

	event.respondWith(handleGoRequest(request, query));
});

function handleGoOpenRequest(url: URL) {
	const targetUrl = url.searchParams.get('target') ?? '';
	const channelName = url.searchParams.get('channel') ?? '';
	const index = Number(url.searchParams.get('index'));

	try {
		const target = new URL(targetUrl);

		if (!['http:', 'https:'].includes(target.protocol)) {
			throw new Error('Unsupported target URL');
		}

		if (!channelName || !Number.isInteger(index) || index < 1) {
			throw new Error('Missing fanout acknowledgement data');
		}

		return new Response(createGoOpenRelayHtml(target.toString(), channelName, index), {
			headers: { 'content-type': 'text/html; charset=utf-8' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return new Response(createGoOpenErrorHtml(message), {
			status: 400,
			headers: { 'content-type': 'text/html; charset=utf-8' }
		});
	}
}

async function handleSuggestRequest(request: Request, url: URL): Promise<Response> {
	try {
		const query = url.searchParams.get('q')?.trim() ?? '';
		const executionSettings = (await readExecutionSettings()) ?? defaultExecutionSettings;
		const [myBangs, catalogResult] = await Promise.all([
			readMyBangs().catch(() => []),
			loadShippedBangCatalog(executionSettings.bangProvider)
		]);
		const providerBangs = catalogResult.error ? [] : catalogResult.data.items;
		const filteredProviderBangs = getBangExecutionItems(myBangs, providerBangs).slice(
			myBangs.length
		);
		const mySuggestions = getBangSuggestions(query, myBangs, SUGGESTION_LIMIT);
		const providerSuggestions = getBangSuggestions(
			query,
			filteredProviderBangs,
			SUGGESTION_LIMIT - mySuggestions.length
		);
		const suggestions = [...mySuggestions, ...providerSuggestions];

		return new Response(
			JSON.stringify([
				query,
				suggestions.map(({ completion }) => completion),
				suggestions.map(({ description }) => description),
				suggestions.map(
					({ completion }) => `${self.location.origin}/go?q=${encodeURIComponent(completion)}`
				)
			]),
			{
				headers: {
					'content-type': 'application/x-suggestions+json; charset=utf-8'
				}
			}
		);
	} catch (error) {
		console.warn('Service worker failed to resolve /suggest request', error);
		return fetch(request);
	}
}

function createGoOpenRelayHtml(targetUrl: string, channelName: string, index: number) {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>Opening bang target | Whiz</title>
		${createGoOpenThemeHead()}
	</head>
	<body>
		<p>Opening bang target...</p>
		<script>
			const channel = new BroadcastChannel(${JSON.stringify(channelName)});

			channel.postMessage({ index: ${JSON.stringify(index)} });
			setTimeout(() => {
				channel.close();
				location.replace(${JSON.stringify(targetUrl)});
			}, 0);
		</script>
	</body>
</html>`;
}

function createGoOpenErrorHtml(message: string) {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>Could not open bang target | Whiz</title>
		${createGoOpenThemeHead()}
	</head>
	<body>
		<p>Could not open this bang target: ${escapeHtml(message)}</p>
	</body>
</html>`;
}

function createGoOpenThemeHead() {
	return `<meta name="color-scheme" content="light dark" />
		<script>
			try {
				const theme = localStorage.getItem('theme');
				if (theme === 'dark' || theme === 'light') {
					document.documentElement.dataset.theme = theme;
					document.documentElement.style.colorScheme = theme;
				}
			} catch {}
		</script>
		<style>
			html,
			body {
				margin: 0;
				background: #ffffff;
				color: #1f2937;
				font: 14px system-ui, sans-serif;
			}

			body {
				display: grid;
				min-height: 100vh;
				place-items: center;
			}

			p {
				margin: 0;
				opacity: 0.72;
			}

			html[data-theme='dark'],
			html[data-theme='dark'] body {
				background: #0f1117;
				color: #d1d5db;
			}

			@media (prefers-color-scheme: dark) {
				html:not([data-theme='light']),
				html:not([data-theme='light']) body {
					background: #0f1117;
					color: #d1d5db;
				}
			}
		</style>`;
}

function escapeHtml(value: string) {
	return value.replace(/[&<>"]/g, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return character;
		}
	});
}

async function handleGoRequest(request: Request, query: string): Promise<Response> {
	try {
		const executionSettings = await readExecutionSettings();

		if (!executionSettings) {
			return fetch(request);
		}

		if (!hasBangToken(query)) {
			return Response.redirect(
				getSearchUrl(
					executionSettings.searchProvider,
					query,
					executionSettings.customSearchTemplate
				),
				302
			);
		}

		const [myBangs, catalogResult] = await Promise.all([
			readMyBangs().catch(() => []),
			loadShippedBangCatalog(executionSettings.bangProvider)
		]);
		const providerBangs = catalogResult.error ? [] : catalogResult.data.items;
		const items = getBangExecutionItems(myBangs, providerBangs);
		const result = resolveBangExecution(query, items, executionSettings);

		if (result.targetUrls.length > 1) {
			return fetch(request);
		}

		return Response.redirect(result.targetUrl, 302);
	} catch (error) {
		console.warn('Service worker failed to resolve /go request', error);
		return fetch(request);
	}
}
