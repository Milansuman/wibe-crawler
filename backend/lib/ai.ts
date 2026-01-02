import { createGroq } from '@ai-sdk/groq';
import { streamText, CoreMessage, ToolSet, stepCountIs } from 'ai';
import { ModelMessage, ReasoningPart, ToolCallPart } from "@ai-sdk/provider-utils";
import { FilePart, ImagePart, TextPart } from "ai";
import { z } from "zod";
import puppeteer from 'puppeteer';
import { getUrlsFromPage, getSubdomainsFromPage, getEmailsFromPage, getCookiesFromPage, getNetworkRequestsFromPage, getPageContent } from './crawler';
import { savePage, queryPageDOM, getPageForms, getPageInputs, getScriptChunk, searchInScripts, getPageMetadata, getScriptStats } from './page-storage';

interface Message {
  role: "system" | "user" | "tool" | "assistant"
  text: string | null
  content: Array<TextPart | ReasoningPart> | null
}

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!
});

// Rough estimate: 1 token ≈ 4 characters, so 1000 tokens ≈ 4000 characters
const MAX_CHARACTERS = 4000;

function truncateResponse(data: any, maxChars: number = MAX_CHARACTERS): string {
  const jsonString = JSON.stringify(data);
  if (jsonString.length <= maxChars) {
    return jsonString;
  }
  
  // If it's an array, try to return fewer items
  if (Array.isArray(data)) {
    const truncatedArray = [];
    let currentLength = 2; // Account for []
    
    for (const item of data) {
      const itemString = JSON.stringify(item);
      if (currentLength + itemString.length + 1 <= maxChars) {
        truncatedArray.push(item);
        currentLength += itemString.length + 1; // +1 for comma
      } else {
        break;
      }
    }
    
    const result = {
      data: truncatedArray,
      truncated: true,
      totalItems: data.length,
      returnedItems: truncatedArray.length,
      message: `Response truncated. Showing ${truncatedArray.length} of ${data.length} items to stay within token limits.`
    };
    return JSON.stringify(result);
  }
  
  // For objects or strings, truncate directly
  const truncated = jsonString.substring(0, maxChars - 100);
  return JSON.stringify({
    data: truncated,
    truncated: true,
    message: "Response truncated to stay within token limits. Use more specific queries or filters."
  });
}

const mainSystemPrompt = `## Role
Expert security researcher & penetration tester specializing in web app security.

## Methodology
1. **Reconnaissance** – Gather URLs, subdomains, endpoints, cookies, and network requests.
2. **Save Page** – Always use **getPageContent** first to save page to database before analysis.
3. **Analyze** – Use targeted tools:  
   - \`getScriptStats\` / \`searchInScripts\` / \`getScriptChunk\` (JS analysis)  
   - \`getPageForms\` / \`getPageInputs\` (input discovery)  
   - \`queryPageDOM\` / \`getPageMetadata\` (page structure)
4. **Identify Attack Surface** – Input fields, auth endpoints, uploads, admin panels, exposed secrets.
5. **Test for Vulnerabilities** – Focus on:  
   - **Injection** (SQLi, XSS, command, template)  
   - **Auth & Access Control** (weak auth, IDOR, session issues)  
   - **Configuration** (security headers, cookie flags, exposed keys)  
   - **Business Logic** (rate limits, race conditions, validation flaws)
6. **Report** – For each finding: Vulnerability Type, Location, Severity, Evidence, Recommended Fix.

## Key Guidelines
- Always save page with \`getPageContent\` before deep analysis.
- Use specialized tools, not raw content retrieval.
- Prioritize by risk: authentication > injection > information disclosure.
- Verify findings; avoid disruption.
- Test only with explicit permission.

## Ethical Rules
- No DoS, no damage, no exfiltration of user data.
- Report responsibly.`

