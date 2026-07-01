import type { BangProviderId, ZbangRecord } from './bang-catalog';
import type { ExecutionSettings } from './execution-settings';
import { normalizeBangCode } from './launcher/bang-code';

export {
	type BangProviderId,
	type CatalogZbangRecord,
	type RankedZbangCatalog,
	type ZbangRecord,
	type ZbangCatalog
} from './bang-catalog';

const DB_NAME: string = 'whiz';
const LEGACY_DB_NAME: string = 'zbang';
const DB_VERSION = 6;
const OLD_SOURCE_STORE = 'bangSources';
const OLD_CATALOG_STORE = 'bangCatalogs';
const MY_BANG_STORE = 'myBangs';
const MY_BANG_COLLECTION_KEY = 'items';
const EXECUTION_SETTINGS_STORE = 'executionSettings';
const EXECUTION_SETTINGS_KEY = 'current';
const SEARCH_HISTORY_STORE = 'searchHistory';
const HISTORY_SETTINGS_STORE = 'historySettings';
let legacyMigration: Promise<void> | undefined;

export type MyBangRecord = ZbangRecord & {
	id: string;
	origin: 'catalog' | 'custom';
	sourceProvider?: BangProviderId;
	sourceName?: string;
	sourceCodes?: string[];
	sourceDomain?: string;
	sourceUrlTemplate?: string;
	createdAt: string;
	updatedAt: string;
};

type MyBangCollection = {
	id: typeof MY_BANG_COLLECTION_KEY;
	items: StoredMyBangRecord[];
};

type StoredMyBangRecord = Partial<ZbangRecord> &
	Partial<
		Pick<
			MyBangRecord,
			| 'id'
			| 'origin'
			| 'sourceProvider'
			| 'sourceName'
			| 'sourceCodes'
			| 'sourceDomain'
			| 'sourceUrlTemplate'
			| 'createdAt'
			| 'updatedAt'
		>
	>;

type ExecutionSettingsRecord = ExecutionSettings & {
	id: typeof EXECUTION_SETTINGS_KEY;
};

export async function readMyBangs(): Promise<MyBangRecord[]> {
	const db = await openWhizDb();

	try {
		const collection = await getFromStore<MyBangCollection>(
			db,
			MY_BANG_STORE,
			MY_BANG_COLLECTION_KEY
		);
		if (!collection) return [];

		let migrated = false;
		const items = collection.items.map((item) => {
			const normalized = normalizeStoredBang(item);
			if (normalized.id !== item.id || normalized.origin !== item.origin || !item.updatedAt) {
				migrated = true;
			}
			return normalized;
		});

		if (migrated) await putInStore(db, MY_BANG_STORE, { id: MY_BANG_COLLECTION_KEY, items });

		return items;
	} finally {
		db.close();
	}
}

function normalizeStoredBang(item: StoredMyBangRecord): MyBangRecord {
	const now = new Date().toISOString();
	const sourceProvider = normalizeBangProvider(item.sourceProvider);
	const sourceName = normalizeOptionalString(item.sourceName);
	const sourceCodes = normalizeOptionalStringArray(item.sourceCodes)?.map(normalizeBangCode);
	const sourceDomain = normalizeOptionalString(item.sourceDomain);
	const sourceUrlTemplate = normalizeOptionalString(item.sourceUrlTemplate);

	return {
		rank: item.rank ?? 1,
		popularity: item.popularity ?? 1,
		name: item.name ?? 'Untitled bang',
		code: Array.isArray(item.code) ? item.code.map(normalizeBangCode) : [],
		tags: Array.isArray(item.tags) ? item.tags : [],
		urls: { s: item.urls?.s ?? '' },
		id: item.id ?? createMyBangId(),
		origin: item.origin === 'catalog' ? 'catalog' : 'custom',
		...(sourceProvider ? { sourceProvider } : {}),
		...(sourceName ? { sourceName } : {}),
		...(sourceCodes ? { sourceCodes } : {}),
		...(sourceDomain ? { sourceDomain } : {}),
		...(sourceUrlTemplate ? { sourceUrlTemplate } : {}),
		createdAt: item.createdAt ?? now,
		updatedAt: item.updatedAt ?? item.createdAt ?? now
	};
}

export async function writeMyBangs(items: MyBangRecord[]): Promise<void> {
	const db = await openWhizDb();

	try {
		await putInStore(db, MY_BANG_STORE, { id: MY_BANG_COLLECTION_KEY, items });
	} finally {
		db.close();
	}
}

