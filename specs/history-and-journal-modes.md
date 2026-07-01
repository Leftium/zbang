# History And Journal Modes

## Purpose

Add two launcher-native modes for browsing searches executed through Whiz:

- History: a faithful browser-history-like list of executed searches. Its main job is to help users find, inspect, rerun, reuse, or remove specific searches from the past.
- Journal: a zero-effort journal derived from search history. Its main job is to summarize, group, and highlight interesting search activity over time, while also allowing manual markdown journal entries.

History should ship first because it has a narrower retrieval workflow. Journal should reuse the same search-event store, so History V1 must preserve enough metadata for Journal to become useful later without changing the meaning of existing records.

## Background

The product motivation is similar to the user request in this Kagi feedback thread:

https://kagifeedback.org/d/4065-query-personal-search-history-to-revisit-previous-search-results

The strongest themes are:

- Users want to revisit prior searches, often because browser history only records result URLs and page visits.
- Query text, provider, time, nearby searches, and target context are useful retrieval signals.
- Privacy matters because search history can be sensitive.
- Search history can become a lightweight memory or journal when grouped and summarized over time.

## Related Specs

- `specs/launcher-actions-requirements.md`: already identifies Search History as a plugin-like capability with reuse, rerun, match, remove, and frecency possibilities.
- `specs/omnibar-bang-execution.md`: `/go?q=...` and the service worker execute searches outside the normal launcher route and therefore need explicit capture behavior.
- `specs/settings-mode.md`: History recording and off-the-record controls should eventually be exposed through launcher-native Settings mode.
- `specs/launcher-shortcut-targets.md`: remove actions, action menus, focused rows, and confirmation behavior should follow the shared launcher action model.

## Goals

- Record searches only when they are executed through Whiz.
- Do not record launcher text that was merely typed, filtered, pasted, or abandoned.
- Enable local history recording by default.
- Provide an off-the-record mode or setting that prevents new history records from being created.
- Preserve enough execution metadata to replay the original search, even if providers, bangs, or MyBangs change later.
- Support duplicate searches as separate History events.
- Let users remove individual search history items.
- Let History mode browse and search exact past search events.
- Let Journal mode group, summarize, and highlight history-derived activity.
- Let Journal mode create, edit, and delete manual markdown entries that never appear in History mode.
- Keep history and journal data local and private in the first implementation.

## Non-Goals

- Do not capture browser-native history, clicked result pages, or external browsing activity.
- Do not record unexecuted drafts or History/Journal filter text.
- Do not add cloud sync, accounts, or cross-device merge behavior in the first version.
- Do not depend on AI-generated summaries for Journal V1.
- Do not require full-text indexing beyond what local browser storage can support simply.
- Do not support bulk deletion in V1. Start with one-item removal.
- Do not expose manual Journal entries inside History mode.
- Do not make server-side history capture authoritative for locally private data.

## Terminology

- Executed search: a user action that causes Whiz to open or navigate to one or more search targets.
- History event: one stored executed search record.
- Plain search: a query executed through the selected search provider without a resolved bang target.
- Bang search: a query whose execution uses one or more local MyBangs or provider bang records.
- Fanout search: a bang search that resolves to multiple target URLs.
- Original search: the exact target URL or target URLs that Whiz opened when the history event was recorded.
- Reuse query: place the recorded raw query back into Search mode for editing.
- Re-run original search: open the recorded target URL or target URLs exactly as stored.
- Re-resolve search: optional later action that runs the raw query through the current settings and current bang catalog.
- Off the record: a mode or setting where executed searches are not written to search history.
- Manual journal entry: user-authored markdown stored for Journal mode only.

## Product Distinction

History and Journal are similar because both are backed by executed searches. They differ in intent.

History optimizes for retrieval:

- What did I search?
- When did I search it?
- Which provider or bang did it use?
- Can I rerun it exactly?
- Can I remove this record?

Journal optimizes for reflection:

- What was I researching today or this week?
- Which topics kept recurring?
- Which searches were unusual, unique, or first-time?
- What patterns emerge across days, weeks, months, or years?
- Can I add a manual note around this period?

History should remain a straight list. It may use lightweight date separators, but it should not become summary-first. Journal should be summary-first and group-first.

## Routes And Modes

Add two dedicated launcher modes:

```ts
type LauncherModeId =
	| 'everything'
	| 'search'
	| 'bangs'
	| 'compromise'
	| 'settings'
	| 'history'
	| 'journal';
```

Suggested routes:

- `/history`: History mode.
- `/journal`: Journal mode.

Suggested mode records:

