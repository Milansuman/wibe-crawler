import Groq from 'groq-sdk'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import {
  CrawlResult,
  ApiCall,
  CookieData
} from './crawler'
import { FuzzResult } from './fuzzer'

// Zod schemas for validation
const VulnerabilitySchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  cwe: z.string().optional(),
  cvss: z.number().optional(),
  type: z.string().optional(),
  description: z.string(),
  recommendation: z.string(),
  references: z.array(z.string()).optional(),
  affectedAssets: z.array(z.string()),
  proof: z.object({
    payload: z.string().optional(),
    parameter: z.string().optional(),
    request: z.string().optional(),
    response: z.string().optional(),
    confidence: z.enum(['High', 'Medium', 'Low']).optional()
  }).optional()
})

const StatisticsSchema = z.object({
  total: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  info: z.number().optional()
})

const VulnerabilityReportSchema = z.object({
  summary: z.string().optional(),
  vulnerabilities: z.array(VulnerabilitySchema),
  statistics: StatisticsSchema.optional()
})

const FullReportSchema = z.object({
  title: z.string(),
  executive_summary: z.string(),
  vulnerabilities: z.array(VulnerabilitySchema),
  statistics: StatisticsSchema,
  methodology: z.string(),
  recommendations: z.array(z.string())
})

export interface Vulnerability {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  cwe?: string
  cvss?: number
  type?: string
  description: string
  location?: string
  recommendation: string
  references?: string[]
  affectedAssets: string[]
  proof?: {
    payload?: string
    parameter?: string
    request?: string
    response?: string
    confidence?: 'High' | 'Medium' | 'Low'
  }
}

export interface VulnerabilityReport {
  summary: string
  vulnerabilities: Vulnerability[]
  statistics: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info?: number
  }
  generatedAt: string
}

export interface FullReport {
  title: string
  executive_summary: string
  vulnerabilities: Vulnerability[]
  statistics: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info?: number
  }
  methodology: string
  recommendations: string[]
  generatedAt: string
}

export interface CrawledDataSummary {
  crawlResults: CrawlResult[]
  allApiCalls: ApiCall[]
  allCookies: CookieData[]
  allEmails: string[]
  allAssets: Record<string, string[]>
  discoveredDomains: string[]
  fuzzResults?: FuzzResult[]
}

/**
 * Filters and samples crawled data to reduce payload size for API requests
 * Keeps the most important items while removing duplicates and limiting arrays
 */
interface FilteredCrawledData {
  crawlResults: CrawlResult[]
  allApiCalls: ApiCall[]
  allCookies: CookieData[]
  allEmails: string[]
  allAssets: Record<string, string[]>
  discoveredDomains: string[]
  fuzzResults?: FuzzResult[]
  dataWasFiltered: boolean
  originalCounts: {
    crawlResults: number
    allApiCalls: number
    allCookies: number
    allEmails: number
    discoveredDomains: number
    allAssets: number
    fuzzResults: number
  }
}

export class VulnerabilityAgent {
  private client: Groq
  private model: string = 'llama-3.3-70b-versatile'

  constructor(apiKey?: string, model: string = 'llama-3.3-70b-versatile') {
    let key = apiKey || process.env.GROQ_API_KEY

    // Fallback: Check if key is missing or looks like a placeholder (starts with "your_" or doesn't start with "gsk_")
    if (!key || key.trim().startsWith('your_') || !key.trim().startsWith('gsk_')) {
      try {
        // Try to read .env file from project root
        // In dev, cwd is usually project root. In prod, it might be different, but this is a dev environment issue.
        const projectRoot = process.cwd()
        const envPath = path.join(projectRoot, '.env')
        console.log('[Agent] Checking .env file at:', envPath)
        
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8')
          const match = envContent.match(/^GROQ_API_KEY=(.*)$/m)
          if (match && match[1]) {
            const fileKey = match[1].trim()
            if (fileKey && fileKey.startsWith('gsk_')) {
              console.log('[Agent] Found valid key in .env file, overriding system env var')
              key = fileKey
              process.env.GROQ_API_KEY = fileKey // Update process.env for subsequent calls
            }
          }
        }
      } catch (err) {
        console.error('[Agent] Failed to read .env fallback:', err)
      }
    }

    if (!key) {
      throw new Error('GROQ_API_KEY environment variable is not set or invalid')
    }
    this.model = model

