<script lang="ts">
  export let discoveredDomains

  $: domainCounts = discoveredDomains.reduce(
    (acc, domain) => {
      acc[domain] = (acc[domain] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  $: uniqueDomains = Object.entries(domainCounts).map(([domain, count]) => ({
    domain,
    count
  }))
</script>

<div>
  <div class="flex justify-between items-center mb-3">
    <h2 class="text-sm font-medium text-white">Discovered Domains ({uniqueDomains.length})</h2>
  </div>

  {#if uniqueDomains.length === 0}
    <!-- Empty State -->
    <div class="flex flex-col items-center justify-center py-12 px-4">
      <p class="text-sm text-gray-400">No domains discovered yet</p>
    </div>
  {:else}
    <div class="space-y-1">
      {#each uniqueDomains as { domain }}
        <div
          class="border border-gray-700 p-3 hover:bg-gray-900 cursor-pointer"
          role="button"
          tabindex="0"
          on:click={() => window.open(`https://${domain}`, '_blank')}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              window.open(`https://${domain}`, '_blank')
            }
          }}
        >
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-medium text-sm text-white">{domain}</h3>
            <span class="text-xs font-mono text-green-400">active</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
