# Shipped Catalog Assets

## Goals

- Make shipped provider catalogs the normal default catalog, not a temporary top-1000 bootstrap.
- Simplify catalog loading by removing runtime source download, generation, and non-user IndexedDB persistence.
- Keep large catalog data out of the initial JavaScript bundle.
- Use Vite content-hashed JSON assets so unchanged catalogs remain browser/CDN cached across deploys.
- Preserve locally persisted user-owned bangs.
- Keep normal search and provider-forwarded bangs usable if local catalog loading fails.
- Reduce the default shipped catalog transfer, parse, and memory cost while keeping long-tail bangs available.

## Non-Goals

- No production runtime refresh from upstream bang sources.
- No client-side catalog generation in production.
- No IndexedDB cache for shipped provider catalogs.
- No stale-catalog reminder UX.
- No tag removal or tag schema changes as part of catalog size reduction.
- No user-facing provider choices beyond Kagi and DuckDuckGo.

## Generated Catalogs

The filenames intentionally keep the `zbang` prefix because these files are zbang-format catalogs consumed by Whiz, not
provider-native Kagi or DuckDuckGo bang files.

Provider catalogs should be generated into a source-controlled top-level catalog directory.

Stage 1 shipped one full catalog per provider:

```text
catalogs/zbang.catalog.kagi.json
catalogs/zbang.catalog.duckduckgo.json
```

Stage 2 should split each provider catalog into default popular records and on-demand extended records:

```text
catalogs/zbang.catalog.kagi.popular.json
catalogs/zbang.catalog.kagi.extended.json
catalogs/zbang.catalog.duckduckgo.popular.json
catalogs/zbang.catalog.duckduckgo.extended.json
```

The split definitions are:

- `popular`: records with `popularity > 0`
- `extended`: records with `popularity === 0`

For Kagi, split after Kagi-specific popularity boosts are applied so boosted Kagi-native bangs remain in the popular catalog. Do not duplicate popular records in the extended catalog. Runtime "full" catalog behavior is the combination of popular plus extended records in memory.

Add a short README in `catalogs/` explaining that catalog JSON files are generated artifacts and should not be edited by hand.

Resolve catalog asset URLs with relative `new URL(..., import.meta.url)` imports from the shared shipped-catalog loader:

```ts
const CATALOG_URLS = {
	duckduckgo: {
		popular: new URL('../../catalogs/zbang.catalog.duckduckgo.popular.json', import.meta.url).href,
		extended: new URL('../../catalogs/zbang.catalog.duckduckgo.extended.json', import.meta.url).href
	},
	kagi: {
		popular: new URL('../../catalogs/zbang.catalog.kagi.popular.json', import.meta.url).href,
		extended: new URL('../../catalogs/zbang.catalog.kagi.extended.json', import.meta.url).href
	}
};
```

Do not use `$catalogs` or another SvelteKit/Vite alias for these catalog imports. The shipped-catalog loader is also imported by the service worker, and aliases that work in app code can fail or become ambiguous in service-worker bundling. Relative `new URL(..., import.meta.url)` keeps the catalogs statically discoverable by Vite so production builds emit content-hashed immutable JSON assets, while staying compatible with the service worker.

A nested path like `generated/catalogs/` can be introduced later if the project grows several generated artifact categories. Starting with `catalogs/` keeps the generated artifacts easy to find, and tools/editors already make the generated nature clear through the README and generator workflow.

## Runtime Model

The launcher should load the selected provider's popular catalog on mount. Extended catalogs are lazy-loaded and session-only.

Loading flow:

1. Resolve the selected bang provider and catalog variant to a catalog asset URL.
2. Fetch the JSON asset lazily from that URL.
3. Validate the response shape and provider identity.
4. Use the catalog in memory.
5. If loading or validation fails, clear provider catalog state for the selected provider and log the failure. This disables local provider bang matching for that provider until the user changes provider or reloads.
6. If no local provider catalog is available, keep normal search usable and forward bang-like queries to the configured provider/search fallback instead of handling them locally. User-owned `myBangs` remain available if they loaded successfully.

