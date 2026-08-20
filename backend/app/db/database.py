"""SQLite wiring: engine, session factory, and declarative base.

Persists app data to the local ``app.db`` file defined in
:mod:`app.core.config`. ``check_same_thread=False`` is required because
FastAPI may serve SQLite sessions from different threads.
"""
from app.core.config import DATABASE_PATH
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Database file
SQLALCHEMY_DATABASE_URL = f"sqlite:///{str(DATABASE_PATH)}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass

def get_db():
    """FastAPI dependency that yields a database session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_document_graph_payload_column() -> None:
    """Add the ``documents.graph_payload`` JSON column to existing databases.

    ``Base.metadata.create_all`` only creates missing tables — it never alters
    existing ones — so databases created before the per-document analysis model
    need an additive ``ALTER TABLE`` on startup.
    """
    with engine.connect() as conn:
        columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(documents)").fetchall()
        }
        if "graph_payload" not in columns:
            conn.exec_driver_sql(
                "ALTER TABLE documents ADD COLUMN graph_payload JSON"
            )
            conn.commit()