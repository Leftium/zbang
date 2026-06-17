<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import { readBangCatalog, type BangProviderId, type Zbang, type ZbangCatalog } from '$lib/bang-data';
	import { applyBang, filterBangs, prepareBangCatalog } from '$lib/bang-filter';
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
		rank?: number;
		score: number;
		sortOrder?: number;
		safeForEnter?: boolean;
		run?: () => void | Promise<void>;
	};

	type LauncherContext = {
		value: string;
		text: string;
		hasValue: boolean;
		bangComposition: BangComposition;
		nlp: CompromiseSignals;
	};

	type LauncherPlugin = {
		id: string;
		getItems: (context: LauncherContext) => LauncherItem[];
	};

	type LauncherMode = 'all' | 'bangs' | 'compromise';
	type BangCompositionTarget = { token: string; item: Zbang };
	type BangComposition = {
		localTargets: BangCompositionTarget[];
		forwardedTokens: string[];
		payloadText: string;
		hasTargets: boolean;
	};
	type KeywordSignal = { word: string; score: number };
	type MoneyJson = { text?: string; number?: { prefix?: string; unit?: string } };

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
		currencies: string[];
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
	let bangCatalog = $state<ZbangCatalog>();
	let loadedBangProvider = $state<BangProviderId>();
	let textareaElement = $state<HTMLTextAreaElement>();
	let bangEntry = $state<{ triggerIndex: number; fragment: string }>();

	const mode = $derived(getMode(page.url.searchParams.get('mode')));
	const inspect = $derived(getInspectPanelId(page.url.searchParams.get('inspect')));
	const expression = $derived(page.url.searchParams.get('expr') ?? undefined);
	const hasValue = $derived(Boolean(value.trim()));
	const compromiseSignals = $derived(getCompromiseSignals(value));
	const preparedBangs = $derived(prepareBangCatalog(bangCatalog));
	const bangCodeMap = $derived(createBangCodeMap(bangCatalog));
	const bangComposition = $derived(parseBangComposition(value, bangCodeMap, bangEntry));
	const bangPickerActive = $derived(mode === 'bangs' || Boolean(bangEntry));
	const bangFilterInput = $derived(bangEntry ? `!${bangEntry.fragment}` : value);
	const bangResults = $derived(filterBangs(bangFilterInput, preparedBangs));
	const bangTotalCount = $derived(bangCatalog?.items.length ?? 0);
	const launcherContext = $derived({
		value,
		text: value.trim(),
		hasValue,
		bangComposition,
		nlp: compromiseSignals
	});
	const plugins = $derived(createPlugins());
	const launcherItems = $derived(
		rankItems(plugins.flatMap((plugin) => plugin.getItems(launcherContext)))
	);
	const visibleLauncherItems = $derived(
		mode === 'bangs'
			? launcherItems.filter((item) => item.pluginId === 'bangs')
			: mode === 'compromise'
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

	onMount(() => {
		void loadBangCatalog(settings.bangProvider);
	});

	$effect(() => {
		const provider = settings.bangProvider;

		if (loadedBangProvider && loadedBangProvider !== provider) {
			void loadBangCatalog(provider);
		}
	});

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

	function executeBangSearch(composition = bangComposition) {
		const { localTargets, forwardedTokens, payloadText } = composition;

		for (const { item } of localTargets) {
			const url = payloadText ? getBangSearchUrl(item, payloadText) : getBangOpenUrl(item);

			window.open(url, '_blank', 'noopener,noreferrer');
		}

		if (forwardedTokens.length) {
			const forwardedQuery = [...forwardedTokens, payloadText].filter(Boolean).join(' ');

			window.open(getSearchUrl(settings.searchProvider, forwardedQuery), '_blank', 'noopener,noreferrer');
		}
	}

	function getBangSearchUrl(item: Zbang, query: string) {
		return item.urls.s.replace(/%s/g, encodeURIComponent(query.trim()));
	}

	function getBangOpenUrl(item: Zbang) {
		const placeholder = '__zbang_query__';
		const template = item.urls.s.replace(/%s/g, placeholder);

		try {
			const url = new URL(template);
			const params = [...url.searchParams.entries()];
			const hasQueryPlaceholder = params.some(([, value]) => value.includes(placeholder));

			for (const [key, value] of params) {
				if (value.includes(placeholder)) url.searchParams.delete(key);
			}

			if (url.hash.includes(placeholder)) url.hash = '';

			if (url.pathname.includes(placeholder)) {
				url.pathname = url.pathname
					.split('/')
					.filter((segment) => segment && !segment.includes(placeholder))
					.join('/');
			}

			return hasQueryPlaceholder ? `${url.origin}/` : url.toString();
		} catch {
			return item.urls.s.replace(/%s/g, '');
		}
	}

	function getBangSearchTitle(composition: BangComposition) {
		return composition.payloadText ? 'Search' : 'Open';
	}

	function getBangSearchDescription(composition: BangComposition) {
		const targets = [
			...composition.localTargets.map(({ item }) => item.name),
			...composition.forwardedTokens.map((token) => `${token} via ${searchProviderLabels[settings.searchProvider]}`)
		].join(', ');
		const payload = composition.payloadText ? ` for "${composition.payloadText}"` : '';

		return `${targets}${payload}`;
	}

	async function loadBangCatalog(provider: BangProviderId) {
		const persistedCatalog = await readBangCatalog(provider);

		bangCatalog = persistedCatalog ?? (await loadBootstrapBangCatalog(provider));
		loadedBangProvider = provider;
	}

	async function loadBootstrapBangCatalog(provider: BangProviderId): Promise<ZbangCatalog> {
		if (provider === 'duckduckgo') {
			return (await import('$lib/data/zbang.bootstrap.duckduckgo.json')).default as ZbangCatalog;
		}

		return (await import('$lib/data/zbang.bootstrap.kagi.json')).default as ZbangCatalog;
	}

	function insertBang(code: string) {
		if (bangEntry) {
			const bang = code.startsWith('!') ? code : `!${code}`;
			const cursor = bangEntry.triggerIndex + bang.length + 1;
			value = `${value.slice(0, bangEntry.triggerIndex)}${bang} ${value.slice(
				bangEntry.triggerIndex + bangEntry.fragment.length + 1
			)}`;
			bangEntry = undefined;

			requestAnimationFrame(() => textareaElement?.setSelectionRange(cursor, cursor));
			return;
		}

		value = applyBang(value, code);
	}

	function handleLauncherKeydown(event: KeyboardEvent) {
		const textarea = event.currentTarget as HTMLTextAreaElement;

		if (event.key === 'Escape') {
			bangEntry = undefined;
			return;
		}

		if (event.key === '!' && isBangTrigger(value, textarea.selectionStart)) {
			bangEntry = { triggerIndex: textarea.selectionStart, fragment: '' };
			return;
		}

		if (event.key.length === 1 && /\s/.test(event.key)) {
			bangEntry = undefined;
			return;
		}

		requestAnimationFrame(() => updateBangEntry(textarea));
	}

	function handleLauncherInput(event: Event) {
		updateBangEntry(event.currentTarget as HTMLTextAreaElement);
	}

	function handleLauncherCursorChange(event: Event) {
		updateBangEntry(event.currentTarget as HTMLTextAreaElement);
	}

	function isBangTrigger(input: string, index: number) {
		const previous = input[index - 1];

		return previous === undefined || /\s/.test(previous);
	}

	function createBangCodeMap(catalog: ZbangCatalog | undefined) {
		const codeMap = new SvelteMap<string, Zbang>();

		for (const item of catalog?.items ?? []) {
			for (const code of item.code) {
				codeMap.set(normalizeBangCode(code), item);
			}
		}

		return codeMap;
	}

	function parseBangComposition(
		input: string,
		codeMap: Map<string, Zbang>,
		activeEntry: typeof bangEntry
	): BangComposition {
		const localTargets: BangCompositionTarget[] = [];
		const forwardedTokens: string[] = [];
		const payloadTokens: string[] = [];
		const activeTokenStart = activeEntry?.triggerIndex;
		let offset = 0;

		for (const token of input.match(/\S+/g) ?? []) {
			const index = input.indexOf(token, offset);
			offset = index + token.length;

			if (activeTokenStart !== undefined && index === activeTokenStart) continue;

			if (!/^![^\s!]+$/.test(token)) {
				payloadTokens.push(token);
				continue;
			}

			const item = codeMap.get(normalizeBangCode(token));

			if (item) {
				localTargets.push({ token, item });
			} else {
				forwardedTokens.push(token);
			}
		}

		return {
			localTargets,
			forwardedTokens,
			payloadText: payloadTokens.join(' '),
			hasTargets: Boolean(localTargets.length || forwardedTokens.length)
		};
	}

	function normalizeBangCode(code: string) {
		return (code.startsWith('!') ? code : `!${code}`).toLowerCase();
	}

	function updateBangEntry(textarea: HTMLTextAreaElement) {
		if (!bangEntry) return;

		const cursor = textarea.selectionStart;
		const selectionEnd = textarea.selectionEnd;
		const fragmentStart = bangEntry.triggerIndex + 1;

		if (cursor !== selectionEnd || cursor < fragmentStart) {
			bangEntry = undefined;
			return;
		}

		const token = value.slice(bangEntry.triggerIndex, cursor);

		if (!token.startsWith('!') || /\s/.test(token)) {
			bangEntry = undefined;
			return;
		}

		bangEntry = { ...bangEntry, fragment: token.slice(1) };
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
		if (mode === 'bangs' || mode === 'compromise') {
			return mode;
		}

		return 'all';
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
				currencies: [],
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
		const money = doc.money();

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
			money: getMoneyAmounts(money.json() as MoneyJson[]),
			currencies: getCurrencies(money.json() as MoneyJson[]),
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

	function getCurrencies(values: MoneyJson[]) {
		return unique(
			values.flatMap(({ number }) =>
				[number?.prefix, number?.unit].filter((value): value is string => Boolean(value?.trim()))
			)
		);
	}

	function getMoneyAmounts(values: MoneyJson[]) {
		return unique(
			values.flatMap(({ text, number }) => (hasCurrency(number) && text ? [text] : []))
		);
	}

	function hasCurrency(number: MoneyJson['number']) {
		return Boolean(number?.prefix?.trim() || number?.unit?.trim());
	}

	function createPlugins(): LauncherPlugin[] {
		return [
			{
				id: 'bang-compose',
				getItems(context) {
					if (bangEntry || !context.bangComposition.hasTargets) return [];

					return [
						{
							id: 'bang-compose.execute',
							pluginId: 'bang-compose',
							kind: 'action',
							title: getBangSearchTitle(context.bangComposition),
							description: getBangSearchDescription(context.bangComposition),
							score: 120,
							safeForEnter: true,
							run: () => executeBangSearch(context.bangComposition)
						}
					];
				}
			},
			{
				id: 'bangs',
				getItems() {
					if (!bangPickerActive) return [];

					return bangResults.items.map(({ item, score }, index) => ({
						id: `bangs.${item.rank}`,
						pluginId: 'bangs',
						kind: 'action',
						title: item.name,
						description: `${item.code.join(' ')} | ${formatBangUrl(item.urls.s)}`,
						rank: item.rank,
						score,
						sortOrder: index,
						safeForEnter: true,
						run: () => insertBang(item.code[0])
					}));
				}
			},
			{
				id: 'clipboard',
				getItems(context) {
					if (bangEntry) return [];

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
					if (!context.hasValue || bangEntry || context.bangComposition.hasTargets) return [];

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
					if (mode !== 'compromise') return [];

					return getCompromiseItems(context);
				}
			}
		];
	}

	function getCompromiseItems(context: LauncherContext): LauncherItem[] {
		const { nlp: signals } = context;
		const contacts = [...signals.emails, ...signals.phoneNumbers];
		const values = unique([...signals.percentages, ...signals.fractions]).filter(
			(value) => !signals.money.includes(value)
		);
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
				'currencies',
				'Currencies',
				formatList(signals.currencies),
				scoreInsight(57, signals.currencies)
			),
			createInsightItem(
				'money',
				'Money',
				formatList(signals.money),
				scoreInsight(58, signals.money)
			),
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
			`${signals.money.length} money`,
			`${signals.currencies.length} currencies`,
			`${signals.dates.length} dates`,
			`${signals.durations.length} durations`,
			`${signals.keywords.length} keywords`
		];

		return counts.join(' | ');
	}

	function formatList(values: string[]) {
		return values.length ? values.join(', ') : 'None detected';
	}

	function formatCount(count: number) {
		return new Intl.NumberFormat().format(count);
	}

	function formatBangUrl(url: string) {
		return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
	}

	function formatItemMeta(item: LauncherItem) {
		return [item.pluginId, item.rank ? `rank ${formatCount(item.rank)}` : undefined, item.score]
			.filter(Boolean)
			.join(' | ');
	}

	function rankItems(items: LauncherItem[]) {
		return [...items].sort(
			(a, b) => {
				if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
					return a.sortOrder - b.sortOrder;
				}

				return b.score - a.score || a.title.localeCompare(b.title);
			}
		);
	}
