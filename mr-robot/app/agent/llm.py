from config import env
from langchain_groq import ChatGroq
from pydantic import SecretStr
import random

def get_api_key():
    """Get a random API key from the list of available keys."""
    if not env.api_key_pool:
        return env.GROQ_API_KEY
    return random.choice(env.api_key_pool)

def create_llm(model_name: str):
    """Create an LLM instance with a current API key."""
    return ChatGroq(
        api_key=SecretStr(get_api_key()),
        model=model_name,
        temperature=0.1,
        max_retries=2
    )

def refresh_llms():
    """Global refresh of all LLM instances to pick up new keys on rate limit."""
    global llm, FALLBACK_MODELS
    print(f"[Agent] Refreshing LLMs with {len(env.api_key_pool)} keys available")
    llm = create_llm("llama-3.3-70b-versatile")
    FALLBACK_MODELS = [
        create_llm("llama-3.1-70b-versatile"),
        create_llm("mixtral-8x7b-32768"),
        create_llm("llama-3.1-8b-instant"),
    ]

# Initialize LLMs
print(f"[Agent] Initializing with {len(env.api_key_pool)} API key(s)")
llm = create_llm("llama-3.3-70b-versatile")
FALLBACK_MODELS = [
    create_llm("llama-3.1-70b-versatile"),
    create_llm("mixtral-8x7b-32768"),
    create_llm("llama-3.1-8b-instant"),
]