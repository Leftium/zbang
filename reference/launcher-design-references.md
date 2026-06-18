# Launcher Design References

## Purpose

This document captures design references, vocabulary, and tradeoffs for the launcher. It is intentionally less formal than the requirements spec. Durable product requirements should live in `specs/launcher-actions-requirements.md`.

## Related Apps

### Tuna

Tuna is a modern macOS launcher inspired by Quicksilver. Relevant ideas include modal interaction, extension support, fuzzy mode, combo mode, text mode, and talk mode.

Useful takeaways:

- A launcher can be a composition tool, not just a flat command list.
- Modes can make different kinds of work feel focused.
- Combo-style workflows support queued or multi-step actions.
- Text mode validates a textarea-first launcher experience.
- Extension/plugin systems should provide capabilities rather than one-off buttons.

### Quicksilver

Quicksilver is a key reference for subject, verb, target composition.

Useful takeaways:

- Start with an object, choose an action, then optionally choose a target.
- Small primitive actions can combine into many workflows.
- Composition should be keyboard-first and visible.

### LaunchBar

LaunchBar is a useful reference for fast direct actions, adaptive matching, URL handling, clipboard history, and send-to workflows.

Useful takeaways:

- Obvious one-shot actions should stay fast even when the system supports composition.
- The app should infer common cases such as URLs, calculations, and searches.
- Composition must not make frequent tasks slower.

### Alfred

Alfred is a useful reference for workflows, keywords, snippets, clipboard history, web searches, and user-configurable automation.

Useful takeaways:

- User-defined workflows and reusable presets are valuable.
- Keyword-triggered actions can coexist with menu-based discovery.
- Power features should remain optional.

### Raycast

Raycast is a useful reference for command discovery, extension packaging, keyboard navigation, and command detail views.

Useful takeaways:

- Extensions can feel consistent when the shell owns common UI patterns.
- Commands need metadata, descriptions, and discoverability.
- Detail views can support richer plugin UI without making every action custom.

### Drafts

Drafts is relevant because text is the central subject. Users capture text first, then decide what to do with it.

Useful takeaways:

- Text entry and text delivery can be separated.
- Actions can transform or route the same captured text.
- Repeated text workflows benefit from saved actions.

### TaskPaper

TaskPaper is useful because it shows how lightweight plain-text conventions can add structure without heavy UI.

Useful takeaways:

- Tags can act as readable metadata, such as `@today`, `@done`, or `@due(2026-06-20)`.
- Tags can be both content and filters.
- Structure can emerge from plain text instead of forms and dialogs.
- Projects, tasks, and notes can be represented by simple text patterns.
- Querying by tags can provide powerful focused views.

### nvAlt And Notational Velocity

nvAlt and Notational Velocity are useful because they unify search, creation, and editing in one text-first flow.

Useful takeaways:

- Search and create can be the same gesture.
- Incremental search should feel immediate.
- If no strong note match exists, creating a new note should be the natural next action.
- A flat note space can work when search and tags are strong.
- Keyboard-first navigation should make capture, search, and edit feel continuous.

Simplenote is a related reference for flat, searchable, synchronized notes with lightweight tags.

### PopClip

PopClip is useful for contextual text actions.

Useful takeaways:

- Relevant actions should appear near the current text context.
- Text transformations and deliveries can be small, focused actions.
- Action overload should be avoided through ranking and context.

### Shortcuts And Keyboard Maestro

Shortcuts and Keyboard Maestro are references for workflow composition and automation, but they are heavier than this launcher should feel.

Useful takeaways:

- Typed inputs and outputs make composition safer.
- Sequential workflows and fan-out workflows are both useful.
- The launcher should avoid becoming a full programming environment too early.

### Command Palettes

Examples include VS Code, Obsidian, and browser command palettes.

Useful takeaways:

- Fuzzy command search is a strong discovery mechanism.
- Plugin-provided commands need consistent labels and descriptions.
- Scoped command palettes can help users focus on one domain.

## Virtual Focus And Mobile-Friendly Shortcuts

The launcher should remain textarea-first: typed characters should continue to feel like they go directly into the input, especially on mobile. However, richer action rows may eventually need a way to select a row, expand options, cycle variants, or run secondary commands without moving real DOM focus away from the textarea.

One possible pattern is virtual focus. The textarea keeps real browser focus, while launcher state tracks an active action row. The active row is visibly highlighted and may expose a compact command strip such as `QQ Run`, `WW Expand`, or `EE Variant`.

Potential benefits:

