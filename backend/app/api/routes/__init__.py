from fastapi import APIRouter
from app.api.routes import workspaces

api_router = APIRouter(prefix="/api")
api_router.include_router(workspaces.router)
