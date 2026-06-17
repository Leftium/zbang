<script lang="ts">
	import ExpandingTextarea from '$lib/components/ExpandingTextarea.svelte';
	import Header from '$lib/components/Header.svelte';

	let value = $state('');
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
	/>
</main>

<style>
	main {
		width: min(calc(var(--nc-content-width) + 2 * var(--nc-spacing)), 100%);
		margin-inline: auto;
		padding-inline: var(--nc-spacing);
	}
</style>
