import type { SearchHistoryEvent } from './search-history';
import type { JournalEntry } from './journal';
import { getJournalEntryExcerpt, getJournalEntryTitle, getLocalJournalDate } from './journal';

export type JournalPeriodKind = 'day' | 'week' | 'month' | 'year';

export type JournalSummarySignal = {
	id: string;
	title: string;
	description: string;
	searchText: string;
};

export type JournalSummaryGroup = {
	id: string;
	kind: JournalPeriodKind;
	title: string;
	startDate: string;
	endDate: string;
	description: string;
	events: SearchHistoryEvent[];
	entries: JournalEntry[];
	signals: JournalSummarySignal[];
	searchText: string;
};

type JournalPeriod = {
	id: string;
	kind: JournalPeriodKind;
	title: string;
	startDate: string;
	endDate: string;
};

type FirstSeenMaps = {
	hosts: Map<string, string>;
	bangCodes: Map<string, string>;
};

const repeatedTermStopWords = new Set([
	'about',
	'after',
	'before',
	'from',
	'have',
	'into',
	'near',
	'that',
	'this',
	'what',
	'when',
	'where',
	'which',
	'with',
	'your'
]);

export function buildJournalSummaryGroups(
	events: SearchHistoryEvent[],
	entries: JournalEntry[],
	now = new Date()
): JournalSummaryGroup[] {
	const firstSeenMaps = getFirstSeenMaps(events);
	const groups = new Map<
		string,
		{ period: JournalPeriod; events: SearchHistoryEvent[]; entries: JournalEntry[] }
	>();

	for (const event of events) {
		const period = getJournalPeriod(event.localDate, now);
		const group = getOrCreateJournalGroup(groups, period);

		group.events.push(event);
	}

	for (const entry of entries) {
		const period = getJournalPeriod(entry.entryDate, now);
		const group = getOrCreateJournalGroup(groups, period);

		group.entries.push(entry);
	}

	return [...groups.values()]
		.map(({ period, events, entries }) => {
			const sortedEvents = [...events].sort((a, b) => b.executedAt.localeCompare(a.executedAt));
			const sortedEntries = [...entries].sort(
				(a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt)
			);
			const signals = getJournalSignals(sortedEvents, period, firstSeenMaps);
			const description = getJournalGroupDescription(sortedEvents, sortedEntries);
			const searchText = getJournalGroupSearchText(
				period,
				description,
				signals,
				sortedEvents,
				sortedEntries
			);

			return {
				...period,
				description,
				events: sortedEvents,
				entries: sortedEntries,
				signals,
				searchText
			};
		})
		.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function getOrCreateJournalGroup(
	groups: Map<
		string,
		{ period: JournalPeriod; events: SearchHistoryEvent[]; entries: JournalEntry[] }
	>,
	period: JournalPeriod
) {
	const existing = groups.get(period.id);

	if (existing) return existing;

	const group = { period, events: [], entries: [] };
	groups.set(period.id, group);

	return group;
}

function getJournalPeriod(localDate: string, now: Date): JournalPeriod {
	const today = getLocalJournalDate(now);
	const yesterday = getLocalJournalDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
	const date = parseLocalDate(localDate) ?? new Date(`${today}T00:00:00`);
	const currentDate = new Date(`${today}T00:00:00`);
	const weekStart = getWeekStartDate(currentDate);
	const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

	if (localDate === today) {
		return {
			id: `journal.day.${localDate}`,
			kind: 'day',
			title: 'Today',
			startDate: localDate,
			endDate: localDate
		};
	}

	if (localDate === yesterday) {
		return {
			id: `journal.day.${localDate}`,
			kind: 'day',
			title: 'Yesterday',
			startDate: localDate,
			endDate: localDate
		};
	}

	if (date >= weekStart && date < currentDate) {
		return {
			id: `journal.day.${localDate}`,
			kind: 'day',
			title: formatWeekdayDate(date),
			startDate: localDate,
			endDate: localDate
		};
	}

	if (date >= monthStart) {
		const startDate = getLocalJournalDate(getWeekStartDate(date));
		const endDate = getLocalJournalDate(getWeekEndDate(date));

		return {
			id: `journal.week.${startDate}`,
			kind: 'week',
			title: `Week of ${formatShortDate(startDate)}`,
			startDate,
			endDate
		};
	}

	if (date.getFullYear() === currentDate.getFullYear()) {
		const month = `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
			.toString()
			.padStart(2, '0')}`;

		return {
			id: `journal.month.${month}`,
			kind: 'month',
			title: date.toLocaleDateString([], { month: 'long' }),
			startDate: `${month}-01`,
			endDate: getLocalJournalDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
		};
	}

	const year = date.getFullYear().toString().padStart(4, '0');

	return {
		id: `journal.year.${year}`,
		kind: 'year',
		title: year,
		startDate: `${year}-01-01`,
		endDate: `${year}-12-31`
	};
}

function getJournalGroupDescription(events: SearchHistoryEvent[], entries: JournalEntry[]) {
	const parts = [
		events.length ? formatSearchCount(events.length) : undefined,
		events.length ? `${getUniqueQueryCount(events)} unique` : undefined,
		entries.length ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : undefined
	];

	return parts.filter(Boolean).join(' - ');
}

function getJournalSignals(
	events: SearchHistoryEvent[],
	period: JournalPeriod,
	firstSeenMaps: FirstSeenMaps
) {
	if (!events.length) return [];

	const signals = [
		getCommonHostsSignal(events),
		getCommonBangTargetsSignal(events),
		getRepeatedQueriesSignal(events),
		getRepeatedTermsSignal(events),
		getFirstSeenHostsSignal(events, period, firstSeenMaps.hosts),
		getFirstSeenBangCodesSignal(events, period, firstSeenMaps.bangCodes),
		getRelatedSearchesSignal(events),
		getActivityBurstSignal(events),
		getLongQueriesSignal(events),
		getFanoutSignal(events)
	].filter((signal): signal is JournalSummarySignal => Boolean(signal));

	return signals.slice(0, 6);
}

function getCommonHostsSignal(events: SearchHistoryEvent[]) {
	const hosts = getTopCounts(events.flatMap((event) => event.targets.map((target) => target.host)));

	if (!hosts.length) return undefined;

	return createSignal('common-hosts', 'Common targets', hosts.slice(0, 4).join(', '));
}

function getCommonBangTargetsSignal(events: SearchHistoryEvent[]) {
	const targets = getTopCounts(
		events.flatMap((event) =>
			event.targets
				.filter((target) => target.kind === 'mybang' || target.kind === 'provider-bang')
				.map((target) => target.label ?? target.bangName)
		)
	);

	if (!targets.length) return undefined;

	return createSignal('common-bangs', 'Common bangs', targets.slice(0, 4).join(', '));
}

function getRepeatedQueriesSignal(events: SearchHistoryEvent[]) {
	const repeated = getTopCounts(events.map((event) => event.normalizedQuery));

	if (!repeated.length) return undefined;

	return createSignal('repeated-queries', 'Repeated', repeated.slice(0, 3).join(', '));
}

function getRepeatedTermsSignal(events: SearchHistoryEvent[]) {
	const terms = getTopCounts(events.flatMap((event) => getQueryTerms(event.normalizedQuery)));

	if (!terms.length) return undefined;

	return createSignal('common-terms', 'Common terms', terms.slice(0, 5).join(', '));
}

function getFirstSeenHostsSignal(
	events: SearchHistoryEvent[],
	period: JournalPeriod,
	firstSeenHosts: Map<string, string>
) {
	const hosts = uniqueStrings(
		events
			.flatMap((event) => event.targets.map((target) => target.host))
			.filter((host): host is string => Boolean(host))
			.filter((host) => isDateWithinPeriod(firstSeenHosts.get(host), period))
	);

	if (!hosts.length) return undefined;

	return createSignal('first-hosts', 'First seen', hosts.slice(0, 4).join(', '));
}

function getFirstSeenBangCodesSignal(
	events: SearchHistoryEvent[],
	period: JournalPeriod,
	firstSeenBangCodes: Map<string, string>
) {
	const bangCodes = uniqueStrings(
		events
			.flatMap((event) => event.targets.flatMap((target) => target.bangCodes ?? []))
			.filter((code) => isDateWithinPeriod(firstSeenBangCodes.get(code), period))
	);

	if (!bangCodes.length) return undefined;

	return createSignal('first-bangs', 'First bang use', bangCodes.slice(0, 5).join(', '));
}

function getRelatedSearchesSignal(events: SearchHistoryEvent[]) {
	const termPairs = new Map<string, number>();

	for (const event of events) {
		const terms = getQueryTerms(event.normalizedQuery);

		for (let index = 0; index < terms.length - 1; index += 1) {
			for (let nextIndex = index + 1; nextIndex < terms.length; nextIndex += 1) {
				const pair = [terms[index], terms[nextIndex]].sort().join(' ');
				termPairs.set(pair, (termPairs.get(pair) ?? 0) + 1);
			}
		}
	}

	const related = [...termPairs.entries()]
		.filter(([, count]) => count > 1)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([pair]) => pair);

	if (!related.length) return undefined;

	return createSignal('related-searches', 'Related searches', related.slice(0, 3).join(', '));
}

