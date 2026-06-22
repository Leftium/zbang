# Launcher Shortcut Targets

## Purpose

Define a consistent interaction model for launcher items, launcher groups, shortcuts, action menus, and parent navigation.

The launcher should work well on desktop keyboards and mobile virtual keyboards. Arrow keys can remain useful on desktop, but no core action should require arrow keys because mobile virtual keyboards usually do not expose them.

This spec extends the launcher action and grouped-list direction described in `specs/launcher-actions-requirements.md` and `specs/settings-mode.md`.

## Goals

- Treat items and groups as first-class selectable launcher targets.
- Give items and groups consistent focus, menu, primary action, and secondary action affordances.
- Keep shortcuts predictable across modes, especially on mobile virtual keyboards.
- Support fast bang insertion without making the same shortcut sometimes focus and sometimes execute.
- Support group-level navigation without hiding lists as the primary UX mechanism.
- Let action menus grow into nested launcher groups instead of a separate UI system.

## Non-Goals

- Finalize every mode-specific action ordering.
- Add multi-level custom plugin menus in the first implementation.
- Require collapse/open behavior as the default group interaction.
- Depend on punctuation shortcuts that may be missing from mobile virtual keyboards.

## Target Model

A launcher target is anything the user can focus and act on.

Initial target kinds:

- Item target: wraps a `LauncherItem`.
- Group target: wraps a `LauncherGroup` header.

Both target kinds should support the same interaction concepts:

- Focus/select.
- Primary/default action.
- Secondary fast action.
- Action menu.
- Parent/out behavior when inside a nested context.

Suggested eventual shape:

```ts
type LauncherTarget = {
	id: string;
	kind: 'item' | 'group';
	title: string;
	actions: LauncherAction[];
};

type LauncherAction = {
	id: string;
	label: string;
	run: () => void | Promise<void>;
};
```

The exact implementation can change. The important requirement is that group headers do not need a parallel interaction system.

## Interaction Concepts

### Focus Or Select

Focus is movement only. It should not run actions.

Examples:

- Arrow keys move focus on desktop.
- Item focus shortcuts move focus to visible item slots.
- Group focus shortcuts move focus to group headers.

Focus should be visually obvious because later actions apply to the focused or shortcut-addressed target.

### Primary Action

The primary action is `actions[0]`.

Examples:

- Insert a bang in Search mode.
- Apply a setting option.
- Toggle a settings group.
- Focus the first item in a group when that is the most useful group action.

Enter on a focused target should run the primary action when safe for the current mode and target.

### Secondary Action

The secondary fast action is `actions[1]`.

Secondary actions are optional. If a target has no `actions[1]`, the shortcut should open the action menu when any actions exist, or no-op with visible feedback when no actions exist.

Actions are responsible for their own safety and confirmation. If a primary or secondary fast action requires confirmation, that confirmation should be handled by the action itself rather than by the shortcut system.

Examples:

- Edit a custom bang.
- Move a custom bang to the provider catalog.
- Show only this group.
- Focus the first item in a collapsible group.

### Action Menu

The action menu shows the full `actions[]` list for a target.

Opening a menu should focus the target first. This keeps shortcuts consistent even when the target was not already focused.

Menu-opening shortcuts should still open a menu when a target has only one action. Showing the one-action menu preserves consistent shortcut behavior and makes the available action explicit.

Running an action from a menu should close the menu unless the action explicitly keeps it open.

### Parent Or Out

Parent navigation exits one nested interaction level.

Examples:

- Close an action menu and restore focus to the original target.
- Return from a nested submenu to its parent menu.
- Return from an item action context to the group context.

Parent navigation should always be safe.

When closing a nested context, focus should restore to the original parent target if it is still visible. If that target disappeared because of filtering, data changes, or action effects, focus should move to the nearest available target:

- Next visible target in the same group.
- Previous visible target in the same group.
- Parent group header if visible.
- Next available group, using wrapping group navigation when enabled.
- Launcher input if no list target is available.

## Shortcut Lanes

Shortcuts should use repeated letter keys because they work on desktop keyboards and mobile virtual keyboards.

Initial lanes:

- `QQ` to `YY`: item focus/select, 6 visible item slots.
- `AA` to `HH`: item action menu, 6 aligned item slots.
- `UU` to `OO`: relative group focus/select slots for previous, current, and next group.
- `JJ` to `LL`: relative group action menu slots aligned with previous, current, and next group.
- `PP`: parent/up/out.

Spatial mapping:

```text
Items:  QQ  WW  EE  RR  TT  YY
Menus:  AA  SS  DD  FF  GG  HH

Groups: UU  II  OO    previous, current, next
Menus:  JJ  KK  LL    previous, current, next

Parent: PP
```

The paired menu shortcut should address the same target slot as its focus shortcut.

Examples:

- `QQ` focuses item slot 1.
- `AA` focuses item slot 1 and opens its action menu.
- `UU` focuses group slot 1.
- `JJ` focuses group slot 1 and opens its action menu.

Group shortcuts are relative to the current group. The number of visible groups does not change the shortcut set. Previous and next group navigation should wrap by default so compact group sets can be cycled quickly. Modes may disable wrapping when strict list-boundary behavior is more important than cycling speed.

