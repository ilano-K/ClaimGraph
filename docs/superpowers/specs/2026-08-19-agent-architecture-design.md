# Agent Architecture Design

## Summary

Introduce a chat agent ("ClaimGraph Assistant") into the FastAPI backend that can
answer questions about a workspace's papers, verify that claims have verbatim
sources, edit the graph canvas (persisted to the database), and trigger
recompilation. Alongside it, extract a thin LLM service layer so the existing
graph-extraction pipeline and the new agent share one integration point instead
of each re-implementing provider calls.

The agent stays in **Python** on the backend (its tools require docling-parsed
content, quote validation, and database persistence that already live there).
No LangChain/LangGraph, no Vercel AI SDK on the backend. The frontend consumes
an SSE stream and may use the AI SDK's `useChat` for UI ergonomics.

## Approach

Build a thin own-layer with swap seams ("Approach A shaped like C"): a small
`app/llm/` package for provider construction and structured calls, and an
`app/agents/` package for the tool registry and async agent loop. The agent
loop is a bounded while-loop over one `chat_structured` call per iteration,
emitting typed stream events for SSE. No framework dependency; the `Tool` and
`AgentStreamEvent` interfaces are the seams where LangGraph could be swapped in
later without touching routes or tools.

## Scope

### New packages

```
backend/app/llm/
  __init__.py
  client_factory.py       # cached client; openai-compatible-first
  structured.py           # chat_structured(system, messages, response_model) -> T

backend/app/agents/
  __init__.py
  tools.py                # tool registry: name -> {input schema, description, callable}
  simple_agent.py         # async loop; async generator of AgentStreamEvent
```

### Files modified

- `backend/app/services/ai_factory.py` -> becomes `app/llm/client_factory.py`
  (or remains as a thin re-export). Caches the client as a singleton; keeps the
  existing `openai` and `google` branches, openai-compatible first.
- `backend/app/services/graph_service.py` -> `generate_claim_graph` calls
  `chat_structured` instead of raw `client.chat.completions.create`. React Flow
  mapping moves out.
- `backend/app/services/reactflow.py` -> NEW: `to_react_flow_nodes` and
  `to_react_flow_edges` moved here from `graph_service`.
- `backend/app/api/routes/workspaces.py` -> NEW agent route: SSE chat endpoint.
- `backend/app/core/settings.py` -> add `llm_max_retries`, `llm_timeout`
  (optional, with defaults).
- Tests migrate their `monkeypatch.setattr(graph_service, "create_client", ...)`
  seams to the LLM layer.

## LLM service layer (`app/llm`)

### `client_factory.py`

- `get_client()` returns a cached, Instructor-wrapped chat client for the
  configured provider (module-level singleton, not re-created per call).
- Default provider type is "openai": `api_key` + `base_url` + `model` covers
  OpenAI, Groq, Mistral, Together, DeepSeek, OpenRouter, Ollama, Azure, and
  Gemini's OpenAI-compatible endpoint. No code change needed to add these.
- Keeps the existing `google` (native GenAI SDK) branch as an adapter escape
  hatch. Anthropic adapter is deferred until needed.
- Raises `ValueError` for an unrecognized provider (existing behavior).

### `structured.py`

Single function:

```
chat_structured(system: str, messages: list, response_model: type[T],
                tool_schemas: list | None = None, **kwargs) -> T
```

Responsibilities:
- Build the request: system message + messages; attach `response_model` and, for
  the agent, tool/function schemas.
- Retries and timeout using `llm_max_retries` / `llm_timeout`.
- Maps provider/schema failures to `InvalidLLMResponseError` (and timeout /
  retry-exhausted variants if needed).
- Logs entry/exit with provider, model, duration, and result shape — same style
  as today. Never logs the API key.

This is the ONLY place outside `app/llm/` that touches the provider SDK.

## Agent (`app/agents`)

### Tools (`tools.py`)

Tool = name + Pydantic input schema + description + plain async callable.
Registry maps name -> tool. Pydantic model doubles as the JSON schema.

Six tools:

1. `get_workspace_graph(workspace_id)` — full compiled graph (nodes, edges,
   relation reasoning, per-document summaries).
2. `get_workspace_documents(workspace_id)` — document list + metadata.
3. `get_document_chunks(workspace_id, document_id)` — semantic chunks of one
   source document (uses the existing docling `HybridChunker` in `parsers.py`).