The first implementation should load on mount for simplicity. Further optimization can delay loading until bang functionality is first needed if startup performance requires it.

Known acceptable tradeoff: persisted settings initialize in `onMount`, while the launcher catalog effect can start from the default `kagi` setting. A user with a persisted non-default bang provider may briefly download the default Kagi catalog before the selected provider catalog. This can be optimized later with a settings initialization flag if first-load network behavior becomes important.

Stage 2 runtime behavior:

- `loadShippedBangCatalog(provider)` should keep returning the selected provider's popular catalog by default.
- `loadShippedBangCatalog(provider, 'popular')` should load only the popular catalog.
- `loadShippedBangCatalog(provider, 'extended')` should load only the extended catalog.
- Code that needs full coverage should combine popular plus extended records and rank the combined list.
- Loaded catalog promises/results should be cached per provider and variant for the current page or service-worker lifetime to avoid repeated fetch and parse work.
- The bang picker and bang mode should always show separate provider groups for popular and extended bangs.
- The extended group should be visible before the extended catalog is loaded, but it should contain a load action/status instead of bang records.
- Selecting the extended load action should load extended bangs only for the current session and should not change settings.
- Launcher direct bang execution, `/go`, and service-worker `/go` handling should automatically load extended bangs and retry resolution when popular bangs leave bang-looking tokens unresolved.
- If extended loading fails during execution fallback, normal search and provider-forwarded bang fallback should remain usable.

## Persistence Model

Keep local persistence only for user-owned data:

- `myBangs`

Remove local persistence for generated/provider data:

- downloaded bang source text
- generated provider catalogs
- source statuses
- catalog statuses
- stale catalog reminder state, if only used for runtime refresh prompts

Browser HTTP cache and Vercel CDN cache are responsible for shipped catalog caching.

## Catalog Generation CLI

Replace the client-side refresh/generation page with a manual CLI workflow.

The CLI should:

1. Download upstream provider source files directly from Node.
2. Generate provider-native final catalogs using the existing normalization, ranking, and dedupe rules.
3. Split each generated provider catalog into popular and extended variants.
4. Validate generated catalogs before writing them.
5. Write final JSON files into `catalogs/`.
6. Print source hashes, record counts, dedupe counts, output byte sizes, and output paths.

Suggested package script:

```json
{
	"scripts": {
		"generate:catalogs": "node scripts/generate-catalogs.ts && prettier --write catalogs/*.json"
	}
}
```

Recent Node versions can run TypeScript files directly when the script only uses erasable type syntax. Keep the script Node-compatible and avoid TypeScript features that require transpilation, such as enums, namespaces, and parameter properties. If Node execution becomes awkward, add a dedicated runner later rather than preemptively adding one.

Catalog generation is manual only. Generated catalog changes should be reviewed and committed like other source changes.

Generated catalog artifacts should be deterministic when upstream source content is unchanged. Do not include generation-time timestamps such as top-level `generatedAt` or per-source `fetchedAt` in shipped catalog JSON. Source URLs and hashes are enough to identify the upstream inputs, and Git history records when the generated artifact changed.

`generatorVersion` tracks the generated catalog schema and generation semantics. Bump it when output shape, normalization, ranking, or dedupe behavior changes.

## JSON Formatting

Prefer readable pretty JSON initially. Readable diffs help review catalog generation changes and provider-data churn.

The generator should run Prettier after writing catalog JSON so `npm run generate:catalogs` does not leave formatting-only diffs.

Minified JSON may be reconsidered later if repository size or uncompressed asset size becomes a problem. In production, compression should reduce the transfer-size penalty of pretty JSON.

## Validation

Catalog validation should be shared by the CLI and runtime loader where practical.

Validate at minimum:

