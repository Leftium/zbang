import type { ZbangRecord } from '$lib/bang-data';
import { defaultCustomSearchTemplate, type SearchProvider } from '$lib/execution-settings';

import { getBangCodeSet, hasBangCodeOverlap } from './bang-code';
import { createBangCodeMap, parseBangComposition } from './bang-composition';
import type { BangComposition } from './types';

export type BangExecutionSettings = {
	searchProvider: SearchProvider;
	customSearchTemplate: string;
};

export type BangExecutionResult = {
	targetUrl: string;
	targetUrls: string[];
	composition: BangComposition;
};

export function resolveBangExecution(
	query: string,
	items: ZbangRecord[],
	settings: BangExecutionSettings
): BangExecutionResult {
	const composition = parseBangComposition(query, createBangCodeMap(items), undefined);
	const targetUrls = getBangExecutionTargetUrls(composition, settings);
	const firstTargetUrl = targetUrls[0];

	if (firstTargetUrl) {
		return {
			composition,
			targetUrl: firstTargetUrl,
			targetUrls
		};
	}

	return {
		composition,
		targetUrl: getSearchUrl(settings.searchProvider, query, settings.customSearchTemplate),
		targetUrls: [getSearchUrl(settings.searchProvider, query, settings.customSearchTemplate)]
	};
}

export function getBangExecutionTargetUrls(
	composition: BangComposition,
	settings: BangExecutionSettings
) {
	const targetUrls = composition.localTargets.map(({ item }) =>
		composition.payloadText ? getBangSearchUrl(item, composition.payloadText) : getBangOpenUrl(item)
	);

	if (composition.forwardedTokens.length) {
		const forwardedQuery = [...composition.forwardedTokens, composition.payloadText]
			.filter(Boolean)
			.join(' ');

		targetUrls.push(
			getSearchUrl(settings.searchProvider, forwardedQuery, settings.customSearchTemplate)
		);
	}

	return targetUrls;
}

export function getBangExecutionItems(myBangs: ZbangRecord[], providerBangs: ZbangRecord[]) {
	const myBangCodes = getBangCodeSet(myBangs);
	const filteredProviderBangs = providerBangs.filter(
		(item) => !hasBangCodeOverlap(item, myBangCodes)
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

export function hasBangToken(value: string) {
	return (value.match(/\S+/g) ?? []).some((token) => /^![^\s!]+$/.test(token));
}

export function getBangSearchUrl(item: ZbangRecord, query: string) {
	return item.urls.s.replace(/%s/g, encodeURIComponent(query.trim()));
}

export function getBangOpenUrl(item: ZbangRecord) {
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
