from enum import Enum 

class NodeCategory(str, Enum):
    CLAIM = "claim"
    EVIDENCE = "evidence"
    TRADEOFF = "tradeoff"
    METHODOLOGY = "methodology"

class EdgeRelation(str, Enum):
    SUPPORTS = "supports"
    LIMITS = "limits"
    DEPENDS_ON = "depends_on"

    