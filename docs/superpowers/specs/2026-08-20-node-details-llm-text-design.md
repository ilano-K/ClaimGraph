# Node Details Panel: Show LLM-Generated Text

## Problem

When a user clicks a node on the graph, the Details tab in the inspection
panel shows the **document-level executive summary** as the LLM text instead
of the **node's own LLM-generated summary** (`node.summary`).

The node card already displays `node.summary` (HTML source of truth), but the
Details panel shows `presentation.synthesis`, which is mapped from
`document.executive_summary` in `mapGraph.ts`.

## Goal

Clicking a node should show, in the Details tab:

1. The node's own LLM-generated text (`node.summary`).
2. The verbatim citation (quote + source) — already correct, unchanged.

## Change

Single-line change in `frontend/src/lib/mapGraph.ts`:

- `presentation.synthesis` maps to `node.summary` instead of
  `document.executive_summary`.

No changes to `DetailsSection.tsx`, `InspectionPanel.tsx`, types, or the
citation display.

## Out of Scope

- The document-level executive summary is no longer shown anywhere in the
  Details tab for a node.
- No new fields, no backend changes, no new types.