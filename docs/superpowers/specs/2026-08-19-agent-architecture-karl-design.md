# Agent Architecture Design (Karl's Router Design)

## Summary

Introduce the **ClaimGraph Assistant** chat agent into the FastAPI backend: a
**read-only** v1, workspace-scoped, built on **LangGraph** with a **router +
per-intent branches** topology.

A user's message is classified by the router into one of five intents —
`orientation | explain | verify | critique | lookup` — and routed to a
dedicated **agent node** (branch). Each branch has its own system prompt and a
**subset** of the shared read-only tools; branches that need follow-up lookups
loop through the shared `ToolNode`. The workspace graph is loaded **once**, up
front (no LLM), into a condensed `graph_preview` in state so branches answer
from context instead of re-pulling the graph.

State-changing work — graph editing and recompilation — is **deferred to v2**,
so v1 has no human-in-the-loop confirmation branch.

> **Supersedes:** the earlier `2026-08-19-agent-architecture-design.md`
> (single ReAct loop, six tools including `edit_workspace_graph` and
> `recompile_workspace`). That ReAct design remains useful as a reference for
> the deferred v2 pieces: `GraphMutation` / `ALLOWED_RELATIONS`,
> `apply_graph_mutation`, the SSE event types, and the `run_agent` streaming
> wrapper.

## Approach

One LangGraph `StateGraph` with seven drawn nodes and one shared tool node:

```
START
  │
  ▼
[ load_graph ]   DB read, NO LLM — fetch workspace, build condensed graph preview into state
  │
  ▼
[ router ]       ONE structured LLM call → AgentDecision { intent, reason }
  │
  ├─ orientation ─► [ orient_branch ]  (agent node, tool subset = none)
  ├─ explain    ─► [ explain_branch ]  (agent node, tool subset = get_node_detail, search_documents)
  ├─ verify     ─► [ verify_branch ]   (agent node, tool subset = verify_graph)
  ├─ critique   ─► [ critique_branch ] (agent node, tool subset = verify_graph, get_node_detail, search_documents)
  ├─ lookup     ─► [ lookup_branch ]   (agent node, tool subset = search_documents)
  └─ fallback   ─► explain_branch (router failure → degrade to explain)
                         each branch agent ⇄ [ ToolNode ]  (shared; recursion_limit ≈ 10)
  ▼
END
```

Why this shape:

- **`load_graph` before the router.** It proves the workspace/graph exists
  (empty graph → terminal reply; missing workspace → 404 from the route) and
  loads a **condensed** graph into state. Branches read from state, so context
  stays lean and there is no `get_workspace_graph` / `get_workspace_documents`
  tool.
- **Router reuses the extraction LLM layer.** It calls `chat_structured` with a
  small `AgentDecision` response model, so provider knowledge stays behind
  `app/llm/`. A bad/unclassifiable response routes to `explain` (degraded but
  functional) instead of failing the request.
- **Per-intent branches are the control you asked for.** Each branch is a
  closure over its own system prompt + `model.bind_tools(subset)`. "No tool
  call" → final answer → END; "tool call" → shared `ToolNode` → back to the
  same branch. The branch's bound model only exposes its tool subset, so e.g.
  `verify` cannot call `search_documents`.

## Scope

### New packages

```
backend/app/agents/
  __init__.py
  events.py               # AgentStreamEvent dataclasses + event_to_dict
  state.py                # AgentState TypedDict + condensed graph_preview builder
  tools.py                # build_tools(db, workspace_id) -> dict[str, StructuredTool]
  router.py               # classify_intent(messages) -> AgentDecision (chat_structured call)
  graph.py                # build_model(), build_agent(), run_agent() SSE wrapper
  prompts.py              # shared preamble + per-intent branch prompts
```

### Files modified

- `backend/app/api/routes/agents.py` -> NEW router: SSE chat endpoint,
  registered in `app/api/routes/__init__.py`.
- `backend/app/llm/structured.py` -> reuse `chat_structured` for the router
  decision (no changes required).
- `backend/app/services/parsers.py` -> expose a module-level chunk cache for
  `search_documents` (keyed `workspace_id:document_id`, invalidated on
  recompile/upload). No behavior change to existing callers.
- `backend/requirements.txt` -> add `langgraph`, `langchain-openai`,
  `langchain-google-genai` (same three as the superseded plan).
- `backend/tests/` -> new `test_agents/*` suite (below).

## Intents and branches

| Intent | Branch behavior | Tool subset |
|--------|-----------------|-------------|
| `orientation` | Summarize the workspace / paper(s) from `graph_preview` (executive summaries + node titles) | — |
| `explain` | Explain a node/claim, its quote, and its connections; centered on `active_node_id` when supplied | `get_node_detail`, `search_documents` |
| `verify` | Deterministic quote-integrity check, then LLM-summarized | `verify_graph` |
| `critique` | Reason over the graph to surface contradictions (`challenges`), unsupported claims, risks, consequences | `verify_graph`, `get_node_detail`, `search_documents` |
| `lookup` | Find verbatim text in a source document | `search_documents` |

Each branch prompt = shared assistant preamble (identity, grounding rules: never
invent quotes/node ids/document ids; keep answers concise; answer from tool
output) + intent-specific instructions.

## Tools (v1 — read-only)

