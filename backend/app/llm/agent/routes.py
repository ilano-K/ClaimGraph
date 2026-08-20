from langgraph.graph import END 
from app.llm.agent.state import State

def route_intent(state: State):
    if state['intent'] == 'lookup':
        return "lookup"
    return "other"

def route_after_lookup(state: State):
    last_message = state['messages'][-1]
    
    if last_message.tool_calls:
        return 'tools'
    return END 


    