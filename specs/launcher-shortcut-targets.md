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
- Prevent shortcut prefixes from briefly changing launcher results before the shortcut resolves.

## Non-Goals

- Finalize every mode-specific action ordering.
- Add multi-level custom plugin menus in the first implementation.
- Require collapse/open behavior as the default group interaction.
- Depend on punctuation shortcuts that may be missing from mobile virtual keyboards.
- Finalize the richest possible staged-text visual treatment in the first implementation.

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

## Shortcut Entry Buffer

Repeated-letter shortcuts should not require a timing window. Instead, the launcher should distinguish committed query text from a visible shortcut entry buffer.

Definitions:

- Committed text is the real launcher input value. It drives filtering, mode switching, bang picker state, search URLs, actions, copy, and selection.
- Staged text is visible input text that may still become either committed text or a shortcut.
- The shortcut buffer is the active staged shortcut sequence, such as `Q` or `QQ`.
- A candidate buffer is a one-key shortcut prefix, such as `Q`.
- An armed buffer is a resolved shortcut that has already focused or opened the addressed target, such as `QQ`.

The shortcut buffer should be visible while active, but it should not change the committed text unless the sequence resolves as literal typing.

### Candidate Buffer

When the user types a shortcut initiator key, such as `Q`, the launcher should stage that key instead of committing it immediately.

Candidate behavior:

- Show the staged key in the input.
- Do not update launcher results from the staged key.
- Do not switch modes because of the staged key.
- Highlight or otherwise indicate matching shortcut labels when practical.
- Keep the candidate buffer active until the next meaningful input resolves it.

Examples:

- `Q`: show staged `Q`; committed query remains unchanged.
- `Q` then `A`: commit `QA` as normal text.
- `Q` then `Backspace`: cancel staged `Q`; committed query remains unchanged.
- `Q` then `Enter`: commit `Q`, then handle Enter normally.
- `Q` then cursor movement, pointer interaction, blur, or explicit mode change: cancel or commit according to the least surprising behavior for that event. The implementation should avoid leaving an invisible active shortcut buffer.

### Armed Buffer

When the user repeats the same shortcut key, such as `QQ`, the launcher should resolve the shortcut immediately.

Armed behavior:

- Clear the candidate state.
- Keep the visible shortcut buffer as `QQ` for feedback.
- Focus, select, or open the target addressed by the double-key shortcut immediately.
- Store the previous focus state before applying the shortcut so the shortcut can be cancelled.
- Arm the resolved target so the next activation key applies to that same target.

Examples:

- `QQ`: focus item slot 1 and show an armed `QQ` buffer.
- `AA`: focus item slot 1, open its action menu, and show an armed `AA` buffer.
- `UU`: focus the previous group slot and show an armed `UU` buffer.
- `PP`: run parent/out behavior and show feedback if there is a meaningful focused state to restore.

The armed target should be captured when the double-key shortcut resolves. Triple-key activation should act on that captured target rather than recomputing the shortcut target from a list that may have changed because of focus, scrolling, grouping, or menu state.

### Activation And Cancellation

The third repeated key activates the armed target. Enter on an armed target should do the same thing as the third repeated key for focus lanes.

Activation examples:

- `QQQ`: focus item slot 1, then run its primary action.
- `QQ` then `Enter`: run the primary action for the armed item slot 1 target.
- `AAA`: focus item slot 1, then run its secondary fast action when present; otherwise open the action menu if actions exist.
- `UUU`: focus the previous group slot, then run its primary action.

Cancellation examples:

- `QQ` then `Backspace`: clear the armed `QQ` buffer and restore the previous focus snapshot when possible.
- `QQ` then unrelated text input: clear the armed buffer and process the new input normally.
- `QQ` then another shortcut initiator: clear the armed buffer and begin or process the new shortcut sequence.
- Pointer interaction, blur, query changes outside the shortcut buffer, or mode changes should clear the armed buffer.

