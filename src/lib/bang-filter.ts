import fuzzysort from 'fuzzysort';

import type { Zbang, ZbangCatalog } from '$lib/bang-data';

export type BangFilterResult = {
	item: Zbang;
	score: number;
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

	const results = fuzzysort.go(query, preparedItems, {
		all: true,
		keys: getFuzzysortKeys(line),
		limit: FUZZYSORT_LIMIT + usedBangs.length,
		threshold: FUZZYSORT_THRESHOLD
	});

	const items = [...results]
		.sort(sortBangResults)
		.flatMap((result) => {
			const item = unprepareZbang(result.obj);

			return item.code.some((code) => usedBangs.includes(code))
				? []
				: [{ item, score: getBangResultScore(result) }];
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
		const bangQuery = bangSearchMatch[2];

		return prefix === '!!' ? `!${bangQuery}` : bangQuery;
	}

	return line.replace(/![^\s]+\s+/g, '').replace('//', '').trim();
}

function getUsedBangs(line: string) {
	return line.match(/![^\s]+(?=\s)/g) ?? [];
}

function getFuzzysortKeys(line: string) {
	const keys = [
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
