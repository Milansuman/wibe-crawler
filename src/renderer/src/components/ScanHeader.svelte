<script lang="ts">
  export let isScanning
  export let showResults
  export let crawlStatus
  export let totalUrls
  export let critical
  export let high
  export let medium
  export let low
  export let onStartScan
  export let onStopScan
  export let onAnalyze
  export let isAnalyzing = false
  export let scanProgress = 0
  export let analysisProgress = 0

  let selectedUrl = 'https://'
  let mirrorEl
  let showUrlHint
  let showAdvanced = false
  let cookiesInput = ''
  let localStorageInput = ''
  let cookiesError = ''
  let localStorageError = ''
  let includeAssets = true

  $: prefixWidth = mirrorEl ? mirrorEl.offsetWidth : 0
  $: showUrlHint = selectedUrl === 'https://'

  function onUrlKeydown(e) {
    if (e.key === 'Enter' && selectedUrl && !isScanning) {
      e.preventDefault()
      handleStartScan()
    }
  }

  function handleStartScan() {
    if (selectedUrl && !isScanning) {
      // Fix potential double protocol issue
      let urlToScan = selectedUrl.trim()
      if (urlToScan.startsWith('https://http://')) {
        urlToScan = urlToScan.replace('https://http://', 'http://')
      } else if (urlToScan.startsWith('https://https://')) {
        urlToScan = urlToScan.replace('https://https://', 'https://')
      }

      cookiesError = ''
      localStorageError = ''

      let cookies = []
      let localStorage = {}

      if (cookiesInput.trim()) {
        try {
          const cookiePairs = cookiesInput
            .split(';')
            .map((pair) => pair.trim())
            .filter((pair) => pair)
          for (const pair of cookiePairs) {
            const equalIndex = pair.indexOf('=')
            if (equalIndex === -1) {
              cookiesError = 'Invalid cookie format. Use: name1=value1; name2=value2'
              return
            }
            const name = pair.substring(0, equalIndex).trim()
            const value = pair.substring(equalIndex + 1).trim()
            if (!name) {
              cookiesError = 'Cookie name cannot be empty'
              return
            }
            cookies.push({
              name,
              value,
              domain: new URL(selectedUrl).hostname,
              path: '/'
            })
          }
        } catch (error) {
          cookiesError = 'Failed to parse cookies'
          return
        }
      }

      if (localStorageInput.trim()) {
        const lines = localStorageInput.split('\n').filter((line) => line.trim())
        for (const line of lines) {
          const colonIndex = line.indexOf(':')
          if (colonIndex === -1) {
            localStorageError = 'Each line must be in format "Key: Value"'
            return
          }
          const key = line.substring(0, colonIndex).trim()
          const value = line.substring(colonIndex + 1).trim()
          if (!key) {
            localStorageError = 'Key cannot be empty'
            return
          }
          localStorage[key] = value
        }
      }
      console.log(cookies)

      onStartScan(urlToScan, { cookies, localStorage, includeAssets })
    }
  }
</script>

