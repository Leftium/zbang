# Text Signal Modes

## Purpose

Expand the launcher beyond compromise-specific NLP inspection into a broader set of text analysis modes. These modes should make pasted text more actionable by identifying structure, technical artifacts, sensitive material, formatting, encoding quality, and other signals that compromise does not directly provide.

Compromise remains useful for linguistic signals and for utility functions on top of those signals. The broader signal layer should not duplicate compromise by default. It should focus first on capabilities compromise cannot provide, then use compromise results where they add meaning, normalization, or transformations.

## Goals

- Treat major non-compromise signal categories as focused launcher modes.
- Support sub-modes where a category is too broad for one view.
- Allow a combined mode that ranks the most actionable signals across all categories.
- Make overlap explicit so duplicate detections can be compared, merged, or shown with source attribution.
- Implement signals only when a concrete launcher row, action, mode, or debugging need requires them.
- Use compromise utilities where they improve actions or display, not only as raw detections.

## Mode Model

Each mode should answer one question well: "What useful things can we learn about this text from this perspective?"

Suggested top-level modes:

- Compromise
- Document Basics
- Language And Script
- Character Distribution
- Numbers And Values
- Technical Signals
- Sensitive Signals
- Intent Signals
- Formatting Signals
- Combined Signals

The current compromise mode can continue to be development-oriented. New signal modes should be useful in the launcher as well as in inspector views.

Non-compromise modes should not initially reimplement compromise selectors unless they need a different behavior, better span fidelity, stronger validation, or an action-oriented interpretation.

## Shared Signal Shape

Signal extractors should eventually return a normalized shape so modes can render consistently and combined mode can rank results without knowing every extractor implementation.

```ts
type TextSignal = {
	id: string;
	mode: string;
	category: string;
	label: string;
	value: string;
	count?: number;
	examples?: string[];
	severity?: 'info' | 'notice' | 'warning';
	source?: 'regex' | 'compromise' | 'statistical' | 'heuristic' | 'parser';
	actionable?: boolean;
};
```

The exact type can change during implementation. The important part is that every extractor produces displayable rows and can preserve where each signal came from.

## Modes

### Compromise

Focus: NLP, grammar, compromise-provided selectors, and compromise utility functions.

Signals:

- URLs
- Emails
- Phone numbers
- Hashtags
- Mentions
- Emoji and emoticons
- Money
- Percentages
- Fractions
- Acronyms
- Hyphenated text
- Quotations
- Parentheses
- TF-IDF keywords
- Existing NLP rows such as people, places, organizations, dates, nouns, verbs, adjectives, adverbs, questions, and topics

Utilities:

- Normalization and text output helpers
- Term, sentence, phrase, and match manipulation
- Inflection and conjugation helpers
- Topic, keyword, and TF-IDF ranking helpers
- Date, value, and entity methods from loaded plugins
- Selection and transformation chains that can become launcher actions

Overlap:

- Technical Signals may also detect URLs, domains, paths, and markdown links.
- Numbers And Values may also detect money, percentages, fractions, dates, times, and measurements.
- Formatting Signals may also detect quotes, parentheses, and hyphenated text.
- Intent Signals may overlap with questions and verbs.

Implementation note:

- Keep compromise-specific methods and selectors visible for debugging.
- Combined mode should not require callers to know compromise selector syntax.
- Prefer calling compromise for linguistic interpretation instead of rebuilding NLP selectors in other modes.
- Treat compromise utilities as candidates for actions, not just insight rows.

### Document Basics

Focus: simple size and readability metrics.

Signals:

- Character count
- Byte count
- Word count
- Line count
- Sentence count
- Paragraph count
- Empty line count
- Longest line length
- Longest word length
- Average word length
- Average sentence length
- Whitespace ratio
- Short, medium, long, or very long paste classification

Sub-modes:

- Size
- Readability
- Lines And Paragraphs

Overlap:

