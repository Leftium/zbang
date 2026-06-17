# Launcher Actions Requirements

## Purpose

The app should evolve from a textarea with fixed buttons into a launcher-style interface, similar in spirit to Raycast or macOS Spotlight. Users enter or paste text, then the app suggests relevant actions for that text.

Actions should feel self-contained and installable so new capabilities can be added without hard-coding every button into the main page.

Related apps, composition vocabulary, and design tradeoffs are tracked separately in `reference/launcher-design-references.md`.

## Goals

- Present relevant actions for the current text input.
- Rank actions using heuristics, context, and eventually usage history.
- Let pressing Enter usually run the highest-ranked safe action.
- Support actions that can be added, removed, queued, reused, and eventually installed locally by users.
- Keep the launcher flexible enough for search bangs, notes, search history, text transformations, and dictation workflows.
- Support composition as a core concept while keeping simple one-shot actions fast.

## Action Categories

Actions should be categorized by what they do with text.

### Text Entry

Text entry actions bring text into the launcher.

Examples:

- Paste from clipboard
- Insert from clipboard history
- Reuse search history
- Load note content
- Future dictation input

This category is most useful when the textarea is empty or when the user wants to reuse existing text.

### Text Transformation

Text transformation actions convert the current input into another form.

Examples:

- Arithmetic
- Currency conversion
- Unit conversion
- Dictation cleanup
- Translation
- Text formatting
- Summarization
- URL or entity extraction

This category is useful when the current text is not yet ready for delivery or when the user wants a derived result.

### Text Delivery

Text delivery actions send the current text somewhere.

Examples:

- Web search
- Search bangs
- Open search results in external tabs
- Create or append to notes
- Open URL
- Send to a future external tool or API

This category is most useful when the input is ready to act on.

## Plugins

Plugins should be bundles of actions rather than single buttons. A plugin may provide one or more entry, transformation, delivery, navigation, or system actions.

Examples:

- A search plugin may provide web search and provider-specific search actions.
- A bangs plugin may provide many delivery actions.
- A notes plugin may provide entry, delivery, and navigation actions.
- A history plugin may provide entry and ranking signals.

The initial plugin format can be TypeScript modules. User-installed or local plugins are a future goal and should remain compatible with the same general model.

Some plugins may eventually need custom UI, but the default action model should not require custom UI.

Plugins may also provide componentized views for richer output or focused workflows. Views should render standardized launcher context rather than relying on plugin-specific global state.

Examples of plugin-provided views include search history lists, markdown previews, extracted link lists, NLP/compromise visualizations, QR code rendering, bang lists, and notes search/editing views.

Views should help plugins work in isolation during development while still fitting into the shared launcher model.

## Launcher Context

Actions, views, ranking, and heuristics should consume a shared launcher context.

The context should eventually include:

- Raw textarea value.
- Normalized or trimmed text.
- Parsed markers.
- Queued actions and chips.
- Current mode and scope.
- NLP or compromise-derived signals.
- Clipboard availability or clipboard input.
- Search history or usage signals.
- Selected item or active result when applicable.

The shared context should let plugins and views interoperate without each feature inventing its own input model.

## Composition

The launcher should support composing text-centered workflows from subjects, verbs, and targets.

- A subject is the thing being acted on, such as current text, selected text, clipboard text, a note, a URL, or a search history item.
- A verb is the action being applied, such as search, translate, clean up, convert, save, open, or append.
- A target is the destination, provider, scope, or output location, such as Kagi, Google, Papago, a daily note, search history, or a browser tab.

Composition should be progressive. Users should be able to run obvious one-shot actions without understanding the full composition model, while power users can queue actions, choose targets, and apply scopes.

Composed state should be visible so users understand what pressing Enter will do. Queued actions, targets, modes, and constraints should appear as chips or an equivalent visible UI.

## Ranking And Heuristics

The launcher should decide which actions appear first based on the current input and context.

Ranking should eventually consider:

- Whether the input is empty.
- Whether the input looks like a question.
- Whether the input includes URLs, dates, emails, names, places, organizations, or other recognizable entities.
- Whether the input looks like a command, calculation, conversion, search query, note, or long-form text.
- Whether the action is safe to run as the primary Enter action.
- User behavior over time, especially frecency.
- Explicit scopes or constraints selected by the user.

The project should experiment with `compromise` for natural-language heuristics. These experiments should help identify useful signals, not force plugins to depend directly on one NLP library.

## Enter Behavior

Pressing Enter should usually run the top-ranked action, matching launcher expectations.

Exceptions should be supported when:

- The top action is destructive or state-changing.
- The action requires confirmation.
- The input is incomplete.
- The top-ranked result is ambiguous.
- The launcher is in text-editing mode where Enter inserts a newline.
- A queued workflow is active and Enter should run the queue instead.

