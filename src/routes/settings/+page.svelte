<script lang="ts">
	import Header from '$lib/components/Header.svelte';
	import {
		resetColorScheme,
		setColorScheme,
		setSearchProvider,
		settings,
		toggleColorScheme,
		type SearchProvider
	} from '$lib/settings.svelte';

	const searchProviders: { value: SearchProvider; label: string }[] = [
		{ value: 'kagi', label: 'Kagi' },
		{ value: 'duckduckgo', label: 'DuckDuckGo' },
		{ value: 'google', label: 'Google' }
	];
</script>

<main>
	<Header />

	<section aria-labelledby="settings-heading">
		<h1 id="settings-heading">Settings</h1>

		<div class="setting">
			<div>
				<h2>Color scheme</h2>
				<p>Click to toggle dark/light. Double-click to reset to auto.</p>
			</div>

			<button class="secondary outline" onclick={toggleColorScheme} ondblclick={resetColorScheme}>
				colors: {settings.colorScheme || 'auto'}
			</button>
		</div>

		<fieldset class="setting provider-setting">
			<legend>Default search provider</legend>

			<div class="providers">
				{#each searchProviders as provider (provider.value)}
					<label>
						<input
							type="radio"
							name="search-provider"
							value={provider.value}
							checked={settings.searchProvider === provider.value}
							onchange={() => setSearchProvider(provider.value)}
						/>
						<span>{provider.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	</section>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	section {
		display: grid;
		gap: var(--size-5);
		margin-block-start: var(--size-6);
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: var(--font-size-5);
	}

	h2,
	legend {
		font-size: var(--font-size-2);
		font-weight: var(--font-weight-7);
	}

	p {
		color: var(--gray-6);
	}

	.setting {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-4);
		padding: var(--size-4);
		border: var(--border-size-1) solid var(--gray-7);
		border-radius: var(--radius-2);
	}

	.provider-setting {
		align-items: flex-start;
		flex-direction: column;
		margin: 0;
	}

	.providers {
		display: grid;
		gap: var(--size-2);
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--size-2);
	}

	button {
		white-space: nowrap;
	}

	@media (max-width: 40rem) {
		.setting {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
