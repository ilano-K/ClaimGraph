"""Workspace HTTP endpoints"""

from fastapi import APIRouter, Depends
from app.schemas.workspace import WorkspaceCreateRequest, WorkspaceResponse, WorkspaceUpdateRequest
from app.services import workspace_service
from sqlalchemy.orm import Session
from app.db.database import get_db

router = APIRouter(prefix="/workspaces")

@router.post('/create', response_model=WorkspaceResponse)
def create_workspace(payload: WorkspaceCreateRequest, db: Session = Depends(get_db)):
    """Initially Create the empty workspace"""
    return workspace_service.create_workspace(db, payload) 

@router.patch('/{workspace_id}', response_model=WorkspaceResponse)
def update_workspace(workspace_id: str, payload: WorkspaceUpdateRequest, db: Session = Depends(get_db)):
    return workspace_service.update_workspace(db, workspace_id, payload)