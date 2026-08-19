"""Cached LLM client factory.

Builds an Instructor-wrapped chat client for an OpenAI-compatible provider
(OpenAI, OpenRouter, Groq, Mistral, Ollama, ...) using the endpoint and
credentials in :mod:`app.core.settings`. The client is created once per
process and reused.
"""
from app.core.settings import settings
from openai import OpenAI

import instructor
import logging

logger = logging.getLogger(__name__)

_client = None

DEFAULT_MODEL = "openrouter/free"


def get_client():
    """Return the cached Instructor client for the configured LLM provider.

    Points the OpenAI SDK at ``settings.llm_base_url`` (any OpenAI-compatible
    endpoint) using ``settings.llm_api_key``.
    """
    global _client
    if _client is not None:
        return _client

    logger.info("create_client model=%s", DEFAULT_MODEL)
    _client = instructor.from_openai(
        OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
    )
    return _client