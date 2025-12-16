<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="w-screen h-screen p-4" style="background-color: #e6e6e6; background-image: radial-gradient(circle, #d2d2d2 1px, transparent 1px); background-size: 10px 10px;">
	{@render children()}
	
</div>
