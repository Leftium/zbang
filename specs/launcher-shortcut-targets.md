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
- Make staged shortcuts discoverable by showing the currently armed command and confirmation path.

## Non-Goals

- Finalize every mode-specific action ordering.
- Add multi-level custom plugin menus in the first implementation.
- Require collapse/open behavior as the default group interaction.
- Depend on punctuation shortcuts that may be missing from mobile virtual keyboards.
- Finalize the richest possible staged-text visual treatment in the first implementation.

## Implementation Stages

Use these stages to track implementation progress. Status should be updated as work lands; unchecked items are planning markers unless an implementation audit has confirmed their current state.

### Stage 1: Target And Focus Foundation

Status: Planned.

- [ ] Represent item and group headers as launcher targets.
- [ ] Normalize target actions as primary, secondary, action menu, and parent/out behaviors.
- [ ] Make focus snapshots restorable after shortcut cancellation or nested context exit.
- [ ] Build a mode-aware valid shortcut map for visible targets and global commands.

### Stage 2: Staged Shortcut State

Status: Planned.

- [ ] Separate committed text from staged shortcut text.
- [ ] Stage only uppercase initiators that match the current valid shortcut map.
- [ ] Resolve nonmatching staged text as literal input.
- [ ] Support `Enter` confirmation and `Backspace` downgrade or cancellation.
- [ ] Add Caps entry mode for literal uppercase shortcut letters.

### Stage 3: Target Shortcut Sequences

Status: Planned.

- [ ] Support `Q` to `Y` item target slots.
- [ ] Support `U`, `I`, and `O` relative group target slots.
- [ ] Capture the addressed target when a shortcut first arms.
- [ ] Support same-letter progressive action upgrades such as `Q`, `Qq`, `Qqq`, and `Qqqq`.
- [ ] Confirm armed target actions with `Enter` without recomputing the target.

### Stage 4: Armed Feedback And Staged Rendering

Status: Planned.

- [ ] Render a pinned armed command row above normal results.
- [ ] Keep the armed command row out of item shortcut slot indexing.
- [ ] Show `Enter`, repeat-key, and `Backspace` affordances in the command row.
- [ ] Render staged text distinctly from committed text.
- [ ] Make staged `SPACE` visible with inline styling or overlay treatment.

### Stage 5: Global Commands And Text Transforms

Status: Planned.

- [ ] Support `P` then `Enter` for parent/up/out, with optional `Pp` fast confirmation.
- [ ] Support `F` then `Enter` for fullscreen toggle, with optional `Ff` fast confirmation.
- [ ] Support `L` then `Enter` for line wrap toggle, with optional `Ll` fast confirmation.
- [ ] Support `N` then `Enter` for Enter-inserts-newline toggle, with optional `Nn` fast confirmation.
- [ ] Support `S` then `Enter` for search submit, with optional `Ss` fast confirmation.
- [ ] Support staged `SPACE` then `Enter` for bang insertion in bang-trigger contexts.
- [ ] Keep `SPACE SPACE` as a fast path for bang insertion where safe.
- [ ] Decide whether legacy `FF`, `LL`, `NN`, `MM`, or `..` timing-window shortcuts remain as compatibility fast paths.
- [ ] Scope target shortcuts, global commands, and text transforms by mode, fullscreen state, IME/composition state, input focus state, and mobile keyboard behavior.

### Stage 6: Nested Menus And Mobile Polish

Status: Planned.

- [ ] Render action menus as nested launcher groups.
- [ ] Support staged target shortcuts inside nested action menu contexts.
- [ ] Provide visible mobile controls for Caps entry mode and parent/out behavior.
- [ ] Guard against accidental hardware key repeat upgrading or confirming shortcuts.
- [ ] Decide whether any additional legacy timing-window shortcuts remain as compatibility fast paths.

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

## Shortcut Categories

Shortcut behavior should be chosen by shortcut category rather than forced through one universal rule.

Initial categories:

- Target shortcuts address visible launcher targets such as item slots and relative group slots.
- Global command shortcuts address launcher-level commands such as fullscreen toggle, line wrap toggle, Enter-newline behavior, and search submit.
- Text transform shortcuts convert staged text into committed text, such as `SPACE` to `!` for bang insertion.

Target and global command shortcuts should prefer a staged and confirmed model over timing windows. Text transform shortcuts may keep fast replacement paths when they are more natural than explicit confirmation.

