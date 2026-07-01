# Editable MyBangs

## Purpose

Make MyBangs fully editable so users can create, rename, recode, and retarget private bang records without depending on the selected provider catalog.

Primary use cases:

- Add a provider bang such as `copilot`, then add a shorter personal code such as `cp`.
- Add a private bang that does not exist in any shipped or provider catalog.
- Change the display name of an existing MyBang.
- Fix or replace a MyBang URL template.

This feature should complete the existing Bang Management promise that users can "Add and edit your custom bangs."

## Related Specs

- `specs/launcher-actions-requirements.md`: launcher plugins, grouped result presentation, and focused modes.
- `specs/launcher-shortcut-targets.md`: item/group action menus, secondary actions, and compact action rows. This spec already lists "Edit a custom bang" as a secondary-action example.
- `specs/settings-mode.md`: launcher-native grouped editing without introducing a separate settings UI system.
- `specs/omnibar-bang-execution.md`: MyBangs are private, local, execution-critical state and take precedence over provider catalog bangs.
- `specs/provider-native-bang-data.md` and `specs/shipped-catalog-assets.md`: provider catalog records remain generated artifacts and should not be edited directly.

## Implementation Status

Specified in `ca3ed98 docs: specify editable MyBangs` and implemented in
`9363e42 feat: add editable MyBangs`.

Implemented:

- Added shared bang-code helpers for normalize, display, parse, and overlap behavior.
- Added local MyBang IDs, origin metadata, source display metadata, timestamps, and lazy migration for older stored records.
- Added the MyBang editor with validation, provider-shadow warnings, dirty-cancel confirmation, save, and delete confirmation.
- Added `/bang` entry points: unfiltered `New custom bang`, MyBang `Edit`, provider `Add and edit copy`, and secondary `Edit` for MyBangs in search and bang-picker contexts.
- Preserved MyBang precedence and provider suppression by normalized code overlap.
- Kept edited MyBangs execution-compatible for the launcher, `/go`, and the service-worker resolver.

Verification so far:

- `npm run check` passed with 0 errors and 0 warnings after implementation.

Remaining verification:

- Real-browser smoke test of `/bang`: create a scratch MyBang, edit a provider clone's codes, confirm provider suppression and reappearance, and delete from the editor.
- Real-browser smoke test of `/go?q=...` and service-worker behavior after installing or updating the app with persisted MyBangs.

## Goals

- Let users edit MyBang name, codes, and search URL template.
- Let users create a MyBang from scratch.
- Let users clone a provider catalog bang into MyBangs and then edit it.
- Keep MyBang edits local and private.
- Preserve MyBang precedence over provider bangs by normalized code overlap.
- Keep the first edit entry points inside the existing launcher group and compact action-menu model.
- Keep provider catalogs generated and immutable from the UI.

## Non-Goals

- Do not manually edit generated `catalogs/*.json` data.
- Do not add cloud sync or accounts.
- Do not add a bulk import/export editor in the first version.
- Do not add multi-URL or fanout MyBang records in the first version.
- Do not make source/provider bang hiding implicit when a MyBang is edited.
- Do not redesign the whole Bang Management mode before shipping focused editing.

## Terminology

- MyBang: a user-owned bang record stored locally.
- Provider bang: a bang record loaded from the selected Kagi or DuckDuckGo catalog. The UI may call these engine bangs or provider bangs, but the data model should keep the provider/catalog distinction clear.
- Catalog-derived MyBang: a MyBang first created by cloning a provider bang.
- Scratch MyBang: a MyBang created directly by the user without a provider source.
- Normalized code: a lowercased bang trigger with one leading `!`, such as `!cp`.
- Display code: the user-facing form representation without a leading `!`, such as `cp`.

## Entry Points

### Bang Management Route

`/bang` remains the focused place to browse, add, and edit MyBangs.

The Bang Management mode should show:

```text
My Bangs
  New custom bang
  Copilot                         cp

Kagi bangs
  GitHub                          gh github
  Copilot                         copilot
```

The exact provider group title still follows the selected provider, such as `Kagi bangs` or `DuckDuckGo bangs`.

### New Custom Bang

Add a `New custom bang` launcher action as the first row in the My Bangs group when `mode.id === 'bangs'`.

Rationale:

- It is visible in the same group that receives the new record.
- It participates in existing target shortcuts and compact action rows.
- It works even when the My Bangs group is otherwise empty.
- It avoids overloading the group header primary action, which already has expansion/focus behavior in other modes.

The My Bangs group header may later expose `New custom bang` in its action menu, but the visible first row is the V1 requirement.

