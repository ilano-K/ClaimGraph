# Chat 500 Error: `Classification` Validation Failure

## Symptom

`POST /chat` returns `500 Internal Server Error` with a traceback ending in:

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Classification
  Invalid JSON: expected value at line 1 column 1 [type=json_invalid, input_value='**lookup**', input_type=str]
During task with name 'classify' and id '...'
```

## What happened

The failure occurs inside the LangGraph `classify` node:

```
backend/app/llm/agent/classifier.py:9
  result = classifier.invoke([...])
```

- `classifier` is `get_llm().with_structured_output(Classification)`.
- `Classification` is a Pydantic model with a single field `intent: Intent`.
- `with_structured_output` tells the model to reply with **strict JSON** matching that schema.

### The exact cause

1. The LLM (`openai/gpt-oss-20b:free` via OpenRouter) was asked to return JSON for the `Classification` schema.
2. Instead of JSON, the model returned a free-form, markdown-bolded token: `**lookup**`.
3. The OpenAI SDK's structured-output parser then tries to parse that content as JSON
   (`openai/lib/_parsing/_completions.py` → `model_parse_json`).
4. Pydantic rejects `**lookup**` as JSON:
   `expected value at line 1 column 1`.
5. The exception propagates uncaught, and FastAPI returns a 500.

The model obviously *understood* the intent (`lookup` is a valid `Intent` value) —
it just formatted the answer as markdown instead of JSON.

## Why the model did this

The pinned model is a **free** OpenRouter model. This is a known, acknowledged risk:

- `backend/app/llm/client_factory.py:18-23` explicitly comments that free OpenRouter
  models "load-balance across arbitrary free models (including reasoning models that
  can emit scratch text instead of JSON)".
- The project already pins a specific model (`openai/gpt-oss-20b:free`) instead of the
  `:free` auto-router for this reason, but even a pinned free model can occasionally
  ignore the JSON schema and answer in plain text.

Because structured-output parsing is strict, **any** non-JSON reply immediately raises
a 500. This is not a bug in your routing or schema code.

## How to fix it

### 1. Use a more reliable model (fixes the root cause)

Pay for a model with reliable structured output (e.g. `openai/gpt-4o-mini`, a non-free
OpenRouter model, or a hosted model backed by a proper JSON-Schema mode). This is the
cleanest fix.

### 2. Add retry / fallback (defensive)

- Wrap `classifier` with LangChain `.with_fallbacks([...])` to try a second model
  (or a second prompt) when the first output fails validation.
- Or catch `ValidationError`/`OutputParserException` in the node and re-prompt with an
  explicit "return JSON only" instruction for one retry.

### 3. Make parsing tolerant (handles the noise)

- Strip markdown / backticks / whitespace from the raw content before JSON parsing
  (e.g. custom output parser that cleans `**` and code fences, then `json.loads`).
- Or use **instructor's `MD_JSON` mode**, which you already use for the compile client
  (`backend/app/llm/client_factory.py:36-47`). `MD_JSON` tolerates markdown-wrapped
  JSON and parses client-side instead of relying on the provider's strict schema mode.

### 4. Change the structured-output method

- `with_structured_output(Classification, method="json_mode")` behaves differently
  from the default function-calling method and is sometimes honored better by
  OpenRouter upstream providers.

### 5. Fail gracefully in the graph

- Convert the validation error into a fallback intent (e.g. default to the "other"
  intent) inside the `classify` node so the chat continues instead of 500ing.

## TL;DR

The model returned `**lookup**` (markdown, not JSON). Strict JSON parsing then failed.
Use a better model to fix the cause, or add retry/tolerant-parsing/fallback code to make
the failure rare instead of instant.