export type BangSourceId = 'duckduckgo' | 'kagi-shared' | 'kagi-kagi';
export type BangProviderId = 'duckduckgo' | 'kagi';

export type BangSourceDefinition = {
	id: BangSourceId;
	label: string;
	url: string;
};

export type PersistedBangSource = {
	id: BangSourceId;
	url: string;
	fetchedAt: string;
	hash: string;
	bangCount?: number;
	text: string;
};

export type BangSourceStatus = Omit<PersistedBangSource, 'text'> & {
	byteLength: number;
};

export type BangSourceDownloadResult =
	| { ok: true; source: BangSourceStatus }
	| { ok: false; id: BangSourceId; error: string };

export type Zbang = {
	rank: number;
	name: string;
	code: string[];
	tags: string[];
	urls: {
		s: string;
	};
};

export type ZbangCatalog = {
	provider: BangProviderId;
	generatedAt: string;
	generatorVersion: number;
	dedupedCount?: number;
	sources: Array<Pick<PersistedBangSource, 'url' | 'fetchedAt' | 'hash'>>;
	items: Zbang[];
};

export type BangCatalogStatus = Omit<ZbangCatalog, 'items'> & {
	recordCount: number;
};

export type BangCatalogGenerationResult =
	| { ok: true; catalog: BangCatalogStatus }
	| { ok: false; provider: BangProviderId; error: string };

export type BangDataRefreshResult = {
	sources: BangSourceDownloadResult[];
	catalogs: BangCatalogGenerationResult[];
};

type SourceBangRecord = {
	c?: string;
	d?: string;
	r?: number;
	s?: string;
	sc?: string;
	t?: string;
	ts?: string[];
	u?: string;
};

type NormalizedBang = Omit<Zbang, 'rank'> & {
	popularity: number;
	codeRanks: Record<string, number>;
	domains: string[];
};

type DedupeResult = {
	items: NormalizedBang[];
	dedupedCount: number;
};

type DuckDuckGoRank = {
	popularity: number;
	domain: string;
};

const DB_NAME = 'zbang';
const DB_VERSION = 2;
const GENERATOR_VERSION = 1;
const SOURCE_STORE = 'bangSources';
const CATALOG_STORE = 'bangCatalogs';
const textEncoder = new TextEncoder();

export const BANG_SOURCES: BangSourceDefinition[] = [
	{
		id: 'duckduckgo',
		label: 'DuckDuckGo',
		url: 'https://duckduckgo.com/bang.js'
	},
	{
		id: 'kagi-shared',
		label: 'Kagi shared',
		url: 'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/bangs.json'
	},
	{
		id: 'kagi-kagi',
		label: 'Kagi specific',
		url: 'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/kagi_bangs.json'
	}
];

export function getBangSource(id: string) {
	return BANG_SOURCES.find((source) => source.id === id);
}

export async function readBangSourceStatuses(): Promise<BangSourceStatus[]> {
	const db = await openBangDb();

	try {
		const sources = await getAllFromStore<PersistedBangSource>(db, SOURCE_STORE);
		return sources.map(getBangSourceStatus).sort(sortBySourceOrder);
	} finally {
		db.close();
	}
}

export async function readBangCatalogStatuses(): Promise<BangCatalogStatus[]> {
	const db = await openBangDb();

	try {
		const catalogs = await getAllFromStore<ZbangCatalog>(db, CATALOG_STORE);
		return catalogs.map(getBangCatalogStatus).sort(sortByCatalogOrder);
	} finally {
		db.close();
	}
}

export async function readBangCatalog(provider: BangProviderId): Promise<ZbangCatalog | undefined> {
	const db = await openBangDb();

	try {
		return await getFromStore<ZbangCatalog>(db, CATALOG_STORE, provider);
	} finally {
		db.close();
	}
}

export async function refreshBangData(): Promise<BangDataRefreshResult> {
	const sources = await downloadBangSources();
	const catalogs = await generateBangCatalogs();

	return { sources, catalogs };
}

export async function clearPersistedBangData(): Promise<void> {
	const db = await openBangDb();

	try {
		await clearStores(db, [SOURCE_STORE, CATALOG_STORE]);
	} finally {
		db.close();
	}
}

