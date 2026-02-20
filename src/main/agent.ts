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
    payload: z.string().nullish(),
    parameter: z.string().nullish(),
    request: z.string().nullish(),
    response: z.string().nullish(),
    confidence: z.enum(['High', 'Medium', 'Low']).nullish()
  }).nullish()
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
  id?: string
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
    payload?: string | null
    parameter?: string | null
    request?: string | null
    response?: string | null
    confidence?: 'High' | 'Medium' | 'Low' | null
  } | null
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


interface KeyMetadata {
  index: number
  client: Groq
  onCooldownUntil: number
  inUse: boolean
}

class KeyManager {
  private keys: KeyMetadata[] = []

  constructor(clients: Groq[]) {
    this.keys = clients.map((client, index) => ({
      index,
      client,
      onCooldownUntil: 0,
      inUse: false
    }))
  }

  /**
   * Leases the first available healthy key
   */
  async leaseKey(): Promise<KeyMetadata | null> {
    const now = Date.now()
    // Find a key that is not in use and not on cooldown
    const availableKey = this.keys.find(k => !k.inUse && k.onCooldownUntil < now)
    
    if (availableKey) {
      availableKey.inUse = true
      return availableKey
    }
    
    return null
  }

  /**
   * Releases a key back to the pool
   */
  releaseKey(index: number) {
    if (this.keys[index]) {
      this.keys[index].inUse = false
    }
  }

  /**
   * Marks a key as being on cooldown
   */
  markCooldown(index: number, durationMs: number = 60000) {
    if (this.keys[index]) {
      this.keys[index].onCooldownUntil = Date.now() + durationMs
      this.keys[index].inUse = false
    }
  }

  /**
   * Updates the key pool with a new set of clients, reconciling existing state
   */
  updateKeys(newClients: Groq[]) {
    // Keep track of which new keys we already have (by comparing apiKey)
    const newKeys: KeyMetadata[] = []
    
    newClients.forEach((client, index) => {
      const apiKey = (client as any).apiKey
      // Try to find existing key metadata with same API key
      const existing = this.keys.find(k => (k.client as any).apiKey === apiKey)
      
      if (existing) {
        // Reuse existing metadata to preserve cooldown/inUse state
        newKeys.push({
          ...existing,
          index // Update index to match new array
        })
      } else {
        // New key
        newKeys.push({
          index,
          client,
          onCooldownUntil: 0,
          inUse: false
        })
      }
    })
    
    console.log(`[KeyManager] Reconciled keys: ${this.keys.length} -> ${newKeys.length}`)
    this.keys = newKeys
  }

  get totalKeys(): number {
    return this.keys.length
  }

  get healthyKeyCount(): number {
    const now = Date.now()
    return this.keys.filter(k => k.onCooldownUntil < now).length
  }
}

export class VulnerabilityAgent {
  private keyManager: KeyManager
  private clients: Groq[] = []
  private model: string = 'llama-3.3-70b-versatile'

