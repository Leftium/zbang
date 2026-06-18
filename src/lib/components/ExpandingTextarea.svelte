<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type {
		HTMLTextareaAttributes,
		FormEventHandler,
		KeyboardEventHandler
	} from 'svelte/elements';

	let {
		textareaElement = $bindable(),
		value = $bindable(''),
		fullscreen = $bindable(false),
		wordwrap = $bindable(true),
		enterNewlineRestored = $bindable(false),
		enterNewlineFullscreen = $bindable(true),
		primaryAction,
		onprimaryaction,
		oninput,
		onkeydown,
		...props
	}: Omit<HTMLTextareaAttributes, 'value'> & {
		textareaElement?: HTMLTextAreaElement;
		value?: string;
		fullscreen?: boolean;
		wordwrap?: boolean;
		enterNewlineRestored?: boolean;
		enterNewlineFullscreen?: boolean;
		primaryAction?: Snippet;
		onprimaryaction?: () => void;
	} = $props();

	let lineCount = $derived(value ? value.split('\n').length : 1);
	let wordCount = $derived(value.trim() ? value.trim().split(/\s+/).length : 0);
	let charCount = $derived(value.trim().length);
	let enterNewline = $derived(fullscreen ? enterNewlineFullscreen : enterNewlineRestored);
	let growWrapElement = $state<HTMLElement>();

	function adjustHeight() {
		if (!textareaElement) return;

		if (fullscreen) {
			textareaElement.style.height = '';
			textareaElement.style.overflowY = 'auto';
			return;
		}

		const lineHeight = Number.parseFloat(getComputedStyle(textareaElement).lineHeight);
		const maxHeight = lineHeight * 6;

		textareaElement.style.height = 'auto';
		textareaElement.style.height = `${Math.min(textareaElement.scrollHeight, maxHeight)}px`;
		textareaElement.style.overflowY = textareaElement.scrollHeight > maxHeight ? 'auto' : 'hidden';
	}

	function insertText(text: string) {
		if (!textareaElement) return;

		const { selectionStart, selectionEnd } = textareaElement;
		value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);

		requestAnimationFrame(() => {
			const cursor = selectionStart + text.length;
			textareaElement?.setSelectionRange(cursor, cursor);
			adjustHeight();
		});
	}

	function handleInput(event: Parameters<FormEventHandler<HTMLTextAreaElement>>[0]) {
		oninput?.(event);
		adjustHeight();
	}

	function handleKeydown(event: Parameters<KeyboardEventHandler<HTMLTextAreaElement>>[0]) {
		if (event.key === 'Enter') {
			event.preventDefault();

			if (enterNewline) {
				insertText('\n');
			} else {
				onprimaryaction?.();
			}

			return;
		}

		onkeydown?.(event);
	}

	$effect(() => {
		document.body.style.overflowY = fullscreen ? 'hidden' : 'auto';
		if (!fullscreen && growWrapElement) growWrapElement.style.bottom = '';

		return () => {
			document.body.style.overflowY = 'auto';
		};
	});

	$effect(() => {
		void value;
		void wordwrap;
		void fullscreen;

		requestAnimationFrame(adjustHeight);
	});

	onMount(() => {
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

		if (!isIOS) return;

		const controller = new AbortController();
		const { signal } = controller;
		const viewport = window.visualViewport;
		let height = viewport?.height || 0;
		let keyboardOpen = false;

		function preventScrollDown(event: Event) {
			if (fullscreen && keyboardOpen && window.scrollY > 0) {
				event.preventDefault();
				window.scrollTo(0, 0);
			}
		}

		function resizeHandler() {
			if (!growWrapElement || !viewport) return;

			const offset = height - viewport.height;
			const wasKeyboardOpen = keyboardOpen;
			keyboardOpen = offset > 50;

			if (!fullscreen) {
				growWrapElement.style.bottom = '';
				return;
			}

			if (keyboardOpen === wasKeyboardOpen) return;

			if (keyboardOpen) {
				growWrapElement.style.bottom = `${offset}px`;
			} else {
				growWrapElement.style.bottom = '';
				height = viewport.height;
			}
		}

		window.visualViewport?.addEventListener('resize', resizeHandler, { signal });
		window.addEventListener('scroll', preventScrollDown, { passive: false, signal });

		return () => controller.abort();
	});
