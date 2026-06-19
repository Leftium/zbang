<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import fuzzysort from 'fuzzysort';
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';

	import {
		readMyBangs,
		writeMyBangs,
		type BangProviderId,
		type Zbang,
		type ZbangCatalog
	} from '$lib/bang-data';
	import {
		applyBang,
		filterBangs,
		prepareBangs,
		type BangFilterResult,
		type BangHighlightSegment
	} from '$lib/bang-filter';
	import ExpandingTextarea from '$lib/components/ExpandingTextarea.svelte';
	import Header from '$lib/components/Header.svelte';
	import { createBangCodeMap, parseBangComposition } from '$lib/launcher/bang-composition';
	import { getCompromiseSignals, unique } from '$lib/launcher/compromise-signals';
	import { getLauncherMode, launcherModes } from '$lib/launcher/modes';
	import { getKeywordScoreBoost, rankItems, scoreInsight } from '$lib/launcher/ranking';
	import type {
		BangComposition,
		BangEntry,
		CompromiseSignals,
		LauncherContext,
		LauncherGroup,
		LauncherItem,
		LauncherMode,
		LauncherModeId,
		LauncherPlugin
	} from '$lib/launcher/types';
	import {
		setBangProvider,
		setColorScheme,
		setSearchProvider,
		settings,
		type ColorScheme,
		type SearchProvider
	} from '$lib/settings.svelte';
	import { loadShippedBangCatalog } from '$lib/shipped-bang-catalog';

	const initialUrlQuery = page.url.searchParams.get('q') ?? '';
	let {
		modeId = 'everything',
		value = $bindable(initialUrlQuery)
	}: { modeId?: LauncherModeId; value?: string } = $props();

	const searchProviderLabels: Record<SearchProvider, string> = {
		kagi: 'Kagi',
		duckduckgo: 'DuckDuckGo',
		google: 'Google'
	};
	const colorSchemeLabels: Record<ColorScheme, string> = {
		'': 'Auto (System)',
		dark: 'Dark',
		light: 'Light'
	};
	const bangProviderLabels: Record<BangProviderId, string> = {
		kagi: 'Kagi',
		duckduckgo: 'DuckDuckGo'
	};
	const searchProviders = Object.keys(searchProviderLabels) as SearchProvider[];
	const colorSchemes = Object.keys(colorSchemeLabels) as ColorScheme[];
	const bangProviders = Object.keys(bangProviderLabels) as BangProviderId[];
	const shortcutLabels = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'] as const;
	const shortcutKeys = new Set(['F', 'L', 'N', 'M', '.', ' ', ...shortcutLabels]);
	const shortcutDelay = 250;
	const settingsMatchThreshold = 0.4;
	const launcherGroupItemLimits: Record<string, number> = {
		'bangs.my': 8,
		'bangs.provider': 8
	};
	type InputFrame = { data: string | null; inputType: string; ts: number };
	type KeyFrame = { key: string; ts: number };
	type SettingOption = {
		id: string;
		label: string;
		description: string;
		aliases: readonly string[];
		run: () => void;
	};
	type PrimaryLauncherTarget =
		| { id: string; kind: 'item'; item: LauncherItem; run: () => void | Promise<void> }
		| { id: string; kind: 'group'; group: LauncherGroup; run: () => void };
	type SettingGroupDefinition = {
		id: string;
		title: string;
		description: string;
		aliases: readonly string[];
		currentLabel: () => string;
		options: readonly SettingOption[];
	};
	type ScoredSettingOption = SettingOption & {
		score: number;
		titleResult: Fuzzysort.Result | null;
		descriptionResult: Fuzzysort.Result | null;
	};
	type ScoredSettingGroup = Omit<SettingGroupDefinition, 'options'> & {
		score: number;
		titleResult: Fuzzysort.Result | null;
		descriptionResult: Fuzzysort.Result | null;
		options: ScoredSettingOption[];
		allOptions: ScoredSettingOption[];
	};
	const settingGroups: readonly SettingGroupDefinition[] = [
		{
			id: 'color-scheme',
			title: 'Color scheme',
			description: 'Theme preference for the launcher UI.',
			aliases: ['theme', 'appearance', 'dark mode', 'light mode', 'system theme'],
			currentLabel: () => colorSchemeLabels[settings.colorScheme],
			options: colorSchemes.map((value) => ({
				id: value || 'auto',
				label: colorSchemeLabels[value],
				description: value
					? `Use the ${colorSchemeLabels[value].toLowerCase()} theme.`
					: 'Follow the system theme.',
				aliases: value ? [value, `${value} theme`] : ['auto', 'system', 'system theme'],
				run: () => setColorScheme(value)
			}))
		},
		{
			id: 'search-provider',
			title: 'Default search provider',
			description: 'Provider used for regular web searches.',
			aliases: ['search engine', 'web search', 'provider'],
			currentLabel: () => searchProviderLabels[settings.searchProvider],
			options: searchProviders.map((value) => ({
				id: value,
				label: searchProviderLabels[value],
				description: `Use ${searchProviderLabels[value]} for default web searches.`,
				aliases: [value, searchProviderLabels[value], 'search engine'],
				run: () => setSearchProvider(value)
			}))
		},
		{
			id: 'bang-provider',
			title: 'Bang catalog provider',
			description: 'Provider catalog used to populate available bangs.',
			aliases: ['bang catalog', 'bangs catalog', 'shortcut catalog', 'catalog provider'],
			currentLabel: () => bangProviderLabels[settings.bangProvider],
			options: bangProviders.map((value) => ({
				id: value,
				label: bangProviderLabels[value],
				description: `Load bang shortcuts from ${bangProviderLabels[value]}.`,
				aliases: [value, bangProviderLabels[value], 'bang catalog'],
				run: () => setBangProvider(value)
			}))
		}
	];
	let bangCatalog = $state<ZbangCatalog>();
	let loadedBangProvider = $state<BangProviderId>();
	let textareaElement = $state<HTMLTextAreaElement>();
	let bangEntry = $state<BangEntry>();
	let fullscreen = $state(false);
	let wordwrap = $state(true);
	let enterNewlineRestored = $state(false);
	let enterNewlineFullscreen = $state(true);
	let selectedPrimaryItemId = $state<string>();
	let inputHistory = $state<InputFrame[]>([]);
	let keyHistory: KeyFrame[] = [];
	let pendingShortcutLauncherTargets: PrimaryLauncherTarget[] = [];
	let pendingShortcutPrimaryTarget: PrimaryLauncherTarget | undefined;
	let myBangWrite = Promise.resolve();
	let loadingBangProvider = $state<BangProviderId>();
	let doubleKeypress = $state<string>();
	let isPeriodShortcut = $state(false);
	let isMobilePeriodShortcut = $state(false);
	let expandedLauncherGroups = $state<Record<string, boolean>>({});
	let myBangs = $state<Zbang[]>([]);
	let lastUrlQuery = $state(initialUrlQuery);
	let hadSettingsFilter = false;
	let skipNextSettingsFilterReset = false;

	$effect(() => {
		const urlQuery = page.url.searchParams.get('q') ?? '';

		if (urlQuery === lastUrlQuery) return;

		lastUrlQuery = urlQuery;
		value = urlQuery;
		bangEntry = undefined;
	});

	const mode = $derived(getLauncherMode(modeId));
	const hasValue = $derived(Boolean(value.trim()));
	// Keep NLP signals in the shared launcher context so plugins can score and enrich items.
	const compromiseSignals = $derived(getCompromiseSignals(value));
	const myBangCodes = $derived(
		new Set(myBangs.flatMap((item) => item.code.map(normalizeBangCode)))
	);
	const providerBangs = $derived(
		(bangCatalog?.items ?? []).filter((item) => !hasBangCodeOverlap(item, myBangCodes))
	);
	const allBangs = $derived([...myBangs, ...providerBangs]);
	const preparedMyBangs = $derived(prepareBangs(myBangs));
	const preparedProviderBangs = $derived(prepareBangs(providerBangs));
	const providerBangCount = $derived(bangCatalog?.items.length ?? 0);
	const bangCodeMap = $derived(createBangCodeMap(allBangs));
	const bangComposition = $derived(parseBangComposition(value, bangCodeMap, bangEntry));
	const bangPickerActive = $derived(Boolean(bangEntry));
	const bangFilterInput = $derived(bangEntry ? `!${bangEntry.fragment}` : value);
	const myBangResults = $derived(filterBangs(bangFilterInput, preparedMyBangs));
	const providerBangResults = $derived(filterBangs(bangFilterInput, preparedProviderBangs));
	const launcherContext = $derived({
		text: value.trim(),
		hasValue,
		bangComposition,
		nlp: compromiseSignals
	});
	const plugins = $derived(createPlugins());
	const launcherItems = $derived(
		rankItems(plugins.flatMap((plugin) => plugin.getItems?.(launcherContext) ?? []))
	);
	const launcherGroups = $derived(
		plugins.flatMap((plugin) => plugin.getGroups?.(launcherContext) ?? [])
	);
	const visibleLauncherItems = $derived(
		launcherItems.filter((item) => mode.pluginIds.includes(item.pluginId))
	);
	const visibleLauncherGroups = $derived(
		launcherGroups.filter(
			(group) => mode.pluginIds.includes(group.pluginId) && shouldRenderGroup(group)
		)
	);
	const visibleGroupedLauncherItems = $derived(
		visibleLauncherGroups.flatMap((group) => getVisibleGroupItems(group))
	);
	const visibleActionItems = $derived([...visibleLauncherItems, ...visibleGroupedLauncherItems]);
	const textareaPlaceholder = $derived(getTextareaPlaceholder());
	const selectablePrimaryTargets = $derived(getSelectablePrimaryTargets());
	const shortcutLauncherTargets = $derived(
		selectablePrimaryTargets.slice(0, shortcutLabels.length)
	);
	const shortcutTargetIds = $derived(
		new Map(shortcutLauncherTargets.map((target, index) => [target.id, index]))
	);
	const primaryLauncherTarget = $derived(
		selectablePrimaryTargets.find((target) => target.id === selectedPrimaryItemId) ??
			selectablePrimaryTargets.find((target) => target.kind === 'item' && target.item.safeForEnter)
	);
	const primaryLauncherItem = $derived(
		primaryLauncherTarget?.kind === 'item' ? primaryLauncherTarget.item : undefined
	);
	const secondaryLauncherItems = $derived(
		fullscreen
			? visibleLauncherItems.filter((item) => item.id !== primaryLauncherItem?.id)
			: visibleLauncherItems
	);

	onMount(() => {
		void loadMyBangs();
	});

	$effect(() => {
		const provider = settings.bangProvider;

		if (loadedBangProvider !== provider && loadingBangProvider !== provider) {
			void loadBangCatalog(provider);
		}
	});

	$effect(() => {
		if (mode.id !== 'settings') {
			hadSettingsFilter = false;
			return;
		}

		if (hasValue) {
			hadSettingsFilter = true;
			skipNextSettingsFilterReset = false;
			return;
		}

		if (hadSettingsFilter) {
			if (skipNextSettingsFilterReset) {
				skipNextSettingsFilterReset = false;
			} else if (Object.keys(expandedLauncherGroups).length) {
				expandedLauncherGroups = {};
			}
		}

		hadSettingsFilter = false;
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

			window.open(
				getSearchUrl(settings.searchProvider, forwardedQuery),
				'_blank',
				'noopener,noreferrer'
			);
		}
	}

	function getBangSearchUrl(item: Zbang, query: string) {
		return item.urls.s.replace(/%s/g, encodeURIComponent(query.trim()));
	}

	function getBangOpenUrl(item: Zbang) {
		const placeholder = '__zbang_query__';
		const template = item.urls.s.replace(/%s/g, placeholder);

		try {
			const url = new SvelteURL(template);
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
			...composition.forwardedTokens.map(
				(token) => `${token} via ${searchProviderLabels[settings.searchProvider]}`
			)
		].join(', ');
		const payload = composition.payloadText ? ` for "${composition.payloadText}"` : '';

		return `${targets}${payload}`;
	}

	async function loadBangCatalog(provider: BangProviderId) {
		loadingBangProvider = provider;
		const result = await loadShippedBangCatalog(provider);

		if (loadingBangProvider === provider) loadingBangProvider = undefined;
		if (settings.bangProvider !== provider) return;

		loadedBangProvider = provider;

		if (result.error) {
			bangCatalog = undefined;
			console.error('Failed to load shipped bang catalog', result.error);
			return;
		}

		bangCatalog = result.data;
	}

	async function loadMyBangs() {
		myBangs = await readMyBangs();
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

	async function addMyBang(item: Zbang) {
		if (hasBangCodeOverlap(item, myBangCodes)) return;

		const nextMyBangs = [...myBangs, cloneBang(item)];
		myBangs = nextMyBangs;
		await persistMyBangs(nextMyBangs);
	}

	async function removeMyBang(item: Zbang) {
		const index = myBangs.findIndex((myBang) => isSameBang(myBang, item));

		if (index === -1) return;

		const nextMyBangs = [...myBangs.slice(0, index), ...myBangs.slice(index + 1)];
		myBangs = nextMyBangs;
		await persistMyBangs(nextMyBangs);
	}

	async function persistMyBangs(items: Zbang[]) {
		const persistedItems = items.map(cloneBang);
		myBangWrite = myBangWrite.catch(() => undefined).then(() => writeMyBangs(persistedItems));
		await myBangWrite;
	}

	function cloneBang(item: Zbang): Zbang {
		return {
			rank: item.rank,
			name: item.name,
			code: [...item.code],
			tags: [...item.tags],
			urls: { s: item.urls.s }
		};
	}

	function isSameBang(a: Zbang, b: Zbang) {
		return (
			a.rank === b.rank &&
			a.name === b.name &&
			a.urls.s === b.urls.s &&
			arrayEquals(a.code, b.code) &&
			arrayEquals(a.tags, b.tags)
		);
	}

	function arrayEquals(a: string[], b: string[]) {
		return a.length === b.length && a.every((value, index) => value === b[index]);
	}

	function hasBangCodeOverlap(item: Zbang, codes: Set<string>) {
		return item.code.some((code) => codes.has(normalizeBangCode(code)));
	}

	function normalizeBangCode(code: string) {
		return (code.startsWith('!') ? code : `!${code}`).toLowerCase();
	}

	function removeTextBeforeCursor(length: number) {
		if (!textareaElement || length <= 0) return;

		const { selectionStart, selectionEnd } = textareaElement;
		const start = Math.max(0, selectionStart - length);
		value = value.slice(0, start) + value.slice(selectionEnd);
		textareaElement.setSelectionRange(start, start);
		updateBangEntry(textareaElement);

		requestAnimationFrame(() => {
			textareaElement?.setSelectionRange(start, start);
			if (textareaElement) updateBangEntry(textareaElement);
		});
	}

	function replaceTextBeforeCursorWithBang(length: number) {
		if (!textareaElement) return;

		const { selectionStart, selectionEnd } = textareaElement;
		const start = Math.max(0, selectionStart - length);
		const replacement = isBangTrigger(value, start) ? '!' : ' !';
		const triggerIndex = start + replacement.indexOf('!');
		const cursor = triggerIndex + 1;

		value = value.slice(0, start) + replacement + value.slice(selectionEnd);
		textareaElement.value = value;
		bangEntry = { triggerIndex, fragment: '' };
		textareaElement.setSelectionRange(cursor, cursor);

		requestAnimationFrame(() => textareaElement?.setSelectionRange(cursor, cursor));
	}

	function handleLauncherBeforeInput(event: InputEvent) {
		const { data, inputType } = event;
		const ts = Date.now();
		const lastInput = inputHistory[0];
		const interval = lastInput ? ts - lastInput.ts : Infinity;

		doubleKeypress = undefined;
		if (
			inputType === 'insertText' &&
			data &&
			interval < shortcutDelay &&
			isShortcutInitiator(lastInput?.data) &&
			lastInput?.data?.toLowerCase() === data.toLowerCase()
		) {
			doubleKeypress = lastInput.data;
		}

		if (!doubleKeypress && inputType === 'insertText' && data && isShortcutInitiator(data)) {
			captureShortcutSnapshot(data);
		}

		inputHistory = [{ data, inputType, ts }, ...inputHistory].slice(0, 2);
		isPeriodShortcut = inputType === 'insertText' && data === '. ';
		isMobilePeriodShortcut =
			inputType === 'insertText' && data === ' ' && inputHistory[1]?.data === '.';
	}

	function handleLauncherKeydown(event: KeyboardEvent) {
		const textarea = event.currentTarget as HTMLTextAreaElement;

		if (handleShortcutKeydown(event)) return;

		if (handlePrimaryNavigation(event)) return;

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
		const textarea = event.currentTarget as HTMLTextAreaElement;

		if (handleShortcutInput()) return;

		updateBangEntry(textarea);
	}

	function handleShortcutInput() {
		const periodShortcutLength = isPeriodShortcut ? 2 : isMobilePeriodShortcut ? 2 : 0;

		if (periodShortcutLength) {
			replaceTextBeforeCursorWithBang(periodShortcutLength);
			resetShortcutState();
			return true;
		}

		if (doubleKeypress && shortcutKeys.has(doubleKeypress)) {
			if (doubleKeypress === ' ') {
				replaceTextBeforeCursorWithBang(2);
				resetShortcutState();
				return true;
			}

			removeShortcutTextBeforeCursor(2);
			executeShortcut(doubleKeypress);
			resetShortcutState();
			return true;
		}

		return false;
	}

	function handleShortcutKeydown(event: KeyboardEvent) {
		if (event.key === ' ') return false;

		const ts = Date.now();
		const lastKey = keyHistory[0];
		const interval = lastKey ? ts - lastKey.ts : Infinity;

		keyHistory = [{ key: event.key, ts }, ...keyHistory].slice(0, 2);
		doubleKeypress = undefined;

		if (interval >= shortcutDelay || lastKey?.key.toLowerCase() !== event.key.toLowerCase()) {
			captureShortcutSnapshot(event.key);
			return false;
		}

		if (!isShortcutInitiator(lastKey?.key)) return false;

		doubleKeypress = lastKey.key;

		if (!shortcutKeys.has(doubleKeypress)) return false;

		event.preventDefault();
		removeShortcutTextBeforeCursor(1);
		executeShortcut(doubleKeypress);
		resetShortcutState();

		return true;
	}

	function removeShortcutTextBeforeCursor(length: number) {
		if (mode.id === 'settings' && textareaElement) {
			const { selectionStart, selectionEnd } = textareaElement;
			const start = Math.max(0, selectionStart - length);
			const nextValue = value.slice(0, start) + value.slice(selectionEnd);

			skipNextSettingsFilterReset = hasValue && !nextValue.trim();
		}

		removeTextBeforeCursor(length);
	}

	function executeShortcut(shortcutKey: string) {
		if (shortcutKey === 'F') {
			fullscreen = !fullscreen;
			return;
		}

		if (shortcutKey === 'L') {
			wordwrap = !wordwrap;
			return;
		}

		if (shortcutKey === 'N') {
			if (fullscreen) {
				enterNewlineFullscreen = !enterNewlineFullscreen;
			} else {
				enterNewlineRestored = !enterNewlineRestored;
			}

			return;
		}

		if (shortcutKey === '.' || shortcutKey === 'M') {
			void (pendingShortcutPrimaryTarget ?? primaryLauncherTarget)?.run();
			return;
		}

		const index = shortcutLabels.findIndex((label) => label === shortcutKey);
		const target = (
			pendingShortcutLauncherTargets.length
				? pendingShortcutLauncherTargets
				: shortcutLauncherTargets
		)[index];

		if (target) void target.run();
	}

	function captureShortcutSnapshot(shortcutKey: string) {
		if (!isShortcutInitiator(shortcutKey)) return;

		pendingShortcutLauncherTargets = shortcutLauncherTargets;
		pendingShortcutPrimaryTarget = primaryLauncherTarget;
	}

	function isShortcutInitiator(key: string | null | undefined) {
		if (!key || !shortcutKeys.has(key)) return false;

		// Requiring the first letter to be shifted avoids accidental triggers while typing plain text.
		return key === ' ' || key === '.' || key.toLocaleUpperCase() === key;
	}

	function resetShortcutState() {
		doubleKeypress = undefined;
		inputHistory = [];
		keyHistory = [];
		pendingShortcutLauncherTargets = [];
		pendingShortcutPrimaryTarget = undefined;
		isPeriodShortcut = false;
		isMobilePeriodShortcut = false;
	}

	function focusInput() {
		textareaElement?.focus();
	}

	function handleDocumentMouseDown(event: MouseEvent) {
		if (!(event.target instanceof HTMLElement)) return;

		const target = event.target;

		if (target.tagName === 'TEXTAREA' || target.closest('a')) return;

		requestAnimationFrame(focusInput);
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') focusInput();
	}

	function getShortcutLabel(targetId: string) {
		const index = shortcutTargetIds.get(targetId);
		const label = index === undefined ? undefined : shortcutLabels[index];

		return label;
	}

	function handleLauncherCursorChange(event: Event) {
		updateBangEntry(event.currentTarget as HTMLTextAreaElement);
	}

	function isBangTrigger(input: string, index: number) {
		const previous = input[index - 1];

		return previous === undefined || /\s/.test(previous);
	}

	function handlePrimaryNavigation(event: KeyboardEvent) {
		if (fullscreen || enterNewlineRestored || !['ArrowUp', 'ArrowDown'].includes(event.key)) {
			return false;
		}

		const currentIndex = primaryLauncherTarget
			? selectablePrimaryTargets.findIndex((target) => target.id === primaryLauncherTarget.id)
			: -1;
		const nextIndex = Math.max(
			0,
			Math.min(
				selectablePrimaryTargets.length - 1,
				event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1
			)
		);
		const nextTarget = selectablePrimaryTargets[nextIndex];

		if (!nextTarget) return false;

		event.preventDefault();
		selectedPrimaryItemId = nextTarget.id;

		return true;
	}

	function updateBangEntry(textarea: HTMLTextAreaElement) {
		if (!bangEntry) return;

		const cursor = textarea.selectionStart;
		const selectionEnd = textarea.selectionEnd;
		const fragmentStart = bangEntry.triggerIndex + 1;
		const whitespaceIndex = value.slice(fragmentStart).search(/\s/);
		const tokenEnd = whitespaceIndex === -1 ? value.length : fragmentStart + whitespaceIndex;

		if (cursor !== selectionEnd || cursor < fragmentStart || cursor > tokenEnd) {
			bangEntry = undefined;
			return;
		}

		const token = value.slice(bangEntry.triggerIndex, tokenEnd);

		if (!token.startsWith('!') || /\s/.test(token)) {
			bangEntry = undefined;
			return;
		}

		bangEntry = { ...bangEntry, fragment: token.slice(1) };
	}

	async function copyToClipboard() {
		await navigator.clipboard.writeText(value);
	}

	async function pasteFromClipboard() {
		value = await navigator.clipboard.readText();
		textareaElement?.focus();
	}

	function runPrimaryAction() {
		void primaryLauncherTarget?.run();
	}

	function getSelectablePrimaryTargets(): PrimaryLauncherTarget[] {
		return [
			...visibleLauncherItems.flatMap(createSelectableItemTarget),
			...visibleLauncherGroups.flatMap((group) => [
				{
					id: group.id,
					kind: 'group' as const,
					group,
					run: () => activateLauncherGroup(group.id)
				},
				...getVisibleGroupItems(group).flatMap(createSelectableItemTarget)
			])
		];
	}

	function createSelectableItemTarget(item: LauncherItem): PrimaryLauncherTarget[] {
		if (item.kind !== 'action' || !item.run) return [];

		return [{ id: item.id, kind: 'item', item, run: item.run }];
	}

	function getGroupCollapsedLimit(group: LauncherGroup) {
		return group.collapsedItemLimit ?? launcherGroupItemLimits[group.id] ?? 5;
	}

	function shouldRenderGroup(group: LauncherGroup) {
		const isEmptyMyBangsGroup =
			group.id === 'bangs.my' && (mode.id === 'bangs' || bangPickerActive);
		const isSuppressedProviderGroup =
			group.id === 'bangs.provider' && bangPickerActive && myBangResults.items.length > 0;
		const isMatchedSettingsGroup =
			group.pluginId === 'settings' &&
			mode.id === 'settings' &&
			hasValue &&
			group.matchedCount !== undefined;

		return (
			group.items.length > 0 ||
			isEmptyMyBangsGroup ||
			isSuppressedProviderGroup ||
			isMatchedSettingsGroup
		);
	}

	function getBangGroupCollapsedLimit(items: LauncherItem[]) {
		return mode.id === 'bangs' ? launcherGroupItemLimits['bangs.provider'] : items.length;
	}

	function getVisibleGroupItems(group: LauncherGroup) {
		if (expandedLauncherGroups[group.id]) return group.allItems ?? group.items;

		return group.items.slice(0, getGroupCollapsedLimit(group));
	}

	function getRenderedGroupItems(group: LauncherGroup) {
		const items = getVisibleGroupItems(group);

		return fullscreen ? items.filter((item) => item.id !== primaryLauncherItem?.id) : items;
	}

	function activateLauncherGroup(groupId: string) {
		expandedLauncherGroups = expandedLauncherGroups[groupId] ? {} : { [groupId]: true };
	}

	function getGroupCountLabel(group: LauncherGroup) {
		const parts = [`${(group.allItems ?? group.items).length} loaded`];

		if (group.matchedCount !== undefined) parts.push(`${group.matchedCount} matched`);
		if (group.totalCount !== undefined) parts.push(`${group.totalCount} total`);

		return parts.join(' | ');
	}

	function getGroupToggleLabel(group: LauncherGroup, hiddenCount: number, expanded: boolean) {
		if (
			group.allItems &&
			group.matchedCount !== undefined &&
			group.matchedCount !== group.allItems.length
		) {
			return expanded ? 'Show matched' : 'Show all';
		}

		if (hiddenCount > 0) return `Show ${hiddenCount} more`;
		if (expanded) return 'Collapse';

		return '';
	}

	function getGroupMobileCountLabel(group: LauncherGroup) {
		const parts: string[] = [];

		if (group.matchedCount !== undefined) parts.push(`${group.matchedCount} matched`);
		if (group.totalCount !== undefined) parts.push(`${group.totalCount} total`);

		return parts.join(' | ');
	}

	function createPlugins(): LauncherPlugin[] {
		return [
			{
				id: 'mode-list',
				getItems(context) {
					if (bangEntry) return [];

					return getModeListItems(context);
				}
			},
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
				getGroups() {
					if (!bangPickerActive && mode.id !== 'bangs') return [];

					const myItems = createBangLauncherItems(myBangResults.items, 'my');
					const providerItems = createBangLauncherItems(providerBangResults.items, 'provider');
					const visibleProviderItems = mode.id !== 'bangs' && myItems.length ? [] : providerItems;

					return [
						{
							id: 'bangs.my',
							pluginId: 'bangs',
							title: 'My bangs',
							description: 'Local editable bangs that shadow provider bangs by code.',
							items: myItems,
							collapsedItemLimit: getBangGroupCollapsedLimit(myItems),
							matchedCount: myBangResults.total,
							totalCount: myBangs.length
						},
						{
							id: 'bangs.provider',
							pluginId: 'bangs',
							title: 'Provider bangs',
							description: 'Forward to your configured bang provider unless added to My bangs.',
							items: visibleProviderItems,
							collapsedItemLimit: getBangGroupCollapsedLimit(visibleProviderItems),
							matchedCount: providerBangResults.total,
							totalCount: providerBangCount
						}
					];
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
							description: 'Use clipboard text as the search query.',
							score: 80,
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
				id: 'settings',
				getGroups(context) {
					return getSettingsGroups(context);
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

	function getTextareaPlaceholder() {
		if (bangPickerActive || mode.id === 'bangs') {
			return 'Filter term... (bangs will be filtered and sorted based on this term)';
		}
		if (mode.id === 'search') {
			return 'Search query... (the query will be sent to your search provider)';
		}
		if (mode.id === 'compromise') {
			return 'Text sample... (NLP signals will be extracted from this text)';
		}
		if (mode.id === 'settings') {
			return 'Filter settings... (settings are read-only for now)';
		}

		return 'Filter term... (modes will be filtered and sorted based on this term)';
	}

	function getSettingsGroups(context: LauncherContext): LauncherGroup[] {
		const groups = context.hasValue
			? settingGroups
					.map((group) => scoreSettingGroup(group, context.text))
					.filter((group) => group.score > 0)
			: settingGroups.map((group, index) => ({
					...group,
					score: 100 - index,
					titleResult: null,
					descriptionResult: null,
					options: group.options.map((option) => ({
						...option,
						score: 100 - index,
						titleResult: null,
						descriptionResult: null
					})),
					allOptions: group.options.map((option) => ({
						...option,
						score: 100 - index,
						titleResult: null,
						descriptionResult: null
					}))
				}));

		return groups
			.sort((a, b) => b.score - a.score)
			.map((group) => ({
				id: `settings.${group.id}`,
				pluginId: 'settings',
				title: group.title,
				titleValue: group.currentLabel(),
				description: group.description,
				titleSegments: getFuzzyHighlightSegments(group.title, group.titleResult),
				descriptionSegments: getSettingGroupDescriptionSegments(group),
				items: group.options.map((option, index) => createSettingItem(group, option, index)),
				allItems: context.hasValue
					? group.allOptions.map((option, index) => createSettingItem(group, option, index))
					: undefined,
				collapsedItemLimit: context.hasValue ? group.options.length : 0,
				matchedCount: context.hasValue ? group.options.length : undefined,
				totalCount: group.allOptions.length
			}));
	}

	function scoreSettingGroup(group: SettingGroupDefinition, query: string): ScoredSettingGroup {
		const groupText = getSettingSearchText(group.title, group.description, group.aliases);
		const titleResult = getSettingFuzzyResult(query, group.title);
		const descriptionResult = getSettingFuzzyResult(query, group.description);
		const groupResult = getSettingFuzzyResult(query, groupText);
		const groupScore = normalizeFuzzyScore(groupResult);
		const options = group.options
			.map((option) => scoreSettingOption(option, query))
			.filter((option) => option.score > 0);
		const allOptions = group.options.map((option) => scoreSettingOption(option, query));

		return {
			...group,
			score: Math.max(groupScore, ...options.map((option) => option.score), 0),
			titleResult,
			descriptionResult,
			options,
			allOptions
		};
	}

	function scoreSettingOption(option: SettingOption, query: string): ScoredSettingOption {
		const optionText = getSettingSearchText(option.label, option.description, option.aliases);
		const titleResult = getSettingFuzzyResult(query, option.label);
		const descriptionResult = getSettingFuzzyResult(query, option.description);
		const optionResult = getSettingFuzzyResult(query, optionText);

		return {
			...option,
			score: normalizeFuzzyScore(optionResult),
			titleResult,
			descriptionResult
		};
	}

	function getSettingSearchText(title: string, description: string, aliases: readonly string[]) {
		return `${title} ${description} ${aliases.join(' ')}`;
	}

	function getSettingFuzzyResult(query: string, target: string) {
		const result = fuzzysort.single(query, target);

		return result && result.score >= settingsMatchThreshold ? result : null;
	}

	function normalizeFuzzyScore(result: Fuzzysort.Result | null) {
		return result ? Math.max(1, Math.round(result.score * 100)) : 0;
	}

	function createSettingItem(
		group: ScoredSettingGroup,
		option: ScoredSettingOption,
		index: number
	): LauncherItem {
		const selected = option.label === group.currentLabel();

		return {
			id: `settings.${group.id}.${option.id}`,
			pluginId: 'settings',
			kind: 'action',
			title: option.label,
			selected,
			description: option.description,
			titleSegments: getFuzzyHighlightSegments(option.label, option.titleResult),
			descriptionSegments: getSettingDescriptionSegments(option),
			score: option.score,
			sortOrder: index,
			run: option.run
		};
	}

	function getSettingDescriptionSegments(option: ScoredSettingOption) {
		return getFuzzyHighlightSegments(option.description, option.descriptionResult);
	}

	function getSettingGroupDescriptionSegments(group: ScoredSettingGroup) {
		return getFuzzyHighlightSegments(group.description, group.descriptionResult);
	}

	function getModeListItems(context: LauncherContext): LauncherItem[] {
		const modes = launcherModes.filter((mode) => mode.id !== 'everything');

		if (!context.hasValue) {
			return modes.map((mode, index) => createModeListItem(mode, 120 - index, index, index));
		}

		return fuzzysort
			.go(
				context.text,
				modes.map((mode) => ({
					mode,
					searchText: `${mode.label} ${mode.description} ${mode.keywords.join(' ')}`
				})),
				{
					key: 'searchText',
					limit: modes.length,
					threshold: 0.4
				}
			)
			.map((result, index) => {
				const { mode } = result.obj;
				const titleResult = fuzzysort.single(context.text, mode.label);

				return createModeListItem(mode, 100 + Math.round(result.score * 20), index, undefined, {
					titleSegments: getFuzzyHighlightSegments(mode.label, titleResult)
				});
			});
	}

	function createBangLauncherItems(
		results: BangFilterResult[],
		source: 'my' | 'provider'
	): LauncherItem[] {
		return results.map(({ item, score, highlights }, index) => ({
			id: `bangs.${source}.${index}.${item.code[0] ?? item.rank}`,
			pluginId: 'bangs',
			kind: 'action' as const,
			title: item.name,
			description: getBangItemDescription(item, source),
			titleSegments: highlights.name,
			descriptionSegments: mode.id === 'bangs' ? undefined : getBangDescriptionSegments(highlights),
			rank: item.rank,
			score,
			sortOrder: index,
			safeForEnter: mode.id !== 'bangs',
			run:
				mode.id === 'bangs'
					? () => (source === 'my' ? removeMyBang(item) : addMyBang(item))
					: () => insertBang(item.code[0])
		}));
	}

	function getBangModeActionLabel(source: 'my' | 'provider') {
		return source === 'my' ? 'Remove from My bangs' : 'Add to My bangs';
	}

	function getBangItemDescription(item: Zbang, source: 'my' | 'provider') {
		const description = `${item.code.join(' ')} | ${formatBangUrl(item.urls.s)}`;

		return mode.id === 'bangs' ? `${getBangModeActionLabel(source)} | ${description}` : description;
	}

	function createModeListItem(
		mode: LauncherMode,
		score: number,
		shortcutIndex: number,
		sortOrder?: number,
		overrides: Partial<LauncherItem> = {}
	): LauncherItem {
		return {
			id: `mode-list.${mode.id}`,
			pluginId: 'mode-list',
			kind: 'action',
			title: mode.label,
			description: mode.description,
			score,
			sortOrder,
			safeForEnter: shortcutIndex === 0,
			run: () => goto(resolve(mode.path)),
			...overrides
		};
	}

	function getFuzzyHighlightSegments(target: string, result: Fuzzysort.Result | null) {
		if (!result?.indexes.length) return [{ text: target, matched: false }];

		const matchedIndexes = new Set(result.indexes);
		const segments: BangHighlightSegment[] = [];
		let current = '';
		let currentMatched = matchedIndexes.has(0);

		for (let index = 0; index < target.length; index += 1) {
			const matched = matchedIndexes.has(index);

			if (matched !== currentMatched) {
				if (current) segments.push({ text: current, matched: currentMatched });
				current = '';
				currentMatched = matched;
			}

			current += target[index];
		}

		if (current) segments.push({ text: current, matched: currentMatched });

		return segments;
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
					title: 'NLP inspector',
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

	function getBangDescriptionSegments({ code, url }: BangFilterResult['highlights']) {
		const segments: BangHighlightSegment[] = [];

		for (const [index, codeHighlight] of code.entries()) {
			if (index) segments.push({ text: ' ', matched: false });
			segments.push(...codeHighlight.segments);
		}

		segments.push({ text: ' | ', matched: false });
		segments.push(...stripUrlPrefixSegments(url));

		return segments;
	}

	function stripUrlPrefixSegments(segments: BangHighlightSegment[]) {
		const visibleSegments: BangHighlightSegment[] = [];
		let charsToStrip = getUrlPrefixLength(segments.map(({ text }) => text).join(''));

		for (const segment of segments) {
			if (charsToStrip >= segment.text.length) {
				charsToStrip -= segment.text.length;
				continue;
			}

			visibleSegments.push({ ...segment, text: segment.text.slice(charsToStrip) });
			charsToStrip = 0;
		}

		return visibleSegments;
	}

	function getUrlPrefixLength(url: string) {
		return /^https?:\/\/www\./.exec(url)?.[0].length ?? /^https?:\/\//.exec(url)?.[0].length ?? 0;
	}

	function formatItemMeta(item: LauncherItem) {
		if (item.pluginId === 'settings') return '';
		if (item.pluginId === 'bang-data') return '';

		return [item.pluginId, item.rank ? `rank ${formatCount(item.rank)}` : undefined, item.score]
			.filter(Boolean)
			.join(' | ');
	}
</script>

<svelte:document
	onmousedown={handleDocumentMouseDown}
	onvisibilitychange={handleVisibilityChange}
/>

{#snippet highlightedText(segments: BangHighlightSegment[] | undefined, fallback: string)}
	{#if segments}
		{#each segments as segment, index (`${index}-${segment.text}-${segment.matched}`)}
			<span class={segment.matched ? 'match-highlight' : undefined}>{segment.text}</span>
		{/each}
	{:else}
		{fallback}
	{/if}
{/snippet}

{#snippet actionItem(item: LauncherItem, shortcutLabel: string | undefined)}
	{@const itemMeta = formatItemMeta(item)}
	{@const itemShortcutLabel = item.pluginId === 'bang-data' ? undefined : shortcutLabel}
	{@const hasShortcut = Boolean(itemShortcutLabel)}
	{@const hasAside = hasShortcut || Boolean(itemMeta)}
	<div
		class:notification-item={item.pluginId === 'bang-data'}
		class:primary={item.id === primaryLauncherItem?.id}
		class="launcher-item action-item"
	>
		<button
			class:has-shortcut={hasShortcut}
			class="item-run"
			disabled={!item.run}
			onclick={() => item.run?.()}
		>
			<span class="item-text">
				<span class="item-heading">
					{#if item.pluginId === 'settings'}
						<svg
							class:checked={item.selected}
							class="radio-indicator"
							viewBox="0 0 16 16"
							aria-hidden="true"
						>
							<circle class="radio-ring" cx="8" cy="8" r="6" />
							<circle class="radio-dot" cx="8" cy="8" r="3" />
						</svg>
					{/if}
					<strong>{@render highlightedText(item.titleSegments, item.title)}</strong>
				</span>
				{#if item.description}<small
						>{@render highlightedText(item.descriptionSegments, item.description)}</small
					>{/if}
			</span>
			{#if hasAside}
				<span class="item-aside">
					{#if itemShortcutLabel}<span class="shortcut-label">{itemShortcutLabel}</span>{/if}
					{#if itemMeta}<span class="meta">{itemMeta}</span>{/if}
				</span>
			{/if}
		</button>

		{#if item.secondaryAction}
			<button
				class="secondary-action"
				title={item.secondaryAction.title}
				onclick={() => item.secondaryAction?.run()}
			>
				{item.secondaryAction.label}
			</button>
		{/if}
	</div>
{/snippet}

{#snippet insightItem(item: LauncherItem)}
	<article class="launcher-item insight-item">
		<span class="item-text">
			<span class="item-heading">
				<strong>{@render highlightedText(item.titleSegments, item.title)}</strong>
			</span>
			{#if item.description}<small
					>{@render highlightedText(item.descriptionSegments, item.description)}</small
				>{/if}
		</span>
		<span class="meta">{formatItemMeta(item)}</span>
	</article>
{/snippet}

{#snippet launcherGroup(group: LauncherGroup)}
	{@const visibleItems = getVisibleGroupItems(group)}
	{@const renderedItems = getRenderedGroupItems(group)}
	{@const hiddenCount = (group.allItems ?? group.items).length - visibleItems.length}
	{@const expanded = Boolean(expandedLauncherGroups[group.id])}
	{@const toggleLabel = getGroupToggleLabel(group, hiddenCount, expanded)}
	{@const mobileCountLabel = getGroupMobileCountLabel(group)}
	{@const shortcutLabel = getShortcutLabel(group.id)}
	<section
		class:empty-group={renderedItems.length === 0}
		class="launcher-group"
		aria-labelledby={`${group.id}-heading`}
	>
		<button
			class:primary={primaryLauncherTarget?.kind === 'group' &&
				primaryLauncherTarget.id === group.id}
			class:has-shortcut={Boolean(shortcutLabel)}
			class="launcher-group-header"
			onclick={() => activateLauncherGroup(group.id)}
		>
			<span class="item-text">
				<span class="item-heading">
					<strong id={`${group.id}-heading`}
						>{@render highlightedText(
							group.titleSegments,
							group.title
						)}{#if group.titleValue}:{/if}</strong
					>
					{#if group.titleValue}<span class="group-title-value">{group.titleValue}</span>{/if}
				</span>
				{#if group.description}<small class="group-description"
						>{@render highlightedText(group.descriptionSegments, group.description)}</small
					>{/if}
				{#if mobileCountLabel}
					<small class="group-mobile-count">{mobileCountLabel}</small>
				{/if}
			</span>
			<span class="item-aside">
				{#if shortcutLabel}<span class="shortcut-label">{shortcutLabel}</span>{/if}
				<span class="meta">{getGroupCountLabel(group)}</span>
				{#if toggleLabel}
					<span class="group-toggle-label">{toggleLabel}</span>
				{/if}
			</span>
		</button>

		<div class="launcher-group-items">
			{#each renderedItems as item (item.id)}
				{#if item.kind === 'action'}
					{@const shortcutLabel = getShortcutLabel(item.id)}
					{@render actionItem(item, shortcutLabel)}
				{:else}
					{@render insightItem(item)}
				{/if}
			{/each}
		</div>
	</section>
{/snippet}

<main>
	<Header modeLabel={mode.label} />

	<div class="launcher-input-shell">
		<ExpandingTextarea
			bind:textareaElement
			bind:value
			bind:fullscreen
			bind:wordwrap
			bind:enterNewlineRestored
			bind:enterNewlineFullscreen
			autofocus
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder={textareaPlaceholder}
			onbeforeinput={handleLauncherBeforeInput}
			onclick={handleLauncherCursorChange}
			oninput={handleLauncherInput}
			onkeydown={handleLauncherKeydown}
			onkeyup={handleLauncherCursorChange}
			onprimaryaction={runPrimaryAction}
		>
			{#snippet primaryAction()}
				{#if fullscreen && primaryLauncherItem}
					{@render actionItem(primaryLauncherItem, getShortcutLabel(primaryLauncherItem.id))}
				{/if}
			{/snippet}
		</ExpandingTextarea>
	</div>

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
				{@const shortcutLabel = getShortcutLabel(item.id)}
				{@render actionItem(item, shortcutLabel)}
			{:else}
				{@render insightItem(item)}
			{/if}
		{/each}
		{#each visibleLauncherGroups as group (group.id)}
			{@render launcherGroup(group)}
		{/each}
	</section>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
		padding-block-end: var(--size-4);
	}

	.launcher-input-shell {
		position: sticky;
		top: 0;
		z-index: 2;
		padding-block-start: var(--size-1);
		background: var(--nc-surface-1);
	}

	.launcher-list {
		display: grid;
		gap: var(--size-3);
		margin-block-start: var(--size-3);
	}

	.launcher-group {
		display: grid;
		gap: 0;
	}

	.launcher-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-3);
		width: 100%;
		margin: 0;
		padding: var(--size-2) var(--size-3);
		color: var(--nc-tx-1);
		text-align: left;
		background: var(--nc-surface-2);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius) var(--nc-radius) 0 0;
		box-shadow: none;
	}

	.launcher-group.empty-group .launcher-group-header {
		border-radius: var(--nc-radius);
	}

	.launcher-group-header:hover,
	.launcher-group-header:focus {
		background: color-mix(in srgb, var(--nc-primary) 8%, var(--nc-surface-2));
		box-shadow: none;
	}

	.launcher-group-header.primary {
		background: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-2));
		border-color: var(--nc-primary);
		box-shadow: 0 0.375rem 1rem color-mix(in srgb, var(--nc-primary) 16%, transparent);
	}

	.launcher-group-items {
		display: grid;
		gap: 0;
	}

	.launcher-group-items > .launcher-item {
		border-top: 0;
		border-radius: 0;
	}

	.launcher-group-items > .launcher-item:last-child {
		border-radius: 0 0 var(--nc-radius) var(--nc-radius);
	}

	.group-toggle-label {
		color: var(--nc-primary);
		font-size: var(--font-size-0);
		font-weight: 700;
		white-space: nowrap;
	}

	.group-title-value {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 400;
	}

	.launcher-group-header .item-heading strong {
		flex: 0 1 auto;
	}

	.group-mobile-count {
		display: none;
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
		transition:
			background-color 120ms ease,
			border-color 120ms ease,
			box-shadow 120ms ease,
			transform 120ms ease;
	}

	.item-run {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-3);
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		padding: 0;
		color: inherit;
		text-align: left;
		background: transparent;
		border: none;
		box-shadow: none;
	}

	.item-run:hover,
	.item-run:focus {
		background: transparent;
		box-shadow: none;
	}

	.item-run:disabled {
		color: inherit;
		cursor: default;
		opacity: 1;
	}

	.secondary-action {
		flex: 0 0 auto;
		margin: 0;
		padding: 0.25rem 0.5rem;
		font-size: var(--font-size-0);
	}

	.action-item.primary {
		--buttonBg: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		--buttonText: var(--nc-tx-1);

		background: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		border-color: var(--nc-primary);
		box-shadow: 0 0.375rem 1rem color-mix(in srgb, var(--nc-primary) 16%, transparent);
		transform: translateY(-1px);
	}

	.launcher-group .action-item.primary {
		transform: none;
	}

	.notification-item {
		background: color-mix(in srgb, var(--yellow-2) 72%, var(--nc-surface-1));
		border-color: var(--yellow-6);
	}

	.notification-item.primary {
		background: color-mix(in srgb, var(--yellow-3) 78%, var(--nc-surface-1));
		border-color: var(--yellow-7);
		box-shadow: 0 0.375rem 1rem color-mix(in srgb, var(--yellow-6) 20%, transparent);
	}

	.insight-item {
		color: var(--nc-tx-2);
	}

	.item-text {
		flex: 1 1 auto;
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}

	.item-heading {
		display: flex;
		align-items: center;
		gap: var(--size-2);
		min-width: 0;
	}

	.item-heading strong {
		flex: 1 1 auto;
		display: block;
		min-width: 0;
	}

	.radio-indicator {
		flex: 0 0 auto;
		width: 1rem;
		height: 1rem;
		color: color-mix(in srgb, var(--nc-tx-2) 82%, var(--nc-border));
		overflow: visible;
	}

	.radio-ring {
		fill: var(--nc-surface-1);
		stroke: currentColor;
		stroke-width: 2;
	}

	.radio-dot {
		fill: var(--nc-primary);
		opacity: 0;
	}

	.radio-indicator.checked {
		color: var(--nc-primary);
	}

	.radio-indicator.checked .radio-dot {
		opacity: 1;
	}

	.action-item.primary .radio-ring {
		fill: color-mix(in srgb, var(--nc-primary) 6%, var(--nc-surface-1));
	}

	.item-aside {
		flex: 0 0 auto;
		display: grid;
		justify-items: end;
		gap: 0.125rem;
	}

	.shortcut-label {
		display: inline-grid;
		place-items: center;
		min-width: 1.05rem;
		height: 1.05rem;
		padding: 0 0.1875rem;
		margin-inline: 0.125rem;
		font-family: monospace;
		font-size: 0.74rem;
		font-weight: 700;
		line-height: 1;
		color: var(--nc-tx-2);
		background: var(--nc-surface-2);
		border: 1px solid var(--nc-border);
		border-radius: calc(var(--nc-radius) * 0.55);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 52%, transparent),
			0 1px 2px color-mix(in srgb, black 12%, transparent);
	}

	.action-item.primary .shortcut-label,
	.launcher-group-header.primary .shortcut-label {
		color: var(--nc-primary);
	}

	.action-item.primary .shortcut-label,
	.launcher-group-header.primary .shortcut-label {
		border-color: color-mix(in srgb, var(--nc-primary) 55%, var(--nc-border));
	}

	.launcher-item strong,
	.launcher-item small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.launcher-item small {
		color: var(--nc-tx-2);
	}

	.match-highlight {
		color: rgb(255 62 0 / 0.76);
		border-radius: 0.2em;
		font-weight: 700;
		padding-inline: 0.08em;
	}

	.meta {
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.launcher-list {
			gap: var(--size-2);
			margin-block-start: var(--size-2);
		}

		.launcher-item {
			gap: var(--size-2);
			padding: var(--size-1) var(--size-2);
			min-height: 0;
		}

		.item-heading {
			gap: var(--size-1);
		}

		.item-run.has-shortcut {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: start;
			gap: 0.125rem var(--size-2);
		}

		.item-run.has-shortcut .item-text {
			display: contents;
		}

		.item-run.has-shortcut .item-heading {
			grid-column: 1;
		}

		.item-run.has-shortcut .item-text small {
			grid-column: 1 / -1;
		}

		.item-run.has-shortcut .item-aside {
			grid-column: 2;
			grid-row: 1;
		}

		.launcher-group-header {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: start;
			gap: 0.125rem var(--size-2);
			padding: var(--size-1) var(--size-2);
		}

		.launcher-group-header .item-text {
			display: contents;
		}

		.launcher-group-header .item-heading {
			grid-column: 1;
			grid-row: 1;
		}

		.launcher-group-header .item-aside {
			grid-column: 2;
			grid-row: 1;
		}

		.launcher-group-header .meta,
		.group-description {
			display: none;
		}

		.group-mobile-count {
			display: block;
			grid-column: 1 / -1;
			grid-row: 2;
			overflow: hidden;
			color: var(--nc-tx-2);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.launcher-item .meta {
			display: none;
		}
	}
</style>