  constructor(apiKey?: string, model: string = 'llama-3.3-70b-versatile') {
    let key = apiKey || process.env.GROQ_API_KEY

    // Fallback: Check if key is missing or looks like a placeholder (starts with "your_" or doesn't start with "gsk_")
    if (!key || key.trim().startsWith('your_') || !key.trim().startsWith('gsk_')) {
      try {
        const projectRoot = process.cwd()
        const envPath = path.join(projectRoot, '.env')
        console.log('[Agent] Checking .env file at:', envPath)
        
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8')
          const match = envContent.match(/^GROQ_API_KEY=(.*)$/m)
          if (match && match[1]) {
            const fileKey = match[1].trim()
            // Check if it's a list or a single key
            const firstKey = fileKey.split(',')[0].trim()
            if (firstKey && firstKey.startsWith('gsk_')) {
              console.log('[Agent] Found valid key(s) in .env file, overriding system env var')
              key = fileKey
              process.env.GROQ_API_KEY = fileKey 
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

    // Support for multiple comma-separated keys
    const keys = key.split(',').map(k => k.trim()).filter(k => k.length > 0 && k.startsWith('gsk_'))
    
    if (keys.length === 0) {
      throw new Error('No valid GROQ_API_KEYS found (must start with gsk_)')
    }

    console.log(`[Agent] Initializing with ${keys.length} API key(s)`)
    this.clients = keys.map(k => new Groq({ apiKey: k }))
    this.keyManager = new KeyManager(this.clients)
  }

  /**
   * Re-reads .env file and updates API keys dynamically
   */
  refreshKeys() {
    try {
      const projectRoot = process.cwd()
      const envPath = path.join(projectRoot, '.env')
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8')
        const match = envContent.match(/^GROQ_API_KEY=(.*)$/m)
        if (match && match[1]) {
          const fileKey = match[1].trim()
          const keys = fileKey.split(',').map(k => k.trim()).filter(k => k.length > 0 && k.startsWith('gsk_'))
          
          if (keys.length > 0) {
            const newClients = keys.map(k => new Groq({ apiKey: k }))
            this.clients = newClients
            this.keyManager.updateKeys(newClients)
          }
        }
      }
    } catch (err) {
      console.error('[Agent] Failed to refresh keys:', err)
    }
  }

  setModel(model: string): void {
    this.model = model
  }


  /**
   * Samples assets to keep payload size manageable
   */
  private sampleAssets(assets: Record<string, string[]>): Record<string, string[]> {
    const sampled: Record<string, string[]> = {}
    for (const [type, urls] of Object.entries(assets)) {
      sampled[type] = urls.slice(0, 5) // Only top 5 of each type
    }
    return sampled
  }

  /**
   * Downgrades the model to a more context-efficient one if hit by repeated errors
   */
  private downgradeModel(): boolean {
    const lighterModels = ['llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768']
    const currentIndex = lighterModels.indexOf(this.model)
    
    if (currentIndex < lighterModels.length - 1) {
      this.model = lighterModels[currentIndex + 1]
      console.log(`[Agent] Downgraded to model: ${this.model} for better token efficiency`)
      return true
    }
    return false
  }

  /**
   * Extracts JSON from AI response using multiple strategies
   */
  private extractJSON(response: string): string {
    // Strategy 1: Look for markdown code blocks (most common)
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    // Strategy 2: Look for XML-style tags
    const xmlMatch = response.match(/<(?:vulnerability|report|json)>([\s\S]*?)<\/(?:vulnerability|report|json)>/i)
    if (xmlMatch) {
      return xmlMatch[1].trim()
    }

    // Strategy 3: Look for JSON object or array (most permissive)
    // We look for the FIRST { or [ and the LAST } or ]
    const firstBrace = response.indexOf('{')
    const firstBracket = response.indexOf('[')
    let start = -1
    
    if (firstBrace !== -1 && firstBracket !== -1) {
      start = Math.min(firstBrace, firstBracket)
    } else if (firstBrace !== -1) {
      start = firstBrace
    } else if (firstBracket !== -1) {
      start = firstBracket
    }

    if (start !== -1) {
      const lastBrace = response.lastIndexOf('}')
      const lastBracket = response.lastIndexOf(']')
      const end = Math.max(lastBrace, lastBracket)
      
      if (end > start) {
        // Validation: sometimes AI wraps it in ` ``` ` and we missed it with regex
        // Strip any leading/trailing backticks or quote-like debris
        return response.substring(start, end + 1).trim()
      }
    }

    // Strategy 4: Return stripped response if it looks like JSON
    const trimmed = response.trim().replace(/^`+|`+$/g, '')
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return trimmed
    }

    throw new Error('Could not extract JSON from AI response')
  }

  /**
   * Creates data clusters to process large datasets in batches
   * Groups similar data types together to reduce payload per request
   */
  private createDataClusters(data: CrawledDataSummary, numKeys: number = 1): CrawledDataSummary[] {
    // Dynamically adjust cluster size: if we have more keys, use smaller clusters to increase parallelism
    // Minimum 3 results per cluster to stay efficient, max 8 to stay within token limits
    const CLUSTER_SIZE = numKeys > 1 
      ? Math.max(3, Math.min(8, Math.ceil(data.crawlResults.length / numKeys)))
      : 8
      
    const clusters: CrawledDataSummary[] = []
    console.log(`[Agent] Using dynamic cluster size: ${CLUSTER_SIZE} based on ${numKeys} keys`)

    // Split crawl results into clusters
    const crawlClusters: CrawlResult[][] = []
    for (let i = 0; i < data.crawlResults.length; i += CLUSTER_SIZE) {
      crawlClusters.push(data.crawlResults.slice(i, i + CLUSTER_SIZE))
    }

    // Split API calls into clusters
    const apiClusters: ApiCall[][] = []
    for (let i = 0; i < data.allApiCalls.length; i += CLUSTER_SIZE) {
      apiClusters.push(data.allApiCalls.slice(i, i + CLUSTER_SIZE))
    }

    // Create balanced clusters that combine different data types
    const maxClusters = Math.max(crawlClusters.length, apiClusters.length, 1)

    for (let i = 0; i < maxClusters; i++) {
      const cluster: CrawledDataSummary = {
        crawlResults: crawlClusters[i] || [],
        allApiCalls: apiClusters[i] || [],
        allCookies: data.allCookies.slice(0, 10), // Reduced from all to top 10
        allEmails: data.allEmails.slice(0, 10),   // Reduced from all to top 10
        allAssets: this.sampleAssets(data.allAssets), // Sampled assets
        discoveredDomains: data.discoveredDomains.slice(0, 10), // Sampled domains
        fuzzResults: data.fuzzResults?.slice(0, 5) // Sampled fuzz results
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
    totalClusters: number,
    workerId: number,
    onQuotaExhausted?: (exhausted: boolean) => void
  ): Promise<VulnerabilityReport> {
    console.group(`[Worker ${workerId}] Cluster ${clusterIndex + 1}/${totalClusters}`)
    try {
      const prompt = this.buildAnalysisPrompt(clusterData, clusterIndex, totalClusters)
      const leasedKey = await this.keyManager.leaseKey()
    
    if (!leasedKey) {
      console.warn(`[Batch] No healthy keys available for cluster ${clusterIndex + 1}. Stopping analysis.`)
      if (onQuotaExhausted) onQuotaExhausted(true)
      throw new Error('API quota exhausted. All keys are on cooldown.')
    }

    if (onQuotaExhausted) onQuotaExhausted(false)

    try {
      console.log(`[Batch] Analyzing cluster ${clusterIndex + 1}/${totalClusters} (Key #${leasedKey.index + 1})...`)
        
      const message = await leasedKey.client.chat.completions.create({
          model: this.model,
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

        let parsed: any;
        let jsonString = response;
        try {
          parsed = JSON.parse(response)
        } catch (parseError) {
          console.log('[Agent] JSON parse failed, trying extractor:', parseError)
          jsonString = this.extractJSON(response)
          try {
            parsed = JSON.parse(jsonString)
          } catch (innerError) {
            console.error('[Agent] Extracted JSON still invalid:', jsonString)
            throw innerError
          }
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

        // Successful request, release the key
        this.keyManager.releaseKey(leasedKey.index)
        return report

    } catch (error: any) {
        // Handle Rate Limit (429) OR Payload Too Large (413) gracefully
        const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded' || error?.message?.includes('rate limit')
        const isPayloadTooLarge = error?.status === 413 || error?.message?.includes('too large')
        
        if (isRateLimit) {
          console.error(`[Agent] Rate limit exceeded for key #${leasedKey.index + 1}. Marking as cooling down.`)
          this.keyManager.markCooldown(leasedKey.index, 3600000) // 1 hour cooldown as requested
          throw new Error(`API Key #${leasedKey.index + 1} exhausted. Rate limit hit.`)
        }

        if (isPayloadTooLarge) {
          console.warn(`[Agent] Payload size limit exceeded for key #${leasedKey.index + 1}.`)
          this.keyManager.releaseKey(leasedKey.index)
          this.downgradeModel() // Prepare for next cluster
          throw new Error(`Payload too large for API Key #${leasedKey.index + 1}.`)
        }

        // For any other error, release the key and throw
        this.keyManager.releaseKey(leasedKey.index)

        if (error instanceof z.ZodError) {
          const issues = (error as any).issues || (error as any).errors || []
          console.error(`Cluster ${clusterIndex + 1} Zod validation error:`, JSON.stringify(issues, null, 2))
          throw new Error(`Invalid response format from AI in cluster ${clusterIndex + 1}: ${issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
        }
        if (error instanceof SyntaxError) {
          console.error(`Cluster ${clusterIndex + 1} JSON parse error:`, error.message)
          throw new Error(`Failed to parse JSON from cluster ${clusterIndex + 1}: ${error.message}`)
        }
        throw error
      }
    } finally {
      console.groupEnd()
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
    crawledData: CrawledDataSummary,
    onQuotaExhausted?: (exhausted: boolean) => void
  ): Promise<VulnerabilityReport> {
    this.refreshKeys()
    try {
      const numKeys = this.clients.length
      const clusters = this.createDataClusters(crawledData, numKeys)
      console.log(`Starting parallel analysis: ${clusters.length} clusters across ${numKeys} keys...`)

      // Use a worker pool pattern for parallel analysis with global key leasing
      // CRITICAL: Cap concurrency at 8 to prevent system/IPC overload (fixes code 58)
      const MAX_CONCURRENCY = 8
      const workerCount = Math.min(this.keyManager.totalKeys, clusters.length, MAX_CONCURRENCY)
      const clusterReports: VulnerabilityReport[] = []
      const queue = [...clusters]
      
      console.log(`Launching ${workerCount} parallel workers for ${clusters.length} clusters (Cap: ${MAX_CONCURRENCY})...`)

      const workerPromises = Array.from({ length: workerCount }, async (_, workerIndex) => {
        // Reduced staggering: 200ms is enough to avoid initial collision while still being fast
        await new Promise(resolve => setTimeout(resolve, workerIndex * 200))
        
        while (queue.length > 0) {
          const cluster = queue.shift()
          if (!cluster) break
          
          const clusterIndex = clusters.indexOf(cluster)
          
          try {
            const result = await this.analyzeDataCluster(cluster, clusterIndex, clusters.length, workerIndex + 1, onQuotaExhausted)
            clusterReports.push(result)
          } catch (err) {
            console.error(`[Worker ${workerIndex + 1}] Failed to analyze cluster ${clusterIndex + 1}:`, err)
          }
          
          // Minimal breathing room between clusters on the same worker
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      })

      await Promise.all(workerPromises)

      console.log('Merging parallel analysis results...')
      const mergedReport = this.mergeVulnerabilityReports(clusterReports)

      console.log(`Final report: ${mergedReport.statistics.total} vulnerabilities found`)
      return mergedReport
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Zod validation error:', JSON.stringify(error.issues, null, 2))
        throw new Error(`Invalid response format from AI: ${error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
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
    targetUrl: string,
    onQuotaExhausted?: (exhausted: boolean) => void
  ): Promise<FullReport> {
    this.refreshKeys()
    const enrichedVulnerabilities = selectedVulnerabilities.map(v => this.enrichVulnerability(v))
    console.log(`[Agent] Enriched ${enrichedVulnerabilities.length} vulnerabilities for report generation`)
    
    const generate = async (vulnerabilities: Vulnerability[], allowFallback: boolean): Promise<FullReport> => {
      const prompt = this.buildFullReportPrompt(
        vulnerabilities,
        crawledData,
        targetUrl
      )

      const leasedKey = await this.keyManager.leaseKey()
      
      if (!leasedKey) {
        console.warn(`[Agent] No healthy keys available for report. Stopping.`)
        if (onQuotaExhausted) onQuotaExhausted(true)
        throw new Error('API quota exhausted. All keys are on cooldown.')
      }

      if (onQuotaExhausted) onQuotaExhausted(false)

        try {
          console.log(`[Agent] Generating report (Key #${leasedKey.index + 1})...`)
          const message = await leasedKey.client.chat.completions.create({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: `You are a professional penetration tester writing formal security reports. You MUST respond with ONLY valid JSON wrapped in <report> tags.`
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
            this.keyManager.releaseKey(leasedKey.index)
            throw new Error('Invalid response format from AI')
          }
          
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          const parsed = JSON.parse(jsonStr)
          const validated = FullReportSchema.parse(parsed)
          
          this.keyManager.releaseKey(leasedKey.index)
          
          // CRITICAL: Merge original metadata (CWE, CVSS, Proof, References) 
          // into the AI-generated report in case it was omitted
          const mergedVulnerabilities = validated.vulnerabilities.map(v => {
            const original = vulnerabilities.find(ov => ov.id === v.id || ov.title === v.title)
            if (original) {
              return {
                ...v,
                id: v.id || original.id,
                cwe: v.cwe || original.cwe,
                cvss: v.cvss || original.cvss,
                proof: v.proof || original.proof,
                references: (v.references && v.references.length > 0) ? v.references : original.references,
                affectedAssets: (v.affectedAssets && v.affectedAssets.length > 0) ? v.affectedAssets : original.affectedAssets
              }
            }
            return v
          })

          return {
            ...validated,
            vulnerabilities: mergedVulnerabilities,
            generatedAt: new Date().toISOString()
          }
        } catch (error: any) {
          const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded' || error?.message?.includes('rate limit')
          const isPayloadTooLarge = error?.status === 413 || error?.message?.includes('too large')

          if (isRateLimit) {
            console.error(`[Agent] Rate limit exceeded for key #${leasedKey.index + 1} during report generation.`)
            this.keyManager.markCooldown(leasedKey.index, 3600000) // 1 hour cooldown
            throw new Error(`API Key #${leasedKey.index + 1} exhausted during report generation.`)
          }

          if (isPayloadTooLarge) {
            console.warn(`[Agent] Payload size limit exceeded for key #${leasedKey.index + 1} during report generation.`)
            this.keyManager.releaseKey(leasedKey.index)
            this.downgradeModel()
            throw new Error(`Payload too large during report generation.`)
          }

          this.keyManager.releaseKey(leasedKey.index)
          
          if (allowFallback) {
            console.error('[Agent] Final report generation failed, using simplified fallback', error)
            return this.generateSimplifiedReport(vulnerabilities, targetUrl)
          }
          throw error
      }
    }

    return generate(enrichedVulnerabilities, true)
  }

  /**
   * Generates a simplified report when AI generation fails
   */
  private generateSimplifiedReport(vulnerabilities: Vulnerability[], targetUrl: string): FullReport {
    const stats = {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      info: vulnerabilities.filter(v => v.severity === 'info').length
    }

    return {
      title: `Security Assessment Report for ${targetUrl}`,
      executive_summary: `This is an automatically generated summary of the security assessment conducted on ${targetUrl}. The scan identified ${vulnerabilities.length} vulnerabilities.`,
      vulnerabilities,
      statistics: stats,
      methodology: "Automated vulnerability scan and analysis.",
      recommendations: [
        "Address all critical and high-severity findings immediately.",
        "Implement a regular security scanning cadence.",
        "Review and harden server configurations."
      ],
      generatedAt: new Date().toISOString()
    }
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

    // Aggressively limit context data if it's too large
    const summarizedAssets = {
      js: (data.allAssets?.['js'] || []).slice(0, 5),
      css: (data.allAssets?.['css'] || []).slice(0, 3),
      images: (data.allAssets?.['images'] || []).length + ' images'
    }

    return `You are an expert security analyst. Analyze this web application crawl data segment for vulnerabilities.${clusterInfo}
Batch Stats: Pages: ${data.crawlResults.length}, APIs: ${data.allApiCalls.length}, Forms: ${data.crawlResults.reduce((sum, r) => sum + (r.forms?.length || 0), 0)}

DATA (JSON):
${JSON.stringify({
  pages: summarizedCrawl,
  apis: summarizedApi,
  cookies: data.allCookies.slice(0, 5),
  assets: summarizedAssets
}, null, 0)}

INSTRUCTIONS:
1. Identify high-confidence vulnerabilities.
2. Provide technical proof (payload, parameter).
3. Follow strict JSON format.

OUTPUT JSON:
<vulnerability>
{
  "summary": "...",
  "vulnerabilities": [{"title": "...", "severity": "...", "description": "...", "proof": {...}}],
  "statistics": {"total": 1, "critical": 0, "high": 1, "medium": 0, "low": 0}
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
      "cwe": "CWE-1004",
      "cvss": 7.5,
      "type": "Cookie Security",
      "description": "Detailed technical description with evidence and impact analysis.",
      "location": "https://example.com/path",
      "recommendation": "Specific remediation steps with code examples where applicable.",
      "affectedAssets": ["https://example.com/asset1", "https://example.com/asset2"],
      "proof": {
        "payload": "Set-Cookie: session=xyz; Path=/; Secure",
        "parameter": "session",
        "confidence": "High"
      },
      "references": ["https://owasp.org/www-community/HttpOnly"]
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
    const leasedKey = await this.keyManager.leaseKey()
    if (!leasedKey) return false

    try {
      const message = await leasedKey.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'Say "Connected" only.'
          }
        ],
        max_tokens: 10
      })
      this.keyManager.releaseKey(leasedKey.index)
      return !!message.choices[0]?.message?.content
    } catch (error) {
      console.error('Connection test failed:', error)
      this.keyManager.releaseKey(leasedKey.index)
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
