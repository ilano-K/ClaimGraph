"""Structured LLM call layer (graph-extraction path).

The single integration point between the extraction pipeline and the LLM
provider. Hides the client and request assembly so callers never touch the
provider SDK.
"""
from typing import Type, TypeVar

from instructor.exceptions import IncompleteOutputException

from app.core.exceptions import InvalidLLMResponseError
from app.llm.client_factory import COMPILE_MODEL, get_client
import logging
import time

logger = logging.getLogger(__name__)

T = TypeVar("T")


def chat_structured(
    system: str,
    messages: list[dict],
    response_model: Type[T],
    **kwargs,
) -> T:
    """Request a structured, schema-typed response from the LLM.

    ``messages`` are plain ``{"role", "content"}`` dicts; the system message is
    ``system``. Provider-specific options are forwarded via ``**kwargs`` (e.g.
    ``extra_body={"thinking": {"type": "disabled"}}``).
    """
    start = time.perf_counter()
    logger.info(
        "chat_structured entry model=%s",
        COMPILE_MODEL,
    )
    client = get_client()
    try:
        result = client.chat.completions.create(
            model=COMPILE_MODEL,
            response_model=response_model,
            messages=[{"role": "system", "content": system}, *messages],
            # Cap the total attempt budget for the compile path. Instructor's
            # default is already 3, but being explicit keeps it bounded even
            # if the constructor default changes, and paired with the SDK
            # client's ``max_retries=0`` it is the single retry layer.
            max_retries=3,
            **kwargs,
        )
    except IncompleteOutputException as exc:
        logger.error("chat_structured invalid LLM output: %s", exc)
        raise InvalidLLMResponseError() from exc
    except Exception as exc:
        # Ragged free-tier responses (e.g. reasoning models emitting scratch
        # text) can make Instructor raise non-domain exceptions like
        # TypeError("'NoneType' object is not iterable"). Surface them as a
        # clean domain error instead of a cryptic 500.
        logger.error("chat_structured LLM call failed: %s", exc)
        err = InvalidLLMResponseError()
        err.detail = f"LLM call failed: {type(exc).__name__}: {exc}"
        raise err from exc
    logger.info(
        "chat_structured success in %dms",
        round((time.perf_counter() - start) * 1000),
    )
    return result