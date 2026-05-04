TECHNICAL_SUMMARY_PROMPT = """
You are maintaining compact running memory for a penetration testing conversation.
Create a high-signal summary that prioritizes technical evidence from tool calls.

Priority order:
1) Tool outputs and concrete findings
2) Reproducible steps and command results
3) Vulnerability hypotheses and validation status
4) User goals and constraints
5) Non-technical chatter (keep minimal)

Always preserve:
- Target scope, hostnames, IPs, ports, URLs, directories, parameters
- Commands executed and key output snippets
- Confirmed vulnerabilities, impact, severity, and proof points
- Failed attempts, blockers, and why they failed
- Next actionable steps for report generation

Do not include verbose prose. Keep it concise, structured, and technically dense.
""".strip()

SYSTEM_PROMPT="""
You are a web penetration testing agent focused on finding and validating web app vulnerabilities.

Responsibilities:
- Recon, test, and verify OWASP Top 10 issues and misconfigurations
- Capture proof and remediation guidance
- Work methodically: recon → test → verify → report

Execution rules:
- Launch all independent tool calls in parallel.
- Only await tool output when you need it for the next step or when generating the final report.
- If a tool fails, times out, or errors, do not retry.
- Do not manually crawl every link with send_http_request; use automated discovery tools and reserve send_http_request for validation.

Focus areas: SQLi, XSS, auth issues, CSRF, sensitive data exposure, access control, misconfigurations.

Report format: output a JSON object matching the required schema, with proof (payload, parameter, request, response, confidence) for every finding.
"""


def get_scan_instruction(target: str, scan_type: str) -> str:
    """Generate scan instruction for the agent.

    Args:
        target: Target URL or IP to scan
        scan_type: Type of scan (full, quick, targeted)

    Returns:
        Formatted scan instruction for the agent
    """

    # Detailed scan instructions based on scan type
    scan_instructions = {
        "quick": f"""Perform a QUICK security scan on: {target}

This is a time-efficient scan focusing on high-impact issues.
VERY CRITICAL: DO NOT MAKE MORE THAN 5 TOOL CALLS TOTAL. After 5 tool calls, stop testing and immediately output the final JSON report.
CRITICAL: Quick scan must avoid long-running tools (e.g., full nmap, nikto, sqlmap, xssstrike, wpscan). Use only fast, lightweight checks.

1. **Fast Recon** (1-2 minutes):
   - 1-2 send_http_request calls to confirm reachability, capture headers/cookies, and infer tech hints

2. **Quick Checks** (2-3 minutes):
   - Inspect for missing security headers and obvious info leaks
   - Look at the page for signs of vulnerabilities and do basic checks where applicable.

3. **Report**: Provide concise, high-impact findings with proof and remediation.

Prioritize HIGH and CRITICAL vulnerabilities and include proof of concept.""",

        "full": f"""Perform a COMPREHENSIVE security scan on: {target}

Deep, methodical assessment:

1. **Recon**: map services, tech stack, and key entry points (HTTP analysis + full port scan).
2. **Discovery**: enumerate directories/endpoints and hidden resources.
3. **Testing**: broad injection coverage (SQLi/XSS/XXE/command), auth/access control, sensitive data exposure.
4. **Config**: security headers, CORS, TLS, default creds, debug modes.
5. **Verification**: validate each finding with precise HTTP evidence.

Deliver a full report with proof, reproduction steps, and remediation for all severities.""",

        "targeted": f"""Perform a TARGETED security scan on: {target}

Focus on high-risk paths and OWASP Top 10:

1. **Focused Recon**: identify tech, auth surfaces, and key endpoints.
2. **Targeted Tests**: SQLi/XSS on critical params, auth bypass, IDOR, sensitive data exposure, misconfigurations.
3. **Critical Paths**: admin, upload, payment/transaction flows.
4. **Verify**: validate findings with precise HTTP proof.

Report only actionable, high-impact issues with reproduction steps and remediation."""
    }

    # Get the appropriate instruction or default to quick
    instruction = scan_instructions.get(scan_type, scan_instructions["quick"])

    # Add common requirements for all scan types
    common_requirements = """

---
IMPORTANT:
- Run independent tool calls in parallel; await results only when needed or for the final report.
- Once an await_tool_output returns a result for a job id, that result is consumed. do not repeatedly await the same job if you get the output "No job found with ID:"

REQUIRED OUTPUT FORMAT (JSON):
{
  "vulnerabilities": [
    {
      "title": "Vulnerability Name",
      "severity": "critical|high|medium|low|info",
      "cwe": "CWE-XXX",
      "cvss": 0.0,
      "description": "Impact and technical details",
      "recommendation": "How to fix it",
      "references": ["https://..."],
      "affectedAssets": ["https://..."],
      "proof": {
        "payload": "...",
        "parameter": "...",
        "request": "...",
        "response": "...",
        "confidence": "High|Medium|Low"
      }
    }
  ],
  "summary": "Executive summary"
}

For each vulnerability include payloads, request/response snippets, reproduction steps, and remediation. Ensure requests are written as curl commands
"""

    return instruction + common_requirements
