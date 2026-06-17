<script lang="ts">
	import { onMount } from 'svelte';
	import { initSettings } from '$lib/settings.svelte';
	import '../app.css';

	let { children } = $props();

	onMount(initSettings);
</script>

{@render children()}
