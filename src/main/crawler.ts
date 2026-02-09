import puppeteer, { Browser } from 'puppeteer'

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
  private browser: Browser | null = null
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

  constructor(
    context?: { cookies?: any[]; localStorage?: Record<string, string> },
    onProgress?: (url: string, results: CrawlResult[]) => void,
    onUrlsDiscovered?: (urls: string[]) => void
  ) {
    this.context = context
    this.onProgress = onProgress
    this.onUrlsDiscovered = onUrlsDiscovered
  }

  async init(): Promise<void> {
    console.log('Initializing crawler...')
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--ignore-certificate-errors'
        ],
        defaultViewport: null,
        // @ts-ignore
        ignoreHTTPSErrors: true
      })
      console.log('Browser launched successfully')
    } catch (error) {
      console.error('Failed to launch browser:', error)
      throw error
    }
  }

  async crawl(
    startUrl: string,
    maxPages: number = 50,
    batchSize: number = 1
  ): Promise<CrawlResult[]> {
    console.log(`Starting crawl for ${startUrl} with batchSize ${batchSize}`)
    if (!this.browser) {
      await this.init()
    }

    this.baseUrl = new URL(startUrl).origin
    this.urlQueue = [startUrl]
    this.crawledUrls.clear()
    this.results = []
    this.stopped = false
    this.discoveredDomains.clear()
    this.allEmails.clear()

    while (!this.stopped && this.urlQueue.length > 0 && this.crawledUrls.size < maxPages) {
      console.log(this.urlQueue)

      // Get batch of URLs to crawl
      const batchUrls: string[] = []
      while (
        !this.stopped &&
        batchUrls.length < batchSize &&
        this.urlQueue.length > 0 &&
        this.crawledUrls.size + batchUrls.length < maxPages
      ) {
        const url = this.urlQueue.shift()
        if (url && !this.crawledUrls.has(url)) {
          batchUrls.push(url)
          this.crawledUrls.add(url)
        }
      }

      console.log('Batched urls', batchUrls)

      if (batchUrls.length === 0) break

      // Crawl batch simultaneously
      const batchPromises = batchUrls.map((url) => {
        console.log(`Processing URL: ${url}`)
        return this.crawlPage(url).catch(
          (error) =>
            ({
              url,
              status: 0,
              links: [],
              domains: [],
              forms: [],
              apiCalls: [],
              cookies: [],
              emails: [],
              assets: {},
              error: error instanceof Error ? error.message : 'Unknown error'
            }) as CrawlResult
        )
      })

      const batchResults = (await Promise.all(batchPromises)).filter(r => r !== undefined) as CrawlResult[]
      this.results.push(...batchResults)

      // Process all results to add new links to queue
      for (const result of batchResults) {
        if (result.links.length > 0) {
          const newLinks = result.links.filter(
            (link) =>
              !this.crawledUrls.has(link) &&
              !this.urlQueue.includes(link) &&
              this.isSameDomain(link)
          )

          if (newLinks.length > 0) {
            this.urlQueue.push(...newLinks)

            // Notify about newly discovered URLs
            if (this.onUrlsDiscovered) {
              this.onUrlsDiscovered([...this.urlQueue])
            }
          }
        }

        // Notify progress for each completed URL
        if (this.onProgress) {
          this.onProgress(result.url, [...this.results])
        }
      }

      // Small delay between batches to be respectful
      if (this.stopped) break
      await this.delay(200)
    }

    return this.results
  }

  private async crawlPage(url: string): Promise<CrawlResult | undefined> {
    if (!this.browser) {
      throw new Error('Browser not initialized')
    }

    if (this.stopped) {
      return {
        url,
        status: 0,
        title: undefined,
        links: [],
        domains: [],
        forms: [],
        apiCalls: [],
        cookies: [],
        emails: [],
        assets: {},
        error: 'Stopped'
      }
    }

    console.log(`[CRAWL_PAGE] 1. Starting for ${url}`)
    let page;
    try {
        console.log(`[CRAWL_PAGE] 2. Calling browser.newPage()`)
        page = await this.browser.newPage()
        console.log(`[CRAWL_PAGE] 3. browser.newPage() success`)
    } catch (e) {
        console.error(`[CRAWL_PAGE] browser.newPage() failed`, e)
        return undefined
    }

    const pageApiCalls: ApiCall[] = []
    const pageCookies: CookieData[] = []
    const apiDomains = new Set<string>()

    // Set cookies if provided
    // ... (keep existing cookie logic)

    /*
    // Listen to network requests to capture API calls to domains
    console.log(`[CRAWL_PAGE] 4. Setting request listener (DISABLED)`)
    // page.on('request', (request) => { ... })

    // Listen to responses to capture API response data
    console.log(`[CRAWL_PAGE] 5. Setting response listener (DISABLED)`)
    // page.on('response', (response) => { ... })
    */

    try {
      console.log('[CRAWL_PAGE] 6. start loading page: ', url)
      let response;
      try {
        response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        })
        console.log('[CRAWL_PAGE] 7. page.goto success')
      } catch (navError) {
        console.error('Navigation error:', navError)
        return undefined
      }
      console.log('stop loading page: ', url)

      if (!response) {
        throw new Error('Failed to load page')
      }

      // Set localStorage if provided
      if (this.context?.localStorage && Object.keys(this.context.localStorage).length > 0) {
        try {
          await page.evaluate((storage) => {
            for (const [key, value] of Object.entries(storage)) {
              localStorage.setItem(key, value)
            }
          }, this.context.localStorage)
        } catch (error) {
          console.error('Failed to set localStorage:', error)
        }
      }

      const title = await page.title()
      console.log(title)

      // Extract all links
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'))
        console.log(anchors)
        return anchors
          .map((anchor) => {
            const href = (anchor as HTMLAnchorElement).href
            return href
          })
          .filter((href) => {
            try {
              new URL(href)
              return true
            } catch {
              return false
            }
          })
      })

      console.log(links)

      // Extract all forms
      const forms = await page.evaluate((currentUrl) => {
        const formElements = Array.from(document.querySelectorAll('form'))
        return formElements.map((form, index) => {
          const action = form.action || currentUrl
          const method = form.method.toLowerCase() || 'get'

          const inputs = Array.from(form.querySelectorAll('input, textarea, select'))
          const fields = inputs
            .map((input) => {
              const element = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
              return {
                name:
                  element.name || element.id || `field_${Math.random().toString(36).substr(2, 9)}`,
                type: element.type || element.tagName.toLowerCase(),
                value: element.value || '',
                required: element.hasAttribute('required'),
                placeholder: element.getAttribute('placeholder') || ''
              }
            })
            .filter((field) => field.type !== 'submit' && field.type !== 'button')

          return {
            id: `form_${index}_${Math.random().toString(36).substr(2, 9)}`,
            action,
            method,
            url: currentUrl,
            fields
          }
        })
      }, url)

      // Get cookies from the page
      const cookies = await page.cookies()
      cookies.forEach((cookie) => {
        const cookieData: CookieData = {
          id: `cookie_${Math.random().toString(36).substr(2, 9)}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite as string,
          expires: cookie.expires
        }
        pageCookies.push(cookieData)
        this.allCookies.set(cookieData.id, cookieData)
        this.discoveredDomains.add(cookie.domain)
      })

      // Extract domains from links as well
      links.forEach((link) => {
        try {
          const linkUrl = new URL(link)
          this.discoveredDomains.add(linkUrl.hostname)
        } catch {
          // Ignore invalid URLs
        }
      })

      // Normalize and filter links
      const normalizedLinks = links
        .map((link) => this.normalizeUrl(link))
        .filter((link) => link && this.isSameDomain(link))
        .filter((link, index, arr) => arr.indexOf(link) === index) // Remove duplicates

      // Extract assets from the page
      const pageAssets = await page.evaluate(() => {
        const urls = new Set<string>()
        const push = (u?: string | null) => {
          if (u) {
            try {
              const abs = new URL(u, window.location.href).href
              urls.add(abs)
            } catch {
              /* ignore invalid url */
            }
          }
        }
        // Images
        Array.from(document.images).forEach((img) => push(img.src))
        // Scripts
        Array.from(document.querySelectorAll('script[src]')).forEach((s) =>
          push((s as HTMLScriptElement).src)
        )
        // Stylesheets
        Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).forEach((l) =>
          push((l as HTMLLinkElement).href)
        )
        // Media sources
        Array.from(document.querySelectorAll('video, audio, source')).forEach((m) => {
          const el = m as HTMLMediaElement & { src?: string }
          // @ts-ignore
          push(el.src)
        })
        // Downloadable anchors
        Array.from(document.querySelectorAll('a[href]')).forEach((a) => push((a as HTMLAnchorElement).href))
        return Array.from(urls)
      })

      const categorized: Record<string, string[]> = {}
      for (const u of pageAssets) {
        const cat = this.categorizeAsset(u)
        if (cat) {
          if (!categorized[cat]) categorized[cat] = []
          categorized[cat].push(u)
          if (!this.allAssets.has(cat)) this.allAssets.set(cat, new Set<string>())
          this.allAssets.get(cat)!.add(u)
        }
      }

      // Extract emails from page content
      const pageEmails = await page.evaluate(() => {
        const emailRegex = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
        const bodyText = document.body.innerText
        const matches = bodyText.match(emailRegex) || []
        return Array.from(new Set(matches)) // Remove duplicates
      })

      const pageEmailsSet = new Set(pageEmails)
      pageEmailsSet.forEach((email) => {
        this.allEmails.add(email)
      })

      return {
        url,
        status: response.status(),
        title,
        links: normalizedLinks,
        domains: Array.from(apiDomains),
        forms,
        apiCalls: pageApiCalls,
        cookies: pageCookies,
        emails: Array.from(pageEmailsSet),
        assets: categorized
      }
    } catch (error) {
      console.error(error)
    } finally {
      await page.close()
    }
    return undefined
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      // Remove fragment and normalize
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
        if (parts.length >= 2) {
          return parts.slice(-2).join('.')
        }
        return hostname
      }

      return getMainDomain(urlObj.hostname) === getMainDomain(baseUrlObj.hostname)
    } catch {
      return false
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getAllDiscoveredDomains(): string[] {
    return Array.from(this.discoveredDomains)
  }

  getAllApiCalls(): ApiCall[] {
    return Array.from(this.allApiCalls.values())
  }

  getAllCookies(): CookieData[] {
    return Array.from(this.allCookies.values())
  }

  getAllEmails(): string[] {
    return Array.from(this.allEmails)
  }

  getAllAssets(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [cat, set] of this.allAssets.entries()) {
      out[cat] = Array.from(set)
    }
    return out
  }

  private isApiEndpoint(url: string, method: string): boolean {
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname.toLowerCase()

      // Common API patterns
      const apiPatterns = ['/api/', '/rest/', '/graphql', '/v1/', '/v2/', '/v3/', '.json', '.xml']

      // Check if URL contains API patterns
      const hasApiPattern = apiPatterns.some(
        (pattern) => path.includes(pattern) || url.includes(pattern)
      )

      // Check HTTP methods typically used for APIs
      const isApiMethod =
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || (method === 'GET' && hasApiPattern)

      // Check content type headers would be ideal but not available in request event
      return hasApiPattern || isApiMethod
    } catch {
      return false
    }
  }

  private extractParams(url: string): string {
    try {
      const urlObj = new URL(url)
      const params = Array.from(urlObj.searchParams.keys())
      return params.length > 0 ? params.join(', ') : 'none'
    } catch {
      return 'none'
    }
  }

  private categorizeAsset(url: string): string | null {
    try {
      const u = new URL(url)
      const path = u.pathname.toLowerCase()
      if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)$/.test(path)) return 'images'
      if (/(\.pdf)$/.test(path)) return 'pdfs'
      if (/(\.css)$/.test(path)) return 'styles'
      if (/(\.js)$/.test(path)) return 'scripts'
      if (/(\.mp4|\.webm|\.ogg|\.mp3|\.wav)$/.test(path)) return 'media'
      if (/(\.doc|\.docx|\.xls|\.xlsx|\.ppt|\.pptx|\.txt|\.csv)$/.test(path)) return 'documents'
      return null
    } catch {
      return null
    }
  }

  async submitForm(formData: {
    url: string
    action: string
    method: string
    fields: Record<string, string>
  }): Promise<{
    status: number
    headers: Record<string, string>
    body: string
    html: string
    finalUrl: string
    error?: string
  }> {
    if (!this.browser) {
      await this.init()
    }

    const page = await this.browser!.newPage()

    // Set cookies if provided
    if (this.context?.cookies && this.context.cookies.length > 0) {
      try {
        await page.setCookie(...this.context.cookies)
      } catch (error) {
        console.error('Failed to set cookies:', error)
      }
    }

    try {
      // Navigate to the page containing the form
      await page.goto(formData.url, { waitUntil: 'domcontentloaded' })

      // Set localStorage if provided
      if (this.context?.localStorage && Object.keys(this.context.localStorage).length > 0) {
        try {
          await page.evaluate((storage) => {
            for (const [key, value] of Object.entries(storage)) {
              localStorage.setItem(key, value)
            }
          }, this.context.localStorage)
        } catch (error) {
          console.error('Failed to set localStorage:', error)
        }
      }

      // Fill the form fields
      for (const [fieldName, fieldValue] of Object.entries(formData.fields)) {
        try {
          const selector = `[name="${fieldName}"], #${fieldName}`
          await page.waitForSelector(selector, { timeout: 5000 })
          await page.type(selector, fieldValue)
        } catch (error) {
          console.warn(`Could not fill field ${fieldName}:`, error)
        }
      }

      // Submit the form and capture the response
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes(new URL(formData.action, formData.url).pathname) ||
            response.url() === formData.action
        ),
        page.evaluate((action) => {
          const form = Array.from(document.querySelectorAll('form')).find(
            (f) => f.action.includes(action) || f.action === action
          )
          if (form) {
            form.submit()
          } else {
            // Fallback: try to find and click submit button
            const submitBtn = document.querySelector(
              'input[type="submit"], button[type="submit"]'
            ) as HTMLElement
            if (submitBtn) submitBtn.click()
          }
        }, formData.action)
      ])

      console.log(response.status());
      const headers: Record<string, string> = response.headers()

      let body = ''
      try {
        body = await response.text()
      } catch (error) {
        // Handle preflight request error - likely a GET form with no response body
        if (formData.method.toUpperCase() === 'GET') {
          // Use fetch to GET the URL with search params
          const targetUrl = new URL(formData.action, formData.url)
          for (const [key, value] of Object.entries(formData.fields)) {
            targetUrl.searchParams.set(key, value)
          }

          const fetchResponse = await page.evaluate(async (url) => {
            const res = await fetch(url)
            const text = await res.text()
            const headersObj: Record<string, string> = {}
            res.headers.forEach((value, key) => {
              headersObj[key] = value
            })
            return {
              status: res.status,
              headers: headersObj,
              body: text,
              url: res.url
            }
          }, targetUrl.toString())

          await page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded' })
          const html = await page.content()

          return {
            status: fetchResponse.status,
            headers: fetchResponse.headers,
            body: fetchResponse.body,
            html,
            finalUrl: fetchResponse.url
          }
        }
        // If not a GET form, rethrow the error
        throw error
      }

      // Capture the resulting page HTML and final URL for rendering
      const html = await page.content()
      const finalUrl = page.url()

      return {
        status: response.status(),
        headers,
        body,
        html,
        finalUrl
      }
    } catch (error) {
      console.error(error);
      return {
        status: 0,
        headers: {},
        body: '',
        html: '',
        finalUrl: formData.action || formData.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      await page.close()
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  public stop(): void {
    this.stopped = true
  }
}
