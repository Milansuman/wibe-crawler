import { BrowserWindow, session } from 'electron'
import { fuzzer, FuzzResult } from './fuzzer'

export interface FormField {
  name: string
  type: string
  value?: string
  required: boolean
  placeholder?: string
}

export interface DetectedForm {
  id: string
  action: string
  method: string
  url: string
  fields: FormField[]
}

export interface ApiCall {
  id: string
  endpoint: string
  method: string
  params: string
  headers: Record<string, string>
  responseStatus?: number
  responseHeaders?: Record<string, string>
}

export interface CookieData {
  id: string
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
  expires?: number
}

export interface CrawlResult {
  url: string
  status: number
  title?: string
  links: string[]
  domains: string[]
  forms: DetectedForm[]
  apiCalls: ApiCall[]
  cookies: CookieData[]
  emails: string[]
  assets?: Record<string, string[]>
  error?: string
  fuzzResults?: FuzzResult[]
  responseHeaders?: Record<string, string>
  htmlSnippet?: string
}

export class WebCrawler {
  // Performance optimization constants
  private static readonly PARALLEL_LIMIT = 5 // Increased to 5
  private static readonly WINDOW_POOL_SIZE = 5 // Increased to 5
  private static readonly PAGE_TIMEOUT = 5000 // 5 seconds (reduced from 10s)
  
  private windowPool: { win: BrowserWindow; inUse: boolean }[] = [] // Pool of reusable windows with lock
  private activeApiCalls = new Map<number, ApiCall[]>() // webContentsId -> ApiCall[]
  private mainFrameStatus = new Map<number, number>() // webContentsId -> statusCode
  private mainFrameHeaders = new Map<number, Record<string, string>>() // webContentsId -> responseHeaders
  private crawledUrls = new Set<string>()
  private urlQueue: string[] = []
  private baseUrl: string = ''
  private results: CrawlResult[] = []
  private discoveredDomains = new Set<string>()
  private allApiCalls = new Map<string, ApiCall>()
  private allCookies = new Map<string, CookieData>()
  private allEmails = new Set<string>()
  private allAssets = new Map<string, Set<string>>()
  private onProgress?: (url: string, results: CrawlResult[]) => void
  private onUrlsDiscovered?: (urls: string[]) => void
  private stopped: boolean = false
  private context?: { cookies?: any[]; localStorage?: Record<string, string>; includeAssets?: boolean }
  private currentPartition: string
  private includeAssets: boolean

  constructor(
    context?: { cookies?: any[]; localStorage?: Record<string, string>; includeAssets?: boolean },
    onProgress?: (url: string, results: CrawlResult[]) => void,
    onUrlsDiscovered?: (urls: string[]) => void
  ) {
    this.context = context
    this.onProgress = onProgress
    this.onUrlsDiscovered = onUrlsDiscovered
    this.currentPartition = `persist:crawler-${Date.now()}`
    this.includeAssets = context?.includeAssets ?? true
  }

