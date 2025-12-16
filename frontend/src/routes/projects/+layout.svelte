<script lang="ts">
    import Header from "$lib/components/custom/header.svelte";
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="flex flex-col gap-6">
    <Header />
    {@render children()}
</div>
