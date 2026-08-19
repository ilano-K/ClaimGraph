# Agent Architecture Design

## Summary

Introduce a chat agent ("ClaimGraph Assistant") into the FastAPI backend that can
answer questions about a workspace's papers, verify that claims have verbatim
sources, edit the graph canvas (persisted to the database), and trigger
recompilation. The agent loop is built on **LangGraph** (LangChain's agent
framework); the existing graph-extraction pipeline stays on Instructor with a
thin `app/llm/` service layer shared by nothing else in the agent path.

The agent stays in **Python** on the backend (its tools require docling-parsed
content, quote validation, and database persistence that already live there).
The frontend consumes an SSE stream and may use the AI SDK's `useChat` for UI
ergonomics. There is no Vercel AI SDK on the backend.

## Approach

Two integration points, chosen deliberately:

1. **Graph extraction (existing pipeline)** — refactored onto a thin
   `app/llm/` layer (`client_factory.py` cached client + `structured.py`
   `chat_structured`) using Instructor, exactly as today. This pipeline is
   stable and green; it is NOT migrated to LangChain.
2. **Agent (new)** — built on LangGraph: a `StateGraph` with an `agent` node
   (provider model `bind_tools`) and a `tools` node, connected by LangGraph's
   `tools_condition`. The framework runs the loop, dispatches tools, handles
   tool errors, and streams events via `astream_events(version="v2")`. A thin
   `run_agent` wrapper translates LangChain's event stream into typed ClaimGraph
   SSE events (`text_delta | tool_call | tool_result | error | done`), so the
   HTTP route and frontend never see LangChain types.

The graph-compile behavior must remain byte-for-byte identical after the
extraction refactor.

## Scope

### New packages

```
backend/app/llm/
  __init__.py
  client_factory.py       # cached client; openai-compatible-first
  structured.py           # chat_structured(system, messages, response_model) -> T

backend/app/agents/
  __init__.py
  events.py               # AgentStreamEvent dataclasses + event_to_dict
  tools.py                # build_tools(db, workspace_id) -> list[StructuredTool]; pure mutation logic
  graph.py                # build_model(), build_agent(tools, model=None), run_agent(agent, message)
```

### Files modified

- `backend/app/services/ai_factory.py` -> logic moves to
  `app/llm/client_factory.py` as `get_client()`. `ai_factory.py` becomes a thin
  re-export of `get_client` so existing imports keep working. Caches the client
  as a singleton; keeps the existing `openai` and `google` branches,
  openai-compatible first.
- `backend/app/services/graph_service.py` -> `generate_claim_graph` calls
  `chat_structured` instead of raw `client.chat.completions.create`. React Flow
  mapping moves out.
- `backend/app/services/reactflow.py` -> NEW: `to_react_flow_nodes` and
  `to_react_flow_edges` moved here from `graph_service`.
- `backend/app/api/routes/agents.py` -> NEW router: SSE chat endpoint.
- `backend/app/api/routes/__init__.py` -> register the new agents router.
- `backend/app/core/settings.py` -> add `llm_max_retries`, `llm_timeout`
  (optional, with defaults).
- `backend/requirements.txt` -> add `langgraph`, `langchain-openai`,
  `langchain-google-genai`.
- Tests migrate their `monkeypatch.setattr(graph_service, "create_client", ...)`
  seams to the LLM layer.

## LLM service layer (`app/llm`) — extraction only

### `client_factory.py`

- `get_client()` returns a cached, Instructor-wrapped chat client for the
  configured provider (module-level singleton, not re-created per call).
- Default provider type is "openai": `api_key` + `base_url` + `model` covers
  OpenAI, Groq, Mistral, Together, DeepSeek, OpenRouter, Ollama, Azure, and
  Gemini's OpenAI-compatible endpoint. No code change needed to add these.
- Keeps the existing `google` (native GenAI SDK) branch as an adapter escape
  hatch.
- Raises `ValueError` for an unrecognized provider (existing behavior).

### `structured.py`

Single function:

```
chat_structured(system: str, messages: list, response_model: type[T], **kwargs) -> T
```

Responsibilities:
- Build the request: system message + messages; attach `response_model`.
- Provider-specific options are forwarded via `**kwargs` (e.g. the existing
  Gemini `extra_body={"thinking": {"type": "disabled"}}` used by graph
  extraction).
- Retries and timeout using `llm_max_retries` / `llm_timeout`.
- Maps provider/schema failures to `InvalidLLMResponseError` (and timeout /
  retry-exhausted variants if needed).
- Logs entry/exit with provider, model, duration, and result shape — same style
  as today. Never logs the API key.

This is the ONLY place in the extraction path that touches the provider SDK.

## Agent (`app/agents`) — LangGraph

### `events.py`

Typed event dataclasses shared by the SSE transport:
`TextDeltaEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`,
`DoneEvent`, each carrying a `type` literal, plus `event_to_dict(event)`
which adds the `"type"` field for SSE serialization.

### `tools.py`

Six LangChain `StructuredTool`s built by `build_tools(db, workspace_id)`,
closure-bound to the request's db session and workspace id so the LLM never
sees or supplies either:

1. `get_workspace_graph` — full compiled graph JSON.
2. `get_workspace_documents` — document list + metadata.
3. `get_document_chunks(document_id)` — semantic chunks of one source document
   (uses the existing docling `HybridChunker`).
