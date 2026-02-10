
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
  private window: BrowserWindow | null = null
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
    batchSize: number = 1 // Force serial for stability
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

    while (!this.stopped && this.urlQueue.length > 0 && this.crawledUrls.size < maxPages) {
      const url = this.urlQueue.shift()
      if (!url || this.crawledUrls.has(url)) continue

      this.crawledUrls.add(url)
      
      try {
        const result = await this.crawlPage(url)
        if (result) {
            this.results.push(result)
            
            // Process links
            const newLinks = result.links.filter(
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
                  this.onProgress(result.url, [...this.results])
              }
        }
      } catch (e) {
          console.error(`Failed to crawl ${url}`, e)
      }

      if (this.stopped) break
      // Reduced delay for faster crawling (especially important for HTTPS)
      await new Promise(r => setTimeout(r, 200))
    }

    return this.results
  }

  private async crawlPage(url: string): Promise<CrawlResult | undefined> {
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
            setTimeout(() => reject(new Error('Page load timeout')), 10000) // 10 second timeout
        )
        
        await Promise.race([loadPromise, timeoutPromise]).catch(err => {
            console.warn(`Timeout or error loading ${url}:`, err.message)
            // Continue anyway, we may have partial content
        })
        
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
        
        const data = await win.webContents.executeJavaScript(extractionScript)
        
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

   async submitForm(formData: any): Promise<any> {
       // Similar to crawlPage but form submission
       // For now returning error to unblock basic crawl
       return { success: false, error: 'Form submission not ported to native crawler yet' }
   }
}
