import {
	BANG_SOURCES,
	countSourceBangs,
	generateDuckDuckGoCatalog,
	generateKagiCatalog,
	type BangProviderId,
	type BangSourceDefinition,
	type BangSourceId,
	type PersistedBangSource,
	type Zbang,
	type ZbangCatalog
} from './bang-catalog';

export {
	BANG_SOURCES,
	getBangSource,
	type BangProviderId,
	type BangSourceDefinition,
	type BangSourceId,
	type PersistedBangSource,
	type Zbang,
	type ZbangCatalog
} from './bang-catalog';

export type BangSourceStatus = Omit<PersistedBangSource, 'text'> & {
	byteLength: number;
};

export type BangSourceDownloadResult =
	| { ok: true; source: BangSourceStatus }
	| { ok: false; id: BangSourceId; error: string };

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

const DB_NAME = 'zbang';
const DB_VERSION = 3;
const SOURCE_STORE = 'bangSources';
const CATALOG_STORE = 'bangCatalogs';
const MY_BANG_STORE = 'myBangs';
const MY_BANG_COLLECTION_KEY = 'items';
const textEncoder = new TextEncoder();

type MyBangCollection = {
	id: typeof MY_BANG_COLLECTION_KEY;
	items: Zbang[];
};

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

export async function readMyBangs(): Promise<Zbang[]> {
	const db = await openBangDb();

	try {
		const collection = await getFromStore<MyBangCollection>(
			db,
			MY_BANG_STORE,
			MY_BANG_COLLECTION_KEY
		);
		return collection?.items ?? [];
	} finally {
		db.close();
	}
}

export async function writeMyBangs(items: Zbang[]): Promise<void> {
	const db = await openBangDb();

	try {
		await putInStore(db, MY_BANG_STORE, { id: MY_BANG_COLLECTION_KEY, items });
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

function requireSource(sources: Map<BangSourceId, PersistedBangSource>, id: BangSourceId) {
	const source = sources.get(id);

	if (!source) {
		throw new Error(`${id} source has not been downloaded`);
	}

	return source;
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

			if (!db.objectStoreNames.contains(MY_BANG_STORE)) {
				db.createObjectStore(MY_BANG_STORE, { keyPath: 'id' });
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