## Repeated-Key Semantics

Double-key shortcuts perform the safe, immediate operation for their lane.

Triple-key shortcuts run the fast action for that same target.

Item examples:

- `QQ`: focus item slot 1.
- `QQQ`: focus item slot 1, then run `actions[0]`.
- `AA`: focus item slot 1, then open its action menu.
- `AAA`: focus item slot 1, then run `actions[1]` when present; otherwise open the action menu if actions exist.

Group examples:

- `UU`: focus group slot 1.
- `UUU`: focus group slot 1, then run `actions[0]`.
- `JJ`: focus group slot 1, then open its action menu.
- `JJJ`: focus group slot 1, then run `actions[1]` when present; otherwise open the action menu if actions exist.

This ordering is important. The shorter shortcut must be safe to run immediately because it may be the prefix of a longer shortcut. Avoid mappings where a double-key shortcut performs an unsafe action and a triple-key shortcut only focuses.

Implementations should guard against accidental hardware key repeat so holding a key does not unintentionally trigger triple-key actions.

## Group Behavior

Groups should act like targets rather than passive section headers.

Selecting a group should focus the group header and make it the active group for item shortcut assignment when relevant.

Focus and active group should usually be the same concept for group targets. Focusing a group makes it active. Focusing an item makes that item's parent group active. A separate active group state should only exist as an implementation detail if needed to preserve focus across nested menus or transient UI updates.

Group actions should be data-driven and mode-specific where needed. Defaults can be derived from group capabilities, but should not force every group to toggle open/closed.

Suggested default group action ordering:

- If the group is collapsible, `actions[0]` can be `Toggle group`.
- If the group has visible or available items, `actions[0]` can be `Focus first item` when that is more useful than toggling.
- `actions[1]` should be the next most useful structural action, such as `Focus first item`, `Show only this group`, `Toggle group`, or `Show all groups`.

Mode-specific groups may override these defaults.

Examples:

- Settings group primary action can toggle open/closed.
- Bang group primary action can focus the first bang rather than hide/show the list.
- Bang group secondary action can show only that source or open a group action menu.

## Action Menus As Nested Groups

Action menus should render through the launcher list model as nested groups rather than a separate popover-only system.

A menu context should include:

- The parent target that opened the menu.
- The list of action items from the target's `actions[]`.
- A visible way to understand that the user is inside a nested action context.
- Parent/out behavior via `PP`.

Action menu items should be normal launcher items where practical. They can use the same focus, primary action, and menu shortcut lanes within the nested context.

## Desktop And Mobile Behavior

Desktop behavior:

- Arrow keys move focus across visible targets.
- Enter runs the focused target's primary action when safe.
- Shortcut lanes provide faster direct access.

Mobile behavior:

- Shortcut lanes must be sufficient for focus, menu access, primary action, secondary action, and parent navigation.
- Arrow keys must not be required for any core operation.
- Shortcut labels can show the single letter, such as `Q`, while repeated-key behavior such as `QQ` and `QQQ` remains a learned convention.
- The UI may add action labels or other affordances to indicate each target's primary and secondary actions, especially where fast actions are not obvious.

## Bang Examples

### Search Bang Picker

For a bang result item:

- `QQ`: focus the first bang result.
- `QQQ`: run `actions[0]`, such as `Insert bang`.
- `AA`: open the bang action menu.
- `AAA`: run `actions[1]`, such as `Add to My bangs` if available.

This keeps insertion fast without making `QQ` sometimes focus and sometimes insert.

### Bang Management

For a custom bang item:

- `QQ`: focus the custom bang.
- `QQQ`: run the primary management action if safe.
- `AA`: open a menu with actions such as edit, move, duplicate, delete, or copy URL.
- `AAA`: run the secondary fast action when defined.

For bang groups:

- `UU` to `OO`: focus previous/current/next group slots.
- `JJ` to `LL`: open the aligned group action menu.
- Triple group shortcuts run group primary or secondary actions.

Bang Management should avoid relying on hidden lists as the main way to switch sources. Group navigation should let users move between My bangs and engine bangs without arrowing through every item.

## Settings Examples

For a settings group:

- Group focus shortcut focuses the setting group header.
- Group primary action can toggle the setting open/closed.
- Group menu can include actions such as focus first option, expand, collapse, reset, or show matching options.

For a setting option item:

- Item focus shortcut focuses the option.
- Triple item shortcut or Enter applies the option.
- Item menu can show details or related actions later.

## Open Questions

- How should the UI label or preview each target's primary and secondary fast actions without cluttering the list?
- Which modes, if any, should disable default wrapping for relative group navigation?

## Acceptance Criteria

- Items and groups can both be represented as launcher targets.
- Item and group shortcuts have paired focus and menu lanes.
- Triple-key shortcuts can run primary and secondary fast actions without delaying the safe double-key focus/menu operation.
- Action menus can be represented as nested launcher groups.
- Parent/out behavior has a dedicated shortcut and exits one nested context.
- Mobile users can operate launcher groups, items, menus, and actions without arrow keys.