- top-level value is an object
- `provider` matches the requested provider
- `generatorVersion` is a number
- `sources` is an array
- `items` is an array
- each item has a non-negative numeric `popularity`
- each item has a non-empty string `name`
- each item has a non-empty string-array `code`
- each item has a string-array `tags`
- each item has a string `urls.s`

Validation can be lightweight handwritten TypeScript. Do not add a schema library unless the handwritten validator becomes hard to maintain.

## Settings UX Changes

Remove production settings UI for:

- downloading bang source files
- refreshing bang data from upstream sources
- client-side catalog generation
- source/catalog status tables that only support runtime refresh
- stale catalog notifications and reminder snoozing
- dev bootstrap generation links, once replaced by the CLI

Keep settings for:

- selected bang provider
- selected search provider
- any user-owned bang management controls

Shipped catalog artifacts intentionally omit `generatedAt`; stale catalog age should no longer drive user-facing reminders.

Stage 2 should keep the provider setting user-facing as Kagi or DuckDuckGo only. Popular and extended are implementation variants, not separate providers.

Defer a persistent "always load extended bangs" setting unless actual usage shows it is needed. If added later, model it as a behavior setting such as `Extended bangs: On demand / Always load`, not as additional provider catalog choices.

## Bang Picker UX

The bang picker and bang mode should present provider records as separate groups:

- `My bangs`
- `Popular Kagi bangs` or `Popular DuckDuckGo bangs`
- `Extended Kagi bangs` or `Extended DuckDuckGo bangs`

The extended group should always be visible when bang groups are visible.

Before the extended catalog is loaded, the extended group should show one action row:

```text
Load extended Kagi bangs
```

While loading, show a status row such as:

```text
Loading extended Kagi bangs
```

If loading fails, show a retryable failure row such as:

```text
Could not load extended Kagi bangs
```

After the extended catalog loads, the extended group should behave like a normal filtered provider group using only extended records. Popular and extended results should not be merged in the picker; keeping them separate makes the default catalog boundary visible and prevents long-tail results from burying high-confidence popular results.

The extended group load state is session-only. Reloading the app returns to popular-only provider records until the user loads extended bangs again, except for automatic execution fallback.

## Current Progress

Stage 1 completed:

- Extracted browser-independent catalog generation into `src/lib/bang-catalog.ts`.
- Added `scripts/generate-catalogs.ts` and `npm run generate:catalogs`.
- Added source-controlled generated catalogs in `catalogs/`.
- Added `catalogs/README.md`.
- Made generated catalog output deterministic for unchanged source hashes.
- Used service-worker-compatible relative `new URL(..., import.meta.url)` catalog asset imports.
- Added Vite dev-server allow-listing for top-level catalog assets.
- Switched launcher loading to `?url` fetched shipped catalogs.
- Added runtime shipped-catalog validation and graceful failure handling.
- Removed launcher stale-catalog reminders.
- Removed obsolete dev bootstrap generation route and bootstrap JSON artifacts.
- Removed settings refresh UI and stale reminder settings state.
- Removed runtime source refresh, source API route, and non-user IndexedDB stores.
- Removed transitional generated/fetched timestamp fields from catalog generation types.

Stage 1 remaining:

- Superseded by Stage 2 popular/extended network verification.

Stage 2 completed:

- Updated catalog generation types and CLI output mapping for popular and extended variants.
- Split generated catalogs by `popularity > 0` and `popularity === 0` after provider-specific normalization, Kagi boosts, dedupe, and sorting.
- Bumped `generatorVersion` to `4`, regenerated the four catalog files, and removed duplicated full-catalog artifacts.
- Updated the shipped catalog loader to support provider plus variant URLs and per-variant caching.
- Updated launcher bang state to load popular by default and show `My`, `Popular provider`, and `Extended provider` groups.
- Added extended group load, loading, error, and retry rows without making extended load persistent.
- Updated launcher bang execution to retry with extended records when unresolved bang tokens remain.
- Updated `/go` and service-worker `/go` resolution to use the same popular-first, extended-retry behavior.
- Verified split definitions, generated asset sizes, type checking, and production build output.

