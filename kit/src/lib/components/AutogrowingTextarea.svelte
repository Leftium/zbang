<script lang="ts">
	import type { HTMLTextareaAttributes, FormEventHandler } from 'svelte/elements'

	let {
		textareaElement = $bindable(),
		value = $bindable(),
		oninput,
		...props
	}: HTMLTextareaAttributes & { textareaElement?: HTMLTextAreaElement } = $props()

	function handleInput(
		this: HTMLTextAreaElement,
		event: Parameters<FormEventHandler<HTMLTextAreaElement>>[0]
	) {
		if (oninput) {
			oninput(event)
		}

		const lineHeight = parseFloat(window.getComputedStyle(this).lineHeight)
		const maxLines = 6

		// Reset the height to auto to get the correct scrollHeight
		this.style.height = 'auto'

		const height = this.scrollHeight
		this.style.height = Math.min(height, lineHeight * maxLines) + 'px'

		// Toggle scrollbar based on number of lines
		this.style.overflowY = height > lineHeight * maxLines ? 'scroll' : 'hidden'
	}
</script>

<grow-wrap>
	<textarea rows="1" bind:this={textareaElement} bind:value oninput={handleInput} {...props}
	></textarea>
</grow-wrap>

<style lang="scss">
	grow-wrap {
		textarea {
			white-space: nowrap;
			font-family: monospace;
		}
	}
</style>
