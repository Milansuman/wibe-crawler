<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
  }

  let {
    children,
    class: className,
    orientation = "horizontal",
    decorative = false,
    ...restProps
  }: Props = $props();
</script>

<div
  role={decorative ? "none" : "separator"}
  aria-orientation={orientation}
  class="shrink-0 bg-border {orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'} {className}"
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</div>
