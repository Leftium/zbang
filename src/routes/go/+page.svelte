<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { readExecutionSettings, readMyBangs } from '$lib/bang-data';
	import DefaultSearchSetup from '$lib/components/DefaultSearchSetup.svelte';
	import {
		getBangExecutionItems,
		getSearchUrl,
		hasBangToken,
		resolveBangExecution
	} from '$lib/launcher/bang-resolver';
	import { readStoredExecutionSettings } from '$lib/settings.svelte';
	import { loadShippedBangCatalog } from '$lib/shipped-bang-catalog';

	const query = page.url.searchParams.get('q')?.trim() ?? '';
	let errorMessage = $state('');

	onMount(() => {
		if (!query) return;

		document.body.classList.add('go-executing');
		void executeQuery();

		return () => {
			document.body.classList.remove('go-executing');
		};
	});

	async function executeQuery() {
		try {
			const executionSettings =
				(await readExecutionSettings().catch(() => undefined)) ?? readStoredExecutionSettings();

			if (!hasBangToken(query)) {
				window.location.replace(
					getSearchUrl(
						executionSettings.searchProvider,
						query,
						executionSettings.customSearchTemplate
					)
				);
				return;
			}

			const [myBangs, catalogResult] = await Promise.all([
				readMyBangs().catch(() => []),
				loadShippedBangCatalog(executionSettings.bangProvider)
			]);
			const providerBangs = catalogResult.error ? [] : catalogResult.data.items;
			const items = getBangExecutionItems(myBangs, providerBangs);
			const result = resolveBangExecution(query, items, executionSettings);

			window.location.replace(result.targetUrl);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}
	}
</script>

<svelte:head>
	<title>{query ? 'Executing search' : 'Default search setup'} | Whiz</title>
</svelte:head>

{#if query}
	<main class="go-status" aria-live="polite">
		<p>Executing search...</p>
		<p class="query">{query}</p>
		{#if errorMessage}
			<p class="error">Could not execute this search: {errorMessage}</p>
		{/if}
	</main>
{:else}
	<main>
		<DefaultSearchSetup />
	</main>
{/if}

<style>
	:global(body.go-executing) {
		--nc-content-shadow: none;

		padding-block: 0;
	}

	:global(body:has(.go-status)) {
		--nc-content-shadow: none;

		padding-block: 0;
	}

	:global(body:has(.go-status)::before),
	:global(body.go-executing::before) {
		box-shadow: none !important;
	}

	.go-status {
		display: grid;
		gap: 0.25rem;
		justify-items: center;
		width: min(32rem, 100%);
		margin-inline: auto;
		padding: 0.35rem 0.5rem;
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		line-height: 1.2;
		opacity: 0.72;
		text-align: center;
	}

	.go-status p {
		max-width: 100%;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.query {
		font-family: var(--font-mono), monospace;
		font-size: 0.82em;
		opacity: 0.72;
	}

	.error {
		color: var(--red-7);
		opacity: 1;
	}
</style>
