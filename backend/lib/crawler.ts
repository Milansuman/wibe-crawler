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
    const urls = [];

    for(const anchorNode of anchors){
      urls.push(anchorNode.href);
    }

    return urls;
  })

  return links
}