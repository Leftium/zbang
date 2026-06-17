<script lang="ts">
	import { page } from '$app/state';

	import { createCompromiseDoc } from '$lib/compromise';
	import CompromiseInspector, {
		getInspectPanelId
	} from '$lib/components/CompromiseInspector.svelte';
	import ExpandingTextarea from '$lib/components/ExpandingTextarea.svelte';
	import Header from '$lib/components/Header.svelte';
	import { settings, type SearchProvider } from '$lib/settings.svelte';

	let value = $derived(page.url.searchParams.get('q') ?? '');

	type LauncherItem = {
		id: string;
		pluginId: string;
		kind: 'action' | 'insight';
		title: string;
		description?: string;
		score: number;
		safeForEnter?: boolean;
		run?: () => void | Promise<void>;
	};

	type LauncherContext = {
		value: string;
		text: string;
		hasValue: boolean;
		nlp: CompromiseSignals;
	};

	type LauncherPlugin = {
		id: string;
		getItems: (context: LauncherContext) => LauncherItem[];
	};

	type LauncherMode = 'all' | 'compromise';
	type KeywordSignal = { word: string; score: number };

	type CompromiseSignals = {
		text: string;
		terms: string[];
		topics: string[];
		people: string[];
		places: string[];
		organizations: string[];
		questions: string[];
		urls: string[];
		emails: string[];
		phoneNumbers: string[];
		hashTags: string[];
		atMentions: string[];
		emojis: string[];
		emoticons: string[];
		money: string[];
		percentages: string[];
		fractions: string[];
		acronyms: string[];
		hyphenated: string[];
		quotations: string[];
		parentheses: string[];
		keywords: KeywordSignal[];
		dates: string[];
		times: string[];
		durations: string[];
		verbs: string[];
		nouns: string[];
	};

	const searchProviderLabels: Record<SearchProvider, string> = {
		kagi: 'Kagi',
		duckduckgo: 'DuckDuckGo',
		google: 'Google'
	};
	const searchProviders = Object.keys(searchProviderLabels) as SearchProvider[];
	const mode = $derived(getMode(page.url.searchParams.get('mode')));
	const inspect = $derived(getInspectPanelId(page.url.searchParams.get('inspect')));
	const expression = $derived(page.url.searchParams.get('expr') ?? undefined);
	const hasValue = $derived(Boolean(value.trim()));
	const compromiseSignals = $derived(getCompromiseSignals(value));
	const launcherContext = $derived({
		value,
		text: value.trim(),
		hasValue,
		nlp: compromiseSignals
	});
	const plugins = $derived(createPlugins());
	const launcherItems = $derived(
		rankItems(plugins.flatMap((plugin) => plugin.getItems(launcherContext)))
	);
	const visibleLauncherItems = $derived(
		mode === 'compromise'
			? launcherItems.filter((item) => item.pluginId === 'compromise')
			: launcherItems
	);
	const primaryLauncherItem = $derived(
		mode === 'compromise'
			? undefined
			: visibleLauncherItems.find((item) => item.safeForEnter && item.run)
	);
	const secondaryLauncherItems = $derived(
		visibleLauncherItems.filter((item) => item.id !== primaryLauncherItem?.id)
	);

	function getSearchUrl(provider: SearchProvider, query: string) {
		const trimmedQuery = query.trim();

		if (!trimmedQuery) {
			return {
				kagi: 'https://kagi.com/',
				duckduckgo: 'https://duckduckgo.com/',
				google: 'https://www.google.com/'
			}[provider];
		}

		const encodedQuery = encodeURIComponent(trimmedQuery);

		return {
			kagi: `https://kagi.com/search?q=${encodedQuery}`,
			duckduckgo: `https://duckduckgo.com/?q=${encodedQuery}`,
			google: `https://www.google.com/search?q=${encodedQuery}`
		}[provider];
	}

	function search(provider = settings.searchProvider) {
		window.open(getSearchUrl(provider, value), '_blank', 'noopener,noreferrer');
	}

	async function pasteFromClipboard() {
		value = await navigator.clipboard.readText();
	}

	async function copyToClipboard() {
		await navigator.clipboard.writeText(value);
	}

	function runPrimaryAction() {
		void primaryLauncherItem?.run?.();
	}

	function getMode(mode: string | null): LauncherMode {
		return mode === 'compromise' ? 'compromise' : 'all';
	}

	function getCompromiseSignals(input: string): CompromiseSignals {
		const text = input.trim();

		if (!text) {
			return {
				text,
				terms: [],
				topics: [],
				people: [],
				places: [],
				organizations: [],
				questions: [],
				urls: [],
				emails: [],
				phoneNumbers: [],
				hashTags: [],
				atMentions: [],
				emojis: [],
				emoticons: [],
				money: [],
				percentages: [],
				fractions: [],
				acronyms: [],
				hyphenated: [],
				quotations: [],
				parentheses: [],
				keywords: [],
				dates: [],
				times: [],
				durations: [],
				verbs: [],
				nouns: []
			};
		}

		const doc = createCompromiseDoc(text);

		return {
			text,
			terms: unique(doc.terms().out('array')),
			topics: unique(doc.topics().out('array')),
			people: unique(doc.people().out('array')),
			places: unique(doc.places().out('array')),
			organizations: unique(doc.organizations().out('array')),
			questions: unique(doc.questions().out('array')),
			urls: unique(doc.urls().out('array')),
			emails: unique(doc.emails().out('array')),
			phoneNumbers: unique(doc.phoneNumbers().out('array')),
			hashTags: unique(doc.hashTags().out('array')),
			atMentions: unique(doc.atMentions().out('array')),
			emojis: unique(doc.emojis().out('array')),
			emoticons: unique(doc.emoticons().out('array')),
			money: unique(doc.money().out('array')),
			percentages: unique(doc.percentages().out('array')),
			fractions: unique(doc.fractions().out('array')),
			acronyms: unique(doc.acronyms().out('array')),
			hyphenated: unique(doc.hyphenated().out('array')),
			quotations: unique(doc.quotations().out('array')),
			parentheses: unique(doc.parentheses().out('array')),
			keywords: uniqueKeywords(doc.tfidf({ form: 'normal' }).slice(0, 8)),
			dates: unique(doc.dates().out('array')),
			times: unique(doc.times().out('array')),
			durations: unique(doc.durations().out('array')),
			verbs: unique(doc.verbs().out('array')),
			nouns: unique(doc.nouns().out('array'))
		};
	}

	function unique(values: string[]) {
		return [...new Set(values.filter(Boolean))];
	}

	function uniqueKeywords(values: [word: string, score: number][]) {
		return values.reduce<KeywordSignal[]>((keywords, [word, score]) => {
			if (!word || keywords.some((keyword) => keyword.word === word)) return keywords;

			keywords.push({ word, score });
			return keywords;
		}, []);
	}

	function createPlugins(): LauncherPlugin[] {
		return [
			{
				id: 'clipboard',
				getItems(context) {
					if (context.hasValue) {
						return [
							{
								id: 'clipboard.copy',
								pluginId: 'clipboard',
								kind: 'action',
								title: 'Copy to clipboard',
								description: 'Copy the current launcher text.',
								score: 70,
								run: copyToClipboard
							}
						];
					}

					return [
						{
							id: 'clipboard.paste',
							pluginId: 'clipboard',
							kind: 'action',
							title: 'Paste from clipboard',
							description: 'Use clipboard text as the launcher subject.',
							score: 100,
							safeForEnter: true,
							run: pasteFromClipboard
						}
					];
				}
			},
			{
				id: 'search',
				getItems(context) {
					if (!context.hasValue) return [];

					return searchProviders.map((provider) => ({
						id: `search.${provider}`,
						pluginId: 'search',
						kind: 'action',
						title: `${searchProviderLabels[provider]} Search`,
						description: `Search for "${context.text}".`,
						score: provider === settings.searchProvider ? 100 : 65,
						safeForEnter: provider === settings.searchProvider,
						run: () => search(provider)
					}));
				}
			},
			{
				id: 'compromise',
				getItems(context) {
					return getCompromiseItems(context);
				}
			}
		];
	}

	function getCompromiseItems(context: LauncherContext): LauncherItem[] {
		const { nlp: signals } = context;
		const contacts = [...signals.emails, ...signals.phoneNumbers];
		const values = [...signals.money, ...signals.percentages, ...signals.fractions];
		const social = [...signals.hashTags, ...signals.atMentions];
		const emoji = [...signals.emojis, ...signals.emoticons];
		const keywords = signals.keywords.map(({ word }) => word);

		if (!context.hasValue) {
			return [
				{
					id: 'compromise.empty',
					pluginId: 'compromise',
					kind: 'insight',
					title: 'Compromise inspector',
					description: 'Enter text to inspect NLP signals for launcher ranking.',
					score: 50
				}
			];
		}

		return [
			createInsightItem('summary', 'NLP summary', getSummaryDescription(signals), 64),
			createInsightItem('urls', 'URLs', formatList(signals.urls), scoreInsight(59, signals.urls)),
			createInsightItem('contacts', 'Contacts', formatList(contacts), scoreInsight(58, contacts)),
			createInsightItem(
				'keywords',
				'Keywords',
				formatList(keywords),
				scoreInsight(49, keywords, getKeywordScoreBoost(signals.keywords))
			),
			createInsightItem(
				'topics',
				'Topics',
				formatList(signals.topics),
				scoreInsight(48, signals.topics)
			),
			createInsightItem(
				'people',
				'People',
				formatList(signals.people),
				scoreInsight(54, signals.people)
			),
			createInsightItem(
				'places',
				'Places',
				formatList(signals.places),
				scoreInsight(52, signals.places)
			),
			createInsightItem(
				'organizations',
				'Organizations',
				formatList(signals.organizations),
				scoreInsight(53, signals.organizations)
			),
			createInsightItem(
				'questions',
				'Questions',
				formatList(signals.questions),
				scoreInsight(56, signals.questions)
			),
			createInsightItem(
				'dates',
				'Dates',
				formatList(signals.dates),
				scoreInsight(55, signals.dates)
			),
			createInsightItem(
				'times',
				'Times',
				formatList(signals.times),
				scoreInsight(54, signals.times)
			),
			createInsightItem(
				'durations',
				'Durations',
				formatList(signals.durations),
				scoreInsight(53, signals.durations)
			),
			createInsightItem('values', 'Values', formatList(values), scoreInsight(57, values)),
			createInsightItem('social', 'Social', formatList(social), scoreInsight(47, social)),
			createInsightItem(
				'quoted',
				'Quoted text',
				formatList(signals.quotations),
				scoreInsight(55, signals.quotations)
			),
			createInsightItem(
				'verbs',
				'Verbs',
				formatList(signals.verbs),
				scoreInsight(40, signals.verbs)
			),
			createInsightItem(
				'nouns',
				'Nouns',
				formatList(signals.nouns),
				scoreInsight(41, signals.nouns)
			),
			createInsightItem(
				'acronyms',
				'Acronyms',
				formatList(signals.acronyms),
				scoreInsight(46, signals.acronyms)
			),
			createInsightItem(
				'hyphenated',
				'Hyphenated',
				formatList(signals.hyphenated),
				scoreInsight(44, signals.hyphenated)
			),
			createInsightItem(
				'parentheses',
				'Parentheses',
				formatList(signals.parentheses),
				scoreInsight(43, signals.parentheses)
			),
			createInsightItem('emoji', 'Emoji', formatList(emoji), scoreInsight(42, emoji)),
			createInsightItem(
				'terms',
				'Terms',
				formatList(signals.terms),
				scoreInsight(40, signals.terms)
			)
		];
	}

	function scoreInsight(base: number, matches: string[], extraBoost = 0) {
		if (!matches.length) return 10;

		return base + Math.min(matches.length, 5) + extraBoost;
	}

	function getKeywordScoreBoost(keywords: KeywordSignal[]) {
		const topScore = keywords[0]?.score ?? 0;

		return Math.min(Math.round(topScore), 5);
	}

	function createInsightItem(
		id: string,
		title: string,
		description: string,
		score: number
	): LauncherItem {
		return {
			id: `compromise.${id}`,
			pluginId: 'compromise',
			kind: 'insight',
			title,
			description,
			score
		};
	}

	function getSummaryDescription(signals: CompromiseSignals) {
		const counts = [
			`${signals.terms.length} terms`,
			`${signals.topics.length} topics`,
			`${signals.people.length} people`,
			`${signals.places.length} places`,
			`${signals.organizations.length} orgs`,
			`${signals.questions.length} questions`,
			`${signals.urls.length} urls`,
			`${signals.emails.length + signals.phoneNumbers.length} contacts`,
			`${signals.dates.length} dates`,
			`${signals.durations.length} durations`,
			`${signals.keywords.length} keywords`
		];

		return counts.join(' | ');
	}

	function formatList(values: string[]) {
		return values.length ? values.join(', ') : 'None detected';
	}

	function rankItems(items: LauncherItem[]) {
		return [...items].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	}
