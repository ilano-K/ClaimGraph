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

# Independent model pins so the graph compiler and the chat agent can be
# tuned separately. Both default to a stable free OpenRouter model instead of
# the "free" auto-router, which load-balances across arbitrary free models
# (including reasoning models that can emit scratch text instead of JSON).
COMPILE_MODEL = "deepseek-v4-flash"
AGENT_MODEL = "deepseek-v4-flash"


def get_client():
    """Return the cached Instructor client for the configured LLM provider.

    Points the OpenAI SDK at ``settings.llm_base_url`` (any OpenAI-compatible
    endpoint) using ``settings.llm_api_key``.
    """
    global _client
    if _client is not None:
        return _client

    logger.info("create_client model=%s", COMPILE_MODEL)
    _client = instructor.from_openai(
        OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            # The provider layers retry on top of retry (instructor applies
            # its own schema-validation retries in ``create``), so a stalled
            # upstream can turn a slow call into a 5-minute hang via the
            # SDK's ``Retry-After`` backoff. Keep the total retry budget
            # bounded at the instructor layer only.
            max_retries=3,
        ),
        # MD_JSON parses the structured output client-side, so no tool/JSON
        # schema is sent to the provider. This avoids provider rejections of
        # Pydantic v2 schemas that use "$defs" (e.g. GraphPayload's nested
        # models), which vary across OpenRouter's upstream providers.
        mode=instructor.Mode.MD_JSON,
    )
    return _client