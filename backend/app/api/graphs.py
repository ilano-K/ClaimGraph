from fastapi import APIRouter
from app.schemas.api import CompileGraphRequest, CompileGraphResponse
from app.services.extractor import process_compile_graph
router = APIRouter(prefix="/graphs")

@router.post('/compile', response_model=CompileGraphResponse)
def compile_graph(payload: CompileGraphRequest):
    return process_compile_graph(payload.file_paths)