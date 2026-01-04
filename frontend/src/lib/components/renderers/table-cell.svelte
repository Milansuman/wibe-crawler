<script lang="ts">
  const { text, isHeader } = $props();
</script>

{#if isHeader}
  <th class="px-4 py-2 text-left font-semibold bg-secondary">
    {text}
  </th>
{:else}
  <td class="px-4 py-2">
    {text}
  </td>
{/if}
