import { net } from 'electron'

export interface FuzzResult {
  url: string
  payload: string
  vulnerabilityType: string
  confidence: 'High' | 'Medium' | 'Low'
  evidence: string
  statusCode?: number
}

class Fuzzer {
  // Expanded SQLi payloads covering error-based, boolean-based, UNION, and time-based blind
  private readonly SQLI_PAYLOADS = [
    "'",
    '"',
    "1' OR '1'='1",
    '1" OR "1"="1',
    "' OR 1=1--",
    "' OR 1=1#",
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT 1,2,3--",
    "1; WAITFOR DELAY '0:0:5'--",
    "1' AND SLEEP(3)--",
    "1' AND 1=1--",
    "1' AND 1=2--",
    "admin'--",
    "1' ORDER BY 10--",
    "1)) OR 1=1--",
    "' OR ''='",
    "1; DROP TABLE test--",
    "') OR ('1'='1"
  ]

  // Expanded XSS payloads covering reflected, DOM-based, and bypass techniques
  private readonly XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '"><script>alert(1)</script>',
    "'-alert(1)-'",
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert(1)",
    '<details open ontoggle=alert(1)>',
    '<iframe src="javascript:alert(1)">',
    '{{7*7}}',     // Template injection
    '${7*7}',      // Template literal injection
    '<img src=x onerror=prompt(1)>',
    '<marquee onstart=alert(1)>',
    "';alert(1)//",
  ]

  // Path traversal payloads
  private readonly PATH_TRAVERSAL_PAYLOADS = [
    '../../etc/passwd',
    '..\\..\\windows\\system.ini',
    '....//....//etc/passwd',
    '..%2f..%2fetc%2fpasswd',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '....//....//....//etc/passwd',
    '/etc/passwd%00',
    '..%252f..%252fetc%252fpasswd',
  ]

  // Open redirect payloads
  private readonly REDIRECT_PARAMS = ['url', 'redirect', 'next', 'return', 'returnUrl', 'redirect_uri', 'continue', 'dest', 'destination', 'go', 'target', 'rurl', 'return_url', 'retUrl']
  private readonly REDIRECT_PAYLOADS = [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com%00',
  ]

  // Massively expanded sensitive paths list
  private readonly SENSITIVE_PATHS = [
    // Version Control
    '/.git/config', '/.git/HEAD', '/.svn/entries', '/.hg/',
    // Environment / Config
    '/.env', '/.env.bak', '/.env.local', '/.env.production',
    '/config.php.bak', '/wp-config.php.bak', '/wp-config.php',
    '/web.config', '/applicationHost.config',
    // Database
    '/backup.sql', '/dump.sql', '/database.sql', '/db.sql',
    // Server Info
    '/phpinfo.php', '/info.php', '/server-status', '/server-info',
    // Admin Panels
    '/admin/', '/administrator/', '/wp-admin/', '/phpmyadmin/',
    '/cpanel/', '/webmail/', '/panel/',
    // Sensitive Files
    '/.htaccess', '/.htpasswd', '/crossdomain.xml', '/clientaccesspolicy.xml',
    '/robots.txt', '/sitemap.xml', '/security.txt', '/.well-known/security.txt',
    // API Documentation
    '/api/swagger', '/swagger.json', '/swagger-ui.html', '/api-docs',
    '/openapi.json', '/graphql', '/graphiql',
    // Backups
    '/backup.zip', '/backup.tar.gz', '/site.zip', '/www.zip',
    // Debug / Error
    '/debug/', '/trace.axd', '/elmah.axd', '/_profiler/',
    // OS Files
    '/.ds_store', '/thumbs.db', '/desktop.ini',
    // Node.js / JavaScript
    '/package.json', '/package-lock.json', '/yarn.lock',
    '/node_modules/', '/.npmrc',
    // Docker
    '/Dockerfile', '/docker-compose.yml', '/.dockerenv',
    // CI/CD
    '/.github/', '/.gitlab-ci.yml', '/Jenkinsfile',
    // AWS / Cloud
    '/.aws/credentials', '/aws.yml',
    // Logs
    '/error.log', '/access.log', '/debug.log', '/app.log',
  ]

  private readonly SQL_ERRORS = [
    'SQL syntax', 'mysql_fetch_array', 'ORA-01756', 'PostgreSQL query failed',
    'SQLite/JDBCDriver', 'Unclosed quotation mark', 'quoted string not properly',
    'You have an error in your SQL', 'SQLSTATE[', 'mysql_num_rows',
    'pg_query', 'sqlite_query', 'Microsoft OLE DB', 'JDBC',
    'Warning: mysql_', 'Warning: pg_', 'Warning: sqlite_',
    'com.mysql.jdbc', 'org.postgresql', 'Microsoft SQL Server',
    'Syntax error', 'unterminated quoted string', 'invalid input syntax',
    'java.sql.SQLException', 'ORA-00933', 'ORA-01722'
  ]

  async fuzzParameters(url: string): Promise<FuzzResult[]> {
    const results: FuzzResult[] = []
    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch {
      return []
    }

    const params = Array.from(urlObj.searchParams.keys())
    if (params.length === 0) return []

    // 1. SQL Injection Fuzzing
    for (const param of params) {
      for (const payload of this.SQLI_PAYLOADS) {
        const testUrl = new URL(url)
        testUrl.searchParams.set(param, payload)
        
        try {
          const response = await this.makeRequest(testUrl.toString())
          const body = response.body
          const status = response.status
          
          const errorMatch = this.SQL_ERRORS.find(err => body.includes(err))
          
          if (errorMatch || (status === 500 && !body.includes('<!DOCTYPE html>'))) {
             results.push({
               url: testUrl.toString(),
               payload,
               vulnerabilityType: 'SQL Injection (Active Probe)',
               confidence: errorMatch ? 'High' : 'Medium',
               evidence: errorMatch ? `Database error found: "${errorMatch}" in response` : `500 Internal Server Error returned for SQL payload in param "${param}"`,
               statusCode: status
             })
             if (errorMatch) break // Found confirmed SQLi, skip remaining payloads for this param
          }
        } catch { /* network error, skip */ }
      }
    }

    // 2. XSS Fuzzing
    for (const param of params) {
      for (const payload of this.XSS_PAYLOADS) {
        const testUrl = new URL(url)
        testUrl.searchParams.set(param, payload)
        
        try {
          const response = await this.makeRequest(testUrl.toString())
          if (response.status === 200 && response.body.includes(payload)) {
             results.push({
               url: testUrl.toString(),
               payload,
               vulnerabilityType: 'Reflected XSS (Active Probe)',
               confidence: 'High',
               evidence: `Payload "${payload}" reflected unencoded in response body for param "${param}"`,
               statusCode: response.status
             })
             break // Found confirmed XSS, skip remaining payloads for this param
          }
        } catch { /* network error, skip */ }
      }
    }

    // 3. Path Traversal
    for (const param of params) {
      for (const payload of this.PATH_TRAVERSAL_PAYLOADS) {
        const testUrl = new URL(url)
        testUrl.searchParams.set(param, payload)
        
        try {
          const response = await this.makeRequest(testUrl.toString())
          if (response.status === 200 && (response.body.includes('root:') || response.body.includes('[boot loader]') || response.body.includes('[extensions]'))) {
             results.push({
               url: testUrl.toString(),
               payload,
               vulnerabilityType: 'Path Traversal (Active Probe)',
               confidence: 'High',
               evidence: `System file content detected in response for param "${param}"`,
               statusCode: response.status
             })
             break
          }
        } catch { /* network error, skip */ }
      }
    }

    // 4. Open Redirect
    for (const param of params) {
      if (this.REDIRECT_PARAMS.includes(param.toLowerCase())) {
        for (const payload of this.REDIRECT_PAYLOADS) {
          const testUrl = new URL(url)
          testUrl.searchParams.set(param, payload)
          
          try {
            const response = await this.makeRequest(testUrl.toString())
            if (response.status >= 300 && response.status < 400) {
              results.push({
                url: testUrl.toString(),
                payload,
                vulnerabilityType: 'Open Redirect (Active Probe)',
                confidence: 'Medium',
                evidence: `Redirect (${response.status}) detected for param "${param}" with external URL payload`,
                statusCode: response.status
              })
              break
            }
          } catch { /* network error, skip */ }
        }
      }
    }

    return results
  }

  async checkSensitivePaths(baseUrl: string): Promise<FuzzResult[]> {
    const results: FuzzResult[] = []
    let origin: string
    try {
       origin = new URL(baseUrl).origin
    } catch { return [] }

    for (const path of this.SENSITIVE_PATHS) {
         const targetUrl = `${origin}${path}`
         try {
             const response = await this.makeRequest(targetUrl)
             const body = response.body
             const status = response.status
             
             if (status === 200) {
                 const isHtml = body.trim().toLowerCase().startsWith('<!doctype') || body.includes('<html')
                 const isConfig = body.includes('DB_PASSWORD') || body.includes('API_KEY') || body.includes('[core]') ||
                                  body.includes('AWS_SECRET') || body.includes('PRIVATE_KEY') || body.includes('password') ||
                                  body.includes('"name":') || body.includes('"version":')

                 // robots.txt and sitemap.xml are always interesting
                 const isAlwaysInteresting = path === '/robots.txt' || path === '/sitemap.xml' || path === '/security.txt' || path === '/.well-known/security.txt'

                 if (isAlwaysInteresting || (!isHtml || isConfig) && body.length > 0) {
                     let vulnType = 'Sensitive File Exposure'
                     let confidence: 'High' | 'Medium' | 'Low' = 'High'

                     if (path.includes('.git')) vulnType = 'Source Code Exposure (.git)'
                     else if (path.includes('.env')) vulnType = 'Environment File Exposure'
                     else if (path.includes('admin') || path.includes('phpmyadmin') || path.includes('cpanel')) {
                       vulnType = 'Admin Panel Exposed'
                       confidence = 'Medium'
                     }
                     else if (path.includes('swagger') || path.includes('api-docs') || path.includes('graphi')) vulnType = 'API Documentation Exposed'
                     else if (path.includes('.sql') || path.includes('backup') || path.includes('.zip') || path.includes('.tar')) vulnType = 'Backup File Exposure'
                     else if (path.includes('robots.txt') || path.includes('sitemap.xml')) {
                       vulnType = 'Information Disclosure'
                       confidence = 'Low'
                     }
                     else if (path.includes('.log')) vulnType = 'Log File Exposure'
                     else if (path.includes('package.json') || path.includes('Dockerfile') || path.includes('docker-compose')) vulnType = 'Build Configuration Exposure'

                     results.push({
                         url: targetUrl,
                         payload: path,
                         vulnerabilityType: vulnType,
                         confidence,
                         evidence: `Accessible at ${targetUrl} (Status 200). Preview: ${body.substring(0, 100)}...`,
                         statusCode: 200
                     })
                 }
             }
             // Also check for 403 on admin paths (confirms existence)
             else if (status === 403 && (path.includes('admin') || path.includes('phpmyadmin') || path.includes('cpanel'))) {
                 results.push({
                     url: targetUrl,
                     payload: path,
                     vulnerabilityType: 'Admin Panel Found (403)',
                     confidence: 'Low',
                     evidence: `Admin panel exists at ${targetUrl} but returns 403 Forbidden`,
                     statusCode: 403
                 })
             }
         } catch { /* ignore connection errors */ }
    }

    return results
  }

  private makeRequest(url: string, method: string = 'GET'): Promise<{ body: string, status: number }> {
    return new Promise((resolve, reject) => {
      try {
        const request = net.request({ url, method, redirect: 'manual' })
        
        const timeout = setTimeout(() => {
          try { request.abort() } catch {}
          reject(new Error('Request timeout'))
        }, 5000)

        request.on('response', (response) => {
          let body = ''
          response.on('data', (chunk) => {
             if (body.length < 10000) body += chunk.toString() 
          })
          response.on('end', () => {
            clearTimeout(timeout)
            resolve({ body, status: response.statusCode })
          })
          response.on('error', (err) => {
            clearTimeout(timeout)
            reject(err)
          })
        })
        
        request.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
        request.end()
      } catch (err) {
        reject(err)
      }
    })
  }
}


