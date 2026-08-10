from app.core.exceptions import InvalidLLMResponseError
from backend.app.services import graph_service
from tests.helpers import (
    build_multi_doc_payload,
    build_single_doc_payload,
)


def _raise_invalid_llm(documents):
    raise InvalidLLMResponseError()


def create_workspace(client, name="Test Workspace"):
    return client.post("/workspaces/create", json={"name": name, "description": "integration"})


def test_compile_graph_happy_path(client, fake_pdf, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]

    monkeypatch.setattr(
        graph_service,
        "generate_claim_graph",
        lambda documents: build_single_doc_payload(documents[0]["document_id"]),
    )

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["documents"]) == 1
    document_id = body["documents"][0]["metadata"]["id"]
    assert body["documents"][0]["executive_summary"]
    assert body["documents"][0]["metadata"]["title"] == "Fake Paper"
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "evidence-1", "tradeoff-1"]
    assert all(n["document_id"] == document_id for n in body["graph"]["nodes"])
    assert [e["id"] for e in body["graph"]["edges"]] == ["e1", "e2"]
    assert len(body["react_flow_nodes"]) == 3
    assert body["react_flow_nodes"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert len(body["react_flow_edges"]) == 2


def test_compile_graph_multiple_files(client, fake_pdf, fake_pdf_2, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]

    monkeypatch.setattr(
        graph_service,
        "generate_claim_graph",
        lambda documents: build_multi_doc_payload([d["document_id"] for d in documents]),
    )

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf), str(fake_pdf_2)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["documents"]) == 2
    document_ids = [d["metadata"]["id"] for d in body["documents"]]
    assert len(document_ids) == len(set(document_ids))
    assert [d["metadata"]["title"] for d in body["documents"]] == ["Fake Paper", "Fake Paper 2"]
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "claim-2", "tradeoff-2"]
    assert {n["document_id"] for n in body["graph"]["nodes"]} == set(document_ids)
    assert [e["id"] for e in body["graph"]["edges"]] == ["e2", "e3"]
    assert len(body["react_flow_nodes"]) == 3
    assert len(body["react_flow_edges"]) == 2


def test_compile_graph_filters_invalid_quote_nodes(client, fake_pdf, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]

    monkeypatch.setattr(
        graph_service,
        "generate_claim_graph",
        lambda documents: build_single_doc_payload(documents[0]["document_id"], invalid=True),
    )

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    node_ids = [n["id"] for n in body["graph"]["nodes"]]
    edge_ids = [e["id"] for e in body["graph"]["edges"]]
    assert "claim-1" in node_ids
    assert "evidence-bad" not in node_ids
    assert "e-bad" not in edge_ids


def test_compile_graph_filters_invalid_quotes_per_document(client, fake_pdf, fake_pdf_2, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]

    monkeypatch.setattr(
        graph_service,
        "generate_claim_graph",
        lambda documents: build_multi_doc_payload([d["document_id"] for d in documents], invalid=True),
    )

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf), str(fake_pdf_2)]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1", "claim-2"]
    assert "evidence-bad" not in [n["id"] for n in body["graph"]["nodes"]]
    assert "e-bad" not in [e["id"] for e in body["graph"]["edges"]]
    assert len(body["react_flow_nodes"]) == 2


def test_compile_graph_missing_file_returns_500(client, fake_pdf):
    workspace_id = create_workspace(client).json()["id"]
    missing = fake_pdf.parent / "does_not_exist.pdf"

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(missing)]},
    )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}


def test_compile_graph_empty_file_list_returns_500(client):
    workspace_id = create_workspace(client).json()["id"]

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": []},
    )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}


def test_compile_graph_unknown_workspace_returns_404(client, fake_pdf):
    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": "no-such-workspace", "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Workspace not found"}


def test_compile_graph_surfaces_invalid_llm_response(client, fake_pdf, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]
    monkeypatch.setattr(graph_service, "generate_claim_graph", _raise_invalid_llm)

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "LLM returned an invalid OUTPUT"}