- Mobile keyboards often lack arrow keys, but they do have letter keys.
- Virtual focus can reuse the existing repeated-key shortcut language instead of adding desktop-only navigation.
- Keeping real focus in the textarea preserves fast typing, shortcut entry, and post-action text editing.
- Focused rows can support richer interaction such as expand/collapse, provider variants, advanced sub-options, or grouped results.

Tradeoffs:

- Reusing `QQ` through `PP` for different meanings can become surprising unless the current mode is visually obvious.
- Changing existing `QQ` behavior from immediate activation to focus-first would slow down common one-shot actions.
- Triple-key patterns such as `QQQ` may be harder to time and explain than repeating the same double-key chord while a row is already selected.
- Modal behavior can feel brittle if normal typing, bang insertion, and action execution do not reliably clear or preserve virtual focus in predictable ways.

Safer exploratory model:

- Preserve current repeated-key shortcuts as immediate activation in normal mode.
- Enter virtual-focus/action mode through an explicit gesture, desktop arrow navigation, or a future dedicated shortcut.
- Inside virtual-focus mode, repurpose repeated-key chords for row-local commands and show the available commands directly on the active row.
- Use the same stable visible-action snapshot for virtual focus that shortcut activation uses, so filtering after the first shortcut tap does not retarget the action.
- After inserting a bang or running an action that returns to editing, clear virtual focus and keep or restore textarea focus.

Open questions:

- Should tapping an action focus it first or activate it immediately?
- Should desktop `ArrowUp` and `ArrowDown` enter the same virtual-focus mode, or should they remain purely text-editing keys unless a modifier is held?
- Should `Left` and `Right` map to group expansion and variant selection on desktop while mobile uses repeated-key commands for the same operations?
- Is there a discoverable dedicated action-mode shortcut that does not conflict with existing fast activation shortcuts?

## Composition Vocabulary

The launcher can be understood as composing a sentence:

```txt
Do [verb] to [subject] using/sending to [target].
```

Examples:

```txt
cats -> Search With -> Kagi
```

```txt
dictation text -> Clean Up -> Daily Note
```

```txt
meeting notes -> Save To -> Notes
```

```txt
cats -> Search With -> Google + Kagi + DuckDuckGo
```

### Subject

The thing being acted on.

Examples:

- Current textarea text
- Selected text
- Clipboard text
- Search history item
- Note
- URL
- Future dictation result

### Verb

The action being applied.

Examples:

- Search
- Translate
- Clean up
- Convert
- Save
- Open
- Append

### Target

The destination, provider, scope, or output location.

Examples:

- Google
- Kagi
- Papago
- Daily note
- Notes plugin
- Search history
- Browser tab

### Queue

A visible set of selected actions, transforms, deliveries, or constraints.

Examples:

- `[Google] [Kagi] [DuckDuckGo]` for fan-out search.
- `[Clean Dictation] [Append To Daily Note]` for sequential workflow.
- `[Notes Only]` as a scope constraint.

### Marker

A lightweight token embedded in or selected from text. Markers can represent actions, targets, scopes, commands, or metadata.

Examples:

- `!g` as a Google search action or target.
- `!translate(fr,en)` as a translation action with arguments.
- `@today` as note or task metadata.
- `@due(2026-06-20)` as metadata with a value.
- `@notes` as a scope constraint.

Markers are a possible unifying concept for bangs, TaskPaper-style tags, scopes, and inline commands.

### View

A componentized UI surface that renders standardized launcher context.

Views are different from actions. An action does work; a view shows a focused representation of the current subject, context, or plugin data.

Views are also different from modes. A mode chooses focus and behavior; a view chooses presentation.

Examples:

- Action list view.
- Search history list view.
- Notes search/editing view.
- Markdown preview view.
- Extracted links view.
- NLP/compromise visualization.
- QR code view.
- Bang discovery view.

### Everything

The broad default launcher scope. Everything is not necessarily an exhaustive list; it is the app-owned combined strategy for showing the most useful next results across modes, plugins, settings, saved data, and actions.

The root route can use Everything as its underlying scope while still feeling like a home state. Empty or vague input should bias toward mode discovery. Specific input should let other plugins join the list or outrank the mode list when they have stronger evidence.

Possible root results include:

- Modes such as Bangs, Search, Notes, History, Bookmarks, Compromise, and Settings.
- Direct actions for the current text.
- Matching notes, history items, bookmarks, or settings.
- Contextual maintenance items such as stale bang data.

`Everything` is preferable product language to `All` because it suggests broad search and action across the system without promising that every possible row is shown at once.

### Mode List

A plugin or plugin-like result group that lists available modes. It should dominate the root empty state, filter by the textarea value, and yield when another plugin has stronger evidence for a specific query.

