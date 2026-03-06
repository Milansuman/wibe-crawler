from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from agent import invoke_agent, stream_agent
from agent.prompts import get_scan_instruction
from schema import ScanRequest, VulnerabilityReport
import json
import asyncio

app = FastAPI(
    title="Mr. Robot - Web Penetration Testing Agent",
    description="AI-powered web penetration testing agent with automated vulnerability scanning",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Mr. Robot Pentesting Agent",
        "version": "0.1.0",
        "status": "operational"
    }


@app.post("/scan", response_model=VulnerabilityReport)
async def scan(request: ScanRequest):
    """
    Vulnerability scan endpoint for penetration testing.
    
    Performs automated security scanning on the target and returns a structured
    vulnerability report with findings, proofs, and recommendations.
    """
    try:
        # Get scan instruction from prompts
        scan_instruction = get_scan_instruction(request.target, request.scan_type)
        
        # Invoke the agent
        result = invoke_agent(scan_instruction, request.thread_id)
        
        # Extract the response
        response_text = result.get("response", "")
        
        # Try to parse JSON from the response
        vulnerabilities_data = None
        
        # Look for JSON in the response (it might be wrapped in markdown code blocks)
        if "```json" in response_text:
            start = response_text.find("```json") + 7
            end = response_text.find("```", start)
            json_str = response_text[start:end].strip()
            vulnerabilities_data = json.loads(json_str)
        elif "```" in response_text:
            start = response_text.find("```") + 3
            end = response_text.find("```", start)
            json_str = response_text[start:end].strip()
            try:
                vulnerabilities_data = json.loads(json_str)
            except json.JSONDecodeError:
                pass
        else:
            # Try to parse the entire response as JSON
            try:
                vulnerabilities_data = json.loads(response_text)
            except json.JSONDecodeError:
                pass
        
        if not vulnerabilities_data:
            # If no structured data found, return empty report with agent's response as summary
            return VulnerabilityReport(
                vulnerabilities=[],
                summary=response_text or "Scan completed. No structured vulnerability data returned.",
                thread_id=request.thread_id,
                target=request.target
            )
        
        # Validate and return the vulnerability report
        return VulnerabilityReport(
            vulnerabilities=vulnerabilities_data.get("vulnerabilities", []),
            summary=vulnerabilities_data.get("summary", "Scan completed."),
            thread_id=request.thread_id,
            target=request.target
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse vulnerability report: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing scan request: {str(e)}"
        )


@app.post("/scan/stream")
async def scan_stream(request: ScanRequest):
    """
    Streaming vulnerability scan endpoint.
    
    Streams real-time updates including tool calls, todo list updates,
    and agent thinking as the scan progresses.
    
    Returns Server-Sent Events (SSE) stream.
    """
    async def event_generator():
        try:
            # Get scan instruction from prompts
            scan_instruction = get_scan_instruction(
                request.target, 
                request.scan_type, 
                request.discovery_data
            )
            
            # Stream agent execution
            for event in stream_agent(scan_instruction, request.thread_id):
                # Format as SSE
                event_data = json.dumps(event)
                yield f"data: {event_data}\n\n"
                
                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)
            
        except Exception as e:
            error_event = {
                "type": "error",
                "data": {"error": str(e)}
            }
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
