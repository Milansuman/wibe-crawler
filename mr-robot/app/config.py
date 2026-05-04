from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field

class Config(BaseSettings):
    """Application settings loaded from environment variables."""

    GROQ_API_KEY: str
    REDIS_URL: str = "redis://localhost:6379/0"
    OPENAI_API_KEY: str

    @computed_field
    @property
    def GROQ_API_KEYS_LIST(self) -> list[str]:
        """Split the GROQ_API_KEY string into a list of keys."""
        return [key.strip() for key in self.GROQ_API_KEY.split(",") if key.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


env = Config() #type: ignore
