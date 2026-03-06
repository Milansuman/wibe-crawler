from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Any
import os

class Config(BaseSettings):
    """Application settings loaded from environment variables."""
    
    GROQ_API_KEY: str = "" # Fallback
    api_key_pool: List[str] = [] # List of keys for rotation
    REDIS_URL: str = "redis://localhost:6379/0"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        all_keys = []
        
        # Helper to extract valid keys from a string
        def extract_keys(s: str) -> List[str]:
            if not s:
                return []
            # Split by comma and filter for valid Groq keys
            return [k.strip() for k in s.split(",") if k.strip() and k.strip().startswith("gsk_")]

        # 1. Parse from GROQ_API_KEY (might be a list now)
        all_keys.extend(extract_keys(os.environ.get("GROQ_API_KEY", "")))
        
        # 2. Parse from GROQ_API_KEYS
        all_keys.extend(extract_keys(os.environ.get("GROQ_API_KEYS", "")))
        
        # 3. Use self.GROQ_API_KEY if it was set via pydantic defaults/kwargs and is valid
        if self.GROQ_API_KEY and self.GROQ_API_KEY.startswith("gsk_") and "," not in self.GROQ_API_KEY:
            all_keys.append(self.GROQ_API_KEY)

        # Deduplicate while preserving order
        seen = set()
        self.api_key_pool = []
        for key in all_keys:
            if key not in seen:
                self.api_key_pool.append(key)
                seen.add(key)
        
        # Ensure GROQ_API_KEY is a single valid key if possible (for backward compat)
        if self.api_key_pool:
            self.GROQ_API_KEY = self.api_key_pool[0]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


env = Config() #type: ignore