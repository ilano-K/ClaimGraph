from pydantic import BaseModel, Field
from app.llm.agent.state import Intent
from typing import Literal, Optional

ValidNodeCategory = Literal[
    "claim",
    "evidence",
    "methodology",
    "limitation",
    "risk",
    "consequence"
]

ValidEdgeRelation = Literal[
    "supports",
    "limits",
    "causes",
    "challenges"
]

class Classification(BaseModel):
    intent: Intent
    
    
class EditNodeSchema(BaseModel):
    node_id: str = Field(description="The exact ID of the node to edit in the database")
    new_category: Optional[ValidNodeCategory] = Field(None, description="The new category for the node, if changing it.")
    new_quote: Optional[str] = Field(
        None, description="The updated verbatim quote. MUST be an exact substring from the text."
    )
    
class AddEdgeSchema(BaseModel):
    source_node_id: str = Field(description="The ID of the origin node.")
    target_node_id: str = Field(description="The ID of the destination node.")
    relation: ValidEdgeRelation = Field(description="The strict relationship type.")
    reasoning: str = Field(description="One sentence explanation of why these nodes are linked.")
    
class AddNodeSchema(BaseModel):
    node_category: ValidNodeCategory = Field(description="The new category for the node, if changing it.")
    title: str = Field(description="A concise 3-to-7 word title for the card reader")
    summary: str = Field(description="A 1-to-2 sentence plain-English explaination of the point")
    quote: str = Field(description="The verbatim paragraph excerpt from the document backing this claim.")
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Model extraction confidence score between 0.0 and 1.0."
    )