```ts
{
	id: 'history',
	label: 'History',
	description: 'Find and rerun searches you executed through Whiz.',
	path: '/history',
	pluginIds: ['history'],
	keywords: ['past searches', 'recent searches', 'search history', 'rerun']
}

{
	id: 'journal',
	label: 'Journal',
	description: 'Review search activity by day, week, month, and year.',
	path: '/journal',
	pluginIds: ['history', 'journal'],
	keywords: ['daily journal', 'search journal', 'timeline', 'patterns']
}
```

Everything mode should eventually surface History and Journal mode entries. Search mode may later use history-derived frecency signals, but the first History implementation does not need cross-mode exposure.

## Capture Scope

History records should be created from executed searches only.

In scope:

- Search mode provider search actions.
- Search mode bang execution actions.
- `/go?q=...` omnibar execution through the Svelte page fallback.
- `/go?q=...` omnibar execution through the service-worker fast path.

Out of scope:

- Typing in Search mode without executing.
- Filtering inside History mode.
- Filtering inside Journal mode.
- Opening `/go/open` relay pages for fanout targets.
- Browser visits after Whiz redirects away from the app.

Each user-initiated query should create at most one history event. A fanout search with multiple targets is one history event with multiple target URLs, not one event per target.

History capture should be best-effort and should not block navigation. If writing a record fails, Whiz should still execute the search.

## Capture Timing

Capture should happen after Whiz resolves the search but before navigation or tab fanout begins.

This timing allows the record to include:

- The raw user query.
- The execution source.
- The settings snapshot used for resolution.
- The selected provider or bang target metadata.
- The exact final target URL or target URLs.

For service-worker redirects, the worker should write the history event before returning `Response.redirect(...)` when IndexedDB is available. If the worker cannot write, it should log a warning only in development or use the same minimal warning style as existing service-worker resolution failures.

The Svelte `/go` fallback should avoid double-recording if a service-worker path already recorded the event. Since a service-worker-handled redirect bypasses the page fallback, this should usually be naturally avoided. If a future implementation retries through the page after partial service-worker work, records should carry an idempotency key derived from source, raw query, target URLs, and a short time window.

## Search History Data Model

Use IndexedDB, consistent with MyBangs and execution settings.

Suggested object store:

```ts
const SEARCH_HISTORY_STORE = 'searchHistory';
```

Suggested event shape:

```ts
type SearchHistoryEvent = {
	id: string;
	kind: 'search';
	executedAt: string;
	localDate: string;
	timeZone?: string;
	utcOffsetMinutes?: number;
	source: 'launcher' | 'omnibar';
	rawQuery: string;
	normalizedQuery: string;
	execution: SearchHistoryExecution;
	targets: SearchHistoryTarget[];
};

type SearchHistoryExecution = {
	type: 'plain-search' | 'bang-search' | 'fanout-search';
	searchProvider: SearchProvider;
	customSearchLabel?: string;
	customSearchTemplate?: string;
	bangProvider: BangProviderId;
	primaryTargetUrl: string;
	targetUrls: string[];
};

type SearchHistoryTarget = {
	url: string;
	host?: string;
	label?: string;
	kind:
		| 'search-provider'
		| 'mybang'
		| 'provider-bang'
		| 'provider-fallback'
		| 'unknown';
	bangName?: string;
	bangCodes?: string[];
	catalogProvider?: BangProviderId;
	myBangId?: string;
};
```

`executedAt` should be an ISO timestamp. `localDate` should be the user's date at capture time in `YYYY-MM-DD` form so Journal can preserve "today" as experienced by the user, even if the browser timezone later changes. `timeZone` should use `Intl.DateTimeFormat().resolvedOptions().timeZone` when available.

`rawQuery` is the exact user-entered query after the same trimming used for execution. `normalizedQuery` is for filtering and duplicate detection only. It should not replace the raw display text.

`targetUrls` are required because bangs can change. Re-running the original search uses the stored URL or URLs, not current settings.

The event should avoid storing entire MyBang or provider records. Store only the minimal metadata needed for display, filtering, and replay. The final target URL may contain the query and is sensitive, but it is also necessary to replay the original search.

## Manual Journal Data Model

Manual journal entries should be stored separately from search history.

Suggested object store:

```ts
const JOURNAL_ENTRY_STORE = 'journalEntries';
```

Suggested shape:

```ts
type JournalEntry = {
	id: string;
	entryDate: string;
	createdAt: string;
	updatedAt: string;
	bodyMarkdown: string;
	title?: string;
	tags?: string[];
};
```

For V1, `bodyMarkdown` is the important field. `title` and `tags` may be derived later or omitted from the first editor UI.

