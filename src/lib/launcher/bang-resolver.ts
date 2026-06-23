import type { Zbang } from '$lib/bang-data';
import { defaultCustomSearchTemplate, type SearchProvider } from '$lib/settings.svelte';

import { createBangCodeMap, parseBangComposition } from './bang-composition';
import type { BangComposition } from './types';

export type BangExecutionSettings = {
	searchProvider: SearchProvider;
	customSearchTemplate: string;
};

export type BangExecutionResult = {
	targetUrl: string;
	composition: BangComposition;
};

export function resolveBangExecution(
	query: string,
	items: Zbang[],
	settings: BangExecutionSettings
): BangExecutionResult {
	const composition = parseBangComposition(query, createBangCodeMap(items), undefined);
	const firstTarget = composition.localTargets[0];

	if (firstTarget) {
		return {
			composition,
			targetUrl: composition.payloadText
				? getBangSearchUrl(firstTarget.item, composition.payloadText)
				: getBangOpenUrl(firstTarget.item)
		};
	}

	const fallbackQuery = composition.hasTargets
		? [...composition.forwardedTokens, composition.payloadText].filter(Boolean).join(' ')
		: query;

	return {
		composition,
		targetUrl: getSearchUrl(settings.searchProvider, fallbackQuery, settings.customSearchTemplate)
	};
}

export function getBangExecutionItems(myBangs: Zbang[], providerBangs: Zbang[]) {
	const myBangCodes = new Set(myBangs.flatMap((item) => item.code.map(normalizeBangCode)));
	const filteredProviderBangs = providerBangs.filter(
		(item) => !item.code.some((code) => myBangCodes.has(normalizeBangCode(code)))
	);

	return [...myBangs, ...filteredProviderBangs];
}

export function getSearchUrl(
	provider: SearchProvider,
	query: string,
	customTemplate = defaultCustomSearchTemplate
) {
	const trimmedQuery = query.trim();
	const customSearchTemplate = customTemplate.includes('%s')
		? customTemplate
		: defaultCustomSearchTemplate;

	if (!trimmedQuery) {
		return {
			kagi: 'https://kagi.com/',
			duckduckgo: 'https://duckduckgo.com/',
			google: 'https://www.google.com/',
			custom: customSearchTemplate.replace(/%s/g, '')
		}[provider];
	}

	const encodedQuery = encodeURIComponent(trimmedQuery);

	return {
		kagi: `https://kagi.com/search?q=${encodedQuery}`,
		duckduckgo: `https://duckduckgo.com/?q=${encodedQuery}`,
		google: `https://www.google.com/search?q=${encodedQuery}`,
		custom: customSearchTemplate.replace(/%s/g, encodedQuery)
	}[provider];
}

export function getBangSearchUrl(item: Zbang, query: string) {
	return item.urls.s.replace(/%s/g, encodeURIComponent(query.trim()));
}

export function getBangOpenUrl(item: Zbang) {
	const placeholder = '__zbang_query__';
	const template = item.urls.s.replace(/%s/g, placeholder);

	try {
		const url = new URL(template);
		const params = [...url.searchParams.entries()];
		const hasQueryPlaceholder = params.some(([, value]) => value.includes(placeholder));

		for (const [key, value] of params) {
			if (value.includes(placeholder)) url.searchParams.delete(key);
		}

		if (url.hash.includes(placeholder)) url.hash = '';

		if (url.pathname.includes(placeholder)) {
			url.pathname = url.pathname
				.split('/')
				.filter((segment) => segment && !segment.includes(placeholder))
				.join('/');
		}

		return hasQueryPlaceholder ? `${url.origin}/` : url.toString();
	} catch {
		return item.urls.s.replace(/%s/g, '');
	}
}

function normalizeBangCode(code: string) {
	return (code.startsWith('!') ? code : `!${code}`).toLowerCase();
}
