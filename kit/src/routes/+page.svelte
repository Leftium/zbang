<script lang="ts">
	import AutogrowingTextarea from '$lib/components/AutogrowingTextarea.svelte'

	function oninput(this: HTMLTextAreaElement) {
		console.log('oninput', value)
	}

	function onfocus(this: HTMLTextAreaElement) {
		console.log('onfocus', value)
	}

	let value = $state('')
</script>

<article>
	<AutogrowingTextarea bind:value {oninput} {onfocus} />
</article>
