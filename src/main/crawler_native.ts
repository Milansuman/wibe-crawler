
import { BrowserWindow, session } from 'electron'

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
}

export class WebCrawler {
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
  private context?: { cookies?: any[]; localStorage?: Record<string, string> }
  private currentPartition: string
  private pathVisitCount = new Map<string, number>()
  private MAX_PATH_VISITS = 5 // Max variations of same path with different queries

  constructor(
    context?: { cookies?: any[]; localStorage?: Record<string, string> },
    onProgress?: (url: string, results: CrawlResult[]) => void,
    onUrlsDiscovered?: (urls: string[]) => void
  ) {
    this.context = context
    this.onProgress = onProgress
    this.onUrlsDiscovered = onUrlsDiscovered
    this.currentPartition = `persist:crawler-${Date.now()}`
  }

  async init(): Promise<void> {
    // No-op for now, window is created per page or reused
  }

  async crawl(
    startUrl: string,
    maxPages: number = 50,
    batchSize: number = 5 // Default to parallel batching
  ): Promise<CrawlResult[]> {
    console.log(`Starting native crawl for ${startUrl}`)
    this.baseUrl = new URL(startUrl).origin
    this.urlQueue = [startUrl]
    this.crawledUrls.clear()
    this.results = []
    this.stopped = false
    this.discoveredDomains.clear()
    this.allEmails.clear()

    if (this.context?.cookies) {
        // Pre-set cookies in the session
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

    this.pathVisitCount.clear()

    while (!this.stopped && this.urlQueue.length > 0 && this.results.length < maxPages) {
      // Get a batch of URLs
      const batch: string[] = []
      while (batch.length < batchSize && this.urlQueue.length > 0 && (this.results.length + batch.length) < maxPages) {
        const nextUrl = this.urlQueue.shift()
        if (nextUrl && !this.crawledUrls.has(nextUrl) && this.shouldCrawl(nextUrl, true)) {
          this.crawledUrls.add(nextUrl)
          batch.push(nextUrl)
        }
      }

      if (batch.length === 0) {
        if (this.urlQueue.length === 0) break
        continue
      }

      console.log(`[NativeCrawler] Processing batch of ${batch.length} URLs (Total: ${this.results.length}/${maxPages})`)
      
      const batchPromises = batch.map(async (url) => {
        try {
          const isInitial = url === this.baseUrl
          let attempts = isInitial ? 2 : 1 // 1 initial + 1 retry for start URL
          let result: CrawlResult | undefined

          while (attempts > 0) {
            result = await this.crawlPage(url, isInitial ? 30000 : 10000)
            if (result && !result.error && result.status !== 0) break
            attempts--
            if (attempts > 0) {
              console.log(`[NativeCrawler] Initial page failed or timed out. Retrying... (${attempts} attempts left)`)
              await new Promise(r => setTimeout(r, 2000))
            }
          }

          if (result) {
            this.results.push(result)
            
            // Process links from this page
            const newLinks = result.links.filter(
              (link) =>
                !this.crawledUrls.has(link) &&
                !this.urlQueue.includes(link) &&
                this.isSameDomain(link) &&
                this.shouldCrawl(link)
            )

            if (newLinks.length > 0) {
              this.urlQueue.push(...newLinks)
              if (this.onUrlsDiscovered) {
                this.onUrlsDiscovered([...this.urlQueue])
              }
            }

            if (this.onProgress) {
              this.onProgress(result.url, [...this.results])
            }
          }
        } catch (e) {
          console.error(`Failed to crawl ${url}:`, e)
        }
      })

      await Promise.all(batchPromises)
      
      if (this.stopped) break
      await new Promise(r => setTimeout(r, 100))
    }

    return this.results
  }

  private async crawlPage(url: string, timeout: number = 10000): Promise<CrawlResult | undefined> {
    if (this.stopped) return undefined
    
    console.log(`[NativeCrawler] Crawling ${url}`)
    
    // Create window
    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: {
            offscreen: false, // true might cause rendering issues with some sites
            partition: this.currentPartition,
            javascript: true,
            webSecurity: false // allow mixed content
        }
    })

    const ses = win.webContents.session
    const pageApiCalls: ApiCall[] = []
    const apiDomains = new Set<string>()
    let responseStatus = 0
    let isCrashed = false

    // Handle crashes
    win.webContents.on('render-process-gone', (_event, details) => {
        console.error(`[NativeCrawler] Render process gone for ${url}:`, details.reason)
        isCrashed = true
    })

    win.webContents.on('unresponsive', () => {
        console.warn(`[NativeCrawler] Page unresponsive: ${url}`)
        isCrashed = true
        win.destroy()
    })

