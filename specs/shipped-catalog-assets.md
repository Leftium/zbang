# Shipped Catalog Assets

## Goals

- Make shipped provider catalogs the normal default catalog, not a temporary top-1000 bootstrap.
- Simplify catalog loading by removing runtime source download, generation, and non-user IndexedDB persistence.
- Keep large catalog data out of the initial JavaScript bundle.
- Use Vite content-hashed JSON assets so unchanged catalogs remain browser/CDN cached across deploys.
- Preserve locally persisted user-owned bangs.
- Keep normal search and provider-forwarded bangs usable if local catalog loading fails.

## Non-Goals

- No production runtime refresh from upstream bang sources.
- No client-side catalog generation in production.
- No IndexedDB cache for shipped provider catalogs.
- No stale-catalog reminder UX.
- No semantic changes to Kagi or DuckDuckGo catalog generation unless required by the refactor.

## Generated Catalogs

Final provider catalogs should be generated into a source-controlled top-level catalog directory:

```text
catalogs/zbang.catalog.kagi.json
catalogs/zbang.catalog.duckduckgo.json
```

Add a short README in `catalogs/` explaining that catalog JSON files are generated artifacts and should not be edited by hand.

Use a Vite/SvelteKit alias for app imports. Prefer `$catalogs` because it names the specific generated data the app consumes:

```ts
import kagiCatalogUrl from '$catalogs/zbang.catalog.kagi.json?url';
import duckDuckGoCatalogUrl from '$catalogs/zbang.catalog.duckduckgo.json?url';
```

`$generated` would also be reasonable if future generated assets beyond catalogs are expected soon. For this refactor, `$catalogs` is more explicit and keeps call sites readable.

A nested path like `generated/catalogs/` can be introduced later if the project grows several generated artifact categories. Starting with `catalogs/` keeps the directory and alias aligned, and tools/editors already make the generated nature clear through the README and generator workflow.

## Runtime Model

The launcher should load the selected provider catalog on mount.

Loading flow:

1. Resolve the selected bang provider to its catalog asset URL.
2. Fetch the JSON asset lazily from that URL.
3. Validate the response shape and provider identity.
4. Use the catalog in memory.
5. If loading or validation fails, keep any previously loaded in-memory catalog.
6. If no local catalog is available, keep normal search usable and forward bang-like queries to the configured provider/search fallback instead of handling them locally.

The first implementation should load on mount for simplicity. Further optimization can delay loading until bang functionality is first needed if startup performance requires it.

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
3. Validate generated catalogs before writing them.
4. Write final JSON files into `catalogs/`.
5. Print source hashes, record counts, dedupe counts, output byte sizes, and output paths.

Suggested package script:

```json
{
	"scripts": {
		"generate:catalogs": "node scripts/generate-catalogs.ts"
	}
}
```

Recent Node versions can run TypeScript files directly when the script only uses erasable type syntax. Keep the script Node-compatible and avoid TypeScript features that require transpilation, such as enums, namespaces, and parameter properties. If Node execution becomes awkward, add a dedicated runner later rather than preemptively adding one.

Catalog generation is manual only. Generated catalog changes should be reviewed and committed like other source changes.

## JSON Formatting

Prefer readable pretty JSON initially. Readable diffs help review catalog generation changes and provider-data churn.

Minified JSON may be reconsidered later if repository size or uncompressed asset size becomes a problem. In production, compression should reduce the transfer-size penalty of pretty JSON.

## Validation

Catalog validation should be shared by the CLI and runtime loader where practical.

Validate at minimum:

- top-level value is an object
- `provider` matches the requested provider
- `generatedAt` is a string
- `generatorVersion` is a number
- `sources` is an array
- `items` is an array
- each item has a positive numeric `rank`
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

`generatedAt` remains useful as metadata and diagnostics, but stale catalog age should no longer drive user-facing reminders.

## API and Store Cleanup

Remove app routes and stores that exist only for runtime source refresh or non-user catalog persistence:

- `/api/bang-sources/[id]`, if no other production code needs it
- `bangSources` IndexedDB store
- `bangCatalogs` IndexedDB store
- `readBangCatalog`
- `readBangCatalogStatuses`
- `refreshBangData`
- provider catalog writes
- source writes

Keep or move the `myBangs` persistence code into a smaller user-data persistence module.

## Cache Verification

After deployment, verify headers for emitted catalog assets under Vite/SvelteKit immutable asset paths, such as `/_app/immutable/...`.

Expected cache direction:

```text
cache-control: public, max-age=31536000, immutable
```

Document any Vercel-specific findings if the headers differ.

## Performance Verification

Compare before and after the refactor:

- initial JavaScript bundle size
- emitted catalog asset sizes
- whether only the selected provider catalog is downloaded on first mount
- launcher startup behavior
- time until local bang autocomplete is usable
- behavior when catalog fetch fails

## Suggested Sequence

1. Extract catalog generation into browser-independent functions while preserving existing runtime behavior.
2. Add the manual CLI generator.
3. Generate full catalog files into `catalogs/`.
4. Add the `$catalogs` alias.
5. Switch launcher loading to `?url` fetched catalogs on mount.
6. Add runtime catalog validation and graceful failure handling.
7. Remove runtime source refresh, stale reminders, and settings refresh UI.
8. Remove non-user IndexedDB stores and APIs.
9. Verify build output and deployed asset cache headers.
