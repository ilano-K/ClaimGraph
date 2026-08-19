"""Mapping from the semantic graph to React Flow canvas primitives."""
from typing import List

from app.enums.node import EdgeRelation
from app.schemas.node import GraphEdge, GraphNode
from app.schemas.reactflow import (
    ReactFlowEdge,
    ReactFlowNode,
    ReactFlowStyle,
)


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
    EdgeRelation.SUPPORTS: ReactFlowStyle(stroke="#22D3EE", strokeWidth=2),
    EdgeRelation.LIMITS: ReactFlowStyle(stroke="#FACC15", strokeWidth=2),
    EdgeRelation.CAUSES: ReactFlowStyle(stroke="#F97316", strokeWidth=3),
    EdgeRelation.CHALLENGES: ReactFlowStyle(stroke="#EF4444", strokeWidth=4),
}

EDGE_ANIMATED = {
    EdgeRelation.SUPPORTS: False,
    EdgeRelation.LIMITS: True,
    EdgeRelation.CAUSES: False,
    EdgeRelation.CHALLENGES: False,
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