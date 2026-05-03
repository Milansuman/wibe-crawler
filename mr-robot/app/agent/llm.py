from config import env
from langchain_groq import ChatGroq
from pydantic import SecretStr

# Primary model
llm = ChatGroq(
    api_key=SecretStr(env.GROQ_API_KEYS_LIST[0]),
    model="openai/gpt-oss-120b",
    temperature=0.1,
    max_retries=2
)

# Fallback models for rate limit rotation
FALLBACK_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]
