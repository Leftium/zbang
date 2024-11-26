<script lang="ts">
	import { dev } from '$app/environment'
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'
	import { onMount } from 'svelte'

	import zbangs from '$lib/zbangs.json'

	import fuzzysort from 'fuzzysort'

	import _ from 'lodash'

	const FIXED_DIGITS = 3
	const VERBOSE = false

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

	const includeTagKeys = $derived(value.includes('#'))
	const includeUrlKeys = $derived(value.includes('//'))

	const fuzzysortKeys = $derived.by(() => {
		let keys = [
			'name',
			'code.0',
			'code.1',
			'code.2',
			'code.3',
			'code.4',
			'code.5',
			'code.6',
			'code.7',
			'code.8',
			'code.9',
		]

		if (includeTagKeys) {
			keys = keys.concat([
				'tags.0',
				'tags.1',
				'tags.2',
				'tags.3',
				'tags.4',
				'tags.5',
				'tags.6',
				'tags.7',
				'tags.8',
				'tags.9',
			])
		}

		if (includeUrlKeys) {
			keys.push('urls.s')
		}
		return keys
	})

	// if your targets don't change often, provide prepared targets instead of raw strings!
	const zbangsPrepared = [...zbangs].map((zbang) => ({
		...zbang,
		name: fuzzysort.prepare(zbang.name),
		code: zbang.code.map(fuzzysort.prepare),
		tags: zbang.tags.map(fuzzysort.prepare),
		urls: { s: fuzzysort.prepare(zbang.urls.s) },
	}))

	const fuzzysortThreshold = 0.7
	const fuzzysortLimit = 20

	let fuzzysortResults = $derived(
		fuzzysort.go(value, zbangsPrepared, {
			limit: fuzzysortLimit,
			threshold: fuzzysortThreshold,
			all: true,
			keys: fuzzysortKeys,
		})
	)

	function process(result: (typeof fuzzysortResults)[0]) {
		const object = {
			...result.obj,
			name: result.obj.name.target,
			code: result.obj.code.map((c) => c.target),
			tags: result.obj.tags.map((t) => t.target),
			urls: { s: result.obj.urls.s.target },
		}
		let codeScores: { html: string; score: number }[] = []
		let tagsScores: { html: string; score: number }[] = []
		_.forEach(fuzzysortKeys, (key, index) => {
			if (key === 'code.0') {
				codeScores = _.map(object.code, (code, offset) => {
					const score = result[index + offset]?.score
					const html = offset < 10 && score ? result[index + offset]?.highlight() : code

					return {
						html,
						score,
					}
				})
			}

			if (key === 'tags.0') {
				tagsScores = _.map(object.tags, (tag, offset) => {
					const score = result[index + offset]?.score
					const html = offset < 10 && score ? result[index + offset]?.highlight() : tag

					return {
						html,
						score,
					}
				})
			}
		})
		const codeScoreMax = _.maxBy(codeScores, 'score')?.score
		const tagsScoreMax = _.maxBy(tagsScores, 'score')?.score

		return {
			object,
			codeScores,
			codeScoreMax,
			tagsScores,
			tagsScoreMax,
		}
	}

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

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.shiftKey || event.altKey || event.ctrlKey)) {
			handleSearch()
			event.preventDefault()
		}
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

		function syncTextareaElementValue() {
			if (textareaElement) {
				value = textareaElement.value
			}
		}

		if (isPeriodShortcut || doubleKeypress === ' ') {
			cancelDoubleKeypress()
			simulateExclamation()
			syncTextareaElementValue()

			inputHistory[0].data = '!'
		}

		if (doubleKeypress === 'newline') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			handleSearch()
		}

		if (doubleKeypress === 'F') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			fullscreen = !fullscreen
		}
	}

	// Ensure textarea has focus on mousedown:
	function onmousedown(e: Event) {
		focusInput()

		const target = e.target as HTMLElement
		if (target.tagName !== 'TEXTAREA') {
			e.preventDefault()
		}
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
		{onkeydown}
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
		<div>Results: {fuzzysortResults.length}/{zbangs.length}</div>

		{#each _.orderBy(fuzzysortResults || [], [(r) => r.score > 0.95, (r) => r.score > 0.6, 'obj.rank', 'score'], ['desc', 'desc', 'asc', 'desc']).slice(0, 50) as result, resultNum}
			{@const resultProcessed = process(result)}
			{#if VERBOSE}
				<div class="score-and-rank">
					{resultNum + 1}
					<b>rank:</b>{resultProcessed.object.rank}
					<b>score:</b>{result.score.toFixed(FIXED_DIGITS)}
				</div>
			{/if}
			<div class="result-item">
				<div>{result[0].score.toFixed(FIXED_DIGITS)}</div>
				<div>{@html result[0].highlight() || resultProcessed.object.name}</div>

				<div>{resultProcessed.codeScoreMax?.toFixed(FIXED_DIGITS)}</div>
				<div>
					{#each resultProcessed.codeScores as codeScore}
						<span title={codeScore.score?.toFixed(FIXED_DIGITS)}>{@html codeScore.html}</span>&nbsp;
					{/each}
				</div>

				{#if VERBOSE}
					{#each _.orderBy(resultProcessed.codeScores, ['score'], ['desc']) as codeScore}
						{@const hidden = codeScore.score === 0}
						<div {hidden}>{codeScore.score?.toFixed(FIXED_DIGITS)}</div>
						<div {hidden}>{@html codeScore.html}</div>
					{/each}
				{/if}

				<div>{resultProcessed.tagsScoreMax?.toFixed(FIXED_DIGITS)}</div>
				<div>
					{#each resultProcessed.tagsScores as tagScore}
						<span title={tagScore.score.toFixed(FIXED_DIGITS)}>{@html tagScore.html}</span>&nbsp;
					{/each}
				</div>

				{#if VERBOSE}
					{#each _.orderBy(resultProcessed.tagsScores, ['score'], ['desc']) as tagScore}
						{@const hidden = tagScore.score === 0}
						<div {hidden}>{tagScore.score.toFixed(FIXED_DIGITS)}</div>
						<div {hidden}>{@html tagScore.html}</div>
					{/each}
				{/if}

				{#if includeUrlKeys}
					<div>{result.at(-1)?.score.toFixed(FIXED_DIGITS)}</div>
					<div>{@html result.at(-1)?.highlight()}</div>
				{/if}
			</div>
			<pre hidden>{JSON.stringify(resultProcessed, null, 4)}</pre>
		{/each}

		{#if dev && false}
			<pre>{JSON.stringify({ debugInfo }, null, 4)}</pre>
			<pre>{#each Array.from({ length: 99 }, (e, i) => i) as item}{item + '\n'}{/each}</pre>
		{/if}
	</content>
</main>

<style lang="scss">
	@use 'open-props-scss' as *;

	.score-and-rank {
		justify-self: right;
	}

	.result-item {
		display: grid;
		grid-template-columns: auto 1fr;
		margin-bottom: $size-5;
		justify-content: left;
		border: 1px solid lightgray;

		div {
			border-bottom: 1px solid #eee;
			border-left: 1px solid #eee;
			padding-inline: $size-1;

			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}
	}

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
