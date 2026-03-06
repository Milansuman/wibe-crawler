import subprocess
import json
from typing import Optional, Dict, Any, List
import requests
from langchain.tools import tool

def truncate_output(text: str, max_chars: int = 5000) -> str:
    """Truncate long tool outputs to avoid context window overflow."""
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"\n\n... [Output truncated. Total length: {len(text)} characters] ..."


@tool
def run_nmap(target: str, options: str = "-sV", timeout: int = 300) -> str:
    """Run nmap network scanner to discover hosts and services.
    
    Args:
        target: IP address or hostname to scan
        options: Nmap options (default: -sV for service version detection)
        timeout: Scan timeout in seconds (default: 300)
    
    Returns:
        Nmap scan results
    """
    try:
        cmd = ["nmap"] + options.split() + [target]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        if result.returncode != 0:
            return f"Error running nmap: {result.stderr}"
        
        return truncate_output(result.stdout)
    except subprocess.TimeoutExpired:
        return "Nmap scan timed out (5 minute limit)"
    except Exception as e:
        return f"Error executing nmap: {str(e)}"


@tool
def run_nikto(target: str, options: str = "", timeout: int = 600) -> str:
    """Run Nikto web server scanner to find vulnerabilities and misconfigurations.
    
    Args:
        target: Target URL or IP to scan
        options: Additional Nikto options (e.g., '-Tuning 123')
        timeout: Scan timeout in seconds (default: 600)
    
    Returns:
        Nikto scan results
    """
    try:
        # -ask no: Don't ask for confirmations
        # -nointeractive: Run without user interaction
        cmd = ["nikto", "-h", target, "-ask", "no", "-nointeractive"]
        if options:
            cmd.extend(options.split())
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return truncate_output(result.stdout if result.stdout else result.stderr)
    except subprocess.TimeoutExpired:
        return "Nikto scan timed out (10 minute limit)"
    except Exception as e:
        return f"Error executing nikto: {str(e)}"


@tool
def run_sqlmap(target: str, options: str = "--batch --risk=1 --level=1", timeout: int = 600) -> str:
    """Run SQLMap to test for SQL injection vulnerabilities.
    
    Args:
        target: Target URL to test
        options: SQLMap options (default: --batch --risk=1 --level=1)
        timeout: Scan timeout in seconds (default: 600)
    
    Returns:
        SQLMap test results
    """
    try:
        # --batch: Never ask for user input, use default behavior
        # --answers: Provide answers to questions (skip prompts)
        base_options = "--batch --answers=quit=N,follow=N,continue=Y"
        combined_options = f"{base_options} {options}"
        cmd = ["sqlmap", "-u", target] + combined_options.split()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return truncate_output(result.stdout if result.stdout else result.stderr)
    except subprocess.TimeoutExpired:
        return "SQLMap scan timed out (10 minute limit)"
    except Exception as e:
        return f"Error executing sqlmap: {str(e)}"


@tool
def run_xssstrike(target: str, options: str = "", timeout: int = 300) -> str:
    """Run XSStrike to detect and exploit XSS vulnerabilities.
    
    Args:
        target: Target URL to test for XSS
        options: Additional XSStrike options
        timeout: Scan timeout in seconds (default: 300)
    
    Returns:
        XSStrike scan results
    """
    try:
        # --skip: Skip confirmation prompts where possible
        cmd = ["xssstrike", "-u", target, "--skip"]
        if options:
            cmd.extend(options.split())
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return truncate_output(result.stdout if result.stdout else result.stderr)
    except subprocess.TimeoutExpired:
        return "XSStrike scan timed out (5 minute limit)"
    except Exception as e:
        return f"Error executing xssstrike: {str(e)}"


@tool
def send_http_request(
    url: str,
    method: str = "GET",
    headers: Optional[str] = None,
    data: Optional[str] = None
) -> str:
    """Send an HTTP request to a specified endpoint with custom headers and data.
    
    Args:
        url: Target URL endpoint
        method: HTTP method (GET, POST, PUT, DELETE, etc.)
        headers: JSON string of headers (e.g., '{"Authorization": "Bearer token"}')
        data: Request body as string (for POST/PUT requests)
    
    Returns:
        Response status, headers, and body
    """
    try:
        # Parse headers if provided
        parsed_headers = {}
        if headers:
            try:
                parsed_headers = json.loads(headers)
            except json.JSONDecodeError:
                return "Error: Invalid JSON format for headers"
        
        # Make the request
        response = requests.request(
            method=method.upper(),
            url=url,
            headers=parsed_headers,
            data=data,
            timeout=30,
            allow_redirects=True
        )
        
        # Format the response
        result = f"Status Code: {response.status_code}\n\n"
        result += f"Response Headers:\n{json.dumps(dict(response.headers), indent=2)}\n\n"
        result += f"Response Body:\n{truncate_output(response.text)}"
        
        return result
        
    except requests.exceptions.Timeout:
        return "Request timed out (30 second limit)"
    except requests.exceptions.ConnectionError as e:
        return f"Connection error: {str(e)}"
    except Exception as e:
        return f"Error sending HTTP request: {str(e)}"


