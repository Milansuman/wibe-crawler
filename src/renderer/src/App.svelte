<script lang="ts">
  import TitleBar from './components/TitleBar.svelte'
  import ScanHeader from './components/ScanHeader.svelte'
  import EmptyState from './components/EmptyState.svelte'
  import TabNavigation from './components/TabNavigation.svelte'
  import UrlsTab from './components/UrlsTab.svelte'
  import DomainsTab from './components/DomainsTab.svelte'
  import VulnerabilitiesTab from './components/VulnerabilitiesTab.svelte'
  import FormsTab from './components/FormsTab.svelte'
  import ApiCallsTab from './components/ApiCallsTab.svelte'
  import CookiesTab from './components/CookiesTab.svelte'
  import EmailsTab from './components/EmailsTab.svelte'
  import ReportSidebar from './components/ReportSidebar.svelte'
  import FormModal from './components/FormModal.svelte'
  import AssetsTab from './components/AssetsTab.svelte'
  import { onMount, onDestroy } from 'svelte'

  let isScanning = false
  let isAnalyzing = false
  let isExporting = false
  let showResults = false
  let selectedCrawledUrl = ''
  let crawledUrls = []
  let fullCrawlResults = []
  let discoveredUrls = []
  let crawlStatus = ''
  let allForms = []
  let allApiCalls = []
  let allCookies = []
  let allEmails = []
  let allAssets: Record<string, string[]> = {}
  let selectedForm = null
  let formData = {}
  let formResponse = null
  let isSubmittingForm = false
  let scannedBaseUrl = ''
  let isQuotaExhausted = false

  // Timing state
  let crawlDuration = 0
  let analysisDuration = 0
  let crawlTimer = null
  let analysisTimer = null

  let vulnerabilities = []

  let reportItems = []
  let activeTargetTab = 'urls'
  let discoveredDomains = []

  // Statistics
  $: totalUrls = crawledUrls.length + discoveredUrls.length
  $: assetsCount = Object.values(allAssets || {}).reduce(
    (acc: number, arr: any) => acc + (arr?.length || 0),
    0
  )
  $: critical = vulnerabilities.filter((v) => v.severity === 'critical').length
  $: high = vulnerabilities.filter((v) => v.severity === 'high').length
  $: medium = vulnerabilities.filter((v) => v.severity === 'medium').length
  $: low = vulnerabilities.filter((v) => v.severity === 'low').length

  // Progress calculations
  let maxScanProgress = 0
  let scanProgress = 0

  $: {
    // Calculate current progress
    const currentProgress =
      totalUrls > 0 ? Math.min((crawledUrls.length / totalUrls) * 100, 100) : 0
    // Only update if it's higher than our max (prevents drops when new URLs discovered)
    if (currentProgress > maxScanProgress) {
      maxScanProgress = currentProgress
    }
    scanProgress = maxScanProgress
  }

  // Set to 100% when scanning completes
  $: if (!isScanning && showResults && scanProgress < 100 && crawledUrls.length > 0) {
    scanProgress = 100
    maxScanProgress = 100
  }

  // Reset when starting a new scan
  $: if (isScanning && crawledUrls.length === 0) {
    scanProgress = 0
    maxScanProgress = 0
  }

  // Simulated analysis progress (since AI analysis is a single operation)
  let analysisProgress = 0
  let analysisInterval = null

  $: if (isAnalyzing && !analysisInterval) {
    // Don't reset if we're already at a high percentage
    if (analysisProgress < 10) {
      analysisProgress = 10
    }
    analysisInterval = setInterval(() => {
      if (analysisProgress < 90) {
        // Only increment, never decrement
        const increment = Math.random() * 10 + 5
        analysisProgress = Math.min(analysisProgress + increment, 90)
      }
    }, 400)
  } else if (!isAnalyzing && analysisInterval) {
    clearInterval(analysisInterval)
    analysisInterval = null
    // Set to 100% when complete and keep it there
    analysisProgress = 100
  }

  onMount(() => {
    if (window.api?.crawler) {
      window.api.crawler.onProgress((data) => {
        crawlStatus = `Crawling: ${data.currentUrl}`
        crawlDuration = data.duration || 0
        fullCrawlResults = data.results
        crawledUrls = data.results.map((r: any) => r.url)
        discoveredDomains = data.domains || []
        allForms = data.results.flatMap((r: any) => r.forms || [])
        allApiCalls = data.allApiCalls || []
        allCookies = data.allCookies || []
        allEmails = data.allEmails || []
        allAssets = data.allAssets || {}
        showResults = true
      })

      window.api.crawler.onUrlsDiscovered((data) => {
        discoveredUrls = data.urls || []
      })

      window.api.crawler.onComplete((data) => {
        isScanning = false
        if (crawlTimer) {
          clearInterval(crawlTimer)
          crawlTimer = null
        }
        crawlDuration = data.totalDuration || crawlDuration
        showResults = true
        crawlStatus = `Completed: ${data.totalUrlsCrawled} URLs crawled`
        fullCrawlResults = data.results
        crawledUrls = data.results.map((r: any) => r.url)
        discoveredDomains = data.domains || []
        allForms = data.results.flatMap((r: any) => r.forms || [])
        allApiCalls = data.allApiCalls || []
        allCookies = data.allCookies || []
        allEmails = data.allEmails || []
        allAssets = data.allAssets || {} // Set from IPC complete
        discoveredUrls = []
      })

      window.api.crawler.onError((error) => {
        console.error('Crawler error:', error)
        isScanning = false
        if (crawlTimer) {
          clearInterval(crawlTimer)
          crawlTimer = null
        }
        crawlStatus = `Error: ${error.message}`
      })

      if (window.api?.analyzer) {
        window.api.analyzer.onQuotaStatus((data) => {
          isQuotaExhausted = data.exhausted
        })
      }
    }
  })

  onDestroy(() => {
    if (window.api?.crawler) {
      window.api.crawler.removeAllListeners()
    }
    if (window.api?.analyzer) {
      window.api.analyzer.removeAllListeners()
    }
  })

  async function startScan(url, context = { cookies: [], localStorage: {} }) {
    console.log('App.startScan called with:', url)
    if (!url || isScanning) return

    try {
      isQuotaExhausted = false
      isScanning = true
      showResults = true
      crawledUrls = []
      fullCrawlResults = []
      discoveredUrls = []
      discoveredDomains = []
      allForms = []
      allApiCalls = []
      allCookies = []
      allEmails = []
      allAssets = {} // Reset on start
      vulnerabilities = []
      reportItems = []
      crawlStatus = 'Starting scan...'
      scannedBaseUrl = url
      crawlDuration = 0

      const startTime = Date.now()
      crawlTimer = setInterval(() => {
        crawlDuration = Date.now() - startTime
      }, 100)

      await window.api.crawler.startCrawl(url, context)
    } catch (error) {
      console.error('Failed to start scan:', error)
      isScanning = false
      crawlStatus = 'Failed to start scan'
    }
  }

  async function stopScan() {
    try {
      await window.api.crawler.stopCrawl()
      isScanning = false
      if (crawlTimer) {
        clearInterval(crawlTimer)
        crawlTimer = null
      }
      crawlStatus = 'Scan stopped'
    } catch (error) {
      console.error('Failed to stop scan:', error)
    }
  }

  function selectUrl(url) {
    selectedCrawledUrl = url
  }

  function addToReport(vuln) {
    if (!reportItems.find((item) => item.id === vuln.id)) {
      reportItems = [...reportItems, vuln]
    }
  }

  function removeFromReport(id) {
    reportItems = reportItems.filter((item) => item.id !== id)
  }

  async function exportReport() {
    if (vulnerabilities.length === 0 && fullCrawlResults.length === 0) return

    try {
      isExporting = true
      crawlStatus = 'Generating detailed report...'
      const response = await window.api.analyzer.generateReport({
        vulnerabilities: vulnerabilities.map((v) => ({
          id: v.id,
          title: v.name, // Map back to title for backend
          severity: v.severity,
          cwe: v.cwe, // Pass metadata if present
          cvss: v.cvss,
          references: v.references,
          description: v.description,
          recommendation: v.recommendation,
          affectedAssets: v.affectedAssets,
          type: 'Security Vulnerability', // Default type
          location: v.affectedAssets[0] || scannedBaseUrl
        })),
        data: {
          crawlResults: fullCrawlResults,
          allApiCalls,
          allCookies,
          allEmails,
          allAssets,
          discoveredDomains
        },
        url: scannedBaseUrl
      })

      if (response.success && response.report) {
        console.log('Report generated:', response.report)

        // Import PDF generator dynamically
        const { generateVulnerabilityPDF } = await import('./utils/pdfGenerator')

        // CRITICAL: Use the enriched vulnerabilities from backend, NOT reportItems
        // The backend has already enriched the data with CWE/CVSS/References
        generateVulnerabilityPDF(
          response.report, // Use the FULL enriched report from backend
          {
            targetUrl: scannedBaseUrl,
            scannedAt: new Date(),
            totalUrls: fullCrawlResults.length,
            totalForms: fullCrawlResults.reduce((sum, r) => sum + r.forms.length, 0),
            totalCookies: allCookies.length,
            totalApiCalls: allApiCalls.length
          }
        )

        crawlStatus = `PDF report exported successfully at ${new Date().toLocaleTimeString()}`
      } else {
        console.error('Report generation error:', response.error)
        crawlStatus = `Report generation failed: ${response.error}`
      }
    } catch (error) {
      console.error('Report generation failed:', error)
      crawlStatus = `Report generation failed: ${error.message}`
    } finally {
      isExporting = false
    }
  }

  function selectForm(form) {
    selectedForm = form
    formData = {}
    formResponse = null
    form.fields.forEach((field: any) => {
      formData[field.name] = field.value || ''
    })
  }

  async function submitForm() {
    if (!selectedForm) return

    try {
      isSubmittingForm = true
      const response = await window.api.crawler.submitForm({
        url: selectedForm.url,
        action: selectedForm.action,
        method: selectedForm.method,
        fields: formData
      })

      if (response.success) {
        formResponse = {
          error: response.result.error,
          status: response.result.status,
          headers: response.result.headers,
          body: response.result.body,
          html: response.result.html,
          finalUrl: response.result.finalUrl
        }
      } else {
        formResponse = {
          error: response.error,
          status: 0,
          headers: {},
          body: '',
          html: '',
          finalUrl: ''
        }
      }
    } catch (error) {
      formResponse = {
        error: error.message,
        status: 0,
        headers: {},
        body: '',
        html: '',
        finalUrl: ''
      }
    } finally {
      isSubmittingForm = false
    }
  }

  function closeFormModal() {
    selectedForm = null
    formData = {}
    formResponse = null
  }

  function handleTabChange(tab) {
    activeTargetTab = tab
  }
  async function analyzeVulnerabilities() {
    console.log('analyzeVulnerabilities called. State:', {
      isScanning,
      isAnalyzing,
      resultsLength: fullCrawlResults.length
    })
    if (isScanning || isAnalyzing || fullCrawlResults.length === 0) {
      console.log('Skipping analysis due to guard clause')
      return
    }

    try {
      isQuotaExhausted = false
      isAnalyzing = true
      analysisDuration = 0
      crawlStatus = 'Analyzing crawled data with AI...'

      const startTime = Date.now()
      analysisTimer = setInterval(() => {
        analysisDuration = Date.now() - startTime
      }, 100)

      const payload = {
        crawlResults: fullCrawlResults,
        allApiCalls,
        allCookies,
        allEmails,
        allAssets,
        discoveredDomains
        // We could also pass fuzz results if available
      }

      const response = await window.api.analyzer.analyzeVulnerabilities(payload)

      if (response.success && response.report) {
        if (analysisTimer) {
          clearInterval(analysisTimer)
          analysisTimer = null
        }
        analysisDuration = response.analysisDuration || analysisDuration

        vulnerabilities = response.report.vulnerabilities.map((v) => ({
          id: v.id || Math.random().toString(36).substr(2, 9),
          name: v.title,
          severity: v.severity,
          description: v.description,
          recommendation: v.recommendation,
          affectedAssets: v.affectedAssets || [],
          // Add size for grid view visualization
          size: v.severity === 'critical' ? 3 : v.severity === 'high' ? 2 : 1
        }))

        crawlStatus = `Analysis complete: Found ${vulnerabilities.length} vulnerabilities`
        activeTargetTab = 'vulnerabilities'
      } else {
        console.error('Analysis error:', response.error)
        crawlStatus = `Analysis error: ${response.error}`
      }
    } catch (error) {
      console.error('Analysis failed:', error)
      crawlStatus = 'Analysis failed'
    } finally {
      isAnalyzing = false
      if (analysisTimer) {
        clearInterval(analysisTimer)
        analysisTimer = null
      }
    }
  }
