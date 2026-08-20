from app.schemas.workspace import WorkspaceChatRequest, WorkspaceChatResponse
from sqlalchemy.orm import Session
from app.llm.agent.graph import build_agent_graph
from langchain_core.messages import HumanMessage

def process_chat_with_document(workspace_id: str, document_id: str, payload: WorkspaceChatRequest, db: Session):
    try:
        # 1. build the graph scoped to the document
        agent = build_agent_graph(db, workspace_id, document_id)

        # 2. Prepare user message
        initial_state = {
            "messages": [HumanMessage(content=payload.message)]
        }

        # 3. Get AI response
        final_state = agent.invoke(initial_state)
        ai_response = final_state['messages'][-1].content

        result = {"reply": ai_response}
    except Exception:
        raise

    return result