4. `verify_graph` — deterministic re-run of the existing quote-validation
   (`validate_document_quotes`); returns checked/verified counts and the node
   ids whose quotes could not be found verbatim. No LLM cost.
5. `edit_workspace_graph(mutation)` — validated, persisted graph mutation
   (`add_nodes` / `remove_node_ids` / `add_edges` / `remove_edge_ids`).
   Enforces referential integrity and the relation matrix; on success persists
   `workspace.graph_payload` and the frontend re-renders.
6. `recompile_workspace` — re-runs parse -> LLM -> validate. Its description
   states it is slow and state-changing.

Pure, unit-testable logic lives module-level: `GraphMutation`,
`ALLOWED_RELATIONS` (the connection matrix from the graph prompt),
`apply_graph_mutation(payload, mutation)`.

### `graph.py`

- `build_model()` — provider-aware chat model: `ChatOpenAI` (OpenAI-compatible
  `base_url`) for `llm_provider == "openai"`, `ChatGoogleGenerativeAI` for
  `"google"`.
- `build_agent(tools, model=None)` — compiles the LangGraph ReAct graph:
  `agent` node (model `bind_tools`) -> `tools` node via `tools_condition` ->
  back to `agent`; the loop is bounded by LangGraph's `recursion_limit`
  (default 25, ~12 tool calls).
- `run_agent(agent, user_message)` — async generator over
  `agent.astream_events(..., version="v2")` that maps LangChain events to the
  ClaimGraph SSE events:
  - `on_chat_model_stream` -> `TextDeltaEvent` (token deltas; skips empty
    tool-call chunks),
  - `on_tool_start` -> `ToolCallEvent`,
  - `on_tool_end` -> `ToolResultEvent`,
  - `on_tool_error` / `on_chain_error` -> `ToolResultEvent` / `ErrorEvent`,
  - then `DoneEvent`.
- Stateless per request: no checkpointer; message history lives inside the
  single LangGraph run and is discarded after.

### Route

New router in `backend/app/api/routes/agents.py`, registered in
`app/api/routes/__init__.py`:

```
POST /api/workspaces/{workspace_id}/chat   -> SSE stream
```

- Body: `{"message": string}`.
- Verifies the workspace exists (404 `WorkspaceNotFoundError` otherwise),
  builds tools + agent, and streams `run_agent` output as `text/event-stream`.
- Returns 404 `WorkspaceNotFoundError` if the workspace does not exist.

## Data flow

1. Frontend POSTs a message to the chat endpoint.
2. Route verifies the workspace, calls `build_tools(db, workspace_id)`, and
   compiles the LangGraph agent.
3. `run_agent` invokes `astream_events`; the agent node calls the model, which
   returns tool calls or text; `tools_condition` routes tool calls to the tools
   node (which dispatch to the six tools) and text to END.
4. The wrapper maps each LangChain event to a ClaimGraph SSE event; the route
   encodes them as `data: {json}\n\n`.
5. Frontend renders text and, after `edit_workspace_graph`/`recompile_workspace`
   tool results, re-fetches the workspace payload.

## Error handling and observability

- LangGraph's `ToolNode` catches tool exceptions (returns them as tool
  messages); the wrapper also maps `on_tool_error`/`on_chain_error` to
  `ToolResultEvent`/`ErrorEvent` so the stream always ends with `DoneEvent`.
- The LLM extraction path still surfaces failures through `structured.py` as
  `InvalidLLMResponseError` (plus timeout/retry variants).
- Existing per-step INFO/ERROR logging style is preserved; API key never logged.

## Testing

- `chat_structured` unit-tested with a fake client (existing monkeypatch
  pattern).
- `events.py` tested for `event_to_dict` serialization.
- `tools.py`: `apply_graph_mutation` rejects dangling edges, relation-matrix
  violations, and duplicate ids; `build_tools` returns exactly the six tools;
  tool behavior tested through `StructuredTool.ainvoke` against a real SQLite
  session (graph read, verify flagging a non-verbatim quote, edit persisting,
  recompile invoking the service).
- `graph.py`: `run_agent` event mapping tested against a fake agent yielding
  scripted LangChain events; `build_agent` compiled and run end-to-end with a
  scripted fake model (returns one tool call then a final answer) — no real LLM.
- SSE route tested via TestClient (patch `run_agent`).
- Migrate existing tests that patch `graph_service.create_client` to patch the
  LLM layer (`app.llm.structured.chat_structured` or the client factory).

## Constraints

- **New runtime dependencies (agent only):** `langgraph`, `langchain-openai`,
  `langchain-google-genai`. No other new dependencies. Instructor remains for
  the extraction path.
- **No provider knowledge leaks above `app/llm/` (extraction) and
  `app/agents/graph.py` (agent).**
- **Never log secrets** — the LLM API key must never be logged.
- **Keep the existing graph-compile behavior identical; the extraction refactor
  must not change the compiled payload or quote-validation semantics.**
- **Agent stays in Python** on the backend.

## Out of scope (deferred)

- Conversation persistence (a `ChatMessage` table / load-save around the agent;
  LangGraph checkpointer if ever needed).
- Semantic `search_documents` tool over chunks.
- Migrating graph extraction off Instructor to LangChain.
- Human-in-the-loop, sub-agents, multi-model routing.
- Changing the frontend beyond SSE consumption and re-fetch on graph edits.
