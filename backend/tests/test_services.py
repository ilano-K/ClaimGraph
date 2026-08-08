import pytest

from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.node import GraphEdge, GraphNode
from app.services.extractor import to_react_flow_edges, to_react_flow_nodes
from app.services.verify_quotes import find_nodes_with_invalid_quotes


def _node(quote):
    return GraphNode(
        id="n1",
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


def test_to_react_flow_nodes_defaults():
    node = _node("some verbatim quote")
    out = to_react_flow_nodes([node])
    assert out[0].id == "n1"
    assert out[0].type == "customCard"
    assert out[0].position == {"x": 0.0, "y": 0.0}
    assert out[0].data.node_category == NodeCategory.CLAIM


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