async function downloadBangSources(): Promise<BangSourceDownloadResult[]> {
	return Promise.all(
		BANG_SOURCES.map(async (source) => {
			try {
				const text = await fetchText(`/api/bang-sources/${source.id}`);
				const persisted = await persistBangSource(source, text);

				return { ok: true, source: getBangSourceStatus(persisted) };
			} catch (error) {
				return {
					ok: false,
					id: source.id,
					error: error instanceof Error ? error.message : 'Unknown download error'
				};
			}
		})
	);
}

async function generateBangCatalogs(): Promise<BangCatalogGenerationResult[]> {
	const db = await openBangDb();
	try {
		const sourceList = await getAllFromStore<PersistedBangSource>(db, SOURCE_STORE);
		const sources = new Map(sourceList.map((source) => [source.id, source]));
		const generatedAt = new Date().toISOString();
		const results: BangCatalogGenerationResult[] = [];

		try {
			const catalog = generateDuckDuckGoCatalog(requireSource(sources, 'duckduckgo'), generatedAt);
			await putInStore(db, CATALOG_STORE, catalog);
			results.push({ ok: true, catalog: getBangCatalogStatus(catalog) });
		} catch (error) {
			results.push({
				ok: false,
				provider: 'duckduckgo',
				error: error instanceof Error ? error.message : 'Unknown catalog generation error'
			});
		}

		try {
			const duckDuckGoSource = requireSource(sources, 'duckduckgo');
			const catalog = generateKagiCatalog(
				requireSource(sources, 'kagi-shared'),
				requireSource(sources, 'kagi-kagi'),
				duckDuckGoSource,
				generatedAt
			);
			await putInStore(db, CATALOG_STORE, catalog);
			results.push({ ok: true, catalog: getBangCatalogStatus(catalog) });
		} catch (error) {
			results.push({
				ok: false,
				provider: 'kagi',
				error: error instanceof Error ? error.message : 'Unknown catalog generation error'
			});
		}

		return results;
	} finally {
		db.close();
	}
}

function generateDuckDuckGoCatalog(source: PersistedBangSource, generatedAt: string): ZbangCatalog {
	const records = parseSourceRecords(source);
	const normalized = records.flatMap((record) => normalizeSourceRecord(record, 'duckduckgo'));
	const deduped = dedupeNormalizedBangs(normalized);
	const items = rankCatalogItems(deduped.items);

	return {
		provider: 'duckduckgo',
		generatedAt,
		generatorVersion: GENERATOR_VERSION,
		dedupedCount: deduped.dedupedCount,
		sources: [getCatalogSource(source)],
		items
	};
}

function generateKagiCatalog(
	sharedSource: PersistedBangSource,
	kagiSource: PersistedBangSource,
	duckDuckGoSource: PersistedBangSource,
	generatedAt: string
): ZbangCatalog {
	const duckDuckGoByCode = getDuckDuckGoRankLookup(duckDuckGoSource);
	const normalized = [
		...parseSourceRecords(sharedSource).flatMap((record) =>
			normalizeKagiRecord(record, duckDuckGoByCode)
		),
		...parseSourceRecords(kagiSource).flatMap((record) =>
			normalizeKagiRecord(record, duckDuckGoByCode)
		)
	];
	const deduped = dedupeNormalizedBangs(normalized);
	const items = rankCatalogItems(deduped.items);

	return {
		provider: 'kagi',
		generatedAt,
		generatorVersion: GENERATOR_VERSION,
		dedupedCount: deduped.dedupedCount,
		sources: [
			getCatalogSource(sharedSource),
			getCatalogSource(kagiSource),
			getCatalogSource(duckDuckGoSource)
		],
		items
	};
}

function normalizeKagiRecord(
	record: SourceBangRecord,
	duckDuckGoByCode: Map<string, DuckDuckGoRank>
): NormalizedBang[] {
	return normalizeSourceRecord(record, 'kagi').map((bang) => {
		const popularity = getKagiRecordPopularity(record, duckDuckGoByCode);
		const codeRanks = Object.fromEntries(
			bang.code.map((code) => [code, duckDuckGoByCode.get(code)?.popularity ?? 0])
		);

		return { ...bang, codeRanks, popularity };
	});
}

