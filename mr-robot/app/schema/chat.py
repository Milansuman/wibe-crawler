from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    
    message: str = Field(..., description="User message to send to the agent")
    thread_id: str = Field(..., description="Unique thread identifier for conversation context")
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "message": "Scan example.com for vulnerabilities",
                    "thread_id": "user-123"
                }
            ]
        }
    }


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    
    thread_id: str = Field(..., description="Thread identifier used for this conversation")
    response: str = Field(..., description="Agent's response message")
    tool_calls: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="List of tool calls made by the agent"
    )
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "thread_id": "user-123",
                    "response": "I'll scan example.com for vulnerabilities using nmap and nikto.",
                    "tool_calls": [
                        {"tool": "run_nmap", "status": "completed"}
                    ]
                }
            ]
        }
    }
