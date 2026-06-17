<script lang="ts" module>
	export type InspectPanelId =
		| 'doc-json'
		| 'terms'
		| 'topics'
		| 'people'
		| 'places'
		| 'organizations'
		| 'dates'
		| 'date-values'
		| 'times'
		| 'time-values'
		| 'durations'
		| 'numbers'
		| 'stats'
		| 'ngrams'
		| 'tfidf'
		| 'tags';

	export const inspectPanelIds = [
		'doc-json',
		'terms',
		'topics',
		'people',
		'places',
		'organizations',
		'dates',
		'date-values',
		'times',
		'time-values',
		'durations',
		'numbers',
		'stats',
		'ngrams',
		'tfidf',
		'tags'
	] as const;

	export function getInspectPanelId(value: string | null): InspectPanelId {
		return inspectPanelIds.includes(value as InspectPanelId) ? (value as InspectPanelId) : 'doc-json';
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Inspect from 'svelte-inspect-value';

	import { createCompromiseDoc } from '$lib/compromise';

	type InspectPanel = {
		id: InspectPanelId;
		label: string;
		description: string;
		getValue: () => unknown;
	};

	let { text, inspect = 'doc-json' }: { text: string; inspect?: InspectPanelId } = $props();

	const doc = $derived(createCompromiseDoc(text.trim()));
	const panels = $derived<InspectPanel[]>([
		{
			id: 'doc-json',
			label: 'doc.json()',
			description: 'Full compromise document JSON.',
			getValue: () => doc.json()
		},
		{
			id: 'terms',
			label: 'terms().json()',
			description: 'Token-level terms and tags.',
			getValue: () => doc.terms().json()
		},
		{
			id: 'topics',
			label: 'topics().json()',
			description: 'Detected topics and named entities.',
			getValue: () => doc.topics().json()
		},
		{
			id: 'people',
			label: 'people().json()',
			description: 'Detected people.',
			getValue: () => doc.people().json()
		},
		{
			id: 'places',
			label: 'places().json()',
			description: 'Detected places.',
			getValue: () => doc.places().json()
		},
		{
			id: 'organizations',
			label: 'organizations().json()',
			description: 'Detected organizations.',
			getValue: () => doc.organizations().json()
		},
		{
			id: 'dates',
			label: 'dates().json()',
			description: 'Detected date phrases from compromise-dates.',
			getValue: () => doc.dates().json()
		},
		{
			id: 'date-values',
			label: 'dates().get()',
			description: 'Parsed date metadata from compromise-dates.',
			getValue: () => doc.dates().get()
		},
		{
			id: 'times',
			label: 'times().json()',
			description: 'Detected time phrases from compromise-dates.',
			getValue: () => doc.times().json()
		},
		{
			id: 'time-values',
			label: 'times().get()',
			description: 'Parsed time metadata from compromise-dates.',
			getValue: () => doc.times().get()
		},
		{
			id: 'durations',
			label: 'durations().json()',
			description: 'Detected duration phrases from compromise-dates.',
			getValue: () => doc.durations().json()
		},
		{
			id: 'numbers',
			label: 'numbers().json()',
			description: 'Detected numeric values.',
			getValue: () => doc.numbers().json()
		},
		{
			id: 'stats',
			label: 'stats summary',
			description: 'Common frequency outputs from compromise-stats.',
			getValue: () => ({
				unigrams: doc.unigrams(),
				bigrams: doc.bigrams(),
				trigrams: doc.trigrams(),
				tfidf: doc.tfidf()
			})
		},
		{
			id: 'ngrams',
			label: 'ngrams({ min: 1, max: 3 })',
			description: 'Repeating sub-phrases from compromise-stats.',
			getValue: () => doc.ngrams({ min: 1, max: 3 })
		},
		{
			id: 'tfidf',
			label: 'tfidf()',
			description: 'Word importance from compromise-stats.',
			getValue: () => doc.tfidf()
		},
		{
			id: 'tags',
			label: "out('tags')",
			description: 'Readable tag output from compromise.',
			getValue: () => doc.out('tags')
		}
	]);
	const selectedPanel = $derived(panels.find((panel) => panel.id === inspect) ?? panels[0]);
	const inspectedValue = $derived(selectedPanel.getValue());

	function setInspect(inspect: InspectPanelId) {
		const params = new URLSearchParams({ mode: 'compromise', q: text, inspect });

		void goto(resolve(`/?${params}`));
	}
</script>

<section class="inspector" aria-label="Compromise JSON inspector">
	<header>
		<div>
			<h2>Compromise Inspector</h2>
			<p>{selectedPanel.description}</p>
		</div>
	</header>

	<nav aria-label="Inspector views">
		{#each panels as panel (panel.id)}
			<button class:active={panel.id === selectedPanel.id} onclick={() => setInspect(panel.id)}>
				{panel.label}
			</button>
		{/each}
	</nav>

	<div class="inspect-value">
		<Inspect
			value={inspectedValue}
			name={selectedPanel.label}
			borderless
			expandLevel={2}
			noanimate
			previewDepth={0}
			quotes="none"
			showLength={false}
			showPreview={false}
			showTypes={false}
			theme=""
		/>
	</div>
</section>

<style>
	.inspector {
		display: grid;
		gap: var(--size-2);
		margin-block-start: var(--size-3);
		padding: var(--size-3);
		background: var(--nc-surface-1);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
	}

	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--size-3);
	}

	h2,
	p {
		margin: 0;
	}

	p {
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
	}

	button {
		padding: 0.125rem 0.5rem;
		color: var(--nc-tx-2);
		background: transparent;
		text-decoration: none;
		border: 1px solid var(--nc-border);
		border-radius: 999px;
	}

	button.active {
		color: var(--nc-tx-1);
		border-color: var(--nc-primary);
	}

	.inspect-value {
		--base00: #fdf6e3;
		--base01: #eee8d5;
		--base02: #93a1a1;
		--base03: #839496;
		--base04: #657b83;
		--base05: #586e75;
		--base06: #073642;
		--base07: #002b36;
		--base08: #dc322f;
		--base09: #cb4b16;
		--base0A: #b58900;
		--base0B: #859900;
		--base0C: #2aa198;
		--base0D: #268bd2;
		--base0E: #6c71c4;
		--base0F: #d33682;
		--delimiter-color: var(--base02);
		--inspect-font: fira code, monospace;
		--inspect-font-size: 14px;

		max-width: 100%;
		overflow: auto;
		padding: var(--size-2);
		background: var(--base00);
		color: var(--base05);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
	}

	.inspect-value :global(.bullet),
	.inspect-value :global(.type),
	.inspect-value :global(.count) {
		opacity: 0.3;
	}

	.inspect-value :global(.bullet) {
		opacity: 0.1;
	}

	.inspect-value :global(.key.quotedstring) {
		color: inherit;
	}

	.inspect-value :global(.indent),
	.inspect-value :global(.body) {
		overflow: inherit;
	}

	@media (prefers-color-scheme: dark) {
		.inspect-value {
			--base00: #002b36;
			--base01: #073642;
			--base02: #586e75;
			--base03: #657b83;
			--base04: #839496;
			--base05: #93a1a1;
			--base06: #eee8d5;
			--base07: #fdf6e3;
			--base08: #dc322f;
			--base09: #cb4b16;
			--base0A: #b58900;
			--base0B: #859900;
			--base0C: #2aa198;
			--base0D: #268bd2;
			--base0E: #6c71c4;
			--base0F: #d33682;
		}
	}
</style>
