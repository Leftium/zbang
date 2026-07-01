# Whiz Omnibar Bang Execution

## Purpose

Allow Whiz to be configured as a browser default search engine so searches from the browser omnibar can execute bangs as close as practical to the in-app client-side behavior.

The default search engine URL should target a dedicated execution route instead of the launcher route:

```text
https://whiz.example.com/go?q=%s
```

`/?q=...` should remain suitable for launcher prefill and share links. `/go?q=...` should execute.

## Conclusions

- Server-side bang processing is not required for omnibar support.
- Unduck supports default-search integration with a static client-side app: it reads `?q=...`, resolves a bundled bang catalog in browser JavaScript, then calls `window.location.replace(...)`.
- Server-side redirects can be faster because the browser can receive an immediate HTTP redirect instead of loading app JavaScript, initializing state, reading browser storage, and then navigating.
- Server-side redirects are not a good primary design for Whiz while MyBangs remain private, local, and stored in browser-only storage.
- Cookies are a last-resort bridge for small resolver snapshots, not the preferred durable storage for private MyBangs.
- Epicenter workspace/cloud sync may eventually enable authenticated server-side resolution, but it should not block the first omnibar implementation.

## Implementation Status

Implemented in `3d0fa1c feat: support omnibar bang execution`:

- Added `/go?q=...` as the browser default-search execution route.
- Added `/go` setup/help UI when no query is present.
- Added the same default-search setup UI to `/settings`.
- Added OpenSearch discovery via `/opensearch.xml` and `<link rel="search" ...>` in `app.html`.
- Extracted shared search and bang URL resolution helpers for launcher and `/go` usage.
- Preserved local MyBang precedence over provider catalog bangs.
- Preserved configured fallback search provider and custom search template handling.
- Kept `/` and `/?q=...` launcher prefill/share behavior unchanged.
- Kept `/go` as a normal client page, with no service-worker dependency.
- Minimized the visible `/go?q=...` intermediate page while the redirect is resolving.

Updated in `6a4b6c0 copy: rename default search setup to Whiz`:

- Renamed user-facing browser setup and OpenSearch copy to Whiz.
- Documented making Whiz the default search engine as an optional setup step.

Implemented in `2ca8cb1 feat: add service worker go redirect`, after
`51ecd3c docs: update omnibar spec for Whiz`:

- Added an IndexedDB mirror for execution-critical settings.
- Kept `localStorage` as the current app settings source of truth during the transition.
- Updated `/go` to read mirrored execution settings with a `localStorage` fallback.
- Added a service worker that intercepts only navigations to `/go?q=...`.
- Added service-worker resolution for normal searches, MyBangs, and provider catalog bangs.
- Falls through to the normal `/go` page when mirrored settings do not exist yet.
- Kept minimal `console.warn` logging for unexpected service-worker resolution failures.
- Preserved normal `/go` page fallback when the service worker is unavailable or cannot resolve.

Implemented in `0c68e36 feat: support omnibar multi-bang fanout`, with fixes in
`75df75b fix: wait for all omnibar bang popups` and
`aa1254e fix: render omnibar fanout targets as links`:

- Added best-effort multi-target fanout from the `/go` page.
- Kept the service-worker redirect path single-target only; if resolver output has multiple target URLs, the worker falls through to the normal `/go` page.
- Added same-origin `/go/open` relay pages so secondary targets can acknowledge opening before redirecting to external URLs.
- Rendered resolved fanout targets as links when popup opening is blocked or cannot be confirmed.

Implemented in `9363e42 feat: add editable MyBangs`:

- Scratch and catalog-derived MyBangs remain stored in IndexedDB and continue to project to execution-compatible bang records.
- Edited MyBang codes, names, and URL templates are honored by both the `/go` page and the service-worker fast path.
- Provider suppression for omnibar execution uses normalized code overlap, matching the `/bang` management UI.

Not yet implemented:

- Server-side authenticated resolver backed by synced private config.

## Goals

- Support setting Whiz as a browser default search engine.
- Preserve local MyBangs as a required part of omnibar execution.
- Preserve the user's configured fallback search engine.
- Keep MyBang configuration private and user-specific.
- Target one automatic destination for direct redirects while allowing best-effort page-mediated fanout for multiple local targets.
- Keep the service-worker fast path optional, with the `/go` page as the compatibility fallback.
- Keep the resolver logic shared with the launcher where practical.

## Non-Goals

