from langgraph.graph import StateGraph, START, END 
from langgraph.prebuilt import ToolNode
from app.llm.agent.state import State 
from app.llm.agent.classifier import classify
from app.llm.agent.nodes import build_research_agent, general_chat_node
from app.llm.agent.tools import build_workspace_tools
from app.llm.agent.routes import route_intent, route_after_lookup
from sqlalchemy.orm import Session
import logging

logging = logging.getLogger(__name__)

def build_agent_graph(db: Session, workspace_id: str, document_id: str):
    """Builds and compiles the agent graph scoped to one workspace document."""
    # 1. inject the workspace + document ids into the search tool
    search_tools = build_workspace_tools(db, workspace_id, document_id)
    
    # 2. package the tool
    unified_tool_node = ToolNode(search_tools)
    
    # 3. build the lookup branch
    research_node = build_research_agent(search_tools)
    
    # 4. build the graph
    builder = StateGraph(State)

    # add the nodes
    builder.add_node("classify", classify)
    builder.add_node("tools", unified_tool_node)
    builder.add_node("research_node", research_node)
    builder.add_node("general_chat", general_chat_node)
    
    # add the edges 
    # START -> classify node
    builder.add_edge(START, "classify")

    # classify node -> route based on intent
    builder.add_conditional_edges(
        "classify",
        route_intent,
        {
            "lookup": "research_node",
            "other": "general_chat"
        },
    )
    
    builder.add_conditional_edges(
        "research_node",
        route_after_lookup,
        {
            "tools": "tools",
            END: END 
        }
    )
    
    builder.add_edge("tools", "research_node")
    return builder.compile()