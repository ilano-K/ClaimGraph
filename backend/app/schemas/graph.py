from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.node import GraphNode, GraphEdge

class DocumentMetadata(BaseModel):
    id: str
    title: str = Field(default="Untitled Document")
    author: Optional[List[str]] = Field(default_factory=list)
    token_count: int = Field(default=0)

""" 
Returned by the LLM extraction pipeline.
"""

class DocumentAnalysis(BaseModel):
    metadata: DocumentMetadata
    executive_summary: str = Field(
        ...,
        description="A 3-sentence executive summary of the paper's architecture and trade-offs.")
    
class GraphPayload(BaseModel):
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
    