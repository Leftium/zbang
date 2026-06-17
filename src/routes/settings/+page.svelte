<script lang="ts">
	import { dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	import {
		BANG_SOURCES,
		readBangCatalogStatuses,
		readBangSourceStatuses,
		refreshBangData,
		type BangCatalogGenerationResult,
		type BangCatalogStatus,
		type BangProviderId,
		type BangSourceDownloadResult,
		type BangSourceId,
		type BangSourceStatus
	} from '$lib/bang-data';
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

	let bangSourceStatuses = $state<BangSourceStatus[]>([]);
	let bangSourceErrors = $state<Partial<Record<BangSourceId, string>>>({});
	let bangCatalogStatuses = $state<BangCatalogStatus[]>([]);
	let bangCatalogErrors = $state<Partial<Record<BangProviderId, string>>>({});
	let bangSourceCountChanges = $state<Partial<Record<BangSourceId, number>>>({});
	let bangCatalogCountChanges = $state<Partial<Record<BangProviderId, number>>>({});
	let bangSourceMessage = $state('');
	let isRefreshingBangData = $state(false);

	onMount(() => {
		void loadBangDataStatuses();
	});

	async function loadBangDataStatuses() {
		bangSourceStatuses = await readBangSourceStatuses();
		bangCatalogStatuses = await readBangCatalogStatuses();
	}

	async function refreshLocalBangData() {
		isRefreshingBangData = true;
		bangSourceErrors = {};
		bangCatalogErrors = {};
		const previousSourceStatuses = bangSourceStatuses;
		const previousCatalogStatuses = bangCatalogStatuses;
		bangSourceMessage = 'Refreshing bang data...';

		try {
			const { sources, catalogs } = await refreshBangData();
			const failedSources = sources.filter(
				(result): result is Extract<BangSourceDownloadResult, { ok: false }> => !result.ok
			);
			const failedCatalogs = catalogs.filter(
				(result): result is Extract<BangCatalogGenerationResult, { ok: false }> => !result.ok
			);
			const savedSources = sources.length - failedSources.length;
			const savedCatalogs = catalogs.length - failedCatalogs.length;

			bangSourceStatuses = getSuccessfulSourceStatuses(sources, bangSourceStatuses);
			bangCatalogStatuses = getSuccessfulCatalogStatuses(catalogs, bangCatalogStatuses);
			bangSourceCountChanges = getBangSourceCountChanges(
				previousSourceStatuses,
				bangSourceStatuses
			);
			bangCatalogCountChanges = getBangCatalogCountChanges(
				previousCatalogStatuses,
				bangCatalogStatuses
			);
			bangSourceErrors = getBangSourceErrors(failedSources);
			bangCatalogErrors = getBangCatalogErrors(failedCatalogs);
			bangSourceMessage =
				failedSources.length || failedCatalogs.length
					? `Saved ${savedSources} of ${sources.length} sources and generated ${savedCatalogs} of ${catalogs.length} catalogs.`
					: `Saved ${savedSources} sources and generated ${savedCatalogs} catalogs.`;
		} catch (error) {
			bangSourceMessage = error instanceof Error ? error.message : 'Failed to refresh bang data.';
		} finally {
			isRefreshingBangData = false;
		}
	}

	function getSuccessfulSourceStatuses(
		results: BangSourceDownloadResult[],
		currentStatuses: BangSourceStatus[]
	) {
		const statuses = [...currentStatuses];

		for (const result of results) {
			if (result.ok) {
				const index = statuses.findIndex((status) => status.id === result.source.id);

				if (index === -1) {
					statuses.push(result.source);
				} else {
					statuses[index] = result.source;
				}
			}
		}

		return BANG_SOURCES.flatMap((source) => {
			const status = statuses.find((status) => status.id === source.id);
			return status ? [status] : [];
		});
	}

	function getSuccessfulCatalogStatuses(
		results: BangCatalogGenerationResult[],
		currentStatuses: BangCatalogStatus[]
	) {
		const statuses = [...currentStatuses];

		for (const result of results) {
			if (result.ok) {
				const index = statuses.findIndex((status) => status.provider === result.catalog.provider);

				if (index === -1) {
					statuses.push(result.catalog);
				} else {
					statuses[index] = result.catalog;
				}
			}
		}

		return BANG_CATALOGS.flatMap((provider) => {
			const status = statuses.find((status) => status.provider === provider.value);
			return status ? [status] : [];
		});
	}

	function getBangSourceErrors(
		results: Extract<BangSourceDownloadResult, { ok: false }>[]
	): Partial<Record<BangSourceId, string>> {
		return Object.fromEntries(results.map((result) => [result.id, result.error]));
	}

	function getBangCatalogErrors(
		results: Extract<BangCatalogGenerationResult, { ok: false }>[]
	): Partial<Record<BangProviderId, string>> {
		return Object.fromEntries(results.map((result) => [result.provider, result.error]));
	}

	function getBangSourceCountChanges(
		previousStatuses: BangSourceStatus[],
		currentStatuses: BangSourceStatus[]
	): Partial<Record<BangSourceId, number>> {
		return Object.fromEntries(
			currentStatuses.flatMap((status) => {
				const previous = previousStatuses.find((item) => item.id === status.id)?.bangCount;
				return previous === undefined || status.bangCount === undefined
					? []
					: [[status.id, status.bangCount - previous]];
			})
		);
	}

	function getBangCatalogCountChanges(
		previousStatuses: BangCatalogStatus[],
		currentStatuses: BangCatalogStatus[]
	): Partial<Record<BangProviderId, number>> {
		return Object.fromEntries(
			currentStatuses.map((status) => {
				const previous = previousStatuses.find(
					(item) => item.provider === status.provider
				)?.recordCount;
				return [status.provider, previous === undefined ? 0 : status.recordCount - previous];
			})
		);
	}

	function getBangSourceStatus(id: BangSourceId) {
		return bangSourceStatuses.find((status) => status.id === id);
	}

	function getBangCatalogStatus(provider: BangProviderId) {
		return bangCatalogStatuses.find((status) => status.provider === provider);
	}

	function formatByteLength(byteLength: number) {
		return new Intl.NumberFormat(undefined, {
			maximumFractionDigits: 1,
			style: 'unit',
			unit: byteLength >= 1_000_000 ? 'megabyte' : 'kilobyte',
			unitDisplay: 'short'
		}).format(byteLength / (byteLength >= 1_000_000 ? 1_000_000 : 1_000));
	}

	function formatBangCount(bangCount: number | undefined) {
		return bangCount === undefined ? 'Unknown' : new Intl.NumberFormat().format(bangCount);
	}

	function formatRecordCount(recordCount: number) {
		return new Intl.NumberFormat().format(recordCount);
	}

	function formatCountChange(change: number | undefined) {
		if (change === undefined) {
			return '';
		}

		return new Intl.NumberFormat(undefined, {
			signDisplay: 'always'
		}).format(change);
	}

	function formatFetchedAt(fetchedAt: string) {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(fetchedAt));
	}

	const BANG_CATALOGS: { value: BangProviderId; label: string }[] = [
		{ value: 'kagi', label: 'Kagi' },
		{ value: 'duckduckgo', label: 'DuckDuckGo' }
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

		<section class="bang-sources" aria-labelledby="bang-sources-heading">
			<div class="setting bang-source-actions">
				<div>
					<h2 id="bang-sources-heading">Bang data</h2>
					<p>Download source files and generate local Kagi and DuckDuckGo catalogs.</p>
				</div>

				<button
					class="secondary outline"
					disabled={isRefreshingBangData}
					onclick={refreshLocalBangData}
				>
					{isRefreshingBangData ? 'Refreshing...' : 'Refresh bang data'}
				</button>
			</div>

			{#if bangSourceMessage}
				<p class="refresh-message" aria-live="polite">{bangSourceMessage}</p>
			{/if}

			{#if dev}
				<p class="dev-link">
					Dev tool: <a href={resolve('/dev/bootstrap-bangs')}>generate bootstrap bang files</a>
				</p>
			{/if}

			<div class="source-list">
				{#each BANG_CATALOGS as catalog (catalog.value)}
					{@const status = getBangCatalogStatus(catalog.value)}
					<article class="source-card">
						<div>
							<h3>{catalog.label} catalog</h3>
							<p>Generated provider-native bang data.</p>
						</div>

						{#if status}
							<dl>
								<div>
									<dt>Generated</dt>
									<dd>{formatFetchedAt(status.generatedAt)}</dd>
								</div>
								<div>
									<dt>Records</dt>
									<dd>
										{formatRecordCount(status.recordCount)}
										{#if bangCatalogCountChanges[status.provider] !== undefined}
											<span class="count-change">
												{formatCountChange(bangCatalogCountChanges[status.provider])}
											</span>
										{/if}
									</dd>
								</div>
								<div>
									<dt>Generator</dt>
									<dd>v{status.generatorVersion}</dd>
								</div>
								<div>
									<dt>Sources</dt>
									<dd>{status.sources.length}</dd>
								</div>
							</dl>
						{:else}
							<p class="muted">Not generated yet.</p>
						{/if}

						{#if bangCatalogErrors[catalog.value]}
							<p class="source-error">{bangCatalogErrors[catalog.value]}</p>
						{/if}
					</article>
				{/each}

				{#each BANG_SOURCES as source (source.id)}
					{@const status = getBangSourceStatus(source.id)}
					<article class="source-card">
						<div>
							<h3>{source.label}</h3>
							<p class="source-url">{source.url}</p>
						</div>

						{#if status}
							<dl>
								<div>
									<dt>Fetched</dt>
									<dd>{formatFetchedAt(status.fetchedAt)}</dd>
								</div>
								<div>
									<dt>Size</dt>
									<dd>{formatByteLength(status.byteLength)}</dd>
								</div>
								<div>
									<dt>Bangs</dt>
									<dd>
										{formatBangCount(status.bangCount)}
										{#if bangSourceCountChanges[status.id] !== undefined}
											<span class="count-change">
												{formatCountChange(bangSourceCountChanges[status.id])}
											</span>
										{/if}
									</dd>
								</div>
								<div>
									<dt>SHA-256</dt>
									<dd><code>{status.hash.slice(0, 16)}</code></dd>
								</div>
							</dl>
						{:else}
							<p class="muted">Not downloaded yet.</p>
						{/if}

						{#if bangSourceErrors[source.id]}
							<p class="source-error">{bangSourceErrors[source.id]}</p>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	</section>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	main > section,
	.bang-sources {
		display: grid;
		gap: var(--size-5);
		margin-block-start: var(--size-6);
	}

	h1,
	h2,
	h3,
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

	.bang-source-actions {
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

	.source-list {
		display: grid;
		gap: var(--size-3);
	}

	.source-card {
		display: grid;
		gap: var(--size-3);
		padding: var(--size-4);
		border: var(--border-size-1) solid var(--gray-7);
		border-radius: var(--radius-2);
	}

	.source-card h3 {
		font-size: var(--font-size-1);
	}

	dl {
		display: grid;
		gap: var(--size-2);
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 6rem 1fr;
		gap: var(--size-3);
	}

	dt {
		color: var(--gray-6);
	}

	dd {
		margin: 0;
	}

	.count-change {
		margin-inline-start: var(--size-1);
		color: var(--gray-6);
	}

	.refresh-message,
	.muted {
		color: var(--gray-6);
	}

	.source-error {
		color: var(--red-7);
	}

	@media (max-width: 40rem) {
		.setting {
			align-items: flex-start;
			flex-direction: column;
		}

		dl div {
			grid-template-columns: 1fr;
			gap: 0;
		}
	}
</style>