1. **`search_documents(query, document_id=None)`** — *keyword-over-chunks*.
   docling-parse + `HybridChunker` the doc(s), then case-insensitive
   substring/keyword match against chunks; return up to 5 matching chunks with
   doc id/filename. Chunked text is cached per
   `(workspace_id, document_id)` so repeat lookups skip the parse. No new
   runtime dependency.
2. **`get_node_detail(node_id)`** — the node's full record (verbatim quote,
   summary, confidence, category, document_id) **plus its connected edges and
   neighbors** with relation/reasoning labels. Fills what `graph_preview`
   omits (quotes) so `explain`/`critique` can reason about relationships
   without shipping every quote up front.
3. **`verify_graph()`** — deterministic re-run of the existing
   `validate_document_quotes` against the workspace's source documents.
   Returns `checked / verified / unverified[]` + per-node
   `{node_id, title, quote}` details. No LLM cost.

`build_tools(db, workspace_id)` returns a **dict keyed by tool name** so each
branch's `bind_tools` picks its subset. Tools are closure-bound to the request's
db session + workspace id — the LLM never sees either.

## State schema

```python
class AgentState(TypedDict):
    messages: list[Any]          # LangChain messages (ReAct conversation)
    graph_preview: dict | None   # condensed graph, quotes omitted
    intent: AgentIntent | None   # "orientation" | "explain" | "verify" | "critique" | "lookup"
    routing_reason: str          # router one-liner, for UI banner + branch prompt
    active_node_id: str | None   # injected by frontend for "ask about this node"
```

`graph_preview` format:

```
{
  "documents": [{ "id", "title", "executive_summary" }],
  "nodes":     [{ "id", "document_id", "node_category", "title", "summary" }],
  "edges":     [{ "source", "target", "relation", "reasoning" }],
  "condensed_quotes": true,       # quotes available on demand via get_node_detail
}
```

## Router

- `AgentDecision = { intent: AgentIntent, reason: str }` (Pydantic model in
  `app/agents/router.py`).
- Call: `chat_structured(system=ROUTER_PROMPT, messages=[user message],
  response_model=AgentDecision)` — same `DEFAULT_MODEL` as branches.
- On any exception or unknown intent: **fall back to `explain`**, log a warn.
- Emits a new SSE `intent` event so the UI can banner e.g. *"Checking quote
  integrity…"*.

## Transport (SSE)

`POST /api/workspaces/{workspace_id}/chat` — body
`{"message": str, "active_node_id": str | null}`.

1. Route verifies the workspace (404 `WorkspaceNotFoundError` otherwise) and
   builds the starting `AgentState`.
2. `run_agent(agent, state)` maps `astream_events(version="v2")` to typed
   ClaimGraph SSE events:

   - `on_chat_model_stream` -> `text_delta` (skip empty tool-call chunks)
   - router decision -> `intent` (new)
   - `on_tool_start` / `on_tool_end` -> `tool_call` / `tool_result`
   - `on_tool_error` / `on_chain_error` -> `tool_result`(error variant) / `error`
   - always terminates with `done`

`events.py` gains `IntentEvent { intent, reason }` alongside the existing
`TextDeltaEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`, `DoneEvent`.
Frontend renders bubbles + tool-activity chips; read-only means no re-fetch
needed after tool results.

Stateless per request: no checkpointer; message history lives inside the single
LangGraph run and is discarded after.

## Error handling and observability

- **Router failure** -> fall back to `explain` branch, log warning.
- **Branch LLM failure** -> `error` event; the stream still ends with `done`.
- `ToolNode` catches tool exceptions -> returned as tool messages (also mapped
  to a `tool_result` error variant), never crashes the stream.
- **Logging** mirrors the existing `graph_service` style: per-stage INFO
  (`load_graph nodes=38 edges=41`, `router intent=verify`, `tool=… duration_ms`),
  `DEFAULT_MODEL` in entry lines. **The API key is never logged.**

## Testing

- **Router**: fake `chat_structured` returns each intent -> assert the right
  branch runs; unknown intent / exception -> `explain` fallback.
- **Branches**: scripted fake models (one tool call then a final answer); assert
  branch tool-subset isolation (e.g. `verify` cannot call `search_documents`).
- **Tools**: `search_documents` keyword matching across a real chunked
  `fake_pdf`; `get_node_detail` returns correct neighbors; `verify_graph` flags
  the non-verbatim fixture.
- **End-to-end**: scripted models drive router -> branch -> tool -> answer
  through the compiled graph; SSE route via TestClient (patch `run_agent`).
- Existing extraction tests stay green — this touches no extraction code.

## Constraints

- **New runtime dependencies (agent only):** `langgraph`, `langchain-openai`,
  `langchain-google-genai`. No other new dependencies.
- **Provider knowledge stays below `app/llm/` (router + extraction) and
  `app/agents/graph.py` (branch models).**
- **Never log secrets** — the LLM API key must never be logged.
- **No behavior change to graph extraction or quote validation.**
- **Agent stays in Python** on the backend.

## Out of scope (deferred to v2)

- `edit_workspace_graph` / `recompile_workspace` branches (+ `GraphMutation`,
  `ALLOWED_RELATIONS`, `apply_graph_mutation`, and a mutating-confirmation
  guard / human-in-the-loop). Slot in as new branches; the router and shared
  `ToolNode` need no restructuring.
- Semantic embedding search behind the same `search_documents` interface.
- Conversation persistence: a `ChatMessage` table / LangGraph checkpointer.
- Cross-workspace scope and a `status` intent.
- Frontend work beyond SSE consumption and the `intent` banner.