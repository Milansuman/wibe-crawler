<script lang="ts">
  const { text, lang } = $props();
</script>

<pre class="max-w-full p-3 my-2 border border-border rounded-md overflow-x-auto bg-secondary text-xs min-h-32">
  <code class="text-foreground font-mono break-all whitespace-pre-wrap">{text}</code>
</pre>