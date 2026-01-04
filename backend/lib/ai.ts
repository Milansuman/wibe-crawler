import { createGroq } from '@ai-sdk/groq';
import { streamText, CoreMessage, ToolSet, stepCountIs } from 'ai';
import { ModelMessage, ReasoningPart, ToolCallPart } from "@ai-sdk/provider-utils";
import { FilePart, ImagePart, TextPart } from "ai";
import { z } from "zod";
import puppeteer from 'puppeteer';
import { getUrlsFromPage, getSubdomainsFromPage, getEmailsFromPage, getCookiesFromPage, getNetworkRequestsFromPage, getPageContent } from './crawler';
import { savePage, queryPageDOM, getPageForms, getPageInputs, getScriptChunk, searchInScripts, getPageMetadata, getScriptStats } from './page-storage';
import { db } from './db';
import { vulnerabilities } from './db/schema';

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
6. **Report** – For each finding, save the vulnerability using the \`saveVulnerability\` tool. also report the findings in detail to the user.

## Communication Rules
- **Always describe findings**: After using any tool, explicitly state what you found, including specific data, patterns, or evidence.
- **Always describe next steps**: Before using tools, explain exactly what you're going to do and why.
- **Never speculate**: Only report concrete findings based on tool results. Avoid "might be", "could be", "possibly" unless backed by evidence.
- **Always provide payloads**: When identifying vulnerabilities, always include specific test payloads, exploit examples, or proof-of-concept code.
- **Be explicit**: State exact URLs, parameters, line numbers, code snippets, and technical details.

## Key Guidelines
- Always save page with \`getPageContent\` before deep analysis.
- Use specialized tools, not raw content retrieval.
- Prioritize by risk: authentication > injection > information disclosure.
- Verify findings; avoid disruption.
- Test only with explicit permission.
- Save the vulnerability as soon as you find it.

## Ethical Rules
- No DoS, no damage, no exfiltration of user data.
- Report responsibly.`

/**
 * Parse Cookie header format into puppeteer CookieParam array
 * @param cookieHeader Cookie header value (e.g., "session=abc; token=xyz")
 * @returns Array of cookie objects for puppeteer
 */
function parseCookieHeader(cookieHeader: string): Array<{ name: string; value: string; domain?: string; path?: string }> {
  return cookieHeader
    .split(';')
    .map(cookie => cookie.trim())
    .filter(cookie => cookie.length > 0)
    .map(cookie => {
      const [name, ...valueParts] = cookie.split('=');
      return {
        name: name.trim(),
        value: valueParts.join('=').trim(), // Join back in case value contains '='
        path: '/'
      };
    });
}

