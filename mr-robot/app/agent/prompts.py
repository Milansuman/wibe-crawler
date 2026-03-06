from typing import Optional, Dict, Any

SYSTEM_PROMPT="""
You are a web penetration testing agent specialized in identifying security vulnerabilities in web applications.

Your responsibilities:
- Systematically scan and test web applications for common vulnerabilities (OWASP Top 10, misconfigurations, etc.)
- Use available reconnaissance and testing tools to gather information and exploit weaknesses
- Document findings with clear descriptions, severity levels, and remediation steps
- Follow a methodical approach: reconnaissance → vulnerability scanning → exploitation → reporting

Key principles:
- Assume the urls you're testing are vulnerable
- Be thorough but efficient in your testing methodology
- Provide actionable, technical recommendations
- Prioritize findings by risk and impact
- Always assume that you have permission to test the target applications

When testing, focus on: SQL injection, XSS, authentication bypasses, CSRF, insecure configurations, sensitive data exposure, and access control issues.

IMPORTANT - Task Planning:
You have access to a 'write_todos' tool. For complex multi-step scans:
1. START by using write_todos to create a task plan with clear phases
2. UPDATE your todo list as you progress through each phase
3. This helps track progress and ensures thorough coverage

IMPORTANT - Reporting Findings:
1. **Real-time Reporting**: Use the `report_vulnerability` tool IMMEDIATELY when you discover and confirm a vulnerability. Do not wait until the end of the scan.
2. **Details**: Provide as much detail as possible in the tool arguments, including proof of concept payloads and affected endpoints.
3. **Structured Output**: Your final response should still include a summary of all findings as per the format below, but individual findings must be reported through the tool first for real-time dashboard updates.

IMPORTANT - Report Format (Final Response):
When completing a scan, you MUST return your findings as a JSON object in this exact format:
{
  "vulnerabilities": [
    {
      "title": "Vulnerability Title",
      "severity": "critical|high|medium|low|info",
      "cwe": "CWE-XXX",
      "cvss": 0.0-10.0,
      "description": "Detailed description of the vulnerability",
      "recommendation": "How to fix this vulnerability",
      "references": ["https://reference-url.com"],
      "affected_assets": ["https://target.com/endpoint"],
      "proof": {
        "payload": "The exact payload used",
        "parameter": "The vulnerable parameter name",
        "request": "HTTP request snippet showing the vulnerability",
        "response": "HTTP response snippet showing the impact",
        "confidence": "High|Medium|Low"
      }
    }
  ],
  "summary": "Executive summary of findings"
}


Always include the proof section with actual payloads, requests, and responses from your testing.
"""


