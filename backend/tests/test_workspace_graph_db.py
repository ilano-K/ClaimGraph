"""End-to-end tests for the workspace + graph API with database persistence.

These exercise the full HTTP surface ``POST /workspaces/create``,
``PATCH  /workspaces/{id}`` and ``POST /graphs/compile`` and then verify the
side effects actually landed in SQLite (workspace lifecycle, graph payload,
per-document node counts), i.e. the "end to start" flow the DB-backed refactor
introduced.
"""
from sqlalchemy import select

from app.core.exceptions import InvalidLLMResponseError
from app.db.database import SessionLocal
from app.db.models import Document, Workspace
from app.enums.node import NodeCategory
from app.enums.workspace import WorkspaceStatus
from backend.app.services import graph_service
from tests.helpers import (
    build_multi_doc_payload,
    build_single_doc_payload,
)


def create_workspace(client, name="E2E Workspace"):
    return client.post("/workspaces/create", json={"name": name, "description": "e2e"})


def fetch_workspace(workspace_id: str):
    with SessionLocal() as db:
        return db.scalar(select(Workspace).where(Workspace.id == workspace_id))


def fetch_documents(workspace_id: str):
    with SessionLocal() as db:
        return db.scalars(
            select(Document).where(Document.workspace_id == workspace_id)
        ).all()


def test_workspace_create_roundtrips_through_database(client):
    resp = create_workspace(client)

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "E2E Workspace"
    assert body["ingress_mode"] == "http"
    assert body["status"] == "empty"
    assert body["graph_payload"] is None
    assert body["created_at"] is not None
    assert body["updated_at"] is not None

    workspace = fetch_workspace(body["id"])
    assert workspace is not None
    assert workspace.name == "E2E Workspace"
    assert workspace.status == WorkspaceStatus.EMPTY
    assert workspace.graph_payload is None


def test_workspace_update_persists_and_returns_404_for_missing(client):
    workspace_id = create_workspace(client).json()["id"]

    resp = client.patch(f"/workspaces/{workspace_id}", json={"name": "Renamed Workspace"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Workspace"
    assert fetch_workspace(workspace_id).name == "Renamed Workspace"

    missing = client.patch("/workspaces/does-not-exist", json={"name": "Nope"})
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Workspace not found"}


def test_graph_compile_persists_workspace_and_documents_end_to_end(client, fake_pdf, monkeypatch):
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

    document_id = body["documents"][0]["metadata"]["id"]
    node_ids = [n["id"] for n in body["graph"]["nodes"]]
    assert set(node_ids) == {"claim-1", "evidence-1", "tradeoff-1"}
    assert [e["id"] for e in body["graph"]["edges"]] == ["e1", "e2"]
    assert len(body["react_flow_nodes"]) == 3
    assert len(body["react_flow_edges"]) == 2

    workspace = fetch_workspace(workspace_id)
    assert workspace.status == WorkspaceStatus.READY
    assert workspace.graph_payload is not None
    assert workspace.graph_payload["documents"][0]["metadata"]["id"] == document_id
    assert {n["id"] for n in workspace.graph_payload["nodes"]} == {
        "claim-1",
        "evidence-1",
        "tradeoff-1",
    }

    documents = fetch_documents(workspace_id)
    assert len(documents) == 1
    document = documents[0]
    assert document.id == document_id
    assert document.filename == fake_pdf.name
    assert document.claim_count == 1
    assert document.evidence_count == 1
    assert document.tradeoff_count == 1


def test_graph_compile_multiple_files_persists_per_document_counts(client, fake_pdf, fake_pdf_2, monkeypatch):
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
    document_ids = [d["metadata"]["id"] for d in body["documents"]]
    assert len(document_ids) == 2

    documents = {doc.filename: doc for doc in fetch_documents(workspace_id)}
    assert set(documents) == {fake_pdf.name, fake_pdf_2.name}
    assert documents[fake_pdf.name].claim_count == 1
    assert documents[fake_pdf.name].evidence_count == 0
    assert documents[fake_pdf.name].tradeoff_count == 0
    assert documents[fake_pdf_2.name].claim_count == 1
    assert documents[fake_pdf_2.name].evidence_count == 0
    assert documents[fake_pdf_2.name].tradeoff_count == 1

    workspace = fetch_workspace(workspace_id)
    assert workspace.status == WorkspaceStatus.READY
    assert workspace.graph_payload is not None
    assert {n["document_id"] for n in workspace.graph_payload["nodes"]} == set(document_ids)


def test_graph_compile_filters_invalid_quotes_before_persisting(client, fake_pdf, monkeypatch):
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
    assert [n["id"] for n in body["graph"]["nodes"]] == ["claim-1"]

    document = fetch_documents(workspace_id)[0]
    assert document.claim_count == 1
    assert document.evidence_count == 0
    assert document.tradeoff_count == 0
    payload_nodes = fetch_workspace(workspace_id).graph_payload["nodes"]
    assert [n["node_category"] for n in payload_nodes] == [NodeCategory.CLAIM.value]


def test_graph_compile_failure_marks_workspace_failed(client, fake_pdf, monkeypatch):
    workspace_id = create_workspace(client).json()["id"]

    def _raise_invalid_llm(documents):
        raise InvalidLLMResponseError()

    monkeypatch.setattr(graph_service, "generate_claim_graph", _raise_invalid_llm)

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "LLM returned an invalid OUTPUT"}
    assert fetch_workspace(workspace_id).status == WorkspaceStatus.FAILED


def test_graph_compile_missing_file_marks_workspace_failed(client, fake_pdf):
    workspace_id = create_workspace(client).json()["id"]
    missing = fake_pdf.parent / "does_not_exist.pdf"

    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": workspace_id, "file_paths": [str(missing)]},
    )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Graph Compile Error"}
    assert fetch_workspace(workspace_id).status == WorkspaceStatus.FAILED


def test_graph_compile_unknown_workspace_does_not_touch_database(client, fake_pdf):
    resp = client.post(
        "/graphs/compile",
        json={"workspace_id": "no-such-workspace", "file_paths": [str(fake_pdf)]},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Workspace not found"}
    assert fetch_workspace("no-such-workspace") is None