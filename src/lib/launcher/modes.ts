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
		description: 'Mobile-friendly web search with bang shortcuts.',
		path: '/search',
		pluginIds: ['bang-data', 'bang-compose', 'bangs', 'clipboard', 'search'],
		keywords: ['web', 'query', 'provider']
	},
	{
		id: 'bangs',
		label: 'Bang Management',
		description: 'Add and edit your custom bangs.',
		path: '/bang',
		pluginIds: ['bang-data', 'bangs'],
		keywords: ['bang', 'filter', 'explore', 'shortcut']
	},
	{
		id: 'compromise',
		label: 'NLP',
		description: 'See how the launcher understands your text.',
		path: '/nlp',
		pluginIds: ['compromise', 'clipboard'],
		keywords: ['nlp', 'language', 'tokens', 'inspect']
	},
	{
		id: 'settings',
		label: 'Settings',
		description: 'Configure launcher preferences.',
		path: '/settings',
		pluginIds: ['settings'],
		keywords: ['preferences', 'configuration', 'options']
	}
] as const satisfies readonly LauncherMode[];

export const modeById = new Map<LauncherModeId, LauncherMode>(
	launcherModes.map((mode) => [mode.id, mode])
);

export function getLauncherMode(id: LauncherModeId): LauncherMode {
	return modeById.get(id) ?? launcherModes[0];
}
