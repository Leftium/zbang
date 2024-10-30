<script lang="ts">
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'

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
			blurInput()
			// Need to insert space after first newline so triggers are not joined with other text.
			// Need to percent encode to preserve newlines.
			const query = encodeURIComponent(value.replace('\n', ' \n'))

			window.open(`https://kagi.com/search?q=${query}`, '_blank')
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
</script>

<svelte:document {onvisibilitychange} {onmousedown} />

<main>
	<h1>z!</h1>

	<AutogrowingTextarea
		bind:textareaElement
		bind:value
		{onkeydown}
		autofocus
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
	/>

	<pre>{value}</pre>
</main>

<style lang="scss">
	@use 'open-props-scss' as *;

	main {
		margin: $size-1 0;
		height: calc(100svh - ($size-1 * 2));
	}
</style>
