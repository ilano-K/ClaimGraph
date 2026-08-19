"""Cached LLM client factory.

Builds an Instructor-wrapped chat client (supporting structured, schema-typed
LLM responses) for the provider configured in :mod:`app.core.settings`. The
client is created once per process and reused.
"""
from app.core.settings import settings
from openai import OpenAI
from google import genai

import instructor
import logging

logger = logging.getLogger(__name__)

_client = None


def get_client():
    """Return the cached Instructor client for the configured LLM provider.

    ``openai`` uses the OpenAI SDK pointed at ``settings.llm_base_url``;
    ``google`` uses the native Google GenAI SDK. Raises ``ValueError`` for an
    unrecognized provider.
    """
    global _client
    if _client is not None:
        return _client

    provider = settings.llm_provider
    logger.info("create_client provider=%s", provider)
    if provider == 'openai':
        _client = instructor.from_openai(
            OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
            )
        )
    elif provider == 'google':
        _client = instructor.from_gemini(
            genai.Client(api_key=settings.llm_api_key)
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
    return _client