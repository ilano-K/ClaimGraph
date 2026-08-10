"""Application exception hierarchy.

All exceptions that should surface to the HTTP layer subclass
:class:`AppException`, which carries the ``status_code`` and ``detail`` used
by the global handler in :mod:`app.main`.
"""

class AppException(Exception):
    """Base exception for all handler-mapped errors raised by the API."""

    status_code: int = 500
    detail: str = "Internal Server Error"

class GraphCompilationError(AppException):
    """Raised when the graph compilation pipeline fails for any reason."""

    status_code: int = 500 
    detail: str = "Graph Compile Error"

class InvalidLLMResponseError(AppException):
    """Raised when the LLM output fails validation (e.g. missing document_ids)."""

    status_code: int = 500
    detail: str = "LLM returned an invalid OUTPUT"