</script>

<div bind:this={growWrapElement} class:fullscreen class:wordwrap class="grow-wrap">
	<textarea
		rows="1"
		bind:this={textareaElement}
		bind:value
		oninput={handleInput}
		onkeydown={handleKeydown}
		{...props}></textarea>

	<div class="status-bar">
		<div>
			<button class="secondary outline" onclick={() => (fullscreen = !fullscreen)}>
				{fullscreen ? 'Restore' : 'Fullscreen'}
			</button>
			<label title="wrap lines"><input type="checkbox" bind:checked={wordwrap} /> <b>wrap</b></label
			>
		</div>

		<div class="counts">
			{#if lineCount > 1}{lineCount}L{/if}
			{wordCount}w {charCount}c
		</div>

		<div>
			<label title="ENTER inserts newline">
				<input
					type="checkbox"
					checked={enterNewline}
					onchange={(event) => {
						if (fullscreen) {
							enterNewlineFullscreen = event.currentTarget.checked;
						} else {
							enterNewlineRestored = event.currentTarget.checked;
						}
					}}
					onmousedown={(event) => event.preventDefault()}
				/>
				<b>ENTER</b>
			</label>
		</div>
	</div>

	{#if primaryAction}
		<div class="primary-action">
			{@render primaryAction()}
		</div>
	{/if}
</div>

<style>
	.grow-wrap {
		display: block;
		background: var(--nc-surface-1);
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
	}

	.grow-wrap.fullscreen {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		border: none;
		border-radius: 0;
		z-index: 1;
	}

	textarea {
		flex: 1;
		width: 100%;
		margin: 0;
		padding-block: 0;
		padding-inline: var(--size-2);
		white-space: pre;
		overflow-x: auto;
		font-family: monospace;
		border: none;
		resize: none;
	}

	textarea:focus {
		border: none;
		box-shadow: none;
		outline: none;
	}

	.grow-wrap:not(.wordwrap) textarea {
		padding-bottom: 0.75rem;
	}

	.grow-wrap.wordwrap textarea {
		white-space: pre-wrap;
		overflow-x: hidden;
		overflow-wrap: break-word;
	}

	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem var(--size-2);
		border-top: 1px solid var(--nc-border);
		font-size: var(--font-size-0);
		gap: var(--size-2);
	}

	.status-bar > div {
		display: flex;
		flex: 1;
		align-items: center;
	}

	.status-bar > div:last-child {
		justify-content: flex-end;
	}

	.counts {
		justify-content: center;
		white-space: nowrap;
	}

	.primary-action {
		display: grid;
		gap: var(--size-2);
		padding: var(--size-2);
		border-top: 1px solid var(--nc-border);
	}

	button {
		align-self: center;
		margin: 0;
		padding: 0 var(--size-1);
		font-size: calc(var(--font-size-0) * 0.9);
		font-weight: var(--font-weight-5);
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0 0.5rem;
		padding: 0;
		font-size: calc(var(--font-size-0) * 0.9);
		white-space: nowrap;
	}

	input[type='checkbox'] {
		all: revert;
		width: 0.75rem;
		height: 0.75rem;
		margin: 0;
		accent-color: var(--nc-primary);
	}

	@media (max-width: 520px) {
		.status-bar {
			align-items: center;
			gap: var(--size-1);
			padding: 0.125rem var(--size-1);
		}

		.status-bar > div {
			flex: 0 1 auto;
		}

		.counts {
			flex: 1 0 auto;
		}

		.primary-action {
			gap: var(--size-1);
			padding: var(--size-1);
		}

		button {
			padding-inline: 0.375rem;
			font-size: calc(var(--font-size-0) * 0.8);
		}

		label {
			gap: 0.125rem;
			margin-inline: 0.125rem;
			font-size: calc(var(--font-size-0) * 0.8);
		}

		input[type='checkbox'] {
			width: 0.7rem;
			height: 0.7rem;
		}
	}
</style>
