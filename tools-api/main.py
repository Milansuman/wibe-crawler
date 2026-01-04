from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import subprocess
import json
import re
import xmltodict

app = FastAPI(title="Security Tools API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NmapScanRequest(BaseModel):
    target: str = Field(..., description="Target IP or hostname")
    ports: Optional[str] = Field(None, description="Port range (e.g., '80,443' or '1-1000')")
    scan_type: Optional[str] = Field("basic", description="Scan type: basic, service, vuln, full")
    
class SqlmapScanRequest(BaseModel):
    url: str = Field(..., description="Target URL")
    data: Optional[str] = Field(None, description="POST data")
    cookie: Optional[str] = Field(None, description="Cookie string")
    level: Optional[int] = Field(1, description="Level of tests (1-5)")
    risk: Optional[int] = Field(1, description="Risk of tests (1-3)")

class NiktoScanRequest(BaseModel):
    target: str = Field(..., description="Target host")
    port: Optional[int] = Field(80, description="Target port")
    ssl: Optional[bool] = Field(False, description="Use SSL")

class WhatwebScanRequest(BaseModel):
    target: str = Field(..., description="Target URL")
    aggression: Optional[int] = Field(1, description="Aggression level (1-4)")

class NslookupRequest(BaseModel):
    domain: str = Field(..., description="Domain name to lookup")
    query_type: Optional[str] = Field(None, description="Query type (A, MX, NS, TXT, etc.)")
    nameserver: Optional[str] = Field(None, description="Specific nameserver to query")

class DigRequest(BaseModel):
    domain: str = Field(..., description="Domain name to lookup")
    query_type: Optional[str] = Field("A", description="Query type (A, MX, NS, TXT, ANY, etc.)")
    nameserver: Optional[str] = Field(None, description="Specific nameserver to query (@server)")
    short: Optional[bool] = Field(False, description="Short output format")

class XSSStrikeScanRequest(BaseModel):
    url: str = Field(..., description="Target URL to scan for XSS vulnerabilities")
    crawl: Optional[int] = Field(2, description="Crawl depth level (0-5)")
    threads: Optional[int] = Field(10, description="Number of threads to use")
    timeout: Optional[int] = Field(10, description="Timeout for requests (seconds)")
    vector: Optional[str] = Field(None, description="Specific XSS payload vector to test")

class WPScanRequest(BaseModel):
    url: str = Field(..., description="Target WordPress URL to scan")
    aggressive: Optional[bool] = Field(False, description="Run in aggressive mode")
    enumerate: Optional[str] = Field("vp,vt,u,m", description="What to enumerate: vp (vulnerable plugins), vt (vulnerable themes), u (users), m (media)")
    api_token: Optional[str] = Field(None, description="WPScan API token for vulnerability database")


def run_command(command: List[str], timeout: int = 300) -> Dict[str, Any]:
    """Execute a command and return structured output"""
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Command timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command execution failed: {str(e)}")


def parse_nmap_output(output: str) -> Dict[str, Any]:
    """Parse nmap output into structured JSON"""
    parsed = {
        "hosts": [],
        "summary": {}
    }
    
    # Extract host information
    host_pattern = r"Nmap scan report for (.+?)(?:\n|$)"
    hosts = re.findall(host_pattern, output)
    
    # Extract open ports
    port_pattern = r"(\d+)/(\w+)\s+(\w+)\s+(.+?)(?:\n|$)"
    ports = re.findall(port_pattern, output)
    
    if hosts:
        parsed["hosts"].append({
            "host": hosts[0],
            "ports": [
                {
                    "port": int(p[0]),
                    "protocol": p[1],
                    "state": p[2],
                    "service": p[3].strip()
                }
                for p in ports
            ]
        })
    
    # Extract summary
    if "Host is up" in output:
        parsed["summary"]["status"] = "up"
    
    return parsed


def parse_sqlmap_output(output: str) -> Dict[str, Any]:
    """Parse sqlmap output into structured JSON"""
    parsed = {
        "vulnerable": False,
        "injection_points": [],
        "databases": [],
        "findings": []
    }
    
    # Check if vulnerable
    if "is vulnerable" in output.lower() or "injectable" in output.lower():
        parsed["vulnerable"] = True
    
    # Extract injection points
    injection_pattern = r"Parameter: (.+?) \((.+?)\)"
    injections = re.findall(injection_pattern, output)
    parsed["injection_points"] = [
        {"parameter": i[0], "type": i[1]} for i in injections
    ]
    
    # Extract databases
    db_pattern = r"available databases \[(\d+)\]:(.*?)(?:\n\n|\Z)"
    db_matches = re.findall(db_pattern, output, re.DOTALL)
    if db_matches:
        dbs = re.findall(r"\[\*\] (.+)", db_matches[0][1])
        parsed["databases"] = [db.strip() for db in dbs]
    
    return parsed


def parse_nikto_output(output: str) -> Dict[str, Any]:
    """Parse Nikto output into structured JSON"""
    parsed = {
        "target": "",
        "findings": [],
        "server_info": {}
    }
    
    # Extract target
    target_pattern = r"Testing: (.+)"
    target_match = re.search(target_pattern, output)
    if target_match:
        parsed["target"] = target_match.group(1)
    
    # Extract server info
    server_pattern = r"Server: (.+)"
    server_match = re.search(server_pattern, output)
    if server_match:
        parsed["server_info"]["server"] = server_match.group(1)
    
    # Extract findings (lines starting with +)
    findings = re.findall(r"\+ (.+)", output)
    parsed["findings"] = [f.strip() for f in findings]
    
    return parsed


def parse_nslookup_output(output: str) -> Dict[str, Any]:
    """Parse nslookup output into structured JSON"""
    parsed = {
        "server": "",
        "addresses": [],
        "records": []
    }
    
    # Extract server info
    server_pattern = r"Server:\s+(.+)"
    server_match = re.search(server_pattern, output)
    if server_match:
        parsed["server"] = server_match.group(1).strip()
    
    # Extract addresses
    address_pattern = r"Address(?:es)?:\s+(.+)"
    address_matches = re.findall(address_pattern, output)
    parsed["addresses"] = [addr.strip() for addr in address_matches]
    
    # Extract name records
    name_pattern = r"Name:\s+(.+)"
    name_matches = re.findall(name_pattern, output)
    if name_matches:
        for name in name_matches:
            parsed["records"].append({"name": name.strip()})
    
    return parsed


def parse_xsstrike_output(output: str) -> Dict[str, Any]:
    """Parse XSSStrike output into structured JSON"""
    parsed = {
        "vulnerable": False,
        "vulnerabilities": [],
        "payloads": [],
        "endpoints": []
    }
    
    # Extract vulnerabilities
    vuln_pattern = r"(?:Found|Detected) XSS at: (.+?)(?:\n|$)"
    vulns = re.findall(vuln_pattern, output, re.IGNORECASE)
    parsed["vulnerabilities"] = list(set(vulns))
    
    # Extract payloads used
    payload_pattern = r"(?:Payload|Tested)(?::|\\s+with)\\s+([^\n]+)"
    payloads = re.findall(payload_pattern, output, re.IGNORECASE)
    parsed["payloads"] = list(set(payloads))[:10]
    
    # Extract endpoints scanned
    endpoint_pattern = r"(?:Testing|Scanning).*?(?:endpoint|url|parameter).*?:\\s*([^\n]+)"
    endpoints = re.findall(endpoint_pattern, output, re.IGNORECASE)
    parsed["endpoints"] = list(set(endpoints))[:20]
    
    # Check if any vulnerabilities were found
    if "vulnerable" in output.lower() or len(parsed["vulnerabilities"]) > 0:
        parsed["vulnerable"] = True
    
    return parsed


def parse_wpscan_output(output: str) -> Dict[str, Any]:
    """Parse WPScan output into structured JSON"""
    parsed = {
        "target": "",
        "wordpress_detected": False,
        "version": "",
        "vulnerabilities": [],
        "plugins": [],
        "themes": [],
        "users": [],
        "scan_summary": {}
    }
    
    # Check if WordPress was detected
    if "WordPress" in output or "wordpress" in output.lower():
        parsed["wordpress_detected"] = True
    
    # Extract WordPress version
    version_pattern = r"(?:WordPress|Version)[^0-9]*([0-9]+\.[0-9]+(?:\.[0-9]+)?)"
    version_match = re.search(version_pattern, output, re.IGNORECASE)
    if version_match:
        parsed["version"] = version_match.group(1)
    
    # Extract vulnerabilities
    vuln_pattern = r"(?:\[\!\]|\[!\])\s*(.+?(?:vulnerability|vulnerable|CVE)[^;]*)"
    vulns = re.findall(vuln_pattern, output, re.IGNORECASE)
    parsed["vulnerabilities"] = [v.strip() for v in vulns][:10]
    
    # Extract plugins information
    plugin_pattern = r"(?:Plugin|plugin):\s*(.+?)\s*(?:\(|v|Ver|version)?([0-9]+\.[0-9]+[^\s]*)?.*?(?:\[|vulnerable|$)"
    plugins = re.findall(plugin_pattern, output, re.IGNORECASE)
    parsed["plugins"] = [{"name": p[0].strip(), "version": p[1] if p[1] else ""} for p in plugins][:10]
    
    # Extract users
    user_pattern = r"(?:Author|User|Username):\s*(.+?)(?:\n|\s\[|\s-|$)"
    users = re.findall(user_pattern, output, re.IGNORECASE)
    parsed["users"] = list(set([u.strip() for u in users if u.strip()]))[:10]
    
    # Check for critical findings
    if len(parsed["vulnerabilities"]) > 0:
        parsed["scan_summary"]["has_vulnerabilities"] = True
    if len(parsed["plugins"]) > 0:
        parsed["scan_summary"]["plugins_count"] = len(parsed["plugins"])
    
    return parsed


def parse_dig_output(output: str) -> Dict[str, Any]:
    """Parse dig output into structured JSON"""
    parsed = {
        "question": {},
        "answer": [],
        "authority": [],
        "additional": [],
        "stats": {}
    }
    
    # Extract question section
    question_pattern = r";; QUESTION SECTION:[\s\S]*?;(.+?)\s+(\w+)\s+(\w+)"
    question_match = re.search(question_pattern, output)
    if question_match:
        parsed["question"] = {
            "name": question_match.group(1).strip(),
            "class": question_match.group(2),
            "type": question_match.group(3)
        }
    
    # Extract answer section
    answer_pattern = r";; ANSWER SECTION:([\s\S]*?)(?:;;|\n\n)"
    answer_match = re.search(answer_pattern, output)
    if answer_match:
        answer_lines = [line.strip() for line in answer_match.group(1).split('\n') if line.strip() and not line.startswith(';')]
        for line in answer_lines:
            parts = line.split()
            if len(parts) >= 5:
                parsed["answer"].append({
                    "name": parts[0],
                    "ttl": parts[1],
                    "class": parts[2],
                    "type": parts[3],
                    "data": ' '.join(parts[4:])
                })
    
    # Extract query time
    query_time_pattern = r";; Query time: (\d+) msec"
    query_time_match = re.search(query_time_pattern, output)
    if query_time_match:
        parsed["stats"]["query_time_ms"] = int(query_time_match.group(1))
    
    # Extract server
    server_pattern = r";; SERVER: (.+)"
    server_match = re.search(server_pattern, output)
    if server_match:
        parsed["stats"]["server"] = server_match.group(1).strip()
    
    return parsed


@app.get("/")
def read_root():
    return {
        "message": "Security Tools API",
        "endpoints": {
            "nmap": "/scan/nmap",
            "sqlmap": "/scan/sqlmap",
            "nikto": "/scan/nikto",
            "whatweb": "/scan/whatweb",
            "nslookup": "/scan/nslookup",
            "dig": "/scan/dig",
            "xsstrike": "/scan/xsstrike",
            "wpscan": "/scan/wpscan",
            "health": "/health"
        }
    }


@app.get("/health")
def health_check():
    """Check if all tools are available"""
    tools = {
        "nmap": False,
        "sqlmap": False,
        "nikto": False,
        "whatweb": False,
        "nslookup": False,
        "dig": False,
        "xsstrike": False,
        "wpscan": False
    }
    
    for tool in tools.keys():
        try:
            result = subprocess.run(
                [tool, "--version"],
                capture_output=True,
                timeout=5
            )
            tools[tool] = result.returncode == 0
        except:
            pass
    
    return {
        "status": "healthy" if all(tools.values()) else "degraded",
        "tools": tools
    }


@app.post("/scan/nmap")
def nmap_scan(request: NmapScanRequest):
    """Run Nmap scan and return structured results"""
    command = ["nmap"]
    
    # Add scan type specific flags
    if request.scan_type == "service":
        command.extend(["-sV"])
    elif request.scan_type == "vuln":
        command.extend(["--script=vuln"])
    elif request.scan_type == "full":
        command.extend(["-sV", "-sC", "-A"])
    
    # Add ports if specified
    if request.ports:
        command.extend(["-p", request.ports])
    
    # Add target
    command.append(request.target)
    
    # Execute command
    result = run_command(command)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=f"Nmap scan failed: {result['stderr']}")
    
    # Parse and return structured output
    parsed = parse_nmap_output(result["stdout"])
    parsed["raw_output"] = result["stdout"]
    
    return parsed


