# Omnibar Bang Execution

## Purpose

Allow zbang to be configured as a browser default search engine so searches from the browser omnibar can execute bangs as close as practical to the in-app client-side behavior.

The default search engine URL should target a dedicated execution route instead of the launcher route:

```text
https://zbang.example.com/go?q=%s
```

`/?q=...` should remain suitable for launcher prefill and share links. `/go?q=...` should execute.

## Conclusions

- Server-side bang processing is not required for omnibar support.
- Unduck supports default-search integration with a static client-side app: it reads `?q=...`, resolves a bundled bang catalog in browser JavaScript, then calls `window.location.replace(...)`.
- Server-side redirects can be faster because the browser can receive an immediate HTTP redirect instead of loading app JavaScript, initializing state, reading browser storage, and then navigating.
- Server-side redirects are not a good primary design for zbang while custom bangs remain private, local, and stored in browser-only storage.
- Cookies are a last-resort bridge for small resolver snapshots, not the preferred durable storage for private custom bangs.
- Epicenter workspace/cloud sync may eventually enable authenticated server-side resolution, but it should not block the first omnibar implementation.

## Implementation Status

Implemented in `4a5ad46 feat: support omnibar bang execution`:

- Added `/go?q=...` as the browser default-search execution route.
- Added `/go` setup/help UI when no query is present.
- Added the same default-search setup UI to `/settings`.
- Added OpenSearch discovery via `/opensearch.xml` and `<link rel="search" ...>` in `app.html`.
- Extracted shared search and bang URL resolution helpers for launcher and `/go` usage.
- Preserved local custom bang precedence over provider catalog bangs.
- Preserved configured fallback search provider and custom search template handling.
- Kept `/` and `/?q=...` launcher prefill/share behavior unchanged.
- Kept `/go` as a normal client page, with no service-worker dependency.
- Minimized the visible `/go?q=...` intermediate page while the redirect is resolving.

Not yet implemented:

- Service-worker fast path for redirecting before the `/go` page renders.
- IndexedDB mirror for execution-critical settings needed by a service worker.
- Multi-target or multi-tab omnibar fanout behavior.
- Server-side authenticated resolver backed by synced private config.

## Goals

- Support setting zbang as a browser default search engine.
- Preserve local custom bangs as a required part of omnibar execution.
- Preserve the user's configured fallback search engine.
- Keep custom bang configuration private and user-specific.
- Target one automatic destination for the first implementation.
- Keep the design compatible with a later service-worker fast path, without requiring it.
- Keep the resolver logic shared with the launcher where practical.

## Non-Goals

- Do not require accounts, cloud sync, or Epicenter for the first implementation.
- Do not require cookies for the first implementation.
- Do not require a service worker for the first implementation.
- Do not make server-side resolution authoritative for private local bangs.
- Do not attempt reliable multi-tab fanout in the first implementation.
- Do not change `/` share/prefill semantics just to support omnibar execution.

## Execution Model

The first implementation adds a `/go` route that accepts `q`:

```text
/go?q=search%20terms%20!bang
```

The route resolves the query and navigates with `location.replace(targetUrl)`.

Resolution should use:

- `myBangs` before provider catalog bangs.
- The selected bang provider catalog as fallback for non-custom bangs.
- The configured search provider for normal search and unknown forwarded bangs.
- The configured custom search template when the selected search provider is custom.

If no query is present, `/go` shows a setup/help page rather than redirecting.

If the query has no bang tokens, `/go` skips custom bang and provider catalog loading and immediately redirects to the configured fallback search URL. If reading custom bangs from IndexedDB fails, `/go` treats the custom bang list as empty and continues with provider catalog or fallback search resolution.

The normal `/go` page is the required implementation. A service worker may be added later as an optimization, but the page route should not depend on service-worker installation or activation.

## Single-Target Scope

The first supported omnibar behavior should produce one final navigation.

If a query contains multiple local bang targets, the implementation should pick one deterministic target rather than opening multiple tabs. The initial target selection should favor the same ordering already used by zbang's bang composition model:

1. User-owned bangs before provider bangs.
2. The first matching bang token in the query.
3. The first URL target for that bang.

The resolver may still return a structured result that includes all parsed targets so multi-target behavior can be explored later without changing the parser again.

## Multiple-Bang Follow-Up

After single-bang omnibar execution works, test whether multiple bang targets can be opened in new tabs when the zbang origin has previously been granted popup permission by the browser.

Expected constraints:

- A direct navigation or service-worker redirect can only produce one final page.
- Service workers should not be considered a reliable multi-tab mechanism. `clients.openWindow(...)` requires transient activation from an existing same-origin window and is not a dependable option for a `/go` navigation intercepted by a fetch handler.
- Automatic `window.open(...)` calls after asynchronous IndexedDB or catalog loading may still be blocked by popup blockers.
- Browser behavior may vary by engine and permission state.

Possible follow-up designs:

