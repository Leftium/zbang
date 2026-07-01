<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type {
		HTMLTextareaAttributes,
		FormEventHandler,
		KeyboardEventHandler
	} from 'svelte/elements';

	type PreviewSegment = {
		kind: 'committed' | 'shortcut-staged' | 'bang-picker-staged';
		text: string;
	};
	type StatusHint = { key: string; label: string };
	type TokenCount = { count: number; href?: string; title?: string };

	let {
		textareaElement = $bindable(),
		value = $bindable(''),
		displayValue,
		countValue,
		previewSegments,
		statusHint,
		tokenCount,
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
		displayValue?: string;
		countValue?: string;
		previewSegments?: PreviewSegment[];
		statusHint?: StatusHint;
		tokenCount?: TokenCount;
		fullscreen?: boolean;
		wordwrap?: boolean;
		enterNewlineRestored?: boolean;
		enterNewlineFullscreen?: boolean;
		primaryAction?: Snippet;
		onprimaryaction?: () => void;
	} = $props();

	let textareaValue = $derived(displayValue ?? value);
	let measuredValue = $derived(countValue ?? value);
	let hasPreview = $derived(Boolean(previewSegments?.length));
	let lineCount = $derived(measuredValue ? measuredValue.split('\n').length : 1);
	let wordCount = $derived(measuredValue.trim() ? measuredValue.trim().split(/\s+/).length : 0);
	let charCount = $derived(measuredValue.trim().length);
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
		if (displayValue === undefined) value = event.currentTarget.value;

		oninput?.(event);
		adjustHeight();
	}

	function handleKeydown(event: Parameters<KeyboardEventHandler<HTMLTextAreaElement>>[0]) {
		onkeydown?.(event);
		if (event.defaultPrevented) return;

		if (event.key === 'Enter') {
			event.preventDefault();

			if (enterNewline) {
				insertText('\n');
			} else {
				onprimaryaction?.();
			}

			return;
		}
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
	<div class="textarea-shell">
		{#if hasPreview}
			<div class="textarea-preview" aria-hidden="true">
				{#each previewSegments ?? [] as segment, index (`${index}-${segment.kind}`)}<span
						class:shortcut-staged={segment.kind === 'shortcut-staged'}
						class:bang-picker-staged={segment.kind === 'bang-picker-staged'}>{segment.text}</span
					>{/each}
			</div>
		{/if}

		<textarea
			rows="1"
			bind:this={textareaElement}
			class:previewing={hasPreview}
			value={textareaValue}
			oninput={handleInput}
			onkeydown={handleKeydown}
			{...props}></textarea>
	</div>

	<div class="status-bar">
		{#if statusHint}
			<div class="status-hint">
				<span class="status-key">{statusHint.key}</span>
				<span class="status-label">{statusHint.label}</span>
			</div>
		{:else}
			<div>
				<button class="secondary outline" onclick={() => (fullscreen = !fullscreen)}>
					{fullscreen ? 'Restore' : 'Fullscreen'}
				</button>
				<label title="wrap lines"
					><input type="checkbox" bind:checked={wordwrap} /> <b>wrap</b></label
				>
			</div>

			<div class="counts">
				{#if lineCount > 1}{lineCount}L{/if}
				{wordCount}w {charCount}c
				{#if tokenCount}
					{#if tokenCount.href}
						<a
							class="token-count"
							href={tokenCount.href}
							target="_blank"
							rel="noopener noreferrer"
							title={tokenCount.title ?? 'Open token counter'}>~{tokenCount.count}t</a
						>
					{:else}
						<span class="token-count" title={tokenCount.title ?? 'Estimated tokens'}
							>~{tokenCount.count}t</span
						>
					{/if}
				{/if}
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
		{/if}
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

	.grow-wrap:not(.fullscreen):focus-within {
		border-color: color-mix(in srgb, var(--nc-primary) 55%, var(--nc-border));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--nc-primary) 18%, transparent);
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

	.grow-wrap.fullscreen .textarea-shell {
		flex: 1;
		min-height: 0;
	}

	.grow-wrap.fullscreen textarea,
	.grow-wrap.fullscreen .textarea-preview {
		height: 100%;
	}

	.textarea-shell {
		position: relative;
	}

	textarea,
	.textarea-preview {
		flex: 1;
		width: 100%;
		margin: 0;
		padding-block: 0;
		padding-inline: var(--size-2);
		white-space: pre;
		overflow-x: auto;
		font-family: monospace;
		font-size: max(16px, 1rem);
		font-weight: normal;
		font-style: normal;
		font-kerning: none;
		font-variant-ligatures: none;
		letter-spacing: normal;
		word-spacing: normal;
		text-rendering: auto;
		border: none;
	}

	.textarea-preview {
		position: absolute;
		inset: 0;
		pointer-events: none;
		color: var(--nc-tx-1);
		overflow: hidden;
	}

	textarea {
		position: relative;
		background: transparent;
		resize: none;
	}

	textarea.previewing {
		color: rgb(0 0 0 / 1%);
		color: color-mix(in srgb, var(--nc-tx-1) 1%, transparent);
		caret-color: var(--nc-tx-1);
		-webkit-text-fill-color: transparent;
	}

	textarea:focus {
		border: none;
		box-shadow: none;
		outline: none;
	}

	.shortcut-staged {
		color: var(--nc-tx-2);
		font-weight: 500;
		opacity: 0.48;
		text-decoration: underline;
		text-decoration-color: currentColor;
		text-decoration-style: dotted;
	}

	.bang-picker-staged {
		color: color-mix(in srgb, var(--nc-primary) 78%, var(--nc-tx-1));
		background: color-mix(in srgb, var(--nc-primary) 10%, transparent);
		box-shadow: inset 0 -0.12em 0 color-mix(in srgb, var(--nc-primary) 36%, transparent);
	}

	.grow-wrap:not(.wordwrap) textarea,
	.grow-wrap:not(.wordwrap) .textarea-preview {
		padding-bottom: 0.75rem;
	}

	.grow-wrap.wordwrap textarea,
	.grow-wrap.wordwrap .textarea-preview {
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
		display: inline-flex;
		gap: 0.35rem;
		justify-content: center;
		white-space: nowrap;
	}

	.token-count {
		color: var(--nc-primary);
		font-weight: var(--font-weight-6);
		text-decoration: none;
	}

	a.token-count:hover,
	a.token-count:focus {
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	.status-hint {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--size-2);
	}

	.status-key {
		display: inline-grid;
		box-sizing: border-box;
		place-items: center;
		min-width: 2.6rem;
		height: 1.05rem;
		padding: 0 0.35rem;
		font-family: monospace;
		font-size: 0.68rem;
		font-weight: 700;
		line-height: 1;
		color: var(--nc-primary);
		background: color-mix(in srgb, var(--nc-primary) 10%, var(--nc-surface-2));
		border: 1px solid color-mix(in srgb, var(--nc-primary) 55%, var(--nc-border));
		border-radius: calc(var(--nc-radius) * 0.55);
	}

	.status-label {
		overflow: hidden;
		font-weight: var(--font-weight-6);
		text-overflow: ellipsis;
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

		.status-hint {
			flex: 1;
			gap: var(--size-1);
		}

		.status-key {
			min-width: 2.35rem;
			height: 1rem;
			font-size: 0.62rem;
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
