# Agent Architecture (Karl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **ClaimGraph Assistant** chat agent to the FastAPI backend — a read-only, per-workspace LangGraph agent with a **router + per-intent branches** topology that streams answers over SSE.

**Architecture:** A `StateGraph` with seven nodes and one shared tool node: `load_graph` (DB read, NO LLM — builds a condensed `graph_preview` into state) → `router` (one `chat_structured` call returns `AgentDecision{intent, reason}`) → a dedicated branch agent node per intent (`orientation | explain | verify | critique | lookup`), each with its own system prompt and **tool subset**, looping through ONE shared `ToolNode` when a branch needs follow-up lookups. `app/agents/graph.py::run_agent` maps `astream_events(version="v2")` to typed ClaimGraph SSE events (adds an `intent` event). The extraction pipeline is untouched.

**Tech Stack:** Python 3 (FastAPI, SQLAlchemy/SQLite), LangGraph + langchain-openai (agent), Instructor + OpenAI-compatible SDK (router decision + extraction via `app/llm/`), Pydantic v2, pytest. Frontend deferred.

**Spec:** `docs/superpowers/specs/2026-08-19-agent-architecture-karl-design.md`

## Global Constraints

- **New runtime dependencies (agent only):** `langgraph`, `langchain-openai`. `langchain-google-genai` is intentionally NOT installed — the current codebase is OpenAI-compatible-only (`app/llm/client_factory.py` has no google branch).
- **Provider knowledge stays below `app/llm/` (router + extraction) and `app/agents/graph.py` (branch models).** `router.py` goes through `chat_structured`, never the provider SDK.
- **Never log secrets** — the LLM API key must never be logged.
- **No behavior change to graph extraction or quote validation.** `app/services/*` and `app/llm/*` are read-only consumers except `requirements.txt`.
- **Agent stays in Python** on the backend.
- **Read-only v1**: no edit/recompile tools, no human-in-the-loop branch.
- **Tests run from `backend/`:** `pytest tests/<file>.py -q`. `conftest.py` seeds `LLM_API_KEY=test-key` and routes `LOCALAPPDATA` to a temp dir before any `app.*` import. `torch.compile` is stubbed in conftest — do NOT change it.
- **Docs are gitignored** (`/docs/` in `.gitignore`); use `git add -f` for plan/spec files.
- **Do not revert uncommitted working-tree changes** in `backend/app/llm/` or `frontend/`.

---

## Build Order / Timeline

| Phase | Tasks | What you get | Why this order |
|-------|-------|--------------|----------------|
| 1. Events | Task 1 | `app/agents/events.py` (leaf dataclasses) | No dependencies; everything else serializes through it |
| 2. State | Task 2 | `app/agents/state.py` (intents, state, preview builder) | Pure functions; router/branches reference them |
| 3. Tools | Task 3 | `app/agents/tools.py` (3 read tools + chunk cache) | Branches dispatch to these |
| 4. Prompts + Router | Task 4 | `app/agents/prompts.py` + `app/agents/router.py` | `graph.py`'s router node calls `classify_intent` |
| 5. Agent graph | Task 5 | `app/agents/graph.py` + deps install | The actor; consumes 1–4 |
| 6. API | Task 6 | SSE chat route | Makes the agent callable end-to-end |

Work top to bottom. Each task ends green and committed.

---

### Task 1: Agent stream events (`app/agents/events.py`)

**Files:**
- Create: `backend/app/agents/__init__.py` (empty)
- Create: `backend/app/agents/events.py`
- Create: `backend/tests/test_agent_events.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `TextDeltaEvent`, `ToolCallEvent`, `ToolResultEvent`, `IntentEvent`, `ErrorEvent`, `DoneEvent` (dataclasses each with a `type` literal), the `AgentStreamEvent` union, and `event_to_dict(event) -> dict`. Used by Task 5 (`run_agent`) and Task 6 (route) to serialize SSE.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_events.py`:

```python
from app.agents.events import (
    DoneEvent,
    ErrorEvent,
    IntentEvent,
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
    assert call["type"] == "tool_call"
    assert call["arguments"] == {"x": 1}
    assert result["type"] == "tool_result"
    assert result["output"] == "ok"


def test_intent_event_serializes():
    e = event_to_dict(IntentEvent(intent="verify", reason="user asked to check quotes"))
    assert e == {"type": "intent", "intent": "verify", "reason": "user asked to check quotes"}


def test_error_and_done_serialize():
    err = event_to_dict(ErrorEvent(message="boom"))
    done = event_to_dict(DoneEvent())
    assert err == {"type": "error", "message": "boom"}
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
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Literal


@dataclass
class TextDeltaEvent:
    type: Literal["text_delta"] = "text_delta"
    delta: str = ""


@dataclass
class ToolCallEvent:
    type: Literal["tool_call"] = "tool_call"
    name: str = ""
    arguments: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResultEvent:
    type: Literal["tool_result"] = "tool_result"
    name: str = ""
    output: str = ""


@dataclass
class IntentEvent:
    type: Literal["intent"] = "intent"
    intent: str = ""
    reason: str = ""


@dataclass
class ErrorEvent:
    type: Literal["error"] = "error"
    message: str = ""


@dataclass
class DoneEvent:
    type: Literal["done"] = "done"


AgentStreamEvent = (
    TextDeltaEvent | ToolCallEvent | ToolResultEvent | IntentEvent | ErrorEvent | DoneEvent
)


def event_to_dict(event: AgentStreamEvent) -> Dict[str, Any]:
    """Serialize an event for the SSE payload, including its ``type`` field."""
    data = asdict(event)
    data["type"] = event.type
    return data
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agent_events.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents tests/test_agent_events.py
git commit -m "feat(agents): add typed SSE stream events including intent"
```