@app.post("/scan/sqlmap")
def sqlmap_scan(request: SqlmapScanRequest):
    """Run SQLmap scan and return structured results"""
    command = ["sqlmap", "-u", request.url, "--batch", "--answers=crack=N"]
    
    # Add POST data if specified
    if request.data:
        command.extend(["--data", request.data])
    
    # Add cookie if specified
    if request.cookie:
        command.extend(["--cookie", request.cookie])
    
    # Add level and risk
    command.extend(["--level", str(request.level), "--risk", str(request.risk)])
    
    # Execute command
    result = run_command(command, timeout=600)  # SQLmap can take longer
    
    # Parse and return structured output
    parsed = parse_sqlmap_output(result["stdout"])
    parsed["raw_output"] = result["stdout"]
    
    return parsed


@app.post("/scan/nikto")
def nikto_scan(request: NiktoScanRequest):
    """Run Nikto scan and return structured results"""
    command = ["nikto", "-h", request.target, "-p", str(request.port)]
    
    if request.ssl:
        command.append("-ssl")
    
    # Add output format
    command.extend(["-Format", "txt"])
    
    # Execute command
    result = run_command(command, timeout=600)
    
    # Parse and return structured output
    parsed = parse_nikto_output(result["stdout"])
    parsed["raw_output"] = result["stdout"]
    
    return parsed


