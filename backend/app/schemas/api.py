from pydantic import BaseModel, Field 
from app.schemas.node import GraphNode
from app.schemas.graph import DocumentMetadata, GraphPayload, DocumentAnalysis
from app.enums.node import EdgeRelation
from typing import Dict, List

class ReactFlowStyle(BaseModel):
    """
    Visual styling rules applied to edges on the canvas.
    """
    stroke: str = Field(..., description="Hex color code for the edge line.")
    strokeWidth: int = Field(default=2, description="Line thickness in pixels.")


class ReactFlowNode(BaseModel):
    """
    Canvas-ready wrapper around a GraphNode for React Flow.
    """
    id: str = Field(..., description="Must match the underlying GraphNode id.")
    type: str = Field(
        default="customCard", 
        description="Identifies the custom React component to render on the canvas."
    )
    data: GraphNode = Field(
        ..., 
        description="The full semantic node payload accessible via node.data in React Flow."
    )
    position: Dict[str, float] = Field(
        default_factory=lambda: {"x": 0.0, "y": 0.0},
        description="Initial canvas X/Y coordinates (default 0,0 before layout engine runs)."
    )


class ReactFlowEdge(BaseModel):
    """
    Canvas-ready wrapper around a GraphEdge for React Flow.
    """
    id: str = Field(..., description="Must match the underlying GraphEdge id.")
    source: str = Field(..., description="Origin node ID.")
    target: str = Field(..., description="Destination node ID.")
    label: EdgeRelation = Field(..., description="Label displayed along the connection line.")
    animated: bool = Field(
        default=False, 
        description="True if the edge should pulse/animate (e.g., LIMITS edges)."
    )
    style: ReactFlowStyle = Field(
        ..., 
        description="Color and width styling properties."
    )

class CompileGraphRequest(BaseModel):
    file_paths: List[str] = Field(default_factory=list, description="Accept multiple files")

class CompileGraphResponse(BaseModel):
    """
    The final HTTP Response schema returned by POST /api/compile-text and /api/compile-pdf.
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