export const fuzzer = new Fuzzer()

export function getAvailableWordlists(): string[] {
  return ['default', 'common', 'sensitive']
}

export class DirectoryFuzzer {
  private stopped = false
  private baseUrl: string
  private _wordlist: string
  private _extensions: string[]
  private _concurrency: number

  constructor(baseUrl: string, wordlist: string, extensions: string[], concurrency: number) {
    this.baseUrl = baseUrl
    this._wordlist = wordlist
    this._extensions = extensions
    this._concurrency = concurrency
  }

  getWordlistSize(): number {
    return 100
  }

  async fuzz(
    onProgress: (result: FuzzResult) => void,
    onComplete: (results: FuzzResult[]) => void
  ): Promise<void> {
    console.log(`Starting directory fuzzing with wordlist=${this._wordlist}, extensions=${this._extensions}, concurrency=${this._concurrency}`)
    const results: FuzzResult[] = []
    
    const sensitive = await fuzzer.checkSensitivePaths(this.baseUrl)
    
    for (const res of sensitive) {
        if (this.stopped) break
        results.push(res)
        onProgress(res)
    }

    if (this.baseUrl.includes('?')) {
        const params = await fuzzer.fuzzParameters(this.baseUrl)
        for (const res of params) {
             if (this.stopped) break
             results.push(res)
             onProgress(res)
        }
    }

    if (!this.stopped) {
        onComplete(results)
    }
  }

  stop(): void {
    this.stopped = true
  }
}