@app.post("/scan/whatweb")
def whatweb_scan(request: WhatwebScanRequest):
    """Run WhatWeb scan and return structured results"""
    command = ["whatweb", request.target, "--log-json=-", f"-a{request.aggression}"]
    
    # Execute command
    result = run_command(command)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=f"WhatWeb scan failed: {result['stderr']}")
    
    # Parse JSON output
    try:
        # WhatWeb outputs one JSON object per line
        lines = result["stdout"].strip().split('\n')
        parsed_results = [json.loads(line) for line in lines if line.strip()]
        
        return {
            "results": parsed_results,
            "raw_output": result["stdout"]
        }
    except json.JSONDecodeError:
        # Fallback if JSON parsing fails
        return {
            "results": [],
            "raw_output": result["stdout"],
            "error": "Failed to parse JSON output"
        }


@app.post("/scan/nslookup")
def nslookup_scan(request: NslookupRequest):
    """Run nslookup and return structured results"""
    command = ["nslookup"]
    
    # Add query type if specified
    if request.query_type:
        command.extend(["-type=" + request.query_type])
    
    # Add domain
    command.append(request.domain)
    
    # Add nameserver if specified
    if request.nameserver:
        command.append(request.nameserver)
    
    # Execute command
    result = run_command(command)
    
    # nslookup returns non-zero for NXDOMAIN but still provides useful output
    if result["returncode"] not in [0, 1]:
        raise HTTPException(status_code=400, detail=f"nslookup failed: {result['stderr']}")
    
    # Parse and return structured output
    parsed = parse_nslookup_output(result["stdout"])
    parsed["raw_output"] = result["stdout"]
    
    return parsed


