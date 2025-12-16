import puppeteer, { Browser } from "puppeteer";

export async function initializeCrawler(url?: string) {
  return await puppeteer.launch();
}

export async function getUrlsFromPage(browser: Browser, url: string){
  const page = await browser.newPage()

  await page.goto(url, {
    waitUntil: "domcontentloaded"
  });

  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll("a");
    const urlSet = new Set<string>();

    for(const anchorNode of anchors){
      urlSet.add(anchorNode.href);
    }

    return Array.from(urlSet);
  })

  await page.close();

  return links
}

export async function getSubdomainsFromPage(browser: Browser, url: string, baseDomain: string) {
  const page = await browser.newPage();
  
  await page.goto(url, {
    waitUntil: "domcontentloaded"
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
}

export async function getEmailsFromPage(browser: Browser, url: string) {
  const page = await browser.newPage();
  
  await page.goto(url, {
    waitUntil: "domcontentloaded"
  });

  const emails = await page.evaluate(() => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = document.body.innerText;
    const matches = bodyText.match(emailRegex);
    
    return matches ? Array.from(new Set(matches)) : [];
  });

  await page.close();
  
  return emails;
}

