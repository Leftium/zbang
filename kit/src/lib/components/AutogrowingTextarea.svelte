<script lang="ts">
	//// Based on: https://css-tricks.com/the-cleanest-trick-for-autogrowing-textareas

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

		if (this.parentNode) {
			;(this.parentNode as HTMLElement).dataset.replicatedValue = this.value
		}
	}
</script>

<grow-wrap>
	<textarea bind:this={textareaElement} bind:value oninput={handleInput} {...props}></textarea>
</grow-wrap>

<style lang="scss">
	grow-wrap {
		// Easy way to plop the elements on top of each other and have them both sized based on the tallest one's height
		display: grid;

		&::after {
			// Note the weird space! Needed to preventy jumpy behavior
			content: attr(data-replicated-value) ' ';

			// This is how textarea text behaves
			white-space: pre-wrap;

			// Hidden from view, clicks, and screen readers
			visibility: hidden;
		}

		& > textarea {
			// You could leave this, but after a user resizes, then it ruins the auto sizing
			resize: none;

			// Firefox shows scrollbar on growth, you can hide like this.
			overflow: hidden;
		}

		& > textarea,
		&::after {
			// Identical styling required!!
			border: 1px solid;
			padding: 0.75rem 1rem;
			margin: 0;
			font: inherit;

			// Place on top of each other
			grid-area: 1 / 1 / 2 / 2;
		}
	}
</style>
