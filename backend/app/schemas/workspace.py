from pydantic import BaseModel, ConfigDict
from app.enums.workspace import IngressMode, WorkspaceStatus
from typing import Any 
from datetime import datetime 

class WorkspaceResponse(BaseModel):
    id: str 
    name: str
    ingress_mode: IngressMode
    status: WorkspaceStatus
    graph_payload: dict[str, Any] | None 
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
class WorkspaceCreateRequest(BaseModel):
    name: str
    description: str

class WorkspaceUpdateRequest(BaseModel):
    name: str | None = None 
