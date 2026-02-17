<script lang="ts">
  export let activeTab
  export let discoveredUrlsCount = 0
  export let formsCount = 0
  export let assetsCount = 0
  export let apiCallsCount = 0
  export let cookiesCount = 0
  export let domainsCount = 0
  export let emailsCount = 0
  export let onTabChange

  const tabs = [
    { id: 'urls', label: 'URLs', showCount: true, count: discoveredUrlsCount },
    { id: 'domains', label: 'Domains', showCount: false, count: domainsCount },
    { id: 'vulnerabilities', label: 'Vulnerabilities', showCount: false },
    { id: 'forms', label: 'Forms', showCount: false, count: formsCount },
    { id: 'assets', label: 'Assets', showCount: false, count: assetsCount },
    { id: 'apiCalls', label: 'API Calls', showCount: false, count: apiCallsCount },
    { id: 'cookies', label: 'Cookies', showCount: false, count: cookiesCount },
    { id: 'emails', label: 'Emails', showCount: false, count: emailsCount }
  ]
</script>

<div class="flex border-b border-gray-800 mb-4">
  <button
    on:click={() => onTabChange('urls')}
    class="px-4 py-2 text-xs {activeTab === 'urls'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    URLs
    {#if discoveredUrlsCount > 0}
      <span class="ml-1 text-gray-500">({discoveredUrlsCount})</span>
    {/if}
  </button>
  <button
    on:click={() => onTabChange('domains')}
    class="px-4 py-2 text-xs {activeTab === 'domains'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Domains
  </button>
  <button
    on:click={() => onTabChange('vulnerabilities')}
    class="px-4 py-2 text-xs {activeTab === 'vulnerabilities'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Vulnerabilities
  </button>
  <button
    on:click={() => onTabChange('forms')}
    class="px-4 py-2 text-xs {activeTab === 'forms'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Forms
  </button>
  <button
    on:click={() => onTabChange('assets')}
    class="px-4 py-2 text-xs {activeTab === 'assets'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Assets
    {#if assetsCount > 0}
      <span class="ml-1 text-gray-500">({assetsCount})</span>
    {/if}
  </button>
  <button
    on:click={() => onTabChange('apiCalls')}
    class="px-4 py-2 text-xs {activeTab === 'apiCalls'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    API Calls
  </button>
  <button
    on:click={() => onTabChange('cookies')}
    class="px-4 py-2 text-xs {activeTab === 'cookies'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Cookies
  </button>
  <button
    on:click={() => onTabChange('emails')}
    class="px-4 py-2 text-xs {activeTab === 'emails'
      ? 'border-b-2 border-blue-500 text-white'
      : 'text-gray-400 hover:text-white'}"
  >
    Emails
  </button>
</div>