@app.post("/scan/dig")
def dig_scan(request: DigRequest):
    """Run dig and return structured results"""
    command = ["dig"]
    
    # Add nameserver if specified
    if request.nameserver:
        command.append(f"@{request.nameserver}")
    
    # Add domain
    command.append(request.domain)
    
    # Add query type
    command.append(request.query_type)
    
    # Add short flag if requested
    if request.short:
        command.append("+short")
    
    # Execute command
    result = run_command(command)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=f"dig failed: {result['stderr']}")
    
    # Parse and return structured output
    if request.short:
        # For short output, just return the raw lines
        lines = [line.strip() for line in result["stdout"].strip().split('\n') if line.strip()]
        return {
            "short_answer": lines,
            "raw_output": result["stdout"]
        }
    else:
        parsed = parse_dig_output(result["stdout"])
        parsed["raw_output"] = result["stdout"]
        return parsed


@app.post("/scan/xsstrike")
def xsstrike_scan(request: XSSStrikeScanRequest):
    """Run XSSStrike scan and return structured results"""
    command = ["python3", "/opt/xsstrike/xsstrike.py", "-u", request.url]
    
    # Add crawl depth
    if request.crawl:
        command.append("--crawl")
    
    # Add threads
    command.extend(["-t", str(request.threads)])
    
    # Add timeout
    command.extend(["--timeout", str(request.timeout)])
    
    # Add specific vector if provided
    if request.vector:
        command.extend(["--data", request.vector])
    
    # Execute command
    result = run_command(command, timeout=600)
    
    # Parse and return structured output
    parsed = parse_xsstrike_output(result["stdout"] + result["stderr"])
    parsed["raw_output"] = result["stdout"]
    if result["stderr"]:
        parsed["raw_stderr"] = result["stderr"]
    
    return parsed


@app.post("/scan/wpscan")
def wpscan_scan(request: WPScanRequest):
    """Run WPScan scan and return structured results"""
    command = ["wpscan", "--url", request.url, "--format", "json", "--no-banner"]
    
    # Add aggressive mode if enabled
    if request.aggressive:
        command.append("--aggressive")
    
    # Add enumeration parameters
    if request.enumerate:
        command.extend(["--enumerate", request.enumerate])
    
    # Add API token if provided
    if request.api_token:
        command.extend(["--api-token", request.api_token])
    
    # Execute command
    result = run_command(command, timeout=600)
    
    # Try to parse JSON output first
    try:
        if result["stdout"].strip():
            parsed_json = json.loads(result["stdout"])
            parsed_json["raw_output"] = result["stdout"]
            return parsed_json
    except json.JSONDecodeError:
        pass
    
    # Fallback to parsing text output
    parsed = parse_wpscan_output(result["stdout"] + result["stderr"])
    parsed["raw_output"] = result["stdout"]
    if result["stderr"]:
        parsed["raw_stderr"] = result["stderr"]
    
    return parsed


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