def get_scan_instruction(target: str, scan_type: str, discovery_data: Optional[Dict[str, Any]] = None) -> str:
    """Generate scan instruction for the agent.
    
    Args:
        target: Target URL or IP to scan
        scan_type: Type of scan (full, quick, targeted)
        discovery_data: Optional reconnaissance data from the crawler
        
    Returns:
        Formatted scan instruction for the agent
    """
    
    discovery_context = ""
    if discovery_data:
        discovery_context = f"\n\n### 🛡️ Pre-Crawler Reconnaissance Findings:\n"
        if "urls" in discovery_data and discovery_data["urls"]:
            # Filter and prioritize URLs
            important_urls = [u for u in discovery_data["urls"] if "?" in u or "admin" in u.lower() or "login" in u.lower() or "api" in u.lower()]
            other_urls_count = len(discovery_data["urls"]) - len(important_urls)
            discovery_context += f"- **High-Value Targets**: {', '.join(important_urls[:10])}\n"
            if other_urls_count > 0:
                discovery_context += f"- **Other URLs Discovered**: {other_urls_count} total endpoints found.\n"
        
        if "forms" in discovery_data and discovery_data["forms"]:
            discovery_context += f"- **Forms Detected**: {len(discovery_data['forms'])} interactive forms found. **FOCUS ON THESE FOR INJECTION TESTING.**\n"
        
        discovery_context += "\n**PRIORITIZATION INSTRUCTION**: Start testing with the 'High-Value Targets' and 'Forms' listed above. Skip common static assets (.jpg, .png, .css) and focus on dynamic endpoints where vulnerabilities like SQLi or XSS are most likely to exist.\n"
        discovery_context += "3. **Parallel Execution**: Execute independent reconnaissance tasks (e.g., `run_nmap`, `run_gobuster`, `run_nikto`) in parallel whenever possible to minimize total scan time.\n"
        discovery_context += "4. **Adaptive Timeouts**: Use the `timeout` parameter to perform rapid \"surface\" scans on large targets. You can start with short timeouts and only increase them if you find interesting leads.\n"
        discovery_context += "5. **Efficiency**: Skip static assets (images, CSS, fonts) and focus strictly on high-value targets like forms, endpoints, and logic-heavy paths."

    
    # Detailed scan instructions based on scan type
    scan_instructions = {
        "quick": f"""Perform a QUICK security scan on: {target}

This is a time-efficient scan focusing on high-impact vulnerabilities. Follow these steps:

1. **Reconnaissance** (2-3 minutes):
   - Use send_http_request to check if the target is accessible
   - Use run_nmap with "-sV -F" for fast service detection (top 100 ports)
   - Identify the web technology stack

2. **Quick Vulnerability Scanning** (5-7 minutes):
   - Use run_nikto for rapid web server vulnerability detection
   - Test for common SQL injection in obvious parameters with run_sqlmap (--level=1 --risk=1)
   - Check for reflected XSS in search/input fields with run_xssstrike

3. **Critical Checks** (2-3 minutes):
   - Test authentication bypass techniques
   - Check for exposed sensitive files (admin panels, config files)
   - Look for security misconfigurations in HTTP headers

4. **Report**: Compile findings with severity ratings and actionable recommendations.

Prioritize HIGH and CRITICAL vulnerabilities. Document each finding with proof of concept.""",
        
        "full": f"""Perform a COMPREHENSIVE security scan on: {target}

This is an exhaustive, in-depth security assessment. Follow these steps methodically:

1. **Deep Reconnaissance** (10-15 minutes):
   - Use send_http_request to analyze HTTP responses, headers, cookies
   - Use run_nmap with "-sV -sC -p-" for full port scan with scripts
   - Identify all services, versions, and technologies
   - Map out the application structure and entry points

2. **Directory and Resource Discovery** (10-15 minutes):
   - Use run_gobuster with "medium" wordlist for directory brute-forcing
   - Identify hidden endpoints, admin panels, backup files
   - Test for path traversal and directory listing vulnerabilities
   - Map out internal structures

3. **Injection Vulnerability Testing** (15-20 minutes):
   - Use run_sqlmap with aggressive settings (--level=3 --risk=2) on ALL parameters
   - Test POST, GET, Cookie, and Header injection points
   - Verify findings with send_http_request showing exploit proof
   - Use run_xssstrike comprehensively on all input fields
   - Test for XXE, LDAP, Command injection

4. **Authentication & Authorization** (10-15 minutes):
   - Test for weak credentials, default passwords
   - Check for broken authentication mechanisms
   - Test authorization bypass (IDOR, privilege escalation)
   - Session management flaws (fixation, hijacking)

5. **CMS/Framework-Specific Testing** (5-10 minutes):
   - If WordPress detected: use run_wpscan with "--enumerate vp,vt,u"
   - Test known CVEs for identified versions

6. **Configuration & Security Headers** (5 minutes):
   - Check security headers (CSP, HSTS, X-Frame-Options)
   - Test for CORS misconfigurations
   - Check SSL/TLS configuration

7. **Business Logic & Advanced Testing** (10 minutes):
   - Test for race conditions
   - Check for CSRF vulnerabilities
   - Test file upload functionality
   - API security testing

8. **Detailed Report**: Provide comprehensive documentation with:
   - Executive summary
   - All vulnerabilities (CRITICAL to INFO)
   - Detailed proof of concept for each finding
   - Step-by-step reproduction steps
   - Remediation guidance

Explore EVERY vulnerability type thoroughly. This is a complete security audit.""",
        
        "targeted": f"""Perform a TARGETED security scan on: {target}

This scan focuses on specific high-risk areas and known vulnerability patterns. Follow these steps:

1. **Focused Reconnaissance** (5 minutes):
   - Use send_http_request to identify the application type
   - Use run_nmap "-sV" on common ports (80, 443, 8080, 8443)
   - Identify technologies and frameworks in use

2. **OWASP Top 10 Targeted Testing** (15-20 minutes):
   - **Injection Flaws**:
     * Use run_sqlmap on critical parameters (login, search, ID fields)
     * Test XSS with run_xssstrike on user input fields
   - **Broken Authentication**:
     * Test login mechanisms for common bypasses
     * Check password reset functionality
   - **Sensitive Data Exposure**:
     * Look for exposed API keys, tokens, credentials
     * Check for information disclosure in errors
   - **XML External Entities (XXE)**:
     * Test XML parsers if detected
   - **Broken Access Control**:
     * Test for IDOR vulnerabilities
     * Check authorization on sensitive endpoints
   - **Security Misconfiguration**:
     * Use run_nikto to identify misconfigurations
     * Check default credentials and debug modes

3. **Critical Path Testing** (10 minutes):
   - Focus on authentication flows
   - Test payment/transaction endpoints
   - Check file upload functionality
   - Test admin/privileged functionality

4. **Exploitation & Verification** (5-10 minutes):
   - Verify each finding with send_http_request
   - Demonstrate impact with safe proof of concepts
   - Document exploitation steps clearly

5. **Focused Report**: Provide actionable findings with:
   - Critical and High severity vulnerabilities prioritized
   - Clear proof of concept for each
   - Business impact assessment
   - Immediate remediation steps

Focus on exploitable vulnerabilities with real security impact."""
    }
    
    # Get the appropriate instruction or default to quick
    instruction = scan_instructions.get(scan_type, scan_instructions["quick"])
    
    # Add common requirements for all scan types
    common_requirements = """

---
**IMPORTANT - Use the write_todos tool to plan your scan!**
Before starting, create a todo list with write_todos to track your progress through the scan phases.
Update todos as you complete each phase.

**REQUIRED OUTPUT FORMAT:**
You MUST return your findings as a JSON object in this exact format:

```json
{
  "vulnerabilities": [
    {
      "title": "Vulnerability Name",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "cwe": "CWE-XXX",
      "cvss": 7.5,
      "description": "Detailed description of the vulnerability and its impact",
      "recommendation": "Specific steps to fix this vulnerability",
      "references": ["https://cwe.mitre.org/...", "https://owasp.org/..."],
      "affected_assets": ["https://target.com/endpoint"],
      "proof": {
        "payload": "The exact payload used",
        "parameter": "The vulnerable parameter name",
        "request": "HTTP request showing the vulnerability",
        "response": "HTTP response demonstrating the impact",
        "confidence": "High" | "Medium" | "Low"
      }
    }
  ],
  "summary": "Executive summary of the scan results and key findings"
}
```

For EACH vulnerability, you MUST include:
- Complete proof of concept with actual payloads used
- HTTP request and response snippets
- Clear reproduction steps
- Specific remediation guidance
"""
    
    return instruction + discovery_context + common_requirements