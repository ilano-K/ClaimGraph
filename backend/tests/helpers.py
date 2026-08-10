from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.graph import DocumentAnalysis, DocumentMetadata, GraphPayload
from app.schemas.node import GraphEdge, GraphNode

CLAIM_QUOTE = "Hypergraph attention reduces computational requirements."
EVIDENCE_QUOTE = "Sparse quantization preserves latency on consumer hardware."
TRADEOFF_QUOTE = "Mixed precision training is a tradeoff of speed and accuracy."
NON_VERBATIM_QUOTE = "This sentence does not appear anywhere in the fake paper."

SECOND_DOC_CLAIM_QUOTE = "Approximate attention accelerates long-context inference."
SECOND_DOC_TRADEOFF_QUOTE = "Drastic compression remains brittle against noisy inputs."

SUMMARY = "A fake paper shows hypergraph attention reduces costs, backed by quantization evidence, yet tradeoffs remain."
SECOND_SUMMARY = "A second fake paper accelerates inference with approximate attention, yet compression remains brittle."


def _node(node_id, quote, category, document_id="0"):
    return GraphNode(
        id=node_id,
        document_id=document_id,
        node_category=category,
        title="Fake-node title",
        summary="A fake single-sentence point.",
        quote=quote,
    )


def _document(metadata_id, title, executive_summary):
    return DocumentAnalysis(
        metadata=DocumentMetadata(id=metadata_id, title=title, author=["Jane Doe"]),
        executive_summary=executive_summary,
    )


def make_fake_payload() -> GraphPayload:
    return GraphPayload(
        documents=[_document("0", "Fake Paper", SUMMARY)],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id="0"),
            _node("evidence-1", EVIDENCE_QUOTE, NodeCategory.EVIDENCE, document_id="0"),
            _node("tradeoff-1", TRADEOFF_QUOTE, NodeCategory.TRADEOFF, document_id="0"),
        ],
        edges=[
            GraphEdge(
                id="e1",
                source="evidence-1",
                target="claim-1",
                relation=EdgeRelation.SUPPORTS,
                reasoning="Evidence backs the claim.",
            ),
            GraphEdge(
                id="e2",
                source="tradeoff-1",
                target="claim-1",
                relation=EdgeRelation.LIMITS,
                reasoning="The tradeoff constrains the claim.",
            ),
        ],
    )


def make_fake_payload_with_invalid_quote() -> GraphPayload:
    return GraphPayload(
        documents=[_document("0", "Fake Paper", SUMMARY)],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id="0"),
            _node("evidence-bad", NON_VERBATIM_QUOTE, NodeCategory.EVIDENCE, document_id="0"),
        ],
        edges=[
            GraphEdge(
                id="e-bad",
                source="evidence-bad",
                target="claim-1",
                relation=EdgeRelation.SUPPORTS,
                reasoning="Would back the claim, but the quote is fabricated.",
            )
        ],
    )


def make_multi_doc_payload() -> GraphPayload:
    return GraphPayload(
        documents=[
            _document("0", "Fake Paper", SUMMARY),
            _document("1", "Fake Paper 2", SECOND_SUMMARY),
        ],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id="0"),
            _node("claim-2", SECOND_DOC_CLAIM_QUOTE, NodeCategory.CLAIM, document_id="1"),
            _node("tradeoff-2", SECOND_DOC_TRADEOFF_QUOTE, NodeCategory.TRADEOFF, document_id="1"),
        ],
        edges=[
            GraphEdge(
                id="e2",
                source="claim-1",
                target="claim-2",
                relation=EdgeRelation.DEPENDS_ON,
                reasoning="The first claim scaffolds the second.",
            ),
            GraphEdge(
                id="e3",
                source="tradeoff-2",
                target="claim-2",
                relation=EdgeRelation.LIMITS,
                reasoning="The tradeoff constrains the second claim.",
            ),
        ],
    )


def make_multi_doc_payload_with_invalid_quote() -> GraphPayload:
    return GraphPayload(
        documents=[
            _document("0", "Fake Paper", SUMMARY),
            _document("1", "Fake Paper 2", SECOND_SUMMARY),
        ],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id="0"),
            _node("claim-2", SECOND_DOC_CLAIM_QUOTE, NodeCategory.CLAIM, document_id="1"),
            _node("evidence-bad", NON_VERBATIM_QUOTE, NodeCategory.EVIDENCE, document_id="1"),
        ],
        edges=[
            GraphEdge(
                id="e2",
                source="claim-1",
                target="claim-2",
                relation=EdgeRelation.DEPENDS_ON,
                reasoning="The first claim scaffolds the second.",
            ),
            GraphEdge(
                id="e-bad",
                source="evidence-bad",
                target="claim-2",
                relation=EdgeRelation.SUPPORTS,
                reasoning="Would back the claim, but the quote is fabricated.",
            ),
        ],
    )


