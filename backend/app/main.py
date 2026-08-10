"""ClaimGraph API entrypoint.

Creates the FastAPI app, wires up CORS and routers, and registers a global
handler that renders :class:`app.core.exceptions.AppException` subclasses as
JSON errors. Run with ``python -m app.main`` to serve on 127.0.0.1:8000.
"""
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.api.graphs import router as graphs_router
from backend.app.api.workspaces import router as workspaces_router
from app.core.exceptions import AppException
import logging 
import uvicorn

logging.basicConfig(
    filename="claim-graph.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

logger = logging.getLogger(__name__)
logger.info("Backend starting...")

app = FastAPI(title="ClaimGraph")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins
    allow_credentials=True,
    allow_methods=["*"], # Allows POST, GET, PUT, DELETE
    allow_headers=["*"], 
)

app.include_router(graphs_router)
app.include_router(workspaces_router)

# Render any AppException subclass as a JSON error with its status/detail.
@app.exception_handler(AppException)
def app_exception_handler(req: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

if __name__ == "__main__":
    logger.info("Starting uvicorn server")
    uvicorn.run(app, host="127.0.0.1", port=8000)