from sqlalchemy.orm import Session
from app.schemas.workspace import (
    WorkspaceCreateRequest, 
    WorkspaceUpdateRequest,
    )
from app.db.models import Workspace
from app.db.crud import workspace as workspace_crud 
from app.core.exceptions import (
    WorkspaceCreationError, 
    WorkspaceNotFoundError, 
    WorkspaceUpdateError,
    WorkspaceRetrievalError,
    )
from sqlalchemy.exc import SQLAlchemyError
import logging
import time

logger = logging.getLogger(__name__)

def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)

def get_workspace_detail(db: Session, workspace_id: str) -> Workspace:
    """Fetch a workspace with its documents, or raise if it does not exist."""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    # Touch the relationship so the response serializer always has it loaded.
    _ = workspace.documents
    return workspace

def get_all_workspaces(db: Session):
    try:
        return workspace_crud.get_all_workspaces(db)
    except SQLAlchemyError as exc:
        raise WorkspaceRetrievalError() from exc

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

