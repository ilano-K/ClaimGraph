from app.services.ai_factory import create_client
from app.core.settings import settings
from app.schemas.graph import GraphPayload
from app.schemas.node import GraphNode, GraphEdge
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.services.parsers import parse_document_to_markdown
from app.schemas.api import CompileGraphResponse
from app.services.verify_quotes import find_nodes_with_invalid_quotes
from app.schemas.api import ReactFlowNode, ReactFlowEdge, ReactFlowStyle
from app.enums.node import EdgeRelation
from typing import List

def process_compile_graph(file_path: str):
    document_markdown = parse_document_to_markdown(file_path)
    
    claim_graph = generate_claim_graph(document_markdown)
    
    # get list of invalid node ids
    invalid_node_ids = {
        node.id for node in find_nodes_with_invalid_quotes(document_markdown, claim_graph.nodes)
    }
    valid_nodes = [
        n for n in claim_graph.nodes if n.id not in invalid_node_ids
    ]
    valid_edges = [
        e for e in claim_graph.edges 
        if e.source not in invalid_node_ids and e.target not in invalid_node_ids
    ]
    
    
    # keep only valid nodes and edges
    claim_graph.nodes = valid_nodes
    claim_graph.edges = valid_edges

    react_flow_nodes = to_react_flow_nodes(claim_graph.nodes)
    react_flow_edges = to_react_flow_edges(claim_graph.edges)

    return CompileGraphResponse(
        success=True,
        summary=claim_graph.executive_summary,
        metadata=claim_graph.metadata,
        graph=claim_graph,
        react_flow_nodes=react_flow_nodes,
        react_flow_edges=react_flow_edges,
    )


def to_react_flow_nodes(nodes: List[GraphNode]) -> List[ReactFlowNode]:
    return [
        ReactFlowNode(
            id=node.id,
            type="customCard",
            data=node,
            position={"x": 0.0, "y": 0.0},
        )
        for node in nodes
    ]


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
    
def generate_claim_graph(document):
    client = create_client()
    
    result = client.chat.completions.create(
        model = settings.llm_model,
        response_model=GraphPayload,
        messages=[
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": document,
        },
    ],
    ) 
    
    
    return result