"""Retry helpers for LLM calls that may hit OpenAI-style rate limits."""
import random
import threading
import time

from openai import RateLimitError

from app.core.settings import settings


class CallRateLimiter:
    """Spaces consecutive LLM calls apart so they stay under provider limits."""

    def __init__(self, min_interval: float):
        self._min_interval = min_interval
        self._last_call = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        """Block until at least ``min_interval`` seconds since the last call."""
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            remaining = self._min_interval - (now - self._last_call)
            if remaining > 0:
                time.sleep(remaining)
            self._last_call = time.monotonic()


rate_limiter = CallRateLimiter(min_interval=settings.agent_llm_min_interval)


def call_with_retry(
    fn,
    *,
    max_retries: int = 3,
    base_delay: float = 0.6,
    max_delay: float = 10.0,
    limiter: CallRateLimiter | None = None,
):
    """Invoke ``fn``, pacing calls and retrying on ``RateLimitError`` (HTTP 429).

    Every attempt first waits on the shared rate limiter so consecutive LLM
    calls (the classifier, the lookup branch, and every tool-call round this
    request) never burst the provider. Retries use exponential backoff with
    jitter, honoring a ``Retry-After`` header when the provider sends one.
    Re-raises the last ``RateLimitError`` once ``max_retries`` are exhausted.
    """
    limiter = limiter or rate_limiter
    for attempt in range(max_retries + 1):
        limiter.wait()
        try:
            return fn()
        except RateLimitError as err:
            if attempt >= max_retries:
                raise
            time.sleep(_backoff_delay(err, attempt, base_delay, max_delay))
    raise  # pragma: no cover - loop always returns or raises


def _backoff_delay(err: RateLimitError, attempt: int, base_delay: float, max_delay: float) -> float:
    response = getattr(err, "response", None)
    retry_after = None
    if response is not None and hasattr(response, "headers"):
        retry_after = response.headers.get("Retry-After")
    if retry_after is not None and str(retry_after).isdigit():
        return float(retry_after)
    return min(base_delay * (2 ** attempt), max_delay) + random.uniform(0, 0.25)