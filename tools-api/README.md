# Security Tools API

A FastAPI-based REST API that provides structured JSON output from popular security scanning tools including Nmap, SQLmap, Nikto, WhatWeb, and XSSStrike.

## Features

- 🔍 **Nmap**: Network scanning and port discovery
- 💉 **SQLmap**: SQL injection detection and exploitation
- 🕷️ **Nikto**: Web server vulnerability scanning
- 🌐 **WhatWeb**: Web technology identification
- ✅ **XSSStrike**: XSS vulnerability detection and exploitation
- 📊 **Structured JSON Output**: All tools return parsed, structured JSON responses
- 🐳 **Dockerized**: Fully containerized with all dependencies

## Quick Start

### Using Docker Compose (Recommended)

```bash
cd tools-api
docker-compose up -d
```

The API will be available at `http://localhost:8000`

### Using Docker

```bash
cd tools-api
docker build -t security-tools-api .
docker run -p 8000:8000 --cap-add=NET_ADMIN --cap-add=NET_RAW security-tools-api
```

### Local Development

```bash
cd tools-api
pip install -r requirements.txt
python main.py
```

**Note**: For local development, you need to install the security tools manually:
- `apt-get install nmap nikto whatweb` (Debian/Ubuntu)
- Install SQLmap from: https://github.com/sqlmapproject/sqlmap
- Install XSSStrike from: https://github.com/s0md3v/XSSStrike

## API Endpoints

### Health Check

```bash
GET /health
```

Returns the status of all available tools.

**Response:**
```json
{
  "status": "healthy",
  "tools": {
    "nmap": true,
    "sqlmap": true,
    "nikto": true,
    "whatweb": true
  }
}
```

### Nmap Scan

```bash
POST /scan/nmap
```

**Request Body:**
```json
{
  "target": "scanme.nmap.org",
  "ports": "80,443",
  "scan_type": "service"
}
```

**Parameters:**
- `target` (required): IP address or hostname
- `ports` (optional): Port range (e.g., "80,443" or "1-1000")
- `scan_type` (optional): "basic", "service", "vuln", or "full"

**Response:**
```json
{
  "hosts": [
    {
      "host": "scanme.nmap.org",
      "ports": [
        {
          "port": 80,
          "protocol": "tcp",
          "state": "open",
          "service": "http"
        }
      ]
    }
  ],
  "summary": {
    "status": "up"
  },
  "raw_output": "..."
}
```

### SQLmap Scan

```bash
POST /scan/sqlmap
```

**Request Body:**
```json
{
  "url": "http://example.com/page?id=1",
  "level": 1,
  "risk": 1
}
```

**Parameters:**
- `url` (required): Target URL
- `data` (optional): POST data
- `cookie` (optional): Cookie string
- `level` (optional): Test level (1-5), default: 1
- `risk` (optional): Test risk (1-3), default: 1

**Response:**
```json
{
  "vulnerable": true,
  "injection_points": [
    {
      "parameter": "id",
      "type": "GET"
    }
  ],
  "databases": ["information_schema", "users"],
  "findings": [],
  "raw_output": "..."
}
```

### Nikto Scan

```bash
POST /scan/nikto
```

**Request Body:**
```json
{
  "target": "example.com",
  "port": 80,
  "ssl": false
}
```

**Parameters:**
- `target` (required): Target hostname
- `port` (optional): Port number, default: 80
- `ssl` (optional): Use SSL, default: false

**Response:**
```json
{
  "target": "example.com",
  "server_info": {
    "server": "nginx/1.18.0"
  },
  "findings": [
    "Server may leak inodes via ETags",
    "The X-Content-Type-Options header is not set"
  ],
  "raw_output": "..."
}
```

### WhatWeb Scan

```bash
POST /scan/whatweb
```

**Request Body:**
```json
{
  "target": "https://example.com",
  "aggression": 1
}
```

**Parameters:**
- `target` (required): Target URL
- `aggression` (optional): Aggression level (1-4), default: 1

**Response:**
```json
{
  "results": [
    {
      "target": "https://example.com",
      "http_status": 200,
      "plugins": {
        "HTTPServer": ["nginx"],
        "Title": ["Example Domain"]
      }
    }
  ],
  "raw_output": "..."
}
```

### XSSStrike Scan

```bash
POST /scan/xsstrike
```

**Request Body:**
```json
{
  "url": "https://example.com/search?q=test",
  "crawl": 2,
  "threads": 10,
  "timeout": 10
}
```

**Parameters:**
- `url` (required): Target URL to scan for XSS vulnerabilities
- `crawl` (optional): Crawl depth level (0-5), default: 2
- `threads` (optional): Number of threads to use, default: 10
- `timeout` (optional): Timeout for requests in seconds, default: 10
- `vector` (optional): Specific XSS payload vector to test

**Response:**
```json
{
  "vulnerable": true,
  "vulnerabilities": [
    "https://example.com/search?q=<img src=x onerror=alert(1)>"
  ],
  "payloads": [
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>"
  ],
  "endpoints": [
    "/search?q=",
    "/api/search"
  ],
  "raw_output": "..."
}
```

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Example Usage

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# Nmap scan
curl -X POST http://localhost:8000/scan/nmap \
  -H "Content-Type: application/json" \
  -d '{"target": "scanme.nmap.org", "scan_type": "basic"}'

# SQLmap scan
curl -X POST http://localhost:8000/scan/sqlmap \
  -H "Content-Type: application/json" \
  -d '{"url": "http://testphp.vulnweb.com/artists.php?artist=1", "level": 1}'

# Nikto scan
curl -X POST http://localhost:8000/scan/nikto \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "port": 80}'

# WhatWeb scan
curl -X POST http://localhost:8000/scan/whatweb \
  -H "Content-Type: application/json" \
  -d '{"target": "https://example.com"}'

# XSSStrike scan
curl -X POST http://localhost:8000/scan/xsstrike \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/search?q=test", "crawl": 2}'
```

### Using Python

```python
import requests

# Nmap scan
response = requests.post(
    "http://localhost:8000/scan/nmap",
    json={
        "target": "scanme.nmap.org",
        "ports": "80,443",
        "scan_type": "service"
    }
)
print(response.json())
```

## Security Considerations

⚠️ **Warning**: This API runs powerful security tools. Use responsibly and only on systems you have permission to test.

- The container requires `NET_ADMIN` and `NET_RAW` capabilities for network scanning
- Always use in controlled environments
- Consider authentication/authorization for production use
- Rate limiting is recommended for public deployments
- Some scans can take several minutes to complete

## Environment Variables

- `PYTHONUNBUFFERED=1`: Enable real-time logging

## Troubleshooting

### Container won't start
Ensure you have the required capabilities:
```bash
docker run --cap-add=NET_ADMIN --cap-add=NET_RAW ...
```

### Scans timing out
Some scans take longer. Adjust timeout values in the API code if needed.

### Tools not found
Verify all tools are installed:
```bash
docker exec -it security-tools-api /bin/bash
nmap --version
sqlmap --version
nikto -Version
whatweb --version
xsstrike --version
```

## License

This project is for educational and authorized testing purposes only.
