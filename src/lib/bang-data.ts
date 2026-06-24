import type { ZbangRecord } from './bang-catalog';
import type { ExecutionSettings } from './execution-settings';

export {
	type BangProviderId,
	type CatalogZbangRecord,
	type RankedZbangCatalog,
	type ZbangRecord,
	type ZbangCatalog
} from './bang-catalog';

const DB_NAME = 'whiz';
const LEGACY_DB_NAME = 'zbang';
const DB_VERSION = 5;
const OLD_SOURCE_STORE = 'bangSources';
const OLD_CATALOG_STORE = 'bangCatalogs';
const MY_BANG_STORE = 'myBangs';
const MY_BANG_COLLECTION_KEY = 'items';
const EXECUTION_SETTINGS_STORE = 'executionSettings';
const EXECUTION_SETTINGS_KEY = 'current';
let legacyMigration: Promise<void> | undefined;

type MyBangCollection = {
	id: typeof MY_BANG_COLLECTION_KEY;
	items: StoredZbangRecord[];
};

type StoredZbangRecord = Omit<ZbangRecord, 'popularity'> &
	Partial<Pick<ZbangRecord, 'popularity'>>;

type ExecutionSettingsRecord = ExecutionSettings & {
	id: typeof EXECUTION_SETTINGS_KEY;
};

export async function readMyBangs(): Promise<ZbangRecord[]> {
	const db = await openBangDb();

	try {
		const collection = await getFromStore<MyBangCollection>(
			db,
			MY_BANG_STORE,
			MY_BANG_COLLECTION_KEY
		);
		return collection?.items.map(normalizeStoredBang) ?? [];
	} finally {
		db.close();
	}
}

function normalizeStoredBang(item: StoredZbangRecord): ZbangRecord {
	return {
		...item,
		popularity: item.popularity ?? 1
	};
}

export async function writeMyBangs(items: ZbangRecord[]): Promise<void> {
	const db = await openBangDb();

	try {
		await putInStore(db, MY_BANG_STORE, { id: MY_BANG_COLLECTION_KEY, items });
	} finally {
		db.close();
	}
}

export async function readExecutionSettings(): Promise<ExecutionSettings | undefined> {
	const db = await openBangDb();

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
	const db = await openBangDb();

	try {
		await putInStore(db, EXECUTION_SETTINGS_STORE, {
			id: EXECUTION_SETTINGS_KEY,
			...settings
		});
	} finally {
		db.close();
	}
}

async function openBangDb(): Promise<IDBDatabase> {
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
