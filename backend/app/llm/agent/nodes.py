from app.llm.agent.state import State 
from app.llm.agent.client import get_llm
from app.llm.agent.retry import call_with_retry

    
def build_lookup_branch(tools: list):
    """
    Factory function that equips the LLM with tools 
    and returns the executable LangGraph node.
    """
    #1. bind tools to llm
    llm_with_tools = get_llm().bind_tools(tools)
    
    #2. define the node 
    def lookup_node(state: State):
        # pass entire conversation history
        messages = state['messages']
        
        # the AImessage containing either standard text or tool call requests
        response = call_with_retry(lambda: llm_with_tools.invoke(messages))

        # langraph automatically appends the response to the message list
        return {"messages": [response]}
    # 3. Return the function itself so build_agent_graph can attach it to the graph
    return lookup_node