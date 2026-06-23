<script lang="ts">
	import { onMount } from 'svelte';

	let searchUrl = $state('/go?q=%s');

	onMount(() => {
		searchUrl = new URL('/go?q=%s', window.location.href).toString();
	});
</script>

<section class="default-search-setup" aria-labelledby="default-search-heading">
	<div>
		<p class="eyebrow">Default search</p>
		<h2 id="default-search-heading">Use zbang from the browser omnibar</h2>
		<p>
			Add zbang as a custom search engine, then use the browser address bar for searches and bangs.
			Local custom bangs stay in this browser.
		</p>
	</div>

	<label>
		<span>Search URL</span>
		<input readonly value={searchUrl} onclick={(event) => event.currentTarget.select()} />
	</label>

	<ol>
		<li>Open your browser search engine settings.</li>
		<li>Add a new site search named <strong>zbang</strong>.</li>
		<li>Use the search URL above. OpenSearch discovery is also advertised on this site.</li>
	</ol>
</section>

<style>
	.default-search-setup {
		display: grid;
		gap: var(--size-3);
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin: var(--size-4) auto;
		padding: var(--size-4);
		background: var(--nc-surface-2);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
	}

	.default-search-setup h2,
	.default-search-setup p,
	.default-search-setup ol {
		margin: 0;
	}

	.default-search-setup h2 {
		font-size: var(--font-size-4);
	}

	.default-search-setup p,
	.default-search-setup li {
		color: var(--nc-tx-2);
	}

	.eyebrow {
		color: var(--nc-primary);
		font-size: var(--font-size-0);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	label {
		display: grid;
		gap: var(--size-1);
		font-weight: 700;
	}

	input {
		width: 100%;
		font-family: var(--font-mono), monospace;
	}

	ol {
		padding-inline-start: 1.25rem;
	}
</style>
