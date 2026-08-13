"""Workspace HTTP endpoints"""

from fastapi import APIRouter, Depends, UploadFile, File
from app.schemas.workspace import (
    WorkspaceCreateRequest,
    WorkspaceResponse,
    WorkspaceUpdateRequest,
    WorkspaceUploadDocumentResponse,
    WorkspaceCompileResponse,
)
from app.services import workspace_service
from sqlalchemy.orm import Session
from app.db.database import get_db
from typing import List
import logging
import time

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces")


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


@router.post('/create', response_model=WorkspaceResponse)
def create_workspace(
    payload: WorkspaceCreateRequest,
    db: Session = Depends(get_db)
):
    """Initially Create the empty workspace"""
    start = time.perf_counter()
    logger.info("create_workspace entry")
    try:
        result = workspace_service.create_workspace(db, payload)
    except Exception:
        logger.exception("create_workspace failed in %dms", _elapsed_ms(start))
        raise
    logger.info("create_workspace success in %dms", _elapsed_ms(start))
    return result


@router.post('/{workspace_id}/compile', response_model=WorkspaceCompileResponse)
def compile_workspace(workspace_id: str, db: Session = Depends(get_db)):
    start = time.perf_counter()
    logger.info("compile_workspace entry workspace_id=%s", workspace_id)
    try:
        result = workspace_service.compile_workspace(db, workspace_id)
    except Exception:
        logger.exception("compile_workspace failed in %dms", _elapsed_ms(start))
        raise
    logger.info("compile_workspace success in %dms", _elapsed_ms(start))
    return result


@router.patch('/{workspace_id}', response_model=WorkspaceResponse)
def update_workspace(
    payload: WorkspaceUpdateRequest,
    db: Session = Depends(get_db)
):
    start = time.perf_counter()
    logger.info("update_workspace entry workspace_id=%s", payload.workspace_id)
    try:
        result = workspace_service.update_workspace(db, payload)
    except Exception:
        logger.exception("update_workspace failed in %dms", _elapsed_ms(start))
        raise
    logger.info("update_workspace success in %dms", _elapsed_ms(start))
    return result


@router.post('/{workspace_id}/documents/upload', response_model=WorkspaceUploadDocumentResponse)
def upload_documents(
    workspace_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    start = time.perf_counter()
    logger.info(
        "upload_documents entry workspace_id=%s files=%s",
        workspace_id,
        [f.filename for f in files],
    )
    try:
        result = workspace_service.process_upload_documents(
            db,
            workspace_id,
            files
        )
    except Exception:
        logger.exception("upload_documents failed in %dms", _elapsed_ms(start))
        raise
    logger.info("upload_documents success in %dms", _elapsed_ms(start))
    return result
