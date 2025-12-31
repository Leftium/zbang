<script lang="ts">
	import { onMount } from 'svelte'
	import type { HTMLTextareaAttributes, FormEventHandler } from 'svelte/elements'

	let {
		textareaElement = $bindable(),
		value = $bindable(),
		oninput,
		fullscreen = $bindable(),
		wordwrap = $bindable(false),
		children,
		...props
	}: HTMLTextareaAttributes & {
		textareaElement?: HTMLTextAreaElement
		fullscreen: boolean
		wordwrap?: boolean
	} = $props()

	let growWrapElement: HTMLElement | undefined = $state()

	function adjustTextAreaHeight() {
		if (textareaElement) {
			const lineHeight = parseFloat(window.getComputedStyle(textareaElement).lineHeight)
			const maxLines = 6

			// Reset the height to auto to get the correct scrollHeight
			textareaElement.style.height = 'auto'

			const height = textareaElement.scrollHeight
			textareaElement.style.height = Math.min(height, lineHeight * maxLines) + 'px'

			// Toggle scrollbar based on number of lines
			textareaElement.style.overflowY = height > lineHeight * maxLines ? 'auto' : 'hidden'
		}
	}

	$effect(() => {
		// Prevent scrollbar when body is taller than textarea:
		document.body.style.overflowY = fullscreen ? 'hidden' : 'auto'

		// Track wordwrap to trigger recalculation when it changes
		void wordwrap

		// Use requestAnimationFrame to ensure CSS changes are applied before measuring
		requestAnimationFrame(() => {
			adjustTextAreaHeight()
		})
	})

	function handleInput(event: Parameters<FormEventHandler<HTMLTextAreaElement>>[0]) {
		if (oninput) {
			oninput(event)
		}

		adjustTextAreaHeight()
	}

	onMount(() => {
		let height = window.visualViewport?.height || 0
		const viewport = window.visualViewport

		function resizeHandler() {
			if (growWrapElement) {
				growWrapElement.style.bottom = `${height - (viewport?.height || 0)}px`
			}
		}

		window.visualViewport?.addEventListener('resize', resizeHandler)
	})
</script>

<grow-wrap bind:this={growWrapElement} class:fullscreen class:wordwrap>
	<textarea rows="1" bind:this={textareaElement} bind:value oninput={handleInput} {...props}
	></textarea>
	{@render children?.()}
</grow-wrap>

<style lang="scss">
	grow-wrap {
		display: block;

		background: var(--pico-background-color);

		border: var(--pico-border-width) solid var(--pico-form-element-border-color);
		border-radius: var(--pico-border-radius);

		&.fullscreen {
			display: flex;
			flex-direction: column;

			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;

			border: none;
		}

		textarea {
			margin: 0;
			padding-block: 0;
			padding-inline: var(--size-2);

			flex-grow: 1;

			white-space: pre;
			overflow-x: scroll;
			font-family: monospace;

			border: none;
			resize: none;

			&:focus {
				outline: none;
				border: none;
				box-shadow: none;
			}
		}

		&:not(.wordwrap) textarea {
			padding-bottom: 0.75rem;
		}

		&.wordwrap textarea {
			white-space: pre-wrap;
			word-wrap: break-word;
			overflow-x: hidden;
		}
	}
</style>
