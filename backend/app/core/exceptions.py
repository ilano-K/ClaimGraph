"""Application exception hierarchy.

All exceptions that should surface to the HTTP layer subclass
:class:`AppException`. Exceptions carry only a semantic ``detail`` message;
mapping exception types to HTTP status codes lives in the API layer
(see ``app.main``).
"""

class AppException(Exception):
    """Base exception for all handler-mapped errors raised by the API."""

    detail: str = "Internal Server Error"

class GraphCompilationError(AppException):
    """Raised when the graph compilation pipeline fails for any reason."""

    detail: str = "Graph Compile Error"

class InvalidLLMResponseError(AppException):
    """Raised when the LLM output fails validation (e.g. missing document_ids)."""

    detail: str = "LLM returned an invalid OUTPUT"

class FileMissingError(AppException):
    """Raised when the given file path does not exist"""

    detail: str = "File not found"

class WorkspaceCreationError(AppException):
    """Raised when workspace creation fails."""

    detail: str = "Workspace creation failed."

class WorkspaceUpdateError(AppException):
    """Raised when updating of workspace fails"""

    detail: str = "Workspace update failed."

class WorkspaceNotFoundError(AppException):
    """Raised when the requested workspace does not exist."""

    detail: str = "Workspace not found"

class WorkspaceCompilationError(AppException):
    """Raised when the workspace compilation pipeline fails for any reason."""

    detail: str = "Workspace Compile Error"

class WorkspaceDocumentNotFoundError(AppException):
    """Raised when one or more requested documents do not belong to the workspace"""

    detail: str = "One or more documents not found in workspace"

class WorkspaceRetrievalError(AppException):
    detail: str = "Failed to retrieve workspaces"

class GraphNotFoundError(AppException):
    detail: str = "Workspace graph not found"

class NodeNotFoundError(AppException):
    detail: str = "Node not found in graph"