  async init(): Promise<void> {
    // Create window pool for faster crawling
    console.log(`[NativeCrawler] Initializing ${WebCrawler.WINDOW_POOL_SIZE} reusable windows...`)
    const ses = session.fromPartition(this.currentPartition)

    // SET SESSION-WIDE LISTENERS ONCE
    // 1. SELECTIVE RESOURCE BLOCKING for speed (keep CSS for security analysis, block fonts)
    ses.webRequest.onBeforeRequest((details, callback) => {
      try {
        const url = details.url.toLowerCase()
        let shouldBlock = 
          !!url.match(/\.(woff2?|ttf|eot|otf)$/i) || // Block fonts
          url.includes('fonts.googleapis') ||
          url.includes('fonts.gstatic') ||
          url.includes('/fonts/') ||
          url.includes('favicon') ||
          // Block Ads/Analytics
          !!url.match(/(google-analytics|googletagmanager|facebook\.net|doubleclick|fbevents|hotjar|clarity|segment|intercom)/i)

        // If assets are disabled, also block images and media
        if (!this.includeAssets) {
             shouldBlock = shouldBlock || 
                !!url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|mp4|webm|ogg|mp3|wav)$/i)
        }

        callback({ cancel: shouldBlock })
      } catch (err) {
        console.error('[SessionListener] Error in onBeforeRequest:', err)
        callback({ cancel: false })
      }
    })

    // 2. Global Network interception for API calls
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        try {
            const isApi = this.isApiEndpoint(details.url, details.method)
            if (isApi && details.webContentsId) {
                const apiCall: ApiCall = {
                    id: `api_${Math.random()}`,
                    endpoint: details.url,
                    method: details.method,
                    params: this.extractParams(details.url),
                    headers: details.requestHeaders
                }
                
                const pageApiCalls = this.activeApiCalls.get(details.webContentsId)
                if (pageApiCalls) {
                    pageApiCalls.push(apiCall)
                }
                this.allApiCalls.set(apiCall.id, apiCall)
                
                try {
                    this.discoveredDomains.add(new URL(details.url).hostname)
                } catch {}
            }
            callback({ cancel: false, requestHeaders: details.requestHeaders })
        } catch (err) {
            console.error('[SessionListener] Error in onBeforeSendHeaders:', err)
            callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
    })

    ses.webRequest.onCompleted((details) => {
        if (details.webContentsId) {
            if (details.resourceType === 'mainFrame') {
                this.mainFrameStatus.set(details.webContentsId, details.statusCode)
                // Capture response headers for security analysis
                if (details.responseHeaders) {
                    const headers: Record<string, string> = {}
                    for (const [key, value] of Object.entries(details.responseHeaders)) {
                        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
                    }
                    this.mainFrameHeaders.set(details.webContentsId, headers)
                }
            }
            
            const isApi = this.isApiEndpoint(details.url, details.method)
            if (isApi) {
                const pageApiCalls = this.activeApiCalls.get(details.webContentsId)
                if (pageApiCalls) {
                    const existing = pageApiCalls.find(a => a.endpoint === details.url)
                    if (existing) {
                        existing.responseStatus = details.statusCode
                        existing.responseHeaders = details.responseHeaders as any
                    }
                }
            }
        }
    })

    for (let i = 0; i < WebCrawler.WINDOW_POOL_SIZE; i++) {
        const win = new BrowserWindow({
            show: false,
            width: 1280,
            height: 800,
            webPreferences: {
                offscreen: false,
                partition: this.currentPartition,
                javascript: true,
                webSecurity: false
            }
        })
        this.windowPool.push({ win, inUse: false })
    }
  }

  /**
   * Get an available window from the pool, waiting if necessary
   */
  private async getWindow(): Promise<{ win: BrowserWindow; inUse: boolean } | undefined> {
    if (this.windowPool.length === 0) {
      throw new Error('Window pool not initialized')
    }

    // Attempt to find a free window
    let windowEntry = this.windowPool.find(e => !e.inUse)
    
    // If none free, wait until one becomes available
    while (!windowEntry && !this.stopped) {
        await new Promise(r => setTimeout(r, 100))
        windowEntry = this.windowPool.find(e => !e.inUse)
    }

    if (!windowEntry) return undefined // Crawler stopped
    
    windowEntry.inUse = true
    return windowEntry
  }

  async crawl(
    startUrl: string,
    maxPages: number = 50,
    _batchSize: number = 1 // Unused but kept for signature compatibility
  ): Promise<CrawlResult[]> {
    console.log(`Starting optimized native parallel crawl for ${startUrl}`)
    this.baseUrl = new URL(startUrl).origin
    this.urlQueue = [startUrl]
    this.crawledUrls.clear()
    this.results = []
    this.stopped = false
    this.discoveredDomains.clear()
    this.allEmails.clear()
    
    // Reset thread-safe tracking maps for this crawl session
    this.activeApiCalls.clear()
    this.mainFrameStatus.clear()

    if (this.context?.cookies) {
        const ses = session.fromPartition(this.currentPartition)
        for (const cookie of this.context.cookies) {
            try {
                const scheme = startUrl.startsWith('https') ? 'https://' : 'http://'
                const domain = cookie.domain || new URL(startUrl).hostname
                const url = scheme + domain.replace(/^\./, '') + (cookie.path || '/')
                await ses.cookies.set({
                    url,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path || '/',
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly
                })
            } catch (e) {
                console.error('Failed to set cookie', e)
            }
        }
    }

    // PARALLEL BATCH CRAWLING logic
    while (!this.stopped && this.urlQueue.length > 0 && this.crawledUrls.size < maxPages) {
      const batch: string[] = []
      while (batch.length < WebCrawler.PARALLEL_LIMIT && this.urlQueue.length > 0 && this.crawledUrls.size + batch.length < maxPages) {
        const url = this.urlQueue.shift()
        if (url && !this.crawledUrls.has(url)) {
          this.crawledUrls.add(url)
          batch.push(url)
        }
      }

      if (batch.length === 0) break

      console.log(`[NativeCrawler] Crawling batch of ${batch.length} pages in parallel...`)
      const batchResults = await Promise.allSettled(
        batch.map(url => this.crawlPage(url))
      )

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]
        if (result.status === 'fulfilled' && result.value) {
          this.results.push(result.value)
          
          const newLinks = result.value.links.filter(
            (link) =>
              !this.crawledUrls.has(link) &&
              !this.urlQueue.includes(link) &&
              this.isSameDomain(link)
          )

          if (newLinks.length > 0) {
            this.urlQueue.push(...newLinks)
            if (this.onUrlsDiscovered) {
              this.onUrlsDiscovered([...this.urlQueue])
            }
          }

          if (this.onProgress) {
            this.onProgress(result.value.url, [...this.results])
          }
        } else if (result.status === 'rejected') {
          console.error(`Failed to crawl ${batch[i]}:`, result.reason)
        }
      }

      if (this.stopped) break
    }

    return this.results
  }

  private async crawlPage(url: string): Promise<CrawlResult | undefined> {
    if (this.stopped) return undefined
    
    // Get window from pool (awaits if none free)
    const entry = await this.getWindow()
    if (!entry) return undefined // Crawler stopped

    const { win } = entry
    const wcId = win.webContents.id
    
    // Setup local collections for this load in the session maps
    const pageApiCalls: ApiCall[] = []
    this.activeApiCalls.set(wcId, pageApiCalls)
    this.mainFrameStatus.set(wcId, 0)

    try {
        console.log(`[NativeCrawler] Loading ${url}...`)
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Page load timeout')), WebCrawler.PAGE_TIMEOUT)
        )
        
        const loadPromise = win.loadURL(url, { 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            extraHeaders: 'Accept-Encoding: gzip, deflate'
        })
        
        await Promise.race([loadPromise, timeoutPromise]).catch(err => {
            console.warn(`[NativeCrawler] Warning for ${url}: ${err.message}`)
        })
        
        // Wait for JS execution and DOM to settle (Reduced to 400ms for speed)
        await new Promise(r => setTimeout(r, 400))

        // Stop any pending loading to ensure DOM is stable
        try { win.webContents.stop() } catch {}

        let data: any = { links: [], forms: [], emails: [], assets: {}, title: '' }
        
        try {
            const extractionScript = `
                (() => {
                    try {
                        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
                        const forms = Array.from(document.querySelectorAll('form')).map((form, index) => {
                            try {
                                const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
                                    name: input.name || input.id || 'field_' + Math.random().toString(36).substr(2, 9),
                                    type: input.type || input.tagName.toLowerCase(),
                                    value: input.value || '',
                                    required: input.hasAttribute('required'),
                                    placeholder: input.getAttribute('placeholder') || ''
                                }));
                                
                                return {
                                    id: 'form_' + index,
                                    action: form.action || window.location.href,
                                    method: form.method || 'get',
                                    url: window.location.href,
                                    fields: inputs
                                };
                            } catch (e) { return null; }
                        }).filter(f => f !== null);

                        const bodyText = document.body ? document.body.innerText : '';
                        const emails = (bodyText.match(/[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || []);
                        
                        let assets = {};
                        if (${this.includeAssets}) {
                            assets = {
                                images: Array.from(document.images).map(i => i.src),
                                videos: Array.from(document.querySelectorAll('video, source')).map(v => (v.src || v.currentSrc)).filter(s => s),
                                documents: Array.from(document.querySelectorAll('a[href]'))
                                     .map(a => a.href)
                                     .filter(href => href.match(/\\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|sql|txt|csv|json|xml)$/i)),
                                scripts: Array.from(document.scripts).filter(s => s.src).map(s => s.src)
                            };
                        }

                        const htmlSnippet = document.documentElement ? document.documentElement.outerHTML.substring(0, 1500) : '';
                        return { links, forms, emails, assets, title: document.title, htmlSnippet };
                    } catch (e) {
                        return null; // Signal failure to try fallback
                    }
                })()
            `
            data = await win.webContents.executeJavaScript(extractionScript)
            
            if (!data) throw new Error('Script returned null')

        } catch (scriptErr) {
            console.warn(`[NativeCrawler] Full extraction failed for ${url}, trying fallback...`)
            // Fallback: minimal extraction (just links)
            try {
                 const fallbackScript = `
                    (() => {
                        try {
                            return {
                                links: Array.from(document.querySelectorAll('a[href]')).map(a => a.href),
                                title: document.title,
                                forms: [], emails: [], assets: {}
                            }
                        } catch { return { links: [], title: '', forms: [], emails: [], assets: {} } }
                    })()
                `
                data = await win.webContents.executeJavaScript(fallbackScript)
            } catch (fallbackErr) {
                console.error(`[NativeCrawler] Fallback extraction also failed for ${url}`)
                // Use default empty data
            }
        }
        
        const title = data.title || ''
        
        // Aggregate findings
        if (data.assets) {
            for (const [key, urls] of Object.entries(data.assets)) {
                if (!this.allAssets.has(key)) this.allAssets.set(key, new Set())
                const set = this.allAssets.get(key)!
                ;(urls as string[]).forEach(u => set.add(u))
            }
        }

        if (data.emails) {
            (data.emails as string[]).forEach(e => this.allEmails.add(e))
        }

        // Cookies
        const cookies = await win.webContents.session.cookies.get({ url })
        const pageCookies = cookies.map(c => {
            const cd: CookieData = {
                id: 'cookie_' + Math.random().toString(36).substr(2, 9),
                name: c.name,
                value: c.value,
                domain: c.domain || '',
                path: c.path || '',
                secure: c.secure || false,
                httpOnly: c.httpOnly || false,
                expires: c.expirationDate
            }
            this.allCookies.set(cd.name + cd.domain, cd)
            return cd
        })
        
        const normalizedLinks = (data.links as string[])
            .map((link: string) => this.normalizeUrl(link))
            .filter((link: string) => link && this.isSameDomain(link))
            .filter((link: string, index: number, arr: string[]) => arr.indexOf(link) === index)

         // ACTIVE PROBING (Fuzzing)
         let fuzzResults: FuzzResult[] = []
         try {
            // 1. Fuzz Parameters (SQLi, XSS)
            if (url.includes('?')) {
                console.log(`[NativeCrawler] Fuzzing parameters for ${url}...`)
                const paramResults = await fuzzer.fuzzParameters(url)
                fuzzResults.push(...paramResults)
            }

            // 2. Check Sensitive Files (Only on home page or new subdomains)
            const urlObj = new URL(url)
            if (urlObj.pathname === '/' || urlObj.pathname === '' || this.crawledUrls.size === 1) {
                 console.log(`[NativeCrawler] Checking sensitive paths for ${urlObj.origin}...`)
                 const pathResults = await fuzzer.checkSensitivePaths(url)
                 fuzzResults.push(...pathResults)
            }
         } catch (fuzzErr) {
             console.error(`[NativeCrawler] Fuzzing failed for ${url}:`, fuzzErr)
         }

         return {
            url,
            status: this.mainFrameStatus.get(wcId) || 0,
            title,
            links: normalizedLinks,
            domains: Array.from(new Set(pageApiCalls.map(a => { try { return new URL(a.endpoint).hostname } catch { return '' } }).filter(h => h))),
            forms: data.forms || [],
            apiCalls: pageApiCalls,
            cookies: pageCookies,
            emails: Array.from(new Set(data.emails)) as string[],
            assets: data.assets || {},
            fuzzResults,
            responseHeaders: this.mainFrameHeaders.get(wcId) || {},
            htmlSnippet: data.htmlSnippet || ''
         }

    } catch (error) {
        console.error(`Native crawl error for ${url}:`, error)
        return {
            url,
            status: 0,
            error: error instanceof Error ? error.message : String(error),
            links: [],
            domains: [],
            forms: [],
            apiCalls: [],
            cookies: [],
            emails: []
        }
    } finally {
        // Release window back to pool
        entry.inUse = false
        // Cleanup tracking for this load
        this.activeApiCalls.delete(wcId)
        this.mainFrameStatus.delete(wcId)
        this.mainFrameHeaders.delete(wcId)
        try { win.webContents.stop() } catch {}
    }
  }

  // Helpers copied from original crawler
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      urlObj.hash = ''
      return urlObj.toString()
    } catch {
      return ''
    }
  }

  private isSameDomain(url: string): boolean {
    try {
      const urlObj = new URL(url)
      const baseUrlObj = new URL(this.baseUrl)
      const getMainDomain = (hostname: string): string => {
        const parts = hostname.split('.')
        if (parts.length >= 2) return parts.slice(-2).join('.')
        return hostname
      }
      return getMainDomain(urlObj.hostname) === getMainDomain(baseUrlObj.hostname)
    } catch {
      return false
    }
  }

  private isApiEndpoint(url: string, method: string): boolean {
     try {
       const urlObj = new URL(url)
       const path = urlObj.pathname.toLowerCase()
       const apiPatterns = ['/api/', '/rest/', '/graphql', '/v1/', '/v2/', '/v3/', '.json', '.xml']
       const hasApiPattern = apiPatterns.some(p => path.includes(p))
       const isApiMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || (method === 'GET' && hasApiPattern)
       return hasApiPattern || isApiMethod
     } catch { return false }
  }

  private extractParams(url: string): string {
    try {
      const u = new URL(url)
      const p = Array.from(u.searchParams.keys())
      return p.length > 0 ? p.join(', ') : 'none'
    } catch { return 'none' }
  }

  async close(): Promise<void> {
      this.stopped = true
  }

  public stop(): void {
    this.stopped = true
  }
  
  // Getters interface matching
   getAllDiscoveredDomains() { return Array.from(this.discoveredDomains) }
   getAllApiCalls() { return Array.from(this.allApiCalls.values()) }
   getAllCookies() { return Array.from(this.allCookies.values()) }
   getAllEmails() { return Array.from(this.allEmails) }
   getAllAssets() { 
       const r: any = {}
       for(const [k,v] of this.allAssets) r[k] = Array.from(v)
       return r 
   }

   async submitForm(_formData: any): Promise<any> {
       // Similar to crawlPage but form submission
       // For now returning error to unblock basic crawl
       return { success: false, error: 'Form submission not ported to native crawler yet' }
   }
}
