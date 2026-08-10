from datetime import datetime, timezone
from app.db.database import Base
from sqlalchemy import (
    String, Enum,
    DateTime, ForeignKey, JSON,
    Integer
)

from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.enums.workspace import IngressMode, WorkspaceStatus
from typing import Optional, Dict, Any, List

""" 
Populates the Workspace Cards on the dashboard.
Holds documents, graphs--nodes & edges
"""
class Workspace(Base):
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
    __tablename__ = "documents"
    id: Mapped[str]= mapped_column(String, primary_key=True)
    workspace: Mapped["Workspace"] = relationship(back_populates="documents")
    filename = mapped_column(String, nullable=False),
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    tradeoff_count: Mapped[int] = mapped_column(Integer, default=0)
    
    