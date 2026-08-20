"""Quote integrity checks and repair.

Enforces the "verbatim quote" contract from the LLM prompt: every node's
``quote`` must appear inside its source document's text.

A failed quote deletes the node *and* every edge touching it, so a quote the
model got almost right is expensive. In practice "almost right" is the common
case: the source markdown comes from a PDF converter and carries hard line
breaks, non-breaking spaces, typographic dashes and quotes, ligatures, and
italic-math unicode, and the model silently tidies them (or HTML-escapes an
apostrophe) while copying. :func:`repair_quotes` matches through those
differences and rewrites the node's quote to the document's own wording, so
only genuinely unsupported quotes are dropped.
"""
from html import unescape

from app.schemas.node import GraphNode

import logging
import unicodedata

logger = logging.getLogger(__name__)

# Characters the converter and the model disagree about, folded to one form on
# both sides before matching.
_DASHES = "‐‑‒–—―−"
_APOSTROPHES = "‘’‚‛′"
_DOUBLE_QUOTES = "“”„‟″"
# Invisible characters that survive PDF extraction but are never re-typed.
_INVISIBLE = "​‌‍⁠﻿­"

# A repaired-by-trimming quote must keep at least this much of the original to
# stay meaningful as a citation.
_MIN_TRIMMED_CHARS = 40
_MIN_TRIMMED_RATIO = 0.5


def normalize_for_match(text: str) -> tuple[str, list[int]]:
    """Fold ``text`` to a comparison form, with a map back to its own indices.

    Returns ``(normalized, index_map)`` where ``index_map[i]`` is the index in
    ``text`` of the character that produced ``normalized[i]``. The map is what
    lets a match found in normalized space be recovered as an exact substring
    of the original document.

    Folding: casefold, NFKC (ligatures and italic-math unicode become plain
    letters), typographic dashes and quotes become ASCII, invisible characters
    are dropped, and every run of whitespace collapses to a single space.
    """
    characters: list[str] = []
    index_map: list[int] = []
    previous_was_space = False

    for index, character in enumerate(text):
        if character in _INVISIBLE:
            continue

        if character.isspace():
            if not previous_was_space:
                characters.append(" ")
                index_map.append(index)
                previous_was_space = True
            continue

        previous_was_space = False

        if character in _DASHES:
            replacement = "-"
        elif character in _APOSTROPHES:
            replacement = "'"
        elif character in _DOUBLE_QUOTES:
            replacement = '"'
        else:
            replacement = unicodedata.normalize("NFKC", character).casefold()

        for produced in replacement:
            characters.append(produced)
            index_map.append(index)

    return "".join(characters), index_map


def _unescape_entities(text: str) -> str:
    """Decode HTML entities, twice at most, for models that double-escape.

    ``&amp;#39;`` needs two passes to become an apostrophe. Over-decoding is
    safe here because the decoded text is only ever used to *locate* a span —
    the quote itself is then rewritten from the document's own characters.
    """
    for _ in range(2):
        decoded = unescape(text)
        if decoded == text:
            break
        text = decoded
    return text


def _original_span(document: str, index_map: list[int], start: int, end: int) -> str:
    """The exact ``document`` substring behind a normalized match ``[start, end)``."""
    original_start = index_map[start]
    original_end = index_map[end - 1] + 1
    return document[original_start:original_end].strip()


def _longest_matching_prefix(normalized_document: str, normalized_quote: str) -> int:
    """Length of the longest prefix of ``normalized_quote`` inside the document.

    Substring containment is monotonic in prefix length — if a prefix is
    missing, every longer one is too — so the boundary is found by binary
    search instead of scanning every length.
    """
    low, high = 0, len(normalized_quote)
    while low < high:
        middle = (low + high + 1) // 2
        if normalized_quote[:middle] in normalized_document:
            low = middle
        else:
            high = middle - 1
    return low


def _trim_to_word_boundary(normalized_quote: str, length: int) -> int:
    """Pull ``length`` back to the last word boundary so quotes never cut a word."""
    if length >= len(normalized_quote) or normalized_quote[length].isspace():
        return length
    boundary = normalized_quote.rfind(" ", 0, length)
    return boundary if boundary > 0 else length


def _repair_quote(
    document: str,
    normalized_document: str,
    document_index_map: list[int],
    quote: str,
) -> str | None:
    """Return the document's own wording for ``quote``, or ``None`` if unsupported.

    Tries, in order: the quote as written, the quote folded through
    :func:`normalize_for_match`, and finally the longest leading fragment of it
    that the document does contain.
    """
    if quote.casefold() in document.casefold():
        return quote

    normalized_quote, _ = normalize_for_match(_unescape_entities(quote))
    normalized_quote = normalized_quote.strip()
    if not normalized_quote:
        return None

    position = normalized_document.find(normalized_quote)
    if position != -1:
        return _original_span(
            document,
            document_index_map,
            position,
            position + len(normalized_quote),
        )

    # The model added, dropped, or reworded something in the tail. Keep the
    # longest leading fragment the document actually supports.
    matched_length = _trim_to_word_boundary(
        normalized_quote,
        _longest_matching_prefix(normalized_document, normalized_quote),
    )
    keeps_enough = matched_length >= _MIN_TRIMMED_CHARS and (
        matched_length >= _MIN_TRIMMED_RATIO * len(normalized_quote)
    )
    if not keeps_enough:
        return None

    fragment = normalized_quote[:matched_length].rstrip()
    position = normalized_document.find(fragment)
    if position == -1:
        return None
    return _original_span(
        document,
        document_index_map,
        position,
        position + len(fragment),
    )


def repair_quotes(document: str, nodes: list[GraphNode]) -> list[GraphNode]:
    """Rewrite recoverable quotes in place; return the nodes still unsupported.

    A node whose quote differs from the source only in whitespace, unicode
    form, punctuation style, or HTML escaping is rewritten to the document's
    exact wording. A node whose quote merely overruns its support is shortened
    to the part the document backs. Anything else is returned to the caller for
    removal, exactly as before.
    """
    normalized_document, document_index_map = normalize_for_match(document)

    invalid_nodes: list[GraphNode] = []
    for node in nodes:
        repaired = _repair_quote(
            document, normalized_document, document_index_map, node.quote
        )

        # Defensive: only accept a repair that genuinely satisfies the contract.
        if repaired is None or repaired.casefold() not in document.casefold():
            invalid_nodes.append(node)
            continue

        if repaired != node.quote:
            logger.info(
                "repair_quotes repaired node=%s from=%d to=%d chars",
                node.id,
                len(node.quote),
                len(repaired),
            )
            node.quote = repaired

    return invalid_nodes


def find_nodes_with_invalid_quotes(document: str, nodes: list[GraphNode]):
    """Return the ``nodes`` whose ``quote`` is not found verbatim in ``document``.

    Matching is case-insensitive and strict — no repair. Kept as the plain
    contract check; the compile pipeline uses :func:`repair_quotes` instead.
    """
    normalized_document = document.casefold()

    invalid_nodes = []
    for node in nodes:
        if not node.quote.casefold() in normalized_document:
            invalid_nodes.append(node)
    return invalid_nodes
