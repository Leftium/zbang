<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<header>
	<a class="brand" href={resolve('/')}>
		<span class="logo">[z!]</span>
		<span class="brand-secondary">whi</span><span class="brand-primary">zBang</span>
	</a>

	<a class="secondary outline settings" href={resolve('/settings')}>settings</a>
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

	a {
		text-decoration: none;
	}

	.brand {
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
