from typing import Dict, Any, List, Optional
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware
from langgraph.checkpoint.memory import MemorySaver
from agent.llm import llm
from agent.tools import TOOLS
from agent.prompts import SYSTEM_PROMPT
from agent.middleware import (
    log_agent_thinking,
    log_tool_execution,
    rotate_models_on_rate_limit,
    cache_model_calls,
    cache_tool_calls,
)
from langchain_core.runnables import RunnableConfig

# Set up memory checkpointer for conversation persistence
checkpointer = MemorySaver()

# Create the penetration testing agent with all middleware
agent = create_agent(
    model=llm,
    tools=TOOLS,
    middleware=[  # type: ignore
        TodoListMiddleware(),
        cache_model_calls,            # Cache model responses
        cache_tool_calls,             # Cache tool results
        log_agent_thinking,           # Log thought process
        log_tool_execution,           # Log tool calls
        rotate_models_on_rate_limit,  # Rotate models on rate limits
    ],
    checkpointer=checkpointer,
    system_prompt=SYSTEM_PROMPT,
)


def invoke_agent(message: str, thread_id: str) -> Dict[str, Any]:
    """
    Invoke the penetration testing agent with a message and thread ID.
    
    Args:
        message: User message/command for the agent
        thread_id: Unique thread identifier for conversation context
        
    Returns:
        Dict with parsed response containing:
            - thread_id: The conversation thread ID
            - response: The agent's text response
            - tool_calls: List of tools called (if any)
    """
    config: RunnableConfig = {
        "configurable": {
            "thread_id": thread_id
        }
    }
    
    result = agent.invoke(
        {"messages": [{"role": "user", "content": message}]},
        config
    )
    
    # Extract messages from the result
    messages = result.get("messages", [])
    response_content = ""
    tool_calls: List[Dict[str, str]] = []
    
    # Get the last AI message as the response
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "ai":
            response_content = msg.content
            break
        elif isinstance(msg, dict) and msg.get("role") == "assistant":
            response_content = msg.get("content", "")
            break
    
    # Extract tool calls if any
    for msg in messages:
        if hasattr(msg, "type") and msg.type == "tool":
            tool_calls.append({
                "tool": msg.name if hasattr(msg, "name") else "unknown",
                "status": "completed"
            })
    
    return {
        "thread_id": thread_id,
        "response": response_content or "Agent completed the task.",
        "tool_calls": tool_calls if tool_calls else None
    }


def stream_agent(message: str, thread_id: str):
    """
    Stream the penetration testing agent's execution with real-time updates.
    
    Yields updates including tool calls, todo list changes, and final responses.
    
    Args:
        message: User message/command for the agent
        thread_id: Unique thread identifier for conversation context
        
    Yields:
        Dict with event type and data:
            - type: "tool_call" | "todo_update" | "thinking" | "response" | "error"
            - data: Event-specific data
    """
    config: RunnableConfig = {
        "configurable": {
            "thread_id": thread_id
        }
    }
    
    try:
        # Stream agent execution
        for chunk in agent.stream(
            {"messages": [{"role": "user", "content": message}]},
            config,
            stream_mode="updates"
        ):
            # Handle different types of events
            for node_name, node_output in chunk.items():
                # Skip if node_output is None
                if node_output is None:
                    continue
                
                # Tool execution events (ToolMessage contains results)
                if isinstance(node_output, dict) and "messages" in node_output:
                    messages = node_output["messages"]
                    if messages is None:
                        continue
                    
                    for msg in messages:
                        if msg is None:
                            continue
                        
                        # Tool completed (ToolMessage)
                        if hasattr(msg, "type") and msg.type == "tool":
                            tool_name = msg.name if hasattr(msg, "name") else "unknown"
                            output_str = str(msg.content) if hasattr(msg, "content") and msg.content else ""
                            
                            yield {
                                "type": "tool_call",
                                "data": {
                                    "tool": tool_name,
                                    "status": "completed",
                                    "output": output_str[:500]  # Truncate for streaming
                                }
                            }
                        
                        # AI thinking or response (AIMessage)
                        elif hasattr(msg, "type") and msg.type == "ai":
                            # Extract thinking/tool calls
                            if hasattr(msg, "tool_calls") and msg.tool_calls:
                                for tool_call in msg.tool_calls:
                                    if isinstance(tool_call, dict):
                                        tool_name = tool_call.get("name", "tool")
                                        tool_args = tool_call.get("args", {})
                                    else:
                                        tool_name = getattr(tool_call, "name", "tool")
                                        tool_args = getattr(tool_call, "args", {})
                                    
                                    yield {
                                        "type": "thinking",
                                        "data": {
                                            "action": f"Calling {tool_name}",
                                            "args": tool_args
                                        }
                                    }
                                    
                                    # INSTANT TODO UPDATE: Emit the new plan as soon as AI proposes write_todos
                                    if tool_name == "write_todos":
                                        yield {
                                            "type": "todo_update",
                                            "data": {
                                                "todos": tool_args.get("todos", [])
                                            }
                                        }
                                    
                                    # INSTANT VULNERABILITY UPDATE: Emit finding as soon as AI calls report_vulnerability
                                    if tool_name == "report_vulnerability":
                                        yield {
                                            "type": "vulnerability",
                                            "data": {
                                                "vulnerability": {
                                                    "title": tool_args.get("title"),
                                                    "severity": tool_args.get("severity"),
                                                    "description": tool_args.get("description"),
                                                    "recommendation": tool_args.get("recommendation"),
                                                    "affected_assets": tool_args.get("affected_assets", []),
                                                    "cwe": tool_args.get("cwe"),
                                                    "cvss": tool_args.get("cvss"),
                                                    "proof": {
                                                        "payload": tool_args.get("proof_payload"),
                                                        "parameter": tool_args.get("proof_parameter"),
                                                        "request": tool_args.get("proof_request"),
                                                        "response": tool_args.get("proof_response")
                                                    }
                                                }
                                            }
                                        }
                            
                            # Final or intermediate text response
                            if hasattr(msg, "content") and msg.content:
                                yield {
                                    "type": "response",
                                    "data": {
                                        "content": msg.content
                                    }
                                }

                # Todo list updates from state (fallback/final sync)
                if isinstance(node_output, dict) and "todo_list" in node_output:
                    yield {
                        "type": "todo_update",
                        "data": {
                            "todos": node_output["todo_list"]
                        }
                    }
        
        # Send completion event
        yield {
            "type": "complete",
            "data": {
                "thread_id": thread_id,
                "status": "completed"
            }
        }
        
    except Exception as e:
        yield {
            "type": "error",
            "data": {
                "error": str(e)
            }
        }


__all__ = ["agent", "invoke_agent", "stream_agent", "checkpointer"]

