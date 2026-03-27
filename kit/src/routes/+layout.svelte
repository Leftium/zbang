<script lang="ts">
	import '$src/app.scss'
	import { favicon } from '@leftium/logo'

	let { children } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main>
	{@render children?.()}
</main>

<style>
	:global(html) {
		--nc-content-width: 768px;
		--nc-primary: #546486;
		--nc-primary-hover: #4a5876;
	}
</style>