export function createMyBangId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `mybang:${crypto.randomUUID()}`;
	}

	return `mybang:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBangProvider(value: unknown): BangProviderId | undefined {
	return value === 'duckduckgo' || value === 'kagi' ? value : undefined;
}

function normalizeOptionalString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeOptionalStringArray(value: unknown) {
	if (!Array.isArray(value)) return undefined;

	const strings = value.filter(
		(item): item is string => typeof item === 'string' && Boolean(item.trim())
	);
	return strings.length ? strings : undefined;
}

export async function readExecutionSettings(): Promise<ExecutionSettings | undefined> {
	const db = await openWhizDb();

	try {
		const storedSettings = await getFromStore<ExecutionSettingsRecord>(
			db,
			EXECUTION_SETTINGS_STORE,
			EXECUTION_SETTINGS_KEY
		);
		return storedSettings;
	} finally {
		db.close();
	}
}

export async function writeExecutionSettings(settings: ExecutionSettings): Promise<void> {
	const db = await openWhizDb();

	try {
		await putInStore(db, EXECUTION_SETTINGS_STORE, {
			id: EXECUTION_SETTINGS_KEY,
			...settings
		});
	} finally {
		db.close();
	}
}

export async function openWhizDb(): Promise<IDBDatabase> {
	const db = await openIndexedBangDb(DB_NAME);
	legacyMigration ??= migrateLegacyBangDb(db).catch((error: unknown) => {
		legacyMigration = undefined;
		console.warn('Failed to migrate legacy bang database', error);
	});
	await legacyMigration;
	return db;
}

function openIndexedBangDb(name: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			const transaction = request.transaction;

			if (db.objectStoreNames.contains(OLD_SOURCE_STORE)) {
				db.deleteObjectStore(OLD_SOURCE_STORE);
			}

			if (db.objectStoreNames.contains(OLD_CATALOG_STORE)) {
				db.deleteObjectStore(OLD_CATALOG_STORE);
			}

			if (!db.objectStoreNames.contains(MY_BANG_STORE)) {
				db.createObjectStore(MY_BANG_STORE, { keyPath: 'id' });
			}

			if (!db.objectStoreNames.contains(EXECUTION_SETTINGS_STORE)) {
				db.createObjectStore(EXECUTION_SETTINGS_STORE, { keyPath: 'id' });
			}

			if (!db.objectStoreNames.contains(SEARCH_HISTORY_STORE)) {
				const store = db.createObjectStore(SEARCH_HISTORY_STORE, { keyPath: 'id' });

				createSearchHistoryIndexes(store);
			} else {
				const store = transaction?.objectStore(SEARCH_HISTORY_STORE);

				if (store) createSearchHistoryIndexes(store);
			}

			if (!db.objectStoreNames.contains(HISTORY_SETTINGS_STORE)) {
				db.createObjectStore(HISTORY_SETTINGS_STORE, { keyPath: 'id' });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Failed to open bang database'));
	});
}

async function migrateLegacyBangDb(db: IDBDatabase): Promise<void> {
	if (!(await hasLegacyBangDb())) return;

	const [myBangs, executionSettings] = await Promise.all([
		getFromStore<MyBangCollection>(db, MY_BANG_STORE, MY_BANG_COLLECTION_KEY),
		getFromStore<ExecutionSettingsRecord>(db, EXECUTION_SETTINGS_STORE, EXECUTION_SETTINGS_KEY)
	]);

	if (myBangs && executionSettings) return;

	const legacyDb = await openIndexedBangDb(LEGACY_DB_NAME);

	try {
		if (!myBangs && legacyDb.objectStoreNames.contains(MY_BANG_STORE)) {
			const legacyMyBangs = await getFromStore<MyBangCollection>(
				legacyDb,
				MY_BANG_STORE,
				MY_BANG_COLLECTION_KEY
			);

			if (legacyMyBangs) await putInStore(db, MY_BANG_STORE, legacyMyBangs);
		}

		if (!executionSettings && legacyDb.objectStoreNames.contains(EXECUTION_SETTINGS_STORE)) {
			const legacyExecutionSettings = await getFromStore<ExecutionSettingsRecord>(
				legacyDb,
				EXECUTION_SETTINGS_STORE,
				EXECUTION_SETTINGS_KEY
			);

			if (legacyExecutionSettings) {
				await putInStore(db, EXECUTION_SETTINGS_STORE, legacyExecutionSettings);
			}
		}
	} finally {
		legacyDb.close();
	}
}

async function hasLegacyBangDb(): Promise<boolean> {
	if (LEGACY_DB_NAME === DB_NAME) return false;
	const databaseFactory = indexedDB as IDBFactory & {
		databases?: () => Promise<Array<{ name?: string }>>;
	};

	if (typeof databaseFactory.databases !== 'function') return true;

	try {
		const databases = await databaseFactory.databases();
		return databases.some((database) => database.name === LEGACY_DB_NAME);
	} catch {
		return true;
	}
}

function createSearchHistoryIndexes(store: IDBObjectStore) {
	if (!store.indexNames.contains('executedAt')) {
		store.createIndex('executedAt', 'executedAt');
	}

	if (!store.indexNames.contains('localDate')) {
		store.createIndex('localDate', 'localDate');
	}

	if (!store.indexNames.contains('normalizedQuery')) {
		store.createIndex('normalizedQuery', 'normalizedQuery');
	}
}

export function getFromStore<T>(
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

export function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();

		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

export function putInStore(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite');
		const request = transaction.objectStore(storeName).put(value);

		request.onerror = () => reject(request.error ?? new Error(`Failed to write ${storeName}`));
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
	});
}

export function deleteFromStore(
	db: IDBDatabase,
	storeName: string,
	key: IDBValidKey
): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite');
		const request = transaction.objectStore(storeName).delete(key);

		request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${storeName}`));
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error(`Failed to delete ${storeName}`));
	});
}
