<script lang="ts">
	import { browser, dev } from '$app/environment'
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'

	import zbangs from '$lib/zbangs.json'

	import fuzzysort from 'fuzzysort'

	import _ from 'lodash'

	const FIXED_DIGITS = 2
	const VERBOSE = false

	let textareaElement = $state<HTMLTextAreaElement>()
	let inputHasFocus = $state(false)
	let value = $state('')

	// Committed value for search - delays update for potential shortcut keys
	let committedValue = $state('')
	let commitTimeout: ReturnType<typeof setTimeout> | null = null
	let pendingShortcutKey: string | null = null // Track if we're waiting to see if it's a shortcut
	const SHORTCUT_KEYS = new Set(['F', 'L', 'N', 'M', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', ' ', '.'])
	const COMMIT_DELAY = 250 // Match double-tap detection window

	let currentLineRaw = $derived(getCurrentLineValue(committedValue))
	// Normalize suffix bangs to prefix style: "g! " -> "!g ", "g!" -> "!g"
	let currentLine = $derived(currentLineRaw.replace(/\b([^\s!]+)!/g, '!$1'))

	let charCount = $derived(committedValue.trim().length)
	let wordCount = $derived(committedValue.split(/\S+/).length - 1)
	let lineCount = $derived(committedValue.split('\n').length)

	let fullscreen = $state(false)
	let wordwrap = $state(true)
	let theme = $state('')
	let enterNewlineRestored = $state(false)
	let enterNewlineFullscreen = $state(true)

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
	// Mobile sends '.' then ' ' separately instead of '. '
	let isMobilePeriodShortcut = $state(false)

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

	// Detect if user is typing a bang (e.g., "test query !g" or "test query !")
	// Single ! = no ! in query, double !! = include ! in query
	// Suffix style (g!) is normalized to prefix style (!g) in currentLine
	const bangSearchMatch = $derived(currentLine.match(/(!!?)([^\s]*)$/))

	const fuzzysortQuery = $derived.by(() => {
		// If typing a bang, search only the text after !
		if (bangSearchMatch) {
			const prefix = bangSearchMatch[1] // "!" or "!!"
			const bangQuery = bangSearchMatch[2] // "g", "goo", ""
			// !! keeps one ! in the query, single ! doesn't
			return prefix === '!!' ? '!' + bangQuery : bangQuery
		}

		let query = currentLine
		// Filter out completed bangs (e.g., "!g ", "!ddg ") so they don't affect search results
		query = query.replace(/![^\s]+\s+/g, '')
		// Handle URL search
		if (includeUrlKeys) {
			query = query.replace('//', '')
		}
		return query.trim()
	})

	// Extract bangs already used (completed with trailing space) in the current line
	// Suffix style (g!) is already normalized to prefix style (!g) in currentLine
	const usedBangs = $derived((currentLine.match(/![^\s]+(?=\s)/g) || []) as string[])

	// Increase limit to account for bangs that will be filtered out
	const adjustedFuzzysortLimit = $derived(fuzzysortLimit + usedBangs.length)

	const fuzzysortResults = $derived(
		fuzzysort.go(fuzzysortQuery, zbangsPrepared, {
			limit: adjustedFuzzysortLimit,
			threshold: fuzzysortThreshold,
			all: true,
			keys: fuzzysortKeys,
		})
	)

	const adjustedFuzzySortResults = $derived.by(() => {
		const ordered = _.orderBy(
			fuzzysortResults,
			[(r) => r.score > 0.95, (r) => r.score > 0.6, 'obj.rank', 'score'],
			['desc', 'desc', 'asc', 'desc']
		)
		// Filter out bangs that are already used in the current line
		return ordered.filter((result) => {
			const codes = result.obj.code.map((c) => c.target)
			return !codes.some((code) => usedBangs.includes(code))
		})
	})

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

	// Insert text at cursor position
	function insertTextAtCursor(text: string) {
		if (textareaElement) {
			const start = textareaElement.selectionStart
			const end = textareaElement.selectionEnd

			textareaElement.value =
				textareaElement.value.slice(0, start) + text + textareaElement.value.slice(end)
			textareaElement.setSelectionRange(start + text.length, start + text.length)
		}
	}

	// Simulate pressing '!'
	function simulateExclamation() {
		insertTextAtCursor('!')
	}

	function getCurrentLineValue(value: string) {
		if (!textareaElement) {
			return ''
		}

		const text = textareaElement.value
		const start = textareaElement.selectionStart
		const beforeCursor = text.substring(0, start)

		const lastNewlineBeforeCursor = beforeCursor.lastIndexOf('\n') + 1
		const nextNewlineAfterCursor = text.indexOf('\n', start)

		const lineStart = lastNewlineBeforeCursor
		const lineEnd = nextNewlineAfterCursor !== -1 ? nextNewlineAfterCursor : text.length

		return text.substring(lineStart, lineEnd)
	}

	function replaceCurrentLine(newText: string) {
		if (!textareaElement) {
			return
		}
		const text = textareaElement.value
		const start = textareaElement.selectionStart
		const end = textareaElement.selectionEnd
		const beforeCursor = text.substring(0, start)
		const afterCursor = text.substring(end)

		const lastNewlineBeforeCursor = beforeCursor.lastIndexOf('\n') + 1
		const nextNewlineAfterCursor = afterCursor.indexOf('\n') + end
		const lineStart = lastNewlineBeforeCursor
		const lineEnd = nextNewlineAfterCursor !== end - 1 ? nextNewlineAfterCursor : text.length

		textareaElement.value = text.substring(0, lineStart) + newText + text.substring(lineEnd)
		textareaElement.setSelectionRange(lineStart + newText.length, lineStart + newText.length)
	}

	function handleSearch() {
		blurInput()
		const trimmedValue = value.trimEnd()

		// Delay to let keyboard dismiss before opening new tab (Android fix)
		setTimeout(() => {
			// TODO: reduce delay after testing
			// Normalize suffix bangs to prefix style: "g! " -> "!g ", "yt!" -> "!yt"
			const normalized = trimmedValue.replace(/\b([^\s!]+)!/g, '!$1')

			// Extract all bangs (e.g., !g, !k) and the remaining query text
			const bangMatches = normalized.match(/![^\s]+/g) || []
			const queryText = normalized.replace(/![^\s]+\s*/g, '').trim()

			if (bangMatches.length > 1) {
				// Multiple bangs: open a separate tab for each bang with the query
				for (const bang of bangMatches) {
					const searchQuery = queryText ? `${bang} ${queryText}` : bang
					// Strip trailing newlines before submitting.
					// Need to insert space after first newline so triggers are not joined with other text.
					// Need to percent encode to preserve newlines.
					const encoded = encodeURIComponent(searchQuery.replace('\n', ' \n'))
					window.open(`https://kagi.com/search?q=${encoded}`, '_blank')
				}
			} else {
				// Single or no bang: send the entire query as-is (current behavior)
				// Strip trailing newlines before submitting.
				// Need to insert space after first newline so triggers are not joined with other text.
				// Need to percent encode to preserve newlines.
				const query = encodeURIComponent(trimmedValue.replace('\n', ' \n'))
				window.open(`https://kagi.com/search?q=${query}`, '_blank')
			}
		}, 300)
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			const hasModifier = event.shiftKey || event.altKey || event.ctrlKey
			const enterNewline = fullscreen ? enterNewlineFullscreen : enterNewlineRestored
			const shouldSubmit = enterNewline ? hasModifier : !hasModifier

			if (shouldSubmit) {
				handleSearch()
				event.preventDefault()
			}
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
			} else if (data?.toLowerCase() === inputHistory[1].data?.toLowerCase()) {
				doubleKeypress = inputHistory[1].data
			}
		}

		// Desktop sends '. ' as single event, mobile sends '.' then ' ' separately
		isPeriodShortcut = inputType === 'insertText' && data === '. '
		isMobilePeriodShortcut =
			inputType === 'insertText' && data === ' ' && inputHistory[1]?.data === '.'
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

		function commitValue() {
			if (commitTimeout) clearTimeout(commitTimeout)
			committedValue = value
		}

		function scheduleCommit() {
			if (commitTimeout) clearTimeout(commitTimeout)
			commitTimeout = setTimeout(commitValue, COMMIT_DELAY)
		}

		const anyPeriodShortcut = isPeriodShortcut || isMobilePeriodShortcut

		if (anyPeriodShortcut || doubleKeypress === ' ') {
			cancelDoubleKeypress()
			// Note: mobile period shortcut also only needs 2 backspaces ('. ')
			simulateExclamation()
			syncTextareaElementValue()

			inputHistory[0].data = '!'
			commitValue()
			return
		}

		if (doubleKeypress === 'F') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			fullscreen = !fullscreen
			commitValue()
			return
		}

		if (doubleKeypress === 'L') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			wordwrap = !wordwrap
			commitValue()
			return
		}

		if (doubleKeypress === 'N') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			if (fullscreen) {
				enterNewlineFullscreen = !enterNewlineFullscreen
			} else {
				enterNewlineRestored = !enterNewlineRestored
			}
			commitValue()
			return
		}

		if (doubleKeypress === '.' || doubleKeypress === 'M') {
			cancelDoubleKeypress()
			syncTextareaElementValue()
			handleSearch()
			commitValue()
			return
		}

		for (const [key, index] of Object.entries(doubleKeypressToFuzzySortIndex)) {
			if (doubleKeypress === key) {
				// Remove the double-typed chars first, then sync so fuzzy results update
				cancelDoubleKeypress()
				syncTextareaElementValue()

				// Now get the bang text based on updated search results
				const text = adjustedFuzzySortResults[index]?.obj.code[0].target
				if (text) {
					// Remove the search input that led to this result
					// If in bang mode, remove the full match (e.g., "!!wire"), otherwise just the query
					const charsToRemove = bangSearchMatch ? bangSearchMatch[0].length : fuzzysortQuery.length
					for (let i = 0; i < charsToRemove; i++) simulateBackspace()

					insertTextAtCursor(text + ' ')
					syncTextareaElementValue()
					inputHistory[0].data = '!'
				}
				commitValue()
				return
			}
		}

		// No shortcut triggered - check if this keystroke could be a shortcut
		// Only uppercase letters trigger shortcuts (except space and period)
		const lastKey = inputHistory[0]?.data
		if (lastKey && SHORTCUT_KEYS.has(lastKey)) {
			// First key of potential shortcut - delay commit
			pendingShortcutKey = lastKey
			scheduleCommit()
		} else if (pendingShortcutKey) {
			// Second key is different - not a shortcut, commit now
			pendingShortcutKey = null
			commitValue()
		} else {
			commitValue()
		}
	}

	const doubleKeypressToFuzzySortIndex = {
		Q: 0,
		W: 1,
		E: 2,
		R: 3,
		T: 4,
		Y: 5,
		U: 6,
		I: 7,
		O: 8,
		P: 9,
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
		const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
		document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light'
		localStorage.setItem('theme', theme)
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark'
		document.documentElement.dataset.theme = theme
		document.documentElement.style.colorScheme = theme
		localStorage.setItem('theme', theme)
	}

	if (browser) {
		// Dark/light mode:
		theme = localStorage.getItem('theme') || ''
		// svelte-ignore state_referenced_locally
		if (theme) {
			// svelte-ignore state_referenced_locally
			document.documentElement.dataset.theme = theme
		}


	}
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
		bind:wordwrap
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
				<label title="wrap lines"><input type="checkbox" bind:checked={wordwrap} /> <b>⏎</b></label>
			</div>
			<div>
				{#if lineCount > 1}{lineCount}L{/if}
				{wordCount}w {charCount}c
			</div>
			<div>
				{#if fullscreen}
					<label title="ENTER inserts newline (instead of submit)"
						><input
							type="checkbox"
							bind:checked={enterNewlineFullscreen}
							onmousedown={(e) => e.preventDefault()}
						/> <b>↵</b></label
					>
				{:else}
					<label title="ENTER inserts newline (instead of submit)"
						><input
							type="checkbox"
							bind:checked={enterNewlineRestored}
							onmousedown={(e) => e.preventDefault()}
						/> <b>↵</b></label
					>
				{/if}
				<button class="search" {onclick}>Search</button>
			</div>
		</status-bar>
	</AutogrowingTextarea>

	<content hidden={fullscreen}>
		<div class="result-count">Results: {fuzzysortResults.total}/{zbangs.length}</div>

		{#each adjustedFuzzySortResults as result, resultNum}
			{@const resultProcessed = process(result)}
			{@const keys = Object.keys(doubleKeypressToFuzzySortIndex)}
			<div class="result-item no-scores">
				<div class="score">{result[0].score.toFixed(FIXED_DIGITS)}</div>
				<div class="name-row">
					{#if keys[resultNum]}
						<div class="number-and-shortcut">
							<button class="outline">{keys[resultNum]}{keys[resultNum]}</button>
						</div>
					{/if}
					<div class="name">{@html result[0].highlight() || resultProcessed.object.name}</div>
					<div class="url">
						{@html (includeUrlKeys
							? result.at(-1)?.highlight()
							: resultProcessed.object.urls.s
						)?.replace(/^https?:\/\//, '') ?? ''}
					</div>
				</div>

				<div class="score">{resultProcessed.codeScoreMax?.toFixed(FIXED_DIGITS)}</div>
				<div class="triggers-row">
					<div class="triggers">
						{#each resultProcessed.codeScores as codeScore}
							<span title={codeScore.score?.toFixed(FIXED_DIGITS)}>{@html codeScore.html}</span
							>&nbsp;
						{/each}
					</div>
					<div class="score-and-rank">
						<b>r:</b>{resultProcessed.object.rank}
						<b>s:</b>{result.score.toFixed(FIXED_DIGITS)}
					</div>
				</div>

				{#if VERBOSE}
					{#each _.orderBy(resultProcessed.codeScores, ['score'], ['desc']) as codeScore}
						{@const hidden = codeScore.score === 0}
						<div class="score" {hidden}>{codeScore.score?.toFixed(FIXED_DIGITS)}</div>
						<div {hidden}>{@html codeScore.html}</div>
					{/each}
				{/if}

				<div class="score">{resultProcessed.tagsScoreMax?.toFixed(FIXED_DIGITS)}</div>
				<div>
					{#each resultProcessed.tagsScores as tagScore}
						<span title={tagScore.score.toFixed(FIXED_DIGITS)}>{@html tagScore.html}</span>&nbsp;
					{/each}
				</div>

				{#if VERBOSE}
					{#each _.orderBy(resultProcessed.tagsScores, ['score'], ['desc']) as tagScore}
						{@const hidden = tagScore.score === 0}
						<div class="score" {hidden}>{tagScore.score.toFixed(FIXED_DIGITS)}</div>
						<div {hidden}>{@html tagScore.html}</div>
					{/each}
				{/if}
			</div>
			<pre hidden>{JSON.stringify(resultProcessed, null, 4)}</pre>
		{/each}
	</content>
</main>

<style lang="scss">
	.result-count {
		text-align: right;
	}

	.result-item {
		display: grid;
		grid-template-columns: auto 1fr;
		overflow: hidden;
		margin-bottom: var(--size-3);
		justify-content: left;
		border: 1px solid var(--pico-muted-border-color);

		&.no-scores {
			grid-template-columns: 1fr;

			.score {
				display: none;
			}
		}

		.score-and-rank {
			text-align: end;
		}

		& > div {
			padding-inline: var(--size-1);

			// Internal borders:
			border-bottom: 1px solid var(--pico-muted-border-color);
			border-left: 1px solid var(--pico-muted-border-color);
			margin-left: -1px;
			margin-bottom: -1px;

			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}

		.name-row {
			display: flex;
			align-items: center;

			background-color: var(--pico-code-background-color);

			.number-and-shortcut {
				button {
					width: var(--size-7);
					padding: 0 calc(var(--size-1));
					margin-right: var(--size-2);

					font-family: monospace;
					font-size: calc(var(--font-size-0) * 0.9);
					font-weight: var(--font-weight-5);

					float: left;
				}
			}

			.name {
				flex-shrink: 0;
			}

			.url {
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				text-align: right;
				color: var(--pico-muted-color);
				margin-left: var(--size-2);
				font-size: var(--font-size-0);
				font-weight: var(--font-weight-3);

				:global(b) {
					color: var(--pico-color) !important;
					font-weight: var(--font-weight-6) !important;
				}
			}
		}

		.triggers-row {
			display: flex;
			align-items: center;

			.triggers {
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.score-and-rank {
				flex-shrink: 0;
				margin-left: auto;
				font-size: var(--font-size-0);
				font-weight: var(--font-weight-3);
			}
		}
	}

	main {
		padding: var(--size-1);

		header {
			display: flex;
			justify-content: space-between;
			align-items: start;
			width: 100%;

			span {
				font-size: var(--font-size-4);
				font-weight: var(--font-weight-9);
			}

			.brand-primary {
				color: hsl(15, 94%, 62%); // Svelte theme color
			}

			.brand-secondary {
				color: var(--gray-5);
			}

			.logo {
				color: #ff3e00; // Svelte logo color
			}
		}

		status-bar {
			display: flex;
			justify-content: space-between;
			align-items: center;

			font-size: var(--font-size-0);

			padding: 0.25rem var(--size-2);

			border-top: 1px solid var(--pico-form-element-border-color);

			button {
				align-self: center;

				padding: 0 calc(var(--size-1));
				margin: 0;

				font-size: calc(var(--font-size-0) * 0.9);
				font-weight: var(--font-weight-5);
			}

			> div {
				display: flex;
				align-items: center;
				flex: 1;

				&:nth-child(2) {
					justify-content: center;
				}

				&:last-child {
					justify-content: flex-end;
				}
			}

			label {
				display: inline-flex;
				align-items: center;
				gap: 0.25rem;
				margin: 0 0.5rem 0 0.5rem;
				padding: 0;
				font-size: calc(var(--font-size-0) * 0.9);

				input[type='checkbox'] {
					all: revert;
					width: 0.75rem;
					height: 0.75rem;
					margin: 0;
					vertical-align: middle;
				}
			}
		}

		button.theme {
			align-self: center;

			font-size: calc(var(--font-size-0));
			font-weight: var(--font-weight-5);
			padding: calc(var(--size-1));
			float: right;
		}

		pre {
			margin-top: var(--size-1);
		}
	}
</style>