function getKagiRecordPopularity(
	record: SourceBangRecord,
	duckDuckGoByCode: Map<string, DuckDuckGoRank>
) {
	const code = record.t ? normalizeBangCode(record.t) : undefined;
	const duckDuckGoRank = code ? duckDuckGoByCode.get(code) : undefined;
	const isProviderNative = Boolean(record.u?.startsWith('/'));
	const mismatchedTriggers = new Set(['!p', '!q', '!k', '!code']);

	if (record.c === 'Region search') {
		return 2;
	}

	if (code && mismatchedTriggers.has(code) && isProviderNative) {
		return 2;
	}

	if (!duckDuckGoRank) {
		return 1;
	}

	const kagiDomain = isProviderNative
		? 'bang-provider'
		: getUrlHostname(normalizeBangUrl(record.u ?? '', 'kagi'));

	if (
		kagiDomain &&
		duckDuckGoRank.domain !== kagiDomain &&
		kagiDomain !== 'bang-provider' &&
		duckDuckGoRank.popularity > 1 &&
		getDistanceRatio(duckDuckGoRank.domain, kagiDomain) > 0.7
	) {
		return 2;
	}

	return duckDuckGoRank.popularity;
}

function normalizeSourceRecord(
	record: SourceBangRecord,
	provider: BangProviderId
): NormalizedBang[] {
	if (!record.t || !record.u || !record.s) {
		return [];
	}

	const url = normalizeBangUrl(record.u, provider);
	const code = uniqueStrings(
		[record.t, ...(record.ts ?? [])].map(normalizeBangCode).filter(isString)
	);

	if (!code.length) {
		return [];
	}

	const popularity = typeof record.r === 'number' && record.r > 0 ? record.r : 1;

	return [
		{
			popularity,
			name: record.s,
			code,
			codeRanks: Object.fromEntries(
				code.map((trigger) => [trigger, trigger === code[0] ? popularity : 0])
			),
			tags: getBangTags(record),
			urls: { s: url },
			domains: uniqueStrings([record.d, getUrlHostname(url)].filter(isString))
		}
	];
}

function dedupeNormalizedBangs(items: NormalizedBang[]): DedupeResult {
	const groups = new Map<string, NormalizedBang>();

	for (const item of items) {
		const key = getUrlIdentity(item.urls.s);
		const existing = groups.get(key);

		if (!existing) {
			groups.set(key, item);
			continue;
		}

		groups.set(key, mergeNormalizedBangs(existing, item));
	}

	return {
		items: [...groups.values()],
		dedupedCount: items.length - groups.size
	};
}

function mergeNormalizedBangs(a: NormalizedBang, b: NormalizedBang): NormalizedBang {
	const popularity = Math.max(a.popularity, b.popularity);

	return {
		popularity,
		name: getBestName(a, b),
		code: uniqueStrings([...a.code, ...b.code]),
		codeRanks: mergeCodeRanks(a.codeRanks, b.codeRanks),
		tags: uniqueStrings([...a.tags, ...b.tags]).sort((left, right) => left.localeCompare(right)),
		urls: { s: getBestUrl(a.urls.s, b.urls.s) },
		domains: uniqueStrings([...a.domains, ...b.domains])
	};
}

function mergeCodeRanks(a: Record<string, number>, b: Record<string, number>) {
	const ranks = { ...a };

	for (const [code, rank] of Object.entries(b)) {
		ranks[code] = Math.max(ranks[code] ?? 0, rank);
	}

	return ranks;
}

function rankCatalogItems(items: NormalizedBang[]): Zbang[] {
	return items
		.sort((a, b) => {
			const rankDifference = b.popularity - a.popularity;
			return rankDifference || a.name.localeCompare(b.name) || a.code[0].localeCompare(b.code[0]);
		})
		.map((item, index) => ({
			rank: index + 1,
			name: item.name,
			code: sortBangCodes(item.code, item.codeRanks),
			tags: item.tags,
			urls: item.urls
		}));
}

function sortBangCodes(codes: string[], codeRanks: Record<string, number>) {
	if (!codes.length) return [];

	const shortest = getShortestCode(codes);
	const highestRanked = getHighestRankedCode(codes, codeRanks);
	const longest = getLongestCode(codes);
	const promoted = uniqueStrings([shortest, highestRanked, longest].filter(isString));
	const promotedSet = new Set(promoted);

	return [
		...promoted,
		...codes
			.filter((code) => !promotedSet.has(code))
			.sort((a, b) => {
				const rankDifference = (codeRanks[b] ?? 0) - (codeRanks[a] ?? 0);
				return rankDifference || a.length - b.length || a.localeCompare(b);
			})
	];
}

