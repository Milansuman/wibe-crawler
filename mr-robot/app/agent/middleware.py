import logging
from typing import Callable, Any
from datetime import datetime
from langchain.agents import AgentState
from langchain.agents.middleware import after_model, wrap_tool_call, wrap_model_call, ModelRequest
from langchain.agents.middleware.types import ModelResponse
from langchain_core.messages import ToolMessage, AIMessage
from langgraph.runtime import Runtime
from agent.llm import FALLBACK_MODELS
from utils.cache import (
    generate_cache_key,
    get_from_cache,
    set_in_cache,
    is_cache_available
)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("PentestAgent")


# Caching Middleware
@wrap_model_call
def cache_model_calls(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Cache model calls to reduce redundant API requests."""
    if not is_cache_available():
        return handler(request)
    
    try:
        # Create cache key from model name and messages
        messages_data = [
            {"role": msg.type if hasattr(msg, "type") else "unknown", 
             "content": msg.content if hasattr(msg, "content") else str(msg)}
            for msg in request.state.get("messages", [])[-3:]  # Last 3 messages for context
        ]
        
        model_name = getattr(request.model, "model_name", str(request.model))
        
        cache_data = {
            "model": model_name,
            "messages": messages_data,
            "system_prompt": getattr(request, "system_prompt", None),
        }
        
        cache_key = generate_cache_key("model_call", cache_data)
        
        # Try to get from cache
        cached_response = get_from_cache(cache_key)
        if cached_response:
            logger.info(f"💾 Cache hit for model call")
            # Return cached response directly
            return cached_response
        
        # Execute the handler
        response = handler(request)
        
        # Cache the full response object
        set_in_cache(cache_key, response, ttl=1800)
        
        return response
        
    except Exception as e:
        logger.debug(f"Model cache error: {e}")
        return handler(request)


@wrap_tool_call  # type: ignore
def cache_tool_calls(
    request: Any,
    handler: Callable[[Any], ToolMessage]
) -> ToolMessage:
    """Cache tool call results to avoid redundant executions."""
    if not is_cache_available():
        return handler(request)
    
    try:
        tool_name = request.tool_call.get("name", "") if hasattr(request, "tool_call") else ""
        tool_args = request.tool_call.get("args", {}) if hasattr(request, "tool_call") else {}
        
        # Only cache deterministic tools (not time-sensitive scans)
        cacheable_tools = {"send_http_request"}
        
        if tool_name not in cacheable_tools:
            return handler(request)
        
        # Generate cache key
        cache_key = generate_cache_key("tool_call", {
            "tool": tool_name,
            "args": tool_args
        })
        
        # Try to get from cache
        cached_result = get_from_cache(cache_key)
        if cached_result:
            logger.info(f"💾 Cache hit for tool: {tool_name}")
            # Return cached result directly
            return cached_result
        
        # Execute the tool
        result = handler(request)
        
        # Cache the full result object
        if hasattr(result, "content"):
            logger.info(f"💾 Caching result for tool: {tool_name}")
            set_in_cache(cache_key, result, ttl=600)
        
        return result
        
    except Exception as e:
        logger.debug(f"Tool cache error: {e}")
        return handler(request)


# Logging Middleware
@after_model
def log_agent_thinking(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """Log the agent's response after each model call."""
    messages = state.get("messages", [])
    
    if messages:
        last_message = messages[-1]
        if isinstance(last_message, AIMessage):
            # Log the agent's thinking
            if last_message.content:
                logger.info(f"🤖 Agent Thinking: {last_message.content[:200]}...")
            
            # Log tool calls if any
            if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                for tool_call in last_message.tool_calls:
                    tool_name = tool_call.get("name", "unknown")
                    tool_args = tool_call.get("args", {})
                    
                    # Special highlight for todo list planning
                    if tool_name == "write_todos":
                        logger.info(f"📝 Planning: Agent is creating/updating task list")
                        logger.info(f"   Tasks: {tool_args}")
                    else:
                        logger.info(f"🔧 Tool Invoked: {tool_name}")
                        logger.info(f"   Arguments: {tool_args}")
    
    return None


@wrap_tool_call  # type: ignore
def log_tool_execution(
    request: Any,
    handler: Callable[[Any], ToolMessage]
) -> ToolMessage:
    """Log tool execution and results."""
    tool_name = request.tool_call.get("name", "unknown") if hasattr(request, "tool_call") else "unknown"
    start_time = datetime.now()
    
    logger.info(f"⚙️  Executing Tool: {tool_name}")
    
    try:
        # Execute the tool
        result = handler(request)
        
        # Calculate execution time
        duration = (datetime.now() - start_time).total_seconds()
        
        # Log the result - handle different return types
        if hasattr(result, "content"):
            result_preview = result.content[:150] if result.content else "No output"
            logger.info(f"✅ Tool Result ({duration:.2f}s): {result_preview}...")
        else:
            # Handle Command objects or other types without content
            logger.info(f"✅ Tool Executed ({duration:.2f}s): {tool_name} completed successfully")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Tool Error: {tool_name} failed with {str(e)}")
        raise


@wrap_model_call
def rotate_models_on_rate_limit(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Try each model in sequence if any error occurs, with retries for function call errors."""
    last_error = None
    
    for attempt, model in enumerate(FALLBACK_MODELS):
        # Retry logic for function calling errors
        max_retries = 2  # Retry up to 2 times per model for function errors
        
        for retry in range(max_retries + 1):
            try:
                if retry == 0:
                    logger.info(f"🎯 Using model: {model.model_name}")
                else:
                    logger.info(f"🔄 Retry {retry}/{max_retries} for {model.model_name}")
                
                # Override the model in the request
                modified_request = request.override(model=model)
                
                # Execute the model call
                response = handler(modified_request)
                
                return response
                
            except Exception as e:
                error_str = str(e).lower()
                error_repr = repr(e)
                last_error = e
                
                # Check if this is a rate limit or quota error
                is_rate_limit = "rate limit" in error_str or "429" in error_str or "quota" in error_str
                
                if is_rate_limit:
                    from agent.llm import refresh_llms
                    logger.warning(f"🔄 Rate limit hit on {model.model_name}. Rotating API keys...")
                    refresh_llms() # Update global LLM instances with new random keys
                
                # Check if this is a function calling error that should be retried
                is_function_error = (
                    "failed to call a function" in error_str or
                    "adjust your prompt" in error_str or
                    "function call" in error_str or
                    ("error" in error_repr and "message" in error_repr and "function" in error_str)
                )
                
                # Determine error type for logging
                if is_rate_limit:
                    error_type = "Rate limit"
                    should_retry = True # We refreshed keys, so retry with the same model first!
                elif "413" in error_str or "payload too large" in error_str:
                    error_type = "Payload too large"
                    # Prune history if it's too big
                    messages = list(request.state.get("messages", []))
                    if len(messages) > 2:
                        logger.warning(f"⚠️ {error_type} on {model.model_name}. Pruning history aggressively...")
                        # Keep system prompt (if index 0) and ONLY the last 2 messages
                        # This minimizes context size for the retry
                        if len(messages) > 1:
                            pruned_messages = [messages[0]] + messages[-2:]
                        else:
                            pruned_messages = messages
                        request.state["messages"] = pruned_messages
                        should_retry = True
                    else:
                        should_retry = False
                elif "timeout" in error_str:
                    error_type = "Timeout"
                    should_retry = False
                elif "connection" in error_str or "network" in error_str:
                    error_type = "Connection"
                    should_retry = False
                elif is_function_error:
                    error_type = "Function call error"
                    should_retry = True
                else:
                    error_type = "Error"
                    should_retry = False
                
                # Retry with same model if it's a function error or payload was pruned
                if should_retry and retry < max_retries:
                    logger.warning(
                        f"⚠️  {error_type} on {model.model_name}: {str(e)[:100]}. "
                        f"Retrying..."
                    )
                    continue  # Retry with same model
                
                # Otherwise, move to next model or raise
                if attempt < len(FALLBACK_MODELS) - 1:
                    logger.warning(
                        f"⚠️  {error_type} on {model.model_name}: {str(e)[:100]}. "
                        f"Rotating to next model..."
                    )
                    break  # Break retry loop, go to next model
                else:
                    # If we've tried all models, raise error
                    logger.error(
                        f"❌ All models exhausted. Last error: {error_type} - {str(e)[:100]}"
                    )
                    raise Exception(
                        f"All available models failed. Last error: {str(e)}"
                    ) from last_error
    
    # Should never reach here, but just in case
    if last_error:
        raise last_error
    else:
        raise Exception("Failed to get response from any model")
