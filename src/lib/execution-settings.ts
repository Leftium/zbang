import type { BangProviderId } from './bang-catalog';

export type SearchProvider = 'kagi' | 'duckduckgo' | 'google' | 'custom';

export type ExecutionSettings = {
	bangProvider: BangProviderId;
	searchProvider: SearchProvider;
	customSearchLabel: string;
	customSearchTemplate: string;
};

export const defaultCustomSearchLabel = 'Brave';
export const defaultCustomSearchTemplate = 'https://search.brave.com/search?q=%s';

export const defaultExecutionSettings: ExecutionSettings = {
	bangProvider: 'kagi',
	searchProvider: 'google',
	customSearchLabel: defaultCustomSearchLabel,
	customSearchTemplate: defaultCustomSearchTemplate
};

export function isBangProvider(value: string | null): value is BangProviderId {
	return value === 'kagi' || value === 'duckduckgo';
}

export function isSearchProvider(value: string | null): value is SearchProvider {
	return value === 'kagi' || value === 'duckduckgo' || value === 'google' || value === 'custom';
}
