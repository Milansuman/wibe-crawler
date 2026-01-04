<script lang="ts">
  const { depth, text } = $props();
</script>

{#if depth === 1}
  <h1 class="text-xl font-bold break-words">{text}</h1>
{:else if depth === 2}
  <h2 class="text-lg font-semibold break-words">{text}</h2>
{:else if depth === 3}
  <h3 class="text-base font-semibold break-words">{text}</h3>
{:else if depth === 4}
  <h4 class="text-sm font-semibold break-words">{text}</h4>
{:else if depth === 5}
  <h5 class="text-sm font-medium break-words">{text}</h5>
{:else}
  <h6 class="text-xs font-medium break-words">{text}</h6>
{/if}
