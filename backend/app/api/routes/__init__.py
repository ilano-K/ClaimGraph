from fastapi import APIRouter
from app.api.routes import workspaces
from app.api.routes import chat

api_router = APIRouter(prefix="/api")
api_router.include_router(workspaces.router)
api_router.include_router(chat.router)