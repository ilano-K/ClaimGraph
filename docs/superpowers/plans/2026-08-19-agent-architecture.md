# Agent Architecture Implementation Plan (LangGraph)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "ClaimGraph Assistant" chat agent to the FastAPI backend (read/verify/edit/recompile the workspace graph over SSE) built on LangGraph, plus a thin LLM layer for the existing graph-extraction pipeline.

**Architecture:** Two deliberate integration points. The existing extraction pipeline is refactored onto `app/llm/` (`client_factory.py` cached Instructor client + `structured.py` `chat_structured`) and stays on Instructor. The agent is a LangGraph `StateGraph` (agent node `bind_tools` + tools node via `tools_condition`); `app/agents/graph.py` translates `astream_events(version="v2")` into typed ClaimGraph SSE events so the route and frontend never see LangChain types. The six tools live in `app/agents/tools.py` as `StructuredTool`s bound to the request's db + workspace.

**Tech Stack:** Python 3 (FastAPI, SQLAlchemy/SQLite), LangGraph + langchain-openai/langchain-google-genai (agent), Instructor + OpenAI/Google GenAI SDKs (extraction), Pydantic v2, pytest, React 18 (frontend task only).

## Global Constraints

- **New runtime dependencies (agent only):** `langgraph`, `langchain-openai`, `langchain-google-genai`. No other new dependencies. Instructor remains for extraction.
- **No provider knowledge leaks** above `app/llm/` (extraction) and `app/agents/graph.py` (agent).
- **Never log secrets** — the LLM API key must never be logged.
- **Keep the existing graph-compile behavior identical.** The extraction refactor must not change the compiled payload or quote-validation semantics.
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
| 1. Extraction LLM layer | Tasks 1–2 | `app/llm/` (cached client + `chat_structured`) | The extraction refactor's foundation |
| 2. Prove the layer | Tasks 3–4 | `graph_service` refactored onto `chat_structured`; reactflow mapping extracted | Validates the extraction refactor and migrates its tests before agent work starts |
| 3. Agent events + tools | Tasks 5–6 | `events.py` + `tools.py` (six `StructuredTool`s + pure mutation logic) | The LangGraph agent dispatches to these |
| 4. LangGraph agent | Task 7 | `graph.py` (model factory + compiled StateGraph + `run_agent` SSE wrapper) | The agent loop itself |
| 5. API | Task 8 | SSE chat endpoint | Consumes the agent; the feature becomes callable end-to-end |
| 6. Frontend | Task 9 (optional) | SSE chat client + component | Consumes the endpoint; deferred per spec |

