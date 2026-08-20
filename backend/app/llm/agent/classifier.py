from langchain_core.messages import SystemMessage
from app.llm.agent.client import get_llm
from app.llm.agent.schemas import Classification
from app.llm.agent.state import State

classifier = get_llm().with_structured_output(Classification)

def classify(state: State):
    result = classifier.invoke([
        SystemMessage(
            content="""
            Classif the user's intent.
            
            lookup:
            The user wants to retrieve or ask for specific information
            
            Other:
            Anything else.
            """
        ),
        state["message"][-1],
    ])
    
    return  {
        "intent": result.intent,
    }
