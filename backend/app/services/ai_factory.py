"""LLM client factory.

Builds an Instructor-wrapped chat client (supporting structured, schema-typed
LLM responses) for the provider configured in :mod:`app.core.settings`.
"""
from app.core.settings import settings
from openai import OpenAI
from google import genai

import instructor
import logging

logger = logging.getLogger(__name__)

def create_client():
    """Return an Instructor client for the configured LLM provider.

    ``openai`` uses the OpenAI SDK pointed at ``settings.llm_base_url``;
    ``gemini`` uses the Google GenAI SDK. Falls through without a client when
    the provider is unrecognized.
    """
    provider = settings.llm_provider
    logger.info("create_client provider=%s", provider)
    if provider == 'openai':
        return instructor.from_openai(
            OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
                default_headers={"User-Agent": "opencode-cli/1.0.0"},
            )
        )

    if provider == 'gemini':
        return instructor.from_gemini(
            genai.Client(
                api_key=settings.llm_api_key
            )
        )
    
    raise ValueError(f"Unsupported LLM provider: {provider}")