Start with **Task 0**, then work top to bottom. Tasks 0–8 are required; Task 9 is optional and can be deferred.

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
- Produces: `chat_structured(system: str, messages: list[dict], response_model: type[T], **kwargs) -> T`. This is the ONLY function in the extraction path that calls the provider. Callers pass plain `{"role", "content"}` dicts (no system message) and provider-specific options via `**kwargs` (e.g. `extra_body={"thinking": {"type": "disabled"}}`).

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
"""Structured LLM call layer (graph-extraction path).

The single integration point between the extraction pipeline and the LLM
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

### Task 5: Agent stream events (`app/agents/events.py`)

**Files:**
- Create: `backend/app/agents/__init__.py`
- Create: `backend/app/agents/events.py`
- Create: `backend/tests/test_agent_events.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `TextDeltaEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`, `DoneEvent` (dataclasses, each with a `type` literal), the `AgentStreamEvent` union, and `event_to_dict(event) -> dict`. Used by Task 7 (`run_agent`) and Task 8 (route) to serialize SSE.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_events.py`:

```python
from app.agents.events import (
    DoneEvent,
    ErrorEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    event_to_dict,
)


def test_event_to_dict_includes_type():
    assert event_to_dict(TextDeltaEvent(delta="hi")) == {
        "type": "text_delta",
        "delta": "hi",
    }


def test_tool_events_serialize():
    call = event_to_dict(ToolCallEvent(name="verify_graph", arguments={"x": 1}))
    result = event_to_dict(ToolResultEvent(name="verify_graph", output="ok"))
    error = event_to_dict(ErrorEvent(message="boom"))
    done = event_to_dict(DoneEvent())
    assert call["type"] == "tool_call"
    assert call["arguments"] == {"x": 1}
    assert result["type"] == "tool_result"
    assert error["type"] == "error"
    assert done == {"type": "done"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent_events.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/agents/__init__.py`: empty file.

`backend/app/agents/events.py`:

```python
"""Typed agent events, serialized to SSE payloads."""
from dataclasses import asdict, dataclass
from typing import Any, Dict, Literal


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_events.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents tests/test_agent_events.py
git commit -m "feat(agents): add typed SSE stream events"
```

---

### Task 6: Agent tools (`app/agents/tools.py`)

**Files:**
- Create: `backend/app/agents/tools.py`
- Create: `backend/tests/test_tools.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: `app.db.crud.workspace`, `app.db.models.Workspace/Document`, `app.services.parsers.parse_and_chunk_document` / `parse_document_to_markdown`, `app.services.workspace_service.validate_document_quotes` / `recompile_workspace` (aliased `service_recompile`), `app.core.exceptions.*`.
- Produces:
  - `GraphMutation`, `ALLOWED_RELATIONS`, `apply_graph_mutation(payload, mutation) -> GraphPayload` (raises `ValueError` on invalid mutations).
  - `AGENT_SYSTEM_PROMPT: str`.
  - `build_tools(db: Session, workspace_id: str) -> list[StructuredTool]` — the six tools, closure-bound to the request's db + workspace. The LLM never sees or supplies db/workspace id.

- [ ] **Step 1: Install the new dependencies**

Run (from `backend/`, venv active):

```bash
python -m pip install langgraph langchain-openai langchain-google-genai
```

Add to `backend/requirements.txt`:

```
langchain-google-genai==<installed version>
langchain-openai==<installed version>
langgraph==<installed version>
```

(Use the exact versions `pip` installs, matching the file's pinned style.)

- [ ] **Step 2: Write the failing test**

`backend/tests/test_tools.py`:

```python
import asyncio
import json

import pytest

from app.agents.tools import (
    ALLOWED_RELATIONS,
    GraphMutation,
    apply_graph_mutation,
    build_tools,
)
from app.db.database import SessionLocal
from app.db.models import Document, Workspace
from app.enums.node import EdgeRelation, NodeCategory
from app.enums.workspace import WorkspaceStatus
from app.schemas.node import GraphEdge, GraphNode
from tests.helpers import make_fake_payload, make_fake_payload_with_invalid_quote


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


def _node(node_id):
    return GraphNode(
        id=node_id,
        document_id="0",
        node_category=NodeCategory.CLAIM,
        title="T",
        summary="S.",
        quote="Some quote.",
    )


TOOL_NAMES = {
    "get_workspace_graph",
    "get_workspace_documents",
    "get_document_chunks",
    "verify_graph",
    "edit_workspace_graph",
    "recompile_workspace",
}


def test_build_tools_returns_six_tools():
    tools = build_tools(db=None, workspace_id="ws")
    assert {t.name for t in tools} == TOOL_NAMES


def test_apply_mutation_adds_node_and_edge():
    payload = make_fake_payload()
    updated = apply_graph_mutation(payload, GraphMutation(
        add_nodes=[_node("claim-2")],
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
    payload = make_fake_payload()
    with pytest.raises(ValueError):
        apply_graph_mutation(payload, GraphMutation(
            add_edges=[GraphEdge(
                id="e-bad",
                source="evidence-1",
                target="tradeoff-1",
                relation=EdgeRelation.CAUSES,
                reasoning="evidence -> limitation is not allowed",
            )],
        ))


def test_apply_mutation_remove_cascades_edges():
    payload = make_fake_payload()
    updated = apply_graph_mutation(payload, GraphMutation(remove_node_ids=["evidence-1"]))
    assert "evidence-1" not in {n.id for n in updated.nodes}
    assert all(e.source != "evidence-1" and e.target != "evidence-1" for e in updated.edges)


def test_get_workspace_graph_tool_returns_json():
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        tools = build_tools(db, ws.id)
        by_name = {t.name: t for t in tools}
        out = _run(by_name["get_workspace_graph"].ainvoke({}))
        data = json.loads(out)
        assert {n["id"] for n in data["nodes"]} == {"claim-1", "evidence-1", "tradeoff-1"}
    finally:
        db.close()


def test_verify_graph_tool_flags_non_verbatim_quote(fake_pdf):
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

        tools = build_tools(db, ws.id)
        by_name = {t.name: t for t in tools}
        out = _run(by_name["verify_graph"].ainvoke({}))
        data = json.loads(out)
        assert data["unverified"] == ["evidence-bad"]
        assert data["verified"] == 1
    finally:
        db.close()


def test_edit_tool_persists_to_db():
    db = SessionLocal()
    try:
        ws = _workspace_with_graph(db)
        tools = build_tools(db, ws.id)
        by_name = {t.name: t for t in tools}
        mutation = {"add_nodes": [_node("claim-2").model_dump()],
                    "remove_node_ids": [], "add_edges": [], "remove_edge_ids": []}
        out = _run(by_name["edit_workspace_graph"].ainvoke(mutation))
        db.refresh(ws)
        payload = json.loads(ws.graph_payload) if isinstance(ws.graph_payload, str) else ws.graph_payload
        assert "claim-2" in {n["id"] for n in payload["nodes"]}
        assert "updated" in out
    finally:
        db.close()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_tools.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.tools'`.

- [ ] **Step 4: Write minimal implementation**

Create `backend/app/agents/tools.py`:

```python
"""Agent tools bound to a workspace, built for LangGraph's ToolNode.