</script>

<main>
	<Header />

	{#if mode !== 'all'}
		<div class="mode-chip">Mode: {mode}</div>
	{/if}

	<ExpandingTextarea
		bind:value
		autofocus
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Type a query..."
		onprimaryaction={runPrimaryAction}
	>
		{#snippet primaryAction()}
			{#if primaryLauncherItem}
				<button class="launcher-item action-item primary" onclick={runPrimaryAction}>
					<span>
						<strong>{primaryLauncherItem.title}</strong>
						{#if primaryLauncherItem.description}<small>{primaryLauncherItem.description}</small
							>{/if}
					</span>
					<span class="meta">{primaryLauncherItem.pluginId} · {primaryLauncherItem.score}</span>
				</button>
			{/if}
		{/snippet}
	</ExpandingTextarea>

	<section class="launcher-list" aria-label="Launcher actions and insights">
		{#each secondaryLauncherItems as item (item.id)}
			{#if item.kind === 'action'}
				<button
					class:primary={item.id === primaryLauncherItem?.id}
					class="launcher-item action-item"
					onclick={() => item.run?.()}
				>
					<span>
						<strong>{item.title}</strong>
						{#if item.description}<small>{item.description}</small>{/if}
					</span>
					<span class="meta">{item.pluginId} · {item.score}</span>
				</button>
			{:else}
				<article class="launcher-item insight-item">
					<span>
						<strong>{item.title}</strong>
						{#if item.description}<small>{item.description}</small>{/if}
					</span>
					<span class="meta">{item.pluginId} · {item.score}</span>
				</article>
			{/if}
		{/each}
	</section>

	{#if mode === 'compromise'}
		<CompromiseInspector text={value} {inspect} {expression} />
	{/if}
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	.launcher-list {
		display: grid;
		gap: var(--size-2);
		margin-block-start: var(--size-3);
	}

	.mode-chip {
		display: inline-flex;
		margin-block-end: var(--size-2);
		padding: 0.125rem 0.5rem;
		color: var(--nc-tx-2);
		background: var(--nc-surface-1);
		border: 1px solid var(--nc-border);
		border-radius: 999px;
		font-size: var(--font-size-0);
	}

	.launcher-item {
		--buttonBg: var(--nc-surface-1);
		--buttonText: var(--nc-tx-1);

		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-3);
		width: 100%;
		margin: 0;
		padding: var(--size-2) var(--size-3);
		text-align: left;
		background: var(--nc-surface-1);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
		color: var(--nc-tx-1);
	}

	.action-item.primary {
		--buttonBg: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		--buttonText: var(--nc-tx-1);

		background: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		border-color: var(--nc-primary);
	}

	.insight-item {
		color: var(--nc-tx-2);
	}

	.launcher-item > span:first-child {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}

	.launcher-item strong,
	.launcher-item small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.launcher-item small {
		color: var(--nc-tx-2);
	}

	.meta {
		flex: 0 0 auto;
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.launcher-item {
			align-items: stretch;
			flex-direction: column;
			gap: var(--size-1);
		}
	}
</style>
