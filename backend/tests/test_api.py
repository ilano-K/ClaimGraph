from app.core.exceptions import InvalidLLMResponseError
from app.services import extractor
from tests.helpers import (
    SECOND_SUMMARY,
    SUMMARY,
    make_fake_payload,
    make_fake_payload_with_invalid_quote,
    make_multi_doc_payload,
    make_multi_doc_payload_with_invalid_quote,
)


def _raise_invalid_llm(documents):
    raise InvalidLLMResponseError()


def test_compile_graph_happy_path(client, fake_pdf, monkeypatch):
    monkeypatch.setattr(extractor, "generate_claim_graph", lambda documents: make_fake_payload())

    resp = client.post("/graphs/compile", json={"file_paths": [str(fake_pdf)]})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["documents"]) == 1
    assert body["documents"][0]["executive_summary"] == SUMMARY
    assert body["documents"][0]["metadata"]["id"] == "0"
    assert body["documents"][0]["metadata"]["title"] == "Fake Paper"
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "evidence-1", "tradeoff-1"]
    assert all(n["document_id"] == "0" for n in body["graph"]["nodes"])
    assert [e["id"] for e in body["graph"]["edges"]] == ["e1", "e2"]
    assert len(body["react_flow_nodes"]) == 3
    assert body["react_flow_nodes"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert len(body["react_flow_edges"]) == 2


def test_compile_graph_multiple_files(client, fake_pdf, fake_pdf_2, monkeypatch):
    monkeypatch.setattr(extractor, "generate_claim_graph", lambda documents: make_multi_doc_payload())

    resp = client.post(
        "/graphs/compile",
        json={"file_paths": [str(fake_pdf), str(fake_pdf_2)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["documents"]) == 2
    assert [d["metadata"]["id"] for d in body["documents"]] == ["0", "1"]
    assert [d["metadata"]["title"] for d in body["documents"]] == ["Fake Paper", "Fake Paper 2"]
    assert [d["executive_summary"] for d in body["documents"]] == [SUMMARY, SECOND_SUMMARY]
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "claim-2", "tradeoff-2"]
    assert {n["document_id"] for n in body["graph"]["nodes"]} == {"0", "1"}
    assert [e["id"] for e in body["graph"]["edges"]] == ["e2", "e3"]
    assert len(body["react_flow_nodes"]) == 3
    assert len(body["react_flow_edges"]) == 2


def test_compile_graph_filters_invalid_quote_nodes(client, fake_pdf, monkeypatch):
    monkeypatch.setattr(
        extractor,
        "generate_claim_graph",
        lambda documents: make_fake_payload_with_invalid_quote(),
    )

    resp = client.post("/graphs/compile", json={"file_paths": [str(fake_pdf)]})

    assert resp.status_code == 200
    body = resp.json()
    node_ids = [n["id"] for n in body["graph"]["nodes"]]
    edge_ids = [e["id"] for e in body["graph"]["edges"]]
    assert "claim-1" in node_ids
    assert "evidence-bad" not in node_ids
    assert "e-bad" not in edge_ids


def test_compile_graph_filters_invalid_quotes_per_document(client, fake_pdf, fake_pdf_2, monkeypatch):
    monkeypatch.setattr(
        extractor,
        "generate_claim_graph",
        lambda documents: make_multi_doc_payload_with_invalid_quote(),
    )

    resp = client.post(
        "/graphs/compile",
        json={"file_paths": [str(fake_pdf), str(fake_pdf_2)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "claim-2"]
    assert "evidence-bad" not in [n["id"] for n in body["graph"]["nodes"]]
    assert "e-bad" not in [e["id"] for e in body["graph"]["edges"]]
    assert len(body["react_flow_nodes"]) == 2


def test_compile_graph_missing_file_returns_500(client, fake_pdf):
    missing = fake_pdf.parent / "does_not_exist.pdf"

    resp = client.post("/graphs/compile", json={"file_paths": [str(missing)]})

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}


def test_compile_graph_empty_file_list_returns_500(client):
    resp = client.post("/graphs/compile", json={"file_paths": []})

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}


def test_compile_graph_surfaces_invalid_llm_response(client, fake_pdf, monkeypatch):
    monkeypatch.setattr(extractor, "generate_claim_graph", _raise_invalid_llm)

    resp = client.post("/graphs/compile", json={"file_paths": [str(fake_pdf)]})

    assert resp.status_code == 500
    assert resp.json() == {"detail": "LLM returned an invalid OUTPUT"}