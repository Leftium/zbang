# Settings Mode

## Purpose

Replace the dedicated form-style settings page with a launcher-native Settings mode. Settings should be searchable, grouped, keyboard-friendly, and expandable without introducing a separate settings UI system.

The closest browser reference is `chrome://flags`: a searchable list of named configuration entries where each entry exposes its current value and a compact set of selectable values. `chrome://settings` remains useful as a broader reference for searchable preferences, but `chrome://flags` is the stronger match for enum-style controls.

The first version should support the three existing enum settings while leaving room for future non-enum setting types.

## Goals

- Keep `/settings` as a dedicated Settings mode route.
- Render settings through the existing launcher mode and grouped-item model.
- Reuse existing group behavior where practical, especially the group expansion pattern used by the bangs plugin.
- Show each setting's current value in its group header.
- Let users filter settings and options from the launcher textarea.
- Sort setting groups by match quality when filtering.
- Apply enum option changes immediately.
- Keep the first implementation small enough to iterate on.

## Non-Goals

- Support non-enum settings in the first version.
- Add confirmation flows in the first version.
- Add complex nested settings.
- Finalize production navigation behavior for the settings link.
- Replace the launcher group system with a settings-specific panel system.
- Expose settings actions outside Settings mode in the first version.

## Route Behavior

`/settings` renders Settings mode with the shared launcher component:

```svelte
<LauncherPage modeId="settings" />
```

The legacy editable settings form remains available at `/settings/form`. The visible header settings link points to `/settings/form` while Settings mode stays available directly at `/settings`.

## Settings In Scope

Initial enum settings:

- Color scheme: `Auto (System)`, `Dark`, `Light`
- Default search provider: `Kagi`, `DuckDuckGo`, `Google`
- Bang catalog provider: `Kagi`, `DuckDuckGo`

These should use the existing setting state and setter functions rather than introducing a second persistence path.

## Default Presentation

When the launcher textarea is empty:

- All settings groups are closed.
- Groups appear in stable, intentional order.
- Each group header shows the setting name and current value as `Setting name: value`.
- Enum options are hidden until their group is opened.

Example:

```text
Color scheme: Auto (System)
Default search provider: Kagi
Bang catalog provider: Kagi
```

## Group Expansion

Activating a setting group header toggles that group open or closed.

Opening one settings group should close any other open settings group. This keeps Settings mode compact and makes the active setting explicit.

When a group is open, its enum options are shown beneath the header:

```text
Color scheme: Auto (System)
  (selected) Auto (System)           Follow the system theme.
  (option)   Dark                    Use the dark theme.
  (option)   Light                   Use the light theme.
Default search provider: Kagi
Bang catalog provider: Kagi
```

Selecting an option immediately applies that value while keeping Settings mode open. Selecting the already-current option should be safe and effectively a no-op. The current option should be indicated visually, such as with a radio-style selected indicator, rather than duplicating current/available status text in the description.

## Filtering

Typing in the launcher textarea filters settings and options.

Filtering should score both groups and options:

- A group can match by setting title, current value, keywords, or matching child options.
- A group with the best match or best matching option should rise to the top.
- Matching options should be visible under their parent group even if the group was closed before filtering.
- Users should be able to search directly for an option and select it without manually opening the group first.
- Activating a filtered group header should toggle that group between its directly matching options and all of its options.

Example query: `duck`

```text
Default search provider: Kagi
  DuckDuckGo                         Use DuckDuckGo for default web searches.
Bang catalog provider: Kagi
  DuckDuckGo                         Load bang shortcuts from DuckDuckGo.
```

When the textarea is empty, use stable group order instead of score-based ordering.

## Cross-Mode Exposure

Settings mode is the focused place to browse and adjust preferences, but settings actions should eventually be eligible outside Settings mode when ranking confidence is high.

For example, a query like `dark theme` could expose the `Dark` color scheme action from Search, Everything, or another mode if the launcher can rank that action confidently without making unrelated settings noisy.

This is not required for the first version. The initial settings plugin should still be designed so settings actions are data-driven and can later be surfaced by other modes or by Everything without duplicating setting metadata.

## Keyboard Behavior

- Arrow keys should move through visible launcher actions predictably.
- Opening a settings group should not trap keyboard navigation.
- Header activation should explicitly open or close the group rather than expanding automatically on active selection.
- Direct option actions should participate in the existing launcher item navigation and shortcut behavior when visible.
- Group headers should also participate in launcher navigation and repeated-key shortcuts when visible.

## Data Model Direction

Start with enum setting metadata rather than a general settings framework.

Suggested shape:

```ts
type EnumSetting<T extends string> = {
	id: string;
	title: string;
	keywords: string[];
	getValue: () => T;
	setValue: (value: T) => void;
	options: {
		value: T;
		label: string;
		keywords?: string[];
	}[];
};
```

The exact implementation can change, but settings should be data-driven enough that adding another enum setting does not require duplicating rendering logic.

## Implementation Notes

- Add a `settings` launcher mode to the mode registry and `LauncherModeId` type.
- Add a settings plugin that emits settings groups and enum option actions.
- Prefer using the existing `LauncherGroup` rendering path.
- Avoid building a custom settings page layout for the first version.
- Keep setting persistence centralized in `src/lib/settings.svelte.ts`.
- If group headers need to become selectable launcher actions, prototype the smallest extension to the existing group model rather than adding a parallel UI concept.

## Acceptance Criteria

- Visiting `/settings` shows the launcher in Settings mode.
- Empty Settings mode shows the three settings as closed groups in stable order.
- Each setting group header displays the current value as `Setting name: value`.
- Activating a closed setting group opens it and closes other settings groups.
- Activating an open setting group closes it.
- Open enum options are selectable actions.
- Selecting an enum option immediately updates the setting and persisted value.
- Selecting an enum option keeps Settings mode open.
- The current enum option is visually indicated without adding current/available status text to option descriptions.
- Filtering by setting name, current value, keyword, or option label returns relevant settings.
- Filtered results sort setting groups by best match quality.
- Filtered results expose matching options without requiring manual group expansion.
- Activating a filtered setting group toggles between matched options and all options.
- Setting group headers are keyboard-selectable and shortcut-targetable.

## Current Progress

V1 is complete as of these commits:

- `8980a30 feat: add read-only settings mode`
- `d0f7776 feat: make settings mode interactive`
- `f582efd docs: update settings mode spec`

Implemented:

- `/settings` renders launcher-native Settings mode.
- The legacy editable form remains available at `/settings/form`.
- The header settings link points to `/settings/form`.
- Color scheme, default search provider, and bang catalog provider are grouped enum settings.
- Empty Settings mode shows all groups closed in stable order.
- Group headers show `Setting name: value`.
- Group headers are keyboard-selectable and repeated-key shortcut-targetable.
- Empty-filter group activation toggles the selected group open or closed and closes other groups.
- Filtering scores both setting groups and option rows.
- Filtered group activation toggles between directly matching options and all options.
- Selecting an option updates the existing persisted setting value and keeps Settings mode open.
- The selected enum option is shown with a radio-style indicator instead of duplicated status text.

Deferred follow-ups:

- Redesign the broader launcher group UX if the current group-header layout or behavior becomes limiting.
- Decide the final production navigation behavior for the visible settings link.
- Consider exposing settings actions outside Settings mode when ranking confidence is high.
- Add non-enum setting types only when there is a concrete setting that needs them.
- Optionally highlight matching current-value text in the group header value.
