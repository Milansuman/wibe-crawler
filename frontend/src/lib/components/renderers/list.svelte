<script lang="ts">
  const { ordered, children } = $props();
</script>

{#if ordered}
  <ol class="list-decimal list-inside my-2 space-y-1 text-sm">
    {@render children()}
  </ol>
{:else}
  <ul class="list-disc list-inside my-2 space-y-1 text-sm">
    {@render children()}
  </ul>
{/if}
