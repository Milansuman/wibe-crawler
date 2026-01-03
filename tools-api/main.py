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


@app.get("/")
def read_root():
    return {
        "message": "Security Tools API",
        "endpoints": {
            "nmap": "/scan/nmap",
            "sqlmap": "/scan/sqlmap",
            "nikto": "/scan/nikto",
            "whatweb": "/scan/whatweb",
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
        "whatweb": False
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
