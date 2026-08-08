from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.graph import DocumentMetadata, GraphPayload
from app.schemas.node import GraphEdge, GraphNode

CLAIM_QUOTE = "Hypergraph attention reduces computational requirements."
EVIDENCE_QUOTE = "Sparse quantization preserves latency on consumer hardware."
TRADEOFF_QUOTE = "Mixed precision training is a tradeoff of speed and accuracy."
NON_VERBATIM_QUOTE = "This sentence does not appear anywhere in the fake paper."

SUMMARY = "A fake paper shows hypergraph attention reduces costs, backed by quantization evidence, yet tradeoffs remain."


def _node(node_id, quote, category):
    return GraphNode(
        id=node_id,
        node_category=category,
        title="Fake-node title",
        summary="A fake single-sentence point.",
        quote=quote,
    )


def make_fake_payload() -> GraphPayload:
    return GraphPayload(
        metadata=DocumentMetadata(title="Fake Paper", author=["Jane Doe"]),
        executive_summary=SUMMARY,
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM),
            _node("evidence-1", EVIDENCE_QUOTE, NodeCategory.EVIDENCE),
            _node("tradeoff-1", TRADEOFF_QUOTE, NodeCategory.TRADEOFF),
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


def make_payload_with_invalid_quote() -> GraphPayload:
    return GraphPayload(
        metadata=DocumentMetadata(title="Fake Paper", author=["Jane Doe"]),
        executive_summary=SUMMARY,
        nodes=[
            _node("claim-1", CLAIM_QUOTE, NodeCategory.CLAIM),
            _node("evidence-bad", NON_VERBATIM_QUOTE, NodeCategory.EVIDENCE),
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