</script>

<main>
	<Header />

	{#if mode !== 'all'}
		<div class="mode-chip">Mode: {mode}</div>
	{/if}

	{#if mode === 'bangs'}
		<div class="result-count">
			Results: {formatCount(bangResults.total)}/{formatCount(bangTotalCount)}
		</div>
	{/if}

	<ExpandingTextarea
		bind:textareaElement
		bind:value
		autofocus
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Type a query..."
		onclick={handleLauncherCursorChange}
		oninput={handleLauncherInput}
		onkeydown={handleLauncherKeydown}
		onkeyup={handleLauncherCursorChange}
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
					<span class="meta">{formatItemMeta(primaryLauncherItem)}</span>
				</button>
			{/if}
		{/snippet}
	</ExpandingTextarea>

	{#if bangComposition.hasTargets}
		<div class="bang-composition" aria-label="Bang composition preview">
			{#each bangComposition.localTargets as target, index (`local-${index}-${target.token}`)}
				<span class="composition-chip target-chip">{target.item.name}</span>
			{/each}
			{#each bangComposition.forwardedTokens as token, index (`forwarded-${index}-${token}`)}
				<span class="composition-chip forwarded-chip"
					>{token} via {searchProviderLabels[settings.searchProvider]}</span
				>
			{/each}
			{#if bangComposition.payloadText}
				<span class="composition-chip payload-chip">Query: {bangComposition.payloadText}</span>
			{/if}
		</div>
	{/if}

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
					<span class="meta">{formatItemMeta(item)}</span>
				</button>
			{:else}
				<article class="launcher-item insight-item">
					<span>
						<strong>{item.title}</strong>
						{#if item.description}<small>{item.description}</small>{/if}
					</span>
					<span class="meta">{formatItemMeta(item)}</span>
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

	.bang-composition {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		margin-block-start: var(--size-2);
	}

	.composition-chip {
		display: inline-flex;
		align-items: center;
		min-height: 1.75rem;
		padding-inline: 0.625rem;
		border: 1px solid var(--nc-border);
		border-radius: 999px;
		font-size: var(--font-size-0);
		line-height: 1;
	}

	.target-chip {
		color: var(--nc-accent-fg);
		background: var(--nc-accent-bg);
		border-color: color-mix(in oklab, var(--nc-accent-bg), var(--nc-border));
	}

	.forwarded-chip {
		color: var(--nc-tx-1);
		background: var(--nc-surface-2);
	}

	.payload-chip {
		max-width: 100%;
		color: var(--nc-tx-2);
		background: var(--nc-surface-1);
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

	.result-count {
		margin-block-end: var(--size-2);
		color: var(--nc-tx-2);
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