function getHighestRankedCode(codes: string[], codeRanks: Record<string, number>) {
	return codes.reduce((highest, code) => {
		const rankDifference = (codeRanks[code] ?? 0) - (codeRanks[highest] ?? 0);
		return rankDifference > 0 ? code : highest;
	}, codes[0]);
}

function getShortestCode(codes: string[]) {
	return codes.reduce(
		(shortest, code) => (code.length < shortest.length ? code : shortest),
		codes[0]
	);
}

function getLongestCode(codes: string[]) {
	return codes.reduce((longest, code) => (code.length > longest.length ? code : longest), codes[0]);
}

function getDuckDuckGoRankLookup(source: PersistedBangSource) {
	const lookup = new Map<string, DuckDuckGoRank>();

	for (const record of parseSourceRecords(source)) {
		const code = record.t ? normalizeBangCode(record.t) : undefined;
		const url = record.u ? normalizeBangUrl(record.u, 'duckduckgo') : undefined;
		const domain = url ? getUrlHostname(url) : undefined;

		if (code && url && domain) {
			lookup.set(code, {
				popularity: typeof record.r === 'number' ? record.r : 1,
				domain
			});
		}
	}

	return lookup;
}

function getBangTags(record: SourceBangRecord) {
	if (record.c && record.sc) {
		return [`${record.c}/${record.sc}`];
	}

	return [record.c, record.sc].filter(isString);
}

function getBestName(a: NormalizedBang, b: NormalizedBang) {
	if (b.popularity > a.popularity) {
		return b.name;
	}

	return a.name.length <= b.name.length ? a.name : b.name;
}

function getBestUrl(a: string, b: string) {
	return [a, b].sort((left, right) => {
		const protocolPreference =
			Number(!left.startsWith('https://')) - Number(!right.startsWith('https://'));
		return protocolPreference || left.length - right.length;
	})[0];
}

function normalizeBangCode(code: string) {
	const trigger = code.trim().replace(/^!+/, '').toLowerCase();
	return trigger ? `!${trigger}` : undefined;
}

function normalizeBangUrl(url: string, provider: BangProviderId) {
	const withPlaceholder = url.replaceAll('{{{s}}}', '%s');

	if (withPlaceholder.startsWith('/')) {
		return `${provider === 'kagi' ? 'https://kagi.com' : 'https://duckduckgo.com'}${withPlaceholder}`;
	}

	return withPlaceholder;
}

function getUrlIdentity(url: string) {
	const placeholder = '__ZBANG_QUERY_PLACEHOLDER__';
	const normalized = deepUnescape(url).trim().replaceAll('%s', placeholder);

	try {
		const parsed = new URL(normalized);
		parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

		const path = deepUnescape(parsed.pathname)
			.replace(/\/{2,}/g, '/')
			.replace(/\/+$/, '');
		const query = [...parsed.searchParams.entries()]
			.map(([key, value]) => [deepUnescape(key), deepUnescape(value)] as const)
			.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
				return leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue);
			})
			.map(([key, value]) => `${key}=${value}`)
			.join('&');

		return `${parsed.hostname}${path}${query ? `?${query}` : ''}${deepUnescape(parsed.hash)}`
			.replaceAll(placeholder, '%s')
			.toLowerCase();
	} catch {
		return normalized.replaceAll(placeholder, '%s').toLowerCase();
	}
}

function deepUnescape(value: string) {
	const placeholder = '__ZBANG_QUERY_PLACEHOLDER__';
	let previous = value.replaceAll('%s', placeholder);
	let current = unescapeUrl(previous);

	while (previous !== current) {
		previous = current;
		current = unescapeUrl(previous);
	}

	return current.replaceAll(placeholder, '%s');
}

function unescapeUrl(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function getUrlHostname(url: string) {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return undefined;
	}
}

function getDistanceRatio(a: string, b: string) {
	return getLevenshteinDistance(a, b) / b.length;
}

