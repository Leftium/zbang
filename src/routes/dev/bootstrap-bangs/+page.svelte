<script lang="ts">
	import { dev } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	import {
		readBangCatalog,
		type BangProviderId,
		type Zbang,
		type ZbangCatalog
	} from '$lib/bang-data';
	import Header from '$lib/components/Header.svelte';

	const BOOTSTRAP_MAX_RANK = 1000;
	const providers: { value: BangProviderId; label: string; filename: string }[] = [
		{ value: 'kagi', label: 'Kagi', filename: 'zbang.bootstrap.kagi.json' },
		{
			value: 'duckduckgo',
			label: 'DuckDuckGo',
			filename: 'zbang.bootstrap.duckduckgo.json'
		}
	];

	type BootstrapOutput = {
		provider: BangProviderId;
		label: string;
		filename: string;
		sourceCount: number;
		bootstrapCount: number;
		generatedAt: string;
		json: string;
		url: string;
	};

	let outputs = $state<BootstrapOutput[]>([]);
	let missingProviders = $state<BangProviderId[]>([]);
	let message = $state('Loading generated bang catalogs...');
	let isLoading = $state(false);

	onMount(() => {
		if (dev) {
			void generateBootstrapFiles();
		} else {
			message = 'Bootstrap generation is only available in dev mode.';
		}
	});

	onDestroy(() => {
		revokeOutputUrls(outputs);
	});

	async function generateBootstrapFiles() {
		isLoading = true;
		message = 'Loading generated bang catalogs...';

		try {
			const nextOutputs: BootstrapOutput[] = [];
			const nextMissingProviders: BangProviderId[] = [];

			for (const provider of providers) {
				const catalog = await readBangCatalog(provider.value);

				if (!catalog) {
					nextMissingProviders.push(provider.value);
					continue;
				}

				const bootstrap = buildBootstrapCatalog(catalog);
				const json = `${formatBootstrapJson(bootstrap)}\n`;
				nextOutputs.push({
					provider: provider.value,
					label: provider.label,
					filename: provider.filename,
					sourceCount: catalog.items.length,
					bootstrapCount: bootstrap.items.length,
					generatedAt: catalog.generatedAt ?? '',
					json,
					url: URL.createObjectURL(new Blob([json], { type: 'application/json' }))
				});
			}

			revokeOutputUrls(outputs);
			outputs = nextOutputs;
			missingProviders = nextMissingProviders;
			message = nextOutputs.length
				? `Generated bootstrap files with rank <= ${BOOTSTRAP_MAX_RANK}.`
				: 'No generated catalogs found. Refresh bang data from settings first.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed to generate bootstrap files.';
		} finally {
			isLoading = false;
		}
	}

	function buildBootstrapCatalog(catalog: ZbangCatalog): ZbangCatalog {
		const items = catalog.items
			.filter((item) => item.rank <= BOOTSTRAP_MAX_RANK)
			.map(toRuntimeZbang);

		return {
			provider: catalog.provider,
			generatedAt: catalog.generatedAt,
			generatorVersion: catalog.generatorVersion,
			sources: catalog.sources,
			items
		};
	}

	function toRuntimeZbang(item: Zbang): Zbang {
		return {
			rank: item.rank,
			name: item.name,
			code: item.code,
			tags: item.tags,
			urls: item.urls
		};
	}

	function formatBootstrapJson(value: unknown, depth = 0): string {
		const indent = '\t'.repeat(depth);
		const nextIndent = '\t'.repeat(depth + 1);

		if (Array.isArray(value)) {
			if (!value.length) return '[]';

			if (value.every(isPrimitiveJsonValue)) {
				return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
			}

			return `[
${value.map((item) => `${nextIndent}${formatBootstrapJson(item, depth + 1)}`).join(',\n')}
${indent}]`;
		}

		if (value && typeof value === 'object') {
			const entries = Object.entries(value);

			if (!entries.length) return '{}';

			return `{
${entries
	.map(
		([key, item]) => `${nextIndent}${JSON.stringify(key)}: ${formatBootstrapJson(item, depth + 1)}`
	)
	.join(',\n')}
${indent}}`;
		}

		return JSON.stringify(value);
	}

	function isPrimitiveJsonValue(value: unknown) {
		return value === null || ['string', 'number', 'boolean'].includes(typeof value);
	}

	function revokeOutputUrls(values: BootstrapOutput[]) {
		for (const output of values) {
			URL.revokeObjectURL(output.url);
		}
	}

	function downloadOutput(output: BootstrapOutput) {
		const link = document.createElement('a');
		link.href = output.url;
		link.download = output.filename;
		link.click();
	}

	function formatCount(count: number) {
		return new Intl.NumberFormat().format(count);
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<main>
	<Header />

	<section aria-labelledby="bootstrap-heading">
		<div class="heading-row">
			<div>
				<p class="eyebrow">Dev tool</p>
				<h1 id="bootstrap-heading">Bootstrap bangs</h1>
				<p>
					Generate small static bootstrap catalogs from locally generated provider-native bang data.
				</p>
			</div>

			{#if dev}
				<button class="secondary outline" disabled={isLoading} onclick={generateBootstrapFiles}>
					{isLoading ? 'Generating...' : 'Regenerate'}
				</button>
			{/if}
		</div>

		<p class="message" aria-live="polite">{message}</p>

		{#if !dev}
			<p class="warning">This route is intentionally disabled outside local development.</p>
		{:else}
			{#if missingProviders.length}
				<p class="warning">
					Missing generated catalogs: {missingProviders.join(', ')}. Refresh bang data from
					settings.
				</p>
			{/if}

			<div class="output-list">
				{#each outputs as output (output.provider)}
					<article class="output-card">
						<div class="card-heading">
							<div>
								<h2>{output.label}</h2>
								<p><code>{output.filename}</code></p>
							</div>

							<button class="secondary outline" onclick={() => downloadOutput(output)}>
								Download JSON
							</button>
						</div>

						<dl>
							<div>
								<dt>Catalog records</dt>
								<dd>{formatCount(output.sourceCount)}</dd>
							</div>
							<div>
								<dt>Bootstrap records</dt>
								<dd>{formatCount(output.bootstrapCount)}</dd>
							</div>
							<div>
								<dt>Catalog generated</dt>
								<dd>{formatDate(output.generatedAt)}</dd>
							</div>
						</dl>

						<textarea readonly value={output.json} aria-label={`${output.label} bootstrap JSON`}
						></textarea>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}

	main > section {
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

	h2 {
		font-size: var(--font-size-2);
	}

	p,
	dt {
		color: var(--gray-6);
	}

	.heading-row,
	.card-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--size-4);
	}

	.eyebrow {
		font-size: var(--font-size-0);
		font-weight: var(--font-weight-7);
		letter-spacing: var(--font-letterspacing-2);
		text-transform: uppercase;
	}

	.output-list {
		display: grid;
		gap: var(--size-4);
	}

	.output-card {
		display: grid;
		gap: var(--size-4);
		padding: var(--size-4);
		border: var(--border-size-1) solid var(--gray-7);
		border-radius: var(--radius-2);
	}

	dl {
		display: grid;
		gap: var(--size-2);
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 10rem 1fr;
		gap: var(--size-3);
	}

	dd {
		margin: 0;
	}

	textarea {
		min-height: 22rem;
		font-family: var(--font-mono);
		font-size: var(--font-size-0);
		resize: vertical;
	}

	.message {
		color: var(--gray-6);
	}

	.warning {
		color: var(--red-7);
	}

	@media (max-width: 40rem) {
		.heading-row,
		.card-heading {
			flex-direction: column;
		}

		dl div {
			grid-template-columns: 1fr;
			gap: 0;
		}
	}
</style>
