# Provider-Native Bang Data

## Goal

Support separate bang and search providers without shipping the full bang database in the initial JavaScript bundle.

Users should be able to choose:

- Bang provider: which catalog/semantics define `!foo`
- Search provider: which search engine handles normal searches and search-backed bangs

Initial scope:

- Bang providers: Kagi, DuckDuckGo
- Search providers: Kagi, DuckDuckGo, Brave, Google
- Brave as a bang provider is deferred because its public bang data lacks URL templates.

## Current Behavior

The existing `bang-tools` merge step produces one `zbangs.json` file.

That file is primarily Kagi data:

- `name` from Kagi `s`
- `code` from Kagi `t` and `ts`
- `tags` from Kagi `c` and `sc`
- `urls.s` from Kagi `u`

DuckDuckGo data is only used for popularity/rank signals:

- DDG `r` may be used as internal generation metadata when the primary trigger matches and appears compatible
- DDG `u` is used for domain comparison to avoid copying rank across obvious trigger collisions
- DDG names, categories, aliases, URL templates, and DDG-only bangs are not included

Kagi relative URLs are currently normalized to `http://bang-provider/...`. This should be replaced for the new model.

## Proposed Data Flow

Move bang data generation into the SvelteKit client instead of the existing oclif CLI.

At runtime, the client can:

1. Download source bang files from the same URLs used by the current `bang-tools download` command.
2. Normalize provider-specific catalogs.
3. Add rank data.
4. Persist generated data locally.
5. Refresh data without rebuilding or redeploying the app.

Source URLs:

- DDG: `https://duckduckgo.com/bang.js`
- Kagi shared data: `https://github.com/kagisearch/bangs/raw/refs/heads/main/data/bangs.json`
- Kagi Kagi-specific data: `https://github.com/kagisearch/bangs/raw/refs/heads/main/data/kagi_bangs.json`

The first implementation attempted direct browser downloads, but browser testing showed CORS failures for the source URLs. Source downloads now go through a SvelteKit same-origin route that fetches the upstream files server-side and returns them to the client.

The settings UI exposes one manual refresh flow. Refreshing bang data downloads the source files, persists the raw source text, generates provider-native Kagi and DuckDuckGo catalogs from those sources, and persists the generated catalogs. There is intentionally no separate public “generate from existing sources” action in the initial implementation.

Generate separate provider-native catalogs:

- `zbang.kagi.json`
- `zbang.duckduckgo.json`

Do not merge Kagi and DDG semantics into a single catalog.

DDG should be normalized before Kagi rank inheritance runs. The normalized DDG catalog can serve two purposes:

- Final `zbang.duckduckgo.json` provider-native output
- Conservative rank lookup input for Kagi records

## Static Bootstrap Data

Superseded by `specs/shipped-catalog-assets.md`: the app now ships full provider catalog assets in `catalogs/`, and the old dev bootstrap route/files have been removed.

## Provider-Native Catalogs

### Kagi

Kagi source data remains the source of truth for Kagi bang semantics.

Normalize Kagi records to the existing zbang-like shape:

```json
{
	"provider": "kagi",
	"generatedAt": "2026-06-17T00:00:00.000Z",
	"generatorVersion": 1,
	"items": [
		{
			"rank": 1,
			"name": "Google",
			"code": ["!g", "!google"],
			"tags": [],
			"urls": {
				"s": "https://google.com/search?q=%s"
			}
		}
	]
}
```

The provider is catalog-level metadata and should not be repeated on every item.

Prefer preserving the existing zbang-shaped item fields and avoid adding source-specific per-item fields unless they are needed by runtime behavior.

Kagi relative URLs should become concrete Kagi URLs:

```text
/search?q=%s -> https://kagi.com/search?q=%s
/images?q=%s -> https://kagi.com/images?q=%s
/assistant?q=%s -> https://kagi.com/assistant?q=%s
```

Do not emit `http://bang-provider/...` in final generated data.

Kagi records may still inherit DDG rank when any Kagi trigger or alias has a compatible DDG match.

Kagi rank inheritance should use normalized DDG data, but it should not import DDG semantics into Kagi records.

Rank lookup should consider all Kagi triggers for a record, including the primary trigger and aliases. For each matching DDG trigger, use the best compatible DDG rank available from normalized DDG data.

Prefer the highest compatible DDG rank. Do not prioritize primary-trigger matches over alias matches unless a future source provides explicit alias quality metadata. Kagi continues inheriting DDG rank in provider-native mode.

Only inherit a candidate rank when the URL/domain comparison indicates the Kagi and DDG records likely represent the same target or compatible generic search behavior.

Current Kagi-side deduplication already picks the highest DDG-derived rank among Kagi records that normalize to the same URL. Normalizing DDG first adds coverage for cases where the best DDG rank is attached to a DDG sibling/duplicate/alias that the current primary-trigger lookup would otherwise miss.

Provider-local deduplication should be URL-identity based for both Kagi and DDG:

- Group records when their URL templates normalize to the same value.
- Use the highest rank from the group.
- Merge trigger codes from the group.
- Keep the best canonical display name from the group.
- Keep the union of category/search tags from the group.
- Do not merge records based only on similar names, similar categories, or shared domains.

This is close to the current Kagi dedupe behavior: the grouping rule is conservative, while the aliases/rank/tags are combined only after URL identity has established that the records share a target.

URL fragments are part of URL identity. Some providers encode behavior in fragments, such as Google Translate language pairs in `#source/target/query`, so stripping fragments would incorrectly merge distinct bang targets.

URL identity is normalized for comparison only. Generated JSON should keep the selected source URL casing, but dedupe comparisons should trim and deeply unescape URL templates, strip a leading `www.` hostname, and lowercase the comparison key. When duplicate URL identities merge, keep the shortest source URL, preferring `https` over `http`.