</script>

<div class="flex flex-col bg-black w-screen h-screen text-white text-sm">
  <TitleBar />

  <ScanHeader
    {isScanning}
    {isAnalyzing}
    {showResults}
    {crawlStatus}
    {totalUrls}
    {critical}
    {high}
    {medium}
    {low}
    {scanProgress}
    {analysisProgress}
    {crawlDuration}
    {analysisDuration}
    onStartScan={startScan}
    onStopScan={stopScan}
    onAnalyze={analyzeVulnerabilities}
  />

  {#if isQuotaExhausted}
    <div
      class="bg-yellow-600/20 border-b border-yellow-500/30 p-2 px-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <span class="text-lg animate-pulse">⚠️</span>
        <div class="flex flex-col">
          <span class="text-xs font-bold text-yellow-400 uppercase tracking-wider"
            >AI Quota Exhausted</span
          >
          <span class="text-[11px] text-yellow-200/70"
            >Your API limits have been reached. Analysis has stopped for this session. Please wait
            for your daily quota to reset or provide more keys.</span
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 flex overflow-hidden">
    <!-- Main Content Area -->
    <div class="flex-1 p-3 overflow-hidden">
      {#if !showResults}
        <EmptyState />
      {:else}
        <div class="h-full flex flex-col">
          <!-- Tab Navigation -->
          <TabNavigation
            activeTab={activeTargetTab}
            discoveredUrlsCount={discoveredUrls.length}
            formsCount={allForms.length}
            {assetsCount}
            apiCallsCount={allApiCalls.length}
            cookiesCount={allCookies.length}
            domainsCount={discoveredDomains.length}
            emailsCount={allEmails.length}
            onTabChange={handleTabChange}
          />

          <!-- Rate Limit Warning Banner -->
          {#if vulnerabilities.some((v) => v.id === 'rate_limit_exceeded')}
            {@const rateLimitVuln = vulnerabilities.find((v) => v.id === 'rate_limit_exceeded')}
            <div
              class="mt-3 mb-4 p-4 bg-yellow-950/30 border-l-4 border-yellow-500 border border-yellow-900/50 flex items-start gap-3"
            >
              <div class="text-2xl shrink-0">⚠️</div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-semibold text-yellow-300 mb-1">
                  {rateLimitVuln.name}
                </h3>
                <p class="text-xs text-yellow-200/80 leading-relaxed mb-2">
                  {rateLimitVuln.description}
                </p>
                <p class="text-xs text-yellow-400/60">
                  💡 {rateLimitVuln.recommendation}
                </p>
              </div>
            </div>
          {/if}

          <!-- Tab Content -->
          <div class="flex-1 overflow-y-auto">
            {#if activeTargetTab === 'urls'}
              <UrlsTab
                {crawledUrls}
                {discoveredUrls}
                selectedUrl={selectedCrawledUrl}
                onSelectUrl={selectUrl}
                baseUrl={scannedBaseUrl}
              />
            {:else if activeTargetTab === 'domains'}
              <DomainsTab {discoveredDomains} />
            {:else if activeTargetTab === 'vulnerabilities'}
              <VulnerabilitiesTab {vulnerabilities} onAddToReport={addToReport} />
            {:else if activeTargetTab === 'forms'}
              <FormsTab {allForms} onSelectForm={selectForm} />
            {:else if activeTargetTab === 'assets'}
              <AssetsTab {allAssets} />
            {:else if activeTargetTab === 'apiCalls'}
              <ApiCallsTab {allApiCalls} />
            {:else if activeTargetTab === 'cookies'}
              <CookiesTab {allCookies} />
            {:else if activeTargetTab === 'emails'}
              <EmailsTab {allEmails} />
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Report Sidebar -->
    {#if reportItems.length > 0}
      <ReportSidebar
        {reportItems}
        {isExporting}
        onRemoveFromReport={removeFromReport}
        onExportReport={exportReport}
      />
    {/if}
  </div>
</div>

<!-- Form Modal -->
<FormModal
  {selectedForm}
  {formData}
  {formResponse}
  {isSubmittingForm}
  onClose={closeFormModal}
  onSubmit={submitForm}
/>
