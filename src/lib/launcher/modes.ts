import type { LauncherMode, LauncherModeId } from './types';

export const launcherModes = [
	{
		id: 'everything',
		label: 'Everything',
		description: 'Start from the textarea and let launcher actions compete.',
		path: '/',
		pluginIds: ['mode-list'],
		keywords: ['home', 'root', 'all', 'everything']
	},
	{
		id: 'search',
		label: 'Search',
		description: 'Search the web with the configured provider or an alternate provider.',
		path: '/search',
		pluginIds: ['bang-data', 'bang-compose', 'bangs', 'clipboard', 'search'],
		keywords: ['web', 'query', 'provider']
	},
	{
		id: 'bangs',
		label: 'Bangs',
		description: 'Manage bang data, sources, and installed bang shortcuts.',
		path: '/bangs',
		pluginIds: ['bang-data', 'clipboard'],
		keywords: ['bang', 'manage', 'source', 'install', 'shortcut']
	},
	{
		id: 'compromise',
		label: 'Compromise',
		description: 'Inspect NLP signals that can guide launcher ranking.',
		path: '/compromise',
		pluginIds: ['compromise', 'clipboard'],
		keywords: ['nlp', 'language', 'tokens', 'inspect']
	}
] as const satisfies readonly LauncherMode[];

export const modeById = new Map<LauncherModeId, LauncherMode>(
	launcherModes.map((mode) => [mode.id, mode])
);

export function getLauncherMode(id: LauncherModeId) {
	return modeById.get(id) ?? launcherModes[0];
}
