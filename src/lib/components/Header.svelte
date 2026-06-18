<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { modeLabel }: { modeLabel?: string } = $props();
</script>

<header>
	<a class="brand" href={resolve('/')}>
		<span class="logo">[z!]</span>
		<span class="brand-secondary">whi</span><span class="brand-primary">zBang</span>
		{#if modeLabel}
			<span class="mode-separator">/</span><span class="mode-label">{modeLabel}</span>
		{/if}
	</a>

	{#if page.url.pathname !== resolve('/settings')}
		<a class="secondary outline settings" href={resolve('/settings')}>settings</a>
	{/if}
</header>

<style>
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		width: 100%;
		gap: var(--size-2);
	}

	span {
		font-size: var(--font-size-4);
		font-weight: var(--font-weight-9);
	}

	.logo {
		color: #ff3e00;
	}

	.brand-primary {
		color: hsl(15 94% 62%);
	}

	.brand-secondary {
		color: var(--gray-5);
	}

	.mode-separator,
	.mode-label {
		font-size: var(--font-size-2);
		font-weight: var(--font-weight-6);
	}

	.mode-separator {
		margin-inline: 0.375rem;
		color: var(--gray-5);
	}

	.mode-label {
		color: hsl(15 70% 66%);
	}

	a {
		text-decoration: none;
	}

	.brand {
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
		line-height: var(--font-lineheight-1);
	}

	.settings {
		align-self: center;
		padding: var(--size-1);
		font-size: var(--font-size-0);
		font-weight: var(--font-weight-5);
		white-space: nowrap;
	}
</style>