### DuckDuckGo

DuckDuckGo source data is the source of truth for DDG bang semantics.

Normalize DDG records independently:

```json
{
	"provider": "duckduckgo",
	"generatedAt": "2026-06-17T00:00:00.000Z",
	"generatorVersion": 1,
	"items": [
		{
			"rank": 1,
			"name": "Google",
			"code": ["!g"],
			"tags": ["Online Services/Search"],
			"urls": {
				"s": "https://google.com/search?q=%s"
			}
		}
	]
}
```

DDG records use DDG rank directly to assign emitted `rank` values.

DDG records should not be enhanced with Kagi names, aliases, or URL semantics in provider-native mode.

DDG deduplication should use the same URL-identity grouping rule. It should not perform fuzzy/name/domain-only merging that would make DDG provider-native behavior diverge from DDG's source catalog.

### Brave

Brave is supported as a search provider, not initially as a bang provider.

Reason: Brave's public `/bangs` page embeds a list of bang rows, but the data appears limited to:

```ts
type BraveBangRow = [trigger: string, faviconUrl: string, name: string];
```

It does not include URL templates, so Brave bangs cannot be locally resolved, deduplicated reliably, or adapted to another search provider.

If Brave bang provider support is added later, it should be clearly modeled as delegated execution:

```text
!gh zbang -> https://search.brave.com/search?q=!gh%20zbang
```

## Search Provider Adaptation

The selected search provider applies to:

- Plain non-bang searches
- Recognized generic search URLs inside Kagi/DDG bang catalogs

The selected search provider should not rewrite direct target-site URLs.

Examples of adaptable Kagi URLs:

```text
https://kagi.com/search?q=%s+site:reddit.com
https://kagi.com/images?q=%s
https://kagi.com/news?q=%s
https://kagi.com/videos?q=%s
https://kagi.com/maps?q=%s
```

Examples of adaptable DDG URLs:

```text
https://duckduckgo.com/?q=%s+site:reddit.com
https://duckduckgo.com/?ia=images&iax=images&q=%s
https://duckduckgo.com/?ia=news&iar=news&q=%s
https://duckduckgo.com/?ia=videos&iar=videos&iax=videos&q=%s
https://duckduckgo.com/?iaxm=maps&q=%s
```

Examples that should remain direct:

```text
https://github.com/search?q=%s
https://en.wikipedia.org/wiki/Special:Search?search=%s
https://kagi.com/assistant?q=%s
https://kagi.com/fastgpt?query=%s
https://translate.kagi.com/?text=%s
```

Keep the adaptation logic grouped by search provider rather than encoding template kinds into every bang record.

## Runtime Resolution

For a user query:

1. Parse the bang trigger and search text.
2. Load the selected bang provider catalog.
3. Find the matching provider-native bang record.
4. Fill the record's URL template with the query.
5. If the filled URL is a recognized generic Kagi/DDG search URL, adapt it to the selected search provider.
6. Otherwise, navigate to the filled direct URL.

Example:

```text
Bang provider: Kagi
Search provider: Google
Query: !r svelte stores
Kagi template: https://kagi.com/search?q=%s+site:reddit.com
Final URL: https://www.google.com/search?q=svelte%20stores%20site%3Areddit.com
```

Example:

```text
Bang provider: DuckDuckGo
Search provider: Brave
Query: !gh zbang
DDG template: https://github.com/search?q=%s
Final URL: https://github.com/search?q=zbang
```

The search provider is not involved because GitHub is a direct target URL.

Generated catalog items should be sorted by `rank`, with lower numeric ranks first.

## Persistence

Persist generated catalogs in browser storage so updates do not require redeploying.

Likely storage options:

- IndexedDB for full generated catalogs
- LocalStorage only for small metadata such as version, timestamp, selected providers, and refresh status

Persist enough metadata to decide when to refresh:

- Source URL
- Fetch timestamp
- Source content hash if available
- Source bang record count when the source shape supports it
- Generator version
- Catalog provider
- Record count

Refreshes are manual. The UI may show a notification when generated data is very old, but it should not automatically replace local catalogs without user action.

Full generated catalogs should be exportable during development/debugging. Production support can be added later if a concrete user-facing need appears.

Catalog-level shape:

```ts
type ZbangCatalog = {
	provider: 'kagi' | 'duckduckgo';
	generatedAt: string;
	generatorVersion: number;
	sources: Array<{
		url: string;
		fetchedAt: string;
		hash?: string;
	}>;
	items: Zbang[];
};

type Zbang = {
	rank: number;
	name: string;
	code: string[];
	tags: string[];
	urls: {
		s: string;
	};
};
```

## Migration Decisions

- Do not keep a compatibility `zbangs.json` file during migration. The implementation is expected to start from a fresh SvelteKit template.
- The special bootstrap route is only needed during development.
- Source downloads use the same-origin SvelteKit route because direct browser fetches hit CORS errors for the initial DDG and Kagi source URLs.
- Parsing and normalization are triggered by the same manual refresh action as source downloads to keep the local-data model simple.
- Kagi inherits DDG rank using the compatibility rules described above.
- Generated catalogs are sorted by `rank`.
- Refresh is manual, with optional stale-data notification later.
- Full generated catalog export is useful for development/debugging and can remain dev-only initially.

## Suggestions

- Start with Kagi and DDG as first-class bang providers only.
- Support Kagi, DDG, Brave, and Google as search providers.
- Keep source-native URL templates in generated records.
- Remove `bang-provider` from final data.
- Adapt only recognized Kagi/DDG generic search URLs at resolution time.
- Keep Brave bang provider support out of the first pass unless users request it.
- Start with empty bootstrap data, then generate bootstrap files from persisted app-generated catalogs through a special route.
