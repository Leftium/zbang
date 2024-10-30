<script lang="ts">
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'
	import { onMount } from 'svelte'

	let viewportElement = $state<HTMLElement>()

	let textareaElement = $state<HTMLTextAreaElement>()
	let inputHasFocus = $state(false)
	let value = $state('')

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

		if (e.key === ' ') {
			// Convert space key to `!` if first character or follows another space:
			if (value === '' || value.at(-1) === ' ') {
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
		if (e.key === 'Enter' && (e.ctrlKey || e.altKey)) {
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

	onMount(() => {
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
		<h1>z!</h1>
		<pre>{#each Array.from({ length: 99 }, (e, i) => i) as item}{item + '\n'}{/each}</pre>
	</content>
	<search-controls>
		<AutogrowingTextarea
			bind:textareaElement
			bind:value
			{onkeydown}
			autofocus
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
		/>
		<button {onclick}>Search</button>
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
			button {
				margin-block: $size-1;
				width: 100%;
			}
		}
	}
</style>