Useful behavior:

- Empty input shows the main modes as orientation cards or rows.
- Short mode-like input filters modes by label, aliases, and descriptions.
- Exact mode matches navigate directly to the focused route.
- Query text can be carried into a focused mode when useful.
- The mode list can coexist with other plugins instead of making the root route a separate static portal.

The mode list should read from the same registry used by routing so built-in and user-installed modes appear consistently.

### Mode Routes

Modes are durable URL-addressable launcher scopes. Stable built-in modes can use explicit top-level routes for clean URLs, while installed or dynamic plugin modes should use a namespaced route such as `/m/[modeId]`.

Suggested shape:

- `/` for Everything/home.
- `/bangs`, `/compromise`, `/search`, `/notes`, `/history`, `/bookmarks`, and `/settings` for stable built-in modes.
- `/m/[modeId]` for installed or dynamic modes.
- `/settings/[pluginId]` or equivalent later if plugin-specific settings need deep links.

Avoid using a catch-all top-level optional mode route as the main strategy unless plugin modes intentionally own the entire first path segment namespace. A namespace prevents collisions with app routes, API routes, callbacks, note slugs, bookmark slugs, and future first-party pages.

### Mode Registry

A shared registry should describe all available modes rather than hard-coding mode lists in individual pages.

Potential fields:

- Stable mode ID.
- Human label and description.
- Search aliases.
- Canonical route.
- Owning plugin, if any.
- Built-in vs installed/source metadata.
- Default view or componentized view choice.
- Plugin groups to include, exclude, boost, or suppress.
- Scoring hints and eligibility gates used by mode discovery.

This lets one installed plugin provide zero, one, or many modes. A plugin route, if added, should describe or manage the plugin itself; user-facing workflows should usually route to modes.

### Settings Mode

A control-surface mode where each setting is represented as a launcher item. Collapsed setting rows should show the setting title, a short description, and the current value. Expanded rows may render mode-specific controls while keeping the same list, filtering, keyboard, and route model as other modes.

Examples:

- `Color scheme` with current value `System`, expanded into System, Light, and Dark choices.
- `Bang data` with provider and age, expanded into provider selection, refresh, and reminder controls.
- `Search provider` with current default, expanded into provider choices.

Settings should be searchable from Settings mode. Individual setting items may also appear in Everything when a query strongly matches them or when a contextual warning deserves attention.

## Benefits Of Composability

- Reuse: the same action can work with many subjects or targets.
- Smaller plugins: plugins can provide capabilities instead of complete workflows.
- Multiplicative power: subjects, verbs, and targets can combine without hard-coding every combination.
- User personalization: users can create reusable queues and workflows.
- Better experimentation: plugins can be developed in isolation and combined later.
- Better focus: modes can limit the composition space instead of changing the whole app.

## Risks Of Composability

- Discoverability can drop when users do not know what can combine.
- Too many combinations can make the interface noisy.
- Intent can be ambiguous for short inputs.
- Modes and constraints can hide actions unexpectedly.
- Users may not know what pressing Enter will do.
- Some actions do not compose naturally.
- Ranking and debugging become harder.
- The product can drift into feeling like a programming environment.

## Design Principles

- Keep simple one-shot actions fast.
- Make composition progressive, not mandatory.
- Show composed state visibly with chips or equivalent UI.
- Make modes and constraints visible.
- Rank the best next actions instead of listing every possible combination.
- Use compatibility rules so invalid combinations do not appear.
- Prefer curated compositions and presets for common workflows.
- Keep syntax optional when a UI path can provide the same result.
- Require confirmation for destructive or ambiguous actions.
- Explain ranking and hidden actions in development/debug views.
- Preserve plain-text readability when markers are saved as content.
- Convert launcher-only markers into visible chips so hidden state stays understandable.
- Let plugins provide focused views without requiring every plugin to abandon the shared launcher UI.
- Keep views driven by standardized context so they can be composed with modes, actions, markers, and ranking.

## Componentized Views

The earlier componentized views idea maps well to plugin-provided views.

A view should render content based on the current launcher context. It may show a list of selectable items, a preview, a visualization, or a richer plugin-specific surface.

Useful view examples:

- Search history filtered by the textarea.
- Bangs filtered by the textarea.
- Markdown preview of the textarea.
- Links extracted from the textarea.
- Compromise/NLP visualization of the textarea.
- Textarea rendered as a QR code.
- Notes search/create/edit interface.

Views can support both user workflows and development. A plugin can be developed in isolation by giving it a focused mode and a focused view before deciding how it should participate in all-mode.

