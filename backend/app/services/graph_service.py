"""Core graph extraction pipeline.

Asks the LLM for a structured graph from one or more parsed source documents,
then fails loudly if any input document is missing from the response (so the
result can always be quote-validated downstream).
"""
from app.llm.structured import chat_structured
from app.core.settings import settings
from app.schemas.graph import GraphPayload
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.core.exceptions import InvalidLLMResponseError
from app.services.text_cleanup import normalize_graph_payload
import json
import logging
import time

logger = logging.getLogger(__name__)


def generate_claim_graph(documents) -> GraphPayload:
    """Request a structured graph from the LLM for the parsed ``documents``.

    ``documents`` is a list of ``{"document_id", "content"}`` dicts serialized
    as JSON in the user message. After the call, every input ``document_id``
    must appear among the returned nodes' ``document_id`` fields; otherwise the
    response cannot be quote-validated and ``InvalidLLMResponseError`` is raised.
    """
    start = time.perf_counter()
    logger.info(
        "generate_claim_graph entry model=%s documents=%d",
        settings.llm_model_name,
        len(documents),
    )

    result = chat_structured(
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": json.dumps(documents, ensure_ascii=False),
            }
        ],
        response_model=GraphPayload,
        extra_body={"thinking": {"type": "disabled"}},
    )

    # The LLM sometimes HTML-escapes characters in the prose it authors
    # (e.g. `Gabriela&#39;s`); decode them so stored payloads are plain text.
    # Verbatim node quotes are intentionally left untouched.
    normalize_graph_payload(result)

    input_document_ids = {
        document["document_id"]
        for document in documents
    }

    returned_document_ids = {
        node.document_id
        for node in result.nodes
    }

    # Any input document with no node attributed to it means the LLM dropped
    # or renamed an id; fail loudly rather than silently skipping validation.
    invalid_document_ids = (input_document_ids - returned_document_ids)

    if invalid_document_ids:
        logger.error(
            "generate_claim_graph invalid LLM response: "
            "missing document_ids=%s",
            sorted(invalid_document_ids),
        )
        logger.error(
            "generate_claim_graph input_document_ids=%s",
            sorted(input_document_ids),
        )
        logger.error(
            "generate_claim_graph returned_document_ids=%s",
            sorted(returned_document_ids),
        )
        logger.error(
            "generate_claim_graph returned_nodes=%s",
            [
                {
                    "id": node.id,
                    "document_id": node.document_id,
                    "node_category": node.node_category.value,
                    "title": node.title,
                }
                for node in result.nodes
            ],
        )
        raise InvalidLLMResponseError()

    logger.info(
        "generate_claim_graph success in %dms nodes=%d edges=%d",
        round((time.perf_counter() - start) * 1000),
        len(result.nodes),
        len(result.edges),
    )
    return result