Once a double-key shortcut has resolved, it should not later become literal text. Literal repeated capitals should use Caps entry mode or another explicit literal-text escape.

### Caps Entry Mode

Caps entry mode is an escape hatch for literal capital text.

When Caps entry mode is enabled:

- Repeated capital letters should commit as literal text rather than shortcut buffers.
- Shortcut labels may be visually muted or disabled to communicate that letter shortcuts are temporarily inactive.
- A visible control should allow users to leave Caps entry mode, especially on mobile.
- The launcher may keep one time-limited keyboard shortcut to leave Caps entry mode, but keyboard-only exit should not be the only escape path.

Caps entry mode should not be required for ordinary mixed-case typing. A staged capital followed by a different text key should commit as normal text.

### Bang Trigger Shortcut

`SPACE SPACE` to `!` is a punctuation convenience, not the same kind of shortcut as repeated capital lanes.

Search mode behavior:

- `SPACE SPACE` should commit `!` immediately so the bang picker can open without waiting for another event.
- The shortcut may be unlimited in search mode because multiple spaces are uncommon in search queries, but the committed `!` should be immediate once the sequence resolves.
- If the user actually needs literal spaces, Backspace or normal editing should recover without changing the committed query beyond the visible edit.

Broader behavior:

- If `SPACE SPACE` is supported outside search mode, a short timing window is preferable because multiple spaces are more common in text-like modes.
- Mobile operating-system double-space period behavior should not be fought aggressively. If the input reports `. ` from the keyboard, the launcher should not reinterpret it as `!` unless the behavior is clearly safe for that platform and mode.
- Visible bang-picker controls remain the reliable mobile path.

### Rendering Staged Text

The input should communicate active staged or armed shortcut text without making that text part of the committed query.

Initial rendering direction:

- Render committed and staged text in a styled preview layer over or under the textarea.
- Keep only committed text selectable and copyable.
- Use metric-compatible staged styling first: color, opacity, background tint, underline, or outline that does not affect text layout.
- Avoid full shortcut-label chip styling inline until caret position, wrapping, and selection behavior are proven reliable.

Possible later rendering direction:

- Add a third absolutely positioned overlay element at the caret for rich shortcut-badge styling.
- Position that overlay using a textarea mirror and caret marker.
- Let the rich staged shortcut badge cover underlying committed text without affecting textarea layout until the text is committed.
- Prefer a real positioned element over `textarea::after`, because textarea pseudo-elements are unreliable and wrapper pseudo-elements are harder to position and debug.

The visual design should make Backspace-as-cancel discoverable while the shortcut buffer is active.

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
- Which non-search modes, if any, should support `SPACE SPACE` to `!` with a timing window?
- What is the clearest visible control and label for Caps entry mode?
- Which cursor movement and blur cases should commit a candidate buffer versus cancel it?
- How rich can staged shortcut styling become before textarea mirror alignment becomes too fragile?

## Acceptance Criteria

- Items and groups can both be represented as launcher targets.
- Item and group shortcuts have paired focus and menu lanes.
- Triple-key shortcuts can run primary and secondary fast actions without delaying the safe double-key focus/menu operation.
- Single-key shortcut prefixes are staged without changing committed query text or launcher results.
- Double-key shortcuts focus, select, or open the addressed target immediately and keep an armed shortcut buffer visible.
- Triple-key shortcuts and `Enter` on armed focus-lane shortcuts act on the captured armed target rather than recomputing from changed list state.
- Backspace can cancel visible candidate or armed shortcut buffers; armed cancellation restores the previous focus snapshot when possible.
- Caps entry mode allows literal repeated capital text and has a visible escape path.
- Search-mode `SPACE SPACE` commits `!` immediately so the bang picker opens promptly.
- Staged shortcut text is visually distinct, while only committed text is selectable and copyable.
- Action menus can be represented as nested launcher groups.
- Parent/out behavior has a dedicated shortcut and exits one nested context.
- Mobile users can operate launcher groups, items, menus, and actions without arrow keys.
