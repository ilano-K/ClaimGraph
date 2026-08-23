from langchain_core.tools import tool
from sqlalchemy import text
from app.services import agent_service
from app.core import exceptions
from sqlalchemy.orm import Session 
from app.llm.agent.schemas import EditNodeSchema, AddEdgeSchema, AddNodeSchema
from typing import Optional
import re
import logging 
import json 

import threading

logger = logging.getLogger(__name__)

def build_workspace_tools(db: Session, workspace_id: str, document_id: str) -> list:
    # -- TOOL 1: Raw Text Search --
    
    db_lock = threading.Lock()
    @tool 
    def search_documents(query: str) -> str:
        """
        Search the current research document using SQLite FTS5 full-text search.

        This is a KEYWORD-BASED search, not a semantic/vector search.
        The query is passed to SQLite FTS5 MATCH and should contain 1–2
        specific keywords ONLY.
        
        Use this tool whenever the information currently available is insufficient
        to answer the user's question, when additional information from the document
        is needed, or when you need to verify a claim against the document.
        """
        
        logger.info("search_documents tool called query=%s", query)
        #1. sanitize query to prevent SQlite syntax errors
        stripped_query = query.replace('"', '').strip()
        safe_query = re.sub(r'[^a-zA-Z0-9\s]', ' ', query)
        safe_query = ' '.join(safe_query.split())
  
        #2. FTS5 MATCH query scoped to the document
        sql = text("""
            SELECT document_id, content
            FROM documents_fts 
            WHERE workspace_id = :ws_id
              AND document_id = :doc_id
              AND documents_fts MATCH :query
            ORDER BY rank 
            LIMIT 5
        """)
        
        #3. Execute search
        results = db.execute(sql, {
            "ws_id": workspace_id,
            "doc_id": document_id,
            "query": safe_query
        }).fetchall()
        
        #4. handle empty results
        if not results:
            return f"No exact matches found for '{query}'. Try using a different keyword."
        #5. format the results
        formatted_output = ""
        for row in results:
            formatted_output += f"[Document ID: {row.document_id}]\n{row.content}\n\n---\n"
            
        return formatted_output
    
    # -- TOOL 2: get the llm generated graph --
    @tool
    def get_graph_elements() -> str:
        """ 
        Queries the llm generated structured argumentation graph nodes extracted from the paper.
        Use this to understand the main claims, methodology, evidence, limitations, 
        risks, and consequences of the document.
        """
        
        logger.info("get_graph_elements tool called")
        
        try:
            _, graph = agent_service.get_workspace_graph_for_agent(db, workspace_id, document_id)
            return json.dumps(graph, indent=2)
        except exceptions.AppException as e:
            return f"Error: {e.detail}"
        
    # -- TOOL 3: Edit the llm generated graph
    @tool(args_schema=EditNodeSchema)
    def edit_graph_node(node_id: str, new_category: Optional[str] = None, new_quote: Optional[str] = None) -> str:
        """
        Edits an existing node in the graph. 
        Only use this when the user explicitly requests to change a node's category or quote.
        """
        logger.info("edit graph node tool called")
        
        with db_lock:
            return agent_service.edit_graph_node_for_agent(
                db, workspace_id, document_id, 
                node_id, new_category, new_quote
            )
    
    @tool(args_schema=AddEdgeSchema)
    def add_graph_edge(source_node_id: str, target_node_id: str, relation:str , reasoning: str):
        """
        Adds a new edge that connects two exisiting nodes. 
        Only use this when the user explicitly requests or when a new node has been created.
        """
        
        logger.info("add graph edge tool called")
        with db_lock:    
            return agent_service.add_graph_edge_for_agent(
                db, workspace_id, document_id, 
                source_node_id, target_node_id, 
                relation, reasoning
            )
    
    @tool(args_schema=AddNodeSchema)
    def add_graph_node(node_category: str, title: str, summary: str, quote: str, confidence_score: float):
        """
        Adds a new node in the graph. 
        Only use this when the user explicitly requests to create a new node.
        """
        
        logger.info("add graph node tool called")
        with db_lock:
            return agent_service.add_graph_node_for_agent(
                db, workspace_id, document_id,
                node_category, title, summary, 
                quote, confidence_score,
            )
    return [search_documents, get_graph_elements, edit_graph_node, add_graph_edge, add_graph_node]
    
    