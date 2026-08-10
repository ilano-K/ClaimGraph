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