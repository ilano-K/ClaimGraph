"""FTS5 virtual table creation for full-text search over document content."""
from sqlalchemy.engine import Engine

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