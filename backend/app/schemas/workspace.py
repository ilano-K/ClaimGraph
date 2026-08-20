from pydantic import BaseModel, ConfigDict, Field
from app.enums.workspace import IngressMode, WorkspaceStatus
from typing import Any , List
from datetime import datetime 
from app.schemas.graph import DocumentAnalysis, GraphPayload
from app.schemas.reactflow import ReactFlowEdge, ReactFlowNode

class WorkspaceChatRequest(BaseModel):
    message: str 
    
class WorkspaceChatResponse(BaseModel):
    reply: str

class DocumentResponse(BaseModel):
    id: str
    workspace_id: str
    filename: str
    status: str
    claim_count: int
    evidence_count: int
    graph_payload: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    ingress_mode: IngressMode
    status: WorkspaceStatus
    graph_payload: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    documents: List[DocumentResponse] = []

    model_config = ConfigDict(from_attributes=True)
    
class WorkspaceCreateRequest(BaseModel):
    name: str
    description: str

class WorkspaceCompileResponse(BaseModel):
    """
    The final HTTP Response schema returned by POST /api/workspaces/compile.
    """
    success: bool = Field(default=True)
    message: str = Field(default="Graph compilation successful.")
    documents: List[DocumentAnalysis]  = Field(
        ...,
        description="Analysis and metadata for each source document."
    )
    graph: GraphPayload = Field(
        ..., 
        description="The pure semantic graph payload."
    )
    react_flow_nodes: List[ReactFlowNode] = Field(
        ..., 
        description="Pre-formatted node list ready for React Flow's useNodes hook."
    )
    react_flow_edges: List[ReactFlowEdge] = Field(
        ..., 
        description="Pre-formatted edge list ready for React Flow's useEdges hook."
    )
class WorkspaceUpdateRequest(BaseModel):
    workspace_id: str
    name: str | None = None 

class WorkspaceUploadDocumentResponse(BaseModel):
    documents: List[DocumentResponse]
