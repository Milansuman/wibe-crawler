<script lang="ts">
	import "./layout.css";
	import favicon from "$lib/assets/favicon.svg";
	import { Toaster } from "$lib/components/ui/sonner";
	import { ModeWatcher } from "mode-watcher";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="h-screen w-screen bg-background text-foreground overflow-hidden flex"
>
	<ModeWatcher />
	<Toaster />
	{@render children()}
</div>
