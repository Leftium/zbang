import { applyBang, filterBangs, prepareBangs } from '$lib/bang-filter';

import type { ZbangRecord } from '$lib/bang-data';

export type BangSuggestion = {
	completion: string;
	description: string;
};

export function getBangSuggestions(
	query: string,
	items: ZbangRecord[],
	limit: number
): BangSuggestion[] {
	if (!hasActiveBangToken(query)) return [];

	return filterBangs(query, prepareBangs(items)).items.slice(0, limit).map(({ item }) => ({
		completion: applyBang(query, item.code[0] ?? ''),
		description: item.name
	}));
}

function hasActiveBangToken(query: string) {
	return /(?:^|\s)!!?\S*$/.test(query);
}
