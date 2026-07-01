import type { BangProviderId, MyBangRecord, ZbangRecord } from './bang-data';
import {
	deleteFromStore,
	getAllFromStore,
	getFromStore,
	openWhizDb,
	putInStore
} from './bang-data';
import type { ExecutionSettings, SearchProvider } from './execution-settings';
import { normalizeBangCode } from './launcher/bang-code';
import type { BangComposition } from './launcher/types';

const SEARCH_HISTORY_STORE = 'searchHistory';
const HISTORY_SETTINGS_STORE = 'historySettings';
const HISTORY_RECORDING_SETTINGS_KEY = 'recording';

export type SearchHistorySource = 'launcher' | 'omnibar';

export type SearchHistoryEvent = {
	id: string;
	kind: 'search';
	executedAt: string;
	localDate: string;
	timeZone?: string;
	utcOffsetMinutes?: number;
	source: SearchHistorySource;
	rawQuery: string;
	normalizedQuery: string;
	execution: SearchHistoryExecution;
	targets: SearchHistoryTarget[];
};

export type SearchHistoryExecution = {
	type: 'plain-search' | 'bang-search' | 'fanout-search';
	searchProvider: SearchProvider;
	customSearchLabel?: string;
	customSearchTemplate?: string;
	bangProvider: BangProviderId;
	primaryTargetUrl: string;
	targetUrls: string[];
};

export type SearchHistoryTarget = {
	url: string;
	host?: string;
	label?: string;
	kind: 'search-provider' | 'mybang' | 'provider-bang' | 'provider-fallback' | 'unknown';
	bangName?: string;
	bangCodes?: string[];
	catalogProvider?: BangProviderId;
	myBangId?: string;
};

type HistoryRecordingSettings = {
	id: typeof HISTORY_RECORDING_SETTINGS_KEY;
	enabled: boolean;
};

type SearchHistoryEventBaseInput = {
	source: SearchHistorySource;
	rawQuery: string;
	settings: ExecutionSettings;
	targetUrls: string[];
	targets: SearchHistoryTarget[];
	executionType: SearchHistoryExecution['type'];
	now?: Date;
};

export type PlainSearchHistoryEventInput = {
	source: SearchHistorySource;
	rawQuery: string;
	settings: ExecutionSettings;
	searchProvider?: SearchProvider;
	targetUrl: string;
	now?: Date;
};

export type BangSearchHistoryEventInput = {
	source: SearchHistorySource;
	rawQuery: string;
	settings: ExecutionSettings;
	composition: BangComposition;
	targetUrls: string[];
	now?: Date;
};

