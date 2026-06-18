import type { Zbang } from '$lib/bang-data';
import type { BangHighlightSegment } from '$lib/bang-filter';

export type LauncherItem = {
	id: string;
	pluginId: string;
	kind: 'action' | 'insight';
	title: string;
	description?: string;
	titleSegments?: BangHighlightSegment[];
	descriptionSegments?: BangHighlightSegment[];
	rank?: number;
	score: number;
	sortOrder?: number;
	safeForEnter?: boolean;
	run?: () => void | Promise<void>;
	secondaryAction?: {
		label: string;
		title?: string;
		run: () => void | Promise<void>;
	};
};

export type LauncherGroup = {
	id: string;
	pluginId: string;
	title: string;
	description?: string;
	items: LauncherItem[];
	collapsedItemLimit?: number;
	matchedCount?: number;
	totalCount?: number;
};

export type LauncherContext = {
	text: string;
	hasValue: boolean;
	bangComposition: BangComposition;
	nlp: CompromiseSignals;
};

export type LauncherPlugin = {
	id: string;
	getItems?: (context: LauncherContext) => LauncherItem[];
	getGroups?: (context: LauncherContext) => LauncherGroup[];
};

export type LauncherModeId = 'everything' | 'bangs' | 'compromise' | 'search';

export type LauncherMode = {
	id: LauncherModeId;
	label: string;
	description: string;
	path: '/' | '/search' | '/bang' | '/nlp';
	pluginIds: readonly string[];
	keywords: readonly string[];
};

export type BangEntry = { triggerIndex: number; fragment: string };

export type BangCompositionTarget = { token: string; item: Zbang };

export type BangComposition = {
	localTargets: BangCompositionTarget[];
	forwardedTokens: string[];
	payloadText: string;
	hasTargets: boolean;
};

export type KeywordSignal = { word: string; score: number };

export type CompromiseSignals = {
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
