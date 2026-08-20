from langgraph.graph import StateGraph, START, END 
from app.llm.agent.state import State 
from app.llm.agent.classifier import classify
from app.llm.agent.nodes import lookup_branch

def route_intent(state: State):
    if state["intent"] == 'lookup':
        return 'lookup'
    return "other"

# Builds the nodes and edges by using the graph  
builder = StateGraph(State)

# Nodes
builder.add_node("classify", classify)
builder.add_node("lookup_branch", lookup_branch)

# Connection of nodes
builder.add_edge(START, "classify")
builder.add_conditional_edges(
    "classify",
    route_intent,
    {
      "lookup": "lookup_branch",
      "other": END,  
    },
)

builder.add_edge("lookup_branch", END)

graph = builder.compile()