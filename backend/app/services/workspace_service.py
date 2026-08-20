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
    InvalidLLMResponseError,
    WorkspaceRetrievalError
    )
import os
from fastapi import UploadFile
from typing import List 
import shutil 
import uuid
from app.enums.workspace import DocumentStatus
from app.db.models import Document
from app.services.parsers import parse_document
from pathlib import Path
from app.services.graph_service import generate_claim_graph
from app.schemas.graph import GraphNode, GraphEdge
from app.schemas.graph import GraphPayload
from app.services.reactflow import to_react_flow_edges, to_react_flow_nodes
from app.db.fts import insert_chunks_to_fts, has_fts_document
from sqlalchemy.exc import SQLAlchemyError
import logging
import time

logger = logging.getLogger(__name__)


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)

def get_all_workspaces(db: Session):
    try:
        return workspace_crud.get_all_workspaces(db)
    except SQLAlchemyError as exc:
        raise WorkspaceRetrievalError() from exc


def get_workspace_detail(db: Session, workspace_id: str) -> Workspace:
    """Fetch a workspace with its documents, or raise if it does not exist."""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    # Touch the relationship so the response serializer always has it loaded.
    _ = workspace.documents
    return workspace
        

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


def compile_document(db: Session, workspace_id: str, document_id: str):
    start = time.perf_counter()
    logger.info(
        "compile_document entry workspace_id=%s document_id=%s",
        workspace_id,
        document_id,
    )

    # 1. get and check the workspace
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()

    # 2. get the document and verify it belongs to the workspace
    document = document_crud.get_document(db, document_id)
    if document is None or document.workspace_id != workspace_id:
        raise WorkspaceDocumentNotFoundError()

    try:
        # 3. check the physical file exists
        if not Path(document.file_path).is_file():
            raise FileNotFoundError()

        # 4. Mark the document as analyzing
        document.status = DocumentStatus.ANALYZING
        db.commit()

        # 5. Parse the document at most once (recompile fast path): when the
        # markdown is cached AND the FTS index already holds this document,
        # Docling can be skipped entirely.
        if document.content and has_fts_document(db, document.id):
            logger.info(
                "compile_document reusing cached content + FTS for %s",
                document.filename,
            )
            processed_content = document.content
        else:
            logger.info("compile_document running Docling on %s", document.filename)
            markdown, chunks = parse_document(document.file_path)
            if not document.content:
                document.content = markdown
            insert_chunks_to_fts(db, workspace_id, document.id, chunks)
            processed_content = markdown

        parsed = [
            {
                "document_id": document.id,
                "content": processed_content,
                "filename": document.filename,
            }
        ]

        # 6. Generate the standalone claim graph for this single document
        logger.info("compile_document generating claim graph")
        claim_graph = generate_claim_graph(parsed)

        # 7. Validate quotes and remove invalid nodes/edges
        total_nodes = len(claim_graph.nodes)
        claim_graph.nodes, claim_graph.edges = validate_document_quotes(parsed, claim_graph)
        logger.info(
            "compile_document quote validation dropped %d invalid node(s)",
            total_nodes - len(claim_graph.nodes),
        )

        # 8. Build the frontend graph
        react_flow_nodes = to_react_flow_nodes(claim_graph.nodes)
        react_flow_edges = to_react_flow_edges(claim_graph.edges)

        # 9. Persist the per-document result
        document.status = DocumentStatus.READY
        document.graph_payload = claim_graph.model_dump(mode="json")
        document.claim_count = sum(
            node.node_category.value == "claim" for node in claim_graph.nodes
        )
        document.evidence_count = sum(
            node.node_category.value == "evidence" for node in claim_graph.nodes
        )
        db.commit()
        db.refresh(document)

        logger.info(
            "compile_document success in %dms nodes=%d edges=%d",
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

    except (FileNotFoundError, InvalidLLMResponseError, WorkspaceCompilationError):
        logger.exception("compile_document failed in %dms", _elapsed_ms(start))
        mark_document_failed(db, document)
        raise
    except Exception as exc:
        logger.exception("compile_document failed in %dms", _elapsed_ms(start))
        mark_document_failed(db, document)
        raise WorkspaceCompilationError() from exc


def mark_document_failed(db: Session, document: Document):
    """Set a document's status to FAILED and commit."""
    if document is not None:
        document.status = DocumentStatus.FAILED
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
) -> dict:
    """Persist uploaded files as workspace :class:`Document` rows.

    Written to guarantee that every Document row maps to its own unique bytes
    on disk:

    * Each upload is stored under a ``<uuid>-<name>`` filename, so Documents
      never share a ``file_path``. The original ``filename`` is kept untouched
      for display in the UI.
    * A file whose display name already exists in the workspace *replaces* the
      previous Document instead of adding a duplicate row.

    The previous implementation saved every upload to ``<workspace>/<name>``,
    so re-uploading a file with the same name overwrote the single on-disk file
    while creating extra Document rows — all pointing at identical bytes. At
    compile time those identical copies were collapsed by the LLM into one
    ``document_id``, which tripped the per-document validation and surfaced as
    ``InvalidLLMResponseError`` ("missing document_ids").

    Returns ``{"documents": [Document, ...]}`` to match the upload response
    schema.
    """
    start = time.perf_counter()
    logger.info("upload_documents entry workspace_id=%s files=%d", workspace_id, len(files))

    # Directory that holds every physical upload for this workspace.
    upload_dir = f"./claimgraph/data/{workspace_id}"
    os.makedirs(upload_dir, exist_ok=True)

    # The display filename is the identity of a document inside a workspace:
    # re-uploading a file updates that document rather than duplicating its
    # content (which previously broke graph compilation).
    existing_by_filename = {
        doc.filename: doc
        for doc in db.query(Document).filter(Document.workspace_id == workspace_id).all()
    }

    # Filenames already accepted within this batch, so a file listed twice in
    # a single request resolves to one document instead of conflicting rows.
    seen_filenames = set()

    created_documents = []
    for file in files:
        # Clients can send a full path; store only the safe base name.
        original_name = os.path.basename(file.filename or "upload")

        if original_name in seen_filenames:
            logger.info("upload_documents skipping duplicate filename=%s", original_name)
            continue
        seen_filenames.add(original_name)

        # Unique on-disk name (uuid prefix) so documents never collide on the
        # same path even when their display names match.
        storage_name = f"{uuid.uuid4()}-{original_name}"
        file_path = os.path.join(upload_dir, storage_name)

        # Write the new file BEFORE touching the existing document, so a
        # failed write cannot destroy the previous version being replaced.
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception:
            # Remove any partial file so a failed upload leaves no orphan.
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
            except OSError:
                pass
            raise

        # Replace the previous document with the same display name, including
        # its stale physical file. Best effort: failing to delete old bytes
        # must not fail the upload.
        existing = existing_by_filename.get(original_name)
        if existing is not None:
            db.delete(existing)
            try:
                if os.path.isfile(existing.file_path):
                    os.remove(existing.file_path)
            except OSError:
                logger.warning(
                    "upload_documents failed to remove replaced file path=%s",
                    existing.file_path,
                )

        # Save the new document record.
        doc = document_crud.create_document(
            db,
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            filename=original_name,
            file_path=file_path,
            status=DocumentStatus.NOT_ANALYZED,
            claim_count=0,
            evidence_count=0,
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