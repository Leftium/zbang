<script lang="ts">
	import { dev } from '$app/environment'
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'
	import { onMount } from 'svelte'

	let textareaElement = $state<HTMLTextAreaElement>()
	let inputHasFocus = $state(false)
	let value = $state('')

	let charCount = $derived(value.trim().length)
	let wordCount = $derived(value.split(/\S+/).length - 1)
	let lineCount = $derived(value.split('\n').length)

	let fullscreen = $state(false)
	let theme = $state('')

	type InputFrame = {
		data: string | null
		inputType: string
		ts: number
		interval: number
	}
	let inputHistory: InputFrame[] = $state([])

	// Double keypress: same key pressed twice in a row within certain interval.
	let doubleKeypress: string | null = $state(null)

	// When double-tapping the spacebar inserts period followed by a space.
	let isPeriodShortcut = $state(false)

	let debugInfo = $derived({
		isPeriodShortcut,
		doubleKeypress,
		inputHistory,
	})

	function focusInput() {
		textareaElement?.focus()
		if (false && !inputHasFocus) {
			textareaElement?.select()
		}
		inputHasFocus = true
	}

	function blurInput() {
		textareaElement?.blur()
		inputHasFocus = false
	}

	// Simulate Backspace
	function simulateBackspace() {
		if (textareaElement) {
			const start = textareaElement.selectionStart
			const end = textareaElement.selectionEnd

			if (start === end && start > 0 && textareaElement.value.charAt(start - 1) !== '\n') {
				// No selection, just a cursor
				textareaElement.value =
					textareaElement.value.slice(0, start - 1) + textareaElement.value.slice(start)
				textareaElement.setSelectionRange(start - 1, start - 1)
			} else if (start !== end) {
				// There is a selection
				textareaElement.value =
					textareaElement.value.slice(0, start) + textareaElement.value.slice(end)
				textareaElement.setSelectionRange(start, start)
			}
		}
	}

	// Simulate pressing '!'
	function simulateExclamation() {
		if (textareaElement) {
			const start = textareaElement.selectionStart
			const end = textareaElement.selectionEnd

			textareaElement.value =
				textareaElement.value.slice(0, start) + '!' + textareaElement.value.slice(end)
			textareaElement.setSelectionRange(start + 1, start + 1)
		}
	}

	function handleSearch() {
		blurInput()
		// Need to insert space after first newline so triggers are not joined with other text.
		// Need to percent encode to preserve newlines.
		const query = encodeURIComponent(value.replace('\n', ' \n'))

		window.open(`https://kagi.com/search?q=${query}`, '_blank')
	}

	function onbeforeinput(this: HTMLInputElement | HTMLTextAreaElement, event: InputEvent) {
		const { data, inputType } = event

		const ts = +new Date()
		const interval = ts - inputHistory[0]?.ts
		const inputFrame = {
			data,
			inputType,
			ts,
			interval,
		}

		inputHistory.unshift(inputFrame)
		if (inputHistory.length > 2) {
			inputHistory.pop()
		}

		doubleKeypress = null
		if (interval < 250) {
			if (
				interval > 50 &&
				inputType === 'deleteContentBackward' &&
				inputType === inputHistory[1].inputType
			) {
				doubleKeypress = 'backspace'
			} else if (inputType === 'insertLineBreak' && inputType === inputHistory[1].inputType) {
				doubleKeypress = 'newline'
			} else if (data?.toLowerCase() === inputHistory[1].data?.toLowerCase()) {
				doubleKeypress = inputHistory[1].data
			}
		}

		isPeriodShortcut = inputType === 'insertText' && data === '. '
	}

	function oninput(this: HTMLInputElement) {
		function cancelDoubleKeypress() {
			simulateBackspace()
			simulateBackspace()
		}

		if (isPeriodShortcut || doubleKeypress === ' ') {
			cancelDoubleKeypress()
			simulateExclamation()
			inputHistory[0].data = '!'
		}

		if (doubleKeypress === 'newline') {
			cancelDoubleKeypress()
			handleSearch()
		}

		if (doubleKeypress === 'F') {
			cancelDoubleKeypress()
			fullscreen = !fullscreen
		}
	}

	// Toggle between selecting all text and no text.
	function onmousedown(e: Event) {
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

	function autoTheme() {
		theme = ''
		document.documentElement.removeAttribute('data-theme')
		localStorage.setItem('theme', theme)
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark'
		document.documentElement.dataset.theme = theme
		localStorage.setItem('theme', theme)
	}

	onMount(() => {
		// Dark/light mode:
		theme = localStorage.getItem('theme') || ''
		if (theme) {
			document.documentElement.dataset.theme = theme
		}
	})
</script>

<svelte:document {onvisibilitychange} {onmousedown} />

<main>
	<header>
		<div>
			<span class="logo">[z!]</span>
			<span class="brand-secondary">whi</span><span class="brand-primary">zBang</span>
		</div>
		<button class="theme outline" onclick={toggleTheme} ondblclick={autoTheme}>
			colors: {theme || 'auto'}
		</button>
	</header>
	<AutogrowingTextarea
		bind:textareaElement
		bind:value
		bind:fullscreen
		{onbeforeinput}
		{oninput}
		autofocus
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
	>
		<status-bar>
			<div>
				<button class="outline" onclick={() => (fullscreen = !fullscreen)}>
					{fullscreen ? 'Restore' : 'Fullscreen'}
				</button>
			</div>
			<div>
				{#if lineCount > 1}{lineCount}L{/if}
				{wordCount}w {charCount}c
			</div>
			<button class="search" {onclick}>Search</button>
		</status-bar>
	</AutogrowingTextarea>

	<content>
		{#if dev}
			<pre>{JSON.stringify({ debugInfo }, null, 4)}</pre>
			<pre>{#each Array.from({ length: 99 }, (e, i) => i) as item}{item + '\n'}{/each}</pre>
		{/if}
	</content>
</main>

<style lang="scss">
	@use 'open-props-scss' as *;

	main {
		///border: 4px solid $violet-5;
		padding: $size-1;

		header {
			display: flex;
			justify-content: space-between;
			align-items: start;
			width: 100%;

			span {
				font-size: $font-size-4;
				font-weight: $font-weight-9;
			}

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
		}

		status-bar {
			display: flex;
			justify-content: space-between;
			align-items: center;

			font-size: $font-size-0;

			padding: $size-1;
			padding-inline: $size-2;

			border-top: 1px solid var(--pico-form-element-border-color);

			button {
				align-self: center;

				padding: 0 calc($size-1);

				font-size: calc($font-size-0 * 0.9);
				font-weight: $font-weight-5;
			}
		}

		button.theme {
			align-self: center;

			font-size: calc($font-size-0);
			font-weight: $font-weight-5;
			padding: calc($size-1);
			float: right;
		}

		pre {
			margin-top: $size-1;
		}
	}
</style>
