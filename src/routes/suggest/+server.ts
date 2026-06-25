import { json, type RequestHandler } from '@sveltejs/kit';

import kagiCatalog from '../../../catalogs/zbang.catalog.kagi.json';

import { getBangSuggestions } from '$lib/bang-suggestions';
import { rankZbangRecords, validateZbangCatalog, type ZbangCatalog } from '$lib/bang-catalog';

const SUGGESTION_LIMIT = 8;
const providerBangs = getProviderBangs();

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const suggestions = getBangSuggestions(query, providerBangs, SUGGESTION_LIMIT);

	return json(
		[
			query,
			suggestions.map(({ completion }) => completion),
			suggestions.map(({ description }) => description),
			suggestions.map(({ completion }) => `${url.origin}/go?q=${encodeURIComponent(completion)}`)
		],
		{
			headers: {
				'content-type': 'application/x-suggestions+json; charset=utf-8'
			}
		}
	);
};

function getProviderBangs() {
	const errors = validateZbangCatalog(kagiCatalog, 'kagi');

	if (errors.length) return [];

	return rankZbangRecords((kagiCatalog as ZbangCatalog).items);
}