    this.client = new Groq({
      apiKey: key
    })
  }

  /**
   * Sets the model to use (e.g., 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it')
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * Filters and samples crawled data to keep request size manageable
   * Removes duplicates and limits arrays to most important items
   */
  private filterCrawledData(data: CrawledDataSummary): FilteredCrawledData {
    // Drastically reduced limits to prevent token overflow (was hitting 34k, limit is 12k)
    const MAX_CRAWL_RESULTS = 5      // Reduced from 30
    const MAX_API_CALLS = 15         // Reduced from 50  
    const MAX_COOKIES = 15           // Reduced from 30
    const MAX_EMAILS = 20            // Reduced from 50
    const MAX_DOMAINS = 20           // Reduced from 50
    const MAX_FUZZ_RESULTS = 10      // Reduced from 30
    const MAX_ASSETS_PER_TYPE = 5    // Reduced from 10

    const originalCounts = {
      crawlResults: data.crawlResults.length,
      allApiCalls: data.allApiCalls.length,
      allCookies: data.allCookies.length,
      allEmails: data.allEmails.length,
      discoveredDomains: data.discoveredDomains.length,
      allAssets: Object.values(data.allAssets).reduce((sum, arr) => sum + arr.length, 0),
      fuzzResults: data.fuzzResults?.length || 0
    }

    // Filter crawl results - keep most important (those with forms or suspicious patterns)
    const filteredCrawlResults = data.crawlResults
      .sort((a, b) => {
        // Prioritize URLs with forms, suspicious paths, or auth-related pages
        const aScore = (a.forms?.length || 0) * 100 + (a.url.includes('admin') || a.url.includes('login') ? 50 : 0)
        const bScore = (b.forms?.length || 0) * 100 + (b.url.includes('admin') || b.url.includes('login') ? 50 : 0)
        return bScore - aScore
      })
      .slice(0, MAX_CRAWL_RESULTS)

    // Filter API calls - keep unique endpoints and suspicious methods
    const seenApiEndpoints = new Set<string>()
    const filteredApiCalls = data.allApiCalls
      .filter(call => {
        const endpoint = `${call.method}:${call.url}`
        if (seenApiEndpoints.has(endpoint)) return false
        seenApiEndpoints.add(endpoint)
        return true
      })
      .slice(0, MAX_API_CALLS)

    // Filter cookies - keep unique ones by name
    const seenCookies = new Set<string>()
    const filteredCookies = data.allCookies
      .filter(cookie => {
        const key = `${cookie.name}:${cookie.domain}`
        if (seenCookies.has(key)) return false
        seenCookies.add(key)
        return true
      })
      .slice(0, MAX_COOKIES)

    // Filter emails - unique values only
    const filteredEmails = [...new Set(data.allEmails)].slice(0, MAX_EMAILS)

    // Filter domains - unique values only
    const filteredDomains = [...new Set(data.discoveredDomains)].slice(0, MAX_DOMAINS)

    // Filter assets - keep max per type
    const filteredAssets: Record<string, string[]> = {}
    for (const [type, assets] of Object.entries(data.allAssets)) {
      const uniqueAssets = [...new Set(assets)]
      filteredAssets[type] = uniqueAssets.slice(0, MAX_ASSETS_PER_TYPE)
    }

    // Filter fuzz results - keep interesting ones (non-404s)
    const filteredFuzzResults = data.fuzzResults
      ?.filter(result => result.statusCode && result.statusCode !== 404)
      .slice(0, MAX_FUZZ_RESULTS)

    const dataWasFiltered =
      originalCounts.crawlResults > MAX_CRAWL_RESULTS ||
      originalCounts.allApiCalls > MAX_API_CALLS ||
      originalCounts.allCookies > MAX_COOKIES ||
      originalCounts.allEmails > MAX_EMAILS ||
      originalCounts.discoveredDomains > MAX_DOMAINS ||
      (originalCounts.fuzzResults || 0) > MAX_FUZZ_RESULTS

    return {
      crawlResults: filteredCrawlResults,
      allApiCalls: filteredApiCalls,
      allCookies: filteredCookies,
      allEmails: filteredEmails,
      allAssets: filteredAssets,
      discoveredDomains: filteredDomains,
      fuzzResults: filteredFuzzResults,
      dataWasFiltered,
      originalCounts
    }
  }

  /**
   * Extracts JSON from AI response using multiple strategies
   */
  private extractJSON(response: string): string {
    // Strategy 1: Look for XML-style tags
    const xmlMatch = response.match(/<vulnerability>([\s\S]*?)<\/vulnerability>/i)
    if (xmlMatch) {
      return xmlMatch[1].trim()
    }

    // Strategy 2: Look for markdown code blocks
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    // Strategy 3: Look for JSON object or array (most permissive)
    const jsonMatch = response.match(/(\{[\s\S]*\}|\[[\s\S]*\])/m)
    if (jsonMatch) {
      return jsonMatch[1].trim()
    }

    // Strategy 4: Return the response as-is if it starts with { or [
    const trimmed = response.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return trimmed
    }

    throw new Error('Could not extract JSON from AI response')
  }

  /**
   * Creates data clusters to process large datasets in batches
   * Groups similar data types together to reduce payload per request
   */
  private createDataClusters(data: CrawledDataSummary): CrawledDataSummary[] {
    const CLUSTER_SIZE = 15
    const clusters: CrawledDataSummary[] = []

    // Split crawl results into clusters
    const crawlClusters = []
    for (let i = 0; i < data.crawlResults.length; i += CLUSTER_SIZE) {
      crawlClusters.push(data.crawlResults.slice(i, i + CLUSTER_SIZE))
    }

    // Split API calls into clusters
    const apiClusters = []
    for (let i = 0; i < data.allApiCalls.length; i += CLUSTER_SIZE) {
      apiClusters.push(data.allApiCalls.slice(i, i + CLUSTER_SIZE))
    }

    // Create balanced clusters that combine different data types
    const maxClusters = Math.max(crawlClusters.length, apiClusters.length, 1)

    for (let i = 0; i < maxClusters; i++) {
      const cluster: CrawledDataSummary = {
        crawlResults: crawlClusters[i] || [],
        allApiCalls: apiClusters[i] || [],
        allCookies: data.allCookies, // Include all cookies in each cluster for context
        allEmails: data.allEmails, // Include all emails in each cluster for context
        allAssets: data.allAssets, // Include all assets in each cluster for context
        discoveredDomains: data.discoveredDomains, // Include domains for context
        fuzzResults: data.fuzzResults
      }
      clusters.push(cluster)
    }

    console.log(`Created ${clusters.length} clusters from crawled data for step-by-step analysis`)
    return clusters
  }

  /**
   * Analyzes a single cluster of data
   */
  private async analyzeDataCluster(
    clusterData: CrawledDataSummary,
    clusterIndex: number,
    totalClusters: number
  ): Promise<VulnerabilityReport> {
    const prompt = this.buildAnalysisPrompt(clusterData, clusterIndex, totalClusters)

    try {
      console.log(`Analyzing cluster ${clusterIndex + 1}/${totalClusters}...`)
      
      const message = await this.client.chat.completions.create({
        model: this.model, // Use the instance model which defaults to llama-3.3-70b-versatile
        messages: [
          {
            role: 'system',
            content: `You are an expert penetration tester and security auditor conducting an authorized security assessment.
            Analyze the provided web crawl data for potential security vulnerabilities.
            
            CRITICAL: You MUST provide CONCRETE PROOF for each vulnerability. Do NOT use vague language like "may be vulnerable" or "potential".
            Instead, extract ACTUAL EVIDENCE from the crawl data.
            
            ═══════════════════════════════════════════════════════════════
            STRICT FORMATTING RULES (MUST FOLLOW):
            ═══════════════════════════════════════════════════════════════
            
            1. USE STANDARD NAMING ONLY (NO variations allowed):
               ✅ "SQL Injection (SQLi)"
               ✅ "Cross-Site Scripting (XSS)"  
               ✅ "Insecure Direct Object Reference (IDOR)"
               ✅ "Missing Security Headers"
               ✅ "Information Disclosure"
               ✅ "Authentication Bypass"
               ❌ NO: "Potential SQL Injection", "SQL Injection Vulnerability", "Possible XSS"
            
            2. SEVERITY MAPPING (fixed, non-negotiable):
               - HIGH: SQL Injection, Stored XSS, Authentication Bypass, Remote Code Execution
               - MEDIUM: Reflected XSS, IDOR, CSRF, Missing Security Headers
               - LOW: Information Disclosure (minor), Insecure Cookies, Version Disclosure
               - INFO: Best practice violations, recommendations
            
            3. NO DUPLICATES - If same vulnerability type found multiple times:
               - Create ONE entry for that type
               - Combine ALL URLs under "affectedAssets" array
               Example: If XSS found on 3 pages → ONE "Cross-Site Scripting (XSS)" entry with 3 URLs
            
            4. ALWAYS INCLUDE (MANDATORY for every finding):
               - Parameter name (e.g., "id", "search", "cat", "file")  
               - Endpoint (e.g., "search.php", "product.php", "/api/user")
               These MUST appear in the description or proof section
            
            5. DESCRIPTION FORMAT:
               "[Vulnerability Type] found in the '[parameter]' parameter at [endpoint]. [Details]."
               Example: "SQL Injection found in the 'id' parameter at product.php. Database error messages indicate..."
            
            6. DETAILED ANALYSIS REQUIRED:
               - Description must be at least 2-3 sentences long.
               - Explain the IMPACT of the vulnerability (what can an attacker do?).
               - Explain the ROOT CAUSE (why is it happening?).
               
            7. METADATA REQUIRED:
               - CWE ID: Common Weakness Enumeration ID (e.g., "CWE-89")
               - CVSS Score: Estimated CVSS v3.1 score (e.g., "9.8")
               - References: Array of 1-2 standard links (OWASP, NIST, PortSwigger)
            
            ═══════════════════════════════════════════════════════════════
            
            For EACH vulnerability, you MUST include a "proof" object with:
            - payload: The EXACT test string/input that triggered the issue (from forms, URLs, or API calls)
            - parameter: The SPECIFIC parameter name that is vulnerable (e.g., "id", "search", "username")
            - request: A snippet of the actual HTTP request showing the vulnerability (from crawl data)
            - response: A snippet of the actual HTTP response proving the issue (error messages, reflected input, etc.)
            - confidence: "High" (confirmed with evidence), "Medium" (strong indicators), or "Low" (theoretical)
            
            EXAMPLE of GOOD output (with proof & metadata):
            {
              "title": "SQL Injection (SQLi)",
              "severity": "high",
              "cwe": "CWE-89",
              "cvss": 7.5,
              "description": "SQL Injection found in the 'id' parameter at /user/profile.php. Database error messages indicate unfiltered input. An attacker could use this vulnerability to bypass authentication, access unauthorized data, or modify the database structure. The root cause is the direct concatenation of user input into SQL queries without sanitization.",
              "recommendation": "Use parameterized queries or prepared statements. Ensure all user input is validated and sanitized before use in database queries.",
              "references": ["https://owasp.org/www-community/attacks/SQL_Injection", "https://cwe.mitre.org/data/definitions/89.html"],
              "affectedAssets": ["https://example.com/user/profile.php?id=1", "https://example.com/admin/edit.php?id=5"],
              "proof": {
                "payload": "' OR 1=1--",
                "parameter": "id",
                "request": "GET /user/profile.php?id=' OR 1=1-- HTTP/1.1",
                "response": "You have an error in your SQL syntax near '' OR 1=1--'",
                "confidence": "High"
              }
            }
            
            EXAMPLE of BAD output (vague, wrong naming, missing meta):
            {
              "title": "Potential SQL Injection",  // ❌ Wrong - should be "SQL Injection (SQLi)"
              "severity": "critical",  // ❌ Wrong - SQLi is "high"
              "description": "The application may be vulnerable..."  // ❌ Too short, no impact/root cause
              // ❌ NO CWE, CVSS, References, or Proof
            }
            
            HOW TO EXTRACT PROOF from crawl data:
            1. Check "forms" array for input fields → use field "name" as parameter
            2. Check "apiCalls" for request/response data → extract method, URL, status
            3. Check page content/"html" for error messages or sensitive data exposure
            4. Look for patterns: SQL errors, XSS reflection, directory listings, exposed credentials
            
            Focus on:
            - OWASP Top 10 vulnerabilities (SQLi, XSS, etc.)
            - Information Leakage (sensitive paths, patterns, error messages)
            - Unsafe configurations
            
            Return ONLY a valid JSON object with the following structure:
            {
              "vulnerabilities": [
                {
                  "title": "string",
                  "severity": "critical" | "high" | "medium" | "low" | "info",
                  "cwe": "string (e.g. CWE-89)",
                  "cvss": number,
                  "description": "string",
                  "recommendation": "string",
                  "references": ["url1", "url2"],
                  "affectedAssets": ["url or path"],
                  "proof": {
                    "payload": "string (the exact payload used, e.g. <script>alert(1)</script>)",
                    "parameter": "string (the parameter name, e.g. 'id' or 'q')",
                    "request": "string (snippet of the HTTP request)",
                    "response": "string (snippet of the HTTP response showing the issue)",
                    "confidence": "High" | "Medium" | "Low"
                  }
                }
              ],
              "summary": "string"
            }
            
            REMINDER: 
            - NO duplicate vulnerability types (merge them!)
            - ALWAYS include parameter name and endpoint
            - ALWAYS include CWE, CVSS, References
            - Use STANDARD names only
            - Follow SEVERITY mapping strictly
            
            If no specific vulnerabilities are found, look for potential best-practice violations or information disclosure.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 8000
      })

      const response = message.choices[0]?.message?.content
      if (!response) {
        throw new Error('Empty response from Groq API')
      }

      console.log(`Cluster ${clusterIndex + 1} response (first 300 chars):`, response.substring(0, 300))

      // Try to parse the content as JSON directly first
      let parsed: any;
      try {
        parsed = JSON.parse(response)
      } catch (parseError) {
        console.log('[Agent] JSON parse failed, trying extractor:', parseError)
        const jsonString = this.extractJSON(response)
        parsed = JSON.parse(jsonString)
      }

      // Validate with Zod
      console.log(`[Agent] Validating parsed JSON with schema...`)
      const validatedReport = VulnerabilityReportSchema.parse(parsed)
      
      // Add IDs if missing and ENRICH with metadata if AI missed it
      const processedVulnerabilities = validatedReport.vulnerabilities.map(v => {
        const withId = {
          ...v,
          id: v.id || Math.random().toString(36).substring(7),
          type: v.type || 'Security Vulnerability'
        } as Vulnerability
        
        return this.enrichVulnerability(withId)
      }) as Vulnerability[]

      // Calculate statistics
      const stats = {
        total: processedVulnerabilities.length,
        critical: processedVulnerabilities.filter(v => v.severity === 'critical').length,
        high: processedVulnerabilities.filter(v => v.severity === 'high').length,
        medium: processedVulnerabilities.filter(v => v.severity === 'medium').length,
        low: processedVulnerabilities.filter(v => v.severity === 'low').length,
        info: processedVulnerabilities.filter(v => v.severity === 'info').length
      }

      const report: VulnerabilityReport = {
        summary: validatedReport.summary || `Found ${stats.total} potential vulnerabilities.`,
        vulnerabilities: processedVulnerabilities,
        statistics: stats,
        generatedAt: new Date().toISOString()
      }

      return report
    } catch (error: any) {
      // Handle Rate Limit (429) gracefully
      if (error?.status === 429 || error?.code === 'rate_limit_exceeded' || error?.message?.includes('rate limit')) {
        console.warn(`[Agent] Rate limit exceeded in cluster ${clusterIndex + 1}. Returning partial result.`)
        return {
          summary: 'Analysis paused: Rate limit reached.',
          vulnerabilities: [{
            id: 'rate_limit_exceeded',
            title: 'Analysis Paused: API Rate Limit Reached',
            severity: 'info',
            description: `The AI analysis service daily limit has been reached (Requested: ${error?.error?.message || 'unknown'}). Analysis for this batch could not complete.`,
            type: 'System Limitation',
            location: 'System',
            recommendation: 'Please wait for your quota to reset (usually 24h) or upgrade your plan. You can also try reducing the number of pages scanned.',
            affectedAssets: []
          }],
          statistics: {
            total: 1,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
          },
          generatedAt: new Date().toISOString()
        }
      }

      if (error instanceof z.ZodError) {
        // Zod v3 uses .issues, newer might use .errors. Use any for safety.
        const issues = (error as any).issues || (error as any).errors || []
        console.error(`Cluster ${clusterIndex + 1} Zod validation error:`, JSON.stringify(issues, null, 2))
        throw new Error(`Invalid response format from AI in cluster ${clusterIndex + 1}: ${issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
      }
      if (error instanceof SyntaxError) {
        console.error(`Cluster ${clusterIndex + 1} JSON parse error:`, error.message)
        throw new Error(`Failed to parse JSON from cluster ${clusterIndex + 1}: ${error.message}`)
      }
      console.error(`Cluster ${clusterIndex + 1} error:`, error)
      throw error
    }
  }

  /**
   * Merges multiple vulnerability reports into a single comprehensive report
   */
  private mergeVulnerabilityReports(reports: VulnerabilityReport[]): VulnerabilityReport {
    if (reports.length === 0) {
      return {
        summary: 'No vulnerabilities found',
        vulnerabilities: [],
        statistics: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        generatedAt: new Date().toISOString()
      }
    }

    if (reports.length === 1) {
      return reports[0]
    }

    // Merge vulnerabilities and remove duplicates BY TYPE (title)
    // This ensures all instances of "SQL Injection (SQLi)" are combined into one entry
    const vulnerabilityMap = new Map<string, Vulnerability>()

    for (const report of reports) {
      for (const vuln of report.vulnerabilities) {
        // Use ONLY title as the key to deduplicate by vulnerability type
        const key = vuln.title
        if (!vulnerabilityMap.has(key)) {
          vulnerabilityMap.set(key, vuln)
        } else {
          // Merge: Combine all affected assets from duplicate entries
          const existing = vulnerabilityMap.get(key)!
          existing.affectedAssets = [...new Set([...existing.affectedAssets, ...vuln.affectedAssets])]
          
          // If the new vulnerability has proof and the existing one doesn't, use it
          if (vuln.proof && !existing.proof) {
            existing.proof = vuln.proof
          }
        }
      }
    }

    // Sort by severity (critical > high > medium > low > info)
    const vulnerabilities = Array.from(vulnerabilityMap.values()).sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })

    // Aggregate statistics
    const statistics = {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      info: vulnerabilities.filter(v => v.severity === 'info').length
    }

    return {
      summary: `Analysis of crawled data identified ${statistics.total} unique vulnerabilities: ${statistics.critical} critical, ${statistics.high} high, ${statistics.medium} medium, and ${statistics.low} low severity issues.`,
      vulnerabilities,
      statistics,
      generatedAt: new Date().toISOString()
    }
  }

  /**
   * Analyzes crawled data in clusters to avoid payload size limits
   */
  async analyzeForVulnerabilities(
    crawledData: CrawledDataSummary
  ): Promise<VulnerabilityReport> {
    try {
      // Create clusters from the crawled data
      const clusters = this.createDataClusters(crawledData)
      console.log(`Starting clustered analysis with ${clusters.length} cluster(s)...`)

      // Analyze each cluster
      const clusterReports: VulnerabilityReport[] = []
      for (let i = 0; i < clusters.length; i++) {
        const clusterReport = await this.analyzeDataCluster(clusters[i], i, clusters.length)
        clusterReports.push(clusterReport)

        // Small delay between requests to avoid rate limiting
        if (i < clusters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Merge all cluster reports into a final comprehensive report
      console.log('Merging cluster analysis results...')
      const mergedReport = this.mergeVulnerabilityReports(clusterReports)

      console.log(`Final report: ${mergedReport.statistics.total} vulnerabilities found`)
      return mergedReport
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Zod validation error:', JSON.stringify(error.errors, null, 2))
        throw new Error(`Invalid response format from AI: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
      }
      if (error instanceof SyntaxError) {
        console.error('JSON parse error:', error.message)
        throw new Error(`Failed to parse JSON from AI response: ${error.message}`)
      }
      console.error('Groq API error:', error)
      throw new Error(
        error instanceof Error ? error.message : 'Failed to analyze vulnerabilities'
      )
    }
  }

  /**
   * Enriches a vulnerability with metadata (CWE, CVSS, References) if missing
   */
  private enrichVulnerability(vuln: Vulnerability): Vulnerability {
    const enriched = { ...vuln }
    
    // Metadata mapping for common vulnerability types
    const commonVulns = {
        'sql': { cwe: 'CWE-89', cvss: 9.8, refs: ['https://owasp.org/www-community/attacks/SQL_Injection'] },
        'sqli': { cwe: 'CWE-89', cvss: 9.8, refs: ['https://owasp.org/www-community/attacks/SQL_Injection'] },
        'xss': { cwe: 'CWE-79', cvss: 6.1, refs: ['https://owasp.org/www-community/attacks/xss/'] },
        'cross-site': { cwe: 'CWE-79', cvss: 6.1, refs: ['https://owasp.org/www-community/attacks/xss/'] },
        'scripting': { cwe: 'CWE-79', cvss: 6.1, refs: ['https://owasp.org/www-community/attacks/xss/'] },
        'xml': { cwe: 'CWE-611', cvss: 8.2, refs: ['https://owasp.org/www-community/vulnerabilities/XML_External_Entity_(XXE)_Processing'] },
        'idor': { cwe: 'CWE-639', cvss: 5.3, refs: ['https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html'] },
        'insecure direct': { cwe: 'CWE-639', cvss: 5.3, refs: ['https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html'] },
        'headers': { cwe: 'CWE-693', cvss: 3.7, refs: ['https://owasp.org/www-project-secure-headers/'] },
        'disclosure': { cwe: 'CWE-200', cvss: 4.3, refs: ['https://portswigger.net/web-security/information-disclosure'] },
        'authentication': { cwe: 'CWE-287', cvss: 8.8, refs: ['https://owasp.org/www-project-top-ten/2017/A2_2017-Broken_Authentication'] },
        'exposure': { cwe: 'CWE-200', cvss: 7.5, refs: ['https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure'] },
        'upload': { cwe: 'CWE-434', cvss: 8.8, refs: ['https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload'] },
        'traversal': { cwe: 'CWE-22', cvss: 7.5, refs: ['https://owasp.org/www-community/attacks/Path_Traversal'] },
        'csrf': { cwe: 'CWE-352', cvss: 8.8, refs: ['https://owasp.org/www-community/attacks/csrf'] }
    }

    const lowerTitle = enriched.title.toLowerCase()
    const match = Object.keys(commonVulns).find(k => lowerTitle.includes(k))
    
    if (match) {
        console.log(`[Agent] Enriched ${enriched.title} with metadata from key: ${match}`)
        const data = commonVulns[match]
        if (!enriched.cwe || enriched.cwe === 'N/A' || enriched.cwe === 'None' || enriched.cwe === 'Unknown') enriched.cwe = data.cwe
        if (!enriched.cvss || enriched.cvss === 0) enriched.cvss = data.cvss
        if (!enriched.references || enriched.references.length === 0) enriched.references = data.refs
    } else {
        console.log(`[Agent] No metadata match found for: ${enriched.title}`)
        if (!enriched.cwe || enriched.cwe === 'N/A') enriched.cwe = 'CWE-Unknown'
        if (!enriched.cvss) enriched.cvss = 5.0
    }

    // Enforce description detail
    if (enriched.description.length < 150) {
        if (enriched.severity === 'critical' || enriched.severity === 'high') {
            enriched.description += " This is a critical security flaw that could allow attackers to fully compromise the application, steal sensitive data, or modify records. The root cause typically involves untrusted user input being processed without proper sanitization or validation."
        } else if (enriched.severity === 'medium') {
            enriched.description += " Attackers could exploit this to perform unauthorized actions or access specific user data. This is often caused by missing access controls or insufficient input filtering."
        } else {
            enriched.description += " While not immediately exploitable for full compromise, this reveals information that aids attackers in crafting more specific targeted attacks. It is best practice to secure these endpoints."
        }
    }

    // CRITICAL: Align severity with CVSS score (CVSS takes precedence)
    if (enriched.cvss) {
        if (enriched.cvss >= 9.0 && enriched.severity !== 'critical') {
            console.log(`[Agent] Adjusting ${enriched.title} severity from ${enriched.severity} to critical (CVSS ${enriched.cvss})`)
            enriched.severity = 'critical'
        } else if (enriched.cvss >= 7.0 && enriched.cvss < 9.0 && enriched.severity === 'medium') {
            console.log(`[Agent] Adjusting ${enriched.title} severity from ${enriched.severity} to high (CVSS ${enriched.cvss})`)
            enriched.severity = 'high'
        }
    }

    return enriched
  }

  /**
   * Generates a comprehensive final report based on selected vulnerabilities
   */
  async generateFullReport(
    selectedVulnerabilities: Vulnerability[],
    crawledData: CrawledDataSummary,
    targetUrl: string
  ): Promise<FullReport> {
    // CRITICAL: Enrich vulnerabilities first to ensure metadata is present
    const enrichedVulnerabilities = selectedVulnerabilities.map(v => this.enrichVulnerability(v))
    console.log(`[Agent] Enriched ${enrichedVulnerabilities.length} vulnerabilities for report generation`)
    
    const generate = async (vulnerabilities: Vulnerability[], allowFallback: boolean): Promise<FullReport> => {
      const prompt = this.buildFullReportPrompt(
        vulnerabilities,
        crawledData,
        targetUrl
      )

      try {
        const message = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a professional penetration tester writing formal security reports. You MUST respond with ONLY valid JSON wrapped in <report> tags.
              
CRITICAL OUTPUT FORMAT:
<report>
{
  "title": "Security Assessment Report",
  "executive_summary": "2-3 paragraph summary...",
  "vulnerabilities": [
    {
      "id": "vuln_001",
      "title": "Vulnerability Title",
      "severity": "high",
      "type": "XSS",
      "description": "Details...",
      "location": "https://example.com",
      "recommendation": "Fix by...",
      "affectedAssets": ["url1", "url2"]
    }
  ],
  "statistics": {
    "total": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  },
  "methodology": "Testing methodology description...",
  "recommendations": [
    "Priority 1: Critical fixes...",
    "Priority 2: Defense in depth..."
  ],
  "generatedAt": "ISO date string"
}
</report>`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 8000
        })
        
        const content = message.choices[0]?.message?.content || ''
        const jsonMatch = content.match(/<report>([\s\S]*?)<\/report>/) || content.match(/\{[\s\S]*\}/)
        
        if (!jsonMatch) {
          throw new Error('Invalid response format')
        }
        
        const aiReport = JSON.parse(jsonMatch[1] || jsonMatch[0])
        
        // CRITICAL: Merge enriched metadata back into AI's vulnerabilities
        // The AI rewrites vulnerabilities and loses cwe/cvss/references
        // We need to match by title and restore the metadata
        if (aiReport.vulnerabilities && Array.isArray(aiReport.vulnerabilities)) {
          aiReport.vulnerabilities = aiReport.vulnerabilities.map((aiVuln: any) => {
            // Find matching enriched vulnerability by title
            const enriched = vulnerabilities.find(v => 
              v.title.toLowerCase() === aiVuln.title?.toLowerCase()
            )
            
            if (enriched) {
              // Merge enriched metadata into AI's vulnerability
              return {
                ...aiVuln,
                cwe: enriched.cwe,
                cvss: enriched.cvss,
                references: enriched.references
              }
            }
            
            return aiVuln
          })
          
          console.log('[Agent] Merged enriched metadata into AI report vulnerabilities')
        }
        
        return aiReport
      } catch (error: any) {
        // Handle Rate Limit (413 or 429) by truncating data
        if (allowFallback && (error?.status === 413 || error?.code === 'rate_limit_exceeded')) {
          console.warn('[Agent] Rate limit exceeded, retrying with truncated payload...')
          // Take only top 5 vulnerabilities by severity
          const topVulns = vulnerabilities
            .sort((a, b) => {
              const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
              return severityOrder[a.severity] - severityOrder[b.severity]
            })
            .slice(0, 5)
            
          return generate(topVulns, false)
        }
        throw error
      }
    }

    return generate(enrichedVulnerabilities, true)
  }




  /**
   * Builds the prompt for vulnerability analysis
   */
  private buildAnalysisPrompt(
    data: CrawledDataSummary,
    clusterIndex?: number,
    totalClusters?: number
  ): string {
    const clusterInfo = clusterIndex !== undefined && totalClusters !== undefined 
      ? `\n(This is cluster ${clusterIndex + 1} of ${totalClusters} - analyzing a subset of discovered data)\n` 
      : ''

    // Create lightweight summaries to save tokens
    const summarizedCrawl = data.crawlResults.map(r => ({
      url: r.url,
      status: r.status,
      title: r.title || '',
      forms: r.forms?.map(f => ({ 
        action: f.action || '',
        method: f.method || '',
        inputs: (f.fields || []).map(i => i.name).join(', ') 
      })) || [],
      linkCount: r.links?.length || 0
    }))

    const summarizedApi = data.allApiCalls.map(c => ({
      endpoint: c.endpoint,
      method: c.method,
      responseStatus: c.responseStatus
    }))

    // Limit context data
    const summarizedAssets = {
      js: (data.allAssets?.['js'] || []).slice(0, 50),
      css: (data.allAssets?.['css'] || []).slice(0, 20),
      images: (data.allAssets?.['images'] || []).length + ' images found'
    }

    return `You are a professional penetration tester and security analyst. Analyze the following web application crawl data and identify security vulnerabilities.${clusterInfo}
CRAWLED DATA SUMMARY:
- URLs in this batch: ${data.crawlResults.length}
- API endpoints in this batch: ${data.allApiCalls.length}
- Forms discovered: ${data.crawlResults.reduce((sum, r) => sum + r.forms.length, 0)}
- Cookies analyzed: ${data.allCookies.length}
- Emails discovered: ${data.allEmails.length}
- Unique domains: ${data.discoveredDomains.length}

DETAILED DATA - PAGES & FORMS (Summarized):
${JSON.stringify(summarizedCrawl, null, 2)}

DETAILED DATA - API ENDPOINTS (Summarized):
${JSON.stringify(summarizedApi, null, 2)}

REFERENCE DATA - COOKIES (for context):
${JSON.stringify(data.allCookies, null, 2)}

REFERENCE DATA - EMAILS (for context):
${JSON.stringify(data.allEmails.slice(0, 50), null, 2)}

REFERENCE DATA - ASSETS (for context, truncated):
${JSON.stringify(summarizedAssets, null, 2)}

REFERENCE DATA - DOMAINS (for context):
${JSON.stringify(data.discoveredDomains.slice(0, 50), null, 2)}

${data.fuzzResults ? `REFERENCE DATA - FUZZ RESULTS (for context):
${JSON.stringify(data.fuzzResults.slice(0, 20), null, 2)}` : ''}

ANALYSIS INSTRUCTIONS:
Analyze the pages, forms, and API endpoints in this batch:
1. Forms & Input Validation: Check for XSS, SQL injection, CSRF vulnerabilities
2. API Security: Analyze endpoints for authentication issues, exposed sensitive data
3. Cookie Security: Check for missing Secure/HttpOnly flags
4. Information Disclosure: Identify exposed emails, sensitive files
5. SSL/TLS Issues: Check for insecure cookies over HTTP
6. Authentication & Authorization: Weak session management
7. Data Exposure: Sensitive data in URLs or API responses
8. Subdomain Takeover: Analyze discovered domains for risks
9. Asset Security: Check for exposed sensitive files
10. Security Headers: Missing security headers in API responses

OUTPUT: Wrap JSON in <vulnerability> tags:
<vulnerability>
{
  "summary": "Brief summary of findings",
  "vulnerabilities": [
    {
      "id": "vuln_001",
      "title": "Vulnerability Title",
      "severity": "high",
      "type": "Type",
      "description": "Description",
      "location": "https://example.com",
      "recommendation": "Fix",
      "affectedAssets": ["url1"]
    }
  ],
  "statistics": {
    "total": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
</vulnerability>

IMPORTANT: Output ONLY JSON in tags. No other text.`
  }

  /**
   * Builds the prompt for full report generation
   */
  private buildFullReportPrompt(
    vulnerabilities: Vulnerability[],
    crawledData: CrawledDataSummary,
    targetUrl: string
  ): string {
    // Calculate summary statistics to avoid sending full data
    const formCount = crawledData.crawlResults.reduce((sum, r) => sum + (r.forms?.length || 0), 0)
    const assetCount = Object.values(crawledData.allAssets || {}).reduce((sum, arr) => sum + arr.length, 0)
    
    return `You are a professional security consultant writing a formal penetration testing report. Create a comprehensive report based on the following findings.

TARGET: ${targetUrl}

IDENTIFIED VULNERABILITIES:
${JSON.stringify(vulnerabilities, null, 2)}

SCAN SUMMARY:
- URLs scanned: ${crawledData.crawlResults.length}
- Domains discovered: ${crawledData.discoveredDomains.length}
- API endpoints found: ${crawledData.allApiCalls.length}
- Forms analyzed: ${formCount}
- Cookies examined: ${crawledData.allCookies.length}
- Email addresses found: ${crawledData.allEmails.length}
- Assets discovered: ${assetCount}

Generate a professional penetration testing report in JSON format:

OUTPUT FORMAT:
You MUST wrap your JSON response in <report> tags like this:

<report>
{
  "title": "Security Assessment Report for ${targetUrl}",
  "executive_summary": "Professional 2-3 paragraph executive summary highlighting overall security posture, critical findings, and immediate actions required. Should be suitable for C-level executives.",
  "vulnerabilities": [
    {
      "id": "vuln_001",
      "title": "Missing HttpOnly Flag on Session Cookie",
      "severity": "high",
      "type": "Cookie Security",
      "description": "Detailed technical description with evidence and impact analysis.",
      "location": "https://example.com/path",
      "recommendation": "Specific remediation steps with code examples where applicable.",
      "affectedAssets": ["https://example.com/asset1", "https://example.com/asset2"]
    }
  ],
  "statistics": {
    "total": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "methodology": "Detailed description of testing methodology: automated web crawling to discover ${crawledData.crawlResults.length} pages, form enumeration (${formCount} forms), API endpoint discovery (${crawledData.allApiCalls.length} endpoints), cookie security analysis (${crawledData.allCookies.length} cookies), and asset enumeration. Include specific tools and techniques used.",
  "recommendations": [
    "Priority 1 (Critical): Immediate actions for critical vulnerabilities - [specific actions]",
    "Priority 2 (High): High-priority security improvements - [specific actions]",
    "Priority 3 (Medium): Medium-priority hardening measures - [specific actions]",
    "Priority 4 (Low): General security best practices and long-term improvements"
  ]
}
</report>

IMPORTANT: Output ONLY the JSON wrapped in <report> tags. No other text.`
  }

  /**
   * Tests the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const message = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'Say "Connected" only.'
          }
        ],
        max_tokens: 10
      })
      return !!message.choices[0]?.message?.content
    } catch (error) {
      console.error('Connection test failed:', error)
      return false
    }
  }

  /**
   * Lists available models on Groq
   */
  async getAvailableModels(): Promise<string[]> {
    // Groq provides a predefined list of available models
    return [
      'mixtral-8x7b-32768',
      'llama2-70b-4096',
      'gemma-7b-it',
      'gpt-4o'
    ]
  }
}
