from app.core import exceptions
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session
from app.db.crud import workspace as workspace_crud
from app.schemas.node import GraphEdge, GraphNode
from typing import Optional
import uuid 


def get_workspace_graph_for_agent(db: Session, workspace_id: str, document_id: str) -> tuple:
    """Fetch the llm generated claim graph"""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise exceptions.WorkspaceNotFoundError()
    # filter document by daocument id
    doc = next((doc for doc in workspace.documents if doc.id == document_id), None)
    if doc is None:
        raise exceptions.WorkspaceDocumentNotFoundError()
    graph = doc.graph_payload
    if not graph or graph is None:
        raise exceptions.GraphNotFoundError()
    return doc, graph


def _node_not_found_message(node_id: str, nodes: list) -> str:
    known_ids = [n.get("id") for n in nodes if isinstance(n, dict)]
    return (
        f"Error: Node '{node_id}' was not found in the graph. No changes were made. "
        f"Call get_graph_elements first and use one of these exact node IDs: {known_ids}"
    )
    
def add_graph_node_for_agent(
    db: Session, 
    workspace_id: str,
    document_id: str,
    node_category: str,
    title: str, 
    summary: str,
    quote: str,
    confidence_score: float
) -> str:
    try:
        doc, graph = get_workspace_graph_for_agent(db, workspace_id, document_id)
    except exceptions.AppException as e:
        return f"Error: {e.detail}. No changes were made."
    
    new_id = str(uuid.uuid4())
    new_node = GraphNode(
        id=new_id,
        document_id=document_id,
        node_category=node_category,
        title=title,
        summary=summary,
        quote=quote,
        confidence_score=confidence_score
    )
    
    graph.setdefault("nodes", []).append(new_node.model_dump(mode="json"))
    flag_modified(doc, "graph_payload")
    db.commit()

    return f"Success! node created with ID: {new_id}"

def edit_graph_node_for_agent(
    db: Session, 
    workspace_id: str, 
    document_id: str, 
    node_id: str, 
    new_category: Optional[str] = None, 
    new_quote: Optional[str] = None
) -> str:
    """Service to edit a node inside the JSON graph payload."""
    
    try:
        doc, graph = get_workspace_graph_for_agent(db, workspace_id, document_id)
    except exceptions.AppException as e:
        return f"Error: {e.detail}. No changes were made."

    nodes = graph.get("nodes", [])
    node = next((node for node in nodes if node.get('id') == node_id), None)
    
    if node is None:
        return _node_not_found_message(node_id, nodes)
    
    if new_category:
        node["node_category"] = new_category
    if new_quote:
        node["quote"] = new_quote
        
    flag_modified(doc, "graph_payload")
    db.commit()
    
    return f"Success! Node {node_id} has been updated."

def add_graph_edge_for_agent(
    db: Session,
    workspace_id: str,
    document_id: str,
    source_node_id: str,
    target_node_id: str,
    relation: str,
    reasoning: str
):
    try:
        doc, graph = get_workspace_graph_for_agent(db, workspace_id, document_id)
    except exceptions.AppException as e:
        return f"Error: {e.detail}. No changes were made."
    
    nodes = graph.get("nodes", [])
    source = next((node for node in nodes if node.get("id") == source_node_id), None)
    target = next((node for node in nodes if node.get("id") == target_node_id), None)
    
    if source is None:
        return _node_not_found_message(source_node_id, nodes)
    
    if target is None:
        return _node_not_found_message(target_node_id, nodes)
    
    new_id = str(uuid.uuid4())
    new_edge = GraphEdge(
        id=str(uuid.uuid4()),
        source=source_node_id,
        target=target_node_id,
        relation=relation,
        reasoning=reasoning
    )
    
    graph.setdefault("edges", []).append(new_edge.model_dump(mode="json"))
    flag_modified(doc, "graph_payload")
    db.commit()
    
    return f"Success! Edge created with ID: {new_id}"
    
    
    