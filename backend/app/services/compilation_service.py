from app.db.crud import document as document_crud, workspace as workspace_crud
from app.services.reactflow import to_react_flow_edges, to_react_flow_nodes
from app.core.exceptions import (FileMissingError, InvalidLLMResponseError, WorkspaceCompilationError)
from app.schemas.workspace import DocumentCompileResponse
from app.services.parsers import parse_document
from app.services.graph_service import generate_claim_graph, validate_document_quotes
from app.db.fts import insert_chunks_to_fts, has_fts_document
from app.db.models import Document
from app.services.parsers import parse_document
from app.enums.workspace import DocumentStatus
from app.core import exceptions
from sqlalchemy.orm import Session
from pathlib import Path
import logging
import time 

logger = logging.getLogger(__name__)

def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)

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
        raise exceptions.WorkspaceNotFoundError()

    # 2. get the document and verify it belongs to the workspace
    document = document_crud.get_document(db, document_id)
    if document is None or document.workspace_id != workspace_id:
        raise exceptions.WorkspaceDocumentNotFoundError()

    try:
        # 3. check the physical file exists
        if not Path(document.file_path).is_file():
            raise FileMissingError()

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

        return DocumentCompileResponse(
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