"""SQLAlchemy ORM models for workspaces and their documents.

The Workspace row backs the workspace cards on the dashboard and holds the
compiled graph payload; Document rows track per-file state inside a workspace.
"""
from datetime import datetime, timezone
from app.db.database import Base
from sqlalchemy import (
    String, Enum,
    DateTime, JSON,
    Integer
)

from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.enums.workspace import IngressMode, WorkspaceStatus
from typing import Optional, Dict, Any, List

class Workspace(Base):
    """A single workspace; populates the dashboard cards and holds documents."""

    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    
    ingress_mode: Mapped[IngressMode] = mapped_column(
        Enum(IngressMode), 
        default=IngressMode.HTTP, 
    )
    
    status: Mapped[WorkspaceStatus] = mapped_column(
        Enum(WorkspaceStatus), 
        default=WorkspaceStatus.EMPTY, 
    )
    
    # Serialized GraphPayload for the workspace once compilation succeeds.
    graph_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    
    documents: Mapped[List["Document"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    

class Document(Base):
    """A source file uploaded to a workspace, with extracted-node counts."""

    __tablename__ = "documents"
    id: Mapped[str]= mapped_column(String, primary_key=True)
    workspace_id: Mapped["Workspace"] = relationship(back_populates="documents")
    filename = mapped_column(String, nullable=False),
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    tradeoff_count: Mapped[int] = mapped_column(Integer, default=0)
    
    