from sqlalchemy.orm import Session
from app.schemas.workspace import WorkspaceCreateRequest, WorkspaceUpdateRequest
from app.db.models import Workspace
from app.db.crud import workspace as workspace_crud 
from app.core.exceptions import WorkspaceCreationError, WorkspaceNotFoundError, WorkspaceUpdateError

def create_workspace(db: Session, request: WorkspaceCreateRequest) -> Workspace:
    try:
        return workspace_crud.create_workspace(
            db, name=request.name, 
            description=request.description
        )
    except:
        raise WorkspaceCreationError()

def update_workspace(db: Session, workspace_id: str, request: WorkspaceUpdateRequest) -> Workspace:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    
    if workspace is None:
        raise WorkspaceNotFoundError()
    
    try:
        return workspace_crud.update_workspace(db, workspace=workspace)
    except:
        raise WorkspaceUpdateError()
