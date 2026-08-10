"""Shared enums that classify graph nodes and edges."""

from enum import Enum 

class NodeCategory(str, Enum):
    """Taxonomy categories assigned to every node extracted from a document."""

    CLAIM = "claim"
    EVIDENCE = "evidence"
    TRADEOFF = "tradeoff"
    METHODOLOGY = "methodology"

class EdgeRelation(str, Enum):
    """Directional relationship types used to connect two nodes."""

    SUPPORTS = "supports"
    LIMITS = "limits"
    DEPENDS_ON = "depends_on"

    