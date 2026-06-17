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
	const hasValue = $derived(Boolean(value.trim()));

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

	async function pasteFromClipboard() {
		value = await navigator.clipboard.readText();
	}

	async function copyToClipboard() {
		await navigator.clipboard.writeText(value);
	}

	function runPrimaryAction() {
		if (hasValue) {
			search();
		} else {
			void pasteFromClipboard();
		}
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
		onprimaryaction={runPrimaryAction}
	>
		{#snippet primaryAction()}
			<button class="action-button" onclick={runPrimaryAction}>
				{#if hasValue}
					{searchProviderLabels[settings.searchProvider]} Search
				{:else}
					Paste from clipboard
				{/if}
			</button>
		{/snippet}

		{#snippet secondaryActions()}
			{#if hasValue}
				<button class="action-button secondary outline" onclick={copyToClipboard}>Copy to clipboard</button>

				{#each otherSearchProviders as provider (provider)}
					<button class="action-button secondary outline" onclick={() => search(provider)}>
						{searchProviderLabels[provider]} Search
					</button>
				{/each}
			{/if}
		{/snippet}
	</ExpandingTextarea>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	.action-button {
		width: 100%;
		margin: 0;
	}
</style>