4. `verify_graph(workspace_id)` — deterministic re-run of the existing
   quote-validation logic (`validate_document_quotes`); returns per-node
   pass/fail with the offending quote. No LLM cost.
5. `edit_workspace_graph(workspace_id, mutation)` — validated, persisted graph
   mutation. Enforces:
   - Pydantic schema (`GraphPayload` shape),
   - referential integrity (no edges to missing nodes; deleting a node removes
     its edges),
   - the relation matrix (`SUPPORTS`/`LIMITS`/`CAUSES`/`CHALLENGES`
     source->target category rules from the graph prompt),
   then persists `workspace.graph_payload` and the frontend re-renders from the
   DB payload.
6. `recompile_workspace(workspace_id)` — re-runs the full pipeline
   (parse -> LLM -> validate). Its tool description states it is slow and
   state-changing so the model uses it sparingly.

### Agent loop (`simple_agent.py`)

- Async generator yielding typed events:
  `text_delta | tool_call | tool_result | error | done`.
- Loop, bounded at ~10 iterations:
  1. Compose messages: agent system prompt + accumulated history + tool schemas.
  2. `chat_structured` -> either a final answer (streamed as `text_delta`) or a
     tool call.
  3. Tool call -> emit `tool_call`, dispatch via the registry inside
     try/except, append the result as a message, loop.
  4. Final answer -> emit `done`.
- Tool exceptions are caught per-tool and returned to the model as a tool result
  message (non-fatal). Exceeding the iteration cap emits `error` and stops.
- Stateless per request; conversation history is held by the caller (the route)
  and passed in. No persistence.

### Route

New endpoint in `workspaces.py` (or an `agents.py` router):

```
POST /api/workspaces/{workspace_id}/chat   -> SSE stream
```

- Reads the user message, creates a fresh agent over the workspace, streams the
  agent's async generator as `text/event-stream`.
- Returns 404 `WorkspaceNotFoundError` if the workspace does not exist.

## Data flow

1. Frontend POSTs a message to the chat endpoint.
2. Route builds a `SimpleAgent` bound to the workspace and a message history.
3. Agent calls `chat_structured`; the LLM returns a final answer or a tool call.
4. Tool calls dispatch to registry tools (which read/validate/persist via the
   existing services and DB).
5. Agent streams typed events to the route; route encodes them as SSE.
6. Frontend renders text and applies any graph edits by re-fetching the
   workspace payload.

## Error handling and observability

- All LLM failures surface through `structured.py` as
  `InvalidLLMResponseError` (plus timeout/retry variants).
- Per-tool errors become tool-result messages, not request failures.
- Agent loop logs entry/exit, iteration count, tool invocations, and duration.
- Existing per-step INFO/ERROR logging style is preserved; API key never logged.

## Testing

- `chat_structured` unit-tested with a fake client (existing monkeypatch
  pattern).
- Agent loop tested with a scripted fake LLM: returns a tool call then a final
  answer; assert the emitted event sequence (`tool_call` -> `tool_result` ->
  `text_delta` -> `done`).
- Tool tests: `verify_graph` with a document whose node quote is not verbatim;
  `edit_workspace_graph` rejects a dangling edge and a relation-matrix
  violation; `recompile_workspace` reuses existing compile coverage.
- SSE route tested via TestClient, matching the existing API-test style.
- Migrate existing tests that patch `graph_service.create_client` to patch the
  LLM layer (`app.llm.structured.chat_structured` or the client factory).

## Constraints

- No new runtime dependencies. Instructor, OpenAI/GenAI SDKs, Pydantic are
  already in use.
- No provider knowledge leaks above `app/llm/`.
- Never log secrets (LLM API key).
- Keep the existing graph-compile behavior identical; the refactor must not
  change the compiled payload or quote-validation semantics.
- Agent stays in Python on the backend.

## Out of scope (deferred)

- Conversation persistence (a `ChatMessage` table / load-save around the agent).
- Semantic `search_documents` tool over chunks.
- LangGraph, checkpointing, human-in-the-loop, sub-agents, multi-model routing.
- Native Anthropic adapter (only if the OpenAI-compatible path proves
  insufficient).
- Changing the frontend beyond SSE consumption and re-fetch on graph edits.