export function normalizeSearchHistoryQuery(query: string) {
	return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function getSearchProviderLabel(provider: SearchProvider, customSearchLabel?: string) {
	return (
		{
			kagi: 'Kagi',
			duckduckgo: 'DuckDuckGo',
			google: 'Google',
			custom: customSearchLabel?.trim() || 'Custom search'
		} satisfies Record<SearchProvider, string>
	)[provider];
}

export function getSearchHistoryTargetHost(targetUrl: string) {
	try {
		return new URL(targetUrl).hostname.replace(/^www\./, '');
	} catch {
		return undefined;
	}
}

export function createPlainSearchHistoryEvent(
	input: PlainSearchHistoryEventInput
): SearchHistoryEvent {
	const settings = {
		...input.settings,
		searchProvider: input.searchProvider ?? input.settings.searchProvider
	};
	const label = getSearchProviderLabel(settings.searchProvider, settings.customSearchLabel);

	return createSearchHistoryEventBase({
		source: input.source,
		rawQuery: input.rawQuery,
		settings,
		targetUrls: [input.targetUrl],
		targets: [
			{
				url: input.targetUrl,
				host: getSearchHistoryTargetHost(input.targetUrl),
				label,
				kind: 'search-provider'
			}
		],
		executionType: 'plain-search',
		now: input.now
	});
}

export function createBangSearchHistoryEvent(
	input: BangSearchHistoryEventInput
): SearchHistoryEvent {
	const targets = createBangSearchHistoryTargets(
		input.composition,
		input.targetUrls,
		input.settings
	);

	return createSearchHistoryEventBase({
		source: input.source,
		rawQuery: input.rawQuery,
		settings: input.settings,
		targetUrls: input.targetUrls,
		targets,
		executionType: input.targetUrls.length > 1 ? 'fanout-search' : 'bang-search',
		now: input.now
	});
}

export async function readHistoryRecordingEnabled(): Promise<boolean> {
	const db = await openWhizDb();

	try {
		const settings = await getFromStore<HistoryRecordingSettings>(
			db,
			HISTORY_SETTINGS_STORE,
			HISTORY_RECORDING_SETTINGS_KEY
		);

		return settings?.enabled ?? true;
	} finally {
		db.close();
	}
}

export async function writeHistoryRecordingEnabled(enabled: boolean): Promise<void> {
	const db = await openWhizDb();

	try {
		await putInStore(db, HISTORY_SETTINGS_STORE, {
			id: HISTORY_RECORDING_SETTINGS_KEY,
			enabled
		} satisfies HistoryRecordingSettings);
	} finally {
		db.close();
	}
}

export async function listSearchHistoryEvents(): Promise<SearchHistoryEvent[]> {
	const db = await openWhizDb();

	try {
		const events = await getAllFromStore<SearchHistoryEvent>(db, SEARCH_HISTORY_STORE);

		return events.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
	} finally {
		db.close();
	}
}

export async function recordSearchHistoryEvent(event: SearchHistoryEvent): Promise<void> {
	const db = await openWhizDb();

	try {
		const settings = await getFromStore<HistoryRecordingSettings>(
			db,
			HISTORY_SETTINGS_STORE,
			HISTORY_RECORDING_SETTINGS_KEY
		);

		if (settings?.enabled === false) return;

		await putInStore(db, SEARCH_HISTORY_STORE, event);
	} finally {
		db.close();
	}
}

export async function deleteSearchHistoryEvent(id: string): Promise<void> {
	const db = await openWhizDb();

	try {
		await deleteFromStore(db, SEARCH_HISTORY_STORE, id);
	} finally {
		db.close();
	}
}

function createSearchHistoryEventBase(input: SearchHistoryEventBaseInput): SearchHistoryEvent {
	const now = input.now ?? new Date();
	const targetUrls = input.targetUrls.filter(Boolean);
	const rawQuery = input.rawQuery.trim();

	return {
		id: createSearchHistoryEventId(now),
		kind: 'search',
		executedAt: now.toISOString(),
		localDate: getLocalDate(now),
		...getTimeZoneSnapshot(now),
		source: input.source,
		rawQuery,
		normalizedQuery: normalizeSearchHistoryQuery(rawQuery),
		execution: {
			type: input.executionType,
			searchProvider: input.settings.searchProvider,
			...(input.settings.searchProvider === 'custom'
				? {
						customSearchLabel: input.settings.customSearchLabel,
						customSearchTemplate: input.settings.customSearchTemplate
					}
				: {}),
			bangProvider: input.settings.bangProvider,
			primaryTargetUrl: targetUrls[0] ?? '',
			targetUrls
		},
		targets: input.targets.filter((target) => target.url)
	};
}

function createBangSearchHistoryTargets(
	composition: BangComposition,
	targetUrls: string[],
	settings: ExecutionSettings
): SearchHistoryTarget[] {
	const targets: SearchHistoryTarget[] = [];

	for (const [index, target] of composition.localTargets.entries()) {
		const targetUrl = targetUrls[index];

		if (!targetUrl) continue;

		targets.push(createBangTarget(targetUrl, target.item, settings));
	}

	if (composition.forwardedTokens.length) {
		const targetUrl = targetUrls[composition.localTargets.length];
		const bangCodes = composition.forwardedTokens.map(normalizeBangCode);

		if (targetUrl) {
			targets.push({
				url: targetUrl,
				host: getSearchHistoryTargetHost(targetUrl),
				label: `${bangCodes.join(', ')} via ${getSearchProviderLabel(
					settings.searchProvider,
					settings.customSearchLabel
				)}`,
				kind: 'provider-fallback',
				bangCodes,
				catalogProvider: settings.bangProvider
			});
		}
	}

	for (const targetUrl of targetUrls.slice(targets.length)) {
		targets.push({
			url: targetUrl,
			host: getSearchHistoryTargetHost(targetUrl),
			kind: 'unknown'
		});
	}

	return targets;
}

function createBangTarget(
	targetUrl: string,
	item: ZbangRecord,
	settings: ExecutionSettings
): SearchHistoryTarget {
	const bangCodes = item.code.map(normalizeBangCode);
	const myBang = isMyBangRecord(item) ? item : undefined;

	return {
		url: targetUrl,
		host: getSearchHistoryTargetHost(targetUrl),
		label: item.name,
		kind: myBang ? 'mybang' : 'provider-bang',
		bangName: item.name,
		bangCodes,
		catalogProvider: myBang?.sourceProvider ?? settings.bangProvider,
		...(myBang ? { myBangId: myBang.id } : {})
	};
}

function isMyBangRecord(item: ZbangRecord): item is MyBangRecord {
	const value = item as Partial<MyBangRecord>;

	return typeof value.id === 'string' && (value.origin === 'catalog' || value.origin === 'custom');
}

function createSearchHistoryEventId(now: Date) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `history:${crypto.randomUUID()}`;
	}

	return `history:${now.getTime().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getLocalDate(date: Date) {
	const year = date.getFullYear().toString().padStart(4, '0');
	const month = (date.getMonth() + 1).toString().padStart(2, '0');
	const day = date.getDate().toString().padStart(2, '0');

	return `${year}-${month}-${day}`;
}

function getTimeZoneSnapshot(date: Date) {
	return {
		timeZone: getTimeZone(),
		utcOffsetMinutes: -date.getTimezoneOffset()
	};
}

function getTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
}
