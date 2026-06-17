export type BangSourceId = 'duckduckgo' | 'kagi-shared' | 'kagi-kagi';

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

const DB_NAME = 'zbang';
const DB_VERSION = 1;
const SOURCE_STORE = 'bangSources';
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

function countSourceBangs(text: string) {
	const data = JSON.parse(text) as unknown;

	return Array.isArray(data) ? data.length : undefined;
}

function sortBySourceOrder(a: BangSourceStatus, b: BangSourceStatus) {
	return getSourceOrder(a.id) - getSourceOrder(b.id);
}

function getSourceOrder(id: BangSourceId) {
	const index = BANG_SOURCES.findIndex((source) => source.id === id);
	return index === -1 ? Number.MAX_SAFE_INTEGER : index;
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
