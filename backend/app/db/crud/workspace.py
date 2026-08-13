from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import Workspace

def create_workspace(
    db: Session,
    *,
    name: str,
    description: str,
) -> Workspace:
    workspace = Workspace(
        name=name,
        description=description,
    )

    db.add(workspace)

    return workspace

def get_workspace(
    db: Session,
    id: str,
) -> Workspace | None:
    stmt = select(Workspace).where(Workspace.id == id)

    return db.scalar(stmt)

def get_all_workspaces(db: Session) -> list[Workspace]:
    stmt = select(Workspace)
    return db.scalars(stmt).all()

def update_workspace(
    db: Session,
    workspace: Workspace,
) -> Workspace:
    db.add(workspace)

    return workspace

def delete_workspace(
    db: Session,
    workspace: Workspace,
) -> None:
    db.delete(workspace)