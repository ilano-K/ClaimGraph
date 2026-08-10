from enum import Enum

class IngressMode(str, Enum):
     HTTP="http"
     MCP="mcp"

class WorkspaceStatus(str, Enum):
     EMPTY='empty'
     QUEUED='queued'
     COMPILING='compiling'
     READY='ready'
     FAILED='failed'
     
     
class DocumentStatus(str, Enum):
    QUEUED = "QUEUED"
    EXTRACTING = "EXTRACTING"
    VALIDATING = "VALIDATING"
    READY = "READY"
    FAILED = "FAILED"