## Shortcut Initiators

Shortcut initiators should use keys available on desktop keyboards and mobile virtual keyboards.

Uppercase letters should be treated as shortcut intent only when they match a currently valid shortcut in the active mode and context. Otherwise, they should commit as literal text.

Validity examples:

- `Q` is valid only when item slot 1 exists.
- `Y` should commit as text when there are fewer than 6 visible item slots.
- `U`, `I`, and `O` are valid only when relative group navigation is active.
- `P` is valid only when parent/out has a meaningful target or visible feedback.
- `F`, `L`, `N`, and `S` can be valid for global commands when those commands are available.

Initial target initiators:

- `Q` to `Y`: item target slots 1 to 6.
- `U` to `O`: relative group target slots for previous, current, and next group.
- `P`: parent/up/out command.

Initial global command initiators:

- `F`: toggle fullscreen.
- `L`: toggle line wrap.
- `N`: toggle whether `Enter` inserts a newline in the current fullscreen/restored context.
- `S`: submit/search.

Global command initiators should prefer mnemonic letters when those letters are not used by target slots in the active context.

Spatial mapping:

```text
Items:  Q  W  E  R  T  Y

Groups: U  I  O    previous, current, next

Parent: P

Global: F  L  N  S    fullscreen, line wrap, newline behavior, search
```

Target shortcuts no longer need a separate menu/action shortcut row. Repeating the same shortcut key upgrades the armed action for the same captured target.

Group shortcuts are relative to the current group. The number of visible groups does not change the shortcut set. Previous and next group navigation should wrap by default so compact group sets can be cycled quickly. Modes may disable wrapping when strict list-boundary behavior is more important than cycling speed.

## Staged Shortcut Sequences

Shortcut sequences should not require a timing window. Instead, the launcher should distinguish committed query text from a visible shortcut entry buffer.

Definitions:

- Committed text is the real launcher input value. It drives filtering, mode switching, bang picker state, search URLs, actions, copy, and selection.
- Staged text is visible input text that may still become either committed text or a shortcut.
- The shortcut buffer is the active staged shortcut sequence, such as `Q`, `Qq`, or `SPACE`.
- A candidate buffer is staged text that does not yet match a currently valid shortcut.
- An armed buffer is a staged shortcut that matches a target or command and has a visible armed command.

The shortcut buffer should be visible while active, but it should not change the committed text unless the sequence resolves as literal typing.

### Candidate And Armed Behavior

When the user types a currently valid uppercase shortcut initiator, such as `Q`, the launcher should stage that key and arm the matching target or command instead of committing it immediately.

Armed behavior:

- Show the staged key in the input.
- Do not update launcher results from the staged key.
- Do not switch modes because of the staged key.
- Highlight or otherwise indicate the addressed target or command when practical.
- Store the previous focus state before applying a target shortcut so the shortcut can be cancelled.
- Capture the addressed target or command when the shortcut first arms.
- Show an armed command row that explains what `Enter`, repeat, and `Backspace` will do.

If an uppercase key does not match a currently valid shortcut initiator, it should commit as normal literal text.

Examples:

- `Q`: stage `Q`, focus item slot 1, and show the armed command row for that item.
- `F`: stage `F` and show the armed command row for fullscreen toggle.
- `L`: stage `L` and show the armed command row for line wrap toggle.
- `N`: stage `N` and show the armed command row for Enter-newline behavior.
- `S`: stage `S` and show the armed command row for search submit.
- `Y` with fewer than 6 item slots: commit `Y` as literal text.
- `Q` then `A`: commit `QA` as normal text and restore the previous focus snapshot when possible.
- `Q` then `Backspace`: cancel staged `Q`; committed query remains unchanged and previous focus is restored when possible.
- `Q` then cursor movement, pointer interaction, blur, or explicit mode change: cancel or commit according to the least surprising behavior for that event. The implementation should avoid leaving an invisible active shortcut buffer.

### Progressive Target Actions

Repeating the same shortcut key, case-insensitively, should upgrade the armed action for the captured target rather than recomputing the target from the current list.

Default target action levels:

- `Q`: focus item slot 1.
- `Qq`: arm the primary action for item slot 1.
- `Qqq`: arm the action menu for item slot 1.
- `Qqqq`: arm the secondary fast action for item slot 1 when present; otherwise fall back to the action menu when actions exist.

Group examples:

