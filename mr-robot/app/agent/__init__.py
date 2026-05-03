import json
from typing import Dict, Any, List, AsyncIterator
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware, SummarizationMiddleware
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from agent.llm import llm
from agent.tools import TOOLS
from agent.prompts import SYSTEM_PROMPT, TECHNICAL_SUMMARY_PROMPT
from agent.middleware import (
    CacheMiddleware,
    LoggingMiddleware,
    ModelRotationMiddleware,
)
from langchain_core.runnables import RunnableConfig
from langchain_asynctools import AsyncTools

# Set up memory checkpointer for conversation persistence.
# pickle_fallback avoids intermittent failures when runtime objects (e.g. Send)
# are not directly msgpack-serializable.
checkpointer = MemorySaver(serde=JsonPlusSerializer(pickle_fallback=True))

# Create the penetration testing agent with all middleware
agent = create_agent(
    model=llm,
    tools=TOOLS,
    middleware=[  # type: ignore
        AsyncTools(),
        SummarizationMiddleware(
            model=llm,
            trigger=[("tokens", 9800), ("messages", 80)],
            summary_prompt=TECHNICAL_SUMMARY_PROMPT
        ),
        TodoListMiddleware(),
        # CacheMiddleware(),
        LoggingMiddleware(),
        ModelRotationMiddleware(),
    ],
    checkpointer=checkpointer,
    system_prompt=SYSTEM_PROMPT,
)


async def invoke_agent(message: str, thread_id: str) -> Dict[str, Any]:
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
    
    result = await agent.ainvoke(
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


def _extract_json_report(text: str) -> dict | None:
    """Extract the JSON vulnerability report from a raw LLM response string."""
    import re

    # Strategy 1: ```json ... ``` fence
    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            data = json.loads(m.group(1))
            if isinstance(data, dict) and "vulnerabilities" in data:
                return data
        except json.JSONDecodeError:
            pass

    # Strategy 2: generic ``` ... ``` fence
    m = re.search(r"```\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            data = json.loads(m.group(1))
            if isinstance(data, dict) and "vulnerabilities" in data:
                return data
        except json.JSONDecodeError:
            pass

    # Strategy 3: find the largest JSON object in the text
    # We try every { ... } block from longest to shortest
    candidates = re.findall(r"\{[\s\S]+\}", text)
    candidates.sort(key=len, reverse=True)
    for candidate in candidates:
        try:
            data = json.loads(candidate)
            if isinstance(data, dict) and "vulnerabilities" in data:
                return data
        except json.JSONDecodeError:
            continue

    return None


async def stream_agent(message: str, thread_id: str) -> AsyncIterator[Dict[str, Any]]:
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
        # Collect the last AI response for report extraction
        last_ai_content = ""
        async for chunk in agent.astream(
            {"messages": [{"role": "user", "content": message}]},
            config,
            stream_mode="updates"
        ):
            # --- existing event processing (unchanged) ---
            for node_name, node_output in chunk.items():
                if node_output is None:
                    continue
                
                if isinstance(node_output, dict) and "messages" in node_output:
                    messages = node_output["messages"]
                    if messages is None:
                        continue
                    
                    for msg in messages:
                        if msg is None:
                            continue
                        
                        if hasattr(msg, "type") and msg.type == "tool":
                            tool_name = msg.name if hasattr(msg, "name") else "unknown"
                            output_str = str(msg.content) if hasattr(msg, "content") and msg.content else ""
                            
                            yield {
                                "type": "tool_call",
                                "data": {
                                    "tool": tool_name,
                                    "status": "completed",
                                    "output": output_str[:500]
                                }
                            }
                            
                            if tool_name == "write_todos":
                                yield {
                                    "type": "todo_update",
                                    "data": {
                                        "message": "Task plan updated",
                                        "todos": output_str
                                    }
                                }
                        elif hasattr(msg, "type") and msg.type == "ai":
                            if hasattr(msg, "content") and msg.content:
                                last_ai_content = msg.content  # Track the last AI response
                                yield {
                                    "type": "response",
                                    "data": {
                                        "content": msg.content
                                    }
                                }
                
                if isinstance(node_output, dict) and "todo_list" in node_output:
                    yield {
                        "type": "todo_update",
                        "data": {
                            "todos": node_output["todo_list"]
                        }
                    }
                
                if node_name == "agent" and isinstance(node_output, dict) and "messages" in node_output:
                    messages = node_output["messages"]
                    if messages is None:
                        continue
                    
                    for msg in messages:
                        if msg is None:
                            continue
                        
                        if hasattr(msg, "type") and msg.type == "ai":
                            if hasattr(msg, "tool_calls") and msg.tool_calls:
                                for tool_call in msg.tool_calls:
                                    if isinstance(tool_call, dict):
                                        tool_name = tool_call.get("name", "tool")
                                        tool_args = tool_call.get("args", {})
                                    else:
                                        tool_name = getattr(tool_call, "name", "tool")
                                        tool_args = getattr(tool_call, "args", {})
                                    
                                    if not isinstance(tool_args, dict):
                                        tool_args = {}
                                    
                                    yield {
                                        "type": "thinking",
                                        "data": {
                                            "action": f"Calling {tool_name}",
                                            "args": tool_args
                                        }
                                    }
        
        # Extract the vulnerability report from the last AI message
        report_data = None
        if last_ai_content:
            report_data = _extract_json_report(last_ai_content)
        
        # Send completion event with embedded report
        yield {
            "type": "complete",
            "data": {
                "thread_id": thread_id,
                "status": "completed",
                "report": report_data  # None if not found
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

