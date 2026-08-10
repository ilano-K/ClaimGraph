from sqlalchemy.orm import Session
from app.schemas.workspace import WorkspaceCreateRequest, WorkspaceUpdateRequest
from app.db.models import Workspace
from app.db.crud import workspace as workspace_crud 
from app.core.exceptions import WorkspaceCreationError, WorkspaceNotFoundError, WorkspaceUpdateError

def create_workspace(db: Session, request: WorkspaceCreateRequest) -> Workspace:
    try:
        workspace = workspace_crud.create_workspace(
            db, name=request.name, 
            description=request.description
        )
        
        db.commit()
        db.refresh(workspace)
        return workspace
    except:
        db.rollback()
        raise WorkspaceCreationError()

def update_workspace(db: Session, workspace_id: str, request: WorkspaceUpdateRequest) -> Workspace:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    
    if workspace is None:
        raise WorkspaceNotFoundError()

    try:
        workspace.name = request.name

        db.commit()
        db.refresh(workspace)
        return workspace

    except:
        db.rollback()
        raise WorkspaceUpdateError()