- `U`: focus the previous group slot.
- `Uu`: arm the previous group's primary action.
- `Uuu`: arm the previous group's action menu.
- `Uuuu`: arm the previous group's secondary fast action when present; otherwise fall back to the action menu when actions exist.

This ordering is an initial default. Modes may swap the menu and secondary levels when the secondary action is safer or more useful than opening the menu.

Shorter staged sequences must remain safe because they may become literal text or be upgraded by later input. Avoid mappings where an early level performs an unsafe action and a later level merely focuses.

Implementations should guard against accidental hardware key repeat so holding a key does not unintentionally upgrade or confirm shortcut actions.

### Global Command Actions

Global commands use the same staged and confirmed model, but they usually do not need multiple progressive target action levels.

Examples:

- `F`: arm fullscreen toggle and show a command row.
- `F` then `Enter`: toggle fullscreen.
- `Ff`: optional fast confirm for fullscreen toggle.
- `Fa`: commit `Fa` as literal text when `a` does not continue a valid command sequence.
- `L`: arm line wrap toggle and show a command row.
- `L` then `Enter`: toggle line wrap.
- `Ll`: optional fast confirm for line wrap toggle.
- `N`: arm Enter-newline behavior and show a command row.
- `N` then `Enter`: toggle whether `Enter` inserts a newline for the current fullscreen/restored context.
- `Nn`: optional fast confirm for Enter-newline behavior.
- `S`: arm search submit and show a command row.
- `S` then `Enter`: submit the current search.
- `Ss`: optional fast confirm for search submit.
- `P`: arm parent/up/out and show a command row.
- `P` then `Enter`: run parent/up/out.
- `Pp`: optional fast confirm for parent/up/out.

Fullscreen, line wrap, Enter-newline behavior, and search submit map back to historical double-key shortcuts: `FF`, `LL`, `NN`, and `MM`. Parent/out previously used `PP` in this spec. The new primary model is staged mnemonic initiator plus `Enter`, with same-letter fast confirmation optional for reversible or frequently used commands. More destructive global commands should require explicit `Enter` confirmation.

`MM` was historically a search-submit shortcut, but `S` is the preferred mnemonic initiator now that the old action-menu row is no longer reserved. The historical `..` search-submit shortcut may remain as a punctuation fast path when safe, but it should not be the main documented command because periods are normal text input.

### Activation And Cancellation

`Enter` confirms the currently armed shortcut action. Repeating the same key may also confirm or upgrade the shortcut when the active shortcut category defines that behavior.

Cancellation examples:

- `Q` then `Backspace`: clear staged `Q` and restore the previous focus snapshot when possible.
- `Qq` then `Backspace`: downgrade to staged `Q` and restore the armed command row for the lower level.
- `Q` then unrelated text input: clear the armed buffer, restore prior focus when possible, and process the input as literal text.
- `Q` then another valid shortcut initiator: clear the armed buffer and begin or process the new shortcut sequence.
- Pointer interaction, blur, query changes outside the shortcut buffer, or mode changes should clear the armed buffer.

Once a staged shortcut has been confirmed, it should not later become literal text. Literal repeated capitals should use Caps entry mode or another explicit literal-text escape.

### Caps Entry Mode

Caps entry mode is an escape hatch for literal capital text.

When Caps entry mode is enabled:

- Uppercase shortcut initiators and repeated letters should commit as literal text rather than shortcut buffers.
- Shortcut labels may be visually muted or disabled to communicate that letter shortcuts are temporarily inactive.
- A visible control should allow users to leave Caps entry mode, especially on mobile.
- The launcher may keep one keyboard shortcut to leave Caps entry mode, but keyboard-only exit should not be the only escape path.

Caps entry mode should not be required for ordinary mixed-case typing. A staged capital followed by a different text key should commit as normal text. Implementations may keep a temporary literal uppercase run after resolving staged capitals as text so acronyms such as `USA` or `HTTP` do not require repeated escapes.

### Bang Trigger Shortcut

`SPACE` to `!` is a text transform shortcut. It can use the same staged and confirmed model as command shortcuts, but space is common enough that the behavior must remain context-sensitive.

Search mode behavior:

