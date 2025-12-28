<script lang="ts">
  import type {PageProps} from "./$types";

  const {data}: PageProps = $props();
</script>

<div class="flex flex-col gap-4 p-6">
  <div class="mb-4">
    <h2 class="text-2xl font-bold text-foreground">Emails</h2>
    <p class="text-sm text-muted-foreground mt-1">
      {data.emails.length} email{data.emails.length !== 1 ? 's' : ''} found
    </p>
  </div>

  {#if data.emails.length === 0}
    <div class="flex items-center justify-center p-12 border border-border rounded-lg bg-muted/20">
      <p class="text-muted-foreground">No emails found yet. Run a crawl to discover emails.</p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each data.emails as email}
        <div class="flex flex-col gap-2 p-4 border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="font-mono text-sm font-medium text-foreground break-all">
                {email.email}
              </div>
              <div class="text-xs text-muted-foreground mt-1 truncate">
                Found on: <a href={email.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{email.url}</a>
              </div>
            </div>
            <button
              onclick={() => navigator.clipboard.writeText(email.email)}
              class="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors whitespace-nowrap"
            >
              Copy
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
