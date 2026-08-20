from typing import Annotated, Literal
from typing_extensions import TypedDict
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages 

Intent = Literal["lookup", "other"]

class State(TypedDict):
    # list of messages, processed via the add_messages reducer
    message: Annotated[list[AnyMessage], add_messages]
    intent: Intent | None

