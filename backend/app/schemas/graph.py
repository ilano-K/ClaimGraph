"""Pydantic models describing the full graph payload returned by the LLM pipeline."""

from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.node import GraphNode, GraphEdge

class DocumentMetadata(BaseModel):
    """Identifying and descriptive metadata for a single source document.

    Returned by the LLM extraction pipeline.
    """

    id: str
    title: str = Field(default="Untitled Document")
    author: Optional[List[str]] = Field(default_factory=list)
    token_count: int = Field(default=0)

class DocumentAnalysis(BaseModel):
    """Per-document summary and metadata produced by the LLM."""

    metadata: DocumentMetadata
    executive_summary: str = Field(
        ...,
        description="A 3-sentence executive summary of the paper's architecture and trade-offs.")
    
class GraphPayload(BaseModel):
    """The complete semantic graph: per-document analysis plus all nodes and edges."""

    documents: List[DocumentAnalysis]  = Field(
        ...,
        description="Analysis and metadata for each source document."
    )
    nodes: List[GraphNode] = Field(
        ...,
        description="Collection of extracted Nodes"
    )
    edges: List[GraphEdge] = Field(
       ...,
        description="Collection of all directional relationships connecting the nodes"
    )
    