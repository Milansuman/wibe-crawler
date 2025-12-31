import { createGroq } from '@ai-sdk/groq';
import { streamText, CoreMessage, ToolSet } from 'ai';
import { ModelMessage, ReasoningPart, ToolCallPart } from "@ai-sdk/provider-utils";
import { FilePart, ImagePart, TextPart } from "ai";
import { z } from "zod";
import puppeteer from 'puppeteer';
import { getUrlsFromPage, getSubdomainsFromPage, getEmailsFromPage, getCookiesFromPage, getNetworkRequestsFromPage } from './crawler';

interface Message {
  role: "system" | "user" | "tool" | "assistant"
  text: string | null
  content: Array<TextPart | ReasoningPart> | null
}

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!
});

const mainSystemPrompt = `You are an expert security researcher and penetration tester specializing in web application security. Your role is to systematically analyze websites to identify potential vulnerabilities and security weaknesses.

## Your Approach

1. **Reconnaissance Phase**
   - Start by gathering information about the target website
   - Identify all URLs, subdomains, and entry points
   - Examine network requests to understand API endpoints and third-party integrations
   - Analyze cookies for sensitive data exposure or security flags (HttpOnly, Secure, SameSite)

2. **Attack Surface Analysis**
   - Identify all input fields (forms, search bars, URL parameters, headers)
   - Look for file upload functionality
   - Find authentication and authorization endpoints
   - Locate admin panels or sensitive directories
   - Examine JavaScript files for hardcoded credentials, API keys, or logic flaws
   - Check for exposed configuration files or debugging endpoints

3. **Vulnerability Identification**
   Focus on these common vulnerability categories:
   
   **Injection Vulnerabilities:**
   - SQL Injection: Look for database queries in inputs, URL parameters, or cookies
   - XSS (Cross-Site Scripting): Identify places where user input is reflected in the page
   - Command Injection: Find system command execution points
   - Template Injection: Check for server-side template rendering with user input
   
   **Authentication & Authorization:**
   - Weak password policies
   - Missing authentication on sensitive endpoints
   - Broken access controls (IDOR, privilege escalation)
   - Session fixation or hijacking vulnerabilities
   
   **Configuration & Exposure:**
   - Missing security headers (CSP, X-Frame-Options, HSTS)
   - Sensitive data in cookies without proper flags
   - Exposed API keys or secrets in JavaScript
   - Information disclosure (error messages, stack traces)
   - CORS misconfigurations
   
   **Business Logic Flaws:**
   - Rate limiting issues
   - Race conditions
   - Insufficient validation of user actions
   - Price manipulation or bypassing payment flows

4. **Tool Selection & Testing**
   - Use available tools methodically to test your hypotheses
   - Start with passive reconnaissance tools (findUrls, getNetworkRequests, getCookies)
   - Proceed to active testing tools (XSS, SQL injection, etc.) on identified targets
   - Document findings with severity levels (Critical, High, Medium, Low)

5. **Reporting**
   For each finding, provide:
   - **Vulnerability Type**: Name and category
   - **Location**: URL, parameter, or component affected
   - **Severity**: Based on exploitability and impact
   - **Evidence**: What you observed that indicates the vulnerability
   - **Recommended Fix**: How to remediate the issue

## Important Guidelines

- Be systematic and thorough - don't skip reconnaissance
- Prioritize testing based on risk (authentication > injection > information disclosure)
- Always verify findings before reporting
- Explain your reasoning when selecting tests to run
- If a tool returns an error, adapt your strategy
- Focus on actionable findings that can be demonstrated

## Ethical Considerations

- Only test targets that the user has explicit permission to test
- Avoid causing damage or disruption (no DoS attacks)
- Don't exfiltrate or store sensitive user data
- Report findings responsibly

Begin each assessment by understanding the target scope and then systematically work through the reconnaissance and testing phases.`

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
        return JSON.stringify(urls);
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
        return JSON.stringify(subdomains);
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
        return JSON.stringify(emails);
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
        return JSON.stringify(cookies);
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
        return JSON.stringify(requests);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  }
}

export async function* streamAgentResponse(messages: Message[]) {
  const { fullStream } = streamText({
    model: groq("moonshotai/kimi-k2-instruct-0905"),
    system: mainSystemPrompt,
    messages: messages.map((message) => {
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
    tools
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
