<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<style>
		body {
			background-color: #e6e6e6;
			background-image: radial-gradient(circle, #d2d2d2 1px, transparent 1px);
			background-size: 10px 10px;
			background-attachment: fixed;
			margin: 0;
		}
	</style>
</svelte:head>
<div class="min-h-screen w-full p-4">
	{@render children()}
	
</div>
