<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
  import {Toaster} from "$lib/components/ui/sonner";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="h-screen w-screen p-4 bg-background text-foreground dark">
  <Toaster theme="dark"/>
	{@render children()}
</div>
