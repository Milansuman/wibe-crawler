<script lang="ts">
  const { children } = $props();
</script>

<div class="max-w-full overflow-x-auto my-4">
  <table class="min-w-full border border-border rounded-md text-sm">
    {@render children()}
  </table>
</div>
