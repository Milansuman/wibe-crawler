import puppeteer, { Browser, Page, CookieParam } from "puppeteer";

export interface CrawlerOptions {
  cookies?: CookieParam[];
  localStorage?: Record<string, string>;
}

export interface NetworkRequest {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  headers?: Record<string, string>;
}

async function applyPageOptions(browser: Browser, page: Page, url: string, options?: CrawlerOptions) {
  // Set cookies if provided
  if (options?.cookies && options.cookies.length > 0) {
    const urlObj = new URL(url);
    const cookiesWithDomain = options.cookies.map(cookie => ({
      ...cookie,
      domain: cookie.domain || urlObj.hostname
    }));
    await browser.setCookie(...cookiesWithDomain);
  }

  // Navigate to page first for localStorage
  if (options?.localStorage) {
    // Navigate to the page domain to set localStorage
    const urlObj = new URL(url);
    await page.goto(`${urlObj.protocol}//${urlObj.host}`, { waitUntil: "domcontentloaded", timeout: 10000 });
    
    // Set localStorage items
    await page.evaluate((storage: Record<string, string>) => {
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, value);
      }
    }, options.localStorage);
  }
}

export async function initializeCrawler(url?: string) {
  try {
    return await puppeteer.launch();
  } catch (error) {
    console.error("Failed to initialize crawler:", error);
    throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getUrlsFromPage(browser: Browser, url: string, options?: CrawlerOptions){
  let page;
  try {
    page = await browser.newPage();

    await applyPageOptions(browser, page, url, options);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll("a");
      const urlSet = new Set<string>();

      for(const anchorNode of anchors){
        urlSet.add(anchorNode.href);
      }

      return Array.from(urlSet);
    });

    await page.close();

    return links;
  } catch (error) {
    console.error(`Failed to get URLs from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return [];
  }
}

export async function getSubdomainsFromPage(browser: Browser, url: string, baseDomain: string, options?: CrawlerOptions) {
  let page;
  try {
    page = await browser.newPage();
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const subdomains = await page.evaluate((base) => {
      const anchors = document.querySelectorAll("a");
      const subdomainSet = new Set<string>();
      
      for (const anchor of anchors) {
        try {
          const url = new URL(anchor.href);
          const hostname = url.hostname;
          
          // Check if hostname ends with base domain and has a subdomain
          if (hostname.endsWith(base) && hostname !== base) {
            const subdomain = hostname.replace(`.${base}`, '').replace(base, '');
            if (subdomain) {
              subdomainSet.add(hostname);
            }
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
      
      return Array.from(subdomainSet);
    }, baseDomain);

    await page.close();
    
    return subdomains;
  } catch (error) {
    console.error(`Failed to get subdomains from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return [];
  }
}

export async function getEmailsFromPage(browser: Browser, url: string, options?: CrawlerOptions) {
  let page;
  try {
    page = await browser.newPage();
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const emails = await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const bodyText = document.body.innerText;
      const matches = bodyText.match(emailRegex);
      
      return matches ? Array.from(new Set(matches)) : [];
    });

    await page.close();
    
    return emails;
  } catch (error) {
    console.error(`Failed to get emails from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return [];
  }
}

export async function getCookiesFromPage(browser: Browser, url: string, options?: CrawlerOptions) {
  let page;
  try {
    page = await browser.newPage();
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const cookies = await page.cookies();
    
    await page.close();
    
    return cookies;
  } catch (error) {
    console.error(`Failed to get cookies from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return [];
  }
}

export async function getNetworkRequestsFromPage(browser: Browser, url: string, options?: CrawlerOptions): Promise<NetworkRequest[]> {
  let page;
  try {
    page = await browser.newPage();
    
    const requests: NetworkRequest[] = [];
    const requestMap = new Map<string, NetworkRequest>();

    // Enable request interception to capture requests
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
      const req: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        headers: request.headers()
      };
      requestMap.set(request.url(), req);
      request.continue();
    });

    page.on('response', (response) => {
      const url = response.url();
      const existingReq = requestMap.get(url);
      if (existingReq) {
        existingReq.status = response.status();
      }
    });
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    // Wait a bit for any lazy-loaded resources
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Convert map to array
    requests.push(...Array.from(requestMap.values()));

    await page.close();
    
    return requests;
  } catch (error) {
    console.error(`Failed to get network requests from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return [];
  }
}

export async function getTitleFromPage(browser: Browser, url: string, options?: CrawlerOptions): Promise<string | null> {
  let page;
  try {
    page = await browser.newPage();
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const title = await page.evaluate(() => {
      return document.title || null;
    });

    await page.close();
    
    return title;
  } catch (error) {
    console.error(`Failed to get title from page ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return null;
  }
}

export async function getPageContent(browser: Browser, url: string, options?: CrawlerOptions): Promise<{ text: string; html: string; scripts: string[] } | null> {
  let page;
  try {
    page = await browser.newPage();
    
    await applyPageOptions(browser, page, url, options);
    
    await page.goto(url, {
      waitUntil: "networkidle2", // Wait for network to be idle
      timeout: 30000
    });

    // Wait additional time for React/SPA content to render
    await new Promise(resolve => setTimeout(resolve, 3000));

    const content = await page.evaluate(() => {
      // Extract all script content
      const scriptElements = Array.from(document.querySelectorAll('script'));
      const scripts = scriptElements
        .map(script => script.innerHTML)
        .filter(content => content.trim().length > 0);

      return {
        text: document.body.innerText || '',
        html: document.documentElement.outerHTML || '',
        scripts: scripts
      };
    });

    await page.close();
    
    return content;
  } catch (error) {
    console.error(`Failed to get page content from ${url}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Failed to close page:", closeError);
      }
    }
    return null;
  }
}