- Character Distribution also counts classes of characters.
- Formatting Signals may use line and paragraph structure to detect lists, tables, and markdown blocks.

Launcher use:

- Surface only useful summaries such as `248 words`, `12 lines`, `long paste`, or `dense text`.

### Language And Script

Focus: language, writing system, encoding quality, and mixed-script text.

Signals:

- Likely language
- Script detection: Latin, Cyrillic, Arabic, Hebrew, Han, Hangul, Hiragana, Katakana, Devanagari, Thai, and other Unicode scripts
- Mixed-script text
- ASCII ratio
- Unicode ratio
- Right-to-left character presence
- Diacritics and accented character presence
- Replacement characters
- Zero-width characters
- Suspicious invisible characters
- Control characters

Sub-modes:

- Language
- Script
- Encoding Quality
- Invisible Characters

Overlap:

- Character Distribution counts character classes and may detect control characters.
- Sensitive Signals may care about invisible characters when they are used for obfuscation.
- Formatting Signals may care about right-to-left text for display behavior.

Launcher use:

- Surface rows like `English`, `mixed Latin/CJK`, `RTL text`, `zero-width characters`, or `invalid replacement characters`.

### Character Distribution

Focus: raw character composition and suspicious density patterns.

Signals:

- Uppercase count and ratio
- Lowercase count and ratio
- Digit count and ratio
- Letter count and ratio
- Punctuation count and ratio
- Symbol count and ratio
- Whitespace count and ratio
- Emoji count
- Repeated character runs such as `!!!!!` or `aaaaaa`
- Excessive capitalization
- Excessive punctuation
- Non-printable characters

Sub-modes:

- Character Classes
- Repetition
- Density Warnings

Overlap:

- Document Basics includes whitespace ratio.
- Language And Script includes Unicode, control, and invisible-character concerns.
- Intent Signals may use punctuation and capitalization for urgency.

Launcher use:

- Surface only notable results such as `mostly uppercase`, `many symbols`, `repeated punctuation`, or `contains non-printable characters`.

### Numbers And Values

Focus: values that users may want to copy, convert, calculate, or act on.

Signals:

- Integers
- Decimals
- Negative numbers
- Ordinals
- Currency-like values
- Percentages
- Fractions
- Numeric ranges
- Measurements with units
- Dates
- Times
- Durations
- Time zones
- Version numbers

Sub-modes:

- Numbers
- Currency
- Units
- Dates And Times
- Versions

Overlap:

- Compromise detects money, percentages, fractions, and dates.
- Technical Signals may detect software versions and CSS units.
- Formatting Signals may detect table columns that contain values.

Launcher use:

- Surface rows like `3 prices`, `2 dates`, `v1.2.3`, `5 measurements`, or `range 10-20`.

Implementation note:

- Start only where compromise is weak or where stronger validation is needed, such as version numbers, units, durations, ranges, and technical numeric formats.
- Use compromise for money, percentages, fractions, and dates unless a non-compromise extractor clearly improves accuracy or actionability.
- Do not try to normalize every unit or date in the first pass.

### Technical Signals

Focus: artifacts common in developer text, logs, docs, and pasted commands.

Signals:

- URLs
- Domains
- IP addresses
- Email addresses
- File paths
- File extensions
- Markdown links
- Code blocks
- Inline code
- JSON-looking text
- YAML-looking text
- Shell commands
- Environment variables
- UUIDs
- Hashes and checksums
- Base64-looking strings
- JWT-looking strings
- Hex colors
- CSS units
- Package names

Sub-modes:

- Links And Addresses
- Code And Markup
- Files And Paths
- Data Formats
- Identifiers And Tokens
- Web And CSS
- Packages

Overlap:

- Compromise detects URLs and contact-like values.
- Sensitive Signals reuses token, JWT, hash, and env-var detection but applies risk scoring.
- Formatting Signals detects markdown code blocks and inline code.
- Numbers And Values detects versions and measurements that may appear in technical text.