function getActivityBurstSignal(events: SearchHistoryEvent[]) {
	const timestamps = events
		.map((event) => new Date(event.executedAt).getTime())
		.filter((timestamp) => Number.isFinite(timestamp))
		.sort((a, b) => a - b);

	let burstCount = 0;

	for (let index = 0; index < timestamps.length; index += 1) {
		const windowStart = timestamps[index];
		const windowEnd = windowStart + 30 * 60 * 1000;
		const count = timestamps.filter(
			(timestamp) => timestamp >= windowStart && timestamp <= windowEnd
		).length;

		burstCount = Math.max(burstCount, count);
	}

	if (burstCount < 3) return undefined;

	return createSignal(
		'activity-burst',
		'Activity burst',
		`${burstCount} searches within 30 minutes`
	);
}

function getLongQueriesSignal(events: SearchHistoryEvent[]) {
	const longQueries = events
		.filter((event) => event.rawQuery.length > 80 || event.rawQuery.trim().split(/\s+/).length > 10)
		.map((event) => event.rawQuery);

	if (!longQueries.length) return undefined;

	return createSignal('long-queries', 'Long queries', `${longQueries.length} detailed searches`);
}

function getFanoutSignal(events: SearchHistoryEvent[]) {
	const fanouts = events.filter((event) => event.execution.type === 'fanout-search');

	if (!fanouts.length) return undefined;

	return createSignal(
		'fanout',
		'Fanout',
		`${fanouts.length} ${fanouts.length === 1 ? 'multi-target search' : 'multi-target searches'}`
	);
}