function getLevenshteinDistance(a: string, b: string) {
	const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	const current = Array.from({ length: b.length + 1 }, () => 0);

	for (let i = 1; i <= a.length; i += 1) {
		current[0] = i;

		for (let j = 1; j <= b.length; j += 1) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + Number(a[i - 1] !== b[j - 1])
			);
		}

		previous.splice(0, previous.length, ...current);
	}

	return previous[b.length];
}

function uniqueStrings(values: string[]) {
	return [...new Set(values)];
}

function isString(value: string | undefined): value is string {
	return Boolean(value);
}

function parseSourceRecords(source: PersistedBangSource) {
	const data = JSON.parse(source.text) as unknown;

	if (!Array.isArray(data)) {
		throw new Error(`${source.id} source is not an array`);
	}

	return data as SourceBangRecord[];
}

function requireSource(sources: Map<BangSourceId, PersistedBangSource>, id: BangSourceId) {
	const source = sources.get(id);

	if (!source) {
		throw new Error(`${id} source has not been downloaded`);
	}

	return source;
}

function getCatalogSource(source: PersistedBangSource) {
	return {
		url: source.url,
		fetchedAt: source.fetchedAt,
		hash: source.hash
	};
}

async function fetchText(url: string) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return response.text();
}

async function persistBangSource(source: BangSourceDefinition, text: string) {
	const db = await openBangDb();

	try {
		const persisted: PersistedBangSource = {
			id: source.id,
			url: source.url,
			fetchedAt: new Date().toISOString(),
			hash: await hashText(text),
			bangCount: countSourceBangs(text),
			text
		};

		await putInStore(db, SOURCE_STORE, persisted);
		return persisted;
	} finally {
		db.close();
	}
}

function getBangSourceStatus(source: PersistedBangSource): BangSourceStatus {
	return {
		id: source.id,
		url: source.url,
		fetchedAt: source.fetchedAt,
		hash: source.hash,
		bangCount: source.bangCount,
		byteLength: textEncoder.encode(source.text).byteLength
	};
}

function getBangCatalogStatus(catalog: ZbangCatalog): BangCatalogStatus {
	return {
		provider: catalog.provider,
		generatedAt: catalog.generatedAt,
		generatorVersion: catalog.generatorVersion,
		dedupedCount: catalog.dedupedCount,
		sources: catalog.sources,
		recordCount: catalog.items.length
	};
}

function countSourceBangs(text: string) {
	const data = JSON.parse(text) as unknown;

	return Array.isArray(data) ? data.length : undefined;
}

function sortBySourceOrder(a: BangSourceStatus, b: BangSourceStatus) {
	return getSourceOrder(a.id) - getSourceOrder(b.id);
}

function sortByCatalogOrder(a: BangCatalogStatus, b: BangCatalogStatus) {
	return getCatalogOrder(a.provider) - getCatalogOrder(b.provider);
}

function getSourceOrder(id: BangSourceId) {
	const index = BANG_SOURCES.findIndex((source) => source.id === id);
	return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getCatalogOrder(provider: BangProviderId) {
	return provider === 'kagi' ? 0 : 1;
}

async function hashText(text: string) {
	const hashBuffer = await crypto.subtle.digest('SHA-256', textEncoder.encode(text));
	return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openBangDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;

			if (!db.objectStoreNames.contains(SOURCE_STORE)) {
				db.createObjectStore(SOURCE_STORE, { keyPath: 'id' });
			}

			if (!db.objectStoreNames.contains(CATALOG_STORE)) {
				db.createObjectStore(CATALOG_STORE, { keyPath: 'provider' });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Failed to open bang database'));
	});
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();

		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

function getFromStore<T>(
	db: IDBDatabase,
	storeName: string,
	key: IDBValidKey
): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);

		request.onsuccess = () => resolve(request.result as T | undefined);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

function putInStore(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite');
		const request = transaction.objectStore(storeName).put(value);

		request.onerror = () => reject(request.error ?? new Error(`Failed to write ${storeName}`));
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
	});
}

function clearStores(db: IDBDatabase, storeNames: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeNames, 'readwrite');

		for (const storeName of storeNames) {
			transaction.objectStore(storeName).clear();
		}

		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('Failed to clear persisted bang data'));
	});
}
