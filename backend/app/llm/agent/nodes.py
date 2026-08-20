from langchain_core.messages import AIMessage
from app.llm.agent.state import State 

def lookup_branch(state: State):
    return {
        "message": [
            AIMessage(content="Here is the information I found.")
        ]
    }