Launcher use:

- Surface rows like `3 URLs`, `2 file paths`, `JSON-like`, `1 shell command`, `4 env vars`, or `JWT-like string`.

Implementation note:

- This mode is broad enough to implement as multiple sub-modes.
- Keep security judgment out of this mode except for neutral labels like `token-like string`.
- Prefer technical patterns compromise does not own: file paths, IPs, code fences, inline code, data formats, shell commands, env vars, UUIDs, hashes, base64-like strings, JWT-like strings, hex colors, CSS units, and package names.
- Revisit URLs, emails, and phone numbers only when the launcher needs stronger validation, span fidelity, or direct actions beyond compromise rows.

### Sensitive Signals

Focus: potentially private, secret, or risky text.

Signals:

- API-key-looking tokens
- Bearer tokens
- Private key blocks
- Password-like assignments
- Secret-like environment variable names
- Credit-card-looking numbers
- SSN-like patterns
- High-entropy strings
- JWT-like strings
- Base64 or hex blobs
- Suspicious obfuscation
- Invisible characters used in otherwise normal-looking text

Sub-modes:

- Secrets
- Personal Data
- Payment Data
- Obfuscation
- Entropy

Overlap:

- Technical Signals identifies many raw artifacts that become sensitive after risk scoring.
- Language And Script and Character Distribution can feed invisible-character and obfuscation warnings.
- Numbers And Values may detect numeric patterns that Sensitive Signals classifies as private or risky.

Launcher use:

- Surface warnings such as `possible API key`, `private key block`, `possible credit card`, or `high-entropy string`.

Implementation note:

- Start conservative to avoid noisy false positives.
- Never display full secret examples in launcher rows; show redacted snippets.

### Intent Signals

Focus: what the text appears to ask for or imply the user may want to do.

Signals:

- Questions
- Commands and imperatives
- Todo/action phrases
- Urgency
- Negation
- Uncertainty
- Contact requests
- Scheduling intent
- Purchase or payment intent
- Error-report intent
- Bug-report intent
- Search-query-like text

Sub-modes:

- Questions
- Actions
- Urgency
- Uncertainty
- Requests
- Errors

Overlap:

- Compromise can detect questions, verbs, and some grammar cues.
- Character Distribution can feed urgency via capitalization and punctuation.
- Technical Signals can feed error-report intent via stack traces, file paths, versions, and commands.

Launcher use:

- Surface rows like `question`, `todo`, `urgent`, `error report`, `scheduling request`, or `search query`.

Implementation note:

- Keep early heuristics transparent and inspectable.
- Avoid pretending to understand intent with high confidence when the text is ambiguous.

### Formatting Signals

Focus: visible structure and markup conventions.

Signals:

- Markdown headings
- Bulleted lists
- Numbered lists
- Task lists
- Tables
- Blockquotes
- Code fences
- Inline code
- Links
- CSV-like rows
- TSV-like rows
- Repeated delimiters
- Indentation depth
- Quoted sections
- Parenthetical sections
- CamelCase terms
- snake_case terms
- kebab-case terms

Sub-modes:

- Markdown
- Lists
- Tables
- Delimited Text
- Quotes And Parentheses
- Identifier Case

Overlap:

- Compromise detects quotations, parentheses, and hyphenated text.
- Technical Signals detects code fences, inline code, links, and identifiers.
- Document Basics supplies line and paragraph counts needed for structure detection.

Launcher use:

- Surface rows like `Markdown`, `3 headings`, `table-like`, `CSV-like`, `code block`, or `task list`.

### Combined Signals

Focus: a ranked summary across every enabled mode.

Ranking priority:

1. Sensitive warnings and risky content.
2. Directly actionable artifacts such as URLs, emails, phone numbers, file paths, commands, and dates.
3. Technical structure such as JSON, markdown, stack traces, versions, and env vars.
4. Intent such as question, todo, urgency, error report, or scheduling request.
5. Values such as money, percentages, measurements, and ranges.
6. Document-level metadata such as language, length, and script.
7. General NLP keywords and entities.

Combined mode should dedupe overlapping findings and preserve source attribution when useful.

Examples:

- A URL found by both compromise and Technical Signals should appear once, with sources `compromise` and `regex` if the UI exposes provenance.
- A date found by compromise and Numbers And Values should appear once, with the more actionable normalized value if available.
- A JWT-like string should appear under Technical Signals, but Combined Signals should elevate it as a Sensitive warning.

## Overlap Policy

Overlap is expected and useful during development. The product should not force every signal into exactly one category.

Rules:

- Modes may independently detect the same text span.
- Combined mode owns deduplication and ranking.
- Signal rows should preserve their source where possible.
- A neutral detector should not make risk claims unless it belongs to Sensitive Signals.
- A higher-risk interpretation may wrap or elevate a neutral signal.
- Inspector views should make duplicates visible enough to compare extractor quality.

## Implementation Order

Implementation should be demand-driven rather than category-complete. Do not build every signal in a category just because the category exists. Start from the launcher or inspector behavior we want, then add the smallest extractor needed to support that behavior.

This is effectively reverse order from the taxonomy:

1. Decide what Combined Signals or launcher behavior should show.
2. Identify the missing signal needed for that behavior.
3. Implement the smallest focused extractor for that one signal or sub-mode.
4. Add it to the relevant focused mode only if inspection is useful.
5. Repeat when another behavior requires another signal.

The sequence below is a priority guide for choosing the next useful signal, not a requirement to finish each category.

### 1. Combined-First Signal Skeleton

Reason:

- The launcher needs ranked useful findings more than it needs complete category dashboards.
- A shared signal shape, dedupe path, and rendering path let each future signal land independently.
- Avoids overbuilding extractors that have no immediate UI or action.

Deliverables:

- Add a minimal shared signal type or local equivalent.
- Add a combined signal collection path that can accept compromise rows and future non-compromise rows.
- Add enough ranking to put warnings and actionable rows above passive metadata.
- Keep focused modes optional until they help debugging or user workflow.

### 2. First Missing Actionable Signal

Reason:

- The next implementation should be chosen by an actual launcher need.
- Good first candidates are signals compromise cannot provide and that immediately change a row or action.

Candidate signals:

- Code fence present
- JSON-like text
- Shell command-like text
- File path present
- Zero-width characters present
- Private key block present
- High-entropy token-like text

Deliverables:

- Pick one signal tied to a concrete row or action.
- Implement only that extractor.
- Add source attribution and examples if useful.
- Add focused inspector output only if it helps validate the detector.

### 3. Document Basics, Minimal Summary

Reason:

- Lowest risk and no external dependencies.
- Provides useful context for every other mode.
- Establishes the shared signal shape and launcher row rendering without complex heuristics.
- Should remain summary-only until a specific metric is needed.

Deliverables:

- Add only the document metrics needed by current rows, likely word count, line count, and long-paste classification.
- Defer full readability, longest-line, average-word, and paragraph metrics until needed.

### 4. Formatting Signals, As Needed

Reason:

- High value for pasted docs, markdown, lists, and code snippets.
- Mostly deterministic.
- Builds on line and paragraph analysis from Document Basics.

Deliverables:

- Implement individual formatting detectors only when they produce useful rows or actions.
- Start with likely high-value rows such as code fences, markdown headings, task lists, tables, or CSV-like text.
- Defer full markdown parsing until regex or line heuristics are clearly insufficient.

### 5. Technical Signals: Files, Code, And Data Formats, As Needed

Reason:

- Very actionable in the launcher and mostly outside compromise's scope.
- Helps classify pasted developer text, logs, docs, snippets, commands, and structured data.
- Avoids duplicating compromise's existing URL/contact/value coverage.

