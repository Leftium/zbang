<script lang="ts">
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'
	import { onMount } from 'svelte'

	let viewportElement = $state<HTMLElement>()

	let textareaElement = $state<HTMLTextAreaElement>()
	let inputHasFocus = $state(false)
	let value = $state('')

	let theme = $state('')

	function selectionLength(inputElement: HTMLTextAreaElement | HTMLInputElement) {
		return (inputElement.selectionEnd || 0) - (inputElement.selectionStart || 0)
	}

	function focusInput() {
		textareaElement?.focus()
		if (!inputHasFocus) {
			textareaElement?.select()
		}
		inputHasFocus = true
	}

	function blurInput() {
		textareaElement?.blur()
		inputHasFocus = false
	}

	function handleSearch() {
		blurInput()
		// Need to insert space after first newline so triggers are not joined with other text.
		// Need to percent encode to preserve newlines.
		const query = encodeURIComponent(value.replace('\n', ' \n'))

		window.open(`https://kagi.com/search?q=${query}`, '_blank')
	}

	function onkeydown(this: HTMLInputElement, event: Event) {
		const e = event as KeyboardEvent

		const prevChar = value.at(-1)

		if (e.key === ' ') {
			// Convert space key to `!` if first character or follows another space/newline:
			if (value === '' || prevChar === ' ' || prevChar === '\n') {
				value += '!'
				e.preventDefault()
			}

			// Convert selection to `!` if all selected:
			if (textareaElement && value.length === selectionLength(textareaElement)) {
				value = '!'
				textareaElement.selectionStart = textareaElement.selectionEnd
				e.preventDefault()
			}
		}

		// Handle double tap space to ". " on iOS:
		if (e.key === '. ') {
			value += ' !'
			e.preventDefault()
		}

		// Execute search on Kagi.com:
		if (e.key === 'Enter' && (e.ctrlKey || e.altKey || prevChar === '!')) {
			handleSearch()
			e.preventDefault()
		}
	}

	function onmousedown(e: Event) {
		if (textareaElement && inputHasFocus) {
			if (selectionLength(textareaElement) > 0) {
				textareaElement.selectionEnd = textareaElement.selectionStart = value.length
			} else {
				textareaElement.selectionStart = 0
				textareaElement.selectionEnd = value.length
			}
		}
		focusInput()

		e.preventDefault()
	}

	function onvisibilitychange() {
		if (document.visibilityState === 'visible') {
			focusInput()
		} else {
			blurInput()
		}
	}

	function onclick() {
		handleSearch()
	}

	function autoTheme(event: MouseEvent) {
		theme = ''
		document.documentElement.dataset.theme = theme
		localStorage.setItem('theme', theme)
	}

	function toggleTheme(event: MouseEvent) {
		theme = theme === 'dark' ? 'light' : 'dark'
		document.documentElement.dataset.theme = theme
		localStorage.setItem('theme', theme)
	}

	onMount(() => {
		// Dark/light mode:
		theme = localStorage.getItem('theme') || ''
		document.documentElement.dataset.theme = theme

		let height = window.visualViewport?.height || 0
		const viewport = window.visualViewport

		function resizeHandler() {
			if (!/iPhone|iPad|iPod/.test(window.navigator.userAgent)) {
				height = viewport?.height || 0
			}
			if (viewportElement) {
				viewportElement.style.top = `${height - (viewport?.height || 0)}px`
			}
		}

		window.visualViewport?.addEventListener('resize', resizeHandler)
	})
</script>

<svelte:document {onvisibilitychange} {onmousedown} />

<dynamic-viewport bind:this={viewportElement}>
	<content>
		<pre hidden>{#each Array.from({ length: 99 }, (e, i) => i) as item}{item + '\n'}{/each}</pre>
	</content>
	<search-controls>
		<h1>
			<div>
				<span class="logo">[z!]</span>
				<span class="brand-secondary">whi</span><span class="brand-primary">zBang</span>
			</div>
			<button class="theme outline" onclick={toggleTheme} ondblclick={autoTheme}>
				colors: {theme || 'auto'}
			</button>
		</h1>
		<AutogrowingTextarea
			bind:textareaElement
			bind:value
			{onkeydown}
			autofocus
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		<button class="search" {onclick}>Search</button>
	</search-controls>
</dynamic-viewport>

<style lang="scss">
	@use 'open-props-scss' as *;

	dynamic-viewport {
		///border: 4px solid $yellow-5;
		///background-color: $blue-5;
		display: flex;
		flex-direction: column;

		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;

		transition: top 350ms ease-out 0s;

		content {
			flex-shrink: 1;
			flex-grow: 1;
			overflow: auto;
		}

		search-controls {
			///border: 4px solid $violet-5;
			padding: $size-1;

			.brand-primary {
				color: $orange-8;

				// Svelte logo color
				color: #ff3e00;

				// Svelte theme color
				color: hsl(12, 94%, 62%);
			}

			.brand-secondary {
				color: $gray-5;
			}

			.logo {
				color: $gray-5;

				// Svelte logo color
				color: #ff3e00;
			}

			h1 {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
				width: 100%;
			}

			button.theme {
				font-size: $font-size-0;
				float: right;
				padding: $size-1;
			}

			button.search {
				margin-top: $size-1;
				width: 100%;
			}
		}
	}
</style>