Do not show the creation row in normal Search mode or bang-picker mode. Those modes should stay focused on inserting and executing bangs.

### Existing MyBang Items

In Bang Management mode, a MyBang item's primary action should be `Edit`.

Recommended MyBang action menu order:

1. `Edit`
2. `Remove from My Bangs`
3. `Set as default`

In Search mode and bang-picker mode, a MyBang item's primary action should remain `Insert`; `Edit` may appear in the action menu as a secondary management action.

### Provider Bang Items

In Bang Management mode, a provider bang item's primary action should remain `Add to My Bangs`.

Recommended provider bang action menu order:

1. `Add to My Bangs`
2. `Add and edit copy`
3. `Set as default`

`Add and edit copy` clones the provider bang into MyBangs, then opens the editor for the new MyBang.

## Editor Surface

Use a modal dialog on desktop-sized layouts and a bottom or fullscreen sheet on mobile-sized layouts. The editor is a form, not a nested launcher group, because the fields require validation, multiline-friendly text input, and save/cancel behavior.

Required fields:

- Name
- Codes
- URL template

Optional display-only metadata:

- Source provider for catalog-derived MyBangs.
- Source bang name/code when known.
- Last updated time if the persisted model includes it.

Primary controls:

- Save
- Cancel
- Delete, only for existing MyBangs

Delete should require confirmation inside the editor or through a focused confirmation state, because it permanently removes user-owned local state.

## Code Field

The codes field accepts bang codes with or without leading `!`.

The default display omits `!`.

Examples:

```text
Input:    cp copilot
Stored:   !cp !copilot
Rendered: cp copilot
```

```text
Input:    !cp, !copilot
Stored:   !cp !copilot
Rendered: cp copilot
```

Parsing requirements:

- Split on commas and whitespace.
- Trim each token.
- Ignore empty tokens.
- Allow a leading `!`, but do not require it.
- Store every code with exactly one leading `!`.
- Compare codes case-insensitively.
- Prefer storing lowercased codes unless a future display requirement needs original casing.
- Remove duplicate codes within the same MyBang after normalization.

Rendering requirements:

- In edit forms, show display codes without leading `!`.
- In MyBang and provider result rows, descriptions should also prefer display codes without leading `!` unless the surrounding UI specifically needs executable query syntax.
- In raw/passive menu details, showing normalized codes with `!` is acceptable if the row is explicitly presenting stored or executable details.

## Validation

Name:

- Required after trimming.

Codes:

- At least one normalized code is required.
- Codes must not contain whitespace after tokenization.
- Codes must not be only `!`.
- Codes must not contain another `!` after the optional leading `!`.
- Codes must not duplicate another code in the same MyBang after normalization.
- Codes must not conflict with another MyBang after normalization, unless the conflict is with the same MyBang being edited.

Provider overlap:

- A MyBang may intentionally use the same code as a provider bang.
- If a saved MyBang code overlaps a provider bang, MyBang precedence means the provider bang is suppressed for that code.
- The editor should warn, not block, when a code shadows a provider bang.

URL template:

- Required after trimming.
- Should be an absolute `http:` or `https:` URL.
- `%s` is recommended but not strictly required.
- If `%s` is missing, warn that search text will not be inserted.
- Preserve the exact saved URL template apart from trimming.

## Provider Bang Suppression

Provider bang visibility is controlled by normalized code overlap, not by source origin.

The current execution model already places MyBangs before provider bangs. The management UI should match that behavior:

- If any MyBang has a normalized code that overlaps a provider record's normalized codes, that provider record is hidden or marked unavailable according to the existing provider filtering behavior.
- If the overlap is removed by editing the MyBang, the provider record becomes visible again.
- A catalog-derived MyBang does not permanently hide its source provider record just because it was cloned.

Do not add implicit "hide source bang" behavior in V1.

A future feature may add an explicit `hideSourceBang` or hidden-provider-code preference, but it must be separate from editing codes.

## Copilot Walkthrough

Starting state:

```text
My Bangs

Kagi bangs
  Copilot                         copilot
```

The user adds provider `copilot` to MyBangs.

Persisted MyBang:

```json
{
  "name": "Copilot",
  "code": ["!copilot"],
  "urls": { "s": "https://..." }
}
```

Editor display:

```text
Name:  Copilot
Codes: copilot
URL:   https://...
```

Rendered Bang Management list:

```text
My Bangs
  Copilot                         copilot

Kagi bangs
  ...
```

The provider `Copilot` row is suppressed because MyBangs already owns normalized code `!copilot`.

