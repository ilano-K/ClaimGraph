from fastapi import APIRouter
from pydantic import BaseModel
from app.llm.agent.graph import graph
from langchain_core.messages import HumanMessage
router = APIRouter(prefix='/chat')

class ChatRequest(BaseModel):
    message: str 
    
@router.post('/')
def chat(request: ChatRequest):
    return graph.invoke({
        "message": [
            HumanMessage(content=request.message)
        ],
        "intent": None
    })