const tools: ToolSet = {
  findUrls: {
    description: "Tool to find all URLs/links present in a web page",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to crawl")
    }),
    execute: async ({url}) => {
      const browser = await puppeteer.launch();
      try {
        const urls = await getUrlsFromPage(browser, url);
        await browser.close();
        return truncateResponse(urls);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  findSubdomains: {
    description: "Tool to find all subdomains of a base domain from links in a web page",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to crawl"),
      baseDomain: z.string().describe("The base domain to search for subdomains (e.g., 'example.com')")
    }),
    execute: async ({url, baseDomain}) => {
      const browser = await puppeteer.launch();
      try {
        const subdomains = await getSubdomainsFromPage(browser, url, baseDomain);
        await browser.close();
        return truncateResponse(subdomains);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  findEmails: {
    description: "Tool to extract all email addresses from a web page's text content",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to search for emails")
    }),
    execute: async ({url}) => {
      const browser = await puppeteer.launch();
      try {
        const emails = await getEmailsFromPage(browser, url);
        await browser.close();
        return truncateResponse(emails);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  getCookies: {
    description: "Tool to retrieve all cookies set by a web page",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to get cookies from")
    }),
    execute: async ({url}) => {
      const browser = await puppeteer.launch();
      try {
        const cookies = await getCookiesFromPage(browser, url);
        await browser.close();
        return truncateResponse(cookies);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  getNetworkRequests: {
    description: "Tool to capture all network requests made by a web page, including APIs, resources, and third-party services",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to monitor network requests")
    }),
    execute: async ({url}) => {
      const browser = await puppeteer.launch();
      try {
        const requests = await getNetworkRequestsFromPage(browser, url);
        await browser.close();
        return truncateResponse(requests);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  getPageContent: {
    description: "Tool to retrieve and save the visible text content and HTML source code of a web page to the database. This crawls the page and stores it for later analysis. Use this first before using other page analysis tools.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the webpage to save")
    }),
    execute: async ({url}) => {
      const browser = await puppeteer.launch();
      try {
        const content = await getPageContent(browser, url);
        await browser.close();
        
        if (!content) {
          return JSON.stringify({ error: "Failed to get page content" });
        }
        
        // Save to database
        const pageId = await savePage(url, content.html, content.scripts);
        
        const result = { 
          success: true, 
          pageId,
          url,
          message: "Page saved to database. Use other tools to analyze specific parts of the page.",
          stats: {
            textLength: content.text.length,
            htmlLength: content.html.length,
            scriptCount: content.scripts.length
          }
        };

        console.log(result);

        return JSON.stringify(result);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  },
  queryPageDOM: {
    description: "Query saved page content using CSS selectors. Returns matching elements with their tag, text, attributes, and HTML. Use this to find specific elements like forms, buttons, divs, etc.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page"),
      selector: z.string().describe("CSS selector to query (e.g., 'form', 'input[type=password]', '.admin-panel', '#login-form')")
    }),
    execute: async ({url, selector}) => {
      const results = await queryPageDOM(url, selector);
      return truncateResponse(results);
    }
  },
  getPageForms: {
    description: "Get all forms from a saved page, including their action URLs, methods, and input fields. Essential for testing form-based vulnerabilities.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page")
    }),
    execute: async ({url}) => {
      const forms = await getPageForms(url);
      return truncateResponse(forms);
    }
  },
  getPageInputs: {
    description: "Get all input fields from a saved page including their types, names, values, and surrounding context. Useful for identifying injection points.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page")
    }),
    execute: async ({url}) => {
      const inputs = await getPageInputs(url);
      return truncateResponse(inputs);
    }
  },
  getScriptChunk: {
    description: "Get a specific chunk of JavaScript code from a saved page by line numbers. Use this to examine specific parts of scripts after finding interesting patterns.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page"),
      startLine: z.number().describe("Starting line number (1-based)"),
      endLine: z.number().describe("Ending line number (inclusive)")
    }),
    execute: async ({url, startLine, endLine}) => {
      const chunk = await getScriptChunk(url, startLine, endLine);
      // Limit script chunks to prevent excessive token usage
      if (chunk.length > MAX_CHARACTERS) {
        return JSON.stringify({
          data: chunk.substring(0, MAX_CHARACTERS),
          truncated: true,
          originalLength: chunk.length,
          message: `Script chunk truncated. Original had ${chunk.length} characters. Consider requesting a smaller line range.`
        });
      }
      return chunk;
    }
  },
  searchInScripts: {
    description: "Search for patterns in JavaScript code from a saved page. Returns matching lines with context. Use to find API keys, credentials, endpoints, etc.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page"),
      pattern: z.string().describe("Search pattern (string or regex pattern)"),
      isRegex: z.boolean().optional().describe("Whether the pattern is a regex (default: false)")
    }),
    execute: async ({url, pattern, isRegex}) => {
      const results = await searchInScripts(url, pattern, isRegex || false);
      return truncateResponse(results);
    }
  },
  getPageMetadata: {
    description: "Get page metadata including title, meta tags, headers (h1-h6), and links. Useful for understanding page structure and finding hidden endpoints.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page")
    }),
    execute: async ({url}) => {
      const metadata = await getPageMetadata(url);
      return truncateResponse(metadata);
    }
  },
  getScriptStats: {
    description: "Get statistics about JavaScript on a saved page: total lines, script count, presence of API keys, console logs, localStorage usage, cookie access, and external API calls.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the saved page")
    }),
    execute: async ({url}) => {
      const stats = await getScriptStats(url);
      return truncateResponse(stats);
    }
  }
}

export async function* streamAgentResponse(messages: Message[], url: string, projectId: string) {
  // Keep only recent messages to avoid context overflow
  const MAX_MESSAGES = 10;
  const recentMessages = messages.slice(-MAX_MESSAGES);
  
  const { fullStream } = streamText({
    model: groq("llama-3.3-70b-versatile"),
    system: `${mainSystemPrompt} website: ${url}`,
    messages: recentMessages.map((message) => {
      if (message.text) {
        return {
          role: message.role as "system" | "user" | "assistant",
          content: message.text
        }
      } else {
        return {
          role: message.role as "user" | "assistant" | "tool",
          content: message.content!
        }
      }
    }) as ModelMessage[],
    tools,
    stopWhen: stepCountIs(10)
  })

  for await (const chunk of fullStream) {
    switch (chunk.type) {
      case "text-delta":
        yield {
          type: "text",
          content: chunk.text
        }
        break;
      case "reasoning-delta":
        yield {
          type: "reasoning",
          content: chunk.text
        }
        break;
      case "tool-call":
        yield {
          type: "tool",
          content: chunk.toolName
        }
        break;
    }
  }
}
