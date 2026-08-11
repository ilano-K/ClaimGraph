"""Core graph compilation pipeline.

Turns one or more source files into a verified semantic graph: parses each
file to Markdown, asks the LLM for a structured graph, drops any nodes whose
quotes are not verbatim in their source document, and converts the result
into React Flow-ready payloads.
"""
from app.services.ai_factory import create_client
from app.core.settings import settings
from app.schemas.graph import GraphPayload
from app.schemas.node import GraphNode, GraphEdge
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.schemas.reactflow import ReactFlowNode, ReactFlowEdge, ReactFlowStyle
from app.enums.node import EdgeRelation
from app.core.exceptions import InvalidLLMResponseError
from typing import List
import json


def to_react_flow_nodes(nodes: List[GraphNode]) -> List[ReactFlowNode]:
    """Wrap semantic nodes in React Flow-ready nodes at the default origin."""
    return [
        ReactFlowNode(
            id=node.id,
            type="customCard",
            data=node,
            position={"x": 0.0, "y": 0.0},
        )
        for node in nodes
    ]


# Visual styling + animation per edge relation type (shown on the canvas).
EDGE_STYLE = {
    EdgeRelation.LIMITS: ReactFlowStyle(stroke="#DC2626", strokeWidth=2),
    EdgeRelation.SUPPORTS: ReactFlowStyle(stroke="#16A34A", strokeWidth=2),
    EdgeRelation.DEPENDS_ON: ReactFlowStyle(stroke="#2563EB", strokeWidth=2),
}

EDGE_ANIMATED = {
    EdgeRelation.LIMITS: True,
    EdgeRelation.SUPPORTS: False,
    EdgeRelation.DEPENDS_ON: False,
}


def to_react_flow_edges(edges: List[GraphEdge]) -> List[ReactFlowEdge]:
    """Convert semantic edges into React Flow edges with relation-based styling."""
    return [
        ReactFlowEdge(
            id=edge.id,
            source=edge.source,
            target=edge.target,
            label=edge.relation,
            animated=EDGE_ANIMATED.get(edge.relation, False),
            style=EDGE_STYLE.get(edge.relation, ReactFlowStyle(stroke="#000000")),
        )
        for edge in edges
    ]
    
def generate_claim_graph(documents) -> GraphPayload:
    """Request a structured graph from the LLM for the parsed ``documents``.

    ``documents`` is a list of ``{"document_id", "content"}`` dicts serialized
    as JSON in the user message. After the call, every input ``document_id``
    must appear among the returned nodes' ``document_id`` fields; otherwise the
    response cannot be quote-validated and ``InvalidLLMResponseError`` is raised.
    """
    client = create_client()
    
    result = client.chat.completions.create(
        model = settings.llm_model_name,
        response_model=GraphPayload,
        messages=[
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": json.dumps(documents, ensure_ascii=False),
        },
    ],
    ) 
    
    input_document_ids = {
        document["document_id"]
        for document in documents 
    }
    
    returned_document_ids = {
        node.document_id 
        for node in result.nodes
    }
    
    # Any input document with no node attributed to it means the LLM dropped
    # or renamed an id; fail loudly rather than silently skipping validation.
    invalid_document_ids = (input_document_ids - returned_document_ids)
    
    if invalid_document_ids:
        raise InvalidLLMResponseError()
    
    return result