"""Pydantic models for the semantic graph's building blocks: nodes and edges."""

from pydantic import BaseModel, Field
from app.enums.node import NodeCategory, EdgeRelation


"""
Represents a single extracted idea or statement from the document.
"""
class GraphNode(BaseModel):
    id: str
    document_id: str
    node_category: NodeCategory = Field(description="The classification category of the node")
    title: str = Field(description="A concise 3-to-7 word title for the card reader")
    summary: str = Field(description="A 1-to-2 sentence plain-English explaination of the point")
    quote: str = Field(description="The verbatim paragraph excerpt from the document backing this claim.")
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Model extraction confidence score between 0.0 and 1.0."
    )

"""
Represents a directional relationship between two Graph Nodes.
"""
class GraphEdge(BaseModel):
    id: str
    source: str = Field(description="The ID of the origin node. ")
    target: str = Field(description="The ID of the destination node.")
    relation: EdgeRelation = Field(description="Relation ship between two nodes (SUPPORTS, LIMITS, DEPENDS_ON)")
    reasoning: str = Field(description="One sentence explanation of why these nodes are linked.")