<div class="p-4 border-b border-gray-800">
  <div class="flex items-center justify-between mb-3">
    <h1 class="text-base font-medium">Wibe Crawler</h1>
    {#if showResults}
      <div class="flex gap-4 text-xs text-gray-400">
        <span>URLs: {totalUrls}</span>
        <span class="text-red-400">Critical: {critical}</span>
        <span class="text-orange-400">High: {high}</span>
        <span class="text-yellow-400">Medium: {medium}</span>
        <span class="text-blue-400">Low: {low}</span>
      </div>
    {/if}
  </div>

  <!-- Status Message with Loading Bar -->
  {#if isScanning && crawlStatus}
    <div class="mb-2">
      <div class="text-xs text-gray-400 flex items-center gap-1 mb-1.5">
        <span>{crawlStatus.replace(/\.\.\.$/, '')}</span>
        <span class="loading-dots inline-flex">
          <span>.</span><span>.</span><span>.</span>
        </span>
        <span class="ml-auto font-mono text-blue-400">{Math.round(scanProgress)}%</span>
      </div>
      <div class="w-full h-1 bg-gray-800 overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
          style="width: {scanProgress}%"
        ></div>
      </div>
    </div>
  {/if}

  {#if isAnalyzing}
    <div class="mb-2">
      <div class="text-xs text-purple-400 flex items-center gap-1 mb-1.5">
        <span>Analyzing with AI</span>
        <span class="loading-dots inline-flex">
          <span>.</span><span>.</span><span>.</span>
        </span>
        <span class="ml-auto font-mono">{Math.round(analysisProgress)}%</span>
      </div>
      <div class="w-full h-1 bg-gray-800 overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
          style="width: {analysisProgress}%"
        ></div>
      </div>
    </div>
  {/if}

  <div class="flex gap-2">
    <div class="relative flex-1">
      <span bind:this={mirrorEl} class="invisible absolute top-0 left-3 text-xs whitespace-pre"
        >{selectedUrl}</span
      >
      <input
        bind:value={selectedUrl}
        placeholder="https://example.com"
        class="w-full bg-transparent border border-gray-700 p-2 px-3 text-xs outline-none focus:border-gray-500"
        on:keydown={onUrlKeydown}
      />
      {#if showUrlHint}
        <span
          class="absolute top-1/2 -translate-y-1/2 text-xs text-gray-600 pointer-events-none"
          style={`left: ${prefixWidth + 12}px;`}>example.com</span
        >
      {/if}
    </div>
    <button
      on:click={() => (showAdvanced = !showAdvanced)}
      class="border border-gray-700 hover:border-gray-500 px-4 py-2 text-xs"
    >
      {showAdvanced ? 'Hide' : 'Advanced'}
    </button>
    <button
      on:click={handleStartScan}
      disabled={isScanning || isAnalyzing || !selectedUrl}
      class="border border-gray-700 hover:border-gray-500 disabled:border-gray-800 disabled:text-gray-600 px-4 py-2 text-xs"
    >
      {#if isScanning}
        <span class="inline-flex items-center gap-1">
          Scanning<span class="loading-dots inline-flex"
            ><span>.</span><span>.</span><span>.</span></span
          >
        </span>
      {:else}
        Scan
      {/if}
    </button>
    {#if showResults && !isScanning}
      <button
        on:click={onAnalyze}
        disabled={isAnalyzing}
        class="border border-purple-700 text-purple-300 hover:border-purple-500 hover:text-purple-200 disabled:border-gray-800 disabled:text-gray-600 px-4 py-2 text-xs"
      >
        {#if isAnalyzing}
          <span class="inline-flex items-center gap-1">
            Analyzing<span class="loading-dots inline-flex"
              ><span>.</span><span>.</span><span>.</span></span
            >
          </span>
        {:else}
          Analyze
        {/if}
      </button>
    {/if}
    {#if isScanning}
      <button
        on:click={onStopScan}
        class="border border-red-700 text-red-300 hover:border-red-500 hover:text-red-200 px-4 py-2 text-xs"
      >
        Stop
      </button>
    {/if}
  </div>

  {#if showAdvanced}
    <div class="mt-3 space-y-3 border-t border-gray-800 pt-3">
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs text-gray-400">Cookies (Cookie header value)</label>
          {#if cookiesError}
            <span class="text-xs text-red-400">{cookiesError}</span>
          {/if}
        </div>
        <textarea
          bind:value={cookiesInput}
          placeholder="session=abc123; auth_token=xyz789"
          class="w-full bg-transparent border border-gray-700 p-2 px-3 text-xs outline-none focus:border-gray-500 font-mono resize-none"
          rows="2"
        ></textarea>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs text-gray-400">LocalStorage (one per line: Key: Value)</label>
          {#if localStorageError}
            <span class="text-xs text-red-400">{localStorageError}</span>
          {/if}
        </div>
        <textarea
          bind:value={localStorageInput}
          placeholder="token: xyz789&#10;userId: 123"
          class="w-full bg-transparent border border-gray-700 p-2 px-3 text-xs outline-none focus:border-gray-500 font-mono resize-none"
          rows="3"
        ></textarea>
      </div>

      <div class="pt-2 border-t border-gray-800/50">
        <label
          class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none hover:text-gray-300 transition-colors"
        >
          <input type="checkbox" bind:checked={includeAssets} class="accent-blue-500 w-3 h-3" />
          <span>Include Assets (Images, Videos, Documents)</span>
        </label>
        <p class="text-[10px] text-gray-600 ml-5 mt-1">
          Uncheck to speed up crawling. Assets will not be downloaded or listed in results.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes dotPulse {
    0%,
    20% {
      opacity: 0.2;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.2;
    }
  }

  .loading-dots span {
    animation: dotPulse 1.4s infinite;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: 0s;
  }

  .loading-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .loading-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }
</style>