## Queued Actions

Users should eventually be able to queue actions and reuse those queues.

Primary use cases:

- Queue multiple search bangs such as `!g !k !ddg` to launch several search tabs with the same query.
- Reuse a queue of tools for repeated work, such as translating many words with both Google Translate and Papago.
- Apply cleanup transformations before final delivery, especially for dictation input.
- Use queued constraints to affect which actions appear, such as limiting results to notes or search history.

Queued actions should support both sequential workflows and fan-out workflows.

Examples:

- Sequential: dictated text -> cleanup -> create note
- Fan-out: search query -> Google search + Kagi search + DuckDuckGo search

Queued actions may include transformations, deliveries, and constraints. Constraints do not directly deliver text; they change what actions or results are considered relevant.

## Modes

The launcher should support modes that focus the interface on one plugin or a related group of plugins.

Modes should support both users and development workflows. Examples include search history, notes, search bangs, settings/config, text manipulation, bookmarks, tasks, calendar items, and compromise/NLP inspection.

Modes should be URL-addressable so a user or developer can open a focused launcher state directly.

The current mode should be visible in the UI. Users should understand why certain plugins or actions are not appearing, and they should have a clear way back to the default all-mode.

Modes may limit plugins, boost plugins, or adjust scoring criteria. Modes and temporary constraints should share the same underlying concept where practical, but modes are durable and URL-addressable while constraints are usually temporary and query-specific.

A mode may choose a specialized view when a focused UI is more useful than the default action list. For example, notes mode may use a notes search/editing view, history mode may use a history list, and compromise mode may use an NLP visualization.

Compromise/NLP mode should remain a development-friendly place to explore composition. Its expression evaluator may evolve
into either layered mode-specific inputs or a single shareable scratchpad that contains both sample text and evaluator code.
The product requirement is not the specific implementation; it is that editable mode-specific inputs should reuse shared
launcher affordances where practical and should be URL-addressable for reproducible debugging.

## Inline Triggers

The launcher should eventually support inline triggers that open completion menus while typing.

The first trigger should be `!` for bang/action completion. It should activate only when the previous character does not exist or is whitespace.

Selecting a completion should queue the corresponding action as a visible chip rather than leaving raw trigger text as normal query text.

The trigger system should be extensible. Future triggers may support launcher commands, scopes, tags, or targets, but they should share a common trigger model instead of becoming unrelated command systems.

## Markers And Tags

Search bangs, TaskPaper-style tags, scopes, and command triggers should be treated as related forms of lightweight text markers.

Markers should be able to affect launcher behavior, attach metadata to content, or both.

Examples:

- `!g` can represent a Google search delivery action backed by a URL template.
- `@today` can represent task or note metadata.
- `@due(2026-06-20)` can represent metadata with a value.
- `@notes` can represent a temporary scope when used as a launcher constraint.

The launcher should distinguish operational markers from content markers.

- Operational markers affect the launcher, such as queueing an action or applying a scope. They should usually become visible chips and be removed from the payload text.
- Content markers describe the text itself, such as note or task tags. They should usually remain readable and editable as plain text when saved.

Plugins should be able to define how their markers are interpreted so the same generic marker system can support bangs, notes, tasks, history, bookmarks, and future plugin types.

## Search Bangs

Search bangs should be treated as launcher actions, not special cases in the page.

They should support:

- Provider-specific searches.
- Multiple bangs in one input.
- Reusable bang queues.
- High ranking when the input begins with a recognized bang.

Search bangs are primarily text delivery actions.

## Notes

Notes should be treated as plugin-like capabilities.

The notes experience should draw from nvAlt and Notational Velocity: searching, creating, and editing notes should feel like one continuous text-first interaction.

Possible note actions include:

- Create a note from current text.
- Create a note when no strong match exists.
- Append text to a note.
- Append text to a daily note.
- Search notes.
- Open a matching note.
- Edit a selected note.
- Save URL or page context as a note.
- Search or create notes using plain-text tags.

Notes may eventually need custom UI and storage, but they should still participate in the same launcher action and ranking model.

In notes-focused modes, the launcher should prioritize recent notes, matching notes, exact title matches, create-note actions, and append/update actions over unrelated plugins.

## Search History

Search history should also behave like a plugin, while also contributing shared ranking signals.

Possible history actions include:

- Reuse a previous search.
- Show recent searches matching the current input.
- Re-run a previous search.
- Remove a history item.

History data should eventually support frecency-based ranking across actions and plugins.

## Future Considerations

- Local or user-installed plugins.
- Custom plugin UI for richer workflows.
- Saved queues or presets.
- Frecency-based ranking.
- Dictation input and cleanup workflows.
- Scoped launcher modes such as notes-only or history-only.
- Simplenote or other note backend integrations.
