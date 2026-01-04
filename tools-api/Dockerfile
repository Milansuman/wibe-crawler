FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies and security tools
RUN apt-get update && apt-get install -y \
    nmap \
    git \
    wget \
    curl \
    perl \
    libnet-ssleay-perl \
    openssl \
    libauthen-pam-perl \
    libio-pty-perl \
    python3 \
    ruby \
    && rm -rf /var/lib/apt/lists/*

# Install sqlmap
RUN git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /opt/sqlmap \
    && ln -s /opt/sqlmap/sqlmap.py /usr/local/bin/sqlmap \
    && chmod +x /usr/local/bin/sqlmap

# Install nikto
RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto \
    && ln -s /opt/nikto/program/nikto.pl /usr/local/bin/nikto \
    && chmod +x /usr/local/bin/nikto

# Install whatweb
RUN git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb \
    && ln -s /opt/whatweb/whatweb /usr/local/bin/whatweb \
    && chmod +x /usr/local/bin/whatweb

# Install XSSStrike from local if available, otherwise from git with retry
RUN if [ -d "/opt/xsstrike" ]; then \
    ln -s /opt/xsstrike/xsstrike.py /usr/local/bin/xsstrike; \
    else \
    git clone https://github.com/s0md3v/XSSStrike.git /opt/xsstrike || echo "XSSStrike clone failed, will run in degraded mode"; \
    fi || true

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
