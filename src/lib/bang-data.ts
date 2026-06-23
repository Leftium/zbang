import type { Zbang } from './bang-catalog';
import type { ExecutionSettings } from './execution-settings';

export { type BangProviderId, type Zbang, type ZbangCatalog } from './bang-catalog';

const DB_NAME = 'zbang';
const DB_VERSION = 5;
const OLD_SOURCE_STORE = 'bangSources';
const OLD_CATALOG_STORE = 'bangCatalogs';
const MY_BANG_STORE = 'myBangs';
const MY_BANG_COLLECTION_KEY = 'items';
const EXECUTION_SETTINGS_STORE = 'executionSettings';
const EXECUTION_SETTINGS_KEY = 'current';

type MyBangCollection = {
	id: typeof MY_BANG_COLLECTION_KEY;
	items: Zbang[];
};

type ExecutionSettingsRecord = ExecutionSettings & {
	id: typeof EXECUTION_SETTINGS_KEY;
};

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

function openBangDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

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
