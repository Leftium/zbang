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
	ddgr?: number;
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
	domains: string[];
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
	const sources = await getAllFromStore<PersistedBangSource>(db, SOURCE_STORE);
	db.close();

	return sources.map(getBangSourceStatus).sort(sortBySourceOrder);
}

export async function readBangCatalogStatuses(): Promise<BangCatalogStatus[]> {
	const db = await openBangDb();
	const catalogs = await getAllFromStore<ZbangCatalog>(db, CATALOG_STORE);
	db.close();

	return catalogs.map(getBangCatalogStatus).sort(sortByCatalogOrder);
}

export async function readBangCatalog(provider: BangProviderId): Promise<ZbangCatalog | undefined> {
	const db = await openBangDb();
	const catalog = await getFromStore<ZbangCatalog>(db, CATALOG_STORE, provider);
	db.close();

	return catalog;
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

export async function downloadBangSources(): Promise<BangSourceDownloadResult[]> {
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
		const duckDuckGo = generateDuckDuckGoCatalog(requireSource(sources, 'duckduckgo'), generatedAt);
		const catalog = generateKagiCatalog(
			requireSource(sources, 'kagi-shared'),
			requireSource(sources, 'kagi-kagi'),
			duckDuckGo,
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

	db.close();
	return results;
}

function generateDuckDuckGoCatalog(source: PersistedBangSource, generatedAt: string): ZbangCatalog {
	const records = parseSourceRecords(source);
	const normalized = records.flatMap((record) => normalizeSourceRecord(record, 'duckduckgo'));
	const items = rankCatalogItems(dedupeNormalizedBangs(normalized));

	return {
		provider: 'duckduckgo',
		generatedAt,
		generatorVersion: GENERATOR_VERSION,
		sources: [getCatalogSource(source)],
		items
	};
}

function generateKagiCatalog(
	sharedSource: PersistedBangSource,
	kagiSource: PersistedBangSource,
	duckDuckGoCatalog: ZbangCatalog,
	generatedAt: string
): ZbangCatalog {
	const records = [...parseSourceRecords(sharedSource), ...parseSourceRecords(kagiSource)];
	const duckDuckGoByCode = getDuckDuckGoRankLookup(duckDuckGoCatalog);
	const normalized = records.flatMap((record) => normalizeKagiRecord(record, duckDuckGoByCode));
	const items = rankCatalogItems(dedupeNormalizedBangs(normalized));

	return {
		provider: 'kagi',
		generatedAt,
		generatorVersion: GENERATOR_VERSION,
		sources: [
			getCatalogSource(sharedSource),
			getCatalogSource(kagiSource),
			...duckDuckGoCatalog.sources
		],
		items
	};
}

function normalizeKagiRecord(
	record: SourceBangRecord,
	duckDuckGoByCode: Map<string, NormalizedBang[]>
): NormalizedBang[] {
	return normalizeSourceRecord(record, 'kagi').map((bang) => {
		let ddgr = bang.ddgr;

		for (const code of bang.code) {
			for (const duckDuckGoBang of duckDuckGoByCode.get(code) ?? []) {
				if (areCompatibleBangs(bang, duckDuckGoBang)) {
					ddgr = Math.max(ddgr ?? 0, duckDuckGoBang.ddgr ?? 0);
				}
			}
		}

		return ddgr ? { ...bang, ddgr } : bang;
	});
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

	const ddgr = typeof record.r === 'number' && record.r > 0 ? record.r : undefined;

	return [
		{
			...(ddgr ? { ddgr } : {}),
			name: record.s,
			code,
			tags: getBangTags(record),
			urls: { s: url },
			domains: uniqueStrings([record.d, getUrlHostname(url)].filter(isString))
		}
	];
}

function dedupeNormalizedBangs(items: NormalizedBang[]): NormalizedBang[] {
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

	return [...groups.values()];
}

function mergeNormalizedBangs(a: NormalizedBang, b: NormalizedBang): NormalizedBang {
	const ddgr = Math.max(a.ddgr ?? 0, b.ddgr ?? 0) || undefined;

	return {
		...(ddgr ? { ddgr } : {}),
		name: getBestName(a, b),
		code: uniqueStrings([...a.code, ...b.code]),
		tags: uniqueStrings([...a.tags, ...b.tags]).sort((left, right) => left.localeCompare(right)),
		urls: { s: getBestUrl(a.urls.s, b.urls.s) },
		domains: uniqueStrings([...a.domains, ...b.domains])
	};
}

function rankCatalogItems(items: NormalizedBang[]): Zbang[] {
	return items
		.sort((a, b) => {
			const rankDifference = (b.ddgr ?? -1) - (a.ddgr ?? -1);
			return rankDifference || a.name.localeCompare(b.name) || a.code[0].localeCompare(b.code[0]);
		})
		.map((item, index) => ({
			...(item.ddgr ? { ddgr: item.ddgr } : {}),
			rank: index + 1,
			name: item.name,
			code: item.code,
			tags: item.tags,
			urls: item.urls
		}));
}

function getDuckDuckGoRankLookup(catalog: ZbangCatalog) {
	const lookup = new Map<string, NormalizedBang[]>();

	for (const item of catalog.items) {
		const normalized = { ...item, domains: [getUrlHostname(item.urls.s)].filter(isString) };

		for (const code of item.code) {
			lookup.set(code, [...(lookup.get(code) ?? []), normalized]);
		}
	}

	return lookup;
}

function areCompatibleBangs(a: NormalizedBang, b: NormalizedBang) {
	return (
		getUrlIdentity(a.urls.s) === getUrlIdentity(b.urls.s) ||
		a.domains.some((domain) => b.domains.includes(domain))
	);
}

function getBangTags(record: SourceBangRecord) {
	if (record.c && record.sc) {
		return [`${record.c}/${record.sc}`];
	}

	return [record.c, record.sc].filter(isString);
}

function getBestName(a: NormalizedBang, b: NormalizedBang) {
	if ((b.ddgr ?? 0) > (a.ddgr ?? 0)) {
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

		const path = deepUnescape(parsed.pathname).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
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
	const persisted: PersistedBangSource = {
		id: source.id,
		url: source.url,
		fetchedAt: new Date().toISOString(),
		hash: await hashText(text),
		bangCount: countSourceBangs(text),
		text
	};

	await putInStore(db, SOURCE_STORE, persisted);
	db.close();

	return persisted;
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