- In a bang-trigger context, `SPACE` may stage a visible space and arm an `Insert !` command row.
- `SPACE` then `Enter` should commit `!` and open the bang picker.
- `SPACE SPACE` should remain a fast path that commits `!` immediately so the bang picker can open without waiting for `Enter`.
- `SPACE` then a non-space text key should commit a literal space followed by that text key.
- `SPACE` then `Backspace` should cancel the staged space without changing the committed query.
- The shortcut may be unlimited in search mode because multiple spaces are uncommon in search queries, but the committed `!` should be immediate once the sequence resolves.
- If the user actually needs literal spaces, Backspace or normal editing should recover without changing the committed query beyond the visible edit.

Broader behavior:

- Bang-trigger context is mode-defined. Search mode may allow broad single-space staging when the armed command row makes the pending `!` replacement explicit. Text-heavy or fullscreen modes may restrict single-space staging to empty input, leading input, or disable it entirely.
- If `SPACE SPACE` is supported outside search mode without a visible staged command row, a short timing window is preferable because multiple spaces are more common in text-like modes.
- Mobile operating-system double-space period behavior should not be fought aggressively. If the input reports `. ` from the keyboard, the launcher should not reinterpret it as `!` unless the behavior is clearly safe for that platform and mode.
- Visible bang-picker controls remain the reliable mobile path.

### Armed Command Row

When a shortcut buffer is active, the launcher should render a pinned armed command row above the normal launcher results.

The command row should:

- Describe the currently armed target or command.
- Show what `Enter` will confirm.
- Show the next repeat-key upgrade when one exists.
- Show `Backspace` cancellation or downgrade affordance.
- Update as the shortcut sequence is upgraded or downgraded.
- Be excluded from normal item shortcut slot indexing so it does not shift `Q` to `Y` item targets.

Examples:

- `SPACE`: show `Enter` inserts `!`, `Space` also inserts `!`, and `Backspace` cancels.
- `F`: show `Enter` toggles fullscreen, `f` fast-confirms when enabled, and `Backspace` cancels.
- `L`: show `Enter` toggles line wrap, `l` fast-confirms when enabled, and `Backspace` cancels.
- `N`: show `Enter` toggles Enter-newline behavior, `n` fast-confirms when enabled, and `Backspace` cancels.
- `S`: show `Enter` submits the search, `s` fast-confirms when enabled, and `Backspace` cancels.
- `Q`: show item slot 1 is focused and `q` upgrades to the primary action.
- `Qq`: show `Enter` runs the primary action and `q` upgrades to the action menu.

The command row can use full keyboard-shortcut badge styling from the first implementation because it does not affect textarea layout.

### Rendering Staged Text

The input should communicate active staged or armed shortcut text without making that text part of the committed query.

Initial rendering direction:

- Render committed and staged text in a styled preview layer over or under the textarea.
- Keep only committed text selectable and copyable.
- Use metric-compatible staged styling first: color, opacity, background tint, underline, or outline that does not affect text layout.
- For `SPACE`, render at least a visible underlined blank width or tinted space area so the staged shortcut is discoverable.
- Avoid full shortcut-label chip styling inline until caret position, wrapping, and selection behavior are proven reliable.

Possible later rendering direction:

- Add a third absolutely positioned overlay element at the caret for rich shortcut-badge styling.
- Position that overlay using a textarea mirror and caret marker.
- Let the rich staged shortcut badge cover underlying committed text without affecting textarea layout until the text is committed.
- Use the overlay to render `Space`, `Q`, or `Qq` as keyboard-shortcut badges when layout reliability is proven.
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
- Parent/out behavior via `P` then `Enter`, with optional `Pp` fast confirmation.

Action menu items should be normal launcher items where practical. They can use the same staged target shortcuts and progressive action levels within the nested context.

## Desktop And Mobile Behavior

Desktop behavior:

- Arrow keys move focus across visible targets.
- Enter runs the focused target's primary action when safe and no shortcut buffer is active.
- Enter confirms the armed command when a shortcut buffer is active.
- Staged shortcut sequences provide faster direct access.

Mobile behavior:

- Staged shortcut sequences must be sufficient for focus, menu access, primary action, secondary action, global commands, and parent navigation.
- Arrow keys must not be required for any core operation.
- Shortcut labels can show the single letter, such as `Q`, while staged upgrades such as `Qq` and `Qqq` remain visible in the armed command row.
- The UI may add action labels or other affordances to indicate each target's primary and secondary actions, especially where fast actions are not obvious.
- Fullscreen or other text-priority modes may disable target shortcuts so capital letters commit normally, while keeping small global commands such as `F` then `Enter`, `L` then `Enter`, or `N` then `Enter` when useful.

