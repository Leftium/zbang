/// <reference lib="webworker" />

import { readExecutionSettings, readMyBangs } from './lib/bang-data';
import {
	getBangExecutionItems,
	getSearchUrl,
	hasBangToken,
	resolveBangExecution
} from './lib/launcher/bang-resolver';
import { loadShippedBangCatalog } from './lib/shipped-bang-catalog';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('fetch', (event) => {
	const request = event.request;

	if (request.mode !== 'navigate') return;

	const url = new URL(request.url);

	if (url.origin !== self.location.origin || url.pathname !== '/go') return;

	const query = url.searchParams.get('q')?.trim() ?? '';

	if (!query) return;

	event.respondWith(handleGoRequest(request, query));
});

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

		return Response.redirect(result.targetUrl, 302);
	} catch (error) {
		console.warn('Service worker failed to resolve /go request', error);
		return fetch(request);
	}
}
