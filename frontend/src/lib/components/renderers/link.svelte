<script lang="ts">
  const { href, text } = $props();
</script>

<a 
  {href} 
  class="text-primary hover:underline break-words" 
  target="_blank" 
  rel="noopener noreferrer"
>
  {text}
</a>