    // Network interception
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const isApi = this.isApiEndpoint(details.url, details.method)
        if (isApi) {
             const apiCall: ApiCall = {
                id: `api_${Math.random()}`,
                endpoint: details.url,
                method: details.method,
                params: this.extractParams(details.url),
                headers: details.requestHeaders
             }
             pageApiCalls.push(apiCall)
             this.allApiCalls.set(apiCall.id, apiCall)
             try {
                apiDomains.add(new URL(details.url).hostname)
                this.discoveredDomains.add(new URL(details.url).hostname)
             } catch {}
        }
        callback({ cancel: false, requestHeaders: details.requestHeaders })
    })

    ses.webRequest.onCompleted((details) => {
        if (details.resourceType === 'mainFrame' && details.url === url) {
            responseStatus = details.statusCode
        }
         const isApi = this.isApiEndpoint(details.url, details.method)
         if (isApi) {
             // update response status
             const existing = pageApiCalls.find(a => a.endpoint === details.url)
             if (existing) {
                 existing.responseStatus = details.statusCode
                 existing.responseHeaders = details.responseHeaders as any
             }
         }
    })

    try {
        // Add timeout to prevent HTTPS sites from hanging indefinitely
        const loadPromise = win.loadURL(url, { 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            extraHeaders: 'Accept-Encoding: gzip, deflate' // Enable compression for faster downloads
        })
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Page load timeout')), timeout)
        )
        
        let timedOut = false
        await Promise.race([loadPromise, timeoutPromise]).catch(err => {
            console.warn(`Timeout or error loading ${url}:`, err.message)
            if (err.message === 'Page load timeout') {
                timedOut = true
                try {
                    win.webContents.stop()
                } catch {}
            }
        })

        if (isCrashed) throw new Error('Render process crashed during load')
        
        // If we timed out and have no status yet, we might not have a page at all
        if (timedOut && responseStatus === 0) {
            console.warn(`[NativeCrawler] Skipping data extraction for ${url} due to total timeout`)
            return {
                url,
                status: 0,
                title: 'Timeout',
                links: [],
                domains: [],
                forms: [],
                apiCalls: pageApiCalls,
                cookies: [],
                emails: [],
                assets: { images: [], scripts: [], styles: [] }
            }
        }
        
        const title = win.getTitle()

        // Extract data using executeJavaScript
        const extractionScript = `
            (() => {
                const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
                
                const forms = Array.from(document.querySelectorAll('form')).map((form, index) => {
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
                });

                const emails = (document.body.innerText.match(/[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || []);
                
                // Assets
                 const assets = {
                    images: Array.from(document.images).map(i => i.src),
                    scripts: Array.from(document.scripts).filter(s => s.src).map(s => s.src),
                    styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)
                 };

                return { links, forms, emails, assets };
            })()
        `
        
        const extractionPromise = win.webContents.executeJavaScript(extractionScript)
        const extractionTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Extraction timeout')), 5000)
        )

        const data = await Promise.race([extractionPromise, extractionTimeout]).catch(err => {
            console.warn(`[NativeCrawler] Extraction failed/timed out for ${url}:`, err.message)
            return { links: [], forms: [], emails: [], assets: { images: [], scripts: [], styles: [] } }
        })

        if (isCrashed) throw new Error('Render process crashed during extraction')
        
        // Aggregate assets
        if (data.assets) {
            for (const [key, urls] of Object.entries(data.assets)) {
                if (!this.allAssets.has(key)) this.allAssets.set(key, new Set())
                const set = this.allAssets.get(key)!
                ;(urls as string[]).forEach(u => set.add(u))
            }
        }

        // Aggregate emails
        if (data.emails) {
            (data.emails as string[]).forEach(e => this.allEmails.add(e))
        }

        // Get cookies
        const cookies = await ses.cookies.get({ url })
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
            this.allCookies.set(cd.id, cd)
            return cd
        })
        
        // normalize links
         const normalizedLinks = (data.links as string[])
        .map((link: string) => this.normalizeUrl(link))
        .filter((link: string) => link && this.isSameDomain(link))
        .filter((link: string, index: number, arr: string[]) => arr.indexOf(link) === index)

         return {
            url,
            status: responseStatus,
            title,
            links: normalizedLinks,
            domains: Array.from(apiDomains),
            forms: data.forms,
            apiCalls: pageApiCalls,
            cookies: pageCookies,
            emails: Array.from(new Set(data.emails)) as string[],
            assets: data.assets
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
        win.destroy()
    }
  }

  // Helpers copied from original crawler
  private shouldCrawl(url: string, increment: boolean = false): boolean {
    try {
      const u = new URL(url)
      
      // Skip common non-HTML files
      const ext = u.pathname.split('.').pop()?.toLowerCase()
      const blockedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'mp3', 'pdf', 'zip', 'css', 'js', 'json', 'woff', 'woff2', 'ttf', 'otf']
      if (ext && blockedExtensions.includes(ext)) {
        return false
      }

      // Skip logout URLs to stay authenticated
      const path = u.pathname.toLowerCase()
      if (path.includes('/logout') || path.includes('/signout')) return false

      // Trap mitigation: limit variations of same path (ignore query for this check)
      const count = this.pathVisitCount.get(u.pathname) || 0
      if (count >= this.MAX_PATH_VISITS) {
        return false
      }
      
      if (increment) {
        this.pathVisitCount.set(u.pathname, count + 1)
      }

      return true
    } catch {
      return false
    }
  }

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
