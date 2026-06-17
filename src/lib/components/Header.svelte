<script lang="ts">
	import { onMount } from 'svelte';

	let theme = $state('');

	function applyTheme(nextTheme: string) {
		theme = nextTheme;

		if (!theme) {
			document.documentElement.removeAttribute('data-theme');
			document.documentElement.style.removeProperty('color-scheme');
			localStorage.removeItem('theme');
			return;
		}

		document.documentElement.dataset.theme = theme;
		document.documentElement.style.colorScheme = theme;
		localStorage.setItem('theme', theme);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	function autoTheme() {
		applyTheme('');
	}

	onMount(() => {
		const storedTheme = localStorage.getItem('theme') || '';

		if (storedTheme) {
			applyTheme(storedTheme);
		}
	});
</script>

<header>
	<div>
		<span class="logo">[z!]</span>
		<span class="brand-secondary">whi</span><span class="brand-primary">zBang</span>
	</div>

	<button class="secondary outline theme" onclick={toggleTheme} ondblclick={autoTheme}>
		colors: {theme || 'auto'}
	</button>
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

	.theme {
		align-self: center;
		padding: var(--size-1);
		font-size: var(--font-size-0);
		font-weight: var(--font-weight-5);
		white-space: nowrap;
	}
</style>