The pure graph-mutation logic (``apply_graph_mutation``) is module-level and
unit-tested directly; ``build_tools`` returns the six LangChain tools, each
closure-bound to the request's db session and workspace id so the LLM never
sees or supplies either.
"""
from typing import Dict, List

import json

from langchain_core.tools import StructuredTool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.exceptions import (
    WorkspaceDocumentNotFoundError,
    WorkspaceNotFoundError,
)
from app.db.crud import workspace as workspace_crud
from app.db.models import Document
from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.graph import GraphPayload
from app.schemas.node import GraphEdge, GraphNode
from app.services.parsers import parse_and_chunk_document, parse_document_to_markdown
from app.services.workspace_service import (
    recompile_workspace as service_recompile,
)
from app.services.workspace_service import validate_document_quotes


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


AGENT_SYSTEM_PROMPT = """You are the ClaimGraph Assistant, a helpful agent for a workspace of technical papers. The workspace has an extracted argumentation graph (nodes + edges) and source documents.

You have tools to read the graph and documents, verify claims, edit the graph, and recompile. Prefer reading the graph before answering. When you edit or recompile the graph, the frontend refreshes automatically; end your reply by telling the user the canvas updated.

Rules:
- Never invent quotes, node ids, or document ids. If a tool output does not contain what you need, say so.
- Verify claims by calling verify_graph and reporting which nodes could not be source-verified.
- Use recompile_workspace sparingly: it is slow and state-changing.
- Keep answers concise and grounded in tool output.
"""


def build_tools(db: Session, workspace_id: str) -> List[StructuredTool]:
    """Return the six tools, closure-bound to this request's db + workspace."""

    async def get_workspace_graph_tool() -> str:
        workspace = workspace_crud.get_workspace(db, workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError()
        if workspace.graph_payload is None:
            return "No compiled graph yet for this workspace."
        return json.dumps(workspace.graph_payload, ensure_ascii=False)

    async def get_workspace_documents_tool() -> str:
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

    async def get_document_chunks_tool(document_id: str) -> str:
        doc = (
            db.query(Document)
            .filter(Document.id == document_id, Document.workspace_id == workspace_id)
            .first()
        )
        if doc is None:
            raise WorkspaceDocumentNotFoundError()
        chunks = parse_and_chunk_document(doc.file_path)
        texts = [getattr(c, "text", str(c)) for c in chunks][:20]
        return json.dumps(texts, ensure_ascii=False)

    async def verify_graph_tool() -> str:
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

    async def edit_workspace_graph_tool(mutation: GraphMutation) -> str:
        workspace = workspace_crud.get_workspace(db, workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError()
        if workspace.graph_payload is None:
            return "No compiled graph to edit for this workspace."
        payload = GraphPayload.model_validate(workspace.graph_payload)
        try:
            updated = apply_graph_mutation(payload, mutation)
        except ValueError as exc:
            return f"Mutation rejected: {exc}"
        workspace.graph_payload = updated.model_dump(mode="json")
        db.commit()
        return (
            f"Graph updated. nodes={len(updated.nodes)} edges={len(updated.edges)}. "
            "Tell the user the canvas will refresh."
        )

    async def recompile_workspace_tool() -> str:
        service_recompile(db, workspace_id)
        return (
            "Recompilation finished. Tell the user the graph has been regenerated "
            "and the canvas will refresh."
        )

    return [
        StructuredTool.from_function(
            coroutine=get_workspace_graph_tool,
            name="get_workspace_graph",
            description=(
                "Return the compiled semantic graph for this workspace as JSON: per-document "
                "analysis, nodes (id, title, category, summary, verbatim quote), and edges "
                "(source, target, relation, reasoning)."
            ),
        ),
        StructuredTool.from_function(
            coroutine=get_workspace_documents_tool,
            name="get_workspace_documents",
            description="Return the source documents of this workspace (id, filename, status, counts).",
        ),
        StructuredTool.from_function(
            coroutine=get_document_chunks_tool,
            name="get_document_chunks",
            description=(
                "Return up to 20 semantic chunks of one source document as a JSON list of "
                "strings, for answers that need the original wording. Provide the document id."
            ),
        ),
        StructuredTool.from_function(
            coroutine=verify_graph_tool,
            name="verify_graph",
            description=(
                "Deterministically re-check that every node's quote appears verbatim in its "
                "source document. Returns checked/verified counts and the node ids whose "
                "quotes could not be found. No LLM cost."
            ),
        ),
        StructuredTool.from_function(
            coroutine=edit_workspace_graph_tool,
            name="edit_workspace_graph",
            description=(
                "Apply a validated mutation to the compiled graph: add_nodes, remove_node_ids, "
                "add_edges, remove_edge_ids. Edges are checked against the allowed relation "
                "matrix and referential integrity. The canvas refreshes automatically after a "
                "successful edit."
            ),
            args_schema=GraphMutation,
        ),
        StructuredTool.from_function(
            coroutine=recompile_workspace_tool,
            name="recompile_workspace",
            description=(
                "Re-run the full compilation pipeline for this workspace: re-parse every "
                "document and re-extract the graph with the LLM. SLOW and state-changing; "
                "use only when the user explicitly asks to recompile or re-verify from scratch."
            ),
        ),
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_tools.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/agents/tools.py tests/test_tools.py requirements.txt
git commit -m "feat(agents): add six LangChain tools with validated graph mutation"
```

---

### Task 7: LangGraph agent (`app/agents/graph.py`)

**Files:**
- Create: `backend/app/agents/graph.py`
- Create: `backend/tests/test_agent_graph.py`

**Interfaces:**
- Consumes: `app.agents.tools.build_tools`/`AGENT_SYSTEM_PROMPT`, `app.agents.events` (event types), `settings`, `langgraph`, `langchain_openai`/`langchain_google_genai`.
- Produces:
  - `build_model() -> BaseChatModel` — `ChatOpenAI` (OpenAI-compatible `base_url`) for `llm_provider == "openai"`; `ChatGoogleGenerativeAI` for `"google"`.
  - `build_agent(tools, model=None) -> CompiledStateGraph` — LangGraph ReAct: `agent` node (model `bind_tools`) -> `tools` node via `tools_condition` -> back to `agent`; bounded by `recursion_limit`.
  - `run_agent(agent, user_message) -> AsyncGenerator[AgentStreamEvent, None]` — maps `astream_events(version="v2")` to ClaimGraph SSE events, always ending with `DoneEvent`.
  - `RECURSION_LIMIT = 25`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_graph.py`:

```python
import asyncio

from app.agents import graph
from app.agents.events import DoneEvent, ErrorEvent, TextDeltaEvent
from app.agents.graph import build_agent, build_model, run_agent
from app.agents.tools import build_tools
from langchain_core.messages import AIMessage
from langchain_core.tools import StructuredTool


def _run(coro):
    return asyncio.run(coro)


def _events(agent_events):
    class _FakeAgent:
        async def astream_events(self, input, **kwargs):
            for event in agent_events:
                yield event

    return _FakeAgent()


class _Chunk:
    def __init__(self, content):
        self.content = content


def test_build_model_uses_openai_compatible():
    from app.core.settings import settings

    old = settings.llm_provider
    settings.llm_provider = "openai"
    try:
        model = build_model()
        assert model.model_name == settings.llm_model_name
    finally:
        settings.llm_provider = old


def test_build_agent_compiles():
    agent = build_agent(build_tools(db=None, workspace_id="ws"))
    assert hasattr(agent, "astream_events")


def test_run_agent_maps_events():
    fake = _events([
        {"event": "on_chat_model_stream", "data": {"chunk": _Chunk("hello")}},
        {"event": "on_tool_start", "name": "verify_graph", "data": {"input": {}}},
        {"event": "on_tool_end", "name": "verify_graph", "data": {"output": "ok"}},
        {"event": "on_chat_model_stream", "data": {"chunk": _Chunk(" world")}},
    ])
    events = [e for e in _run(run_agent(fake, "hi"))]
    assert [e.type for e in events] == ["text_delta", "tool_call", "tool_result", "text_delta", "done"]
    assert events[0].delta == "hello"
    assert events[2].output == "ok"


def test_run_agent_maps_errors():
    fake = _events([
        {"event": "on_chain_error", "error": "boom"},
    ])
    events = [e for e in _run(run_agent(fake, "hi"))]
    assert any(isinstance(e, ErrorEvent) for e in events)
    assert events[-1].type == "done"


class _ScriptedModel:
    """Minimal fake chat model: emits scripted tool calls, then a final answer."""

    def __init__(self, tool_calls, final_answer):
        self._tool_calls = list(tool_calls)
        self._final_answer = final_answer

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        if self._tool_calls:
            name, args = self._tool_calls.pop(0)
            return AIMessage(
                content="",
                tool_calls=[{"name": name, "args": args, "id": f"call-{len(self._tool_calls)}"}],
            )
        return AIMessage(content=self._final_answer)


async def _echo_tool(text: str) -> str:
    return f"echo:{text}"


def test_agent_end_to_end_tool_then_answer():
    tools = [
        StructuredTool.from_function(coroutine=_echo_tool, name="echo", description="Echo a string.")
    ]
    agent = build_agent(
        tools,
        model=_ScriptedModel([("echo", {"text": "hi"})], "the final answer"),
    )
    events = [e for e in _run(run_agent(agent, "hello"))]
    types = [e.type for e in events]
    assert "tool_call" in types
    assert "tool_result" in types
    assert any(e.type == "text_delta" and e.delta == "the final answer" for e in events)
    assert types[-1] == "done"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent_graph.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.graph'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/agents/graph.py`:

```python
"""LangGraph agent construction and ClaimGraph SSE event streaming."""
import logging
from typing import Any, AsyncGenerator, List

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import StructuredTool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.events import (
    AgentStreamEvent,
    DoneEvent,
    ErrorEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from app.agents.tools import AGENT_SYSTEM_PROMPT
from app.core.settings import settings

logger = logging.getLogger(__name__)

RECURSION_LIMIT = 25


def build_model() -> BaseChatModel:
    """Provider-aware chat model (OpenAI-compatible first)."""
    if settings.llm_provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=settings.llm_model_name,
            api_key=settings.llm_api_key,
        )
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.llm_model_name,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )


def build_agent(
    tools: List[StructuredTool],
    model: BaseChatModel | None = None,
) -> CompiledStateGraph:
    """Compile the LangGraph ReAct agent: model node + tools node."""
    if model is None:
        model = build_model()
    bound = model.bind_tools(tools)

    def call_model(state: MessagesState):
        return {"messages": [bound.invoke(state["messages"])]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", call_model)
    builder.add_node("tools", ToolNode(tools))
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")
    return builder.compile()


async def run_agent(
    agent: CompiledStateGraph,
    user_message: str,
) -> AsyncGenerator[AgentStreamEvent, None]:
    """Stream a single agent run as ClaimGraph SSE events, ending with done."""
    async for event in agent.astream_events(
        {"messages": [("system", AGENT_SYSTEM_PROMPT), ("user", user_message)]},
        config={"recursion_limit": RECURSION_LIMIT},
        version="v2",
    ):
        kind = event.get("event")
        try:
            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                content = getattr(chunk, "content", "")
                if content:
                    yield TextDeltaEvent(delta=str(content))
            elif kind == "on_tool_start":
                yield ToolCallEvent(
                    name=event.get("name", ""),
                    arguments=event.get("data", {}).get("input") or {},
                )
            elif kind == "on_tool_end":
                yield ToolResultEvent(
                    name=event.get("name", ""),
                    output=str(event.get("data", {}).get("output", "")),
                )
            elif kind == "on_tool_error":
                yield ToolResultEvent(
                    name=event.get("name", ""),
                    output=f"Tool error: {event.get('error', 'unknown')}",
                )
            elif kind == "on_chain_error":
                yield ErrorEvent(message=str(event.get("error", "agent error")))
        except Exception as exc:  # never let a mapping bug kill the stream
            logger.warning("agent event mapping failed: %s", exc)
    yield DoneEvent()
```

> **Note for the implementer:** the `astream_events` event names/payloads (`on_chat_model_stream`, `on_tool_start`, `on_tool_end`, `on_tool_error`, `on_chain_error`, `data.chunk.content`) are LangChain's `version="v2"` contract. If a name drifts in the installed LangGraph version, adjust the constants in `run_agent`; the tests in Step 1 pin the mapping behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_graph.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents/graph.py tests/test_agent_graph.py
git commit -m "feat(agents): add LangGraph agent build and SSE event streaming"
```

---

### Task 8: SSE chat endpoint

**Files:**
- Create: `backend/app/api/routes/agents.py`
- Create: `backend/tests/test_agents_api.py`
- Modify: `backend/app/api/routes/__init__.py:1-5`

**Interfaces:**
- Consumes: `build_tools`, `build_agent`, `run_agent`, `event_to_dict`, `workspace_crud.get_workspace`, `WorkspaceNotFoundError`.
- Produces: `POST /api/workspaces/{workspace_id}/chat` returning `text/event-stream`. Body: `{"message": string}`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agents_api.py`:

```python
from tests.test_api import create_workspace


def test_chat_streams_text_and_done_events(client, monkeypatch):
    from app.agents.events import DoneEvent, TextDeltaEvent
    from app.api.routes import agents as routes_agents

    ws_id = create_workspace(client).json()["id"]

    async def fake_run_agent(agent, message):
        yield TextDeltaEvent(delta="hello there")
        yield DoneEvent()

    monkeypatch.setattr(routes_agents, "run_agent", fake_run_agent)

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
Expected: FAIL with `AssertionError: 404 != 200` (route not found).

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

from app.agents.events import event_to_dict
from app.agents.graph import build_agent, run_agent
from app.agents.tools import build_tools
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

    tools = build_tools(db, workspace_id)
    agent = build_agent(tools)

    async def event_stream():
        async for event in run_agent(agent, payload.message):
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

### Task 9 (optional): Frontend SSE chat client and component

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/inspector/AgentChat.tsx`
- Modify: `frontend/src/components/inspector/GraphChatSection.tsx`

**Interfaces:**
- Consumes: `POST /api/workspaces/{id}/chat` from Task 8; the `AgentEvent` SSE payload shapes from Task 5's `event_to_dict`.
- Produces: `chatWorkspace(workspaceId, message, onEvent)`, a self-contained `AgentChat` component.

> Deferred wiring: hosting the component requires a screen that knows the current `workspaceId` and can re-fetch the workspace payload after an edit/recompile. The inspector currently only receives `node`, not the workspace id — threading that plus the re-fetch is a follow-up and NOT part of this task. This task delivers the client + component only.

- [ ] **Step 1: Add the SSE client to `frontend/src/api/client.ts`**

Add to `ENDPOINTS`:

```ts
chatWorkspace: (workspaceId: string) =>
  `${API_BASE_URL}/api/workspaces/${workspaceId}/chat`,
```

Add:

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
- `npm run typecheck` from `frontend/` (if Task 9 done) — passes.
- Manual smoke: create workspace → upload a PDF → compile → `POST /api/workspaces/{id}/chat` with a message; confirm SSE events stream (tool calls + token deltas) and the workspace graph round-trips through an edit.

## Self-review notes

- Spec coverage: `app/llm/client_factory.py` (Task 1), `structured.py` (Task 2), `graph_service` refactor (Task 3), `reactflow.py` extraction (Task 4), `events.py` (Task 5), `tools.py` + six tools + pure mutation logic (Task 6), `graph.py` LangGraph agent + `run_agent` (Task 7), SSE route (Task 8), settings fields (Tasks 1-2), test-seam migration (Tasks 3-4). Frontend SSE consumption (Task 9, optional, deferred wiring). Conversation persistence, `search_documents`, LangChain migration of extraction, checkpointer, human-in-the-loop, sub-agents — intentionally out of scope per spec.
- Type consistency: `chat_structured(system, messages, response_model, **kwargs)` everywhere; `build_tools(db, workspace_id) -> list[StructuredTool]`; `build_agent(tools, model=None)`; `run_agent(agent, user_message) -> AsyncGenerator[AgentStreamEvent, None]`; `AgentStreamEvent` names match `event_to_dict` and the frontend `AgentEvent` union.