---

### Task 2: Agent state and graph preview (`app/agents/state.py`)

**Files:**
- Create: `backend/app/agents/state.py`
- Create: `backend/tests/test_agent_state.py`

**Interfaces:**
- Consumes: `app.enums.node.NodeCategory`/`EdgeRelation` (via `GraphPayload`), `app.schemas.graph.GraphPayload`.
- Produces:
  - `AgentIntent` — `str`-enum: `ORIENTATION`, `EXPLAIN`, `VERIFY`, `CRITIQUE`, `LOOKUP`.
  - `AgentState` — `TypedDict(total=False)` with keys `messages`, `graph_preview`, `intent`, `routing_reason`, `active_node_id`, `system_inject`.
  - `build_graph_preview(payload: GraphPayload) -> dict`.
  Used by Task 4 (`AgentDecision.intent`) and Tasks 5/6 (state).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_state.py`:

```python
from app.agents.state import AgentIntent, build_graph_preview
from tests.helpers import make_fake_payload


def test_agent_intent_values():
    assert [i.value for i in AgentIntent] == [
        "orientation",
        "explain",
        "verify",
        "critique",
        "lookup",
    ]


def test_build_graph_preview_condenses_payload():
    preview = build_graph_preview(make_fake_payload())

    assert preview["condensed_quotes"] is True
    assert preview["documents"][0]["title"] == "Fake Paper"
    assert preview["documents"][0]["executive_summary"]

    node = preview["nodes"][0]
    assert node["id"] == "claim-1"
    assert node["document_id"] == "0"
    assert node["node_category"] == "claim"
    assert "quote" not in node

    edge = preview["edges"][0]
    assert edge["relation"] == "supports"
    assert edge["reasoning"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent_state.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.state'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/agents/state.py`:

```python
"""Agent intents, the LangGraph state schema, and the condensed graph preview.

The preview is the single source of graph context inside the agent: documents'
executive summaries plus each node's id/category/title/summary and each edge's
relation/reasoning. Verbatim quotes are deliberately omitted and fetched on
demand via the ``get_node_detail`` tool.
"""
from enum import Enum
from typing import Any, Dict, List, TypedDict

from app.schemas.graph import GraphPayload


class AgentIntent(str, Enum):
    ORIENTATION = "orientation"
    EXPLAIN = "explain"
    VERIFY = "verify"
    CRITIQUE = "critique"
    LOOKUP = "lookup"


class AgentState(TypedDict, total=False):
    messages: List[Any]
    graph_preview: Dict[str, Any]
    intent: AgentIntent
    routing_reason: str
    active_node_id: str
    system_inject: str


def build_graph_preview(payload: GraphPayload) -> Dict[str, Any]:
    """Return a condensed, quote-free view of ``payload`` for agent context."""
    return {
        "documents": [
            {
                "id": analysis.metadata.id,
                "title": analysis.metadata.title,
                "executive_summary": analysis.executive_summary,
            }
            for analysis in payload.documents
        ],
        "nodes": [
            {
                "id": node.id,
                "document_id": node.document_id,
                "node_category": node.node_category.value,
                "title": node.title,
                "summary": node.summary,
            }
            for node in payload.nodes
        ],
        "edges": [
            {
                "source": edge.source,
                "target": edge.target,
                "relation": edge.relation.value,
                "reasoning": edge.reasoning,
            }
            for edge in payload.edges
        ],
        "condensed_quotes": True,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agent_state.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents/state.py tests/test_agent_state.py
git commit -m "feat(agents): add agent intents, state schema, and graph preview builder"
```

---

### Task 3: Agent tools (`app/agents/tools.py`)

**Files:**
- Create: `backend/app/agents/tools.py`
- Create: `backend/tests/test_agent_tools.py`

**Interfaces:**
- Consumes: `app.db.crud.workspace`, `app.db.models.Workspace/Document`, `app.core.exceptions.WorkspaceNotFoundError`, `app.schemas.graph.GraphPayload`, `app.services.parsers.parse_and_chunk_document`/`parse_document_to_markdown`, `app.services.workspace_service.validate_document_quotes`.
- Produces:
  - `build_tools(db: Session, workspace_id: str) -> dict[str, StructuredTool]` with exactly the keys `search_documents`, `get_node_detail`, `verify_graph`.
  - `clear_chunk_cache()` — test/seam hook for the internal chunk cache.
  Used by Task 5 (`build_agent` tool subsets + `ToolNode`) and Task 6 (route).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_tools.py`:

```python
import asyncio
import json

from app.agents.tools import build_tools, clear_chunk_cache
from app.db.database import SessionLocal
from app.db.models import Document, Workspace
from app.enums.workspace import WorkspaceStatus
from tests.helpers import (
    make_fake_payload,
    make_fake_payload_with_invalid_quote,
)

TOOL_NAMES = {"search_documents", "get_node_detail", "verify_graph"}


def _run(coro):
    return asyncio.run(coro)


def _workspace(db, payload=None):
    ws = Workspace(
        name="ws",
        description="desc",
        status=WorkspaceStatus.READY,
        graph_payload=(payload or make_fake_payload()).model_dump(mode="json"),
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


def test_build_tools_returns_three_read_tools():
    tools = build_tools(db=None, workspace_id="ws")
    assert set(tools.keys()) == TOOL_NAMES


def test_search_documents_finds_verbatim_chunk(fake_pdf):
    db = SessionLocal()
    try:
        ws = _workspace(db)
        doc = Document(
            id="doc-1",
            workspace_id=ws.id,
            filename=fake_pdf.name,
            file_path=str(fake_pdf),
        )
        db.add(doc)
        db.commit()

        clear_chunk_cache()
        tools = build_tools(db, ws.id)
        out = json.loads(_run(tools["search_documents"].ainvoke(
            {"query": "sparse quantization"}
        )))
        assert out["document_id"] == "doc-1"
        assert any(
            "sparse quantization" in m["text"].casefold() for m in out["matches"]
        )
    finally:
        db.close()
        clear_chunk_cache()


def test_get_node_detail_includes_neighbors():
    db = SessionLocal()
    try:
        ws = _workspace(db)
        tools = build_tools(db, ws.id)
        out = json.loads(_run(tools["get_node_detail"].ainvoke(
            {"node_id": "evidence-1"}
        )))
        assert out["node"]["id"] == "evidence-1"
        assert out["node"]["node_category"] == "evidence"
        assert out["node"]["quote"]
        edges = out["edges"]
        assert any(
            e["relation"] == "supports" and e["other"]["id"] == "claim-1"
            for e in edges
        )
    finally:
        db.close()


def test_get_node_detail_missing_node_is_error():
    db = SessionLocal()
    try:
        ws = _workspace(db)
        tools = build_tools(db, ws.id)
        out = _run(tools["get_node_detail"].ainvoke({"node_id": "nope"}))
        assert "not found" in out
    finally:
        db.close()


def test_verify_graph_flags_non_verbatim_quote(fake_pdf):
    db = SessionLocal()
    try:
        ws = _workspace(db, make_fake_payload_with_invalid_quote())
        doc = Document(
            id="doc-1",
            workspace_id=ws.id,
            filename=fake_pdf.name,
            file_path=str(fake_pdf),
        )
        db.add(doc)
        db.commit()

        tools = build_tools(db, ws.id)
        out = json.loads(_run(tools["verify_graph"].ainvoke({})))
        assert out["unverified"] == ["evidence-bad"]
        assert out["verified"] == 1
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent_tools.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.tools'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/agents/tools.py`:

```python
"""Read-only agent tools bound to a workspace, built for LangGraph's ToolNode.

Tools are closure-bound to the request's db session and workspace id so the LLM
never sees or supplies either. ``build_tools`` returns a dict keyed by tool name
so ``app/agents/graph.py`` can bind per-branch tool subsets.
"""
from typing import Dict, List, Optional, Tuple

import json
import logging

from langchain_core.tools import StructuredTool
from sqlalchemy.orm import Session

from app.core.exceptions import WorkspaceNotFoundError
from app.db.crud import workspace as workspace_crud
from app.db.models import Document
from app.schemas.graph import GraphPayload
from app.services.parsers import parse_and_chunk_document, parse_document_to_markdown
from app.services.workspace_service import validate_document_quotes

logger = logging.getLogger(__name__)

MAX_MATCHES = 5

# (workspace_id, document_id) -> list of chunk texts. Populated lazily by
# search_documents; the agent is read-only, so nothing in v1 can invalidate it.
_CHUNK_CACHE: Dict[Tuple[str, str], List[str]] = {}


def clear_chunk_cache() -> None:
    """Drop all cached chunk texts (used by tests)."""
    _CHUNK_CACHE.clear()


def _chunk_texts(db: Session, workspace_id: str, document_id: str) -> List[str]:
    key = (workspace_id, document_id)
    if key not in _CHUNK_CACHE:
        doc = (
            db.query(Document)
            .filter(Document.id == document_id, Document.workspace_id == workspace_id)
            .first()
        )
        if doc is None:
            return []
        chunks = parse_and_chunk_document(doc.file_path)
        _CHUNK_CACHE[key] = [getattr(c, "text", str(c)) for c in chunks]
    return _CHUNK_CACHE[key]


def _rank_chunks(chunks: List[str], query: str) -> List[str]:
    """Chunks that contain any query term, ranked by number of terms hit."""
    terms = [t for t in query.casefold().split() if t]
    scored = []
    for chunk in chunks:
        folded = chunk.casefold()
        hits = sum(1 for term in terms if term in folded)
        if hits:
            scored.append((hits, chunk))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scored[:MAX_MATCHES]]


def build_tools(db: Session, workspace_id: str) -> Dict[str, StructuredTool]:
    async def search_documents_tool(query: str, document_id: Optional[str] = None) -> str:
        workspace = workspace_crud.get_workspace(db, workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError()

        if document_id is not None:
            docs = [d for d in workspace.documents if d.id == document_id]
        else:
            docs = list(workspace.documents)

        matches: List[Dict] = []
        for doc in docs:
            chunks = _chunk_texts(db, workspace_id, doc.id)
            for chunk in _rank_chunks(chunks, query):
                matches.append(
                    {"document_id": doc.id, "filename": doc.filename, "text": chunk}
                )
            if len(matches) >= MAX_MATCHES:
                break

        return json.dumps(
            {"query": query, "document_id": document_id, "matches": matches[:MAX_MATCHES]},
            ensure_ascii=False,
        )

    async def get_node_detail_tool(node_id: str) -> str:
        workspace = workspace_crud.get_workspace(db, workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError()
        payload = GraphPayload.model_validate(workspace.graph_payload)

        node = next((n for n in payload.nodes if n.id == node_id), None)
        if node is None:
            return f"Node {node_id} not found in this workspace's graph."

        filename = next(
            (d.filename for d in workspace.documents if d.id == node.document_id),
            None,
        )
        by_id = {n.id: n for n in payload.nodes}
        edges = []
        for e in payload.edges:
            if e.source == node_id:
                direction, other_id = "source", e.target
            elif e.target == node_id:
                direction, other_id = "target", e.source
            else:
                continue
            other = by_id.get(other_id)
            if other is None:
                continue
            edges.append({
                "id": e.id,
                "relation": e.relation.value,
                "reasoning": e.reasoning,
                "direction": direction,
                "other": {
                    "id": other.id,
                    "title": other.title,
                    "node_category": other.node_category.value,
                },
            })
        return json.dumps(
            {
                "node": node.model_dump(mode="json"),
                "edges": edges,
                "document_filename": filename,
            },
            ensure_ascii=False,
        )

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

    return {
        "search_documents": StructuredTool.from_function(
            coroutine=search_documents_tool,
            name="search_documents",
            description=(
                "Search a source document's semantic chunks for verbatim text. Provide "
                "the query and optionally a document_id. Returns up to 5 matching chunks "
                "with the document id and filename. Use this to quote the original wording."
            ),
        ),
        "get_node_detail": StructuredTool.from_function(
            coroutine=get_node_detail_tool,
            name="get_node_detail",
            description=(
                "Return one graph node's full record (verbatim quote, summary, confidence, "
                "category, document id) plus every edge connected to it and its neighborhood. "
                "Use this to reason about a specific claim and its relationships."
            ),
        ),
        "verify_graph": StructuredTool.from_function(
            coroutine=verify_graph_tool,
            name="verify_graph",
            description=(
                "Deterministically re-check that every node's quote appears verbatim in its "
                "source document. Returns checked/verified counts and the node ids whose "
                "quotes could not be found. No LLM cost."
            ),
        ),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agent_tools.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents/tools.py tests/test_agent_tools.py
git commit -m "feat(agents): add three read-only tools with chunk cache"
```

---

### Task 4: Prompts and router (`app/agents/prompts.py`, `app/agents/router.py`)

**Files:**
- Create: `backend/app/agents/prompts.py`
- Create: `backend/app/agents/router.py`
- Create: `backend/tests/test_agent_router.py`

**Interfaces:**
- Consumes: `app.llm.structured.chat_structured`, `app.agents.state.AgentIntent`.
- Produces:
  - `ROUTER_PROMPT: str`.
  - `AgentDecision(BaseModel)` — `intent: AgentIntent`, `reason: str = ""`.
  - `classify_intent(user_message: str, active_node_id: str | None = None) -> AgentDecision` — never raises; falls back to `AgentDecision(intent=AgentIntent.EXPLAIN, reason="router failure")`.
  - `build_system_prompt(intent, reason, graph_preview, active_node_id) -> str` — combined system prompt used by Task 5's router node.
  Used by Task 5 (`router` node + `system_inject`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_router.py`:

```python
from app.agents import router
from app.agents.router import AgentDecision, classify_intent
from app.agents.state import AgentIntent


def _fake_decision(monkeypatch, decision):
    monkeypatch.setattr(router, "chat_structured", lambda **kwargs: decision)


def test_classify_intent_returns_decision(monkeypatch):
    _fake_decision(
        monkeypatch,
        AgentDecision(intent=AgentIntent.VERIFY, reason="user asked to check quotes"),
    )
    decision = classify_intent("are all quotes verified?")
    assert decision.intent == AgentIntent.VERIFY
    assert decision.reason == "user asked to check quotes"


def test_classify_falls_back_to_explain_on_error(monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(router, "chat_structured", boom)
    decision = classify_intent("hello")
    assert decision.intent == AgentIntent.EXPLAIN
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent_router.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.router'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/agents/prompts.py`:

```python
"""System prompts for the agent: router classification and per-intent branches."""
import json
from typing import Any, Dict, Optional

from app.agents.state import AgentIntent

ASSISTANT_PREAMBLE = (
    "You are the ClaimGraph Assistant, a read-only helper for a workspace of technical "
    "papers. A pipeline has extracted an argumentation graph: nodes are claims, evidence, "
    "methodology, limitations, risks, and consequences; edges are supports/limits/causes/"
    "challenges; every node carries a verbatim quote from its source document.\n\n"
    "Only use information available in your context and tool results. NEVER invent quotes, "
    "node ids, document ids, or numbers. Prefer the graph preview for structure, and call "
    "tools for verbatim text and specifics. Keep answers concise and grounded. When tool "
    "output lacks what you need, say so explicitly."
)

INTENT_RULES: Dict[str, str] = {
    AgentIntent.ORIENTATION: (
        "Goal: give a concise overview of this workspace and its papers. Use the document "
        "executive summaries and node titles in the graph preview. Do not call tools."
    ),
    AgentIntent.EXPLAIN: (
        "Goal: explain a claim, node, or relationship. Start from the graph preview. If the "
        "user asks about a specific node, prefer the active node. Call get_node_detail to "
        "fetch the verbatim quote and neighborhood, and search_documents for surrounding "
        "original text. Answer in plain English and cite what you actually saw."
    ),
    AgentIntent.VERIFY: (
        "Goal: report the quote-integrity status of the graph. Call verify_graph once and "
        "summarize its output: how many nodes verified, which node ids could not be "
        "verified, and why. Do not speculate beyond the tool output."
    ),
    AgentIntent.CRITIQUE: (
        "Goal: critically analyze the graph. Use the preview, verify_graph for integrity, "
        "and get_node_detail/search_documents to dig into specific claims. Surface "
        "contradictions (challenges edges), unsupported or unverified claims, and the "
        "risk/consequence structure. Be explicit about what is grounded in the graph "
        "versus inferred."
    ),
    AgentIntent.LOOKUP: (
        "Goal: find verbatim text in the source documents. Call search_documents with the "
        "user's topic (and a document id when known), then quote the matching chunks "
        "exactly with their document/filename. If nothing matches, say no verbatim text "
        "was found."
    ),
}

ROUTER_PROMPT = """You are the router for the ClaimGraph Assistant. Given the user's message and the active node, return a strict JSON object with exactly two fields:
- "intent": one of "orientation", "explain", "verify", "critique", "lookup"
- "reason": a one-line plain-English reason for that choice

Rules:
- The user asks for an overview, summary, "what does this paper do" -> orientation
- The user asks about a specific claim, node, why A relates to B, or a general question about the graph -> explain
- The user asks about quotes being accurate, verified, sourced, or fabricated -> verify
- The user asks for weaknesses, problems, contradictions, unsupported claims, risks, or a critical review -> critique
- The user asks what a document literally says, to quote the paper, or to find exact wording -> lookup
"""


def build_system_prompt(
    intent: AgentIntent,
    reason: str,
    graph_preview: Optional[Dict[str, Any]],
    active_node_id: Optional[str],
) -> str:
    """Compose the single system message seen by the chosen branch's model."""
    parts = [ASSISTANT_PREAMBLE, INTENT_RULES[intent]]
    if reason:
        parts.append(f"Routing decision from the classifier: {reason}")
    if active_node_id:
        parts.append(f"The user is asking about the active node id: {active_node_id}")
    if graph_preview is not None:
        parts.append("Workspace graph (condensed; quotes available via tools):")
        parts.append(json.dumps(graph_preview, ensure_ascii=False))
    return "\n\n".join(parts)
```

`backend/app/agents/router.py`:

```python
"""Intent classification for the agent's router node.

Goes through :func:`app.llm.structured.chat_structured` so provider knowledge
stays in ``app/llm``. Never raises: any failure degrades to the ``explain``
branch so the chat still answers.
"""
import logging

from pydantic import BaseModel

from app.agents.prompts import ROUTER_PROMPT
from app.agents.state import AgentIntent
from app.llm.structured import chat_structured

logger = logging.getLogger(__name__)


class AgentDecision(BaseModel):
    intent: AgentIntent
    reason: str = ""


def classify_intent(user_message: str, active_node_id: str | None = None) -> AgentDecision:
    """Classify ``user_message`` into an intent; never raises."""
    content = user_message
    if active_node_id:
        content = f"[active node {active_node_id}] {content}"
    try:
        decision = chat_structured(
            system=ROUTER_PROMPT,
            messages=[{"role": "user", "content": content}],
            response_model=AgentDecision,
        )
        if isinstance(decision, AgentDecision) and decision.intent in AgentIntent:
            return decision
        raise ValueError(f"unexpected router result: {decision!r}")
    except Exception as exc:
        logger.warning("router classify_intent failed, falling back to explain: %s", exc)
        return AgentDecision(intent=AgentIntent.EXPLAIN, reason="router failure")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agent_router.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/agents/prompts.py app/agents/router.py tests/test_agent_router.py
git commit -m "feat(agents): add intent router with explain fallback and branch prompts"
```

---

### Task 5: LangGraph agent (`app/agents/graph.py`)

**Files:**
- Create: `backend/app/agents/graph.py`
- Create: `backend/tests/test_agent_graph.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: `app.agents.events` (all), `app.agents.state.AgentState/AgentIntent`, `app.agents.prompts.build_system_prompt/ROUTER_PROMPT` (via `router.py`), `app.agents.router.classify_intent`, `app.agents.tools.build_tools`, `app.llm.client_factory.DEFAULT_MODEL`, `app.core.settings.settings`, `app.db.crud.workspace`, `app.schemas.graph.GraphPayload`, `app.core.exceptions.WorkspaceNotFoundError`, `langgraph`, `langchain_openai`.
- Produces:
  - `TOOL_SUBSETS: dict[AgentIntent, list[str]]` — per-branch tool names.
  - `RECURSION_LIMIT = 10`.
  - `build_model() -> BaseChatModel` — `ChatOpenAI` (OpenAI-compatible base_url).
  - `build_agent(tools: dict[str, StructuredTool], *, db: Session, workspace_id: str, model: BaseChatModel | None = None) -> CompiledStateGraph` — `load_graph -> router -> {branch}`, each branch ⇄ shared `tools` node.
  - `run_agent(agent, state: AgentState) -> AsyncGenerator[AgentStreamEvent, None]` — maps `astream_events(version="v2")`, always ends `DoneEvent`.
  Used by Task 6 (route).

- [ ] **Step 1: Install the new dependencies**

Run (from `backend/`, venv active):

```bash
python -m pip install langgraph langchain-openai
```

Add to `backend/requirements.txt` (use the exact versions pip installed, matching the file's pinned style):

```
langchain-openai==<installed version>
langgraph==<installed version>
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_agent_graph.py`:

```python
import asyncio
import json

from app.agents import graph
from app.agents.events import DoneEvent, ErrorEvent, IntentEvent, TextDeltaEvent
from app.agents.graph import RECURSION_LIMIT, TOOL_SUBSETS, build_agent, build_model, run_agent
from app.agents.router import AgentDecision
from app.agents.state import AgentIntent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import StructuredTool


def _run(coro):
    return asyncio.run(coro)


def _state(**overrides):
    state = {
        "messages": [HumanMessage(content="hi")],
        "graph_preview": {"condensed_quotes": True, "documents": [], "nodes": [], "edges": []},
    }
    state.update(overrides)
    return state


class _EventsAgent:
    """Fake agent yielding scripted astream_events."""

    def __init__(self, agent_events):
        self.agent_events = agent_events

    async def astream_events(self, input, **kwargs):
        for event in self.agent_events:
            yield event


class _Chunk:
    def __init__(self, content):
        self.content = content


class _ScriptedModel:
    """Minimal fake chat model: emits scripted tool calls, then a final answer."""

    def __init__(self, tool_calls, final_answer):
        self._tool_calls = list(tool_calls)
        self._final_answer = final_answer
        self.bindings = []

    def bind_tools(self, tools):
        self.bindings.append([t.name for t in tools])
        return self

    def invoke(self, messages):
        if self._tool_calls:
            name, args = self._tool_calls.pop(0)
            return AIMessage(
                content="",
                tool_calls=[{"name": name, "args": args, "id": "call-0"}],
            )
        return AIMessage(content=self._final_answer)


def test_build_model_uses_configured_model():
    model = build_model()
    from app.llm.client_factory import DEFAULT_MODEL

    assert model.model_name == DEFAULT_MODEL


def test_per_branch_tool_subsets():
    model = _ScriptedModel([], "answer")
    build_agent({}, db=None, workspace_id="ws", model=model)
    by_intent = {intent.value: set(names) for intent, names in TOOL_SUBSETS.items()}
    assert by_intent["orientation"] == set()
    assert by_intent["verify"] == {"verify_graph"}
    assert by_intent["lookup"] == {"search_documents"}
    assert by_intent["explain"] == {"get_node_detail", "search_documents"}
    assert by_intent["critique"] == {"verify_graph", "get_node_detail", "search_documents"}


def test_run_agent_maps_events():
    fake = _EventsAgent([
        {"event": "on_custom_event", "data": {
            "chunk": {"intent": "verify", "reason": "asked to check"}}},
        {"event": "on_chat_model_stream", "data": {"chunk": _Chunk("hello")}},
        {"event": "on_tool_start", "name": "verify_graph", "data": {"input": {}}},
        {"event": "on_tool_end", "name": "verify_graph", "data": {"output": "ok"}},
        {"event": "on_chat_model_stream", "data": {"chunk": _Chunk(" world")}},
    ])
    events = [e for e in _run(run_agent(fake, _state()))]
    assert [e.type for e in events] == ["intent", "text_delta", "tool_call", "tool_result", "text_delta", "done"]
    assert events[0].intent == "verify"
    assert events[2].name == "verify_graph"
    assert events[3].output == "ok"


def test_run_agent_maps_errors():
    fake = _EventsAgent([
        {"event": "on_chain_error", "data": {"error": "boom"}},
    ])
    events = [e for e in _run(run_agent(fake, _state()))]
    assert any(isinstance(e, ErrorEvent) for e in events)
    assert events[-1].type == "done"


async def _echo_tool(text: str) -> str:
    return f"echo:{text}"


def test_agent_end_to_end_router_branch_tool_answer(monkeypatch):
    monkeypatch.setattr(
        graph,
        "classify_intent",
        lambda *a, **k: AgentDecision(intent=AgentIntent.EXPLAIN, reason="test"),
    )
    tools = {
        "get_node_detail": StructuredTool.from_function(
            coroutine=_echo_tool, name="get_node_detail", description="d"
        ),
        "search_documents": StructuredTool.from_function(
            coroutine=_echo_tool, name="search_documents", description="d"
        ),
        "verify_graph": StructuredTool.from_function(
            coroutine=_echo_tool, name="verify_graph", description="d"
        ),
    }
    agent = build_agent(
        tools,
        db=None,
        workspace_id="ws",
        model=_ScriptedModel([("get_node_detail", {"text": "hi"})], "the final answer"),
    )
    events = [e for e in _run(run_agent(agent, _state(intent=AgentIntent.EXPLAIN)))]
    types = [e.type for e in events]
    assert "intent" in types
    assert "tool_call" in types
    assert "tool_result" in types
    assert any(e.type == "text_delta" and e.delta == "the final answer" for e in events)
    assert types[-1] == "done"
    assert RECURSION_LIMIT == 10
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_agent_graph.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.graph'`.

- [ ] **Step 4: Write minimal implementation**

`backend/app/agents/graph.py`:

```python
"""LangGraph agent construction and ClaimGraph SSE event streaming.

The graph: load_graph -> router -> per-intent branch agent node, with each
branch looping through one shared ToolNode while it requests tools. run_agent
translates astream_events into typed ClaimGraph SSE events so the HTTP route
and frontend never see LangChain types.
"""
import logging
from typing import Any, AsyncGenerator, Dict, List

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from sqlalchemy.orm import Session

from app.agents.events import (
    AgentStreamEvent,
    DoneEvent,
    ErrorEvent,
    IntentEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from app.agents.prompts import build_system_prompt
from app.agents.router import classify_intent
from app.agents.state import AgentIntent, AgentState, build_graph_preview
from app.core.exceptions import WorkspaceNotFoundError
from app.core.settings import settings
from app.db.crud import workspace as workspace_crud
from app.llm.client_factory import DEFAULT_MODEL
from app.schemas.graph import GraphPayload

logger = logging.getLogger(__name__)

RECURSION_LIMIT = 10

TOOL_SUBSETS: Dict[AgentIntent, List[str]] = {
    AgentIntent.ORIENTATION: [],
    AgentIntent.EXPLAIN: ["get_node_detail", "search_documents"],
    AgentIntent.VERIFY: ["verify_graph"],
    AgentIntent.CRITIQUE: ["verify_graph", "get_node_detail", "search_documents"],
    AgentIntent.LOOKUP: ["search_documents"],
}

INTENT_BRANCH_MAP = {intent.value: f"{intent.value}_branch" for intent in AgentIntent}


def build_model() -> BaseChatModel:
    """OpenAI-compatible chat model (matches the extraction client)."""
    return ChatOpenAI(
        model=DEFAULT_MODEL,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )


def build_agent(
    tools: Dict[str, StructuredTool],
    *,
    db: Session,
    workspace_id: str,
    model: BaseChatModel | None = None,
) -> CompiledStateGraph:
    """Compile the router + per-intent-branch agent around one shared ToolNode."""
    if model is None:
        model = build_model()
    tool_node = ToolNode(list(tools.values()))

    def load_graph_node(state: AgentState) -> Dict[str, Any]:
        if state.get("graph_preview") is not None:
            return {}
        workspace = workspace_crud.get_workspace(db, workspace_id)
        if workspace is None or workspace.graph_payload is None:
            raise WorkspaceNotFoundError()
        return {
            "graph_preview": build_graph_preview(
                GraphPayload.model_validate(workspace.graph_payload)
            )
        }

    def router_node(state: AgentState) -> Dict[str, Any]:
        last = state["messages"][-1]
        message = getattr(last, "content", "") or ""
        decision = classify_intent(message, state.get("active_node_id"))
        writer = get_stream_writer()
        writer({"intent": decision.intent.value, "reason": decision.reason})
        return {
            "intent": decision.intent,
            "routing_reason": decision.reason,
            "system_inject": build_system_prompt(
                decision.intent,
                decision.reason,
                state.get("graph_preview"),
                state.get("active_node_id"),
            ),
        }

    def after_tools(state: AgentState) -> str:
        return (state.get("intent") or AgentIntent.EXPLAIN).value + "_branch"

    def after_router(state: AgentState) -> str:
        return (state.get("intent") or AgentIntent.EXPLAIN).value

    builder = StateGraph(AgentState)
    builder.add_node("load_graph", load_graph_node)
    builder.add_node("router", router_node)
    builder.add_node("tools", tool_node)

    for intent in AgentIntent:
        subset = [tools[name] for name in TOOL_SUBSETS[intent] if name in tools]
        bound = model.bind_tools(subset)
        intent_key = intent.value

        def call_model(state: AgentState, bound=bound) -> Dict[str, Any]:
            system = SystemMessage(
                content=state.get("system_inject")
                or build_system_prompt(
                    intent,
                    state.get("routing_reason", ""),
                    state.get("graph_preview"),
                    state.get("active_node_id"),
                )
            )
            conversation = [
                m for m in state["messages"] if not isinstance(m, SystemMessage)
            ]
            return {"messages": [bound.invoke([system, *conversation])]}

        builder.add_node(f"{intent_key}_branch", call_model)
        builder.add_conditional_edges(
            f"{intent_key}_branch",
            tools_condition,
            {"tools": "tools", "__end__": END},
        )

    builder.add_edge(START, "load_graph")
    builder.add_edge("load_graph", "router")
    builder.add_conditional_edges("router", after_router, INTENT_BRANCH_MAP)
    builder.add_conditional_edges(
        "tools", after_tools, {name: name for name in INTENT_BRANCH_MAP.values()}
    )

    return builder.compile()


async def run_agent(
    agent: CompiledStateGraph,
    state: AgentState,
) -> AsyncGenerator[AgentStreamEvent, None]:
    """Map LangGraph astream_events to ClaimGraph SSE events; always ends DoneEvent."""
    try:
        async for event in agent.astream_events(
            state,
            version="v2",
            config={"recursion_limit": RECURSION_LIMIT},
        ):
            event_name = event.get("event")
            data = event.get("data", {}) if isinstance(event.get("data"), dict) else {}
            if event_name == "on_chat_model_stream":
                chunk = data.get("chunk")
                content = getattr(chunk, "content", "")
                if content:
                    yield TextDeltaEvent(delta=content)
            elif event_name == "on_custom_event":
                payload = data.get("chunk", data)
                if isinstance(payload, dict) and payload.get("intent"):
                    yield IntentEvent(
                        intent=str(payload["intent"]),
                        reason=str(payload.get("reason", "")),
                    )
            elif event_name == "on_tool_start":
                yield ToolCallEvent(
                    name=event.get("name", ""),
                    arguments=data.get("input", {}),
                )
            elif event_name == "on_tool_end":
                yield ToolResultEvent(
                    name=event.get("name", ""),
                    output=str(data.get("output", "")),
                )
            elif event_name == "on_tool_error":
                yield ToolResultEvent(
                    name=event.get("name", ""),
                    output=f"error: {data.get('error', 'tool error')}",
                )
            elif event_name == "on_chain_error":
                yield ErrorEvent(message=str(data.get("error", "chain error")))
    finally:
        yield DoneEvent()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_agent_graph.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/agents/graph.py tests/test_agent_graph.py requirements.txt
git commit -m "feat(agents): build router+branches LangGraph agent with SSE event mapping"
```

---

### Task 6: SSE chat endpoint (`app/api/routes/agents.py`)

**Files:**
- Create: `backend/app/api/routes/agents.py`
- Modify: `backend/app/api/routes/__init__.py`
- Create: `backend/tests/test_agents_chat.py`

**Interfaces:**
- Consumes: `app.agents.graph.build_agent`/`run_agent`, `app.agents.tools.build_tools`, `app.agents.state.build_graph_preview` (via `load_graph`), `app.agents.events.event_to_dict`/`DoneEvent`/`TextDeltaEvent`, `app.db.crud.workspace`, `app.core.exceptions.WorkspaceNotFoundError`, `app.db.database.get_db`, `langchain_core.messages.HumanMessage`.
- Produces: `ChatRequest { message: str, active_node_id: str | None = None }`; `POST /api/workspaces/{workspace_id}/chat` SSE stream (registered on the api_router).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agents_chat.py`:

```python
import json

from app.api.routes import agents as route_agents
from app.agents.events import DoneEvent, IntentEvent, TextDeltaEvent
from app.db.database import SessionLocal
from app.db.models import Workspace
from app.enums.workspace import WorkspaceStatus
from tests.helpers import make_fake_payload


def _seed_workspace(graph_payload: dict | None) -> str:
    db = SessionLocal()
    try:
        ws = Workspace(
            name="chat",
            description="desc",
            status=WorkspaceStatus.READY if graph_payload else WorkspaceStatus.EMPTY,
            graph_payload=graph_payload,
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)
        return ws.id
    finally:
        db.close()


def _sse_payloads(text: str):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_chat_404_for_missing_workspace(client):
    resp = client.post("/api/workspaces/no-such-id/chat", json={"message": "hi"})
    assert resp.status_code == 404


def test_chat_empty_graph_short_circuits(client):
    workspace_id = _seed_workspace(None)
    resp = client.post(f"/api/workspaces/{workspace_id}/chat", json={"message": "hi"})
    assert resp.status_code == 200
    events = _sse_payloads(resp.text)
    assert events[0]["type"] == "text_delta"
    assert "No compiled graph" in events[0]["delta"]
    assert events[-1]["type"] == "done"


def test_chat_streams_agent_events(client, monkeypatch):
    workspace_id = _seed_workspace(make_fake_payload().model_dump(mode="json"))

    async def fake_run_agent(agent, state):
        yield IntentEvent(intent="verify", reason="asked")
        yield TextDeltaEvent(delta="all quotes verified")
        yield DoneEvent()

    monkeypatch.setattr(route_agents, "run_agent", fake_run_agent)
    monkeypatch.setattr(
        route_agents, "build_agent", lambda tools, **kwargs: object()
    )

    resp = client.post(
        f"/api/workspaces/{workspace_id}/chat",
        json={"message": "are quotes verified?", "active_node_id": "claim-1"},
    )
    assert resp.status_code == 200
    events = _sse_payloads(resp.text)
    assert [e["type"] for e in events] == ["intent", "text_delta", "done"]
    assert events[0]["intent"] == "verify"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agents_chat.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.api.routes.agents'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/api/routes/agents.py`:

```python
"""ClaimGraph Assistant chat endpoint (SSE)."""
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.events import DoneEvent, TextDeltaEvent, event_to_dict
from app.agents.graph import build_agent, run_agent
from app.agents.tools import build_tools
from app.core.exceptions import WorkspaceNotFoundError
from app.db.crud import workspace as workspace_crud
from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces")


class ChatRequest(BaseModel):
    message: str
    active_node_id: str | None = None


async def _event_stream(events):
    async for event in events:
        payload = json.dumps(event_to_dict(event), ensure_ascii=False)
        yield f"data: {payload}\n\n"


@router.post("/{workspace_id}/chat")
def chat_workspace(
    workspace_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db),
):
    """Stream the assistant's reply for this workspace as SSE."""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError()

    if workspace.graph_payload is None:
        async def empty_graph():
            yield TextDeltaEvent(delta="No compiled graph yet for this workspace.")
            yield DoneEvent()

        return StreamingResponse(_event_stream(empty_graph()), media_type="text/event-stream")

    tools = build_tools(db, workspace_id)
    agent = build_agent(tools, db=db, workspace_id=workspace_id)
    state = {
        "messages": [HumanMessage(content=payload.message)],
        "active_node_id": payload.active_node_id,
    }
    return StreamingResponse(
        _event_stream(run_agent(agent, state)),
        media_type="text/event-stream",
    )
```

`backend/app/api/routes/__init__.py` — replace the whole file:

```python
from fastapi import APIRouter
from app.api.routes import workspaces
from app.api.routes import agents

api_router = APIRouter(prefix="/api")
api_router.include_router(workspaces.router)
api_router.include_router(agents.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agents_chat.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/agents.py app/api/routes/__init__.py tests/test_agents_chat.py
git commit -m "feat(agents): add SSE chat endpoint for workspace assistant"
```

---

### Task 7: Full suite verification

**Files:** none.

- [ ] **Step 1: Run the full backend suite**

Run: `pytest tests -q`
Expected: all pass (existing extraction/API suites stay green — the agent is additive).

- [ ] **Step 2: Commit**

```bash
git status
```

If the working tree is clean except for already-committed agent files, nothing else to commit. Otherwise commit any stragglers deliberately.