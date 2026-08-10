"""Quote integrity checks.

Enforces the "verbatim quote" contract from the LLM prompt: every node's
``quote`` must appear, character-for-character (case-insensitive), inside its
source document's text.
"""
from app.schemas.node import GraphNode

def find_nodes_with_invalid_quotes(document: str, nodes: list[GraphNode]):
    """Return the ``nodes`` whose ``quote`` is not found verbatim in ``document``.

    Matching is case-insensitive. A node whose quote is not a substring of the
    document is considered invalid and will be dropped from the final graph.
    """
    normalized_document = document.casefold()
    
    invalid_nodes = []
    for node in nodes:
        if not node.quote.casefold() in normalized_document:
            invalid_nodes.append(node)
    return invalid_nodes