<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import fuzzysort from 'fuzzysort';
	import { onMount } from 'svelte';

	import {
		readMyBangs,
		writeMyBangs,
		type BangProviderId,
		type RankedZbangCatalog,
		type ZbangRecord
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
	import { getBangExecutionTargetUrls, getSearchUrl } from '$lib/launcher/bang-resolver';
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
		setCustomSearchTarget,
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
		google: 'Google',
		get custom() {
			return settings.customSearchLabel;
		}
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
	const itemShortcutLabels = ['Q', 'W', 'E', 'R', 'T', 'Y'] as const;
	const itemMenuShortcutLabels = ['A', 'S', 'D', 'F', 'G', 'H'] as const;
	const groupShortcutLabels = ['U', 'I', 'O'] as const;
	const groupMenuShortcutLabels = ['J', 'K', 'L'] as const;
	const menuSlideDuration = 720;
	const shortcutBadgeFlyDuration = 640;
	const pseudoMenuBadgeDelay = 320;
	const pseudoMenuBadgeDuration = 280;
	const parentShortcutLabel = 'P';
	const utilityShortcutLabels = ['Z', 'X', 'C', 'V'] as const;
	const shortcutKeys = new Set([
		'.',
		' ',
		parentShortcutLabel,
		...utilityShortcutLabels,
		...itemShortcutLabels,
		...itemMenuShortcutLabels,
		...groupShortcutLabels,
		...groupMenuShortcutLabels
	]);
	const shortcutDelay = 250;
	const settingsMatchThreshold = 0.4;
	const bangFanoutAckTimeoutMs = 2500;
	const launcherGroupItemLimits: Record<string, number> = {
		'bangs.my': 8,
		'bangs.provider': 8
	};
	type InputFrame = { data: string | null; inputType: string; ts: number };
	type KeyFrame = { key: string; ts: number };
	type SettingOption = {
		id: string;
		label: string;
		description: string | (() => string);
		aliases: readonly string[];
		selected?: () => boolean;
		run: () => void;
	};
	type LauncherAction = {
		id: string;
		label: string;
		title?: string;
		run: () => void | Promise<void>;
	};
	type PrimaryLauncherTarget =
		| {
				id: string;
				kind: 'item';
				title: string;
				item: LauncherItem;
				groupId?: string;
				actions: LauncherAction[];
		  }
		| { id: string; kind: 'group'; title: string; group: LauncherGroup; actions: LauncherAction[] };
	type ShortcutLane =
		| 'item-focus'
		| 'item-menu'
		| 'group-focus'
		| 'group-menu'
		| 'parent'
		| 'primary'
		| 'utility';
	type PendingTripleShortcut = {
		key: string;
		ts: number;
		lane: ShortcutLane;
		target?: PrimaryLauncherTarget;
	};
	type ShortcutTargetSlot = PrimaryLauncherTarget | undefined;
	type FocusSnapshot = {
		selectedPrimaryItemId: string | undefined;
		activeLauncherGroupId: string | undefined;
	};
	type ShortcutBinding =
		| { key: string; kind: 'target'; lane: ShortcutLane; target: PrimaryLauncherTarget }
		| { key: string; kind: 'parent' | 'utility' | 'text-transform'; lane: ShortcutLane };
	type StagedShortcut = {
		buffer: string;
		binding: ShortcutBinding;
		focusSnapshot: FocusSnapshot;
		selectionStart: number;
		selectionEnd: number;
		menuActionIndex?: number;
		ts: number;
	};
	type InputPreviewSegment = {
		kind: 'committed' | 'shortcut-staged' | 'bang-picker-staged';
		text: string;
	};
	type StatusHint = { key: string; label: string };
	type StagedActionMenu = { target: PrimaryLauncherTarget; actions: LauncherAction[]; rootKey: string };
	type SettingGroupDefinition = {
		id: string;
		title: string;
		description: string;
		aliases: readonly string[];
		currentLabel: () => string;
		options: readonly SettingOption[];
	};
	type ScoredSettingOption = Omit<SettingOption, 'description'> & {
		description: string;
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
				selected: () => settings.colorScheme === value,
				run: () => setColorScheme(value)
			}))
		},
		{
			id: 'search-provider',
			title: 'Search engine',
			description: 'Used for regular web searches.',
			aliases: ['default search', 'web search', 'search provider'],
			currentLabel: () => searchProviderLabels[settings.searchProvider],
			options: searchProviders.map((value) => ({
				id: value,
				label: value === 'custom' ? 'Custom' : searchProviderLabels[value],
				description:
					value === 'custom'
						? () => `Use custom search target: ${searchProviderLabels.custom}.`
						: `Use ${searchProviderLabels[value]} for default web searches.`,
				aliases: [value, searchProviderLabels[value], 'search engine'],
				selected: () => settings.searchProvider === value,
				run: () => setSearchProvider(value)
			}))
		},
		{
			id: 'bang-provider',
			title: 'Bang engine',
			description: 'Used for fallback bangs.',
			aliases: ['bang catalog', 'bangs catalog', 'shortcut catalog', 'bang provider'],
			currentLabel: () => bangProviderLabels[settings.bangProvider],
			options: bangProviders.map((value) => ({
				id: value,
				label: bangProviderLabels[value],
				description: `Use ${bangProviderLabels[value]} for full list and fallback bang execution.`,
				aliases: [value, bangProviderLabels[value], 'bang catalog'],
				selected: () => settings.bangProvider === value,
				run: () => setBangProvider(value)
			}))
		}
	];
	let bangCatalog = $state<RankedZbangCatalog>();
	let loadedBangProvider = $state<BangProviderId>();
	let textareaElement = $state<HTMLTextAreaElement>();
	let bangEntry = $state<BangEntry>();
	let fullscreen = $state(false);
	let wordwrap = $state(true);
	let enterNewlineRestored = $state(false);
	let enterNewlineFullscreen = $state(true);
	let selectedPrimaryItemId = $state<string>();
	let activeLauncherGroupId = $state<string>();
	let inputHistory = $state<InputFrame[]>([]);
	let keyHistory: KeyFrame[] = [];
	let pendingShortcutItemTargets: PrimaryLauncherTarget[] = [];
	let pendingShortcutGroupTargets: ShortcutTargetSlot[] = [];
	let pendingShortcutPrimaryTarget: PrimaryLauncherTarget | undefined;
	let pendingShortcutFocusSnapshot: FocusSnapshot | undefined;
	let pendingTripleShortcut: PendingTripleShortcut | undefined;
	let stagedShortcut = $state<StagedShortcut>();
	let myBangWrite = Promise.resolve();
	let loadingBangProvider = $state<BangProviderId>();
	let doubleKeypress = $state<string>();
	let tripleKeypress = $state<string>();
	let isPeriodShortcut = $state(false);
	let isMobilePeriodShortcut = $state(false);
	let expandedLauncherGroups = $state<Record<string, boolean>>({});
	let myBangs = $state<ZbangRecord[]>([]);
	let bangFanoutTargets = $state<string[]>([]);
	let bangFanoutError = $state('');
	let bangFanoutActionLabel = $state('Open');
	let lastUrlQuery = $state(initialUrlQuery);
	let bangPickerPrimaryInitialized = false;
	let hadSettingsFilter = false;
	let skipNextSettingsFilterReset = false;

	$effect(() => {
		const urlQuery = page.url.searchParams.get('q') ?? '';

		if (urlQuery === lastUrlQuery) return;

		lastUrlQuery = urlQuery;
		value = urlQuery;
		bangEntry = undefined;
		clearBangFanoutMessage();
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
	const hasBangFilter = $derived(bangEntry ? Boolean(bangEntry.fragment.trim()) : hasValue);
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
	const rootModeListItems = $derived(launcherItems.filter((item) => item.pluginId === 'mode-list'));
	const rootSearchFallbackActive = $derived(
		mode.id === 'everything' && hasValue && (bangPickerActive || rootModeListItems.length === 0)
	);
	const activePluginIds = $derived(
		rootSearchFallbackActive ? getLauncherMode('search').pluginIds : mode.pluginIds
	);
	const visibleLauncherItems = $derived(
		launcherItems.filter((item) => activePluginIds.includes(item.pluginId))
	);
	const visibleLauncherGroups = $derived(
		launcherGroups.filter(
			(group) => activePluginIds.includes(group.pluginId) && shouldRenderGroup(group)
		)
	);
	const textareaPlaceholder = $derived(getTextareaPlaceholder());
	const inputDisplayValue = $derived(getInputDisplayValue());
	const inputPreviewSegments = $derived(getInputPreviewSegments());
	const stagedShortcutStatusHint = $derived(getStagedShortcutStatusHint());
	const stagedActionMenu = $derived(getStagedActionMenu());
	const selectablePrimaryTargets = $derived(getSelectablePrimaryTargets());
	const activeLauncherGroup = $derived(getActiveLauncherGroup());
	const shortcutItemTargets = $derived(
		getShortcutItemTargets().slice(0, itemShortcutLabels.length)
	);
	const shortcutGroupTargets = $derived(getShortcutGroupTargets());
	const validShortcutBindings = $derived(getValidShortcutBindings());
	const shortcutTargetIds = $derived(
		new Map([
			...shortcutItemTargets.map(
				(target, index) => [target.id, itemShortcutLabels[index]] as const
			),
			...shortcutGroupTargets
				.map((target, index) =>
					target ? ([target.id, groupShortcutLabels[index]] as const) : undefined
				)
				.filter((entry) => entry !== undefined)
		])
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
		if (!bangPickerActive) {
			bangPickerPrimaryInitialized = false;
			return;
		}

		if (bangPickerPrimaryInitialized) return;

		const target = getDefaultBangPickerPrimaryTarget();
		if (!target) return;

		focusLauncherTarget(target);
		bangPickerPrimaryInitialized = true;
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

	function setBangAsDefaultSearch(item: ZbangRecord) {
		const code = item.code[0] ? normalizeBangCode(item.code[0]) : '';
		const label = [item.name, code].filter(Boolean).join(' ');

		setCustomSearchTarget(label, item.urls.s);
	}

	function getLauncherShareUrl() {
		const url = new URL(resolve(mode.path), window.location.href);
		url.searchParams.set('q', value.trim());

		return url.toString();
	}

	function search(provider = settings.searchProvider) {
		window.open(
			getSearchUrl(provider, value, settings.customSearchTemplate),
			'_blank',
			'noopener,noreferrer'
		);
	}

	async function executeBangSearch(composition = bangComposition) {
		clearBangFanoutMessage();

		const targetUrls = getBangExecutionTargetUrls(composition, settings);
		const actionLabel = composition.payloadText ? 'Search' : 'Open';

		if (!targetUrls.length) return;

		bangFanoutActionLabel = actionLabel;

		const failedTargets = await openBangTargetsWithRelay(targetUrls);

		if (failedTargets.length) {
			bangFanoutTargets = failedTargets;
			bangFanoutError = 'Could not open these bang targets. Check popup permissions for Whiz.';
			return;
		}

		clearBangFanoutMessage();
	}

	function openBangTargetsWithRelay(targetUrls: string[]) {
		if (!('BroadcastChannel' in window)) {
			bangFanoutError = 'Could not confirm bang targets opened in this browser.';
			return Promise.resolve(targetUrls);
		}

		const channelName = `launcher-bang-fanout-${crypto.randomUUID()}`;
		const acknowledged = Array.from({ length: targetUrls.length }, () => false);
		let acknowledgedCount = 0;
		const channel = new BroadcastChannel(channelName);

		return new Promise<string[]>((resolve) => {
			const getFailedTargets = () => targetUrls.filter((_, index) => !acknowledged[index]);

			const finish = () => {
				clearTimeout(timeout);
				channel.close();
				resolve(getFailedTargets());
			};

			const timeout = window.setTimeout(finish, bangFanoutAckTimeoutMs);

			channel.onmessage = (event: MessageEvent<{ index?: number }>) => {
				const index = event.data.index;

				if (typeof index !== 'number' || index < 1 || index > targetUrls.length) {
					return;
				}

				if (acknowledged[index - 1]) return;

				acknowledged[index - 1] = true;
				acknowledgedCount += 1;

				if (acknowledgedCount === targetUrls.length) {
					finish();
				}
			};

			for (const [offset, targetUrl] of targetUrls.entries()) {
				const relayUrl = new URL('/go/open', window.location.href);

				relayUrl.searchParams.set('target', targetUrl);
				relayUrl.searchParams.set('channel', channelName);
				relayUrl.searchParams.set('index', String(offset + 1));

				window.open(relayUrl.toString(), '_blank', 'noopener,noreferrer');
			}
		});
	}

	function clearBangFanoutMessage() {
		bangFanoutTargets = [];
		bangFanoutError = '';
		bangFanoutActionLabel = 'Open';
	}

	function getBangFanoutTargetLabel(targetUrl: string) {
		try {
			return new URL(targetUrl).hostname.replace(/^www\./, '');
		} catch {
			return targetUrl;
		}
	}

	function getBangFanoutLinkAttributes(targetUrl: string) {
		return {
			href: targetUrl,
			target: '_blank',
			rel: 'noopener noreferrer'
		};
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

	async function addMyBang(item: ZbangRecord) {
		if (hasBangCodeOverlap(item, myBangCodes)) return;

		const nextMyBangs = [...myBangs, cloneBang(item)];
		myBangs = nextMyBangs;
		await persistMyBangs(nextMyBangs);
	}

	async function removeMyBang(item: ZbangRecord) {
		const index = myBangs.findIndex((myBang) => isSameBang(myBang, item));

		if (index === -1) return;

		const nextMyBangs = [...myBangs.slice(0, index), ...myBangs.slice(index + 1)];
		myBangs = nextMyBangs;
		await persistMyBangs(nextMyBangs);
	}

	async function persistMyBangs(items: ZbangRecord[]) {
		const persistedItems = items.map(cloneBang);
		myBangWrite = myBangWrite.catch(() => undefined).then(() => writeMyBangs(persistedItems));
		await myBangWrite;
	}

	function cloneBang(item: ZbangRecord): ZbangRecord {
		return {
			rank: item.rank,
			popularity: item.popularity,
			name: item.name,
			code: [...item.code],
			tags: [...item.tags],
			urls: { s: item.urls.s }
		};
	}

	function isSameBang(a: ZbangRecord, b: ZbangRecord) {
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

	function hasBangCodeOverlap(item: ZbangRecord, codes: Set<string>) {
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

	function getInputDisplayValue() {
		if (!stagedShortcut) return undefined;

		return (
			value.slice(0, stagedShortcut.selectionStart) +
			stagedShortcut.buffer +
			value.slice(stagedShortcut.selectionEnd)
		);
	}

	function getInputPreviewSegments(): InputPreviewSegment[] | undefined {
		if (!stagedShortcut) return getBangPickerPreviewSegments();

		return [
			{ kind: 'committed', text: value.slice(0, stagedShortcut.selectionStart) },
			{ kind: 'shortcut-staged', text: stagedShortcut.buffer },
			{ kind: 'committed', text: value.slice(stagedShortcut.selectionEnd) }
		];
	}

	function getBangPickerPreviewSegments(): InputPreviewSegment[] | undefined {
		if (!bangEntry) return undefined;

		const fragmentStart = bangEntry.triggerIndex + 1;
		const whitespaceIndex = value.slice(fragmentStart).search(/\s/);
		const tokenEnd = whitespaceIndex === -1 ? value.length : fragmentStart + whitespaceIndex;
		const token = value.slice(bangEntry.triggerIndex, tokenEnd);

		if (!token.startsWith('!') || /\s/.test(token)) return undefined;

		return [
			{ kind: 'committed', text: value.slice(0, bangEntry.triggerIndex) },
			{ kind: 'bang-picker-staged', text: token },
			{ kind: 'committed', text: value.slice(tokenEnd) }
		];
	}

	function getStagedShortcutStatusHint(): StatusHint | undefined {
		if (!stagedShortcut) return undefined;
		if (stagedShortcut.binding.kind === 'target') return undefined;

		const label = getStagedShortcutConfirmationLabel(stagedShortcut.binding);
		if (!label) return undefined;

		return { key: 'ENTER', label };
	}

	function getStagedActionMenu(): StagedActionMenu | undefined {
		if (!stagedShortcut?.binding || stagedShortcut.binding.kind !== 'target') return undefined;
		if (!isActionMenuLane(stagedShortcut.binding.lane)) return undefined;

		return {
			target: stagedShortcut.binding.target,
			actions: stagedShortcut.binding.target.actions,
			rootKey: stagedShortcut.binding.key
		};
	}

	function openTargetActionMenu(target: PrimaryLauncherTarget, rootKey: string, ts = Date.now()) {
		if (!textareaElement) return false;

		const { selectionStart, selectionEnd } = textareaElement;
		const focusSnapshot = captureFocusSnapshot();

		captureShortcutSnapshot(rootKey);

		stagedShortcut = {
			buffer: rootKey,
			binding: {
				key: rootKey,
				kind: 'target',
				lane: getTargetMenuLane(target),
				target
			},
			focusSnapshot,
			selectionStart,
			selectionEnd,
			menuActionIndex: getDefaultActionMenuIndex(target),
			ts
		};

		focusLauncherTarget(target);

		requestAnimationFrame(() => {
			const cursor = selectionStart + rootKey.length;
			textareaElement?.setSelectionRange(cursor, cursor);
		});

		return true;
	}

	function getStagedShortcutConfirmationLabel(binding: ShortcutBinding) {
		if (binding.kind === 'target') {
			const action = getArmedTargetAction(binding);

			if (action) return action.title ?? action.label;
			if (isActionMenuLane(binding.lane)) return undefined;

			return binding.target.title;
		}

		if (binding.kind === 'utility') {
			if (binding.key === 'Z') return fullscreen ? 'Restore input' : 'Fullscreen input';
			if (binding.key === 'X') return wordwrap ? 'Disable line wrap' : 'Enable line wrap';
			if (binding.key === 'C') {
				return (fullscreen ? enterNewlineFullscreen : enterNewlineRestored)
					? 'Run action with Enter'
					: 'Insert newline with Enter';
			}
			if (binding.key === 'V') {
				return getPrimaryAction(primaryLauncherTarget)?.label ?? 'Run primary action';
			}
		}

		if (binding.kind === 'parent') return 'Return to input';
		if (binding.kind === 'text-transform' && binding.key === ' ') return 'Insert !';
		if (binding.kind === 'text-transform' && binding.key === '.') return 'Search';

		return undefined;
	}

	function getArmedTargetAction(binding: Extract<ShortcutBinding, { kind: 'target' }>) {
		if (isActionMenuLane(binding.lane)) {
			const defaultIndex = getDefaultActionMenuIndex(binding.target);
			return binding.target.actions[stagedShortcut?.menuActionIndex ?? defaultIndex];
		}

		return getPrimaryAction(binding.target);
	}

	function getDefaultActionMenuIndex(target: PrimaryLauncherTarget) {
		return getSecondaryAction(target) ? 1 : 0;
	}

	function getActionMenuShortcutLabels(rootKey: string, actionCount: number) {
		const reservedKey = rootKey.toLocaleLowerCase();
		return itemShortcutLabels
			.filter((label) => label.toLocaleLowerCase() !== reservedKey)
			.slice(0, actionCount);
	}

	function getActionMenuShortcutLabel(menu: StagedActionMenu, actionIndex: number) {
		return getActionMenuShortcutLabels(menu.rootKey, menu.actions.length)[actionIndex];
	}

	function isItemShortcutLabelDisabled(label: string | undefined) {
		return Boolean(stagedActionMenu && label && (itemShortcutLabels as readonly string[]).includes(label));
	}

	function isActionMenuLane(lane: ShortcutLane) {
		return lane === 'item-menu' || lane === 'group-menu';
	}

	function getTargetFocusLane(target: PrimaryLauncherTarget): ShortcutLane {
		return target.kind === 'group' ? 'group-focus' : 'item-focus';
	}

	function getTargetMenuLane(target: PrimaryLauncherTarget): ShortcutLane {
		return target.kind === 'group' ? 'group-menu' : 'item-menu';
	}

	function isUppercaseShortcutInitiator(key: string | null | undefined) {
		if (!key || key.length !== 1) return false;

		const shortcutKey = key.toLocaleUpperCase();

		return /^[A-Z]$/.test(shortcutKey) && key === shortcutKey && validShortcutBindings.has(shortcutKey);
	}

	function stageShortcutInitiator(key: string, ts = Date.now()) {
		if (!isUppercaseShortcutInitiator(key) || !textareaElement) return false;

		const shortcutKey = key.toLocaleUpperCase();
		const binding = validShortcutBindings.get(shortcutKey);
		if (!binding) return false;
		if (binding.kind === 'target' && binding.target.id === primaryLauncherTarget?.id) {
			return openTargetActionMenu(binding.target, shortcutKey, ts);
		}

		const { selectionStart, selectionEnd } = textareaElement;
		const focusSnapshot = captureFocusSnapshot();

		captureShortcutSnapshot(shortcutKey);

		stagedShortcut = {
			buffer: key,
			binding,
			focusSnapshot,
			selectionStart,
			selectionEnd,
			ts
		};

		if (binding.kind === 'target') focusLauncherTarget(binding.target);

		requestAnimationFrame(() => {
			const cursor = selectionStart + key.length;
			textareaElement?.setSelectionRange(cursor, cursor);
		});

		return true;
	}

	function commitStagedShortcutLiteral(extraText = '') {
		if (!stagedShortcut) return false;

		const { buffer, selectionStart, selectionEnd, focusSnapshot } = stagedShortcut;
		const text = buffer + extraText;
		const cursor = selectionStart + text.length;

		value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
		restoreFocusSnapshot(focusSnapshot);
		resetShortcutState();

		requestAnimationFrame(() => {
			textareaElement?.setSelectionRange(cursor, cursor);
			if (textareaElement) updateBangEntry(textareaElement);
		});

		return true;
	}

	function cancelStagedShortcut() {
		if (!stagedShortcut) return false;

		const { selectionStart, focusSnapshot } = stagedShortcut;

		restoreFocusSnapshot(focusSnapshot);
		resetShortcutState();

		requestAnimationFrame(() => textareaElement?.setSelectionRange(selectionStart, selectionStart));

		return true;
	}

	function downgradeStagedShortcut() {
		if (!stagedShortcut || stagedShortcut.binding.kind !== 'target') return false;
		if (!isActionMenuLane(stagedShortcut.binding.lane)) return false;

		const target = stagedShortcut.binding.target;
		stagedShortcut = {
			...stagedShortcut,
			buffer: stagedShortcut.buffer.slice(0, 1),
			menuActionIndex: undefined,
			binding: {
				...stagedShortcut.binding,
				lane: getTargetFocusLane(target)
			}
		};

		focusLauncherTarget(target);

		requestAnimationFrame(() => {
			const cursor = stagedShortcut
				? stagedShortcut.selectionStart + stagedShortcut.buffer.length
				: undefined;
			if (cursor !== undefined) textareaElement?.setSelectionRange(cursor, cursor);
		});

		return true;
	}

	function confirmStagedShortcut() {
		if (!stagedShortcut) return false;

		executeStagedShortcutConfirmation(stagedShortcut.binding);
		resetShortcutState();

		return true;
	}

	function moveStagedActionMenuSelection(direction: 1 | -1) {
		if (!stagedShortcut || stagedShortcut.binding.kind !== 'target') return false;
		if (!isActionMenuLane(stagedShortcut.binding.lane)) return false;

		const actionCount = stagedShortcut.binding.target.actions.length;
		if (actionCount < 1) return false;

		const currentIndex = stagedShortcut.menuActionIndex ?? getDefaultActionMenuIndex(stagedShortcut.binding.target);
		stagedShortcut = {
			...stagedShortcut,
			menuActionIndex: (currentIndex + direction + actionCount) % actionCount
		};

		return true;
	}

	function executeStagedActionMenuShortcut(key: string) {
		if (!stagedShortcut || stagedShortcut.binding.kind !== 'target') return false;
		if (!isActionMenuLane(stagedShortcut.binding.lane)) return false;

		const labels = getActionMenuShortcutLabels(
			stagedShortcut.binding.key,
			stagedShortcut.binding.target.actions.length
		);
		const actionIndex = labels.findIndex(
			(label) => label.toLocaleLowerCase() === key.toLocaleLowerCase()
		);
		const action = stagedShortcut.binding.target.actions[actionIndex];
		if (!action) return false;

		focusLauncherTarget(stagedShortcut.binding.target);
		void action.run();
		resetShortcutState();

		return true;
	}

	function executeStagedShortcutConfirmation(binding: ShortcutBinding) {
		if (binding.kind === 'target') {
			focusLauncherTarget(binding.target);

			void getArmedTargetAction(binding)?.run();
			return;
		}

		if (binding.kind === 'utility') {
			if (binding.key === 'V') {
				void getPrimaryAction(primaryLauncherTarget)?.run();
				return;
			}

			executeUtilityShortcut(binding.key);
			return;
		}

		if (binding.kind === 'parent') {
			focusInput();
		}
	}

	function fastConfirmStagedShortcut(key: string, ts: number) {
		if (!stagedShortcut) return false;
		if (isActionMenuLane(stagedShortcut.binding.lane)) return false;
		if (ts - stagedShortcut.ts >= shortcutDelay) return false;
		if (key !== stagedShortcut.binding.key) return false;

		executeStagedShortcutConfirmation(stagedShortcut.binding);
		resetShortcutState();

		return true;
	}

	function upgradeStagedShortcut(key: string) {
		if (!stagedShortcut || stagedShortcut.binding.kind !== 'target') return false;
		if (stagedShortcut.binding.lane !== getTargetFocusLane(stagedShortcut.binding.target)) return false;
		if (key.toLocaleLowerCase() !== stagedShortcut.binding.key.toLocaleLowerCase()) return false;

		const target = stagedShortcut.binding.target;
		stagedShortcut = {
			...stagedShortcut,
			buffer: stagedShortcut.buffer + key,
			menuActionIndex: getDefaultActionMenuIndex(target),
			binding: {
				...stagedShortcut.binding,
				lane: getTargetMenuLane(target)
			}
		};

		focusLauncherTarget(target);

		requestAnimationFrame(() => {
			const cursor = stagedShortcut
				? stagedShortcut.selectionStart + stagedShortcut.buffer.length
				: undefined;
			if (cursor !== undefined) textareaElement?.setSelectionRange(cursor, cursor);
		});

		return true;
	}

	function handleStagedShortcutKeydown(event: KeyboardEvent) {
		if (!stagedShortcut) return false;

		const ts = Date.now();

		if (event.key === 'Enter') {
			event.preventDefault();
			return confirmStagedShortcut();
		}

		if (event.key === 'Backspace') {
			event.preventDefault();
			if (downgradeStagedShortcut()) return true;
			return cancelStagedShortcut();
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			return cancelStagedShortcut();
		}

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (moveStagedActionMenuSelection(event.key === 'ArrowDown' ? 1 : -1)) return true;
			return cancelStagedShortcut();
		}

		if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) {
			if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) cancelStagedShortcut();
			return false;
		}

		event.preventDefault();

		if (!event.repeat && upgradeStagedShortcut(event.key)) return true;
		if (executeStagedActionMenuShortcut(event.key)) return true;
		if (fastConfirmStagedShortcut(event.key, ts)) return true;

		return commitStagedShortcutLiteral(event.key);
	}

	function handleStagedShortcutBeforeInput(event: InputEvent) {
		const { data, inputType } = event;
		const ts = Date.now();

		if (stagedShortcut && inputType === 'insertLineBreak') {
			event.preventDefault();
			return confirmStagedShortcut();
		}

		if (stagedShortcut && inputType === 'deleteContentBackward') {
			event.preventDefault();
			if (downgradeStagedShortcut()) return true;
			return cancelStagedShortcut();
		}

		if (inputType !== 'insertText' || !data) return false;

		if (stagedShortcut) {
			event.preventDefault();
			if (upgradeStagedShortcut(data)) return true;
			if (executeStagedActionMenuShortcut(data)) return true;
			if (fastConfirmStagedShortcut(data, ts)) return true;
			return commitStagedShortcutLiteral(data);
		}

		if (!isUppercaseShortcutInitiator(data)) return false;

		event.preventDefault();
		return stageShortcutInitiator(data);
	}

	function handleLauncherBeforeInput(event: InputEvent) {
		const { data, inputType } = event;
		const ts = Date.now();
		const lastInput = inputHistory[0];
		const interval = lastInput ? ts - lastInput.ts : Infinity;

		if (handleStagedShortcutBeforeInput(event)) return;

		doubleKeypress = undefined;
		tripleKeypress = undefined;

		if (inputType === 'insertText' && data && isPendingTripleShortcut(data, ts)) {
			tripleKeypress = data;
			return;
		}

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

		if (handleStagedShortcutKeydown(event)) return;

		if (handleShortcutKeydown(event)) return;

		if (!event.metaKey && !event.ctrlKey && !event.altKey && stageShortcutInitiator(event.key)) {
			event.preventDefault();
			return;
		}

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

		clearBangFanoutMessage();
		if (stagedShortcut) return;

		if (handleShortcutInput()) return;

		updateBangEntry(textarea);
	}

	function handleShortcutInput() {
		const periodShortcutLength = isPeriodShortcut ? 2 : isMobilePeriodShortcut ? 2 : 0;

		if (tripleKeypress && shortcutKeys.has(tripleKeypress)) {
			removeShortcutTextBeforeCursor(1);
			executeShortcut(tripleKeypress, 'triple');
			resetShortcutState();
			return true;
		}

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
			executeShortcut(doubleKeypress, 'double');
			resetShortcutState({ keepPendingTriple: true });
			return true;
		}

		return false;
	}

	function handleShortcutKeydown(event: KeyboardEvent) {
		if (event.key === ' ') return false;
		if (event.repeat) return false;

		const ts = Date.now();

		if (isPendingTripleShortcut(event.key, ts)) {
			event.preventDefault();
			executeShortcut(event.key, 'triple');
			resetShortcutState();

			return true;
		}

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
		executeShortcut(doubleKeypress, 'double');
		resetShortcutState({ keepPendingTriple: true });

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

	function executeShortcut(shortcutKey: string, pressCount: 'double' | 'triple') {
		const key = shortcutKey.toUpperCase();

		if (pressCount === 'triple') {
			executeTripleShortcut(key);
			return;
		}

		const utilityHandled = executeUtilityShortcut(key);
		if (utilityHandled) {
			armTripleShortcut(key, 'utility');
			return;
		}

		if (key === '.' || key === 'V') {
			void getPrimaryAction(pendingShortcutPrimaryTarget ?? primaryLauncherTarget)?.run();
			armTripleShortcut(key, 'primary', pendingShortcutPrimaryTarget ?? primaryLauncherTarget);
			return;
		}

		if (key === parentShortcutLabel) {
			focusInput();
			armTripleShortcut(key, 'parent');
			return;
		}

		const itemFocusIndex = itemShortcutLabels.findIndex((label) => label === key);
		if (itemFocusIndex !== -1) {
			const target = getSnapshotItemTargets()[itemFocusIndex];
			if (target) focusLauncherTarget(target);
			armTripleShortcut(key, 'item-focus', target);
			return;
		}

		const itemMenuIndex = itemMenuShortcutLabels.findIndex((label) => label === key);
		if (itemMenuIndex !== -1) {
			const target = getSnapshotItemTargets()[itemMenuIndex];
			if (target) focusLauncherTarget(target);
			armTripleShortcut(key, 'item-menu', target);
			return;
		}

		const groupFocusIndex = groupShortcutLabels.findIndex((label) => label === key);
		if (groupFocusIndex !== -1) {
			const target = getSnapshotGroupTargets()[groupFocusIndex];
			if (target) focusLauncherTarget(target);
			armTripleShortcut(key, 'group-focus', target);
			return;
		}

		const groupMenuIndex = groupMenuShortcutLabels.findIndex((label) => label === key);
		if (groupMenuIndex !== -1) {
			const target = getSnapshotGroupTargets()[groupMenuIndex];
			if (target) focusLauncherTarget(target);
			armTripleShortcut(key, 'group-menu', target);
		}
	}

	function executeTripleShortcut(shortcutKey: string) {
		if (!pendingTripleShortcut || pendingTripleShortcut.key !== shortcutKey) return;

		const { lane, target } = pendingTripleShortcut;

		if (target && (lane === 'item-focus' || lane === 'group-focus')) {
			focusLauncherTarget(target);
			void getPrimaryAction(target)?.run();
			return;
		}

		if (target && lane === 'item-menu' && target.kind === 'item') {
			focusLauncherTarget(target);
			void getSecondaryAction(target)?.run();
			return;
		}

		if (target && lane === 'group-menu') {
			focusLauncherTarget(target);
		}
	}

	function executeUtilityShortcut(shortcutKey: string) {
		if (shortcutKey === 'Z') {
			fullscreen = !fullscreen;
			return true;
		}

		if (shortcutKey === 'X') {
			wordwrap = !wordwrap;
			return true;
		}

		if (shortcutKey === 'C') {
			if (fullscreen) {
				enterNewlineFullscreen = !enterNewlineFullscreen;
			} else {
				enterNewlineRestored = !enterNewlineRestored;
			}

			return true;
		}

		return false;
	}

	function armTripleShortcut(key: string, lane: ShortcutLane, target?: PrimaryLauncherTarget) {
		pendingTripleShortcut = { key, lane, target, ts: Date.now() };
	}

	function isPendingTripleShortcut(key: string | null | undefined, ts: number) {
		return Boolean(
			key &&
			pendingTripleShortcut &&
			pendingTripleShortcut.key.toLowerCase() === key.toLowerCase() &&
			ts - pendingTripleShortcut.ts < shortcutDelay
		);
	}

	function getSnapshotItemTargets() {
		return pendingShortcutItemTargets.length ? pendingShortcutItemTargets : shortcutItemTargets;
	}

	function getSnapshotGroupTargets() {
		return pendingShortcutGroupTargets.length ? pendingShortcutGroupTargets : shortcutGroupTargets;
	}

	function getPrimaryAction(target: PrimaryLauncherTarget | undefined) {
		return target?.actions[0];
	}

	function getSecondaryAction(target: PrimaryLauncherTarget | undefined) {
		return target?.actions[1];
	}

	function captureFocusSnapshot(): FocusSnapshot {
		return { selectedPrimaryItemId, activeLauncherGroupId };
	}

	function restoreFocusSnapshot(snapshot: FocusSnapshot | undefined) {
		if (!snapshot) return;

		selectedPrimaryItemId = snapshot.selectedPrimaryItemId;
		activeLauncherGroupId = snapshot.activeLauncherGroupId;
	}

	function captureShortcutSnapshot(shortcutKey: string) {
		if (!isShortcutInitiator(shortcutKey)) return;

		pendingShortcutFocusSnapshot = captureFocusSnapshot();
		pendingShortcutItemTargets = shortcutItemTargets;
		pendingShortcutGroupTargets = shortcutGroupTargets;
		pendingShortcutPrimaryTarget = primaryLauncherTarget;
	}

	function isShortcutInitiator(key: string | null | undefined) {
		if (!key) return false;

		const shortcutKey = key === ' ' || key === '.' ? key : key.toLocaleUpperCase();
		if (!validShortcutBindings.has(shortcutKey)) return false;

		// Requiring the first letter to be shifted avoids accidental triggers while typing plain text.
		return key === ' ' || key === '.' || key.toLocaleUpperCase() === key;
	}

	function resetShortcutState({ keepPendingTriple = false } = {}) {
		doubleKeypress = undefined;
		tripleKeypress = undefined;
		inputHistory = [];
		keyHistory = [];
		stagedShortcut = undefined;
		pendingShortcutItemTargets = [];
		pendingShortcutGroupTargets = [];
		pendingShortcutPrimaryTarget = undefined;
		pendingShortcutFocusSnapshot = undefined;
		if (!keepPendingTriple) pendingTripleShortcut = undefined;
		isPeriodShortcut = false;
		isMobilePeriodShortcut = false;
	}

	function getValidShortcutBindings() {
		const bindings = new Map<string, ShortcutBinding>();

		bindings.set(' ', { key: ' ', kind: 'text-transform', lane: 'utility' });
		bindings.set('.', { key: '.', kind: 'text-transform', lane: 'primary' });
		bindings.set(parentShortcutLabel, { key: parentShortcutLabel, kind: 'parent', lane: 'parent' });

		for (const label of utilityShortcutLabels) {
			bindings.set(label, { key: label, kind: 'utility', lane: 'utility' });
		}

		shortcutItemTargets.forEach((target, index) => {
			bindings.set(itemShortcutLabels[index], {
				key: itemShortcutLabels[index],
				kind: 'target',
				lane: 'item-focus',
				target
			});
			bindings.set(itemMenuShortcutLabels[index], {
				key: itemMenuShortcutLabels[index],
				kind: 'target',
				lane: 'item-menu',
				target
			});
		});

		shortcutGroupTargets.forEach((target, index) => {
			if (!target) return;

			bindings.set(groupShortcutLabels[index], {
				key: groupShortcutLabels[index],
				kind: 'target',
				lane: 'group-focus',
				target
			});
			bindings.set(groupMenuShortcutLabels[index], {
				key: groupMenuShortcutLabels[index],
				kind: 'target',
				lane: 'group-menu',
				target
			});
		});

		return bindings;
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
		return shortcutTargetIds.get(targetId);
	}

	function getCompactActionTarget(
		item: LauncherItem,
		focusedTarget: PrimaryLauncherTarget | undefined,
		stagedMenu: StagedActionMenu | undefined
	) {
		return stagedMenu?.target ?? focusedTarget ?? createSelectableItemTarget(item)[0];
	}

	function getGroupNavigationShortcuts(group: LauncherGroup) {
		if (activeLauncherGroup?.id !== group.id || visibleLauncherGroups.length < 2) return [];

		return [
			{ label: groupShortcutLabels[0], text: 'Prev group' },
			{ label: groupShortcutLabels[2], text: 'Next group' }
		];
	}

	function handleLauncherCursorChange(event: Event) {
		if (stagedShortcut) {
			cancelStagedShortcut();
			return;
		}

		updateBangEntry(event.currentTarget as HTMLTextAreaElement);
	}

	function handleLauncherKeyup(event: Event) {
		if (stagedShortcut) return;

		updateBangEntry(event.currentTarget as HTMLTextAreaElement);
	}

	function handleLauncherBlur() {
		cancelStagedShortcut();
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
		focusLauncherTarget(nextTarget);

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

	async function copyShareUrlToClipboard() {
		await navigator.clipboard.writeText(getLauncherShareUrl());
	}

	async function pasteFromClipboard() {
		value = await navigator.clipboard.readText();
		textareaElement?.focus();
	}

	function runPrimaryAction() {
		void getPrimaryAction(primaryLauncherTarget)?.run();
	}

	function runStagedActionMenuAction(action: LauncherAction) {
		if (stagedActionMenu) focusLauncherTarget(stagedActionMenu.target);

		void action.run();
		resetShortcutState();
	}

	function openTargetActionMenuFromAffordance(target: PrimaryLauncherTarget, rootKey: string | undefined) {
		openTargetActionMenu(target, rootKey ?? '');
	}

	function getStagedActionMenuArmedAction(menu: StagedActionMenu) {
		return getArmedTargetAction({
			key: menu.rootKey,
			kind: 'target',
			lane: getTargetMenuLane(menu.target),
			target: menu.target
		});
	}

	function focusLauncherTarget(target: PrimaryLauncherTarget) {
		selectedPrimaryItemId = target.id;

		if (target.kind === 'group') {
			activeLauncherGroupId = target.group.id;
		} else if (target.groupId) {
			activeLauncherGroupId = target.groupId;
		}
	}

	function getActiveLauncherGroup() {
		const selectedTarget = selectedPrimaryItemId
			? selectablePrimaryTargets.find((target) => target.id === selectedPrimaryItemId)
			: undefined;
		const selectedGroupId =
			selectedTarget?.kind === 'group' ? selectedTarget.group.id : selectedTarget?.groupId;
		const defaultActiveGroup = getDefaultActiveLauncherGroup();

		if (defaultActiveGroup) return defaultActiveGroup;

		return (
			visibleLauncherGroups.find((group) => group.id === activeLauncherGroupId) ??
			visibleLauncherGroups.find((group) => group.id === selectedGroupId) ??
			visibleLauncherGroups[0]
		);
	}

	function getDefaultActiveLauncherGroup() {
		if (!bangPickerActive) return undefined;

		const myGroup = visibleLauncherGroups.find((group) => group.id === 'bangs.my');
		const providerGroup = visibleLauncherGroups.find((group) => group.id === 'bangs.provider');

		if (!providerGroup || getVisibleGroupItems(providerGroup).length === 0) return undefined;
		if (myGroup && getVisibleGroupItems(myGroup).length > 0) return undefined;

		return providerGroup;
	}

	function getDefaultBangPickerPrimaryTarget() {
		const group = getDefaultActiveLauncherGroup() ?? activeLauncherGroup;
		const groupTarget = group
			? getVisibleGroupItems(group).flatMap((item) => createSelectableItemTarget(item, group.id))[0]
			: undefined;

		return groupTarget ?? visibleLauncherItems.flatMap((item) => createSelectableItemTarget(item))[0];
	}

	function getShortcutItemTargets() {
		if (!visibleLauncherGroups.length)
			return visibleLauncherItems.flatMap((item) => createSelectableItemTarget(item));

		return activeLauncherGroup
			? getVisibleGroupItems(activeLauncherGroup).flatMap((item) =>
					createSelectableItemTarget(item, activeLauncherGroup.id)
				)
			: [];
	}

	function getShortcutGroupTargets() {
		if (!visibleLauncherGroups.length || !activeLauncherGroup) return [];

		const currentIndex = visibleLauncherGroups.findIndex(
			(group) => group.id === activeLauncherGroup.id
		);
		if (currentIndex === -1) return [];

		const previousIndex =
			(currentIndex - 1 + visibleLauncherGroups.length) % visibleLauncherGroups.length;
		const nextIndex = (currentIndex + 1) % visibleLauncherGroups.length;
		const groups =
			visibleLauncherGroups.length === 1
				? [undefined, visibleLauncherGroups[currentIndex], undefined]
				: [
						visibleLauncherGroups[previousIndex],
						visibleLauncherGroups[currentIndex],
						visibleLauncherGroups[nextIndex]
					];

		return groups.map((group) => (group ? createSelectableGroupTarget(group) : undefined));
	}

	function getSelectablePrimaryTargets(): PrimaryLauncherTarget[] {
		return [
			...visibleLauncherItems.flatMap((item) => createSelectableItemTarget(item)),
			...visibleLauncherGroups.flatMap((group) => [
				createSelectableGroupTarget(group),
				...getVisibleGroupItems(group).flatMap((item) => createSelectableItemTarget(item, group.id))
			])
		];
	}

	function createSelectableGroupTarget(group: LauncherGroup): PrimaryLauncherTarget {
		return {
			id: group.id,
			kind: 'group',
			title: group.title,
			group,
			actions: [
				{
					id: `${group.id}.activate`,
					label: getGroupPrimaryActionLabel(group),
					run: () => activateLauncherGroup(group.id)
				}
			]
		};
	}

	function createSelectableItemTarget(
		item: LauncherItem,
		groupId?: string
	): PrimaryLauncherTarget[] {
		if (item.kind !== 'action' || !item.run) return [];

		return [
			{
				id: item.id,
				kind: 'item',
				title: item.title,
				item,
				groupId,
				actions: getItemActions(item)
			}
		];
	}

	function getItemActions(item: LauncherItem): LauncherAction[] {
		const actions: LauncherAction[] = [];

		if (item.run) {
			actions.push({ id: `${item.id}.primary`, label: item.title, run: item.run });
		}

		if (item.secondaryAction) {
			actions.push({
				id: `${item.id}.secondary`,
				label: item.secondaryAction.label,
				title: item.secondaryAction.title,
				run: item.secondaryAction.run
			});
		}

		return actions;
	}

	function getGroupPrimaryActionLabel(group: LauncherGroup) {
		return isLauncherGroupExpanded(group) ? 'Collapse group' : 'Activate group';
	}

	function getGroupCollapsedLimit(group: LauncherGroup) {
		return group.collapsedItemLimit ?? launcherGroupItemLimits[group.id] ?? 5;
	}

	function shouldRenderGroup(group: LauncherGroup) {
		const isEmptyMyBangsGroup =
			group.id === 'bangs.my' && (mode.id === 'bangs' || bangPickerActive);
		const isBangPickerProviderGroup =
			group.id === 'bangs.provider' && bangPickerActive && myBangResults.items.length > 0;
		const isMatchedSettingsGroup =
			group.pluginId === 'settings' &&
			mode.id === 'settings' &&
			hasValue &&
			group.matchedCount !== undefined;

		return (
			group.items.length > 0 ||
			isEmptyMyBangsGroup ||
			isBangPickerProviderGroup ||
			isMatchedSettingsGroup
		);
	}

	function getBangGroupCollapsedLimit(items: LauncherItem[]) {
		return mode.id === 'bangs' ? launcherGroupItemLimits['bangs.provider'] : items.length;
	}

	function getVisibleGroupItems(group: LauncherGroup) {
		if (group.pluginId === 'bangs') {
			if (hasBangFilter) return group.items;
			if (!isLauncherGroupExpanded(group)) return [];

			return group.items.slice(0, getGroupCollapsedLimit(group));
		}

		if (isLauncherGroupExpanded(group)) return group.allItems ?? group.items;

		return group.items.slice(0, getGroupCollapsedLimit(group));
	}

	function getRenderedGroupItems(group: LauncherGroup) {
		const items = getVisibleGroupItems(group);

		return fullscreen ? items.filter((item) => item.id !== primaryLauncherItem?.id) : items;
	}

	function activateLauncherGroup(groupId: string) {
		const group = visibleLauncherGroups.find(({ id }) => id === groupId);

		if (group) {
			selectedPrimaryItemId = group.id;
			activeLauncherGroupId = group.id;
		}

		if (group?.pluginId === 'bangs') {
			if (mode.id === 'bangs') return;
			if (hasBangFilter) return;

			expandedLauncherGroups = { [groupId]: true };
			return;
		}

		const expanded = group
			? isLauncherGroupExpanded(group)
			: Boolean(expandedLauncherGroups[groupId]);

		expandedLauncherGroups = expanded ? {} : { [groupId]: true };
	}

	function isLauncherGroupExpanded(group: LauncherGroup) {
		if (mode.id === 'bangs' && group.pluginId === 'bangs') return true;
		if (expandedLauncherGroups[group.id] !== undefined) return expandedLauncherGroups[group.id];

		if ((mode.id !== 'bangs' && !bangPickerActive) || hasBangFilter) return false;

		if (group.id === 'bangs.my') return myBangs.length > 0;
		if (group.id === 'bangs.provider') return true;

		return false;
	}

	function getGroupMobileCountLabel(group: LauncherGroup) {
		if (group.matchedCount !== undefined && group.totalCount !== undefined) {
			return `${group.matchedCount}/${group.totalCount}`;
		}

		if (group.matchedCount !== undefined) return `${group.matchedCount} matched`;
		if (group.totalCount !== undefined) return `${group.totalCount} total`;

		return '';
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

					const myItems = hasBangFilter
						? createBangLauncherItems(myBangResults.items, 'my')
						: createBangLauncherItemsFromBangs(myBangs, 'my');
					const providerItems = createBangLauncherItems(providerBangResults.items, 'provider');

					return [
						{
							id: 'bangs.my',
							pluginId: 'bangs',
							title: 'My bangs',
							description: 'Your custom bangs. Used first.',
							items: myItems,
							collapsedItemLimit: getBangGroupCollapsedLimit(myItems),
							matchedCount: myBangResults.total,
							totalCount: myBangs.length
						},
						{
							id: 'bangs.provider',
							pluginId: 'bangs',
							title: `${bangProviderLabels[settings.bangProvider]} bangs`,
							description: 'Built-in bangs. Used as fallback.',
							items: providerItems,
							collapsedItemLimit: getBangGroupCollapsedLimit(providerItems),
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
								run: copyToClipboard,
								secondaryAction: {
									label: 'As URL',
									title: 'Copy share URL',
									run: copyShareUrlToClipboard
								}
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

					return searchProviders.map((provider) => {
						const label = searchProviderLabels[provider];
						const title = `${label} Search`;

						return {
							id: `search.${provider}`,
							pluginId: 'search',
							kind: 'action',
							title,
							titleSegments: provider === 'custom' ? getBangCodeLabelSegments(title) : undefined,
							description: `for "${context.text}".`,
							score: provider === settings.searchProvider ? 100 : 65,
							safeForEnter: provider === settings.searchProvider,
							run: () => search(provider),
							secondaryAction: {
								label: 'Set as default',
								title: `Use ${searchProviderLabels[provider]} for default web searches`,
								run: () => setSearchProvider(provider)
							}
						};
					});
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
		if (mode.id === 'search' || rootSearchFallbackActive) {
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
					options: group.options.map((option) => createVisibleSettingOption(option, 100 - index)),
					allOptions: group.options.map((option) => createVisibleSettingOption(option, 100 - index))
				}));

		return groups
			.sort((a, b) => b.score - a.score)
			.map((group) => {
				const titleValue = group.currentLabel();

				return {
					id: `settings.${group.id}`,
					pluginId: 'settings',
					title: group.title,
					titleValue,
					titleValueSegments: getBangCodeLabelSegments(titleValue),
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
				};
			});
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
		const description = getSettingOptionDescription(option);
		const optionText = getSettingSearchText(option.label, description, option.aliases);
		const titleResult = getSettingFuzzyResult(query, option.label);
		const descriptionResult = getSettingFuzzyResult(query, description);
		const optionResult = getSettingFuzzyResult(query, optionText);

		return {
			...option,
			description,
			score: normalizeFuzzyScore(optionResult),
			titleResult,
			descriptionResult
		};
	}

	function createVisibleSettingOption(option: SettingOption, score: number): ScoredSettingOption {
		return {
			...option,
			description: getSettingOptionDescription(option),
			score,
			titleResult: null,
			descriptionResult: null
		};
	}

	function getSettingOptionDescription(option: SettingOption) {
		return typeof option.description === 'function' ? option.description() : option.description;
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
		const selected = option.selected?.() ?? option.label === group.currentLabel();

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
		if (option.id === 'custom' && !option.descriptionResult) {
			return (
				getBangCodeLabelSegments(option.description) ??
				getFuzzyHighlightSegments(option.description, null)
			);
		}

		return getFuzzyHighlightSegments(option.description, option.descriptionResult);
	}

	function getBangCodeLabelSegments(label: string) {
		const segments: BangHighlightSegment[] = [];
		const codePattern = /![^\s.]+/g;
		let lastIndex = 0;
		let codeMatch: RegExpExecArray | null;

		while ((codeMatch = codePattern.exec(label))) {
			if (codeMatch.index > lastIndex) {
				segments.push({ text: label.slice(lastIndex, codeMatch.index), matched: false });
			}

			segments.push({ text: codeMatch[0], matched: false, kind: 'bang-code' });
			lastIndex = codeMatch.index + codeMatch[0].length;
		}

		if (!segments.length) return undefined;

		if (lastIndex < label.length) segments.push({ text: label.slice(lastIndex), matched: false });

		return segments;
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
			secondaryAction: {
				label: 'Set as default',
				title: `Use ${item.name} for default web searches`,
				run: () => setBangAsDefaultSearch(item)
			},
			run:
				mode.id === 'bangs'
					? () => (source === 'my' ? removeMyBang(item) : addMyBang(item))
					: () => insertBang(item.code[0])
		}));
	}

	function createBangLauncherItemsFromBangs(items: ZbangRecord[], source: 'my' | 'provider') {
		return createBangLauncherItems(
			items.map((item, index) => ({
				item,
				score: 100 - index,
				highlights: {
					name: [{ text: item.name, matched: false }],
					code: item.code.map((code) => ({ segments: [{ text: code, matched: false }] })),
					url: [{ text: item.urls.s, matched: false }]
				}
			})),
			source
		);
	}

	function getBangModeActionLabel(source: 'my' | 'provider') {
		return source === 'my' ? 'Remove from My bangs' : 'Add to My bangs';
	}

	function getBangItemDescription(item: ZbangRecord, source: 'my' | 'provider') {
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
			{#if segment.kind === 'bang-code'}
				<code class:match-highlight={segment.matched} class="bang-code">{segment.text}</code>
			{:else}
				<span class={segment.matched ? 'match-highlight' : undefined}>{segment.text}</span>
			{/if}
		{/each}
	{:else}
		{fallback}
	{/if}
{/snippet}

{#snippet actionItem(item: LauncherItem, shortcutLabel: string | undefined)}
	{@const itemShortcutLabel = item.pluginId === 'bang-data' ? undefined : shortcutLabel}
	{@const isFocused = item.id === primaryLauncherItem?.id}
	{@const focusedTarget = isFocused && primaryLauncherTarget?.kind === 'item' ? primaryLauncherTarget : undefined}
	{@const stagedMenu = stagedActionMenu?.target.id === item.id ? stagedActionMenu : undefined}
	{#if item.pluginId === 'bang-data'}
		{@render notificationItem(item)}
	{:else}
		{@render compactActionItem(item, itemShortcutLabel, focusedTarget, stagedMenu)}
	{/if}
{/snippet}

{#snippet compactActionItem(
	item: LauncherItem,
	itemShortcutLabel: string | undefined,
	focusedTarget: PrimaryLauncherTarget | undefined,
	stagedMenu: StagedActionMenu | undefined
)}
	{@const itemTarget = getCompactActionTarget(item, focusedTarget, stagedMenu)}
	{@const rowActive = Boolean(focusedTarget || stagedMenu)}
	{@const primaryAction = getPrimaryAction(itemTarget)}
	{@const armedAction = stagedMenu ? getStagedActionMenuArmedAction(stagedMenu) : undefined}
	{@const primaryMenuShortcutLabel = stagedMenu ? getActionMenuShortcutLabel(stagedMenu, 0) : undefined}
	{@const primaryActionArmed = rowActive && (!stagedMenu || primaryAction?.id === armedAction?.id)}
	<div
		class:has-staged-menu={Boolean(stagedMenu)}
		class:primary={item.id === primaryLauncherItem?.id}
		class="launcher-item action-item compact-action-item"
	>
		<button
			class:active-action={rowActive}
			class="item-run compact-action-primary"
			disabled={!primaryAction}
			onclick={() => primaryAction?.run()}
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
				<span
					class:compact-action-hidden={!rowActive || !item.description}
					class="compact-action-description"
				>
					{#if item.description}{@render highlightedText(item.descriptionSegments, item.description)}{/if}
				</span>
			</span>
			<span class="compact-action-shortcuts">
				{#if primaryActionArmed}<span class="shortcut-label enter-shortcut-label">↵</span>{/if}
				{#if primaryActionArmed && primaryMenuShortcutLabel}<span class="shortcut-or-label">or</span>{/if}
				{#if primaryMenuShortcutLabel}<span class="shortcut-label">{primaryMenuShortcutLabel}</span>{/if}
			</span>
		</button>

		{@render compactActionMenu(itemTarget, itemShortcutLabel, stagedMenu, rowActive)}
	</div>
{/snippet}

{#snippet compactGroupHeader(
	group: LauncherGroup,
	shortcutLabel: string | undefined,
	focusedTarget: PrimaryLauncherTarget | undefined,
	stagedMenu: StagedActionMenu | undefined,
	navigationShortcuts: { label: string; text: string }[],
	mobileCountLabel: string
)}
	{@const groupTarget = stagedMenu?.target ?? focusedTarget ?? createSelectableGroupTarget(group)}
	{@const rowActive = Boolean(focusedTarget || stagedMenu)}
	{@const primaryAction = getPrimaryAction(groupTarget)}
	{@const armedAction = stagedMenu ? getStagedActionMenuArmedAction(stagedMenu) : undefined}
	{@const primaryMenuShortcutLabel = stagedMenu ? getActionMenuShortcutLabel(stagedMenu, 0) : undefined}
	{@const primaryActionArmed = rowActive && (!stagedMenu || primaryAction?.id === armedAction?.id)}
	<div
		class:has-staged-menu={Boolean(stagedMenu)}
		class:primary={primaryLauncherTarget?.kind === 'group' && primaryLauncherTarget.id === group.id}
		class="launcher-item action-item compact-action-item compact-group-header"
	>
		<button
			class:active-action={rowActive}
			class="item-run compact-action-primary"
			disabled={!primaryAction}
			onclick={() => primaryAction?.run()}
		>
			<span class="item-text">
				<span class="item-heading">
					<span class="group-title-line" id={`${group.id}-heading`}>
						<strong>{@render highlightedText(group.titleSegments, group.title)}</strong
						>{#if group.titleValue}:
							<span class="group-title-value"
								>{@render highlightedText(group.titleValueSegments, group.titleValue)}</span
							>{/if}
					</span>
				</span>
				<span
					class:compact-action-hidden={!group.description}
					class:compact-action-invisible={!rowActive && Boolean(group.description)}
					class="compact-action-description group-description"
				>
					{#if group.description}{@render highlightedText(group.descriptionSegments, group.description)}{/if}
				</span>
				{#if rowActive && mobileCountLabel}
					<span class="group-mobile-count">{mobileCountLabel}</span>
				{/if}
				<span
					class:compact-action-invisible={!navigationShortcuts.length}
					class="group-shortcut-nav"
					aria-hidden={navigationShortcuts.length ? undefined : 'true'}
					aria-label={navigationShortcuts.length ? 'Group navigation shortcuts' : undefined}
				>
					{#each navigationShortcuts as shortcut (shortcut.label)}
						<span class="group-shortcut-nav-item">
							<span class="shortcut-label">{shortcut.label}</span>
							<span>{shortcut.text}</span>
						</span>
					{/each}
				</span>
			</span>
			<span class="compact-action-shortcuts">
				{#if primaryActionArmed}<span class="shortcut-label enter-shortcut-label">↵</span>{/if}
				{#if primaryActionArmed && primaryMenuShortcutLabel}<span class="shortcut-or-label">or</span>{/if}
				{#if primaryMenuShortcutLabel}<span class="shortcut-label">{primaryMenuShortcutLabel}</span>{/if}
			</span>
		</button>

		{@render compactActionMenu(groupTarget, shortcutLabel, stagedMenu, rowActive)}
	</div>
{/snippet}

{#snippet compactActionMenu(
	target: PrimaryLauncherTarget | undefined,
	rootShortcutLabel: string | undefined,
	menu: StagedActionMenu | undefined,
	rowActive = true
)}
	{#if target}
		{@const armedAction = menu ? getStagedActionMenuArmedAction(menu) : undefined}
		{@const showMenuAffordance = Boolean(rootShortcutLabel || (rowActive && target.actions.length > 1))}
		<div
			class="target-action-menu compact-action-menu"
			class:active-action={rowActive}
			class:full={Boolean(menu)}
			role={menu ? 'menu' : undefined}
			aria-label={`Actions for ${target.title}`}
		>
			{#if menu}
				{#each menu.actions.slice(1) as action, offset (action.id)}
					{@const index = offset + 1}
					{@const shortcutLabel = getActionMenuShortcutLabel(menu, index)}
					<button
						class:armed={action.id === armedAction?.id}
						class="target-action-menu-item staged-action-menu-item compact-action-menu-item"
						role="menuitem"
						onpointerdown={(event) => event.preventDefault()}
						onclick={() => runStagedActionMenuAction(action)}
					>
						<span class="staged-action-menu-label">{action.title ?? action.label}</span>
						<span class="compact-action-shortcuts">
							{#if action.id === armedAction?.id}<span class="shortcut-label enter-shortcut-label">↵</span>{/if}
							{#if action.id === armedAction?.id && shortcutLabel}<span class="shortcut-or-label">or</span>{/if}
							{#if shortcutLabel}<span class="shortcut-label">{shortcutLabel}</span>{/if}
						</span>
					</button>
				{/each}
			{:else if showMenuAffordance}
				<button
					class="target-action-menu-item menu-action compact-action-menu-item"
					aria-label={`Open menu for ${target.title}`}
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => openTargetActionMenuFromAffordance(target, rootShortcutLabel)}
				>
					<span
						class:compact-action-invisible={Boolean(rootShortcutLabel && !rowActive)}
						class="compact-menu-label"
						aria-hidden="true"
					>
						...
					</span>
					{#if rootShortcutLabel}
						<span
							class:disabled={!rowActive && isItemShortcutLabelDisabled(rootShortcutLabel)}
							class:inactive-compact-shortcut={!rowActive}
							class="shortcut-label pseudo-menu-shortcut-badge">{rootShortcutLabel}</span
						>
					{:else}
						<span
							class="shortcut-label pseudo-menu-shortcut-badge compact-action-invisible"
							aria-hidden="true">{itemShortcutLabels[0]}</span
						>
					{/if}
				</button>
			{/if}
		</div>
	{/if}
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

{#snippet notificationItem(item: LauncherItem)}
	<article class:primary={item.id === primaryLauncherItem?.id} class="launcher-item notification-item">
		<span class="item-text">
			<span class="item-heading">
				<strong>{@render highlightedText(item.titleSegments, item.title)}</strong>
			</span>
			{#if item.description}<small
					>{@render highlightedText(item.descriptionSegments, item.description)}</small
				>{/if}
		</span>
	</article>
{/snippet}

{#snippet launcherGroup(group: LauncherGroup)}
	{@const renderedItems = getRenderedGroupItems(group)}
	{@const mobileCountLabel = getGroupMobileCountLabel(group)}
	{@const shortcutLabel = getShortcutLabel(group.id)}
	{@const navigationShortcuts = getGroupNavigationShortcuts(group)}
	{@const isFocusedGroup = primaryLauncherTarget?.kind === 'group' && primaryLauncherTarget.id === group.id}
	{@const focusedTarget = isFocusedGroup ? primaryLauncherTarget : undefined}
	{@const stagedMenu = stagedActionMenu?.target.id === group.id ? stagedActionMenu : undefined}
	<section
		class="launcher-group"
		aria-labelledby={`${group.id}-heading`}
	>
		{@render compactGroupHeader(
			group,
			shortcutLabel,
			focusedTarget,
			stagedMenu,
			navigationShortcuts,
			mobileCountLabel
		)}

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
			displayValue={inputDisplayValue}
			previewSegments={inputPreviewSegments}
			statusHint={stagedShortcutStatusHint}
			bind:fullscreen
			bind:wordwrap
			bind:enterNewlineRestored
			bind:enterNewlineFullscreen
			autofocus
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			placeholder={textareaPlaceholder}
			onblur={handleLauncherBlur}
			onbeforeinput={handleLauncherBeforeInput}
			onclick={handleLauncherCursorChange}
			oninput={handleLauncherInput}
			onkeydown={handleLauncherKeydown}
			onkeyup={handleLauncherKeyup}
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

	{#if bangFanoutError}
		<section class="bang-fanout-message" aria-live="polite">
			<div>
				<strong>Popups may be blocked</strong>
				<p>
					{bangFanoutError} Use the popup-blocked icon in the address bar to allow popups, then retry
					the bang search.
				</p>
			</div>
			{#if bangFanoutTargets.length}
				<ol>
					{#each bangFanoutTargets as targetUrl, index (`${index}-${targetUrl}`)}
						<li>
							<a {...getBangFanoutLinkAttributes(targetUrl)} class="bang-fanout-target">
								{bangFanoutActionLabel}
								{getBangFanoutTargetLabel(targetUrl)}
							</a>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	<section class="launcher-list" aria-label="Launcher actions and insights">
		{#if secondaryLauncherItems.length}
			<div class="launcher-group-items launcher-standalone-items">
				{#each secondaryLauncherItems as item (item.id)}
					{#if item.kind === 'action'}
						{@const shortcutLabel = getShortcutLabel(item.id)}
						{@render actionItem(item, shortcutLabel)}
					{:else}
						{@render insightItem(item)}
					{/if}
				{/each}
			</div>
		{/if}
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
		--launcher-group-gap: var(--size-3);
		--launcher-list-bg: color-mix(in srgb, var(--nc-surface-1) 84%, var(--nc-surface-2));
		--launcher-list-border: color-mix(in srgb, var(--nc-border) 72%, transparent);
		--launcher-list-divider: color-mix(in srgb, var(--nc-border) 58%, transparent);
		--launcher-row-hover-bg: color-mix(in srgb, var(--nc-primary) 5%, transparent);
		--launcher-row-active-bg: color-mix(in srgb, var(--nc-primary) 9%, transparent);
		--launcher-row-active-rail: color-mix(in srgb, var(--nc-primary) 70%, transparent);

		display: grid;
		gap: var(--launcher-group-gap);
		margin-block-start: var(--size-3);
	}

	.target-action-menu {
		display: grid;
		gap: 0;
		min-width: 0;
	}

	.target-action-menu-item {
		display: grid;
		grid-template-columns: 1.45rem minmax(0, 1fr);
		align-items: center;
		gap: var(--size-1);
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0.35rem 0.6rem;
		color: var(--nc-tx-1);
		background: transparent;
		border: 0;
		border-radius: 0;
		font-size: var(--font-size-0);
		font-weight: 700;
		line-height: 1.2;
		text-align: left;
		box-shadow: none;
	}

	.target-action-menu-item span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.target-action-menu-item:hover,
	.target-action-menu-item:focus {
		background: var(--launcher-row-hover-bg);
		box-shadow: none;
	}

	.staged-action-menu-item {
		grid-template-columns: 1.45rem minmax(0, 1fr) auto;
		background: transparent;
	}

	.target-action-menu-item .shortcut-label {
		margin-inline: 0;
	}

	.staged-action-menu-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.enter-shortcut-label {
		justify-self: end;
	}

	.staged-action-menu-item.armed {
		color: var(--nc-primary);
		background: var(--launcher-row-active-bg);
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
	}

	.staged-action-menu-item:hover,
	.staged-action-menu-item:focus {
		background: var(--launcher-row-hover-bg);
		box-shadow: none;
	}

	.staged-action-menu-item.armed:hover,
	.staged-action-menu-item.armed:focus {
		background: var(--launcher-row-active-bg);
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
	}

	.launcher-group {
		display: grid;
		gap: var(--size-1);
	}

	.launcher-group-items {
		display: grid;
		gap: 0;
		overflow: clip;
		background: var(--launcher-list-bg);
		border: 1px solid var(--launcher-list-border);
		border-radius: var(--nc-radius);
	}

	.launcher-group-items > .launcher-item {
		border-radius: 0;
	}

	.launcher-group-items > .insight-item {
		background: transparent;
		border: 0;
		box-shadow: none;
	}

	.launcher-group-items > .launcher-item + .launcher-item {
		border-block-start: 1px solid var(--launcher-list-divider);
	}

	.launcher-group-items > .compact-action-item:hover,
	.launcher-group-items > .compact-action-item:focus-within {
		background: var(--launcher-row-hover-bg);
	}

	.launcher-group-items > .compact-action-item.primary,
	.launcher-group-items > .compact-action-item.has-staged-menu {
		background: var(--launcher-row-active-bg);
	}

	.group-title-value {
		font-weight: 400;
	}

	.group-title-line {
		display: block;
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

	.bang-fanout-message {
		display: grid;
		gap: var(--size-2);
		margin-block-start: var(--size-2);
		padding: var(--size-2) var(--size-3);
		color: var(--nc-tx-1);
		background: color-mix(in srgb, var(--yellow-2) 72%, var(--nc-surface-1));
		border: 1px solid var(--yellow-6);
		border-radius: var(--nc-radius);
	}

	.bang-fanout-message strong,
	.bang-fanout-message p,
	.bang-fanout-message ol {
		margin: 0;
	}

	.bang-fanout-message p {
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
	}

	.bang-fanout-message ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		padding: 0;
		list-style: none;
	}

	.bang-fanout-target {
		display: inline-flex;
		align-items: center;
		margin: 0;
		padding: 0.2rem 0.5rem;
		color: var(--nc-tx-1);
		background: var(--nc-surface-1);
		border: 1px solid var(--nc-border);
		border-radius: 999px;
		font-size: var(--font-size-0);
		font-weight: 700;
		line-height: 1.2;
		text-decoration: none;
		box-shadow: none;
	}

	.bang-fanout-target:hover,
	.bang-fanout-target:focus {
		background: color-mix(in srgb, var(--nc-primary) 10%, var(--nc-surface-1));
		text-decoration: underline;
		box-shadow: none;
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

	.compact-action-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(3.75rem, max-content);
		gap: 0;
		padding: 0;
		background: transparent;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}

	.compact-action-item.has-staged-menu {
		grid-template-columns: minmax(0, 1fr);
	}

	.compact-action-item > .compact-action-menu {
		grid-column: auto;
	}

	.compact-action-item.has-staged-menu > .compact-action-menu {
		grid-column: 1 / -1;
	}

	.compact-group-header {
		padding-block: 0.15rem;
		background: transparent;
		border-color: transparent;
		color: var(--nc-tx-2);
		box-shadow: none;
	}

	.compact-group-header .compact-action-primary,
	.compact-group-header .compact-action-menu-item {
		color: var(--nc-tx-2);
	}

	.compact-group-header .item-heading {
		font-size: 0.74rem;
		font-weight: 650;
		letter-spacing: 0.035em;
		text-transform: uppercase;
	}

	.compact-group-header .compact-action-primary .item-text {
		align-items: center;
	}

	.compact-group-header .group-title-value {
		color: color-mix(in srgb, var(--nc-tx-2) 78%, transparent);
		letter-spacing: normal;
		text-transform: none;
	}

	.compact-group-header .group-description {
		font-size: var(--font-size-0);
		line-height: 1;
	}

	.item-run {
		display: grid;
		grid-template-columns: 1.45rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--size-2);
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

	.compact-action-primary,
	.compact-action-menu-item {
		margin: 0;
		min-height: 2rem;
		padding: 0.35rem 0.65rem;
		color: var(--nc-tx-1);
		background: transparent;
		border: 0;
		border-radius: 0;
		line-height: 1.2;
		box-shadow: none;
	}

	.compact-action-primary {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.compact-action-shortcuts {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.shortcut-or-label {
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		font-weight: 600;
		line-height: 1;
	}

	.compact-action-primary.active-action,
	.compact-action-menu.active-action .compact-action-menu-item {
		background: transparent;
		color: var(--nc-tx-1);
	}

	.compact-action-primary.active-action:hover,
	.compact-action-primary.active-action:focus {
		background: transparent;
	}

	.compact-action-menu.full.active-action .compact-action-menu-item:hover,
	.compact-action-menu.full.active-action .compact-action-menu-item:focus {
		background: var(--launcher-row-hover-bg);
	}

	.compact-action-menu.full.active-action .compact-action-menu-item.armed:hover,
	.compact-action-menu.full.active-action .compact-action-menu-item.armed:focus {
		background: var(--launcher-row-active-bg);
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
	}

	.compact-group-header .compact-action-primary.active-action,
	.compact-group-header .compact-action-menu.active-action .compact-action-menu-item {
		background: transparent;
		border-color: transparent;
		color: inherit;
	}

	.compact-group-header
		.compact-action-menu.full.active-action
		.compact-action-menu-item:not(.armed):hover,
	.compact-group-header
		.compact-action-menu.full.active-action
		.compact-action-menu-item:not(.armed):focus {
		background: var(--launcher-row-hover-bg);
	}

	.compact-action-primary .item-text {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
	}

	.compact-action-primary .item-heading {
		flex: 0 0 auto;
	}

	.compact-action-primary .item-heading strong {
		overflow: visible;
		text-overflow: clip;
	}

	.compact-action-description {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.compact-action-hidden {
		display: none;
	}

	.compact-action-invisible {
		visibility: hidden;
	}

	.compact-action-menu {
		justify-self: end;
		width: max-content;
		max-width: 100%;
		color: var(--nc-tx-2);
	}

	.compact-action-menu.full {
		justify-self: stretch;
		width: 100%;
		border-block-start: 1px solid var(--launcher-list-divider);
	}

	.compact-action-menu-item {
		grid-template-columns: minmax(0, 1fr) auto;
		justify-content: stretch;
		gap: 0.4rem;
		width: 100%;
		max-width: 100%;
		white-space: nowrap;
	}

	.compact-action-menu:not(.full) .compact-action-menu-item {
		justify-items: end;
		min-height: 100%;
		padding-inline: 0.4rem 0.65rem;
		color: var(--nc-tx-2);
	}

	.compact-action-menu:not(.full) .compact-action-menu-item:hover,
	.compact-action-menu:not(.full) .compact-action-menu-item:focus {
		background: transparent;
	}

	.compact-menu-label {
		min-width: 1.05rem;
		font-family: var(--font-mono), monospace;
		font-size: 0.9rem;
		font-weight: 700;
		line-height: 1;
		text-align: center;
	}

	.compact-action-menu.full .compact-action-menu-item {
		grid-template-columns: minmax(0, 1fr) auto;
		justify-content: stretch;
		padding-inline: 1.25rem 0.65rem;
		width: 100%;
	}

	.compact-action-menu.full .compact-action-menu-item + .compact-action-menu-item {
		border-block-start: 1px solid var(--launcher-list-divider);
	}

	.action-item.primary {
		--buttonBg: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		--buttonText: var(--nc-tx-1);

		background: color-mix(in srgb, var(--nc-primary) 14%, var(--nc-surface-1));
		border-color: var(--nc-primary);
		box-shadow: 0 0.375rem 1rem color-mix(in srgb, var(--nc-primary) 16%, transparent);
		transform: translateY(-1px);
	}

	.compact-action-item.primary {
		background: var(--launcher-row-active-bg);
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
		transform: none;
	}

	.compact-group-header.primary {
		background: transparent;
		border-color: transparent;
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
	}

	.compact-group-header:hover,
	.compact-group-header:focus-within,
	.compact-group-header.has-staged-menu {
		background: color-mix(in srgb, var(--nc-primary) 3%, transparent);
		border-color: transparent;
		box-shadow: inset 0.18rem 0 0 var(--launcher-row-active-rail);
	}

	.compact-group-header.primary,
	.compact-group-header:hover,
	.compact-group-header:focus-within,
	.compact-group-header.has-staged-menu,
	.compact-group-header.primary .compact-action-primary,
	.compact-group-header:hover .compact-action-primary,
	.compact-group-header:focus-within .compact-action-primary,
	.compact-group-header.has-staged-menu .compact-action-primary {
		color: var(--nc-tx-1);
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

	.group-shortcut-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--size-2);
		min-height: 1.05rem;
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		line-height: 1;
	}

	.group-shortcut-nav-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		line-height: 1;
		white-space: nowrap;
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

	.shortcut-label.disabled {
		color: color-mix(in srgb, var(--nc-tx-2) 58%, transparent);
		background: color-mix(in srgb, var(--nc-surface-2) 48%, transparent);
		border-color: color-mix(in srgb, var(--nc-border) 60%, transparent);
		box-shadow: none;
		opacity: 0.58;
	}

	.action-item.primary .shortcut-label {
		color: var(--nc-primary);
		border-color: color-mix(in srgb, var(--nc-primary) 55%, var(--nc-border));
	}

	.compact-action-menu-item .shortcut-label {
		margin-inline: 0;
	}

	.compact-action-shortcuts .shortcut-label {
		margin-inline: 0;
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

	.bang-code {
		padding: 0.05em 0.3em;
		border-radius: 0.3em;
		background: color-mix(in srgb, var(--nc-primary) 10%, var(--nc-surface-2));
		color: var(--nc-tx-1);
		font-family: var(--font-mono), monospace;
		font-size: 0.9em;
	}

	.meta {
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.launcher-list {
			--launcher-group-gap: var(--size-2);

			margin-block-start: var(--size-2);
		}

		.launcher-item {
			gap: var(--size-2);
			padding: var(--size-1) var(--size-2);
			min-height: 0;
		}

		.compact-action-item {
			gap: 0;
			padding: 0;
		}

		.item-heading {
			gap: var(--size-1);
		}

		.item-run {
			grid-template-columns: 1.45rem minmax(0, 1fr) auto;
			align-items: start;
			gap: 0.125rem var(--size-2);
		}

		.compact-action-item.has-staged-menu {
			grid-template-columns: minmax(0, 1fr);
		}

		.compact-action-primary {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.compact-action-primary .item-text {
			display: grid;
			gap: 0.125rem;
		}

		.compact-action-menu.full,
		.compact-action-menu.full .compact-action-menu-item {
			width: 100%;
		}

		.group-description {
			display: none;
		}

		.group-mobile-count {
			display: block;
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
