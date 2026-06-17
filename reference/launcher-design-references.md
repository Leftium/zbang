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
