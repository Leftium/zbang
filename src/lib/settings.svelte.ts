import type { BangProviderId } from '$lib/bang-data';
export type ColorScheme = '' | 'dark' | 'light';
export type SearchProvider = 'kagi' | 'duckduckgo' | 'google';

export const settings = $state({
	colorScheme: '' as ColorScheme,
	bangProvider: 'kagi' as BangProviderId,
	searchProvider: 'kagi' as SearchProvider
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

export function setBangProvider(bangProvider: BangProviderId) {
	settings.bangProvider = bangProvider;
	localStorage.setItem('bangProvider', bangProvider);
}

export function initSettings() {
	const storedColorScheme = localStorage.getItem('theme');
	const storedBangProvider = localStorage.getItem('bangProvider');
	const storedSearchProvider = localStorage.getItem('searchProvider');

	if (storedColorScheme === 'dark' || storedColorScheme === 'light') {
		applyColorScheme(storedColorScheme);
	}

	if (
		storedSearchProvider === 'kagi' ||
		storedSearchProvider === 'duckduckgo' ||
		storedSearchProvider === 'google'
	) {
		settings.searchProvider = storedSearchProvider;
	}

	if (storedBangProvider === 'kagi' || storedBangProvider === 'duckduckgo') {
		settings.bangProvider = storedBangProvider;
	}

}