export function generateTools(projectId: string, cookies?: string, localStorage?: any): ToolSet {
  // Parse cookies string from Cookie header format if provided
  const parsedCookies = cookies ? parseCookieHeader(cookies) : undefined;

  // Create options object for crawler functions
  const crawlerOptions = {
    cookies: parsedCookies,
    localStorage: localStorage
  };

  const tools: ToolSet = {
    findUrls: {
      description: "Tool to find all URLs/links present in a web page",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the webpage to crawl")
      }),
      execute: async ({ url }) => {
        const browser = await puppeteer.launch();
        try {
          const urls = await getUrlsFromPage(browser, url, crawlerOptions);
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
      execute: async ({ url, baseDomain }) => {
        const browser = await puppeteer.launch();
        try {
          const subdomains = await getSubdomainsFromPage(browser, url, baseDomain, crawlerOptions);
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
      execute: async ({ url }) => {
        const browser = await puppeteer.launch();
        try {
          const emails = await getEmailsFromPage(browser, url, crawlerOptions);
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
      execute: async ({ url }) => {
        const browser = await puppeteer.launch();
        try {
          const cookies = await getCookiesFromPage(browser, url, crawlerOptions);
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
      execute: async ({ url }) => {
        const browser = await puppeteer.launch();
        try {
          const requests = await getNetworkRequestsFromPage(browser, url, crawlerOptions);
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
      execute: async ({ url }) => {
        const browser = await puppeteer.launch();
        try {
          const content = await getPageContent(browser, url, crawlerOptions);
          await browser.close();

          if (!content) {
            return JSON.stringify({ error: "Failed to get page content" });
          }

          // Save to database with projectId
          const pageId = await savePage(projectId, url, content.html, content.scripts);

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
      execute: async ({ url, selector }) => {
        const results = await queryPageDOM(url, selector);
        return truncateResponse(results);
      }
    },
    getPageForms: {
      description: "Get all forms from a saved page, including their action URLs, methods, and input fields. Essential for testing form-based vulnerabilities.",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the saved page")
      }),
      execute: async ({ url }) => {
        const forms = await getPageForms(url);
        return truncateResponse(forms);
      }
    },
    getPageInputs: {
      description: "Get all input fields from a saved page including their types, names, values, and surrounding context. Useful for identifying injection points.",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the saved page")
      }),
      execute: async ({ url }) => {
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
      execute: async ({ url, startLine, endLine }) => {
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
      execute: async ({ url, pattern, isRegex }) => {
        const results = await searchInScripts(url, pattern, isRegex || false);
        return truncateResponse(results);
      }
    },
    getPageMetadata: {
      description: "Get page metadata including title, meta tags, headers (h1-h6), and links. Useful for understanding page structure and finding hidden endpoints.",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the saved page")
      }),
      execute: async ({ url }) => {
        const metadata = await getPageMetadata(url);
        return truncateResponse(metadata);
      }
    },
    getScriptStats: {
      description: "Get statistics about JavaScript on a saved page: total lines, script count, presence of API keys, console logs, localStorage usage, cookie access, and external API calls.",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the saved page")
      }),
      execute: async ({ url }) => {
        const stats = await getScriptStats(url);
        return truncateResponse(stats);
      }
    },
    nslookup: {
      description: "Perform DNS lookup using nslookup to resolve domain names and query DNS records (A, MX, NS, TXT, etc.). Useful for reconnaissance and finding mail servers, nameservers, and other DNS information.",
      inputSchema: z.object({
        domain: z.string().describe("Domain name to lookup (e.g., 'example.com')"),
        queryType: z.string().optional().describe("DNS record type to query (A, MX, NS, TXT, CNAME, etc.)"),
        nameserver: z.string().optional().describe("Specific nameserver to query (e.g., '8.8.8.8')")
      }),
      execute: async ({ domain, queryType, nameserver }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/nslookup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              domain,
              query_type: queryType,
              nameserver
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'nslookup request failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    dig: {
      description: "Perform DNS lookup using dig (Domain Information Groper) for detailed DNS query results. More powerful than nslookup with better formatted output. Query any DNS record type (A, AAAA, MX, NS, TXT, SOA, CNAME, ANY, etc.).",
      inputSchema: z.object({
        domain: z.string().describe("Domain name to lookup (e.g., 'example.com')"),
        queryType: z.string().optional().describe("DNS record type (A, AAAA, MX, NS, TXT, SOA, CNAME, ANY, etc.). Default: A"),
        nameserver: z.string().optional().describe("Specific nameserver to query (e.g., '8.8.8.8', '1.1.1.1')"),
        short: z.boolean().optional().describe("Return short/concise output (just the answer). Default: false")
      }),
      execute: async ({ domain, queryType, nameserver, short }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/dig', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              domain,
              query_type: queryType || 'A',
              nameserver,
              short: short || false
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'dig request failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    nmap: {
      description: "Perform network port scanning using Nmap to discover open ports, running services, and service versions. Essential for mapping attack surface. Scan types: basic (quick), service (detect versions), vuln (vulnerability scripts), full (comprehensive).",
      inputSchema: z.object({
        target: z.string().describe("Target IP address or hostname to scan"),
        ports: z.string().optional().describe("Port range to scan (e.g., '80,443' or '1-1000' or '1-65535')"),
        scanType: z.enum(['basic', 'service', 'vuln', 'full']).optional().describe("Scan type: basic (fast), service (version detection), vuln (vulnerability scan), full (comprehensive). Default: basic")
      }),
      execute: async ({ target, ports, scanType }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/nmap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              target,
              ports,
              scan_type: scanType || 'basic'
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'Nmap scan failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    sqlmap: {
      description: "Test for SQL injection vulnerabilities using SQLmap. Automatically detects and exploits SQL injection flaws. Can enumerate databases, tables, and extract data. Use with caution - only on authorized targets.",
      inputSchema: z.object({
        url: z.string().url().describe("Target URL to test for SQL injection"),
        data: z.string().optional().describe("POST data string (e.g., 'username=admin&password=test')"),
        cookie: z.string().optional().describe("Cookie string to include in requests"),
        level: z.number().optional().describe("Level of tests to perform (1-5). Higher = more thorough. Default: 1"),
        risk: z.number().optional().describe("Risk of tests (1-3). Higher = more aggressive. Default: 1")
      }),
      execute: async ({ url, data, cookie, level, risk }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/sqlmap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              data,
              cookie,
              level: level || 1,
              risk: risk || 1
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'SQLmap scan failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    nikto: {
      description: "Perform web server vulnerability scanning using Nikto. Checks for outdated software, dangerous files, misconfigurations, and common vulnerabilities. Essential for web application security assessment.",
      inputSchema: z.object({
        target: z.string().describe("Target hostname or IP address"),
        port: z.number().optional().describe("Target port number. Default: 80"),
        ssl: z.boolean().optional().describe("Use SSL/HTTPS. Default: false")
      }),
      execute: async ({ target, port, ssl }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/nikto', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              target,
              port: port || 80,
              ssl: ssl || false
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'Nikto scan failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    whatweb: {
      description: "Identify web technologies, frameworks, CMS, JavaScript libraries, web servers, and more using WhatWeb. Perfect for technology fingerprinting and reconnaissance. Aggression levels: 1 (stealthy), 2 (normal), 3 (aggressive), 4 (heavy).",
      inputSchema: z.object({
        target: z.string().url().describe("Target URL to scan"),
        aggression: z.number().optional().describe("Aggression level (1-4). Higher = more requests/thorough. Default: 1")
      }),
      execute: async ({ target, aggression }) => {
        try {
          const response = await fetch('http://localhost:8000/scan/whatweb', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              target,
              aggression: aggression || 1
            })
          });

          if (!response.ok) {
            const error = await response.json();
            return JSON.stringify({ error: error.detail || 'WhatWeb scan failed' });
          }

          const result = await response.json();
          return truncateResponse(result);
        } catch (error) {
          return JSON.stringify({ error: `Failed to connect to tools API: ${error}` });
        }
      }
    },
    saveVulnerability: {
      description: "Save a discovered vulnerability to the database. Use this tool when you have confirmed a security vulnerability through testing. Include detailed evidence, reproduction steps, and impact assessment.",
      inputSchema: z.object({
        title: z.string().describe("Short descriptive title of the vulnerability (e.g., 'SQL Injection in login form', 'XSS in search parameter')"),
        description: z.string().describe("Detailed description including: 1) What the vulnerability is, 2) Where it was found (URL, parameter, endpoint), 3) How to reproduce it (step by step), 4) Evidence/proof (payloads used, responses received), 5) Potential impact, 6) Recommended fix"),
        cvss: z.number().min(0).max(10).describe("CVSS score from 0-10. 0-3.9: Low, 4-6.9: Medium, 7-8.9: High, 9-10: Critical")
      }),
      execute: async ({ title, description, cvss }) => {
        try {
          const [vulnerability] = await db.insert(vulnerabilities).values({
            projectId,
            title,
            description,
            cvss: Math.round(cvss)
          }).returning();

          return JSON.stringify({
            success: true,
            message: `Vulnerability saved successfully with ID: ${vulnerability.id}`,
            vulnerability: {
              id: vulnerability.id,
              title: vulnerability.title,
              cvss: vulnerability.cvss
            }
          });
        } catch (error) {
          return JSON.stringify({ error: `Failed to save vulnerability: ${error}` });
        }
      }
    }
  }

  return tools;
}

export async function* streamAgentResponse(messages: Message[], url: string, projectId: string, cookies?: string, localStorage?: any) {
  // Keep only recent messages to avoid context overflow
  const MAX_MESSAGES = 10;
  const recentMessages = messages.slice(-MAX_MESSAGES);

  const { fullStream } = streamText({
    model: groq("moonshotai/kimi-k2-instruct-0905"),
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
    tools: generateTools(projectId, cookies, localStorage),
    stopWhen: stepCountIs(20)
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
