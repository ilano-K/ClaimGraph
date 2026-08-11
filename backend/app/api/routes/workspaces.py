"""Workspace HTTP endpoints"""

from fastapi import APIRouter, Depends, UploadFile, File
from app.schemas.workspace import (
    WorkspaceCreateRequest, 
    WorkspaceResponse, 
    WorkspaceUpdateRequest,
    WorkspaceUploadDocumentResponse,
    WorkspaceCompileRequest,
    WorkspaceCompileResponse
    )
from app.services import workspace_service
from sqlalchemy.orm import Session
from app.db.database import get_db
from typing import List 

router = APIRouter(prefix="/workspaces")

@router.post('/create', response_model=WorkspaceResponse)
def create_workspace(
    payload: WorkspaceCreateRequest, 
    db: Session = Depends(get_db)
):
    """Initially Create the empty workspace"""
    return workspace_service.create_workspace(db, payload) 

@router.post('/{workspace_id}/compile', response_model=WorkspaceCompileResponse)
def compile_workspace(payload: WorkspaceCompileRequest, db: Session = Depends(get_db)):
    return workspace_service.compile_workspace(db, payload)

@router.patch('/{workspace_id}', response_model=WorkspaceResponse)
def update_workspace(
    payload: WorkspaceUpdateRequest, 
    db: Session = Depends(get_db)
):
    return workspace_service.update_workspace(db, payload)

@router.post('/{workspace_id}/documents/upload', response_model=WorkspaceUploadDocumentResponse)
def upload_documents(
    workspace_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    return workspace_service.process_upload_documents(
        db,
        workspace_id,
        files
    )
