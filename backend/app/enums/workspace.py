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
    """Per-document analysis state within a workspace.

    A document starts NOT_ANALYZED when uploaded, moves to ANALYZING while its
    standalone claim graph is being compiled, and settles on READY (with a
    stored ``graph_payload``) or FAILED.
    """

    NOT_ANALYZED = "not_analyzed"
    ANALYZING = "analyzing"
    READY = "ready"
    FAILED = "failed"