def build_document_analysis(document_id: str, index: int) -> DocumentAnalysis:
    """DocumentAnalysis whose metadata.id matches the real (UUID) document id."""
    return DocumentAnalysis(
        metadata=DocumentMetadata(
            id=document_id,
            title="Fake Paper" if index == 0 else "Fake Paper 2",
            author=["Jane Doe"],
        ),
        executive_summary=SUMMARY if index == 0 else SECOND_SUMMARY,
    )


def build_single_doc_payload(document_id: str, *, invalid: bool = False) -> GraphPayload:
    """Payload keyed to the UUID the pipeline actually assigns, for one document."""
    if invalid:
        return GraphPayload(
            documents=[build_document_analysis(document_id, 0)],
            nodes=[
                _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id=document_id),
                _node("evidence-bad", NON_VERBATIM_QUOTE, NodeCategory.EVIDENCE, document_id=document_id),
            ],
            edges=[
                GraphEdge(
                    id="e-bad",
                    source="evidence-bad",
                    target="claim-1",
                    relation=EdgeRelation.SUPPORTS,
                    reasoning="Would back the claim, but the quote is fabricated.",
                )
            ],
        )

    return GraphPayload(
        documents=[build_document_analysis(document_id, 0)],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id=document_id),
            _node("evidence-1", EVIDENCE_QUOTE, NodeCategory.EVIDENCE, document_id=document_id),
            _node("tradeoff-1", TRADEOFF_QUOTE, NodeCategory.TRADEOFF, document_id=document_id),
        ],
        edges=[
            GraphEdge(
                id="e1",
                source="evidence-1",
                target="claim-1",
                relation=EdgeRelation.SUPPORTS,
                reasoning="Evidence backs the claim.",
            ),
            GraphEdge(
                id="e2",
                source="tradeoff-1",
                target="claim-1",
                relation=EdgeRelation.LIMITS,
                reasoning="The tradeoff constrains the claim.",
            ),
        ],
    )


def build_multi_doc_payload(document_ids: list[str], *, invalid: bool = False) -> GraphPayload:
    """Payload keyed to the real UUID document ids, for two documents."""
    doc_0, doc_1 = document_ids
    if invalid:
        return GraphPayload(
            documents=[
                build_document_analysis(doc_0, 0),
                build_document_analysis(doc_1, 1),
            ],
            nodes=[
                _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id=doc_0),
                _node("claim-2", SECOND_DOC_CLAIM_QUOTE, NodeCategory.CLAIM, document_id=doc_1),
                _node("evidence-bad", NON_VERBATIM_QUOTE, NodeCategory.EVIDENCE, document_id=doc_1),
            ],
            edges=[
                GraphEdge(
                    id="e2",
                    source="claim-1",
                    target="claim-2",
                    relation=EdgeRelation.DEPENDS_ON,
                    reasoning="The first claim scaffolds the second.",
                ),
                GraphEdge(
                    id="e-bad",
                    source="evidence-bad",
                    target="claim-2",
                    relation=EdgeRelation.SUPPORTS,
                    reasoning="Would back the claim, but the quote is fabricated.",
                ),
            ],
        )

    return GraphPayload(
        documents=[
            build_document_analysis(doc_0, 0),
            build_document_analysis(doc_1, 1),
        ],
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM, document_id=doc_0),
            _node("claim-2", SECOND_DOC_CLAIM_QUOTE, NodeCategory.CLAIM, document_id=doc_1),
            _node("tradeoff-2", SECOND_DOC_TRADEOFF_QUOTE, NodeCategory.TRADEOFF, document_id=doc_1),
        ],
        edges=[
            GraphEdge(
                id="e2",
                source="claim-1",
                target="claim-2",
                relation=EdgeRelation.DEPENDS_ON,
                reasoning="The first claim scaffolds the second.",
            ),
            GraphEdge(
                id="e3",
                source="tradeoff-2",
                target="claim-2",
                relation=EdgeRelation.LIMITS,
                reasoning="The tradeoff constrains the second claim.",
            ),
        ],
    )