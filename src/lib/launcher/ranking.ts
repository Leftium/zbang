import type { KeywordSignal, LauncherItem } from './types';

export function rankItems(items: LauncherItem[]) {
	return [...items].sort((a, b) => {
		if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
			return a.sortOrder - b.sortOrder;
		}

		return b.score - a.score || a.title.localeCompare(b.title);
	});
}

export function scoreInsight(base: number, matches: string[], extraBoost = 0) {
	if (!matches.length) return 10;

	return base + Math.min(matches.length, 5) + extraBoost;
}

export function getKeywordScoreBoost(keywords: KeywordSignal[]) {
	const topScore = keywords[0]?.score ?? 0;

	return Math.min(Math.round(topScore), 5);
}
