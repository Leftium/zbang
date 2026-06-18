import fuzzysort from 'fuzzysort';

import type { Zbang, ZbangCatalog } from '$lib/bang-data';

export type BangFilterResult = {
	item: Zbang;
	score: number;
	highlights: BangFilterHighlights;
};

export type BangHighlightSegment = {
	text: string;
	matched: boolean;
};

export type BangHighlightedValue = {
	segments: BangHighlightSegment[];
};

export type BangFilterHighlights = {
	name: BangHighlightSegment[];
	code: BangHighlightedValue[];
	url: BangHighlightSegment[];
};

export type BangFilterResults = {
	items: BangFilterResult[];
	total: number;
};

export type PreparedZbang = Omit<Zbang, 'name' | 'code' | 'tags' | 'urls'> & {
	name: Fuzzysort.Prepared;
	code: Fuzzysort.Prepared[];
	tags: Fuzzysort.Prepared[];
	urls: { s: Fuzzysort.Prepared };
};

const FUZZYSORT_THRESHOLD = 0.7;
const FUZZYSORT_LIMIT = 20;
const FUZZYSORT_BASE_KEYS = [
	'name',
	'code.0',
	'code.1',
	'code.2',
	'code.3',
	'code.4',
	'code.5',
	'code.6',
	'code.7',
	'code.8',
	'code.9'
];

export function prepareBangCatalog(catalog: ZbangCatalog | undefined): PreparedZbang[] {
	return (catalog?.items ?? []).map((item) => ({
		...item,
		name: fuzzysort.prepare(item.name),
		code: item.code.map(fuzzysort.prepare),
		tags: item.tags.map(fuzzysort.prepare),
		urls: { s: fuzzysort.prepare(item.urls.s) }
	}));
}

export function filterBangs(input: string, preparedItems: PreparedZbang[]): BangFilterResults {
	const line = normalizeBangSuffixes(getLastLine(input));
	const query = getBangQuery(line);
	const usedBangs = getUsedBangs(line);
	const keys = getFuzzysortKeys(line);
	const isUrlQuery = line.includes('//');

	const results = fuzzysort.go(query, preparedItems, {
		all: true,
		keys,
		limit: FUZZYSORT_LIMIT + usedBangs.length,
		threshold: FUZZYSORT_THRESHOLD
	});

	const items = [...results]
		.sort(sortBangResults)
		.flatMap((result) => {
			const item = unprepareZbang(result.obj);

			return item.code.some((code) => usedBangs.includes(code))
				? []
				: [
						{
							item,
							score: getBangResultScore(result),
							highlights: getBangHighlights(result, keys, isUrlQuery ? query : '')
						}
					];
		})
		.slice(0, FUZZYSORT_LIMIT);

	return {
		items,
		total: results.total
	};
}

export function applyBang(input: string, code: string) {
	const bang = code.startsWith('!') ? code : `!${code}`;
	const lines = input.split('\n');
	const line = lines.at(-1) ?? '';
	const bangSearchMatch = normalizeBangSuffixes(line).match(/(!!?)([^\s]*)$/);

	if (bangSearchMatch) {
		lines[lines.length - 1] = `${line.slice(0, -bangSearchMatch[0].length)}${bang} `;
		return lines.join('\n');
	}

	lines[lines.length - 1] = `${line.trimEnd()} ${bang} `;
	return lines.join('\n');
}

function getLastLine(input: string) {
	return input.split('\n').at(-1) ?? '';
}

function normalizeBangSuffixes(line: string) {
	return line.replace(/\b([^\s!]+)!/g, '!$1');
}

function getBangQuery(line: string) {
	const bangSearchMatch = line.match(/(!!?)([^\s]*)$/);

	if (bangSearchMatch) {
		const prefix = bangSearchMatch[1];
		const bangQuery = cleanBangFilterQuery(bangSearchMatch[2]);

		return prefix === '!!' ? `!${bangQuery}` : bangQuery;
	}

	return cleanBangFilterQuery(line.replace(/![^\s]+\s+/g, ''));
}

