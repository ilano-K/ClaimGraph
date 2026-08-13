from sqlalchemy.orm import Session
from app.schemas.workspace import (
    WorkspaceCreateRequest, 
    WorkspaceUpdateRequest,
    WorkspaceCompileResponse
    )
from app.db.models import Workspace
from app.db.crud import workspace as workspace_crud 
from app.db.crud import document as document_crud
from app.core.exceptions import (
    FileNotFoundError,
    WorkspaceCreationError, 
    WorkspaceNotFoundError, 
    WorkspaceUpdateError,
    WorkspaceDocumentNotFoundError,
    WorkspaceCompilationError,
    InvalidLLMResponseError
    )
import os
from fastapi import UploadFile
from typing import List 
import shutil 
import uuid
from app.enums.workspace import DocumentStatus, WorkspaceStatus
from app.db.models import Document
from app.services.parsers import parse_document_to_markdown
from pathlib import Path
from app.services.graph_service import generate_claim_graph
from app.schemas.graph import GraphNode, GraphEdge
from app.schemas.graph import GraphPayload
from app.services.graph_service import to_react_flow_edges, to_react_flow_nodes
import logging
import time

logger = logging.getLogger(__name__)


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


def create_workspace(db: Session, request: WorkspaceCreateRequest) -> Workspace:
    start = time.perf_counter()
    logger.info("create_workspace entry name=%s", request.name)
    try:
        workspace = workspace_crud.create_workspace(
            db, name=request.name,
            description=request.description
        )

        db.commit()
        db.refresh(workspace)
        logger.info(
            "create_workspace success in %dms workspace_id=%s",
            _elapsed_ms(start),
            workspace.id,
        )
        return workspace
    except Exception:
        db.rollback()
        logger.exception("create_workspace failed in %dms", _elapsed_ms(start))
        raise WorkspaceCreationError()

def compile_workspace(db: Session, workspace_id: str):
    start = time.perf_counter()
    logger.info("compile_workspace entry workspace_id=%s", workspace_id)

    # 1. get and check the corresponding workspace
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()

    # 2. get and verify the workspace contains documents
    documents = workspace.documents
    if not documents or documents is None:
        raise WorkspaceDocumentNotFoundError()
    logger.info("compile_workspace found %d document(s)", len(documents))

    try:
        # 3. Mark workspace as compiling
        workspace.status = WorkspaceStatus.COMPILING
        db.commit()

        # 4. parse the documents
        logger.info("compile_workspace parsing %d document(s)", len(documents))
        parsed_documents = []
        for doc in documents:
            path = Path(doc.file_path)

            # 5. check if file exist
            if not path.is_file():
                raise FileNotFoundError()

            parsed_documents.append({
                "document_id": doc.id,
                "content": parse_document_to_markdown(doc.file_path),
                "filename": doc.filename
            })

        # 5. Generate Graph
        logger.info("compile_workspace generating claim graph")
        claim_graph = generate_claim_graph(parsed_documents)

        # 6. validate  and remove invalid quotes
        total_nodes = len(claim_graph.nodes)
        claim_graph.nodes, claim_graph.edges = validate_document_quotes(parsed_documents, claim_graph)
        logger.info(
            "compile_workspace quote validation dropped %d invalid node(s)",
            total_nodes - len(claim_graph.nodes),
        )

        # 10. Build frontend graph
        react_flow_nodes = to_react_flow_nodes(claim_graph.nodes)
        react_flow_edges = to_react_flow_edges(claim_graph.edges)

        # 11. Update workspace
        workspace.status = WorkspaceStatus.READY
        workspace.graph_payload = claim_graph.model_dump(mode="json")

        db.commit()
        db.refresh(workspace)

        logger.info(
            "compile_workspace success in %dms nodes=%d edges=%d",
            _elapsed_ms(start),
            len(claim_graph.nodes),
            len(claim_graph.edges),
        )

        return WorkspaceCompileResponse(
            success=True,
            documents=claim_graph.documents,
            graph=claim_graph,
            react_flow_nodes=react_flow_nodes,
            react_flow_edges=react_flow_edges,
        )

    except FileNotFoundError:
        logger.exception("compile_workspace failed in %dms", _elapsed_ms(start))
        execute_rollback_on_error(db, workspace_id, workspace)
        raise
    except InvalidLLMResponseError:
        logger.exception("compile_workspace failed in %dms", _elapsed_ms(start))
        execute_rollback_on_error(db, workspace_id, workspace)
        raise
    except Exception as exc:
        logger.exception("compile_workspace failed in %dms", _elapsed_ms(start))
        execute_rollback_on_error(db, workspace_id, workspace)
        raise WorkspaceCompilationError() from exc 

def execute_rollback_on_error(db: Session, workspace_id: str, workspace: Workspace = None):
    # fetch workspace if not passed as an argument
    if workspace is None:
        workspace = workspace_crud.get_workspace(db, workspace_id)
    
    # Set status as failed and commit on error
    if workspace is not None:
        workspace.status = WorkspaceStatus.FAILED
        db.commit()
def validate_document_quotes(
    documents, 
    claim_graph: GraphPayload
    ) -> tuple[List[GraphNode], List[GraphEdge]]:
    # get list of invalid node ids
    invalid_node_ids = set()
    
    for document in documents:
        document_id = document['document_id']
        document_markdown = document['content']
        
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
    
    nodes = [
        n for n in claim_graph.nodes if n.id not in invalid_node_ids
        ]
    
    edges = [
        e for e in claim_graph.edges
        if e.source not in invalid_node_ids and e.target not in invalid_node_ids
    ]
    
    return nodes, edges
        

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
    
def update_workspace(db: Session, request: WorkspaceUpdateRequest) -> Workspace:
    start = time.perf_counter()
    logger.info("update_workspace entry workspace_id=%s", request.workspace_id)
    workspace = workspace_crud.get_workspace(db, request.workspace_id)

    if workspace is None:
        raise WorkspaceNotFoundError()

    try:
        workspace.name = request.name

        db.commit()
        db.refresh(workspace)
        logger.info("update_workspace success in %dms", _elapsed_ms(start))
        return workspace

    except Exception:
        db.rollback()
        logger.exception("update_workspace failed in %dms", _elapsed_ms(start))
        raise WorkspaceUpdateError()

def process_upload_documents(
    db: Session,
    workspace_id: str,
    files: List[UploadFile],
) -> List[Document]:
    start = time.perf_counter()
    logger.info("upload_documents entry workspace_id=%s files=%d", workspace_id, len(files))
    upload_dir = f"./claimgraph/data/{workspace_id}"
    os.makedirs(upload_dir, exist_ok=True)

    created_documents = []
    for file in files:
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        # save document
        doc = document_crud.create_document(
            db,
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            filename=file.filename,
            file_path=file_path,
            status=DocumentStatus.QUEUED,
            claim_count=0,
            evidence_count=0,
            tradeoff_count=0,
        )
        created_documents.append(doc)

    db.commit()
    for doc in created_documents:
        db.refresh(doc)

    logger.info(
        "upload_documents success in %dms documents=%d",
        _elapsed_ms(start),
        len(created_documents),
    )
    return {"documents": created_documents}