The user edits the MyBang codes field from `copilot` to `cp`.

Persisted MyBang after save:

```json
{
  "name": "Copilot",
  "code": ["!cp"],
  "urls": { "s": "https://..." }
}
```

Rendered Bang Management list:

```text
My Bangs
  Copilot                         cp

Kagi bangs
  Copilot                         copilot
```

The provider `Copilot` row reappears because no MyBang now owns normalized code `!copilot`.

Execution behavior:

```text
!cp hello       -> MyBang Copilot
!copilot hello  -> provider Copilot
```

If the user saves codes as `cp copilot`, then both `!cp` and `!copilot` execute the MyBang, and the provider `Copilot` row is suppressed again.

## Persistence Model

The existing execution path consumes `ZbangRecord[]`, so V1 may continue projecting MyBangs to `ZbangRecord` for resolver compatibility.

For editing, prefer adding stable local metadata:

```ts
type MyBangRecord = ZbangRecord & {
	id: string;
	origin: 'catalog' | 'custom';
	sourceProvider?: BangProviderId;
	sourceName?: string;
	sourceCodes?: string[];
	sourceDomain?: string;
	sourceUrlTemplate?: string;
	createdAt: string;
	updatedAt: string;
};
```

Implementation may migrate existing stored `ZbangRecord` values lazily:

- On read, records without `id` receive stable IDs before the next write.
- Catalog-derived records set `origin: 'catalog'` when created through provider-clone flows.
- Older records with unknown source should use `origin: 'custom'` or omit source metadata rather than guessing.

V1 intentionally does not add an opaque `sourceKey`. Source metadata is
display-oriented; provider suppression and execution precedence are based only on
normalized code overlap.

The resolver and service worker should continue receiving the execution-compatible fields:

- `name`
- `code`
- `tags`
- `urls.s`
- `popularity`
- `rank`

## Ranking And Ordering

Initial MyBang ordering should remain stable and user-understandable.

V1 can preserve insertion order for MyBangs. Edited MyBangs should stay in place unless a future explicit reorder feature is added.

Scratch MyBangs should use low/default ranking values internally, because MyBang precedence is already handled before provider catalog lookup. Suggested defaults:

```ts
popularity: 1
rank: 1
tags: []
```

Do not rely on catalog popularity to decide MyBang precedence.

## Accessibility And Keyboard Behavior

- `New custom bang` must be selectable as a launcher item.
- `Edit` must be available from keyboard action menus.
- Opening the editor should move focus into the first invalid field, or the name field when the form is initially valid.
- `Escape` closes the editor when there are no unsaved changes.
- If there are unsaved changes, closing should confirm or keep the editor open.
- Save should be reachable by keyboard and should report validation errors without losing field focus.

## Implementation Notes

- Keep MyBang persistence centralized near the existing `readMyBangs` and `writeMyBangs` flow.
- Reuse existing `normalizeBangCode` behavior where practical, but expose a separate display-code helper that removes the leading `!`.
- Keep provider bang filtering based on normalized code overlap.
- Add editor state to the Bang Management component before extracting a reusable form component, unless the component becomes hard to follow.
- Avoid top-level `await` in browser-imported modules.
- Do not edit generated catalog JSON.

## Acceptance Criteria

- `/bang` shows a `New custom bang` row in the My Bangs group.
- Activating `New custom bang` opens an editor for a scratch MyBang.
- A user can save a scratch MyBang with name, codes, and URL template.
- A user can add a provider bang to MyBangs, then edit the cloned MyBang.
- Existing MyBang rows expose `Edit` in Bang Management mode.
- Existing MyBang rows can update name, codes, and URL template.
- Codes can be entered with or without leading `!`.
- The editor displays saved codes without leading `!` by default.
- Saved records normalize codes with exactly one leading `!`.
- MyBang code conflicts with other MyBangs are blocked.
- MyBang code overlaps with provider bangs are warned but allowed.
- A provider bang is suppressed only while its normalized codes overlap a MyBang.
- When a catalog-derived MyBang changes from `copilot` to `cp`, the provider `copilot` row reappears.
- `!cp query` executes the edited MyBang after save.
- `!copilot query` executes the provider bang after the overlap has been removed.
- The `/go` execution route and service-worker resolver continue to honor edited MyBangs.

## Open Questions

- Should the UI eventually expose an explicit "hide source provider bang" toggle for users who want a provider row hidden after changing all overlapping codes?
- Should codes preserve user-entered case for display while still comparing lowercased normalized values?
- Should MyBang rows support manual reorder, or is insertion order enough until usage ranking exists?