Deliverables:

- Implement one technical detector at a time, tied to a launcher row or action.
- High-value candidates: file path, JSON-like text, shell command-like text, env var assignment, UUID, hash, hex color, package name.
- Add rows that distinguish `code-like`, `data-like`, `command-like`, and `path-like` pasted text only after enough underlying signals exist.
- Leave URL, email, and phone-number upgrades for a later action-specific pass unless compromise output is insufficient.

### 6. Language And Script, As Needed

Reason:

- Useful metadata and quality checks that compromise does not directly cover.
- Helps future translation and cleanup actions.
- Script detection is easier and more reliable than full language detection.

Deliverables:

- Start with the smallest quality warning needed, likely zero-width characters, replacement characters, or RTL presence.
- Add script counts or likely-language detection only when they drive a row or action such as translation, cleanup, or display warning.

### 7. Character Distribution, As Needed

Reason:

- Provides quality and suspiciousness signals outside compromise's scope.
- Feeds later Sensitive and Intent modes.

Deliverables:

- Add only metrics needed for current warnings, likely repeated punctuation, all-caps text, or symbol density.
- Defer full character-class dashboards until a focused inspector mode needs them.

### 8. Sensitive Signals, Conservative First

Reason:

- High value and mostly outside compromise's scope.
- Benefits from Technical, Language, and Character Distribution primitives.
- Requires conservative scoring and careful display.

Deliverables:

- Add one conservative warning at a time, starting with high-confidence patterns such as private key blocks or explicit bearer tokens.
- Add entropy or payment/personal-data detection only after display redaction and false-positive behavior are acceptable.
- Redact examples in launcher rows.

### 9. Numbers And Values: Non-Compromise Gaps, As Needed

Reason:

- Values are useful, but compromise already covers many common NLP value selectors.
- This pass should fill practical gaps rather than duplicate money, percentages, fractions, and dates.

Deliverables:

- Add only values that enable a concrete action, such as version numbers, measurements, durations, or calculation-like text.
- Compare with compromise only where overlap affects launcher action ranking.

### 10. Technical Signals: Links And Addresses Upgrades, Action-Driven

Reason:

- Compromise already detects URLs and contact-like values.
- Upgrade only when needed for stronger validation or direct actions.

Deliverables:

- Add stronger URL, domain, IP, email, and phone validation if compromise output is insufficient.
- Add launcher actions such as open URL, copy domain, compose email, or call phone number.
- Dedupe against compromise detections.

### 11. Intent Signals, Strong Matches Only

Reason:

- Potentially useful for ranking actions, but most heuristic and subjective.
- Benefits from compromise, technical, formatting, and distribution signals.

Deliverables:

- Detect questions, todo/action phrases, urgency, uncertainty, negation, contact requests, scheduling intent, purchase intent, error reports, bug reports, and search-query-like text.
- Keep confidence visible or limit rows to strong matches.
- Use compromise question and verb signals where useful instead of rebuilding them from scratch.

### 12. Focused Modes From Mature Signals

Reason:

- Focused modes are useful once there is enough signal depth to inspect.
- They should emerge from mature extractors instead of forcing category completion up front.

Deliverables:

- Promote mature signal groups into focused modes such as Formatting, Technical, Sensitive, or Language.
- Keep focused modes URL-addressable where useful for debugging.
- Preserve source attribution and overlap visibility.

## Open Questions

- Should each top-level mode have its own URL route, or should modes be query parameters on the launcher page?
- Should sub-modes be visible as tabs, filters, or grouped sections inside one mode?
- Should combined mode include every signal or only signals marked `actionable`, `warning`, or `summary`?
- How much language detection should happen client-side without adding a large dependency?
- Should signal extraction be synchronous for all modes, or should expensive modes run lazily?
- Should spans be tracked immediately so the UI can highlight detected text ranges, or can that wait until extractors stabilize?