Views should receive standardized input where practical:

- Textarea value.
- Parsed markers.
- NLP signals.
- Clipboard input or availability.
- Current mode and scope.
- Queued chips/actions.
- Selected item.
- History or usage signals.

This keeps views from becoming unrelated mini-apps and lets them participate in the same launcher model as actions and plugins.

## Compromise/NLP Debug Composition

The compromise expression evaluator is a useful prototype for composition because it introduces a second editable input: the
sample text is the subject, and the expression is a lens or tool applied to that subject.

Current model:

```txt
sample text (`q`) + expression (`expr`) -> inspected result
```

This is useful, but it raises a broader UX question: when a mode needs its own input, should that input live in a separate
panel, become another shared editor layer, or be folded into one editable artifact?

### Layered Editor Option

One option is a cascade of shared editor layers. The app owns the textarea affordances, while the focused mode contributes
layer definitions, presets, and output rendering.

Example layers:

```txt
Text: I met Barack yesterday at Starbucks.
Expression: doc.people().json()
Result: [...]
```

Useful behavior:

- Show inactive layers as compact previews with edit affordances.
- Use one high-quality editor surface for the active layer.
- Make preset chips apply to the active layer.
- Keep both source text and expression visible enough that users do not lose context.
- Let layer values map cleanly to URL params such as `q` and `expr`.

This preserves the difference between source text and tool input while still letting every layer reuse shared textarea features.

### Single Scratchpad Option

Another option is to make the compromise editor a small JS scratchpad containing both the sample text and the expression.

Example:

```js
const text = `I met Barack yesterday at Starbucks.`;
const doc = nlp(text);

doc.people().json();
```

The result view would display the value of the final expression, or possibly a returned value if the script uses `return`.

Useful behavior:

- One editable artifact contains the full repro.
- Preset chips can set complete scripts instead of only API expressions.
- Shared URLs can use a script-like param containing the whole repro.
- The scratchpad can scale from one-liners to multi-step debugging examples.

Tradeoffs:

- It is more programmer-oriented than separate labeled inputs.
- It duplicates or replaces the main `q` input, so URL semantics need a clear decision.
- Last-expression evaluation is ergonomic but requires compilation/parsing if multiline scripts should behave like a real console.
- Arbitrary JS remains a prototype-only safety tradeoff unless sandboxing is added later.

If this direction is explored, prefer a new script-like URL param over silently overloading `q`. Existing `q` plus `expr`
URLs can remain the simpler expression mode or be converted into a default scratchpad template.

### Preset Implications

Preset chips should stay conceptually simple: they set or insert the value of the current editable surface.

Depending on the chosen model, a compromise preset may set:

- Only the expression layer, such as `doc.dates().get()`.
- Only the sample text layer, such as a curated ambiguity example.
- A complete scratchpad script containing both sample text and expression.

This keeps presets compatible with both layered and scratchpad composition without committing to either implementation yet.

## Markers, Bangs, And Tags

Bangs and TaskPaper-style tags are similar because both are compact text tokens that add meaning to nearby text.

A bang can be viewed as an operational marker, often backed by a template:

```txt
!g = https://google.com/search?q={query}
```

A TaskPaper-style tag can be viewed as a content marker:

```txt
buy milk @today @errand
```

The same generic marker system could support both, while letting each marker declare its role.

Possible marker roles:

- Action: queue or run a verb.
- Target: choose a provider or destination.
- Scope: limit what plugins or results appear.
- Metadata: attach readable tags or state to saved content.
- Template: fill a URL or text template.
- Command: change launcher state.

Operational markers usually affect the launcher and should become chips when selected. Content markers usually describe the text and should remain readable in saved notes, tasks, or history.

Some syntax may be ambiguous. For example, `@notes` could be a scope in the launcher or a tag in saved content. The current mode, selected completion, and plugin interpretation should decide whether it becomes a chip, stays in text, or is copied to metadata.

This model supports the observation that search bangs are similar to fancy bookmarks with template variables. A bookmark, bang, note tag, or task tag can all be represented as a named marker with behavior or metadata attached.

### Installed Bangs And Provider Fallback

Search bangs should use an opt-in trust model. The provider catalog is useful for discovery, but zbang should only
execute bangs locally after the user installs them. This avoids treating the entire long tail of provider bangs as trusted
local actions while still preserving native provider behavior.

Useful states:

- Available: present in the selected provider catalog.
- Installed: approved by the user for local zbang execution.
- Queued: selected for the current query or reusable workflow.

When the textarea contains multiple bangs, zbang can split the query into local targets and provider fallback instead of
requiring an all-or-nothing decision.

