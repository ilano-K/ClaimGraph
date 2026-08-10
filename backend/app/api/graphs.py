"""Graph compilation HTTP endpoints."""

from fastapi import APIRouter, Depends
from app.schemas.api import CompileGraphRequest, CompileGraphResponse
from backend.app.services.graph_service import process_compile_graph
from sqlalchemy.orm import Session
from app.db.database import get_db

router = APIRouter(prefix="/graphs")

@router.post('/compile', response_model=CompileGraphResponse)
def compile_graph(payload: CompileGraphRequest, db: Session = Depends(get_db)):
    """Compile one or more source files into a verified semantic graph."""
    return process_compile_graph(payload.file_paths, payload.workspace_id, db)

