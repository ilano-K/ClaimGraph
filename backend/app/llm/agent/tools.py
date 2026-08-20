from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode
from sqlalchemy import text
@tool 
def search_document(query: str) -> str:
    """Simulate searching a document and return a canned result string."""
    return f"simulated results for {query}"

shared_tools = [search_document]
tool_node = ToolNode(shared_tools)


def build_search_documents_tool(db, workspace_id: str, document_id: str):
    
    @tool 
    def search_documents(query: str) -> str:
        """
        Searches the current document for relevant information.

        Use this when the answer may be found in the user's uploaded documents.
        query: 1–2 specific keywords only.
        For research papers, use section names, key concepts, names, or terminology.
        Avoid vague queries like "information" or "research paper".
        """
        #1. sanitize query to prevent SQlite syntax errors
        stripped_query = query.replace('"', '')
        safe_query = f'"{stripped_query}"'
        
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
    return search_documents
    
    