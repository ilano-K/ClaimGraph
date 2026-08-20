from pydantic import BaseModel
from app.llm.agent.state import Intent

class Classification(BaseModel):
    intent: Intent
    