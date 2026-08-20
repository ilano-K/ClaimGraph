from langchain_core.messages import SystemMessage
from app.llm.agent.client import get_llm
from app.llm.agent.retry import call_with_retry
from app.llm.agent.schemas import Classification
from app.llm.agent.state import State

classifier = get_llm().with_structured_output(
    Classification,
    # ``method="json_schema"`` (the langchain-openai default) sends a
    # ``response_format`` the provider rejects with 400 "This response_format
    # type is unavailable now". Tool calling is what the lookup branch already
    # sends successfully (``bind_tools``), so it is the compatible path here.
    method="function_calling",
)

def classify(state: State):
    result = call_with_retry(lambda: classifier.invoke([
        SystemMessage(
            content="""
            Classif the user's intent.
            
            lookup:
            If the user is asking about information
            
            Other:
            Anything else.
            """
        ),
        state["messages"][-1],
    ]))
    
    return  {
        "intent": result.intent,
    }
