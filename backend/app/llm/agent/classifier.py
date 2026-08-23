from langchain_core.messages import SystemMessage
from app.llm.agent.client import get_llm
from app.llm.agent.retry import call_with_retry
from app.llm.agent.schemas import Classification
from app.llm.agent.state import State
import logging 
import time 

logger = logging.getLogger(__name__)

classifier = get_llm().with_structured_output(
    Classification,
    # ``method="json_schema"`` (the langchain-openai default) sends a
    # ``response_format`` the provider rejects with 400 "This response_format
    # type is unavailable now". Tool calling is what the lookup branch already
    # sends successfully (``bind_tools``), so it is the compatible path here.
    method="function_calling",
)


SYSTEM_PROMPT = """
You are an intent classifier for a research-paper information system.

The system is designed to answer questions and requests related to
research papers, academic studies, and their contents.

Your ONLY task is to classify the user's latest message into exactly ONE
of these intents:

1. lookup
Classify as "lookup" when the user's request is related to research
papers, academic studies, or academic information that may require
retrieving relevant information from the system's available sources.

The user does NOT need to explicitly mention a paper or provide a
document.

This includes:
- Asking about a specific research paper or study.
- Asking about findings, methodology, results, claims, or conclusions.
- Asking for information that could be found in a research paper.
- Asking to explain or summarize research.
- Asking to compare studies or research findings.
- Asking whether research supports a particular claim.
- Asking for research related to a topic.
- Follow-up questions referring to previously discussed research.

2. other
Classify as "other" when the message is unrelated to research papers,
academic studies, or academic information.
"""

def classify(state: State):
    start = time.perf_counter()
    
    result = call_with_retry(lambda: classifier.invoke([
        SystemMessage(
            content=SYSTEM_PROMPT
        ),
        state["messages"][-1],
    ]))
    
    elapsed = time.perf_counter() - start
    logger.info(
        "CLASSIFY done intent=%s elapsed=%.2fs",
        result.intent,
        elapsed,
    )
    
    return  {
        "intent": result.intent,
    }
