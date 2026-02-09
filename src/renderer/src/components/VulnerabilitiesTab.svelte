<script lang="ts">
  export let vulnerabilities
  export let onAddToReport

  let viewMode: 'list' | 'grid' = 'list'

  function getSeverityColor(severity) {
    switch (severity) {
      case 'critical':
        return 'border-red-500/50 bg-red-950/20 shadow-red-900/10'
      case 'high':
        return 'border-orange-500/50 bg-orange-950/20 shadow-orange-900/10'
      case 'medium':
        return 'border-yellow-500/50 bg-yellow-950/20 shadow-yellow-900/10'
      case 'low':
        return 'border-blue-500/50 bg-blue-950/20 shadow-blue-900/10'
      case 'info':
        return 'border-sky-500/50 bg-sky-950/20 shadow-sky-900/10'
      default:
        return 'border-gray-500/50 bg-gray-950/20'
    }
  }

  function getSeverityBadgeColor(severity) {
    switch (severity) {
      case 'critical':
        return 'text-red-400 bg-red-950/50 border-red-900 ring-1 ring-red-900/50'
      case 'high':
        return 'text-orange-400 bg-orange-950/50 border-orange-900 ring-1 ring-orange-900/50'
      case 'medium':
        return 'text-yellow-400 bg-yellow-950/50 border-yellow-900 ring-1 ring-yellow-900/50'
      case 'low':
        return 'text-blue-400 bg-blue-950/50 border-blue-900 ring-1 ring-blue-900/50'
      case 'info':
        return 'text-sky-400 bg-sky-950/50 border-sky-900 ring-1 ring-sky-900/50'
      default:
        return 'text-gray-400 bg-gray-950/50 border-gray-800'
    }
  }
</script>

<div class="h-full flex flex-col">
  <div class="flex justify-between items-center mb-4 px-1">
    <div class="flex items-center gap-3">
      <h2 class="text-sm font-medium text-white flex items-center gap-2">
        Vulnerabilities
        <span class="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs font-mono"
          >{vulnerabilities.length}</span
        >
      </h2>
    </div>

    <div class="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-all {viewMode === 'list'
          ? 'bg-gray-700 text-white shadow-sm'
          : 'text-gray-400 hover:text-gray-300'}"
        on:click={() => (viewMode = 'list')}
      >
        List
      </button>
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-all {viewMode === 'grid'
          ? 'bg-gray-700 text-white shadow-sm'
          : 'text-gray-400 hover:text-gray-300'}"
        on:click={() => (viewMode = 'grid')}
      >
        Grid
      </button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto pr-2 pb-10">
    {#if viewMode === 'list'}
      <div class="flex flex-col gap-2">
        {#each vulnerabilities as vuln}
          <div
            class="group relative flex flex-col sm:flex-row gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/80 hover:border-gray-700 transition-all"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-4 mb-1">
                <h3
                  class="font-medium text-sm text-gray-200 truncate pr-2 group-hover:text-white transition-colors"
                >
                  {vuln.name}
                </h3>
                <span
                  class="shrink-0 text-[10px] font-mono uppercase px-2 py-0.5 rounded border {getSeverityBadgeColor(
                    vuln.severity
                  )}"
                >
                  {vuln.severity}
                </span>
              </div>
              <p class="text-gray-400 text-xs leading-relaxed line-clamp-2 mb-2">
                {vuln.description}
              </p>
              {#if vuln.location}
                <div
                  class="flex items-center gap-1.5 text-xs text-gray-500 font-mono overflow-hidden"
                >
                  <span class="shrink-0 text-gray-600">📍</span>
                  <span
                    class="truncate hover:text-gray-400 transition-colors cursor-help"
                    title={vuln.location}>{vuln.location}</span
                  >
                </div>
              {/if}
            </div>

            <div
              class="flex items-center sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-800 sm:border-l sm:pl-3"
            >
              <button
                on:click={() => onAddToReport(vuln)}
                class="w-full sm:w-auto px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-950/30 hover:bg-blue-950/50 border border-blue-900/50 hover:border-blue-800 rounded transition-all whitespace-nowrap"
              >
                Add to Report
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {#each vulnerabilities as vuln}
          <div
            class="flex flex-col p-4 rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg duration-200 {getSeverityColor(
              vuln.severity
            )}"
          >
            <div class="flex justify-between items-start gap-2 mb-3">
              <span
                class="shrink-0 text-[10px] font-bold font-mono uppercase tracking-wider px-2 py-1 rounded border {getSeverityBadgeColor(
                  vuln.severity
                )}"
              >
                {vuln.severity}
              </span>
            </div>

            <h3 class="font-semibold text-sm text-gray-100 mb-2 line-clamp-2 leading-snug">
              {vuln.name}
            </h3>

            <p class="text-gray-400 text-xs flex-1 leading-relaxed line-clamp-3 mb-4">
              {vuln.description}
            </p>

            <div
              class="mt-auto pt-3 border-t border-white/5 flex items-center justify-between gap-2"
            >
              {#if vuln.location}
                <span
                  class="text-[10px] text-gray-500 font-mono truncate max-w-[60%]"
                  title={vuln.location}
                >
                  {new URL(vuln.location).pathname}
                </span>
              {/if}
              <button
                on:click={() => onAddToReport(vuln)}
                class="ml-auto text-[10px] font-medium text-blue-400 hover:text-blue-300 hover:underline decoration-blue-400/30"
              >
                + Add Result
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