## Bang Examples

### Search Bang Picker

For a bang result item:

- `Q`: focus the first bang result and show an armed command row.
- `Qq` then `Enter`: run `actions[0]`, such as `Insert bang`.
- `Qqq` then `Enter`: open the bang action menu.
- `Qqqq` then `Enter`: run `actions[1]`, such as `Add to My bangs` if available.

This keeps insertion fast without making the first `Q` sometimes focus and sometimes insert. The focused target is captured when `Q` arms, so later repeats and `Enter` act on the same target even if the list shifts.

### Bang Management

For a custom bang item:

- `Q`: focus the custom bang and show an armed command row.
- `Qq` then `Enter`: run the primary management action if safe.
- `Qqq` then `Enter`: open a menu with actions such as edit, move, duplicate, delete, or copy URL.
- `Qqqq` then `Enter`: run the secondary fast action when defined.

For bang groups:

- `U` to `O`: focus previous/current/next group slots.
- `Uu`, `Ii`, or `Oo` then `Enter`: run the aligned group primary action.
- `Uuu`, `Iii`, or `Ooo` then `Enter`: open the aligned group action menu.
- Four-key group sequences may run group secondary actions when defined.

Bang Management should avoid relying on hidden lists as the main way to switch sources. Group navigation should let users move between My bangs and engine bangs without arrowing through every item.

## Settings Examples

For a settings group:

- Group focus shortcut focuses the setting group header.
- Repeating the group shortcut arms the group primary action, such as toggle open/closed.
- A later repeat can arm the group menu with actions such as focus first option, expand, collapse, reset, or show matching options.

For a setting option item:

- Item focus shortcut focuses the option.
- Repeating the item shortcut arms the apply action, and `Enter` confirms it.
- Item menu can show details or related actions later.

## Open Questions

- What should the default progressive target action order be: focus, primary, menu, secondary; or focus, primary, secondary, menu?
- Should `Enter` on a first-level focused target shortcut confirm focus only, no-op, or run the primary action in some modes?
- Which modes, if any, should disable default wrapping for relative group navigation?
- Which modes should support single `SPACE` staging for `!`, and which should only support `SPACE SPACE` fast replacement?
- Which non-search modes, if any, should support `SPACE SPACE` to `!` with a timing window?
- Should global commands such as fullscreen, line wrap, Enter-newline behavior, and search submit keep repeated-key fast confirmation, or require `Enter` only?
- Which legacy global fast paths should remain supported: `FF`, `LL`, `NN`, `MM`, or `..`?
- What is the clearest visible control and label for Caps entry mode?
- Should hardware Caps Lock automatically imply Caps entry mode, or should it still allow shortcut initiators?
- Which cursor movement and blur cases should commit a candidate buffer versus cancel it?
- How rich can staged shortcut styling become before textarea mirror alignment becomes too fragile?

## Acceptance Criteria

- Items and groups can both be represented as launcher targets.
- Uppercase shortcut initiators are staged only when they match a currently valid shortcut in the active mode and context.
- Item and group shortcuts capture their addressed target when they first arm.
- Same-letter repeats upgrade the armed action for the captured target without requiring a timing window.
- `Enter` confirms the currently armed shortcut action.
- A pinned armed command row describes the current action, confirmation key, next upgrade when present, and cancellation path.
- The armed command row does not consume item shortcut slots or shift normal item indexing.
- Nonmatching text resolves staged shortcuts as literal input and restores the previous focus snapshot when possible.
- Backspace can cancel or downgrade visible shortcut buffers; full cancellation restores the previous focus snapshot when possible.
- Caps entry mode allows literal uppercase shortcut letters and has a visible escape path.
- Search-mode `SPACE` can stage `!` insertion in a bang-trigger context, and `SPACE SPACE` remains a fast path that commits `!` promptly.
- Staged shortcut text is visually distinct, while only committed text is selectable and copyable.
- Staged `SPACE` has visible inline treatment and an explicit armed command row.
- Global command shortcuts such as fullscreen, line wrap, Enter-newline behavior, and search submit can use staged confirmation with optional repeated-key fast confirmation.
- Action menus can be represented as nested launcher groups.
- Parent/out behavior has a dedicated shortcut and exits one nested context.
- Mobile users can operate launcher groups, items, menus, and actions without arrow keys.
