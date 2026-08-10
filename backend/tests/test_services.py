import json

import pytest

from app.core.exceptions import InvalidLLMResponseError
from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.node import GraphEdge, GraphNode
from app.services import extractor
from app.services.extractor import generate_claim_graph, to_react_flow_edges, to_react_flow_nodes
from app.services.verify_quotes import find_nodes_with_invalid_quotes

from tests.helpers import make_multi_doc_payload


class _FakeCompletions:
    def __init__(self, payload):
        self.payload = payload
        self.last_kwargs = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return self.payload


class _FakeChat:
    def __init__(self, payload):
        self.completions = _FakeCompletions(payload)


class _FakeClient:
    def __init__(self, payload):
        self.chat = _FakeChat(payload)


def _stub_client(monkeypatch, payload):
    client = _FakeClient(payload)
    monkeypatch.setattr(extractor, "create_client", lambda: client)
    return client


def _node(quote, document_id="0"):
    return GraphNode(
        id="n1",
        document_id=document_id,
        node_category=NodeCategory.CLAIM,
        title="Some title",
        summary="Some summary.",
        quote=quote,
    )


def test_find_nodes_with_invalid_quotes_flags_nonverbatim_quotes():
    doc = "The quick brown fox jumps over the lazy dog."
    nodes = [_node("brown fox"), _node("this phrase is fabricated")]
    invalid = find_nodes_with_invalid_quotes(doc, nodes)
    assert len(invalid) == 1
    assert invalid[0].quote == "this phrase is fabricated"


def test_find_nodes_with_invalid_quotes_is_case_insensitive():
    doc = "Hypergraph ATTENTION reduces memory cost."
    nodes = [_node("hypergraph attention")]
    assert find_nodes_with_invalid_quotes(doc, nodes) == []


def test_quotes_are_validated_against_their_own_document():
    doc_a = "Hypergraph attention reduces computational requirements."
    doc_b = "Approximate attention accelerates long-context inference."
    nodes = [
        _node(doc_a, document_id="0"),
        _node(doc_b, document_id="1"),
    ]
    out_of_order = [
        _node(doc_a, document_id="1"),
        _node(doc_b, document_id="0"),
    ]

    assert find_nodes_with_invalid_quotes(doc_a, [n for n in nodes if n.document_id == "0"]) == []
    assert find_nodes_with_invalid_quotes(doc_b, [n for n in nodes if n.document_id == "1"]) == []
    assert len(find_nodes_with_invalid_quotes(doc_a, [n for n in out_of_order if n.document_id == "0"])) == 1


def test_to_react_flow_nodes_defaults():
    node = _node("some verbatim quote")
    out = to_react_flow_nodes([node])
    assert out[0].id == "n1"
    assert out[0].type == "customCard"
    assert out[0].position == {"x": 0.0, "y": 0.0}
    assert out[0].data.node_category == NodeCategory.CLAIM
    assert out[0].data.document_id == "0"


def test_to_react_flow_edges_styles_and_animation():
    def edge(relation):
        return GraphEdge(id="e", source="a", target="b", relation=relation, reasoning="r")

    supports = to_react_flow_edges([edge(EdgeRelation.SUPPORTS)])[0]
    limits = to_react_flow_edges([edge(EdgeRelation.LIMITS)])[0]
    depends = to_react_flow_edges([edge(EdgeRelation.DEPENDS_ON)])[0]

    assert supports.style.stroke == "#16A34A"
    assert supports.animated is False
    assert limits.style.stroke == "#DC2626"
    assert limits.animated is True
    assert depends.style.stroke == "#2563EB"
    assert depends.animated is False


def test_generate_claim_graph_serializes_documents_as_json(monkeypatch):
    documents = [
        {"document_id": "0", "content": "first doc body"},
        {"document_id": "1", "content": "second doc body"},
    ]
    client = _stub_client(monkeypatch, make_multi_doc_payload())

    generate_claim_graph(documents)

    content = client.chat.completions.last_kwargs["messages"][1]["content"]
    assert isinstance(content, str)
    payload = json.loads(content)
    assert [d["document_id"] for d in payload] == ["0", "1"]
    assert payload[1]["content"] == "second doc body"


def test_generate_claim_graph_raises_when_document_id_missing_from_nodes(monkeypatch):
    documents = [
        {"document_id": "0", "content": "first doc body"},
        {"document_id": "1", "content": "second doc body"},
        {"document_id": "2", "content": "third doc body"},
    ]
    _stub_client(monkeypatch, make_multi_doc_payload())

    with pytest.raises(InvalidLLMResponseError):
        generate_claim_graph(documents)