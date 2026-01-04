<script lang="ts">
  const { children } = $props();
</script>

<blockquote class="max-w-full border-l-4 border-primary pl-4 py-2 my-2 text-sm text-muted-foreground italic break-words">
  {@render children()}
</blockquote>
