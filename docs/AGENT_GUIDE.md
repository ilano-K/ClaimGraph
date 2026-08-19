# ClaimGraph Assistant — Agent Guide

The read-only chat agent for a workspace. Built on **LangGraph** (backend, Python), streams answers to the frontend over **SSE**.

- **Reads only.** No editing, no recompiling — that's v2.
- **Workspace-scoped.** One chat = one workspace's graph.
- **Router + branches.** Your message gets classified into one of 5 intents, then a dedicated branch handles it.

---

## The graph (node → edge → node)

```
 START
   │
   ▼
 [ load_graph ]     DB read, no LLM. Builds a condensed graph preview into state.
   │
   ▼
 [ router ]         One small LLM call → intent + one-line reason.
   │
   ├──► orientation_branch   (no tools)
   ├──► explain_branch       (get_node_detail, search_documents)
   ├──► verify_branch        (verify_graph)
   ├──► critique_branch       (verify_graph, get_node_detail, search_documents)
   ├──► lookup_branch        (search_documents)
   └──► (router fails? → explain_branch, always)
              │
              ▼
        [ tools ]            ONE shared tool node.
              │
       └──► back to the same branch (while it keeps calling tools)
              ▼
            END
```

Key ideas:
- **`load_graph` runs before any LLM call.** If the workspace has no graph, the route replies immediately and never calls the model.
- Only a **condensed** graph goes into context (summaries + node/edge structure, **no quotes**). Quotes are fetched on demand by tools — keeps context small.
- Each branch is its own agent node: **own prompt + own tool subset**. `verify` physically cannot call `search_documents`.
- Branches loop through the **same** shared tool node, so multi-step answers ("check this claim, then find its exact wording") just work.

---

## The 5 intents

| Intent | What it answers | What it can call |
|--------|-----------------|------------------|
| **orientation** | "What's in this workspace / summarize the papers" | *(none — uses the preview)* |
| **explain** | "What does claim X mean / why does A support B" | `get_node_detail`, `search_documents` |
| **verify** | "Are all quotes really backed by the source?" | `verify_graph` |
| **critique** | "Find contradictions / unverified claims / risks" | `verify_graph`, `get_node_detail`, `search_documents` |
| **lookup** | "What does the paper *exactly* say about X?" | `search_documents` |

The router decides using a tiny structured LLM call → `{intent, reason}`. Example: *"are these quotes real?"* → `{intent: verify, reason: "user asked to check quotes"}`.

---

## The 3 tools (all read-only)

| Tool | Returns |
|------|---------|
| **`search_documents(query, document_id?)`** | Up to 5 verbatim chunks from a paper that contain the query terms (keyword-match over docling chunks; results cached per document) |
| **`get_node_detail(node_id)`** | One node's full record — verbatim quote, summary, confidence, category — **plus its connected edges and neighbors** |
| **`verify_graph()`** | Deterministic quote-integrity check: checked / verified counts + which node ids failed. **No LLM cost** |

Rules the agent follows (in its system prompt): never invent quotes/ids/numbers, answer only from context + tool output, keep it concise, and say so when the tools don't have what was asked.

---

## Conversation shape

**State** (travels node to node):
```
messages        ← the chat history (LangChain messages)
graph_preview   ← condensed graph (built by load_graph)
intent          ← set by the router
routing_reason  ← the router's one-liner
active_node_id  ← "ask about this node" context from the frontend
system_inject   ← combined system prompt (branch rules + preview)
```

**SSE events** the frontend receives, in order:
```
intent       → banner ("Checking quote integrity…")
text_delta   → token-by-token reply text
tool_call    → "searching documents…" chip
tool_result  → tool output (shown as activity, not chat)
error        → something failed (stream still ends gracefully)
done         → always the last event
```

**Endpoint:** `POST /api/workspaces/{workspace_id}/chat`
Body: `{ "message": string, "active_node_id": string | null }`

One request = one run. No conversation memory between requests yet (that's deferred too).

---

## Files

```
backend/app/agents/
  events.py    # SSE event dataclasses (text_delta | tool_call | tool_result | intent | error | done)
  state.py     # AgentIntent, AgentState, build_graph_preview()
  tools.py     # build_tools() → the 3 tools + chunk cache
  prompts.py   # router prompt + assistant preamble + per-intent rules
  router.py    # classify_intent() → {intent, reason}, falls back to explain
  graph.py     # build_model(), build_agent() (the graph), run_agent() (SSE mapping)
backend/app/api/routes/agents.py   # the SSE chat endpoint
backend/tests/test_agent_*.py      # one test file per module
```

---

## What's deferred (v2)

- Editing the graph (add/remove nodes/edges) and recompile
- Semantic (embedding) search behind `search_documents`
- Conversation history across messages (`ChatMessage` table / checkpointer)
- Cross-workspace questions, status intent
- The frontend chat UI (SSE consumer + intent banner)

The old ReAct-loop design is preserved as reference for the v2 editing pieces.

---

## Reading order

- **This guide** → you got the whole thing.
- `specs/2026-08-19-agent-architecture-karl-design.md` → the design decisions and their rationale.
- `plans/2026-08-19-agent-architecture-karl.md` → the 7 task-by-task build steps (code + tests), for when you actually build it.