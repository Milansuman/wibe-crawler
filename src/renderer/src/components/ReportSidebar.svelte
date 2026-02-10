<script lang="ts">
  export let reportItems
  export let onRemoveFromReport
  export let onExportReport
  export let isExporting = false

  function getSeverityColor(severity) {
    switch (severity) {
      case 'critical':
        return 'text-red-400'
      case 'high':
        return 'text-orange-400'
      case 'medium':
        return 'text-yellow-400'
      case 'low':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }
</script>

<div class="w-64 border-l border-gray-800 p-3 overflow-y-auto bg-gray-950/50">
  <!-- Header with Export Button -->
  <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-800">
    <div>
      <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Security Report</h2>
      <p class="text-[10px] text-gray-500 mt-0.5">
        {reportItems.length}
        {reportItems.length === 1 ? 'item' : 'items'}
      </p>
    </div>
    <button
      on:click={onExportReport}
      disabled={isExporting || reportItems.length === 0}
      class="px-3 py-1.5 text-xs font-medium border transition-all {isExporting
        ? 'border-green-900/50 bg-green-950/30 text-green-400 exporting-glow cursor-wait'
        : 'border-blue-900/50 bg-blue-950/30 text-blue-400 hover:bg-blue-950/50 hover:border-blue-800'} disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if isExporting}
        <span class="inline-flex items-center gap-1.5">
          <svg
            class="animate-spin h-3 w-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Generating
        </span>
      {:else}
        📄 Export PDF
      {/if}
    </button>
  </div>

  <!-- Export Progress -->
  {#if isExporting}
    <div class="mb-4 p-3 bg-green-950/20 border border-green-900/30">
      <div class="flex items-center gap-2 mb-2">
        <div class="text-sm text-green-400">⚡ Generating PDF Report</div>
      </div>
      <div class="w-full h-1 bg-gray-800 overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-green-600 to-green-400 animate-pulse"
          style="width: 100%"
        ></div>
      </div>
      <p class="text-[10px] text-gray-500 mt-2">
        Formatting {reportItems.length} vulnerabilities...
      </p>
    </div>
  {/if}

  <!-- Report Items -->
  <div class="space-y-2">
    {#if reportItems.length === 0}
      <div class="text-center py-12 px-4">
        <div class="text-3xl mb-2 opacity-30">📋</div>
        <p class="text-xs text-gray-500">No items added yet</p>
        <p class="text-[10px] text-gray-600 mt-1">Add vulnerabilities to generate a report</p>
      </div>
    {:else}
      {#each reportItems as item}
        <div
          class="border-l-2 border-gray-700 pl-3 py-2 bg-gray-900/30 hover:bg-gray-900/50 transition-colors slide-in"
        >
          <div class="flex justify-between items-start gap-2 mb-1">
            <h4 class="text-xs text-gray-200 font-medium leading-tight flex-1">{item.name}</h4>
            <button
              on:click={() => onRemoveFromReport(item.id)}
              class="text-gray-500 hover:text-red-400 text-xs transition-colors shrink-0"
              title="Remove from report"
            >
              ✕
            </button>
          </div>
          <span
            class="inline-block text-[10px] font-mono uppercase px-1.5 py-0.5 bg-gray-950/50 border border-gray-800 {getSeverityColor(
              item.severity
            )}"
          >
            {item.severity}
          </span>
          <p class="text-gray-500 text-[10px] mt-1.5 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  @keyframes pulse-glow {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .exporting-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .slide-in {
    animation: slide-up 0.3s ease-out;
  }
</style>
