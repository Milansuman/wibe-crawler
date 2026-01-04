import { db } from "./db";
import { pages } from "./db/schema";
import { eq } from "drizzle-orm";
import { JSDOM } from "jsdom";

export interface PageContent {
  id: string;
  url: string;
  html: string | null;
  js: string | null;
}

/**
 * Save page content to the database
 */
export async function savePage(projectId: string, url: string, html: string, scripts: string[]): Promise<string> {
  const jsContent = scripts.join('\n\n// ===== SCRIPT SEPARATOR =====\n\n');
  console.log(`Saving page: ${url}`);
  // Check if page already exists
  const [existing] = await db.select()
    .from(pages)
    .where(eq(pages.url, url))
    .limit(1);

  if (existing) {
    // Update existing page
    await db.update(pages)
      .set({
        html: html,
        js: jsContent
      })
      .where(eq(pages.id, existing.id));
    
    return existing.id;
  } else {
    // Insert new page
    const result = await db.insert(pages)
      .values({
        projectId,
        url,
        html,
        js: jsContent
      })
      .returning({ id: pages.id });
    
    return result[0].id;
  }
}

/**
 * Get page content by URL
 */
export async function getPageByUrl(url: string): Promise<PageContent | null> {
  const [page] = await db.select()
    .from(pages)
    .where(eq(pages.url, url))
    .limit(1);

  return page || null;
}

/**
 * Query page DOM using CSS selector
 */
export async function queryPageDOM(url: string, selector: string): Promise<Array<{ tag: string; text: string; attributes: Record<string, string>; html: string }>> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.html) {
    return [];
  }

  const dom = new JSDOM(page.html);
  const document = dom.window.document;
  const elements = document.querySelectorAll(selector);
  
  const results = Array.from(elements).map(element => {
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }
    
    return {
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim() || '',
      attributes,
      html: element.outerHTML
    };
  });

  return results;
}

/**
 * Get all forms from a page
 */
export async function getPageForms(url: string): Promise<Array<{
  action: string;
  method: string;
  inputs: Array<{ name: string; type: string; value: string; required: boolean }>;
  html: string;
}>> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.html) {
    return [];
  }

  const dom = new JSDOM(page.html);
  const document = dom.window.document;
  const forms = document.querySelectorAll('form');
  
  return Array.from(forms).map(form => {
    const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
      name: input.getAttribute('name') || '',
      type: input.getAttribute('type') || 'text',
      value: (input as HTMLInputElement).value || input.getAttribute('value') || '',
      required: input.hasAttribute('required')
    }));

    return {
      action: form.action,
      method: form.method || 'GET',
      inputs,
      html: form.outerHTML
    };
  });
}

/**
 * Get all input fields from a page
 */
export async function getPageInputs(url: string): Promise<Array<{
  type: string;
  name: string;
  id: string;
  value: string;
  placeholder: string;
  required: boolean;
  context: string;
}>> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.html) {
    return [];
  }

  const dom = new JSDOM(page.html);
  const document = dom.window.document;
  const inputs = document.querySelectorAll('input, textarea, select');
  
  return Array.from(inputs).map(input => {
    // Get parent form or containing element for context
    const parent = input.closest('form') || input.parentElement;
    const context = parent ? parent.outerHTML.substring(0, 200) : '';

    return {
      type: input.getAttribute('type') || input.tagName.toLowerCase(),
      name: input.getAttribute('name') || '',
      id: input.getAttribute('id') || '',
      value: (input as HTMLInputElement).value || input.getAttribute('value') || '',
      placeholder: input.getAttribute('placeholder') || '',
      required: input.hasAttribute('required'),
      context
    };
  });
}

/**
 * Get script chunks with line numbers
 */
export async function getScriptChunk(url: string, startLine: number, endLine: number): Promise<string> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.js) {
    return '';
  }

  const lines = page.js.split('\n');
  const chunk = lines.slice(startLine - 1, endLine).join('\n');
  
  return chunk;
}

/**
 * Search for patterns in scripts
 */
export async function searchInScripts(url: string, pattern: string, isRegex: boolean = false): Promise<Array<{
  lineNumber: number;
  line: string;
  context: string;
}>> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.js) {
    return [];
  }

  const lines = page.js.split('\n');
  const results: Array<{ lineNumber: number; line: string; context: string }> = [];
  
  const matcher = isRegex ? new RegExp(pattern, 'gi') : null;

  lines.forEach((line, index) => {
    const matches = matcher 
      ? matcher.test(line)
      : line.toLowerCase().includes(pattern.toLowerCase());
    
    if (matches) {
      // Get 2 lines before and after for context
      const start = Math.max(0, index - 2);
      const end = Math.min(lines.length, index + 3);
      const context = lines.slice(start, end).join('\n');
      
      results.push({
        lineNumber: index + 1,
        line: line,
        context
      });
    }
  });

  return results;
}

/**
 * Get page metadata
 */
export async function getPageMetadata(url: string): Promise<{
  title: string;
  meta: Record<string, string>;
  headers: Array<{ level: number; text: string }>;
  links: Array<{ href: string; text: string; rel?: string }>;
} | null> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.html) {
    return null;
  }

  const dom = new JSDOM(page.html);
  const document = dom.window.document;
  
  // Get meta tags
  const meta: Record<string, string> = {};
  document.querySelectorAll('meta').forEach(metaTag => {
    const name = metaTag.getAttribute('name') || metaTag.getAttribute('property') || '';
    const content = metaTag.getAttribute('content') || '';
    if (name && content) {
      meta[name] = content;
    }
  });

  // Get headers
  const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(header => ({
    level: parseInt(header.tagName[1]),
    text: header.textContent?.trim() || ''
  }));

  // Get links
  const links = Array.from(document.querySelectorAll('a')).map(link => ({
    href: link.href,
    text: link.textContent?.trim() || '',
    rel: link.getAttribute('rel') || undefined
  }));

  return {
    title: document.title,
    meta,
    headers,
    links
  };
}

/**
 * Get script statistics
 */
export async function getScriptStats(url: string): Promise<{
  totalLines: number;
  totalScripts: number;
  hasAPIKeys: boolean;
  hasConsoleLog: boolean;
  hasLocalStorage: boolean;
  hasCookieAccess: boolean;
  externalAPICalls: string[];
} | null> {
  const page = await getPageByUrl(url);
  
  if (!page || !page.js) {
    return null;
  }

  const lines = page.js.split('\n');
  const totalScripts = page.js.split('// ===== SCRIPT SEPARATOR =====').length;
  
  // Check for common patterns
  const jsContent = page.js.toLowerCase();
  const hasAPIKeys = /api[_-]?key|apikey|api_secret|access[_-]?token/.test(jsContent);
  const hasConsoleLog = jsContent.includes('console.log');
  const hasLocalStorage = /localstorage|sessionstorage/.test(jsContent);
  const hasCookieAccess = /document\.cookie|getcookie|setcookie/.test(jsContent);
  
  // Find external API calls
  const apiRegex = /(https?:\/\/[^\s'"]+)/g;
  const matches = page.js.match(apiRegex) || [];
  const externalAPICalls = Array.from(new Set(matches));

  return {
    totalLines: lines.length,
    totalScripts,
    hasAPIKeys,
    hasConsoleLog,
    hasLocalStorage,
    hasCookieAccess,
    externalAPICalls
  };
}
