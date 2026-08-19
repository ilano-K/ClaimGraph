# Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "ClaimGraph Assistant" chat agent to the FastAPI backend (read/verify/edit/recompile the workspace graph over SSE) and extract a thin LLM layer shared by the existing graph pipeline and the agent.

**Architecture:** A thin own-layer with swap seams. `app/llm/` holds the cached client factory (`client_factory.py`) and the single structured-call function (`structured.py`). `app/agents/` holds a tool registry (`tools.py`) and a bounded async agent loop (`simple_agent.py`) that streams typed events to an SSE route. The existing `graph_service.generate_claim_graph` is refactored onto `chat_structured`, and the React Flow mapping moves into `app/services/reactflow.py`.

**Tech Stack:** Python 3 (FastAPI, SQLAlchemy/SQLite), Instructor + OpenAI/Google GenAI SDKs, Pydantic v2, pytest, React 18 (frontend task only).

## Global Constraints

- **No new runtime dependencies.** Instructor, OpenAI SDK, Google GenAI SDK, Pydantic are already installed.
- **No provider knowledge leaks above `app/llm/`.** Only `client_factory.py` and `structured.py` may import the OpenAI/GenAI SDKs or Instructor.
- **Never log secrets** — the LLM API key must never be logged.
- **Keep the existing graph-compile behavior identical.** The refactor must not change the compiled payload or quote-validation semantics.
- **Agent stays in Python** on the backend.
- **Tests run from `backend/`:** `pytest tests/<file>.py -q`. `conftest.py` seeds `LLM_PROVIDER=openai`, `LLM_API_KEY=test-key`, `LLM_MODEL_NAME=test-model` before any `app.*` import.
- **Do not revert uncommitted working-tree changes** in `backend/app/services/ai_factory.py` (provider branch is `google`, not `gemini`) or `frontend/src/components/dashboard/Dashboard.tsx`.
- **Docs are gitignored** (`/docs/` in `.gitignore`); use `git add -f` for plan/spec files.

---

## Build Order / Timeline

Work in this order. Each phase produces a green, independently testable state.

| Phase | Tasks | What you get | Why this order |
|-------|-------|--------------|----------------|
| 0. Stabilize | Task 0 | Green test baseline | Stale fixtures block TDD red/green verification everywhere else |
| 1. LLM foundation | Tasks 1–2 | `app/llm/` (cached client + `chat_structured`) | Everything below depends on this layer |
| 2. Prove the layer | Tasks 3–4 | `graph_service` refactored onto `chat_structured`; reactflow mapping extracted | Validates the abstraction against the existing pipeline and migrates its tests before building on top |
| 3. Tools | Tasks 5–8 | Tool registry + the six tools | The agent loop dispatches to these; nothing above them until they exist |
| 4. Agent loop | Task 9 | `simple_agent.py` stream | Consumes the tools |
| 5. API | Task 10 | SSE chat endpoint | Consumes the agent; the feature becomes callable end-to-end |
| 6. Frontend | Task 11 (optional) | SSE chat client + component | Consumes the endpoint; deferred per spec |

Start with **Task 0**, then work top to bottom. Tasks 1–10 are required; Task 11 is optional and can be deferred.

---

### Task 0: Restore the green test baseline

**Files:**
- Modify: `backend/tests/helpers.py:57,106,113,143,194,234,255,262`
- Modify: `backend/tests/test_services.py:93-106`

**Interfaces:**
- Consumes: existing `app.enums.node.NodeCategory`, `app.enums.node.EdgeRelation` (current members only — no `TRADEOFF`, no `DEPENDS_ON`).
- Produces: fixtures that construct valid `GraphPayload`s using only current enums, so every existing test imports and runs.

The suite is currently red because `tests/helpers.py` references removed enum members (`NodeCategory.TRADEOFF`, `EdgeRelation.DEPENDS_ON`) and `test_to_react_flow_edges_styles_and_animation` asserts on removed enum members and old colors.

- [ ] **Step 1: Write the failing fix**

Replace every `NodeCategory.TRADEOFF` with `NodeCategory.LIMITATION` (lines 57, 106, 194, 255). Replace every `EdgeRelation.DEPENDS_ON` edge with `EdgeRelation.SUPPORTS` (lines 113, 143, 234, 262) — the `SUPPORTS` matrix allows `CLAIM -> CLAIM`, and all `DEPENDS_ON` edges are claim-to-claim.

Update `test_to_react_flow_edges_styles_and_animation` in `backend/tests/test_services.py:93-106` to the current enum members and colors:

```python
def test_to_react_flow_edges_styles_and_animation():
    def edge(relation):
        return GraphEdge(id="e", source="a", target="b", relation=relation, reasoning="r")

    supports = to_react_flow_edges([edge(EdgeRelation.SUPPORTS)])[0]
    limits = to_react_flow_edges([edge(EdgeRelation.LIMITS)])[0]
    challenges = to_react_flow_edges([edge(EdgeRelation.CHALLENGES)])[0]

    assert supports.style.stroke == "#22D3EE"
    assert supports.animated is False
    assert limits.style.stroke == "#FACC15"
    assert limits.animated is True
    assert challenges.style.stroke == "#EF4444"
    assert challenges.animated is False
```

- [ ] **Step 2: Run the previously failing tests to verify the fix**

Run: `pytest tests/test_services.py tests/test_logging.py -q`
Expected: PASS (was 6 failed).

- [ ] **Step 3: Run the full suite to confirm the whole baseline is green**

Run: `pytest tests -q`
Expected: all pass. (If an unrelated test fails, stop and investigate before continuing.)

- [ ] **Step 4: Commit**

```bash
git add tests/helpers.py tests/test_services.py
git commit -m "test: restore green baseline after enum changes (TRADEOFF/DEPENDS_ON)"
```

---

### Task 1: Cached LLM client factory (`app/llm/client_factory.py`)

**Files:**
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/client_factory.py`
- Create: `backend/tests/test_llm_client.py`
- Modify: `backend/app/services/ai_factory.py`
- Modify: `backend/app/core/settings.py:9-15` (add `llm_timeout`)

**Interfaces:**
- Consumes: `app.core.settings.settings` (`llm_provider`, `llm_api_key`, `llm_base_url`, new `llm_timeout`).
- Produces: `get_client()` — module-level cached Instructor-wrapped client; `create_client()` re-export in `app.services.ai_factory` (kept so `tests/test_logging.py::test_ai_factory_logs_provider` and any other callers keep working).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_llm_client.py`:

```python
from app.llm.client_factory import get_client
from app.services.ai_factory import create_client


def test_get_client_is_cached():
    assert get_client() is get_client()


def test_ai_factory_reexports_cached_client():
    assert create_client() is get_client()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_llm_client.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.llm'`.

- [ ] **Step 3: Add `llm_timeout` to settings**

In `backend/app/core/settings.py`, add inside the `Settings` class (after `llm_model_name`):

```python
    llm_timeout: float | None = None
```

- [ ] **Step 4: Write minimal implementation**

`backend/app/llm/__init__.py`: empty file.

`backend/app/llm/client_factory.py`:

```python
"""Cached LLM client factory.

Builds an Instructor-wrapped chat client (supporting structured, schema-typed
LLM responses) for the provider configured in :mod:`app.core.settings`. The
client is created once per process and reused.
"""
from app.core.settings import settings
from openai import OpenAI
from google import genai

import instructor
import logging

logger = logging.getLogger(__name__)

_client = None


def get_client():
    """Return the cached Instructor client for the configured LLM provider.

    ``openai`` uses the OpenAI SDK pointed at ``settings.llm_base_url`` (any
    OpenAI-compatible endpoint: Groq, Mistral, Ollama, Azure, ...); ``google``
    uses the native Google GenAI SDK. Raises ``ValueError`` for an unrecognized
    provider.
    """
    global _client
    if _client is not None:
        return _client

    provider = settings.llm_provider
    logger.info("create_client provider=%s", provider)
    if provider == 'openai':
        _client = instructor.from_openai(
            OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
                timeout=settings.llm_timeout,
            )
        )
    elif provider == 'google':
        _client = instructor.from_gemini(
            genai.Client(api_key=settings.llm_api_key)
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
    return _client
```

Replace `backend/app/services/ai_factory.py` with a thin re-export:

```python
"""Backward-compatible re-export of :func:`app.llm.client_factory.get_client`."""
from app.llm.client_factory import get_client

def create_client():
    """Return the cached Instructor client (see ``app.llm.client_factory``)."""
    return get_client()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_llm_client.py tests/test_logging.py::test_ai_factory_logs_provider -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/llm tests/test_llm_client.py app/services/ai_factory.py app/core/settings.py
git commit -m "feat(llm): add cached client factory with timeout setting"
```

---

### Task 2: Structured LLM call layer (`app/llm/structured.py`)

**Files:**
- Create: `backend/app/llm/structured.py`
- Create: `backend/tests/test_llm_structured.py`
- Modify: `backend/app/core/settings.py:9-15` (add `llm_max_retries`)

