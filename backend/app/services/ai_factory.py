"""Backward-compatible re-export of :func:`app.llm.client_factory.get_client`."""
from app.llm.client_factory import get_client


def create_client():
    """Return the cached Instructor client (see ``app.llm.client_factory``)."""
    return get_client()