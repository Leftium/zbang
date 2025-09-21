<script lang="ts">
	import '$src/app.scss'
	import favicon from '$lib/assets/favicon.svg'

	let { children } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="container">
	{@render children?.()}
</main>