- Do not require accounts, cloud sync, or Epicenter for the first implementation.
- Do not require cookies for the first implementation.
- Do not require a service worker for the first implementation.
- Do not make server-side resolution authoritative for private local MyBangs.
- Do not promise reliable multi-tab fanout; current page-mediated fanout is best-effort.
- Do not change `/` share/prefill semantics just to support omnibar execution.

## Execution Model

The first implementation adds a `/go` route that accepts `q`:

```text
/go?q=search%20terms%20!bang
```

The route resolves the query and navigates with `location.replace(targetUrl)`.

Resolution should use:

- `myBangs` before provider catalog bangs.
- MyBang precedence is per normalized code, not per provider record. If a MyBang
  claims `!m` and `!map`, a provider bang with `!m`, `!maps`, and `!map` should
  keep resolving through `!maps`; only provider codes claimed by MyBangs are
  shadowed.
- The selected bang provider catalog as fallback for bang tokens not handled by MyBangs.
- The configured search provider for normal search and unknown forwarded bangs.
- The configured custom search template when the selected search provider is custom.

If no query is present, `/go` shows a setup/help page rather than redirecting.

If the query has no bang tokens, `/go` skips MyBang and provider catalog loading
and immediately redirects to the configured fallback search URL. If reading
MyBangs from IndexedDB fails, `/go` treats the MyBang list as empty and continues
with provider catalog or fallback search resolution.

The normal `/go` page remains the required implementation. The service worker is an optimization, and the page route does not depend on service-worker installation or activation.

## Direct-Redirect Scope

The first supported omnibar behavior produced one final navigation, and the
service-worker fast path still keeps that direct-redirect constraint.

If a query contains multiple local bang targets and the service worker is handling
the navigation, the worker should fall through to the normal `/go` page instead
of attempting multi-tab fanout from a fetch handler.

When only one target is available, target selection should favor the same
ordering already used by Whiz's bang composition model:

1. User-owned bangs before provider bangs.
2. The first matching bang token in the query.
3. The first URL target for that bang.

The resolver returns a structured result that includes all parsed targets so the
page route can handle fanout while the worker preserves single-redirect behavior.

## Multiple-Bang Fanout

After single-bang omnibar execution shipped, local testing confirmed that multiple
bang targets can be opened in new tabs when the Whiz origin has previously been
granted popup permission by the browser.

Local test findings:

- Multiple omnibar-triggered tabs can open when popup permission is allowed.
- `window.open(url, '_blank', 'noopener,noreferrer')` can open a tab while returning `null`, so the return value is not reliable success detection.
- `window.open(url, '_blank')` returned usable handles and detected popup blocking in local testing, but briefly exposes `window.opener` to arbitrary bang targets until caller code clears it and should not be the preferred deployable design.
- A safer design is to open same-origin relay pages with `noopener,noreferrer`; each relay page acknowledges that it opened, then redirects itself to the external target. This is the current implementation.

Expected constraints:

- A direct navigation or service-worker redirect can only produce one final page.
- Service workers should not be considered a reliable multi-tab mechanism. `clients.openWindow(...)` requires transient activation from an existing same-origin window and is not a dependable option for a `/go` navigation intercepted by a fetch handler.
- Automatic `window.open(...)` calls after asynchronous IndexedDB or catalog loading may still be blocked by popup blockers.
- Browser behavior may vary by engine and permission state.

Possible follow-up designs:

- A fanout page that lists all resolved targets and offers one explicit user gesture to open them.
- More explicit popup-permission detection or onboarding before retrying multi-open.
- A browser extension if reliable multi-tab execution becomes a hard requirement.

## Storage Requirements

Current MyBangs, including scratch bangs and catalog-derived editable copies, are
stored in IndexedDB. App settings still use `localStorage` as the app-facing
source of truth, while execution-critical settings are mirrored into IndexedDB
for service-worker access.

A service worker cannot read `localStorage`, but it can read IndexedDB. Settings
needed by `/go` are mirrored into IndexedDB for the worker. This is a transition
step rather than a full settings migration, because the app settings UI and
startup path still rely on synchronous `localStorage` reads and writes. If the
mirror does not exist yet, the service worker falls through to the normal `/go`
page so the page can use the existing `localStorage` settings fallback.

Execution-critical persisted state:

- `myBangs`
- `bangProvider`
- `searchProvider`
- `customSearchLabel`
- `customSearchTemplate`

