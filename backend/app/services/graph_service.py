"""Core graph extraction pipeline.

Asks the LLM for a structured graph from one or more parsed source documents,
then fails loudly if any input document is missing from the response (so the
result can always be quote-validated downstream).
"""
from app.llm.structured import chat_structured
from app.llm.client_factory import COMPILE_MODEL
from app.schemas.graph import GraphPayload
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.core.exceptions import InvalidLLMResponseError
from app.services.text_cleanup import normalize_graph_payload
from app.enums.node import EdgeRelation, NodeCategory
import json
import logging
import time

logger = logging.getLogger(__name__)


def compute_evidence_flags(payload: GraphPayload) -> GraphPayload:
    """Mark each claim by whether an evidence node links to it.

    A claim ``has_evidence`` when it is the target of a ``SUPPORTS`` or
    ``CHALLENGES`` edge whose source is an ``evidence`` node. Non-claim nodes
    keep their default (True). Runs after extraction so the flag is derived
    deterministically from the graph instead of being left to the LLM.
    """
    evidence_node_ids = {
        node.id
        for node in payload.nodes
        if node.node_category == NodeCategory.EVIDENCE
    }
    evidenced_claim_ids = {
        edge.target
        for edge in payload.edges
        if edge.relation in (EdgeRelation.SUPPORTS, EdgeRelation.CHALLENGES)
        and edge.source in evidence_node_ids
    }
    for node in payload.nodes:
        if node.node_category == NodeCategory.CLAIM:
            node.has_evidence = node.id in evidenced_claim_ids
    return payload


def generate_claim_graph(documents) -> GraphPayload:
    """Request a structured graph from the LLM for the parsed ``documents``.

    ``documents`` is a list of ``{"document_id", "content"}`` dicts serialized
    as JSON in the user message. LLMs are unreliable at reproducing long random
    ids exactly, so each document is presented to the model under a short label
    (``d1``, ``d2``, ...) and the labels are mapped back to the real
    ``document_id`` values after the call. Every input ``document_id`` must
    then appear among the returned nodes' ``document_id`` fields; otherwise the
    response cannot be quote-validated and ``InvalidLLMResponseError`` is raised.
    """
    start = time.perf_counter()
    logger.info(
        "generate_claim_graph entry model=%s documents=%d",
        COMPILE_MODEL,
        len(documents),
    )

    real_to_label = {
        document["document_id"]: f"d{index + 1}"
        for index, document in enumerate(documents)
    }
    label_to_real = {label: real for real, label in real_to_label.items()}

    labeled_documents = [
        {
            "document_id": real_to_label[document["document_id"]],
            "content": document["content"],
        }
        for document in documents
    ]

    result = chat_structured(
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": json.dumps(labeled_documents, ensure_ascii=False),
            }
        ],
        response_model=GraphPayload,
        extra_body={"thinking": {"type": "disabled"}},
    )

    # Translate the short labels back to the pipeline-assigned UUIDs so the
    # payload (and any downstream document_id join) uses real ids.
    for node in result.nodes:
        if node.document_id in label_to_real:
            node.document_id = label_to_real[node.document_id]
    for document in result.documents:
        if document.metadata.id in label_to_real:
            document.metadata.id = label_to_real[document.metadata.id]

    # The LLM sometimes HTML-escapes characters in the prose it authors
    # (e.g. `Gabriela&#39;s`); decode them so stored payloads are plain text.
    # Verbatim node quotes are intentionally left untouched.
    normalize_graph_payload(result)

    compute_evidence_flags(result)

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