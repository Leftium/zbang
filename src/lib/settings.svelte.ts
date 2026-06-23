import type { BangProviderId } from '$lib/bang-data';
export type ColorScheme = '' | 'dark' | 'light';
export type SearchProvider = 'kagi' | 'duckduckgo' | 'google' | 'custom';

export type ExecutionSettings = {
	bangProvider: BangProviderId;
	searchProvider: SearchProvider;
	customSearchLabel: string;
	customSearchTemplate: string;
};

export const defaultCustomSearchLabel = 'Brave';
export const defaultCustomSearchTemplate = 'https://search.brave.com/search?q=%s';

export const settings = $state({
	colorScheme: '' as ColorScheme,
	bangProvider: 'kagi' as BangProviderId,
	searchProvider: 'kagi' as SearchProvider,
	customSearchLabel: defaultCustomSearchLabel,
	customSearchTemplate: defaultCustomSearchTemplate
});

function applyColorScheme(colorScheme: ColorScheme) {
	settings.colorScheme = colorScheme;

	if (!colorScheme) {
		document.documentElement.removeAttribute('data-theme');
		document.documentElement.style.removeProperty('color-scheme');
		localStorage.removeItem('theme');
		return;
	}

	document.documentElement.dataset.theme = colorScheme;
	document.documentElement.style.colorScheme = colorScheme;
	localStorage.setItem('theme', colorScheme);
}

export function setColorScheme(colorScheme: ColorScheme) {
	applyColorScheme(colorScheme);
}

export function setSearchProvider(searchProvider: SearchProvider) {
	settings.searchProvider = searchProvider;
	localStorage.setItem('searchProvider', searchProvider);
}

export function setCustomSearchTarget(label: string, template: string) {
	settings.customSearchLabel = label;
	settings.customSearchTemplate = template;
	settings.searchProvider = 'custom';
	localStorage.setItem('customSearchLabel', label);
	localStorage.setItem('customSearchTemplate', template);
	localStorage.setItem('searchProvider', 'custom');
}

export function setBangProvider(bangProvider: BangProviderId) {
	settings.bangProvider = bangProvider;
	localStorage.setItem('bangProvider', bangProvider);
}

export function initSettings() {
	const storedColorScheme = localStorage.getItem('theme');
	const storedBangProvider = localStorage.getItem('bangProvider');
	const storedSearchProvider = localStorage.getItem('searchProvider');
	const storedCustomSearchLabel = localStorage.getItem('customSearchLabel');
	const storedCustomSearchTemplate = localStorage.getItem('customSearchTemplate');

	if (storedColorScheme === 'dark' || storedColorScheme === 'light') {
		applyColorScheme(storedColorScheme);
	}

	if (isSearchProvider(storedSearchProvider)) {
		settings.searchProvider = storedSearchProvider;
	}

	if (storedCustomSearchLabel) settings.customSearchLabel = storedCustomSearchLabel;
	if (storedCustomSearchTemplate?.includes('%s')) {
		settings.customSearchTemplate = storedCustomSearchTemplate;
	}

	if (isBangProvider(storedBangProvider)) {
		settings.bangProvider = storedBangProvider;
	}
}

export function readStoredExecutionSettings(): ExecutionSettings {
	const fallback = {
		bangProvider: settings.bangProvider,
		searchProvider: settings.searchProvider,
		customSearchLabel: settings.customSearchLabel,
		customSearchTemplate: settings.customSearchTemplate
	};

	if (typeof localStorage === 'undefined') {
		return fallback;
	}

	try {
		const storedBangProvider = localStorage.getItem('bangProvider');
		const storedSearchProvider = localStorage.getItem('searchProvider');
		const storedCustomSearchLabel = localStorage.getItem('customSearchLabel');
		const storedCustomSearchTemplate = localStorage.getItem('customSearchTemplate');

		return {
			bangProvider: isBangProvider(storedBangProvider) ? storedBangProvider : fallback.bangProvider,
			searchProvider: isSearchProvider(storedSearchProvider)
				? storedSearchProvider
				: fallback.searchProvider,
			customSearchLabel: storedCustomSearchLabel || fallback.customSearchLabel,
			customSearchTemplate: storedCustomSearchTemplate?.includes('%s')
				? storedCustomSearchTemplate
				: fallback.customSearchTemplate
		};
	} catch {
		return fallback;
	}
}

function isBangProvider(value: string | null): value is BangProviderId {
	return value === 'kagi' || value === 'duckduckgo';
}

function isSearchProvider(value: string | null): value is SearchProvider {
	return value === 'kagi' || value === 'duckduckgo' || value === 'google' || value === 'custom';
}