function cleanBangFilterQuery(query: string) {
	return query.replace('//', '').trim();
}

function getUsedBangs(line: string): string[] {
	return line.match(/![^\s]+(?=\s)/g) ?? [];
}

function getFuzzysortKeys(line: string) {
	const keys = [...FUZZYSORT_BASE_KEYS];

	if (line.includes('#')) {
		keys.push(
			'tags.0',
			'tags.1',
			'tags.2',
			'tags.3',
			'tags.4',
			'tags.5',
			'tags.6',
			'tags.7',
			'tags.8',
			'tags.9'
		);
	}

	if (line.includes('//')) {
		keys.push('urls.s');
	}

	return keys;
}

function sortBangResults(
	a: Fuzzysort.KeysResult<PreparedZbang>,
	b: Fuzzysort.KeysResult<PreparedZbang>
) {
	return (
		Number(b.score > 0.95) - Number(a.score > 0.95) ||
		Number(b.score > 0.6) - Number(a.score > 0.6) ||
		a.obj.rank - b.obj.rank ||
		b.score - a.score
	);
}

function getBangResultScore(result: Fuzzysort.KeysResult<PreparedZbang>) {
	return Math.round(result.score * 100);
}

function getBangHighlights(
	result: Fuzzysort.KeysResult<PreparedZbang>,
	keys: string[],
	urlQuery: string
): BangFilterHighlights {
	const codeStart = keys.indexOf('code.0');
	const urlIndex = keys.indexOf('urls.s');
	const urlResult = urlIndex === -1 ? undefined : result[urlIndex];

	return {
		name: getHighlightSegments(result.obj.name.target, result[0]),
		code: result.obj.code.map((code, offset) => {
			const codeResult = offset < 10 && codeStart !== -1 ? result[codeStart + offset] : undefined;

			return {
				segments: getHighlightSegments(code.target, codeResult)
			};
		}),
		url: getHighlightSegments(result.obj.urls.s.target, urlResult, urlQuery)
	};
}

function getHighlightSegments(target: string, result: Fuzzysort.Result | undefined, urlQuery = '') {
	const substringSegments = urlQuery ? getSubstringHighlightSegments(target, urlQuery) : undefined;

	if (substringSegments?.some(({ matched }) => matched)) return substringSegments;
	if (!result?.indexes.length) return [{ text: target, matched: false }];

	const matchedIndexes = new Set(result.indexes);
	const segments: BangHighlightSegment[] = [];
	let current = '';
	let currentMatched = matchedIndexes.has(0);

	for (let index = 0; index < target.length; index += 1) {
		const matched = matchedIndexes.has(index);

		if (matched !== currentMatched) {
			if (current) segments.push({ text: current, matched: currentMatched });
			current = '';
			currentMatched = matched;
		}

		current += target[index];
	}

	if (current) segments.push({ text: current, matched: currentMatched });

	return segments;
}

function getSubstringHighlightSegments(target: string, query: string) {
	const normalizedTarget = target.toLocaleLowerCase();
	const normalizedQuery = query.toLocaleLowerCase();
	const matchIndex = normalizedTarget.indexOf(normalizedQuery);

	if (!normalizedQuery || matchIndex === -1) return [{ text: target, matched: false }];

	return [
		{ text: target.slice(0, matchIndex), matched: false },
		{ text: target.slice(matchIndex, matchIndex + query.length), matched: true },
		{ text: target.slice(matchIndex + query.length), matched: false }
	].filter(({ text }) => text);
}

function unprepareZbang(item: PreparedZbang): Zbang {
	return {
		...(item.ddgr ? { ddgr: item.ddgr } : {}),
		rank: item.rank,
		name: item.name.target,
		code: item.code.map((code) => code.target),
		tags: item.tags.map((tag) => tag.target),
		urls: { s: item.urls.s.target }
	};
}