The launcher may keep its Svelte state model during this transition, but execution persistence should flow through a shared storage module that can be used by both the app page and service worker. A later full settings migration can move the app-facing source of truth to IndexedDB after async settings initialization is designed.

## Service-Worker Fast Path

The first implementation did not require a service worker. A normal `/go` page is simpler, works before any service worker is installed, and can support local MyBangs by reading browser storage directly.

The tradeoff is that client-side `/go` costs at least a document request and app/page JavaScript execution before redirecting:

```text
omnibar -> /go?q=... -> page JS -> IndexedDB/localStorage lookup -> location.replace(target)
```

The service-worker performance upgrade intercepts navigations to `/go?q=...` and returns a redirect response after local resolution:

```text
omnibar -> /go?q=... -> service worker -> IndexedDB/cache lookup -> Response.redirect(target)
```

This keeps private MyBangs local while avoiding a full app-page load for repeat visits after service-worker installation. The worker intentionally handles only the `q` parameter route shape.

The page route must remain authoritative and must continue to work for browsers or sessions where the service worker is not installed, not active, disabled, or unable to resolve the query.

Service-worker installation means the browser has loaded a Whiz page, run Whiz's registration code, downloaded the worker script, installed it, and activated it for the Whiz origin. It may not be installed or active when:

- The user has never opened Whiz before setting it as the default search engine.
- The user opened Whiz but closed the page before registration completed.
- The browser disabled service workers for private browsing, storage restrictions, enterprise policy, or user settings.
- The service worker was updated and is waiting to activate.
- The browser evicted site data or the user cleared browsing data.

Because of those states, `/go` must work as a normal page even without the service worker.

### Service-Worker Updates

The service-worker fast path uses a simple browser-native update policy:

- Do not force activation with `skipWaiting()` in the first version.
- Do not auto-reload open Whiz pages when a new worker is waiting.
- Let updated workers activate after all currently controlled Whiz tabs/windows are closed.
- Keep the `/go` page route correct without relying on the latest worker version.

This avoids update coordination complexity while the worker is only an optional latency optimization. A manual or prompted update flow can be added later if stale service workers become a real problem.

## Default Search Engine Setup

The app supports both manual custom-search setup and browser search-provider discovery.

Manual setup documents this search URL:

```text
https://whiz.example.com/go?q=%s
```

Name the browser search provider `Whiz`. Suggested shortcuts are `whiz` or `w`; users may also make Whiz their default search engine to search without typing a shortcut.

For browser discovery, serve an OpenSearch description XML file and advertise it from app HTML:

```html
<link
	rel="search"
	type="application/opensearchdescription+xml"
	title="Whiz"
	href="/opensearch.xml"
/>
```

The OpenSearch document points searches at `/go`:

```xml
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
	<ShortName>Whiz</ShortName>
	<Description>Execute Whiz searches and bangs</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Url type="text/html" template="https://whiz.example.com/go?q={searchTerms}" />
	<Url
		type="application/opensearchdescription+xml"
		rel="self"
		template="https://whiz.example.com/opensearch.xml"
	/>
</OpenSearchDescription>
```

Browser support and UI vary. Some browsers expose discovered OpenSearch providers directly; others require the user to add a custom search engine manually in settings. The setup page provides copyable instructions for the manual path even when OpenSearch discovery is available.

## Server-Side Role

Server-side `/go` handling may provide a minimal public fallback, but it should not be treated as equivalent to client-side Whiz resolution unless private user config is available through an authenticated sync layer.

Server-side resolution is appropriate later if Epicenter or another sync layer provides:

- Authenticated user/session lookup from omnibar requests.
- A fast materialized resolver snapshot per user or workspace.
- Access to the user's selected bang provider and search provider.
- Access to private MyBangs without putting full config in cookies.

Until then, server-side redirects can only safely resolve public/default behavior.

## Privacy Notes

MyBangs should be considered private and unique per user. Avoid placing full MyBang records in URLs, public server logs, or non-HttpOnly cookies. If cookies are ever used as a bridge, prefer a small resolver-only snapshot and document the size, privacy, and header-overhead tradeoffs.

## Remaining Implementation Plan

1. Smoke test `/go?q=...` with persisted editable MyBangs after service-worker install and update.
2. Measure `/go?q=...` latency with and without an active service worker.
3. Consider a full settings migration from `localStorage` to IndexedDB only after async settings initialization is designed.
4. Keep the `/go` page route authoritative as the compatibility fallback for first visit, disabled service workers, stale workers, and resolver failures.