Markdown rendering must be sanitized or configured to reject raw HTML. Journal entries are local, but unsafe markdown rendering can still create surprising behavior in the app.

Manual journal entries:

- Appear in Journal mode.
- Do not appear in History mode.
- Do not create search history events.
- Can be grouped with search-derived journal sections by `entryDate`.

## Privacy And Off-The-Record Behavior

History recording is enabled by default.

Users should have a clear way to stop future recording:

- A persistent setting such as `History recording: On | Off`.
- A visible off-the-record state when recording is off.
- Optional later one-shot action: execute this search without recording it.

When off the record is active:

- No `SearchHistoryEvent` is created.
- No placeholder or tombstone is created.
- Existing history and journal data remain unchanged.
- Search execution behavior remains otherwise identical.

Turning recording off is not the same as clearing history. Deletion and clearing should be separate actions.

History and Journal filters should never be logged as search history. Opening a recorded target from History or Journal is an executed Whiz action and may be recorded unless the user chooses off the record. The initial implementation may avoid recording History-originated replays to prevent confusing duplicates, but that behavior should be explicit in UI copy or action naming.

## Deletion

Both modes must support removing individual history events.

Deleting a history event:

- Hard-deletes that one `SearchHistoryEvent`.
- Removes it from History mode.
- Updates Journal summaries because those summaries derive from remaining history.
- Does not delete manual Journal entries.
- Does not delete browser-native history.

Journal must also support deleting manual journal entries, but that is a separate action from removing a history event.

Bulk delete by filter, day, week, month, or all history is intentionally out of scope for V1.

## History Mode

History mode is the focused place to find specific executed searches.

### Default Presentation

When the textarea is empty, show a reverse-chronological list of history events.

Recommended row content:

```text
query text
provider or bang label - target host - timestamp - source
```

Examples:

```text
svelte derived state
Google - google.com - Today 14:32 - Search

!gh whiz service worker
GitHub - github.com - Yesterday 21:08 - Omnibar

!docs indexeddb search history
MDN, Svelte docs - 2 targets - Jun 28 09:14 - Search
```

Lightweight date separators are acceptable:

```text
Today
  svelte derived state
  !gh whiz service worker
Yesterday
  indexeddb transaction durability
```

The important constraint is that History remains an event list. It should not collapse duplicates by default, hide events behind summary cards, or replace raw query text with inferred topics.

### Filtering

Typing in History mode filters history events. It does not execute a search.

Filter signals should include:

- Raw query text.
- Normalized query text.
- Search provider.
- Bang name.
- Bang codes.
- Target host.
- Source, such as launcher or omnibar.
- Local date or visible date text when practical.

Matching should prefer exact query and prefix matches, then fuzzy matches, then target/provider metadata matches.

### Actions

Recommended primary action:

1. Open original search.

Recommended secondary actions:

1. Reuse query in Search mode.
2. Copy query.
3. Copy target URL.
4. Re-resolve with current settings.
5. Remove from History.

Open original search must use the stored `targetUrls` so the action replicates the original execution. For fanout searches, reuse the existing relay/fanout model where possible.

Reuse query should navigate to Search mode with the raw query prefilled, such as `/search?q=...`, without executing automatically.

Re-resolve with current settings is useful, but it should not be the primary action because the user expectation is to replicate the original search.

### Empty States

If history is empty and recording is enabled, explain that executed Whiz searches will appear after they are run.

If recording is off, explain that off-the-record mode is preventing new history records.

## Journal Mode

Journal mode is the focused place to review search activity as a time-based journal.

### Default Presentation

When the textarea is empty, show grouped summaries rather than a raw event list.

Recommended grouping:

- Today.
- Yesterday.
- Recent days in the current week.
- Older weeks in the current month.
- Previous months in the current year.
- Previous years.

The exact grouping can adapt as history grows, but the first screen should communicate time periods and activity summaries rather than every event.

Example:

```text
Today
  18 searches - Svelte, IndexedDB, service worker
  Unique: first search for BroadcastChannel this month
  Common targets: google.com, github.com, developer.mozilla.org

Yesterday
  9 searches - browser history, Kagi, local storage
  Pattern: 4 searches refined "personal search history"

This Week
  64 searches - Whiz, bangs, launch shortcuts
```

Group rows should be expandable to show representative searches, all searches in the group, and manual journal entries for that period.

### Summary Signals

Journal V1 should use deterministic local signals.

Useful signals include:

- Total search count.
- Unique query count.
- Repeated exact queries.
- Repeated normalized terms.
- First-time target hosts.
- First-time bang codes.
- Common target hosts.
- Common bang targets.
- Query refinement chains, such as several searches sharing most terms in a short time window.
- Bursts of activity separated by idle gaps.
- Long or unusual queries.
- Fanout searches.

