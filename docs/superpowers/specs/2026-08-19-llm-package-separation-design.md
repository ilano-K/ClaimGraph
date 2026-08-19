# LLM Package Separation Design

## Summary

Isolate the LLM provider code into a new `app/llm/` package and remove the
mixed responsibilities from `app/services/graph_service.py`, which currently
combines an LLM call (`generate_claim_graph`) with React Flow canvas mapping
(`to_react_flow_nodes`/`to_react_flow_edges`). After this change:

- `app/llm/` is the only place in the codebase that touches the provider SDK.
- `graph_service` contains graph extraction orchestration only.
- `app/services/reactflow.py` contains React Flow canvas mapping only.

Behavior stays byte-for-byte identical: same messages sent to the LLM, same
normalization, same quote validation, same compiled payload.

## New package: `app/llm/`

### `app/llm/client_factory.py`

`get_client()` — module-level cached Instructor client for the configured
provider, moved from `app/services/ai_factory.py::create_client`:

- `openai` provider -> `instructor.from_openai(OpenAI(api_key, base_url))`
  (OpenAI-compatible endpoints: Groq, Mistral, Ollama, Azure, etc.).
- `google` provider -> `instructor.from_gemini(genai.Client(api_key))`.
  Preserve the current `google` branch (uncommitted working-tree change;
  provider name is `google`, not `gemini`).
- Unrecognized provider -> `ValueError` (existing behavior).
- The client is created once and reused (module-level singleton).

### `app/llm/structured.py`

Single function:

```
chat_structured(system: str, messages: list[dict], response_model: type[T], **kwargs) -> T
```

- Prepends the system message to the caller-provided `messages` dicts.
- Calls `client.chat.completions.create(...)`.
- Forwards provider-specific options via `**kwargs` (e.g. the existing
  `extra_body={"thinking": {"type": "disabled"}}` used by graph extraction).
- Logs entry/exit with provider, model, and duration (same style as today).
- Maps `instructor.exceptions.IncompleteOutputException` to
  `InvalidLLMResponseError`.
- No retries in this change (added later only if needs warrant).

### `app/llm/__init__.py`

Empty.

## `app/services/graph_service.py` — extraction only

- `generate_claim_graph` replaces the raw client call with
  `chat_structured(...)`. It no longer imports `create_client` and never
  touches the provider SDK.
- `to_react_flow_nodes`, `to_react_flow_edges`, `EDGE_STYLE`,
  `EDGE_ANIMATED` are removed along with their now-unused imports
  (`GraphNode`, `GraphEdge`, `EdgeRelation`, `ReactFlowNode`,
  `ReactFlowEdge`, `ReactFlowStyle`, and `List` if unused).
- All other logic (document_id validation, `normalize_graph_payload`,
  logging) stays byte-for-byte.

## New `app/services/reactflow.py`

Holds the four moved items verbatim: `to_react_flow_nodes`,
`to_react_flow_edges`, `EDGE_STYLE`, `EDGE_ANIMATED`. Imported by
`app/services/workspace_service.py` from here instead of `graph_service`.

## Cleanup

- `app/services/ai_factory.py` is deleted. The sole remaining importer
  (`tests/test_logging.py::test_ai_factory_logs_provider`) is re-pointed at
  `app.llm.client_factory.get_client`.
- Uncommitted working-tree changes in `ai_factory.py` (the `google` vs
  `gemini` provider branch) are carried forward into `client_factory.py`.
- `frontend/src/components/dashboard/Dashboard.tsx` is left untouched.

## Test migration and baseline

The suite is currently red (6 failures) from stale fixtures: tests reference
removed enums (`EdgeRelation.DEPENDS_ON`) and outdated colors. Fix the root
causes:

- `backend/tests/helpers.py` — replace removed enum members
  (`NodeCategory.TRADEOFF`, `EdgeRelation.DEPENDS_ON`) with current members.
- `backend/tests/test_services.py::test_to_react_flow_edges_styles_and_animation`
  — use current relation members and the colors defined in `reactflow.py`
  (`#22D3EE` SUPPORTS, `#FACC15` LIMITS, `#F97316` CAUSES, `#EF4444` CHALLENGES).
- Migrate the monkeypatch seams in `test_services.py`, `test_text_cleanup.py`,
  and `test_logging.py` from patching `graph_service.create_client` to
  patching the LLM layer (`graph_service.chat_structured` and
  `app.llm.structured.get_client` as needed).

## Verification

Run from `backend/`:

```
pytest tests -q
```

Entire suite green. No behavioral change to compiled payloads, quote
validation, or logging.