function createSignal(id: string, title: string, description: string): JournalSummarySignal {
	return {
		id,
		title,
		description,
		searchText: `${title} ${description}`
	};
}

function getFirstSeenMaps(events: SearchHistoryEvent[]): FirstSeenMaps {
	const hosts = new Map<string, string>();
	const bangCodes = new Map<string, string>();

	for (const event of [...events].sort((a, b) => a.executedAt.localeCompare(b.executedAt))) {
		for (const host of event.targets.map((target) => target.host).filter(isString)) {
			if (!hosts.has(host)) hosts.set(host, event.localDate);
		}

		for (const code of event.targets.flatMap((target) => target.bangCodes ?? [])) {
			if (!bangCodes.has(code)) bangCodes.set(code, event.localDate);
		}
	}

	return { hosts, bangCodes };
}

function getJournalGroupSearchText(
	period: JournalPeriod,
	description: string,
	signals: JournalSummarySignal[],
	events: SearchHistoryEvent[],
	entries: JournalEntry[]
) {
	return [
		period.title,
		period.kind,
		period.startDate,
		period.endDate,
		description,
		...signals.map((signal) => signal.searchText),
		...events.flatMap((event) => [
			event.rawQuery,
			event.normalizedQuery,
			event.localDate,
			event.execution.type,
			event.execution.bangProvider,
			event.execution.searchProvider,
			...event.targets.flatMap((target) => [
				target.host,
				target.label,
				target.bangName,
				target.kind,
				...(target.bangCodes ?? [])
			])
		]),
		...entries.flatMap((entry) => [
			entry.entryDate,
			getJournalEntryTitle(entry),
			getJournalEntryExcerpt(entry),
			entry.bodyMarkdown
		])
	]
		.filter(isString)
		.join(' ');
}

function getUniqueQueryCount(events: SearchHistoryEvent[]) {
	return new Set(events.map((event) => event.normalizedQuery)).size;
}

function formatSearchCount(count: number) {
	return `${count} ${count === 1 ? 'search' : 'searches'}`;
}

function getTopCounts(values: Array<string | undefined>) {
	const counts = new Map<string, number>();

	for (const value of values) {
		const key = value?.trim();
		if (!key) continue;

		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()]
		.filter(([, count]) => count > 1)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([value]) => value);
}

function getQueryTerms(query: string) {
	return uniqueStrings(
		query
			.toLowerCase()
			.match(/[a-z0-9][a-z0-9-]{2,}/g)
			?.filter((term) => !repeatedTermStopWords.has(term)) ?? []
	);
}

function uniqueStrings(values: string[]) {
	return values.filter((value, index, allValues) => value && allValues.indexOf(value) === index);
}

function isDateWithinPeriod(localDate: string | undefined, period: JournalPeriod) {
	return Boolean(localDate && localDate >= period.startDate && localDate <= period.endDate);
}

function getWeekStartDate(date: Date) {
	const nextDate = new Date(date);
	const mondayOffset = (nextDate.getDay() + 6) % 7;

	nextDate.setDate(nextDate.getDate() - mondayOffset);
	nextDate.setHours(0, 0, 0, 0);

	return nextDate;
}

function getWeekEndDate(date: Date) {
	const nextDate = getWeekStartDate(date);

	nextDate.setDate(nextDate.getDate() + 6);

	return nextDate;
}

function parseLocalDate(localDate: string) {
	const date = new Date(`${localDate}T00:00:00`);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatWeekdayDate(date: Date) {
	return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatShortDate(localDate: string) {
	const date = parseLocalDate(localDate);

	return date ? date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : localDate;
}

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}
