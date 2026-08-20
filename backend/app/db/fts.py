"""FTS5 virtual table creation for full-text search over document content."""
from sqlalchemy.engine import Engine
from sqlalchemy import text

# workspace_id and document_id are UNINDEXED keys for scoping/filtering;
# content is the searchable, tokenized column.
FTS5_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
USING fts5(workspace_id UNINDEXED, document_id UNINDEXED, content)
"""


def ensure_fts5_table(engine: Engine) -> None:
    """Create the documents_fts FTS5 virtual table if it does not exist."""
    with engine.connect() as conn:
        conn.exec_driver_sql(FTS5_DDL)
        



def insert_chunks_to_fts(db, workspace_id: str, document_id: str, chunks: list[str]) -> None:
    # 1. Clear any old chunks for this document (for when users recompile)
    db.execute(
        text("DELETE FROM documents_fts WHERE document_id = :doc_id"),
        {"doc_id": document_id}
    )

    # 2. Prepare the insert statement
    insert_sql = text("""
        INSERT INTO documents_fts (workspace_id, document_id, content) 
        VALUES (:ws_id, :doc_id, :chunk_text)
    """)

    # 3. Insert each chunk
    for chunk in chunks:
        db.execute(insert_sql, {
            "ws_id": workspace_id,
            "doc_id": document_id,
            "chunk_text": chunk
        })


def has_fts_document(db, document_id: str) -> bool:
    """Return True if FTS rows already exist for ``document_id``."""
    row = db.execute(
        text("SELECT COUNT(*) FROM documents_fts WHERE document_id = :doc_id"),
        {"doc_id": document_id},
    ).scalar()
    return (row or 0) > 0