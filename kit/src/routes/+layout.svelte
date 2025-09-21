<script lang="ts">
	import '$src/app.scss'
	import { favicon } from '@leftium/logo'

	let { children } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="container">
	{@render children?.()}
</main>
