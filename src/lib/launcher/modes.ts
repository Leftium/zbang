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
		label: 'Bang',
		description: 'Filter and explore available bang shortcuts.',
		path: '/bangs',
		pluginIds: ['bang-data', 'bangs'],
		keywords: ['bang', 'filter', 'explore', 'shortcut']
	},
	{
		id: 'compromise',
		label: 'NLP',
		description: 'Inspect NLP signals that can guide launcher ranking.',
		path: '/nlp',
		pluginIds: ['compromise', 'clipboard'],
		keywords: ['nlp', 'language', 'tokens', 'inspect']
	}
] as const satisfies readonly LauncherMode[];

export const modeById = new Map<LauncherModeId, LauncherMode>(
	launcherModes.map((mode) => [mode.id, mode])
);

export function getLauncherMode(id: LauncherModeId): LauncherMode {
	return modeById.get(id) ?? launcherModes[0];
}
