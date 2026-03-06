# Multi-stage build for Mr. Robot Pentesting Agent
# Stage 1: Builder - Install Python dependencies
FROM python:3.12-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY app ./app

# Install uv for faster dependency management
RUN pip install --no-cache-dir uv

# Install Python dependencies
RUN uv pip install --system --no-cache \
    fastapi[standard]>=0.135.1 \
    langchain>=1.2.10 \
    langchain-groq>=1.1.2 \
    pydantic-settings>=2.13.1 \
    requests>=2.32.5 \
    redis>=5.0.0 \
    langgraph \
    uvicorn[standard]


# Stage 2: Final - Runtime with pentesting tools
FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies and pentesting tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    curl \
    wget \
    git \
    ca-certificates \
    # Pentesting tools
    nmap \
    sqlmap \
    gobuster \
    # Nikto dependencies
    perl \
    libnet-ssleay-perl \
    openssl \
    libauthen-pam-perl \
    libio-pty-perl \
    libjson-perl \
    libxml-writer-perl \
    # Ruby for WPScan
    ruby \
    ruby-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Nikto from source
RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto && \
    chmod +x /opt/nikto/program/nikto.pl && \
    ln -s /opt/nikto/program/nikto.pl /usr/local/bin/nikto

# Copy local wordlists
RUN mkdir -p /usr/share/wordlists
COPY app/wordlists/* /usr/share/wordlists/
RUN chmod 644 /usr/share/wordlists/*

# Install WPScan
RUN gem install wpscan --no-document

# Install XSStrike with proper wrapper
RUN git clone --depth 1 https://github.com/s0md3v/XSStrike.git /opt/xssstrike && \
    pip install --no-cache-dir --root-user-action=ignore -r /opt/xssstrike/requirements.txt && \
    printf '#!/bin/bash\npython /opt/xssstrike/xssstrike.py "$@"\n' > /usr/local/bin/xssstrike && \
    chmod +x /usr/local/bin/xssstrike

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Ensure uv is available
RUN pip install --no-cache-dir --root-user-action=ignore uv

# Copy application code
COPY app ./app
COPY pyproject.toml ./

# Create non-root user for security
RUN useradd -m -u 1000 pentester && \
    chown -R pentester:pentester /app

# Switch to non-root user
USER pentester

# Expose FastAPI port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the FastAPI application with uv
CMD ["uv", "run", "app/main.py"]
