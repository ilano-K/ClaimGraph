from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models import Workspace

def create_workspace(db: Session, *, name: str, description: str) -> Workspace:
    workspace = Workspace(
        name=name,
        description=description
    )
    
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return workspace

def get_workspace(db: Session, id: str) -> Workspace | None:
    stmt = select(Workspace).where(Workspace.id == id)

    return db.scalar(stmt)

def update_workspace(db: Session, workspace: Workspace) -> Workspace:
    db.commit()
    db.refresh(workspace)

    return workspace

def delete_workspace(db: Session, document) -> None:
    db.commit()
    db.refresh(document)

