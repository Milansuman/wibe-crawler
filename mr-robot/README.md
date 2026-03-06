# Mr. Robot - Web Penetration Testing Agent

AI-powered web penetration testing agent with automated vulnerability scanning using LangChain and Groq.

## Features

- 🤖 AI-powered vulnerability detection
- 🔍 Automated security scanning with industry-standard tools
- 📊 Structured vulnerability reports with CVSS scores
- 🧠 Conversational memory with thread-based context
- 📝 Todo list middleware for complex multi-step scans
- 🛡️ Support for OWASP Top 10 vulnerabilities

## Security Tools Included

- **nmap** - Network scanning and service detection
- **nikto** - Web server vulnerability scanning
- **sqlmap** - SQL injection testing
- **XSStrike** - XSS vulnerability detection
- **gobuster** - Directory and file brute-forcing
- **WPScan** - WordPress vulnerability scanning

## Prerequisites

- Docker and Docker Compose
- Groq API key (get one at https://console.groq.com)

## Quick Start with Docker

### 1. Set up environment variables

Create a `.env` file in the project root:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

### 2. Build and run with Docker Compose

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### 3. Build manually with Docker

```bash
# Build the image
docker build -t mr-robot .

# Run the container
docker run -d \
  -p 8000:8000 \
  -e GROQ_API_KEY=your_api_key \
  --name mr-robot-agent \
  mr-robot
```

## API Usage

### Health Check

```bash
curl http://localhost:8000/health
```

### Perform a Vulnerability Scan

```bash
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "scan_type": "quick",
    "thread_id": "scan-123"
  }'
```

**Scan Types:**
- `quick` - Fast scan with basic checks
- `full` - Comprehensive scan with all tools
- `targeted` - Focused scan on specific vulnerabilities

### Response Format

```json
{
  "vulnerabilities": [
    {
      "title": "SQL Injection in Login Form",
      "severity": "critical",
      "cwe": "CWE-89",
      "cvss": 9.8,
      "description": "The application is vulnerable to SQL injection...",
      "recommendation": "Use parameterized queries or prepared statements",
      "references": ["https://owasp.org/www-community/attacks/SQL_Injection"],
      "affectedAssets": ["https://example.com/login"],
      "proof": {
        "payload": "' OR '1'='1",
        "parameter": "username",
        "request": "POST /login HTTP/1.1\nusername=' OR '1'='1",
        "response": "200 OK - Logged in successfully",
        "confidence": "High"
      }
    }
  ],
  "summary": "Scan completed. Found 1 critical vulnerability.",
  "thread_id": "scan-123",
  "target": "https://example.com"
}
```

## Local Development

### Without Docker

1. Install dependencies:
```bash
# Install pentesting tools
sudo apt update && sudo apt install -y nmap nikto sqlmap gobuster ruby
sudo gem install wpscan

# Install XSStrike
git clone https://github.com/s0md3v/XSStrike.git /opt/xssstrike
pip install -r /opt/xssstrike/requirements.txt
sudo ln -s /opt/xssstrike/xssstrike.py /usr/local/bin/xssstrike

# Install Python dependencies
pip install -r requirements.txt  # or use uv
```

2. Run the application:
```bash
uvicorn app.main:app --reload --port 8000
```

## Architecture

```
mr-robot/
├── app/
│   ├── agent/          # AI agent configuration
│   │   ├── __init__.py # Agent setup with middleware
│   │   ├── llm.py      # LLM configuration
│   │   ├── prompts.py  # System prompts
│   │   └── tools.py    # Pentesting tool integrations
│   ├── schema/         # Pydantic models
│   │   ├── chat.py
│   │   └── vulnerability.py
│   ├── config.py       # Environment configuration
│   └── main.py         # FastAPI application
├── Dockerfile          # Multi-stage Docker build
├── docker-compose.yml  # Docker Compose configuration
└── pyproject.toml      # Python dependencies
```

## Security Notice

⚠️ **IMPORTANT**: This tool contains powerful security testing capabilities. Only use it on systems you have explicit permission to test. Unauthorized penetration testing is illegal.

## API Documentation

Once running, view the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