- A fanout page that lists all resolved targets and offers one explicit user gesture to open them.
- A best-effort multi-open mode that only runs after detecting or documenting the required browser permission.
- A browser extension if reliable multi-tab execution becomes a hard requirement.

## Storage Requirements

Current custom bangs are stored in IndexedDB, while execution-critical settings are stored in `localStorage`. The first `/go` page implementation can read both stores directly.

A service worker cannot read `localStorage`, so settings needed by `/go` should move or mirror into IndexedDB before adding a service-worker fast path.

Execution-critical persisted state:

- `myBangs`
- `bangProvider`
- `searchProvider`
- `customSearchLabel`
- `customSearchTemplate`

The launcher may keep its Svelte state model, but persistence should flow through a shared storage module that can be used by both the app page and service worker.

## Service-Worker Fast Path

The first implementation should not require a service worker. A normal `/go` page is simpler, works before any service worker is installed, and can support local custom bangs by reading browser storage directly.

The tradeoff is that client-side `/go` costs at least a document request and app/page JavaScript execution before redirecting:

```text
omnibar -> /go?q=... -> page JS -> IndexedDB/localStorage lookup -> location.replace(target)
```

A later performance upgrade may add a service worker that intercepts navigations to `/go` and returns a redirect response after local resolution:

```text
omnibar -> /go?q=... -> service worker -> IndexedDB/cache lookup -> Response.redirect(target)
```

This keeps private custom bangs local while avoiding a full app-page load for repeat visits after service-worker installation.

The page route must remain authoritative and must continue to work for browsers or sessions where the service worker is not installed, not active, disabled, or unable to resolve the query.

Service-worker installation means the browser has loaded a zbang page, run zbang's registration code, downloaded the worker script, installed it, and activated it for the zbang origin. It may not be installed or active when:

- The user has never opened zbang before setting it as the default search engine.
- The user opened zbang but closed the page before registration completed.
- The browser disabled service workers for private browsing, storage restrictions, enterprise policy, or user settings.
- The service worker was updated and is waiting to activate.
- The browser evicted site data or the user cleared browsing data.

Because of those states, `/go` must work as a normal page even without the service worker.

### Service-Worker Updates

If a service-worker fast path is added later, the first update policy should stay simple and browser-native:

- Do not force activation with `skipWaiting()` in the first version.
- Do not auto-reload open zbang pages when a new worker is waiting.
- Let updated workers activate after all currently controlled zbang tabs/windows are closed.
- Keep the `/go` page route correct without relying on the latest worker version.

This avoids update coordination complexity while the worker is only an optional latency optimization. A manual or prompted update flow can be added later if stale service workers become a real problem.

## Default Search Engine Setup

The app supports both manual custom-search setup and browser search-provider discovery.

Manual setup documents this search URL:

```text
https://zbang.example.com/go?q=%s
```

For browser discovery, serve an OpenSearch description XML file and advertise it from app HTML:

```html
<link
	rel="search"
	type="application/opensearchdescription+xml"
	title="zbang"
	href="/opensearch.xml"
/>
```

The OpenSearch document points searches at `/go`:

```xml
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
	<ShortName>zbang</ShortName>
	<Description>Execute zbang searches and bangs</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Url type="text/html" template="https://zbang.example.com/go?q={searchTerms}" />
	<Url
		type="application/opensearchdescription+xml"
		rel="self"
		template="https://zbang.example.com/opensearch.xml"
	/>
</OpenSearchDescription>
```

Browser support and UI vary. Some browsers expose discovered OpenSearch providers directly; others require the user to add a custom search engine manually in settings. The setup page provides copyable instructions for the manual path even when OpenSearch discovery is available.

## Server-Side Role

Server-side `/go` handling may provide a minimal public fallback, but it should not be treated as equivalent to client-side zbang resolution unless private user config is available through an authenticated sync layer.

Server-side resolution is appropriate later if Epicenter or another sync layer provides:

- Authenticated user/session lookup from omnibar requests.
- A fast materialized resolver snapshot per user or workspace.
- Access to the user's selected bang provider and search provider.
- Access to private custom bangs without putting full config in cookies.

Until then, server-side redirects can only safely resolve public/default behavior.

## Privacy Notes

Custom bangs should be considered private and unique per user. Avoid placing full custom bang records in URLs, public server logs, or non-HttpOnly cookies. If cookies are ever used as a bridge, prefer a small resolver-only snapshot and document the size, privacy, and header-overhead tradeoffs.

## Remaining Implementation Plan

1. Test popup-permission behavior for multiple bang targets and document the result before committing to multi-tab support.
2. If redirect latency is a real problem, move or mirror execution-critical settings into IndexedDB through a shared persistence module.
3. Add a service worker fast path for `/go` only after the page route is correct and the IndexedDB settings mirror exists.
4. Keep the `/go` page route authoritative after adding the service worker, so first visit, disabled service workers, stale workers, and resolver failures still work.
