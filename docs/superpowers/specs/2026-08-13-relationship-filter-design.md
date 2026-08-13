# Relationship Filter — Design

**Date:** 2026-08-13
**Status:** Approved
**Scope:** Frontend-only feature on the graph workspace canvas.

## Problem

The graph canvas renders every node and edge from the compiled payload. With up
to 40 nodes and four edge relations, users cannot visually isolate specific
semantic pathways (e.g. "which limitations constrain which claims"). Clicking a
filter group should let users inspect one pathway at a time.

## Requirements

1. A UI control on the graph workspace that filters the canvas by the following
   node-to-node relationship groups:

   | Option | Matching rule |
   |---|---|
   | Show All (default) | no filtering |
   | Claims & Evidence | `SUPPORTS` + source `EVIDENCE` + target `CLAIM` |
   | Methodology Pipeline | `SUPPORTS` + (`METHODOLOGY`→`METHODOLOGY` or `METHODOLOGY`→`EVIDENCE`) |
   | Limitations | `LIMITS` + source `LIMITATION` + target `CLAIM` or `METHODOLOGY` |
   | Hazards & Outcomes | `CAUSES` + source `CLAIM` + target `RISK` or `CONSEQUENCE` |
   | Contradictions | relation `CHALLENGES` (any source/target categories) |

2. **Full isolation semantics:** when a filter group is active, only matching
   edges plus the nodes they connect remain on the canvas. All unrelated edges
   and orphaned nodes disappear entirely.

3. **No overlap between groups.** "Claims & Evidence" covers supportive
   evidence only (`SUPPORTS` `EVIDENCE`→`CLAIM`). Contradicting evidence
   (`CHALLENGES` `EVIDENCE`→`CLAIM`) belongs exclusively to "Contradictions".

## Design

Approach: pure filter layer + floating dropdown (option A from the brainstorm).
`App.tsx` owns the selected filter; a pure function computes the visible
subgraph; `GraphCanvas` renders only what it is given.

### Filter model & rules

New module `frontend/src/lib/relationshipFilter.ts`:

- `RelationshipFilter` union type: `'all' | 'claims_evidence' | 'methodology' |
  'limitations' | 'hazards_outcomes' | 'contradictions'`.
- `FILTER_OPTIONS` array for rendering the menu (id, label, short description).
- Pure `filterGraph(graph, filter)` returning `{ nodes, edges }` restricted to
  the matched edges and every node touching at least one matched edge.
- `matchesEdge(edge, filter)`: single-edge predicate applying the rule table.

### Data flow

- `App.tsx` holds `const [filter, setFilter] = useState<RelationshipFilter>('all')`.
- `visible = useMemo(() => filterGraph(graph, filter), [graph, filter])`; pass
  `visible.nodes` / `visible.edges` to `GraphCanvas`.
- `InspectionPanel`, `activeNode`, `hoveredNodeId`, pan/zoom and node dragging
  keep operating on the full graph state. Node positions are never re-laid
  out when a filter changes.
- When the filter changes, if the currently active node is not in the visible
  node set, clear `activeNodeId` (the panel then shows the first visible node,
  consistent with existing behavior).
- Auto-fit the viewport to the visible subset when the filter selection changes
  (reuses the existing `fitToContent` path via a refit signal); no sweep/re-layout.

### UI component

New `frontend/src/components/graph/RelationshipFilterDropdown.tsx`:

- Floating container anchored to the top of the canvas area (below the nav
  bar), using the existing `glass-panel` styling.
- Trigger button: filter/`filter_list` icon + current group label; opens a
  menu listing all six options. Selected option is highlighted.
- Selecting an option closes the menu and updates `filter`.
- Empty result hint: when the active graph has zero matches for the selected
  group, render a non-blocking note on the canvas (e.g. "No limitations
  relationships in this graph") — selection is preserved.

### Lifecycle

- The filter resets to `Show All` whenever a new graph is loaded: opening a
  workspace (`handleOpenWorkspace`) and after a recompile (`handleRecompile`).
  It is transient view state and does not persist.

## Edge cases

- Filter with zero matching edges → empty result hint, selection preserved.
- Filter where some matched edges share nodes → nodes de-duplicated.
- `EVIDENCE→CLAIM` edges with `CHALLENGES` excluded from "Claims & Evidence",
  included in "Contradictions".
- Active node filtered out → active selection cleared, panel falls back to the
  first visible node.

## Verification

- Frontend has no test framework; add no new test infra in this change.
- `relationshipFilter.ts` is kept pure for future unit tests.
- Verify with `npm run build` (tsc --noEmit + vite build) in `frontend/`.

## Out of scope

- Backend changes (payload already contains all node categories + relations).
- Node re-layout/sweep on filter change.
- Persisting the filter choice across screens.