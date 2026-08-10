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
from app.services.parsers import parse_document_to_markdown
from app.schemas.api import CompileGraphResponse
from app.services.verify_quotes import find_nodes_with_invalid_quotes
from app.schemas.api import ReactFlowNode, ReactFlowEdge, ReactFlowStyle
from app.enums.node import EdgeRelation
from app.core.exceptions import GraphCompilationError, InvalidLLMResponseError, WorkspaceNotFoundError
from app.db.crud import workspace as workspace_crud, document as document_crud
from app.enums.workspace import WorkspaceStatus, DocumentStatus
from app.enums.node import NodeCategory
from sqlalchemy.orm import Session
from pathlib import Path
from typing import List
import json
import uuid

def process_compile_graph(file_paths: List[str], workspace_id: str, db: Session):
    """Compile a full graph from the given file paths.

    Each file is parsed to Markdown and tagged with a UUID-based IDs.. 
    Nodes are validated per document so a
    quote is only accepted if it appears verbatim in *its own* document.
    Raises :class:`GraphCompilationError` for pipeline failures and
    :class:`InvalidLLMResponseError` when the LLM omits an input document.
    """
    # 1. get the corresponding workspace
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    
    try:
        # 2. Check if the source files exist
        if not file_paths or not all(Path(path).is_file() for path in file_paths):
            raise FileNotFoundError()

        # 3. Mark workspace as compiling
        workspace.status = WorkspaceStatus.COMPILING
        db.commit()
        # 4. parse documents
        documents = []
        for file_path in file_paths:
            document_id = str(uuid.uuid4())
            documents.append({
                "document_id": document_id,
                "content": parse_document_to_markdown(file_path),
                "filename": Path(file_path).name
            })
        
        # 5. Generate Graph
        claim_graph = generate_claim_graph(documents)
        
        # 6. Validate quotes
        # get list of invalid node ids
        invalid_node_ids = set()
        
        # Validate quotes per document: a node is only checked against the
        # markdown of the document it claims to come from.
        for document in documents:
            document_id = document["document_id"]
            document_markdown = document["content"]
            
            document_nodes = [
                node 
                for node in claim_graph.nodes
                if node.document_id == document_id
            ]
            
            invalid_nodes = find_nodes_with_invalid_quotes(
                document_markdown, 
                document_nodes
            )
            
            invalid_node_ids.update(node.id for node in invalid_nodes)
            
        # 7. Remove invalid nodes
        # Drop invalid nodes and any edge touching them, then rebuild.
        # keep only valid nodes and edges
        claim_graph.nodes = [
            n for n in claim_graph.nodes if n.id not in invalid_node_ids
        ]
        claim_graph.edges = [
            e for e in claim_graph.edges 
            if e.source not in invalid_node_ids and e.target not in invalid_node_ids
        ]
        
        # 10. Build frontend graph
        react_flow_nodes = to_react_flow_nodes(claim_graph.nodes)
        react_flow_edges = to_react_flow_edges(claim_graph.edges)
            
        # 8. Save documents
        for document in documents:
            claim_count = sum(
                node.document_id == document['document_id']
                and node.node_category == NodeCategory.CLAIM
                for node in claim_graph.nodes
            )
            
            evidence_count = sum(
                            node.document_id == document['document_id']
                            and node.node_category == NodeCategory.EVIDENCE
                            for node in claim_graph.nodes
                        )
            
            tradeoff_count = sum(
                            node.document_id == document['document_id']
                            and node.node_category == NodeCategory.TRADEOFF
                            for node in claim_graph.nodes
                        )
            document_crud.create_document(
                db,
                id=document['document_id'],
                workspace_id=workspace_id,
                filename=document['filename'],
                claim_count=claim_count,
                evidence_count=evidence_count,
                tradeoff_count=tradeoff_count,
            )
        
        # 9. Save workspace
        workspace.status = WorkspaceStatus.READY
        workspace.graph_payload = claim_graph.model_dump()
        
        db.commit()
        db.refresh(workspace)

        return CompileGraphResponse(
            success=True,
            documents=claim_graph.documents,
            graph=claim_graph,
            react_flow_nodes=react_flow_nodes,
            react_flow_edges=react_flow_edges,
        )
    except InvalidLLMResponseError:
        db.rollback()
        
        workspace = workspace_crud.get_workspace(
            db,
            workspace_id,
        )

        if workspace is not None:
            workspace.status = WorkspaceStatus.FAILED
            db.commit()
        # Surface LLM-specific failures as-is so clients get a precise message.
        raise 
    except Exception as exc:
        db.rollback()
        workspace = workspace_crud.get_workspace(
            db,
            workspace_id,
        )

        if workspace is not None:
            workspace.status = WorkspaceStatus.FAILED
            db.commit()
        raise GraphCompilationError() from exc



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