The Journal should avoid pretending deterministic heuristics are human-quality conclusions. Labels such as `Common`, `Repeated`, `First seen`, `Related searches`, and `Activity burst` are safer than overconfident interpretations.

AI-generated summaries may be explored later, but the local deterministic view should be useful without accounts, network calls, or model access.

### Manual Entries

Journal mode supports manual markdown entries.

V1 editor behavior:

- Create an entry for today.
- Create an entry for a selected day or group.
- Edit an existing entry.
- Delete an existing entry.

Manual entry rows should be visually distinct from search-derived rows. They should be included in Journal search/filter results but excluded from History mode entirely.

### Filtering

Typing in Journal mode filters:

- Group labels.
- Summary text.
- Raw search queries inside groups.
- Target hosts.
- Bang names and codes.
- Manual journal entry markdown text.

Filtering can reveal matching child rows under a period group even if that group was collapsed before filtering.

### Actions

Recommended group actions:

1. Expand or collapse group.
2. Show all searches in group.
3. Add journal entry for group date or period.

Recommended history-event actions inside Journal:

1. Open original search.
2. Reuse query in Search mode.
3. Remove from History.

Recommended manual-entry actions:

1. Edit entry.
2. Delete entry.

## Ranking And Frecency

The history store should eventually contribute shared ranking signals across the launcher.

Possible future uses:

- Boost frequently reused bangs.
- Suggest recent matching searches in Search mode.
- Rank modes or actions based on past use.
- Surface "search again" rows when the current query resembles a prior query.

This should be opt-in at the plugin/ranking layer and should respect history recording settings. If recording is off, new ranking signals should stop accumulating, but existing history-derived ranking data should not be silently deleted.

## Implementation Phases

### Phase 1: Storage And Capture

- Add `searchHistory` IndexedDB storage.
- Add read, write, delete-one, and list functions.
- Add history recording settings, defaulting to enabled.
- Add off-the-record behavior that prevents writes.
- Capture launcher provider searches.
- Capture launcher bang executions.
- Capture `/go?q=...` page executions.
- Capture service-worker `/go?q=...` fast-path redirects where possible.
- Store final target URLs so original searches can be replayed.

### Phase 2: History Mode

- Add `/history`.
- Add History mode metadata.
- Render reverse-chronological history events.
- Support filtering.
- Support open original search.
- Support reuse query in Search mode.
- Support copy query and copy URL where practical.
- Support remove one history item.

### Phase 3: Journal Data And Manual Entries

- Add `journalEntries` IndexedDB storage.
- Add create, update, delete, and list functions.
- Add sanitized markdown rendering.
- Add manual entry editor for today or a selected period.

### Phase 4: Journal Mode

- Add `/journal`.
- Add Journal mode metadata.
- Render grouped summaries by day, week, month, and year.
- Include manual entries only in Journal.
- Support deterministic summary signals.
- Support filtering across summaries, underlying searches, and manual entries.
- Support removing individual search history events from Journal.

### Phase 5: Cross-Mode Signals

- Add optional history-derived frecency signals.
- Consider recent matching searches in Search mode.
- Consider `Everything` exposure for recent searches and Journal periods.
- Consider import/export, retention controls, and bulk deletion.

## Acceptance Criteria

- Executing a search from Search mode creates one history event when recording is enabled.
- Executing a bang search from Search mode creates one history event with the raw query and final target URL or URLs.
- Executing `/go?q=...` from the omnibar creates one history event when recording is enabled.
- Typing in the launcher without executing does not create a history event.
- Typing in History or Journal filters does not create a history event.
- Turning off history recording prevents new history events.
- History mode shows duplicate identical searches as separate events.
- History mode can filter by query text.
- History mode can open the original stored target URL or URLs.
- History mode can remove one item.
- Removing a history item makes it disappear from History and from Journal-derived summaries.
- Journal mode can show grouped summaries derived from history.
- Journal mode can create and render a markdown manual entry.
- Manual journal entries do not appear in History mode.

## Open Questions

- Should V1 use a finite local cap, such as the most recent 10,000 events, or keep all local history until the user deletes it?
- Should replaying a History item create a new history event, or should replays be excluded to avoid immediate duplicates?
- Should custom search templates be stored in history events, or is the final target URL plus label enough?
- Should Journal V1 include an explicit "activity burst" grouping, or keep burst detection as a summary label inside normal date groups?
- Should off-the-record be only a persistent setting in V1, or should Search mode also expose a one-shot "execute without recording" action?
