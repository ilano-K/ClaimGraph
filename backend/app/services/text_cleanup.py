"""Normalization of LLM-authored text.

The LLM occasionally HTML-escapes characters in the prose it generates (e.g.
``Gabriela&#39;s`` instead of ``Gabriela's``). Verbatim quotes copied straight
from the source documents stay clean, so only the authored fields are decoded
here — at the pipeline boundary — to keep stored payloads plain text.
"""
from html import unescape

from app.schemas.graph import GraphPayload


def normalize_graph_payload(payload: GraphPayload) -> GraphPayload:
    """Decode HTML entities in the LLM-authored fields of ``payload`` in place.

    ``node.quote`` is deliberately left untouched: quote validation compares it
    verbatim against the source markdown, which can legitimately contain text
    that looks like an entity (e.g. ``&amp;``) and must not be altered.
    """
    for document in payload.documents:
        document.metadata.title = unescape(document.metadata.title)
        if document.metadata.author:
            document.metadata.author = [unescape(author) for author in document.metadata.author]
        document.executive_summary = unescape(document.executive_summary)

    for node in payload.nodes:
        node.title = unescape(node.title)
        node.summary = unescape(node.summary)

    for edge in payload.edges:
        edge.reasoning = unescape(edge.reasoning)

    return payload