**Interfaces:**
- Consumes: `get_client()` from Task 1, `InvalidLLMResponseError`, `settings.llm_max_retries`.
- Produces: `chat_structured(system: str, messages: list[dict], response_model: type[T], **kwargs) -> T`. This is the ONLY function in the codebase that calls the provider. Callers pass plain `{"role", "content"}` dicts (no system message) and provider-specific options via `**kwargs` (e.g. `extra_body={"thinking": {"type": "disabled"}}`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_llm_structured.py`:

```python
import pytest

from app.core.exceptions import InvalidLLMResponseError
from app.llm import structured
from app.llm.structured import chat_structured
from instructor.exceptions import IncompleteOutputException
from pydantic import BaseModel


class _Out(BaseModel):
    ok: bool = True


class _FakeCompletions:
    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error
        self.last_kwargs = None
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        self.last_kwargs = kwargs
        if self.error is not None:
            raise self.error
        return self.payload


class _FakeChat:
    def __init__(self, completions):
        self.completions = completions


class _FakeClient:
    def __init__(self, completions):
        self.chat = _FakeChat(completions)


def _stub_client(monkeypatch, completions):
    client = _FakeClient(completions)
    monkeypatch.setattr(structured, "get_client", lambda: client)
    return completions


def test_chat_structured_prepends_system_message(monkeypatch):
    completions = _stub_client(monkeypatch, _FakeCompletions(_Out()))
    result = chat_structured("be good", [{"role": "user", "content": "hi"}], _Out)
    assert result.ok is True
    messages = completions.last_kwargs["messages"]
    assert messages[0] == {"role": "system", "content": "be good"}
    assert messages[1] == {"role": "user", "content": "hi"}
    assert completions.last_kwargs["response_model"] is _Out


def test_chat_structured_forwards_kwargs(monkeypatch):
    completions = _stub_client(monkeypatch, _FakeCompletions(_Out()))
    chat_structured("s", [], _Out, extra_body={"thinking": {"type": "disabled"}})
    assert completions.last_kwargs["extra_body"] == {"thinking": {"type": "disabled"}}


def test_chat_structured_maps_incomplete_output(monkeypatch):
    _stub_client(monkeypatch, _FakeCompletions(error=IncompleteOutputException()))
    with pytest.raises(InvalidLLMResponseError):
        chat_structured("s", [], _Out)


def test_chat_structured_retries_then_reraises(monkeypatch):
    completions = _FakeCompletions(error=RuntimeError("boom"))
    _stub_client(monkeypatch, completions)
    from app.core.settings import settings

    old = settings.llm_max_retries
    settings.llm_max_retries = 2
    try:
        with pytest.raises(RuntimeError, match="boom"):
            chat_structured("s", [], _Out)
    finally:
        settings.llm_max_retries = old
    assert completions.calls == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_llm_structured.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.llm.structured'`.

- [ ] **Step 3: Add `llm_max_retries` to settings**

In `backend/app/core/settings.py`, add inside the `Settings` class:

```python
    llm_max_retries: int = 1
```

- [ ] **Step 4: Write minimal implementation**

`backend/app/llm/structured.py`:

```python
"""Structured LLM call layer.

The single integration point between app services / agents and the LLM
provider. Hides the client, request assembly, retries, and error mapping so
callers never touch the provider SDK.
"""
from typing import TypeVar, Type

from instructor.exceptions import IncompleteOutputException

from app.core.exceptions import InvalidLLMResponseError
from app.core.settings import settings
from app.llm.client_factory import get_client
import logging
import time

logger = logging.getLogger(__name__)

T = TypeVar("T")


def chat_structured(
    system: str,
    messages: list[dict],
    response_model: Type[T],
    **kwargs,
) -> T:
    """Request a structured, schema-typed response from the LLM.

    ``messages`` are plain ``{"role", "content"}`` dicts; the system message is
    ``system``. Provider-specific options are forwarded via ``**kwargs`` (e.g.
    Gemini's ``extra_body={"thinking": {"type": "disabled"}}``).
    """
    start = time.perf_counter()
    logger.info(
        "chat_structured entry provider=%s model=%s",
        settings.llm_provider,
        settings.llm_model_name,
    )
    client = get_client()
    request_kwargs = {
        "model": settings.llm_model_name,
        "response_model": response_model,
        "messages": [{"role": "system", "content": system}, *messages],
        **kwargs,
    }
    for attempt in range(settings.llm_max_retries + 1):
        try:
            result = client.chat.completions.create(**request_kwargs)
            logger.info(
                "chat_structured success in %dms",
                round((time.perf_counter() - start) * 1000),
            )
            return result
        except IncompleteOutputException as exc:
            logger.error("chat_structured invalid LLM output: %s", exc)
            raise InvalidLLMResponseError() from exc
        except Exception as exc:
            logger.warning(
                "chat_structured attempt %d/%d failed: %s",
                attempt + 1,
                settings.llm_max_retries + 1,
                exc,
            )
            if attempt >= settings.llm_max_retries:
                raise
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_llm_structured.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/llm/structured.py tests/test_llm_structured.py app/core/settings.py
git commit -m "feat(llm): add chat_structured layer with retries and error mapping"
```

---

### Task 3: Refactor `generate_claim_graph` onto `chat_structured`

**Files:**
- Modify: `backend/app/services/graph_service.py:8,70-102`
- Modify: `backend/tests/test_services.py:15-38,109-134`
- Modify: `backend/tests/test_logging.py:121-134`

**Interfaces:**
- Consumes: `chat_structured(system, messages, response_model, **kwargs)` from Task 2.
- Produces: `generate_claim_graph(documents) -> GraphPayload` with identical behavior (message shape, document_id validation, normalization, logging). No longer imports `create_client`.

- [ ] **Step 1: Write the failing test**

Rewrite the client-stub helpers in `backend/tests/test_services.py` so tests patch `chat_structured` instead of `create_client`:

```python
class _FakeStructured:
    def __init__(self, payload):
        self.payload = payload
        self.last_kwargs = None

    def __call__(self, **kwargs):
        self.last_kwargs = kwargs
        return self.payload


def _stub_chat(monkeypatch, payload):
    fake = _FakeStructured(payload)
    monkeypatch.setattr(graph_service, "chat_structured", fake)
    return fake
```

Update `test_generate_claim_graph_serializes_documents_as_json` (lines 109-122) to capture from the fake:

```python
def test_generate_claim_graph_serializes_documents_as_json(monkeypatch):
    documents = [
        {"document_id": "0", "content": "first doc body"},
        {"document_id": "1", "content": "second doc body"},
    ]
    fake = _stub_chat(monkeypatch, make_multi_doc_payload())

    generate_claim_graph(documents)

    content = fake.last_kwargs["messages"][1]["content"]
    assert isinstance(content, str)
    payload = json.loads(content)
    assert [d["document_id"] for d in payload] == ["0", "1"]
    assert payload[1]["content"] == "second doc body"
```

`test_generate_claim_graph_raises_when_document_id_missing_from_nodes` already uses `_stub_client`; change its call to `_stub_chat(monkeypatch, make_multi_doc_payload())` and keep the `pytest.raises(InvalidLLMResponseError)` assertion.

Update `backend/tests/test_logging.py::test_graph_service_logs_llm_call` (lines 121-134):

```python
def test_graph_service_logs_llm_call(monkeypatch, caplog):
    from app.services import graph_service
    from app.services.graph_service import generate_claim_graph
    from tests.helpers import make_multi_doc_payload

    caplog.set_level(logging.INFO, logger=GRAPH_LOGGER)
    monkeypatch.setattr(
        graph_service,
        "chat_structured",
        lambda **kwargs: make_multi_doc_payload(),
    )

    generate_claim_graph([{"document_id": "0", "content": "doc body"}])

    messages = _messages(caplog, GRAPH_LOGGER)
    assert any(m.startswith("generate_claim_graph entry provider=openai model=test-model") for m in messages)
    assert any(m.startswith("generate_claim_graph success in") and "nodes=3" in m and "edges=2" in m for m in messages)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_services.py::test_generate_claim_graph_serializes_documents_as_json tests/test_services.py::test_generate_claim_graph_raises_when_document_id_missing_from_nodes tests/test_logging.py::test_graph_service_logs_llm_call -q`
Expected: FAIL with `AttributeError: module 'app.services.graph_service' has no attribute 'chat_structured'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/services/graph_service.py`, change the import (line 8):

```python
from app.llm.structured import chat_structured
```

Replace the client call inside `generate_claim_graph` (lines 86-102):

```python
    result = chat_structured(
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": json.dumps(documents, ensure_ascii=False),
            }
        ],
        response_model=GraphPayload,
        extra_body={"thinking": {"type": "disabled"}},
    )
```

Everything after `result = ...` (normalize, document_id validation, logging, return) stays byte-for-byte unchanged.

- [ ] **Step 4: Run the full affected tests to verify they pass**

Run: `pytest tests/test_services.py tests/test_logging.py tests/test_text_cleanup.py tests/test_api.py tests/test_workspace_graph_db.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/graph_service.py tests/test_services.py tests/test_logging.py
git commit -m "refactor(graph): call chat_structured instead of raw provider client"
```

---

### Task 4: Extract React Flow mapping to `app/services/reactflow.py`

**Files:**
- Create: `backend/app/services/reactflow.py`
- Modify: `backend/app/services/graph_service.py:25-68,14`
- Modify: `backend/app/services/workspace_service.py:32`
- Modify: `backend/tests/test_services.py:9,83-106`

**Interfaces:**
- Consumes: existing `app.schemas.reactflow`, `app.enums.node.EdgeRelation`.
- Produces: `app.services.reactflow.to_react_flow_nodes(nodes)`, `to_react_flow_edges(edges)`, plus module-level `EDGE_STYLE`, `EDGE_ANIMATED`. After this task `graph_service` no longer defines them.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_services.py`, change the import on line 9:

```python
from app.services.reactflow import to_react_flow_edges, to_react_flow_nodes
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_services.py::test_to_react_flow_nodes_defaults -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.reactflow'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/reactflow.py`:

```python
"""Mapping from the semantic graph to React Flow canvas primitives."""
from typing import List

from app.enums.node import EdgeRelation
from app.schemas.node import GraphEdge, GraphNode
from app.schemas.reactflow import (
    ReactFlowEdge,
    ReactFlowNode,
    ReactFlowStyle,
)


def to_react_flow_nodes(nodes: List[GraphNode]) -> List[ReactFlowNode]:
    """Wrap semantic nodes in React Flow-ready nodes at the default origin."""
    return [
        ReactFlowNode(
            id=node.id,
            type="customCard",
            data=node,
            position={"x": 0.0, "y": 0.0},
        )
        for node in nodes
    ]


# Visual styling + animation per edge relation type (shown on the canvas).
EDGE_STYLE = {
    EdgeRelation.SUPPORTS: ReactFlowStyle(stroke="#22D3EE", strokeWidth=2),
    EdgeRelation.LIMITS: ReactFlowStyle(stroke="#FACC15", strokeWidth=2),
    EdgeRelation.CAUSES: ReactFlowStyle(stroke="#F97316", strokeWidth=3),
    EdgeRelation.CHALLENGES: ReactFlowStyle(stroke="#EF4444", strokeWidth=4),
}

EDGE_ANIMATED = {
    EdgeRelation.SUPPORTS: False,
    EdgeRelation.LIMITS: True,
    EdgeRelation.CAUSES: False,
    EdgeRelation.CHALLENGES: False,
}


def to_react_flow_edges(edges: List[GraphEdge]) -> List[ReactFlowEdge]:
    """Convert semantic edges into React Flow edges with relation-based styling."""
    return [
        ReactFlowEdge(
            id=edge.id,
            source=edge.source,
            target=edge.target,
            label=edge.relation,
            animated=EDGE_ANIMATED.get(edge.relation, False),
            style=EDGE_STYLE.get(edge.relation, ReactFlowStyle(stroke="#000000")),
        )
        for edge in edges
    ]
```

In `backend/app/services/graph_service.py`:
- Delete the `to_react_flow_nodes`, `EDGE_STYLE`, `EDGE_ANIMATED`, `to_react_flow_edges` definitions (lines 25-68).
- Remove the now-unused imports (`GraphNode`, `GraphEdge`, `EdgeRelation`, `ReactFlowNode`, `ReactFlowEdge`, `ReactFlowStyle`).
- Remove the `from typing import List` import if nothing else uses it.

In `backend/app/services/workspace_service.py:32`, change the import:

```python
from app.services.reactflow import to_react_flow_edges, to_react_flow_nodes
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_services.py tests/test_api.py tests/test_workspace_graph_db.py tests/test_logging.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/reactflow.py app/services/graph_service.py app/services/workspace_service.py tests/test_services.py
git commit -m "refactor(graph): extract react flow mapping into app/services/reactflow.py"
```

---

### Task 5: Tool registry and read tools

**Files:**
- Create: `backend/app/agents/__init__.py`
- Create: `backend/app/agents/tools.py`
- Create: `backend/tests/test_tools.py`

**Interfaces:**
- Consumes: `app.db.crud.workspace`, `app.db.models.Workspace/Document`, `app.services.parsers.parse_and_chunk_document`, `app.core.exceptions.WorkspaceNotFoundError/WorkspaceDocumentNotFoundError`.
- Produces:
  - `Tool` dataclass, `TOOLS` dict, `register_tool(tool)`, `get_tools()`.
  - `EmptyInput`, `GetDocumentChunksInput`, `GraphMutation`, `ALLOWED_RELATIONS`, `apply_graph_mutation(payload, mutation)` (used by Task 8).
  - `AGENT_SYSTEM_PROMPT`.
  - Tool functions `get_workspace_graph(db, workspace_id, args)`, `get_workspace_documents(db, workspace_id, args)`, `get_document_chunks(db, workspace_id, args)`, `verify_graph(db, workspace_id, args)`, `edit_workspace_graph(db, workspace_id, args)`, `recompile_workspace(db, workspace_id, args)` — all `async` returning `str`. Every tool has the signature `(db, workspace_id, args)` where `args` is an instance of its `input_schema`; the workspace id is injected by the agent, never requested from the model.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_tools.py`:

```python
import asyncio
import json

from app.agents.tools import (
    EmptyInput,
    TOOLS,
    get_tools,
    get_workspace_documents,
    get_workspace_graph,
)
from app.db.database import SessionLocal
from app.db.models import Document, Workspace
from app.enums.workspace import WorkspaceStatus
from tests.helpers import make_fake_payload


def _run(coro):
    return asyncio.run(coro)


def _workspace_with_graph(db, name="ws"):
    ws = Workspace(
        name=name,
        description="desc",
        status=WorkspaceStatus.READY,
        graph_payload=make_fake_payload().model_dump(mode="json"),
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


def test_tool_registry_has_six_tools():
    names = {t.name for t in get_tools()}
    assert names == {
        "get_workspace_graph",
        "get_workspace_documents",
        "get_document_chunks",
        "verify_graph",
        "edit_workspace_graph",
        "recompile_workspace",
    }


def test_get_workspace_graph_returns_payload_json():
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        out = _run(get_workspace_graph(db, ws.id, EmptyInput()))
        data = json.loads(out)
        assert {n["id"] for n in data["nodes"]} == {"claim-1", "evidence-1", "tradeoff-1"}
    finally:
        db.close()


def test_get_workspace_documents_returns_metadata():
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        doc = Document(
            id="doc-1",
            workspace_id=ws.id,
            filename="paper.pdf",
            file_path="nonexistent.pdf",
        )
        db.add(doc)
        db.commit()
        out = _run(get_workspace_documents(db, ws.id, EmptyInput()))
        data = json.loads(out)
        assert data[0]["filename"] == "paper.pdf"
    finally:
        db.close()
```

Note: `make_fake_payload()` uses `NodeCategory.TRADEOFF` at `tests/helpers.py:57`; Task 0 already replaced it with `LIMITATION`, so the node id `"tradeoff-1"` is just an id string and stays valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_tools.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/agents/__init__.py`: empty file.

Create `backend/app/agents/tools.py` with the registry and the three read tools (Tasks 6-8 add the remaining tools and register them here too):

```python
"""Agent tool registry and the ClaimGraph tool set.

A tool is a named, schema-typed async function the agent can call. The Pydantic
input schema doubles as the JSON schema shown to the LLM. Tool functions share
one signature: ``func(db, workspace_id, args) -> str`` where ``args`` is an
instance of the tool's ``input_schema`` (the workspace id is injected by the
agent, never requested from the model).
"""
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, List

import json

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.exceptions import (
    WorkspaceDocumentNotFoundError,
    WorkspaceNotFoundError,
)
from app.db.crud import workspace as workspace_crud
from app.db.models import Document


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: type[BaseModel]
    func: Callable[..., Awaitable[str]]


TOOLS: Dict[str, Tool] = {}


def register_tool(tool: Tool) -> None:
    TOOLS[tool.name] = tool


def get_tools() -> List[Tool]:
    return list(TOOLS.values())


class EmptyInput(BaseModel):
    pass


class GetDocumentChunksInput(BaseModel):
    document_id: str


async def get_workspace_graph(db: Session, workspace_id: str, args: EmptyInput) -> str:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    if workspace.graph_payload is None:
        return "No compiled graph yet for this workspace."
    return json.dumps(workspace.graph_payload, ensure_ascii=False)


register_tool(Tool(
    name="get_workspace_graph",
    description=(
        "Return the compiled semantic graph for this workspace as JSON: per-document "
        "analysis, nodes (id, title, category, summary, verbatim quote), and edges "
        "(source, target, relation, reasoning)."
    ),
    input_schema=EmptyInput,
    func=get_workspace_graph,
))


async def get_workspace_documents(db: Session, workspace_id: str, args: EmptyInput) -> str:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    docs = [
        {
            "id": d.id,
            "filename": d.filename,
            "status": d.status.value,
            "claim_count": d.claim_count,
            "evidence_count": d.evidence_count,
        }
        for d in workspace.documents
    ]
    return json.dumps(docs, ensure_ascii=False)


register_tool(Tool(
    name="get_workspace_documents",
    description="Return the source documents of this workspace (id, filename, status, counts).",
    input_schema=EmptyInput,
    func=get_workspace_documents,
))


async def get_document_chunks(
    db: Session, workspace_id: str, args: GetDocumentChunksInput
) -> str:
    doc = (
        db.query(Document)
        .filter(Document.id == args.document_id, Document.workspace_id == workspace_id)
        .first()
    )
    if doc is None:
        raise WorkspaceDocumentNotFoundError()
    chunks = parse_and_chunk_document(doc.file_path)
    texts = [getattr(c, "text", str(c)) for c in chunks][:20]
    return json.dumps(texts, ensure_ascii=False)


register_tool(Tool(
    name="get_document_chunks",
    description=(
        "Return up to 20 semantic chunks of one source document as a JSON list of "
        "strings, for answers that need the original wording. Provide the document id."
    ),
    input_schema=GetDocumentChunksInput,
    func=get_document_chunks,
))


AGENT_SYSTEM_PROMPT = """You are the ClaimGraph Assistant, a helpful agent for a workspace of technical papers. The workspace has an extracted argumentation graph (nodes + edges) and source documents.

You have tools to read the graph and documents, verify claims, edit the graph, and recompile. Prefer reading the graph before answering. When you edit or recompile the graph, the frontend refreshes automatically; end your reply by telling the user the canvas updated.

Rules:
- Never invent quotes, node ids, or document ids. If a tool output does not contain what you need, say so.
- Verify claims by calling verify_graph and reporting which nodes could not be source-verified.
- Use recompile_workspace sparingly: it is slow and state-changing.
- Keep answers concise and grounded in tool output.
"""
```

Add the missing import at the top of the file:

```python
from app.services.parsers import parse_and_chunk_document
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tools.py -q`
Expected: PASS. (`test_tool_registry_has_six_tools` will fail until Tasks 6-8 register the remaining tools; see Task 5 Step 4a note.)

> **Note:** `test_tool_registry_has_six_tools` asserts all six tools exist. It will fail until Tasks 6, 7, and 8 register `verify_graph`, `edit_workspace_graph`, and `recompile_workspace`. This is intentional — the test drives the remaining tasks. If you run the suite at this checkpoint, expect exactly that one test to fail; the other tool tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/agents tests/test_tools.py
git commit -m "feat(agents): add tool registry and read tools"
```

---

### Task 6: `verify_graph` tool

**Files:**
- Modify: `backend/app/agents/tools.py`
- Modify: `backend/tests/test_tools.py`

**Interfaces:**
- Consumes: `validate_document_quotes` from `app.services.workspace_service`, `parse_document_to_markdown` from `app.services.parsers`, `GraphPayload.model_validate`.
- Produces: registered `verify_graph` tool (satisfies the Task 5 registry test).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_tools.py`:

```python
from app.agents.tools import verify_graph
from tests.helpers import make_fake_payload_with_invalid_quote


def test_verify_graph_flags_non_verbatim_quote(fake_pdf):
    db = SessionLocal()
    try:
        ws = Workspace(
            name="v",
            description="d",
            status=WorkspaceStatus.READY,
            graph_payload=make_fake_payload_with_invalid_quote().model_dump(mode="json"),
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)
        doc = Document(
            id="doc-1",
            workspace_id=ws.id,
            filename=fake_pdf.name,
            file_path=str(fake_pdf),
        )
        db.add(doc)
        db.commit()

        out = _run(verify_graph(db, ws.id, EmptyInput()))
        data = json.loads(out)
        assert data["unverified"] == ["evidence-bad"]
        assert data["verified"] == 1
    finally:
        db.close()
```

`make_fake_payload_with_invalid_quote` (helpers.py:78) has a node `"evidence-bad"` whose quote is `NON_VERBATIM_QUOTE` — not present in the fake PDF text.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_tools.py::test_verify_graph_flags_non_verbatim_quote -q`
Expected: FAIL with `AttributeError: module 'app.agents.tools' has no attribute 'verify_graph'`.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/agents/tools.py`:

```python
async def verify_graph(db: Session, workspace_id: str, args: EmptyInput) -> str:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    if workspace.graph_payload is None:
        return "No compiled graph to verify for this workspace."
    claim_graph = GraphPayload.model_validate(workspace.graph_payload)
    documents = [
        {
            "document_id": d.id,
            "content": parse_document_to_markdown(d.file_path),
            "filename": d.filename,
        }
        for d in workspace.documents
    ]
    valid_nodes, _ = validate_document_quotes(documents, claim_graph)
    valid_ids = {n.id for n in valid_nodes}
    dropped = [
        {"node_id": n.id, "title": n.title, "quote": n.quote}
        for n in claim_graph.nodes
        if n.id not in valid_ids
    ]
    return json.dumps(
        {
            "checked_nodes": len(claim_graph.nodes),
            "verified": len(valid_nodes),
            "unverified": [d["node_id"] for d in dropped],
            "details": dropped,
        },
        ensure_ascii=False,
    )


register_tool(Tool(
    name="verify_graph",
    description=(
        "Deterministically re-check that every node's quote appears verbatim in its "
        "source document. Returns checked/verified counts and the node ids whose "
        "quotes could not be found. No LLM cost."
    ),
    input_schema=EmptyInput,
    func=verify_graph,
))
```

Add imports to the top of `tools.py`:

```python
from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.graph import GraphPayload
from app.schemas.node import GraphEdge, GraphNode
from app.services.parsers import parse_and_chunk_document, parse_document_to_markdown
from app.services.workspace_service import validate_document_quotes
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tools.py -q`
Expected: `test_verify_graph_flags_non_verbatim_quote` PASS; `test_tool_registry_has_six_tools` still fails (waits for Tasks 7-8).

- [ ] **Step 5: Commit**

```bash
git add app/agents/tools.py tests/test_tools.py
git commit -m "feat(agents): add verify_graph tool"
```

---

### Task 7: `edit_workspace_graph` tool

**Files:**
- Modify: `backend/app/agents/tools.py`
- Modify: `backend/tests/test_tools.py`

**Interfaces:**
- Consumes: `GraphMutation` + `apply_graph_mutation` (defined in this task), `GraphPayload` schema.
- Produces: registered `edit_workspace_graph` tool; `apply_graph_mutation(payload, mutation) -> GraphPayload` pure function that raises `ValueError` on invalid mutations. Satisfies the Task 5 registry test (partially).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_tools.py`:

```python
import pytest

from app.agents.tools import GraphMutation, apply_graph_mutation, edit_workspace_graph
from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.node import GraphEdge, GraphNode


def _node(node_id):
    return GraphNode(
        id=node_id,
        document_id="0",
        node_category=NodeCategory.CLAIM,
        title="T",
        summary="S.",
        quote="Some quote.",
    )


def test_apply_mutation_adds_node_and_edge():
    from tests.helpers import make_fake_payload

    payload = make_fake_payload()
    new_node = _node("claim-2")
    updated = apply_graph_mutation(payload, GraphMutation(
        add_nodes=[new_node],
        add_edges=[GraphEdge(
            id="e-new",
            source="evidence-1",
            target="claim-2",
            relation=EdgeRelation.SUPPORTS,
            reasoning="Backs it.",
        )],
    ))
    assert {n.id for n in updated.nodes} == {"claim-1", "evidence-1", "tradeoff-1", "claim-2"}
    assert any(e.id == "e-new" for e in updated.edges)


def test_apply_mutation_rejects_dangling_edge():
    from tests.helpers import make_fake_payload

    payload = make_fake_payload()
    with pytest.raises(ValueError):
        apply_graph_mutation(payload, GraphMutation(
            add_edges=[GraphEdge(
                id="e-bad",
                source="evidence-1",
                target="no-such-node",
                relation=EdgeRelation.SUPPORTS,
                reasoning="Bad.",
            )],
        ))


def test_apply_mutation_rejects_relation_matrix_violation():
    from tests.helpers import make_fake_payload

    payload = make_fake_payload()
    with pytest.raises(ValueError):
        apply_graph_mutation(payload, GraphMutation(
            add_edges=[GraphEdge(
                id="e-bad",
                source="evidence-1",
                target="tradeoff-1",
                relation=EdgeRelation.CAUSES,
                reasoning="evidence -> tradeoff is not allowed by the matrix",
            )],
        ))


def test_apply_mutation_remove_cascades_edges():
    from tests.helpers import make_fake_payload

    payload = make_fake_payload()
    updated = apply_graph_mutation(payload, GraphMutation(remove_node_ids=["evidence-1"]))
    assert "evidence-1" not in {n.id for n in updated.nodes}
    assert all(e.source != "evidence-1" and e.target != "evidence-1" for e in updated.edges)


def test_edit_tool_persists_to_db():
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        new_node = _node("claim-2")
        out = _run(edit_workspace_graph(db, ws.id, GraphMutation(add_nodes=[new_node])))
        db.refresh(ws)
        payload = json.loads(ws.graph_payload) if isinstance(ws.graph_payload, str) else ws.graph_payload
        assert "claim-2" in {n["id"] for n in payload["nodes"]}
        assert "updated" in out
    finally:
        db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_tools.py::test_apply_mutation_adds_node_and_edge -q`
Expected: FAIL with `ImportError: cannot import name 'GraphMutation'`.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/agents/tools.py`:

```python
class GraphMutation(BaseModel):
    add_nodes: List[GraphNode] = []
    remove_node_ids: List[str] = []
    add_edges: List[GraphEdge] = []
    remove_edge_ids: List[str] = []


# Allowed (relation, source_category, target_category) triples — mirrors the
# connection matrix in app/prompts/claim_graph.py.
ALLOWED_RELATIONS: Dict[EdgeRelation, set[tuple[NodeCategory, NodeCategory]]] = {
    EdgeRelation.SUPPORTS: {
        (NodeCategory.EVIDENCE, NodeCategory.CLAIM),
        (NodeCategory.METHODOLOGY, NodeCategory.EVIDENCE),
        (NodeCategory.CLAIM, NodeCategory.CLAIM),
        (NodeCategory.METHODOLOGY, NodeCategory.METHODOLOGY),
    },
    EdgeRelation.LIMITS: {
        (NodeCategory.LIMITATION, NodeCategory.CLAIM),
        (NodeCategory.LIMITATION, NodeCategory.METHODOLOGY),
    },
    EdgeRelation.CAUSES: {
        (NodeCategory.CLAIM, NodeCategory.CONSEQUENCE),
        (NodeCategory.CLAIM, NodeCategory.RISK),
    },
    EdgeRelation.CHALLENGES: {
        (NodeCategory.EVIDENCE, NodeCategory.CLAIM),
        (NodeCategory.CLAIM, NodeCategory.CLAIM),
        (NodeCategory.CONSEQUENCE, NodeCategory.CLAIM),
    },
}


def apply_graph_mutation(payload: GraphPayload, mutation: GraphMutation) -> GraphPayload:
    """Return a new ``GraphPayload`` with ``mutation`` applied and validated.

    Raises ``ValueError`` for a dangling edge, a relation-matrix violation, or
    duplicate node ids.
    """
    removed = set(mutation.remove_node_ids)
    nodes = [n for n in payload.nodes if n.id not in removed]
    node_ids = {n.id for n in nodes}

    kept_edges = [
        e
        for e in payload.edges
        if e.id not in set(mutation.remove_edge_ids)
        and e.source not in removed
        and e.target not in removed
    ]

    added_edges = []
    for edge in mutation.add_edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            raise ValueError(
                f"edge {edge.id} references a missing node: {edge.source} -> {edge.target}"
            )
        source_cat = next(n.node_category for n in nodes if n.id == edge.source)
        target_cat = next(n.node_category for n in nodes if n.id == edge.target)
        if (edge.relation, source_cat, target_cat) not in ALLOWED_RELATIONS[edge.relation]:
            raise ValueError(
                f"relation {edge.relation} not allowed for {source_cat} -> {target_cat}"
            )
        added_edges.append(edge)

    added_ids = [n.id for n in mutation.add_nodes]
    if len(set(added_ids)) != len(added_ids):
        raise ValueError("add_nodes contains duplicate ids")

    return GraphPayload(
        documents=payload.documents,
        nodes=[*nodes, *mutation.add_nodes],
        edges=[*kept_edges, *added_edges],
    )


async def edit_workspace_graph(
    db: Session, workspace_id: str, args: GraphMutation
) -> str:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()
    if workspace.graph_payload is None:
        return "No compiled graph to edit for this workspace."
    payload = GraphPayload.model_validate(workspace.graph_payload)
    try:
        updated = apply_graph_mutation(payload, args)
    except ValueError as exc:
        return f"Mutation rejected: {exc}"
    workspace.graph_payload = updated.model_dump(mode="json")
    db.commit()
    return (
        f"Graph updated. nodes={len(updated.nodes)} edges={len(updated.edges)}. "
        "Tell the user the canvas will refresh."
    )


register_tool(Tool(
    name="edit_workspace_graph",
    description=(
        "Apply a validated mutation to the compiled graph: add_nodes, remove_node_ids, "
        "add_edges, remove_edge_ids. Edges are checked against the allowed relation "
        "matrix and referential integrity. The canvas refreshes automatically after a "
        "successful edit."
    ),
    input_schema=GraphMutation,
    func=edit_workspace_graph,
))
```

Update the `GraphMutation` class definition to match its use as a tool input schema. Note: `GraphMutation` is defined AFTER `get_tools()`/`TOOLS` in the file; the `register_tool(GraphMutation...)` call must come after the class definition, which it does (appended at the end). Ensure `Dict`, `Tuple`, `Set` typing imports are available (`from typing import ... Dict, List` already there; add `Tuple`, `Set`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tools.py -q`
Expected: PASS for all mutation tests and `test_edit_tool_persists_to_db`; `test_tool_registry_has_six_tools` still fails (waits for Task 8).

- [ ] **Step 5: Commit**

```bash
git add app/agents/tools.py tests/test_tools.py
git commit -m "feat(agents): add validated edit_workspace_graph tool"
```

---

### Task 8: `recompile_workspace` tool

**Files:**
- Modify: `backend/app/agents/tools.py`
- Modify: `backend/tests/test_tools.py`

**Interfaces:**
- Consumes: `app.services.workspace_service.recompile_workspace` (aliased to avoid the name clash).
- Produces: registered `recompile_workspace` tool. Completes the Task 5 registry test.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_tools.py`:

```python
from app.agents import tools as tools_module
from app.agents.tools import recompile_workspace


def test_recompile_tool_invokes_service(monkeypatch):
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        calls = []

        def fake_recompile(session, workspace_id):
            calls.append(workspace_id)

        monkeypatch.setattr(tools_module, "service_recompile", fake_recompile)
        out = _run(recompile_workspace(db, ws.id, EmptyInput()))
        assert calls == [ws.id]
        assert "regenerated" in out
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_tools.py::test_recompile_tool_invokes_service -q`
Expected: FAIL with `AttributeError: module 'app.agents.tools' has no attribute 'recompile_workspace'`.

- [ ] **Step 3: Write minimal implementation**

Add to the imports at the top of `backend/app/agents/tools.py`:

```python
from app.services.workspace_service import (
    recompile_workspace as service_recompile,
)
```

Append to `backend/app/agents/tools.py`:

```python
async def recompile_workspace(db: Session, workspace_id: str, args: EmptyInput) -> str:
    service_recompile(db, workspace_id)
    return (
        "Recompilation finished. Tell the user the graph has been regenerated "
        "and the canvas will refresh."
    )


register_tool(Tool(
    name="recompile_workspace",
    description=(
        "Re-run the full compilation pipeline for this workspace: re-parse every "
        "document and re-extract the graph with the LLM. SLOW and state-changing; "
        "use only when the user explicitly asks to recompile or re-verify from scratch."
    ),
    input_schema=EmptyInput,
    func=recompile_workspace,
))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tools.py -q`
Expected: PASS, including `test_tool_registry_has_six_tools`.

- [ ] **Step 5: Commit**

```bash
git add app/agents/tools.py tests/test_tools.py
git commit -m "feat(agents): add recompile_workspace tool"
```

---

### Task 9: `simple_agent.py` — bounded async agent loop

**Files:**
- Create: `backend/app/agents/simple_agent.py`
- Create: `backend/tests/test_simple_agent.py`

**Interfaces:**
- Consumes: `AGENT_SYSTEM_PROMPT`, `TOOLS`, `Tool` from `app.agents.tools`; `chat_structured` from `app.llm.structured`.
- Produces:
  - `FinalAnswer`, `ToolCall`, `AgentDecision` (discriminated union of the two).
  - `AgentStreamEvent` events: `TextDeltaEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`, `DoneEvent` (dataclasses, each with a `type` literal).
  - `event_to_dict(event) -> dict` (adds a `"type"` field for SSE serialization).
  - `SimpleAgent(db, workspace_id, *, tools=None, max_iterations=10)` with `async def stream(user_message) -> AsyncGenerator[AgentStreamEvent, None]`.
  - `MAX_ITERATIONS = 10`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_simple_agent.py`:

```python
import asyncio

from app.agents import simple_agent
from app.agents.simple_agent import (
    MAX_ITERATIONS,
    DoneEvent,
    ErrorEvent,
    FinalAnswer,
    SimpleAgent,
    TextDeltaEvent,
    ToolCall,
    ToolCallEvent,
    ToolResultEvent,
)
from app.agents.tools import Tool
from pydantic import BaseModel


class _EchoInput(BaseModel):
    text: str


async def _echo_tool(db, workspace_id, args: _EchoInput) -> str:
    return f"echo:{args.text}"


TOOLS = {
    "echo": Tool(
        name="echo",
        description="Echo a string back.",
        input_schema=_EchoInput,
        func=_echo_tool,
    )
}


def _run(coro):
    return asyncio.run(coro)


def _scripted(fake):
    def chat_structured(system, messages, response_model, **kwargs):
        return fake()
    return chat_structured


def test_agent_streams_tool_then_answer(monkeypatch):
    calls = []

    def fake():
        calls.append(1)
        if len(calls) == 1:
            return ToolCall(tool_name="echo", arguments={"text": "hi"})
        return FinalAnswer(answer="done")

    monkeypatch.setattr(simple_agent, "chat_structured", _scripted(fake))

    agent = SimpleAgent(db=None, workspace_id="ws", tools=TOOLS)
    events = [e for e in _run(agent.stream("hello"))]

    types = [e.type for e in events]
    assert types == ["tool_call", "tool_result", "text_delta", "done"]
    assert events[0].name == "echo"
    assert events[0].arguments == {"text": "hi"}
    assert events[1].output == "echo:hi"
    assert events[2].delta == "done"
    assert isinstance(events[3], DoneEvent)


def test_agent_unknown_tool_returns_error_text(monkeypatch):
    monkeypatch.setattr(
        simple_agent,
        "chat_structured",
        _scripted(lambda: ToolCall(tool_name="nope", arguments={})),
    )

    agent = SimpleAgent(db=None, workspace_id="ws", tools=TOOLS)
    events = [e for e in _run(agent.stream("hi"))]

    assert events[0].type == "tool_call"
    assert "Unknown tool: nope" in events[1].output
    assert events[2].type == "tool_call"


def test_agent_exceeding_max_iterations_emits_error(monkeypatch):
    monkeypatch.setattr(
        simple_agent,
        "chat_structured",
        _scripted(lambda: ToolCall(tool_name="echo", arguments={"text": "x"})),
    )

    agent = SimpleAgent(
        db=None, workspace_id="ws", tools=TOOLS, max_iterations=2
    )
    events = [e for e in _run(agent.stream("hi"))]

    assert any(isinstance(e, ErrorEvent) for e in events)
    assert events[-1].type == "done"


def test_event_to_dict_includes_type():
    assert simple_agent.event_to_dict(TextDeltaEvent(delta="hi")) == {
        "type": "text_delta",
        "delta": "hi",
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_simple_agent.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.simple_agent'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/agents/simple_agent.py`:

```python
"""Bounded, stateless agent loop that streams typed events for SSE."""
from dataclasses import asdict, dataclass
from typing import Any, AsyncGenerator, Dict, Literal
import asyncio
import logging

from pydantic import BaseModel, Field
from typing_extensions import Annotated
from sqlalchemy.orm import Session

from app.agents.tools import AGENT_SYSTEM_PROMPT, TOOLS, Tool
from app.llm.structured import chat_structured

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 10


class FinalAnswer(BaseModel):
    type: Literal["answer"] = "answer"
    answer: str


class ToolCall(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    tool_name: str
    arguments: Dict[str, Any]


AgentDecision = Annotated[FinalAnswer | ToolCall, Field(discriminator="type")]


@dataclass
class TextDeltaEvent:
    type: Literal["text_delta"] = "text_delta"
    delta: str = ""


@dataclass
class ToolCallEvent:
    type: Literal["tool_call"] = "tool_call"
    name: str = ""
    arguments: Dict[str, Any] = None  # type: ignore[assignment]


@dataclass
class ToolResultEvent:
    type: Literal["tool_result"] = "tool_result"
    name: str = ""
    output: str = ""


@dataclass
class ErrorEvent:
    type: Literal["error"] = "error"
    message: str = ""


@dataclass
class DoneEvent:
    type: Literal["done"] = "done"


AgentStreamEvent = (
    TextDeltaEvent | ToolCallEvent | ToolResultEvent | ErrorEvent | DoneEvent
)


def event_to_dict(event: AgentStreamEvent) -> Dict[str, Any]:
    """Serialize an event for the SSE payload, including its ``type`` field."""
    data = asdict(event)
    data["type"] = event.type
    return data


class SimpleAgent:
    def __init__(
        self,
        db: Session,
        workspace_id: str,
        *,
        tools: Dict[str, Tool] | None = None,
        max_iterations: int = MAX_ITERATIONS,
    ):
        self.db = db
        self.workspace_id = workspace_id
        self.tools = tools or TOOLS
        self.max_iterations = max_iterations

    async def stream(self, user_message: str) -> AsyncGenerator[AgentStreamEvent, None]:
        """Run the agent loop, yielding events; ends with a ``DoneEvent``."""
        messages: list[dict] = [{"role": "user", "content": user_message}]
        for _ in range(self.max_iterations):
            try:
                decision = await asyncio.to_thread(
                    chat_structured, AGENT_SYSTEM_PROMPT, messages, AgentDecision
                )
            except Exception as exc:
                logger.warning("agent LLM call failed: %s", exc)
                yield ErrorEvent(message=f"LLM call failed: {type(exc).__name__}: {exc}")
                yield DoneEvent()
                return

            if decision.type == "answer":
                yield TextDeltaEvent(delta=decision.answer)
                yield DoneEvent()
                return

            yield ToolCallEvent(name=decision.tool_name, arguments=decision.arguments)
            output = await self._dispatch(decision.tool_name, decision.arguments)
            yield ToolResultEvent(name=decision.tool_name, output=output)
            messages.append(
                {
                    "role": "user",
                    "content": f"Tool {decision.tool_name} returned: {output}",
                }
            )

        yield ErrorEvent(message=f"Agent exceeded {self.max_iterations} iterations.")
        yield DoneEvent()

    async def _dispatch(self, name: str, raw_arguments: Dict[str, Any]) -> str:
        tool = self.tools.get(name)
        if tool is None:
            return f"Unknown tool: {name}. Available tools: {', '.join(sorted(self.tools))}."
        try:
            args = tool.input_schema.model_validate(raw_arguments)
            return await tool.func(
                db=self.db, workspace_id=self.workspace_id, args=args
            )
        except Exception as exc:
            logger.warning("tool %s failed: %s", name, exc)
            return f"Tool {name} raised: {type(exc).__name__}: {exc}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_simple_agent.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents/simple_agent.py tests/test_simple_agent.py
git commit -m "feat(agents): add bounded async agent loop with SSE events"
```

---

### Task 10: SSE chat endpoint

**Files:**
- Create: `backend/app/api/routes/agents.py`
- Create: `backend/tests/test_agents_api.py`
- Modify: `backend/app/api/routes/__init__.py:1-5`

**Interfaces:**
- Consumes: `SimpleAgent`, `event_to_dict` from Task 9; `workspace_crud.get_workspace`; `WorkspaceNotFoundError`.
- Produces: `POST /api/workspaces/{workspace_id}/chat` returning `text/event-stream`. Body: `{"message": string}`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agents_api.py`:

```python
from tests.test_api import create_workspace


def test_chat_streams_text_and_done_events(client, monkeypatch):
    from app.agents import simple_agent

    ws_id = create_workspace(client).json()["id"]

    def fake_structured(system, messages, response_model, **kwargs):
        return simple_agent.FinalAnswer(answer="hello there")

    monkeypatch.setattr(simple_agent, "chat_structured", fake_structured)

    resp = client.post(f"/api/workspaces/{ws_id}/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    assert '"text_delta"' in resp.text
    assert '"hello there"' in resp.text
    assert '"done"' in resp.text


def test_chat_returns_404_for_missing_workspace(client):
    resp = client.post("/api/workspaces/does-not-exist/chat", json={"message": "hi"})
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agents_api.py -q`
Expected: FAIL with `AssertionError: 404 != 200` (route not found → 404 on the app for the missing route; the create workspace call succeeds).

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/api/routes/agents.py`:

```python
"""Agent chat endpoint. Streams agent events as Server-Sent Events."""
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.simple_agent import SimpleAgent, event_to_dict
from app.core.exceptions import WorkspaceNotFoundError
from app.db.crud import workspace as workspace_crud
from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces")


class ChatRequest(BaseModel):
    message: str


@router.post("/{workspace_id}/chat")
async def chat(
    workspace_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db),
):
    if workspace_crud.get_workspace(db, workspace_id) is None:
        raise WorkspaceNotFoundError()

    agent = SimpleAgent(db=db, workspace_id=workspace_id)

    async def event_stream():
        async for event in agent.stream(payload.message):
            yield f"data: {json.dumps(event_to_dict(event), ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

Modify `backend/app/api/routes/__init__.py`:

```python
from fastapi import APIRouter
from app.api.routes import agents, workspaces

api_router = APIRouter(prefix="/api")
api_router.include_router(workspaces.router)
api_router.include_router(agents.router)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agents_api.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `pytest tests -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/routes/agents.py app/api/routes/__init__.py tests/test_agents_api.py
git commit -m "feat(api): add SSE agent chat endpoint"
```

---

### Task 11 (optional): Frontend SSE chat client and component

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/inspector/AgentChat.tsx`
- Modify: `frontend/src/components/inspector/GraphChatSection.tsx`

**Interfaces:**
- Consumes: `POST /api/workspaces/{id}/chat` from Task 10; the `AgentEvent` SSE payload shapes from Task 9's `event_to_dict`.
- Produces: `chatWorkspace(workspaceId, message, onEvent)`, a self-contained `AgentChat` component.

> Deferred wiring: hosting the component requires a screen that knows the current `workspaceId` and can re-fetch the workspace payload after an edit/recompile. The inspector currently only receives `node`, not the workspace id — threading that plus the re-fetch is a follow-up and NOT part of this task. This task delivers the client + component only.

- [ ] **Step 1: Add the SSE client to `frontend/src/api/client.ts`**

```ts
chatWorkspace: (workspaceId: string) =>
  `${API_BASE_URL}/api/workspaces/${workspaceId}/chat`,
```

```ts
export type AgentEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export async function chatWorkspace(
  workspaceId: string,
  message: string,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const response = await fetch(ENDPOINTS.chatWorkspace(workspaceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!response.ok) throw new ApiError(response.status, 'Agent request failed.')
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const line = block.trim()
      if (!line.startsWith('data: ')) continue
      onEvent(JSON.parse(line.slice(6)) as AgentEvent)
    }
  }
}
```

- [ ] **Step 2: Create `frontend/src/components/inspector/AgentChat.tsx`**

A minimal self-contained panel: message input, event list, auto-scroll. Renders `text_delta` deltas appended to the current assistant message, and surfaces `tool_call`/`tool_result` as small status lines.

```tsx
import { useState } from 'react'
import { chatWorkspace, type AgentEvent } from '../../api/client'

interface AgentChatProps {
  workspaceId: string
  onGraphChanged?: () => void
}

interface UiMessage {
  role: 'user' | 'assistant'
  text: string
  status?: string
}

export default function AgentChat({ workspaceId, onGraphChanged }: AgentChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [busy, setBusy] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setBusy(true)
    let assistant = ''
    let mutated = false
    const handleEvent = (event: AgentEvent) => {
      if (event.type === 'text_delta') {
        assistant += event.delta
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', text: assistant }
          return next
        })
      } else if (event.type === 'tool_call') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '', status: `→ ${event.name}` },
        ])
      } else if (event.type === 'tool_result') {
        if (event.name === 'edit_workspace_graph' || event.name === 'recompile_workspace') {
          mutated = true
        }
      } else if (event.type === 'error') {
        assistant += `\n[error] ${event.message}`
      }
    }
    try {
      await chatWorkspace(workspaceId, text, handleEvent)
      if (mutated && onGraphChanged) onGraphChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className="rounded-lg p-3 text-body-sm bg-surface-container">
            <div className="font-label-sm text-outline uppercase tracking-widest text-[10px] mb-1">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            {m.status && <div className="text-[12px] text-outline">{m.status}</div>}
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-surface-bright px-3 py-2 text-body-sm"
          value={input}
          placeholder="Ask about this workspace..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button
          className="rounded-lg bg-primary px-4 py-2 text-body-sm"
          onClick={send}
          disabled={busy}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the frontend builds**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts src/components/inspector/AgentChat.tsx
git commit -m "feat(frontend): add agent chat SSE client and component"
```

---

## Verification checklist (run before claiming completion)

- `pytest tests -q` from `backend/` — all pass.
- `npm run typecheck` from `frontend/` (if Task 11 done) — passes.
- Manual smoke: create workspace → upload a PDF → compile → `POST /api/workspaces/{id}/chat` with a message; confirm SSE events stream and the workspace graph round-trips through an edit.

## Self-review notes

- Spec coverage: `app/llm/client_factory.py` (Task 1), `structured.py` (Task 2), `graph_service` refactor (Task 3), `reactflow.py` extraction (Task 4), tool registry + 6 tools (Tasks 5-8), `simple_agent.py` loop + events (Task 9), SSE route (Task 10), settings fields (Tasks 1-2), test-seam migration (Tasks 3-4). Frontend SSE consumption (Task 11, optional, deferred wiring). Conversation persistence, LangGraph, search_documents, Anthropic adapter, checkpointing — intentionally out of scope per spec.
- Type consistency: all tool functions share `(db, workspace_id, args)`; `chat_structured(system, messages, response_model, **kwargs)` everywhere; `AgentStreamEvent` names match `event_to_dict`.