Stage 2 remaining:

- Verify in a browser/network trace that initial runtime fetches only the selected provider's popular catalog and that extended fetches happen only after explicit picker load or execution fallback.

## API and Store Cleanup

Removed app routes and stores that existed only for runtime source refresh or non-user catalog persistence:

- `/api/bang-sources/[id]`, if no other production code needs it
- `bangSources` IndexedDB store
- `bangCatalogs` IndexedDB store
- `readBangCatalog`
- `readBangCatalogStatuses`
- `refreshBangData`
- provider catalog writes
- source writes

`myBangs` persistence remains in `src/lib/bang-data.ts`. Moving it into a smaller user-data persistence module is optional and deferred unless the current compatibility re-export module becomes confusing.

The IndexedDB schema was bumped to delete legacy non-user stores for existing browsers while preserving `myBangs`.

## Cache Verification

After deployment, verify headers for emitted catalog assets under Vite/SvelteKit immutable asset paths, such as `/_app/immutable/...`.

Expected cache direction:

```text
cache-control: public, max-age=31536000, immutable
```

Document any Vercel-specific findings if the headers differ.

Vercel deployment verification for `https://zz.leftium.com/`:

- Catalog JSON assets are served from `/_app/immutable/assets/`.
- Catalog assets return `cache-control: public, immutable, max-age=31536000`.
- Catalog assets return `content-type: application/json; charset=utf-8`.
- Root HTML returns `cache-control: public, max-age=0, must-revalidate` and does not contain direct catalog asset links.
- The launcher chunk contains catalog asset URL strings generated by Vite `new URL(..., import.meta.url).href`.

## Performance Verification

Compare before and after the refactor:

- initial JavaScript bundle size
- emitted catalog asset sizes
- whether only the selected provider catalog is downloaded on first mount
- launcher startup behavior
- time until local bang autocomplete is usable
- behavior when catalog fetch fails

Local build observations after the popular/extended split:

- `pnpm build` emits all four catalogs as Vite content-hashed JSON assets under `_app/immutable/assets/`.
- DuckDuckGo popular catalog asset: about 577 KB raw, 104 KB gzip, 80 KB Brotli.
- DuckDuckGo extended catalog asset: about 1.82 MB raw, 303 KB gzip, 237 KB Brotli.
- Kagi popular catalog asset: about 612 KB raw, 101 KB gzip, 79 KB Brotli.
- Kagi extended catalog asset: about 1.66 MB raw, 267 KB gzip, 211 KB Brotli.
- The launcher and service-worker builds resolve catalog asset URL strings, not the JSON catalog payloads.
- Browser/network verification should confirm whether SvelteKit or browser preload behavior fetches only the selected provider's popular catalog on mount, and only fetches extended catalogs after explicit picker load or execution fallback.

## Suggested Sequence

1. Extract catalog generation into browser-independent functions while preserving existing runtime behavior. Done.
2. Add the manual CLI generator. Done.
3. Generate full catalog files into `catalogs/`. Done.
4. Add service-worker-compatible relative catalog asset imports. Done.
5. Switch launcher loading to `?url` fetched catalogs on mount. Done.
6. Add runtime catalog validation and graceful failure handling. Done.
7. Remove runtime source refresh, stale reminders, and settings refresh UI. Done.
8. Remove non-user IndexedDB stores and APIs. Done.
9. Verify build output and deployed asset cache headers.
10. Split shipped provider catalogs into popular and extended variants. Done.
11. Add separate popular and extended bang groups, with manual extended loading in the picker. Done.
12. Add automatic extended retry for direct bang execution. Done.
13. Verify network behavior, cache headers, catalog sizes, parse time, and heap impact for the split assets.