Example:

```txt
!w !foo cats
```

If `!w` is installed and `!foo` is not installed, the composed execution plan is:

```txt
Local fan-out:
Wikipedia -> cats

Provider fallback:
Kagi or DuckDuckGo -> !foo cats
```

This preserves two important properties:

- zbang only locally executes bangs the user installed.
- Uninstalled or unknown bangs still work through the configured provider.

The main risk is surprise from partial handling. The mitigation is not to collapse the behavior into a vague primary
button. The primary action can stay compact, such as `Run 2 actions`, while a nearby composition preview explains what
Enter will do.

Possible preview:

```txt
Query: cats
Targets: [!w Wikipedia]
Forwarded: [!foo via Kagi]
```

For a fully installed fan-out query:

```txt
!w !gi cats
```

The preview can show:

```txt
Query: cats
Targets: [!w Wikipedia] [!gi Google Images]
```

For known but uninstalled catalog bangs, the action list can offer installation without changing what Enter currently
does:

```txt
Install Foo bang
Install Foo and search
Continue with Kagi fallback
```

This makes installation a progressive enhancement rather than a compatibility wall. Raw provider bang behavior remains
available, while installed bangs gain better ranking, local fan-out, reusable queues, and clearer composition UI.

## Notes UX

The notes plugin should draw heavily from nvAlt and Notational Velocity.

The central interaction is:

```txt
type once -> search existing notes -> create or edit if needed
```

In notes mode, the same input should support searching, creating, and editing notes without switching to a separate form.

Useful notes-mode behavior:

- Empty input shows recent notes.
- Short input searches note titles first, then note content.
- Exact title match ranks open/edit first.
- No strong match ranks create note first.
- Multiline input ranks create, append, or update actions higher than broad search.
- Tags such as `@today` or `@project(zbang)` can filter notes or become note metadata.
- URL input can rank save URL as note or bookmark actions higher.

The same notes plugin can participate differently in all-mode and notes-mode.

In all-mode, note results and create-note actions should appear when relevant but should not overwhelm web search or other common actions.

In notes-mode, note actions should be strongly prioritized and unrelated plugins should be hidden or deprioritized.

Notes can act as subjects, targets, scopes, or content:

- Subject: open, edit, summarize, or search within an existing note.
- Target: save current text to a note or append to a daily note.
- Scope: limit results to notes.
- Content: current textarea text becomes the note body or title.

Simplenote could eventually serve as a storage backend, but the UX should not depend on a specific backend.

## Modes And Focus

Modes should help users and developers focus on a subset of plugins or capabilities.

Examples:

- All mode
- Web/search mode
- Search history mode
- Notes mode
- Search bangs mode
- Text manipulation mode
- Settings/config mode
- Bookmarks mode
- Tasks mode
- Calendar mode
- Compromise/NLP inspection mode

Modes should be URL-addressable and visible. A mode should make it clear why certain plugins or actions appear and why others do not.

## Inline Triggers

Inline triggers can help users discover and queue actions without leaving the textarea.

The first likely trigger is `!` for bang/action completion. It should activate only when the previous character does not exist or is whitespace.

Bang completion should behave more like a slash menu than cursor-location search. The menu opens because the user typed a trigger at a valid boundary; it should not reopen merely because the cursor later moves to an existing `!` token. This keeps prose punctuation such as `Hello!` from summoning bang suggestions and makes completion feel intentional.

For the initial implementation, using the main launcher list as the bang picker is acceptable and keeps keyboard navigation, ranking, and mobile layout simple. While bang picking is active, the main list should show bang catalog/install items prominently or exclusively, with ordinary search provider buttons suppressed. A slash-style popup may become worthwhile later if inline composition needs stronger visual anchoring, multiple trigger grammars, or independent main-list results.

Future triggers may have separate meanings:

- `!` queues delivery actions, especially bangs and external tools.
- `/` runs launcher or system commands.
- `@` scopes the launcher to a domain, target, or plugin.
- `#` adds tags or labels.

These should share one generic trigger system instead of becoming separate unrelated command systems.

## Open Questions

- How much composition should be exposed before the core one-shot launcher feels stable?
- Which modes are user-facing versus development-only?
- Which actions are safe enough to run with Enter?
- How should ranking explanations be shown without cluttering the main UI?
- How should saved queues or presets be named and reused?
- When should syntax remain visible in the textarea versus being converted into chips?
- How should ambiguous markers such as `@notes` choose between scope and metadata?
- Should note editing happen directly in the launcher textarea, a side panel, or a richer plugin detail view?
- Which views should be available inside all-mode versus only inside focused modes?
