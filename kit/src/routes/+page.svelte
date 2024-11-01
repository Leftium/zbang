<script lang="ts">
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'
	import { onMount } from 'svelte'

	let viewportElement = $state<HTMLElement>()

	let textareaElement = $state<HTMLTextAreaElement>()
	let inputHasFocus = $state(false)
	let value = $state('')

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

	// Simulate Backspace
	function simulateBackspace() {
		if (textareaElement) {
			const start = textareaElement.selectionStart
			const end = textareaElement.selectionEnd

			if (start === end && start > 0) {
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
			if (inputType === 'insertLineBreak' && inputHistory[1].inputType === 'insertLineBreak') {
				doubleKeypress = '\n'
			} else if (data === inputHistory[1].data) {
				doubleKeypress = data
			}
		}

		isPeriodShortcut = inputType === 'insertText' && data === '. '
	}

	function oninput(this: HTMLInputElement) {
		function cancelDoubleKeypres() {
			simulateBackspace()
			simulateBackspace()
		}

		if (isPeriodShortcut || doubleKeypress === ' ') {
			cancelDoubleKeypres()
			simulateExclamation()
			inputHistory[0].data = '!'
		}

		if (doubleKeypress === '\n') {
			cancelDoubleKeypres()
			handleSearch()
		}
	}

	// Toggle between selecting all text and no text.
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
			{onbeforeinput}
			{oninput}
			autofocus
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		<button class="search" {onclick}>Search</button>
		<pre>{JSON.stringify({ debugInfo }, null, 4)}</pre>
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
