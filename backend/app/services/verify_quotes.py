from app.schemas.node import GraphNode

def find_nodes_with_invalid_quotes(document: str, nodes: list[GraphNode]):
    normalized_document = document.casefold()
    
    invalid_nodes = []
    for node in nodes:
        if not node.quote.casefold() in normalized_document:
            invalid_nodes.append(node)
    return invalid_nodes