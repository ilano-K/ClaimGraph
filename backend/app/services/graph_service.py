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
from app.services.graph_repair import repair_graph
from app.services.text_cleanup import normalize_graph_payload
from app.enums.node import EdgeRelation, NodeCategory
import logging
import time

logger = logging.getLogger(__name__)


def format_documents(documents) -> str:
    """Render labeled documents as delimited plain-Markdown blocks.

    The user message used to be ``json.dumps`` of the documents, which showed
    the model JSON-escaped source text (``\\n`` for every line break, ``\\"``
    for every quotation mark) and then asked it for a quote that is an exact
    substring of the *unescaped* original — the escaping had to be mentally
    undone on every copy. Plain text inside an XML-style wrapper removes that
    step, and keeps the document boundary and its id unambiguous.
    """
    return "\n\n".join(
        f'<document id="{document["document_id"]}">\n'
        f'{document["content"]}\n'
        f'</document>'
        for document in documents
    )


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
                "content": format_documents(labeled_documents),
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

    # Enforce the prompt's structural invariants in code: the model emits
    # edges outside the allowed category table, duplicates, and unconnected
    # nodes often enough that the UI cannot be left to render them.
    repair_graph(result)

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