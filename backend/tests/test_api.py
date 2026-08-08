from app.services import extractor
from tests.helpers import SUMMARY, make_fake_payload, make_payload_with_invalid_quote


def test_compile_graph_happy_path(client, fake_pdf, monkeypatch):
    def fake_llm(document):
        return make_fake_payload()

    monkeypatch.setattr(extractor, "generate_claim_graph", fake_llm)

    resp = client.post("/graphs/compile", json={"file_path": str(fake_pdf)})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["summary"] == SUMMARY
    assert body["metadata"]["title"] == "Fake Paper"
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "evidence-1", "tradeoff-1"]
    assert [e["id"] for e in body["graph"]["edges"]] == ["e1", "e2"]
    assert len(body["react_flow_nodes"]) == 3
    assert body["react_flow_nodes"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert len(body["react_flow_edges"]) == 2


def test_compile_graph_filters_invalid_quote_nodes(client, fake_pdf, monkeypatch):
    monkeypatch.setattr(extractor, "generate_claim_graph", lambda doc: make_payload_with_invalid_quote())

    resp = client.post("/graphs/compile", json={"file_path": str(fake_pdf)})

    assert resp.status_code == 200
    body = resp.json()
    node_ids = [n["id"] for n in body["graph"]["nodes"]]
    edge_ids = [e["id"] for e in body["graph"]["edges"]]
    assert "claim-1" in node_ids
    assert "evidence-bad" not in node_ids
    assert "e-bad" not in edge_ids


def test_compile_graph_missing_file_returns_500(client, fake_pdf):
    missing = fake_pdf.parent / "does_not_exist.pdf"

    resp = client.post("/graphs/compile", json={"file_path": str(missing)})

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}