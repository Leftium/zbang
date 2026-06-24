<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { initSettings } from '$lib/settings.svelte';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		initSettings();

		if ('serviceWorker' in navigator) {
			void navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' });
		}
	});
</script>

{@render children()}
