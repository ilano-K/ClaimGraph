"""Enums describing workspace ingestion and lifecycle state."""

from enum import Enum

class IngressMode(str, Enum):
    """How a workspace receives its documents."""

    HTTP="http"
    MCP="mcp"

class WorkspaceStatus(str, Enum):
    """High-level lifecycle state of a workspace shown on the dashboard."""

    EMPTY='empty'
    QUEUED='queued'
    COMPILING='compiling'
    READY='ready'
    FAILED='failed'
    
    
class DocumentStatus(str, Enum):
    """Per-document processing state within a workspace."""

    QUEUED = "QUEUED"
    EXTRACTING = "EXTRACTING"
    VALIDATING = "VALIDATING"
    READY = "READY"
    FAILED = "FAILED"