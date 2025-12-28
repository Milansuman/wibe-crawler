<script lang="ts">
  import type {PageProps} from "./$types";

  const {data}: PageProps = $props();
</script>

<div class="flex flex-col gap-4 p-6">
  <div class="mb-4">
    <h2 class="text-2xl font-bold text-foreground">Cookies</h2>
    <p class="text-sm text-muted-foreground mt-1">
      {data.cookies.length} cookie{data.cookies.length !== 1 ? 's' : ''} found
    </p>
  </div>

  {#if data.cookies.length === 0}
    <div class="flex items-center justify-center p-12 border border-border rounded-lg bg-muted/20">
      <p class="text-muted-foreground">No cookies found yet. Run a crawl to discover cookies.</p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each data.cookies as cookie}
        <div class="flex flex-col gap-2 p-4 border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors">
          <div class="flex flex-col gap-3">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="font-mono text-sm font-semibold text-foreground break-all">
                  {cookie.name}
                </div>
                <div class="font-mono text-xs text-muted-foreground mt-1 break-all">
                  {cookie.value}
                </div>
              </div>
              <button
                onclick={() => navigator.clipboard.writeText(`${cookie.name}=${cookie.value}`)}
                class="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            
            <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {#if cookie.domain}
                <div class="flex items-center gap-1">
                  <span class="font-medium text-foreground">Domain:</span>
                  <span class="font-mono">{cookie.domain}</span>
                </div>
              {/if}
              {#if cookie.path}
                <div class="flex items-center gap-1">
                  <span class="font-medium text-foreground">Path:</span>
                  <span class="font-mono">{cookie.path}</span>
                </div>
              {/if}
            </div>

            <div class="text-xs text-muted-foreground truncate">
              Found on: <a href={cookie.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{cookie.url}</a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
