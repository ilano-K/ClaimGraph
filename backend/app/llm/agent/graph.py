from langgraph.graph import StateGraph, START, END 
from langgraph.prebuilt import ToolNode
from app.llm.agent.state import State 
from app.llm.agent.classifier import classify
from app.llm.agent.nodes import build_lookup_branch
from app.llm.agent.tools import build_search_documents_tool
from app.llm.agent.routes import route_intent, route_after_lookup
from sqlalchemy.orm import Session

def build_agent_graph(db: Session, workspace_id: str, document_id: str):
    """Builds and compiles the agent graph scoped to one workspace document."""
    # 1. inject the workspace + document ids into the search tool
    search_tool = build_search_documents_tool(db, workspace_id, document_id)
    
    # 2. package the tool
    unified_tool_node = ToolNode([search_tool])
    
    # 3. build the lookup branch
    lookup_branch = build_lookup_branch([search_tool])
    
    # 4. build the graph
    builder = StateGraph(State)

    # add the nodes
    builder.add_node("classify", classify)
    builder.add_node("tools", unified_tool_node)
    builder.add_node("lookup_branch", lookup_branch)
    
    # add the edges 
    # START -> classify node
    builder.add_edge(START, "classify")

    # classify node -> route based on intent
    builder.add_conditional_edges(
        "classify",
        route_intent,
        {
            "lookup": "lookup_branch",
            "other": END
        },
    )
    
    builder.add_conditional_edges(
        "lookup_branch",
        route_after_lookup,
        {
            "tools": "tools",
            END: END 
        }
    )
    
    builder.add_edge("tools", "lookup_branch")
    return builder.compile()