@tool
def run_gobuster(target: str, wordlist: str = "common", options: str = "", timeout: int = 600) -> str:
    """Run Gobuster for directory and file brute-forcing.
    
    Args:
        target: Target URL to scan
        wordlist: Wordlist to use
        options: Additional Gobuster options
        timeout: Scan timeout in seconds (default: 600)
    
    Returns:
        Gobuster scan results
    """
    try:
        # Map short names to wordlist files
        wordlist_map = {
            "common": "common.txt",
            "medium": "DirBuster-2007_directory-list-2.3-medium.txt",
            "raft": "raft-medium-directories.txt"
        }
        
        # Check if wordlist is a short name or a path
        if wordlist in wordlist_map:
            wordlist_file = wordlist_map[wordlist]
            # Try Docker path first, fallback to local path
            import os
            docker_path = f"/usr/share/wordlists/{wordlist_file}"
            local_path = f"/app/wordlists/{wordlist_file}"
            
            if os.path.exists(docker_path):
                wordlist_path = docker_path
            elif os.path.exists(local_path):
                wordlist_path = local_path
            else:
                wordlist_path = docker_path  # Use docker path as default
        else:
            wordlist_path = wordlist
        
        # --no-error: Don't display errors
        # -q: Quiet mode (less verbose)
        cmd = ["gobuster", "dir", "-u", target, "-w", wordlist_path, "--no-error", "-q"]
        if options:
            cmd.extend(options.split())
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return truncate_output(result.stdout if result.stdout else result.stderr)
    except subprocess.TimeoutExpired:
        return "Gobuster scan timed out (10 minute limit)"
    except Exception as e:
        return f"Error executing gobuster: {str(e)}"


@tool
def run_wpscan(target: str, options: str = "--enumerate vp,vt", timeout: int = 600) -> str:
    """Run WPScan to scan WordPress sites for vulnerabilities.
    
    Args:
        target: Target WordPress URL
        options: WPScan options (default: enumerate vulnerable plugins and themes)
        timeout: Scan timeout in seconds (default: 600)
    
    Returns:
        WPScan results
    """
    try:
        # --no-update: Don't update the database (avoids prompts)
        # --batch: Never ask for user input
        # --random-user-agent: Use random user agent (good practice)
        base_cmd = ["wpscan", "--url", target, "--no-update", "--batch", "--random-user-agent"]
        cmd = base_cmd + options.split()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return truncate_output(result.stdout if result.stdout else result.stderr)
    except subprocess.TimeoutExpired:
        return "WPScan timed out (10 minute limit)"
    except Exception as e:
        return f"Error executing wpscan: {str(e)}"


@tool
def report_vulnerability(
    title: str,
    severity: str,
    description: str,
    recommendation: str,
    affected_assets: List[str],
    cwe: Optional[str] = "CWE-200",
    cvss: float = 5.0,
    proof_payload: Optional[str] = None,
    proof_parameter: Optional[str] = None,
    proof_request: Optional[str] = None,
    proof_response: Optional[str] = None
) -> str:
    """Report a confirmed vulnerability discovery.
    
    Args:
        title: Short descriptive title of the vulnerability
        severity: Severity level (critical, high, medium, low, info)
        description: Detailed explanation of the finding and its impact
        recommendation: Clear steps to remediate the vulnerability
        affected_assets: List of URLs or endpoints affected
        cwe: CWE identifier (e.g., CWE-89 for SQLi)
        cvss: CVSS score (0.0 to 10.0)
        proof_payload: The exact payload that triggered the vulnerability
        proof_parameter: The vulnerable parameter name
        proof_request: Snippet of the triggering HTTP request
        proof_response: Snippet of the vulnerable HTTP response
    
    Returns:
        Confirmation message that the vulnerability was reported.
    """
    # This tool is intercepted by the stream_agent wrapper to emit real-time events.
    # The return value is for the AI's internal state.
    return f"Vulnerability '{title}' has been officially reported to the dashboard."


# List of all available tools
TOOLS = [
    run_nmap,
    run_nikto,
    run_sqlmap,
    run_xssstrike,
    send_http_request,
    run_gobuster,
    run_wpscan,
    report_vulnerability,
]
