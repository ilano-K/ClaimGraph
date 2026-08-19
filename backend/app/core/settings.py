"""Runtime settings loaded from environment variables and the ``.env`` file.

Pydantic-settings resolves each field from the matching env var
(e.g. ``LLM_API_KEY`` -> ``llm_api_key``); values already present in
``os.environ`` take precedence over the ``.env`` file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Secrets and model configuration used to talk to the LLM provider."""

    llm_base_url: str | None = None
    llm_api_key: str 
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

settings = Settings()