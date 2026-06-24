<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let errorMessage = $state('');

	onMount(() => {
		const targetUrl = page.url.searchParams.get('target') ?? '';
		const channelName = page.url.searchParams.get('channel') ?? '';
		const index = Number(page.url.searchParams.get('index'));

		try {
			const target = new URL(targetUrl);

			if (!['http:', 'https:'].includes(target.protocol)) {
				throw new Error('Unsupported target URL');
			}

			if (!channelName || !Number.isInteger(index) || index < 1) {
				throw new Error('Missing fanout acknowledgement data');
			}

			const channel = new BroadcastChannel(channelName);

			channel.postMessage({ index });
			window.setTimeout(() => {
				channel.close();
				window.location.replace(target.toString());
			}, 0);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}
	});
</script>

<svelte:head>
	<title>Opening bang target | Whiz</title>
</svelte:head>

<main class="go-open-status" aria-live="polite">
	<p>Opening bang target...</p>
	{#if errorMessage}
		<p class="error">Could not open this bang target: {errorMessage}</p>
	{/if}
</main>

<style>
	.go-open-status {
		display: grid;
		gap: 0.25rem;
		justify-items: center;
		width: min(32rem, 100%);
		margin-inline: auto;
		padding: 0.35rem 0.5rem;
		color: var(--nc-tx-2);
		font-size: var(--font-size-0);
		line-height: 1.2;
		opacity: 0.72;
		text-align: center;
	}

	.go-open-status p {
		max-width: 100%;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error {
		color: var(--red-7);
		opacity: 1;
	}
</style>
