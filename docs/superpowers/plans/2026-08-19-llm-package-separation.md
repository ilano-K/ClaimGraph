# LLM Package Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the LLM provider code into a new `app/llm/` package and split `graph_service` so it no longer mixes LLM calls with React Flow canvas mapping.

**Architecture:** `app/llm/` becomes the only package that touches the provider SDK — `client_factory.py` builds a cached Instructor client, `structured.py` exposes `chat_structured()` as the single call entry point. `graph_service.generate_claim_graph` calls `chat_structured`; the React Flow mapping (`to_react_flow_nodes/edges`, `EDGE_STYLE`, `EDGE_ANIMATED`) moves verbatim to `app/services/reactflow.py`. `app/services/ai_factory.py` is deleted. Compiled payloads, quote validation, and logging behavior stay byte-for-byte identical.

**Tech Stack:** Python 3 (FastAPI backend), Instructor + OpenAI/GenAI SDKs, pydantic v2, pytest.

## Global Constraints

- **Keep the existing graph-compile behavior identical.** The refactor must not change the compiled payload, quote-validation semantics, or log messages.
- **No provider SDK knowledge above `app/llm/`.** After the refactor, `graph_service` imports `chat_structured` and nothing else LLM-related.
- **Never log secrets** — the LLM API key must never be logged.
- **Preserve the uncommitted working-tree change** in `backend/app/services/ai_factory.py`: the provider branch is `google`, not `gemini`. Do not revert it. Do not touch `frontend/src/components/dashboard/Dashboard.tsx`.
- **Tests run from `backend/`:** `pytest tests/<file>.py -q`. `conftest.py` seeds `LLM_PROVIDER=openai`, `LLM_API_KEY=test-key`, `LLM_MODEL_NAME=test-model` before any `app.*` import.
- **Docs are gitignored** (`/docs/` in `.gitignore`); use `git add -f` for the plan file.
- Current enums: `NodeCategory` = CLAIM, EVIDENCE, METHODOLOGY, LIMITATION, RISK, CONSEQUENCE; `EdgeRelation` = SUPPORTS, LIMITS, CAUSES, CHALLENGES.
- Current edge colors: SUPPORTS `#22D3EE`, LIMITS `#FACC15`, CAUSES `#F97316`, CHALLENGES `#EF4444`. Animated: only LIMITS.

---

## Task 0: Restore the green test baseline

The suite is currently red (6 failures) because test fixtures reference removed
enum members (`NodeCategory.TRADEOFF`, `EdgeRelation.DEPENDS_ON`) and stale
colors. Fix those before any TDD work.

**Files:**
- Modify: `backend/tests/helpers.py:57,106,113,143,194,234,255,262`
- Modify: `backend/tests/test_services.py:93-106`

**Interfaces:**
- Consumes: current `app.enums.node.NodeCategory` / `EdgeRelation` members.
- Produces: fixtures that construct valid `GraphPayload`s using only current enums, so every existing test imports and runs.

- [ ] **Step 1: Fix removed enum references in `backend/tests/helpers.py`**

Replace every `NodeCategory.TRADEOFF` with `NodeCategory.LIMITATION` (lines 57, 106, 194, 255). Replace every `EdgeRelation.DEPENDS_ON` edge with `EdgeRelation.SUPPORTS` (lines 113, 143, 234, 262) — `SUPPORTS` allows `CLAIM -> CLAIM`, and all `DEPENDS_ON` edges are claim-to-claim.

- [ ] **Step 2: Fix the stale color/enum test in `backend/tests/test_services.py:93-106`**

Replace the body of `test_to_react_flow_edges_styles_and_animation`:

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

- [ ] **Step 3: Run the previously failing tests to verify the fix**

Run: `pytest tests/test_services.py tests/test_logging.py -q`
Expected: PASS (was 6 failed).

- [ ] **Step 4: Run the full suite to confirm the whole baseline is green**

Run: `pytest tests -q`
Expected: all pass. (If an unrelated test fails, stop and investigate before continuing.)

- [ ] **Step 5: Commit**

```bash
git add tests/helpers.py tests/test_services.py
git commit -m "test: restore green baseline after enum changes (TRADEOFF/DEPENDS_ON)"
```

---

## Task 1: Cached LLM client factory (`app/llm/client_factory.py`)

**Files:**
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/client_factory.py`
- Create: `backend/tests/test_llm_client.py`
- Modify: `backend/app/services/ai_factory.py`
- Modify: `backend/tests/test_logging.py:99-100,137-143`

**Interfaces:**
- Consumes: `app.core.settings.settings` (`llm_provider`, `llm_api_key`, `llm_base_url`).
- Produces: `get_client()` — module-level cached Instructor-wrapped client. `ai_factory.create_client()` re-exports it (so `graph_service` and remaining callers keep working until Task 3/5).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_llm_client.py`:

```python
from app.llm.client_factory import get_client


def test_get_client_is_cached():
    assert get_client() is get_client()


def test_get_client_exposes_chat_completions():
    client = get_client()
    assert hasattr(client.chat, "completions")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_llm_client.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.llm'`.

