# Node Details LLM Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Details tab in the inspection panel show the node's own LLM-generated summary (`node.summary`) instead of the document-level executive summary.

**Architecture:** The frontend maps the backend `GraphPayload` into view models in `mapGraph.ts`. `presentation.synthesis` is the single field the DetailsSection consumes as the LLM text; it is currently wired to `document.executive_summary`. Repointing it to `node.summary` makes the Details tab and the node card agree.

**Tech Stack:** TypeScript, React, Vite (build/typecheck via `npm run build` / `npm run typecheck`).

## Global Constraints

- Single-line change in `frontend/src/lib/mapGraph.ts` only.
- No new fields, no backend changes, no changes to `DetailsSection.tsx`, `InspectionPanel.tsx`, or types.
- The verbatim citation block (quote + source) is unchanged.
- The document-level executive summary is no longer shown in a node's Details tab.

---

### Task 1: Repoint Details LLM Text to Node Summary

**Files:**
- Modify: `frontend/src/lib/mapGraph.ts:83`

**Interfaces:**
- Consumes: `GraphNode.summary` (already present on `node`, populated by the backend) — declared in `frontend/src/api/types.ts:35`.
- Produces: `GraphNodePresentation.synthesis` now carries the node's own LLM summary. Consumed by `DetailsSection` via `InspectionPanel.covers()` → `NodeContent.synthesis`.

- [ ] **Step 1: Make the change**

In `frontend/src/lib/mapGraph.ts`, in the `presentation` object built inside the `payload.nodes.map(...)` callback, change line 83:

```ts
synthesis: document?.executive_summary ?? '',
```

to:

```ts
synthesis: node.summary,
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck` (in `frontend/`)

Expected: exit code 0, no errors. `node.summary: string` is non-nullable, so the `?? ''` fallback is no longer needed.

- [ ] **Step 3: Verify a production build**

Run: `npm run build` (in `frontend/`)

Expected: exit code 0; `tsc --noEmit && vite build` completes.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the app, open a workspace, open a graph, click a node.

Expected: the Details tab shows the node's own LLM summary (the 1-2 sentence text that also appears on the card) in the main text area, and the verbatim citation quote box with its source below it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mapGraph.ts
git commit -m "fix(frontend): show node's LLM summary in details panel"
```