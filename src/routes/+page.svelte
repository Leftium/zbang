<script lang="ts">
	import ExpandingTextarea from '$lib/components/ExpandingTextarea.svelte';
	import Header from '$lib/components/Header.svelte';
	import { settings, type SearchProvider } from '$lib/settings.svelte';

	let value = $state('');

	const searchProviderLabels: Record<SearchProvider, string> = {
		kagi: 'Kagi',
		duckduckgo: 'DuckDuckGo',
		google: 'Google'
	};
	const searchProviders = Object.keys(searchProviderLabels) as SearchProvider[];
	const otherSearchProviders = $derived(
		searchProviders.filter((provider) => provider !== settings.searchProvider)
	);

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
</script>

<main>
	<Header />

	<ExpandingTextarea
		bind:value
		autofocus
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		placeholder="Type a query..."
		onprimaryaction={search}
	>
		{#snippet primaryAction()}
			<button class="search-action" onclick={() => search()}>
				{searchProviderLabels[settings.searchProvider]} Search
			</button>
		{/snippet}

		{#snippet secondaryActions()}
			{#each otherSearchProviders as provider (provider)}
				<button class="search-action secondary outline" onclick={() => search(provider)}>
					{searchProviderLabels[provider]} Search
				</button>
			{/each}
		{/snippet}
	</ExpandingTextarea>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	.search-action {
		width: 100%;
		margin: 0;
	}
</style>