- [ ] **Step 3: Create `app/llm/` and write minimal implementation**

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

    ``openai`` uses the OpenAI SDK pointed at ``settings.llm_base_url``;
    ``google`` uses the native Google GenAI SDK. Raises ``ValueError`` for an
    unrecognized provider.
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

Replace the whole `backend/app/services/ai_factory.py` with a re-export:

```python
"""Backward-compatible re-export of :func:`app.llm.client_factory.get_client`."""
from app.llm.client_factory import get_client


def create_client():
    """Return the cached Instructor client (see ``app.llm.client_factory``)."""
    return get_client()
```

- [ ] **Step 4: Update the factory logging test for the new module**

In `backend/tests/test_logging.py`, change line 100 to:

```python
AI_LOGGER = "app.llm.client_factory"
```

Replace `test_ai_factory_logs_provider` (lines 137-143) with:

```python
def test_llm_client_logs_provider(caplog, monkeypatch):
    from app.llm import client_factory

    caplog.set_level(logging.INFO, logger=AI_LOGGER)
    monkeypatch.setattr(client_factory, "_client", None)
    client_factory.get_client()
    messages = _messages(caplog, AI_LOGGER)
    assert any(m == "create_client provider=openai" for m in messages)
```

(`get_client()` caches its client, so the test resets the module-level `_client` first to force the log line.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_llm_client.py tests/test_logging.py::test_llm_client_logs_provider -q`
Expected: PASS.

- [ ] **Step 6: Run the wider suite to confirm nothing regressed**

Run: `pytest tests/test_services.py tests/test_logging.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/llm tests/test_llm_client.py app/services/ai_factory.py tests/test_logging.py
git commit -m "feat(llm): add cached instructor client factory in app/llm"
```

---

## Task 2: Structured LLM call layer (`app/llm/structured.py`)

**Files:**
- Create: `backend/app/llm/structured.py`
- Create: `backend/tests/test_llm_structured.py`

**Interfaces:**
- Consumes: `get_client()` from Task 1, `InvalidLLMResponseError` (`app.core.exceptions`), `settings.llm_model_name`.
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

    def create(self, **kwargs):
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
    assert completions.last_kwargs["model"] == "test-model"


def test_chat_structured_forwards_kwargs(monkeypatch):
    completions = _stub_client(monkeypatch, _FakeCompletions(_Out()))
    chat_structured("s", [], _Out, extra_body={"thinking": {"type": "disabled"}})
    assert completions.last_kwargs["extra_body"] == {"thinking": {"type": "disabled"}}


def test_chat_structured_maps_incomplete_output(monkeypatch):
    _stub_client(monkeypatch, _FakeCompletions(error=IncompleteOutputException()))
    with pytest.raises(InvalidLLMResponseError):
        chat_structured("s", [], _Out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_llm_structured.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.llm.structured'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/llm/structured.py`:

```python
"""Structured LLM call layer (graph-extraction path).

The single integration point between the extraction pipeline and the LLM
provider. Hides the client and request assembly so callers never touch the
provider SDK.
"""
from typing import Type, TypeVar

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
    ``extra_body={"thinking": {"type": "disabled"}}``).
    """
    start = time.perf_counter()
    logger.info(
        "chat_structured entry provider=%s model=%s",
        settings.llm_provider,
        settings.llm_model_name,
    )
    client = get_client()
    try:
        result = client.chat.completions.create(
            model=settings.llm_model_name,
            response_model=response_model,
            messages=[{"role": "system", "content": system}, *messages],
            **kwargs,
        )
    except IncompleteOutputException as exc:
        logger.error("chat_structured invalid LLM output: %s", exc)
        raise InvalidLLMResponseError() from exc
    logger.info(
        "chat_structured success in %dms",
        round((time.perf_counter() - start) * 1000),
    )
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_llm_structured.py -q`
Expected: PASS. (A `DeprecationWarning` about `instructor.exceptions` is harmless.)

- [ ] **Step 5: Commit**

```bash
git add app/llm/structured.py tests/test_llm_structured.py
git commit -m "feat(llm): add chat_structured single call entry point"
```

---

## Task 3: Refactor `generate_claim_graph` onto `chat_structured`

**Files:**
- Modify: `backend/app/services/graph_service.py:8,86-102`
- Modify: `backend/tests/test_services.py:15-38,109-134`
- Modify: `backend/tests/test_text_cleanup.py:8-29,83-86`
- Modify: `backend/tests/test_logging.py:103-134`

**Interfaces:**
- Consumes: `chat_structured(system, messages, response_model, **kwargs)` from Task 2.
- Produces: `generate_claim_graph(documents) -> GraphPayload` with identical behavior (message shape, document_id validation, normalization, logging). No longer imports `create_client`.

- [ ] **Step 1: Write the failing test**

Rewrite the client-stub helpers in `backend/tests/test_services.py` so tests patch `chat_structured` instead of `create_client`. Replace lines 15-38 (`_FakeCompletions`, `_FakeChat`, `_FakeClient`, `_stub_client`) with:

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_services.py::test_generate_claim_graph_serializes_documents_as_json tests/test_services.py::test_generate_claim_graph_raises_when_document_id_missing_from_nodes -q`
Expected: FAIL with `AttributeError: module 'app.services.graph_service' has no attribute 'chat_structured'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/services/graph_service.py`, change line 8:

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

- [ ] **Step 4: Migrate the remaining test seams**

In `backend/tests/test_text_cleanup.py`, replace the `_FakeCompletions`/`_FakeChat`/`_FakeClient` classes and `_stub_client` helper (lines 8-29) with:

```python
class _FakeStructured:
    def __init__(self, payload):
        self.payload = payload

    def __call__(self, **kwargs):
        return self.payload


def _stub_chat(monkeypatch, payload):
    fake = _FakeStructured(payload)
    monkeypatch.setattr(graph_service, "chat_structured", fake)
    return fake
```

Change `test_generate_claim_graph_normalizes_llm_output` (line 84) from `_stub_client(monkeypatch, _dirty_payload())` to `_stub_chat(monkeypatch, _dirty_payload())`.

In `backend/tests/test_logging.py`, remove the `_FakeCompletions`/`_FakeChat`/`_FakeClient` classes (lines 103-119) and replace `test_graph_service_logs_llm_call` (lines 121-134) with:

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

- [ ] **Step 5: Run the full affected tests to verify they pass**

Run: `pytest tests/test_services.py tests/test_logging.py tests/test_text_cleanup.py tests/test_api.py tests/test_workspace_graph_db.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/graph_service.py tests/test_services.py tests/test_text_cleanup.py tests/test_logging.py
git commit -m "refactor(graph): call chat_structured instead of raw provider client"
```

---

## Task 4: Extract React Flow mapping to `app/services/reactflow.py`

**Files:**
- Create: `backend/app/services/reactflow.py`
- Modify: `backend/app/services/graph_service.py:14-68`
- Modify: `backend/app/services/workspace_service.py:32`
- Modify: `backend/tests/test_services.py:9`

**Interfaces:**
- Consumes: existing `app.schemas.reactflow`, `app.enums.node.EdgeRelation`.
- Produces: `app.services.reactflow.to_react_flow_nodes(nodes)`, `to_react_flow_edges(edges)`, plus module-level `EDGE_STYLE`, `EDGE_ANIMATED`. After this task `graph_service` no longer defines them.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_services.py`, change line 9 from

```python
from backend.app.services.graph_service import generate_claim_graph, to_react_flow_edges, to_react_flow_nodes
```

to

```python
from app.services.reactflow import to_react_flow_edges, to_react_flow_nodes
from app.services.graph_service import generate_claim_graph
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
- Remove the now-unused imports. After Task 3 the imports are:

```python
from app.llm.structured import chat_structured
from app.core.settings import settings
from app.schemas.graph import GraphPayload
from app.schemas.node import GraphNode, GraphEdge
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.schemas.reactflow import ReactFlowNode, ReactFlowEdge, ReactFlowStyle
from app.enums.node import EdgeRelation
from app.core.exceptions import InvalidLLMResponseError
from app.services.text_cleanup import normalize_graph_payload
from typing import List
import json
import logging
import time
```

Keep only:

```python
from app.llm.structured import chat_structured
from app.core.settings import settings
from app.schemas.graph import GraphPayload
from app.prompts.claim_graph import SYSTEM_PROMPT
from app.core.exceptions import InvalidLLMResponseError
from app.services.text_cleanup import normalize_graph_payload
import json
import logging
import time
```

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

## Task 5: Delete `app/services/ai_factory.py`

**Files:**
- Delete: `backend/app/services/ai_factory.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: no module at this path. `graph_service` (Task 3) imports `chat_structured`; `tests/test_logging.py` (Task 1) imports `client_factory`. No remaining importer of `app.services.ai_factory`.

- [ ] **Step 1: Verify no remaining importers**

Run: `rg -n "ai_factory" app tests`
Expected: no matches.

- [ ] **Step 2: Delete the file**

```bash
git rm app/services/ai_factory.py
```

- [ ] **Step 3: Run the full suite**

Run: `pytest tests -q`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/services/ai_factory.py
git commit -m "refactor(llm): delete ai_factory re-export shim, app/llm owns the client"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full suite once more**

Run: `pytest tests -q`
Expected: all pass.

- [ ] **Step 2: Confirm the final layout**

- `app/llm/__init__.py`, `app/llm/client_factory.py` (`get_client`), `app/llm/structured.py` (`chat_structured`).
- `app/services/graph_service.py` — extraction only; imports `chat_structured`, no React types.
- `app/services/reactflow.py` — `to_react_flow_nodes`, `to_react_flow_edges`, `EDGE_STYLE`, `EDGE_ANIMATED`.
- `app/services/ai_factory.py` — deleted.
