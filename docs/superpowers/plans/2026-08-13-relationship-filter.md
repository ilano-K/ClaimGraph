# Relationship Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend "Relationship Filter" dropdown to the graph workspace that visually isolates specific node-to-node pathways using full-isolation semantics.

**Architecture:** Pure filter layer + floating dropdown. `App.tsx` owns the selected `RelationshipFilter`; a pure `filterGraph()` function in `lib/relationshipFilter.ts` derives the visible `nodes`/`edges`; `GraphCanvas` renders only the visible set and hosts the filter dropdown overlay. No backend, state, or layout changes beyond the workspace screen.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind. Material Symbols icon font via `Icon` wrapper.

## Global Constraints

- Frontend only — no backend files modified.
- No new test framework — no `.test.*` files, no new dev dependencies.
- Filter selection must reset to `'all'` whenever a new graph is loaded: `handleOpenWorkspace`, `handleRecompile`, and `handleGraphCompiled` in `App.tsx`.
- Matching rules (verbatim from spec):
  - `claims_evidence`: `supports` + source `evidence` + target `claim`
  - `methodology`: `supports` + (`methodology`→`methodology` or `methodology`→`evidence`)
  - `limitations`: `limits` + source `limitation` + target `claim` or `methodology`
  - `hazards_outcomes`: `causes` + source `claim` + target `risk` or `consequence`
  - `contradictions`: relation is `challenges` (any categories)
  - `all`: no filtering
- Category and relation string values are the shared `NodeCategory` / `EdgeRelation` unions from `frontend/src/api/types.ts`.
- Node positions are never re-laid out when a filter changes; only the viewport auto-fits to the visible subset.
- Verification per task: `npm run build` in `frontend/` (runs `tsc --noEmit && vite build`) must pass; then commit.

---

### Task 1: Pure relationship filter module

**Files:**
- Create: `frontend/src/lib/relationshipFilter.ts`

**Interfaces:**
- Produces (consumed by Task 2 and Task 3):
  - `export type RelationshipFilter = 'all' | 'claims_evidence' | 'methodology' | 'limitations' | 'hazards_outcomes' | 'contradictions'`
  - `export interface RelationshipFilterOption { id: RelationshipFilter; label: string; description: string }`
  - `export const FILTER_OPTIONS: RelationshipFilterOption[]`
  - `export interface FilteredGraph { nodes: GraphNodeView[]; edges: GraphEdgeView[] }`
  - `export function filterGraph(nodes: GraphNodeView[], edges: GraphEdgeView[], filter: RelationshipFilter): FilteredGraph`

- [ ] **Step 1: Create the module**

Create `frontend/src/lib/relationshipFilter.ts` with exactly this content:

```ts
import type { EdgeRelation, GraphEdgeView, GraphNodeView, NodeCategory } from '../api/types'

export type RelationshipFilter =
  | 'all'
  | 'claims_evidence'
  | 'methodology'
  | 'limitations'
  | 'hazards_outcomes'
  | 'contradictions'

export interface RelationshipFilterOption {
  id: RelationshipFilter
  label: string
  description: string
}

export const FILTER_OPTIONS: RelationshipFilterOption[] = [
  { id: 'all', label: 'Show All', description: 'Every node and relationship on the canvas' },
  {
    id: 'claims_evidence',
    label: 'Claims & Evidence',
    description: 'EVIDENCE -> CLAIM (supportive)',
  },
  {
    id: 'methodology',
    label: 'Methodology Pipeline',
    description: 'METHODOLOGY -> METHODOLOGY & METHODOLOGY -> EVIDENCE',
  },
  {
    id: 'limitations',
    label: 'Limitations',
    description: 'LIMITATION -> CLAIM & LIMITATION -> METHODOLOGY',
  },
  {
    id: 'hazards_outcomes',
    label: 'Hazards & Outcomes',
    description: 'CLAIM -> RISK & CLAIM -> CONSEQUENCE',
  },
  {
    id: 'contradictions',
    label: 'Contradictions',
    description: 'All CHALLENGES edges',
  },
]

function matchesRule(
  filter: RelationshipFilter,
  relation: EdgeRelation,
  sourceCategory: NodeCategory,
  targetCategory: NodeCategory
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'claims_evidence':
      return relation === 'supports' && sourceCategory === 'evidence' && targetCategory === 'claim'
    case 'methodology':
      return (
        relation === 'supports' &&
        ((sourceCategory === 'methodology' && targetCategory === 'methodology') ||
          (sourceCategory === 'methodology' && targetCategory === 'evidence'))
      )
    case 'limitations':
      return (
        relation === 'limits' &&
        sourceCategory === 'limitation' &&
        (targetCategory === 'claim' || targetCategory === 'methodology')
      )
    case 'hazards_outcomes':
      return (
        relation === 'causes' &&
        sourceCategory === 'claim' &&
        (targetCategory === 'risk' || targetCategory === 'consequence')
      )
    case 'contradictions':
      return relation === 'challenges'
  }
}

export interface FilteredGraph {
  nodes: GraphNodeView[]
  edges: GraphEdgeView[]
}

/**
 * Full-isolation filter: returns the edges matching `filter` and every node
 * touching at least one matching edge. `'all'` returns the inputs unchanged.
 * Nodes/edges not touching a matched edge are removed entirely.
 */
export function filterGraph(
  nodes: GraphNodeView[],
  edges: GraphEdgeView[],
  filter: RelationshipFilter
): FilteredGraph {
  if (filter === 'all') return { nodes, edges }

  const categoryByNodeId = new Map<string, NodeCategory>()
  for (const node of nodes) categoryByNodeId.set(node.id, node.node_category)

  const matchedEdges = edges.filter((edge) => {
    const sourceCategory = categoryByNodeId.get(edge.source)
    const targetCategory = categoryByNodeId.get(edge.target)
    if (!sourceCategory || !targetCategory) return false
    return matchesRule(filter, edge.relation, sourceCategory, targetCategory)
  })

  const matchedNodeIds = new Set<string>()
  for (const edge of matchedEdges) {
    matchedNodeIds.add(edge.source)
    matchedNodeIds.add(edge.target)
  }

  return {
    nodes: nodes.filter((node) => matchedNodeIds.has(node.id)),
    edges: matchedEdges,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: exits 0, no output (or warnings-free stdout).

- [ ] **Step 3: Build**

Run: `npm run build` in `frontend/`
Expected: `tsc --noEmit` passes, then a successful `vite build` with `✓ built in ...`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/relationshipFilter.ts
git commit -m "feat(frontend): add relationship filter matching rules"
```

---

### Task 2: Relationship filter dropdown component

**Files:**
- Create: `frontend/src/components/graph/RelationshipFilterDropdown.tsx`

**Interfaces:**
- Consumes (from Task 1): `FILTER_OPTIONS`, `RelationshipFilter`, `RelationshipFilterOption`
- Produces (consumed by Task 3):
  - `interface RelationshipFilterDropdownProps { value: RelationshipFilter; onChange: (filter: RelationshipFilter) => void }`
  - `export default function RelationshipFilterDropdown({ value, onChange }: RelationshipFilterDropdownProps)`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/graph/RelationshipFilterDropdown.tsx` with exactly this content:

```tsx
import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import {
  FILTER_OPTIONS,
  type RelationshipFilter,
  type RelationshipFilterOption,
} from '../../lib/relationshipFilter'

interface RelationshipFilterDropdownProps {
  value: RelationshipFilter
  onChange: (filter: RelationshipFilter) => void
}

/**
 * Floating dropdown that picks the active RelationshipFilter. Mirrors the
 * `glass-panel` styling and outside-click-to-close behavior used by the
 * dashboard card menu. Rendered inside the graph viewport.
 */
export default function RelationshipFilterDropdown({
  value,
  onChange,
}: RelationshipFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const selected = FILTER_OPTIONS.find((option) => option.id === value) ?? FILTER_OPTIONS[0]

  function selectOption(option: RelationshipFilterOption) {
    onChange(option.id)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="glass-panel rounded-lg px-3 py-2 flex items-center gap-2 font-label-md text-label-sm text-on-surface hover:bg-white/10 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="filter_list" className="text-[18px]" />
        <span className="hidden sm:inline">{selected.label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[16px]" />
      </button>
      {open && (
        <div className="glass-panel rounded-lg p-1 flex flex-col w-64 absolute left-0 top-10 z-30">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => selectOption(option)}
              className={cn(
                'px-3 py-2 rounded text-left transition-colors',
                option.id === value
                  ? 'text-primary bg-primary/10'
                  : 'text-on-surface hover:bg-white/10'
              )}
            >
              <span className="block font-label-sm">{option.label}</span>
              <span className="block font-label-sm text-label-xs text-on-surface-variant mt-0.5">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: exits 0.

- [ ] **Step 3: Build**

Run: `npm run build` in `frontend/`
Expected: successful `vite build`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/graph/RelationshipFilterDropdown.tsx
git commit -m "feat(frontend): add relationship filter dropdown control"
```

---

### Task 3: Wire the filter through GraphCanvas and App

**Files:**
- Modify: `frontend/src/components/graph/GraphCanvas.tsx` (props interface lines 38-48; add dropdown + empty-hint overlay after `<FloatingControls ... />`, lines 369-376)
- Modify: `frontend/src/App.tsx` (imports lines 1-9; state around line 21; `handleOpenWorkspace` lines 57-68; `handleRecompile` lines 70-84; add `handleFilterChange`, `visible` memo, active-node-clearing effect; workspace JSX lines 141-154)

**Interfaces:**
- Consumes (from Task 1): `filterGraph`, `FILTER_OPTIONS`, `type RelationshipFilter`
- Consumes (from Task 2): `RelationshipFilterDropdown` default export
- Produces: `GraphCanvas` gains two required props `filter: RelationshipFilter` and `onFilterChange: (filter: RelationshipFilter) => void`; `App.tsx` owns `filter` state and derives `visible` via `filterGraph`.

- [ ] **Step 1: Update GraphCanvas props and overlay**

In `frontend/src/components/graph/GraphCanvas.tsx`:

Add import after the `ConnectionLines` import (line 3):

```tsx
import RelationshipFilterDropdown from './RelationshipFilterDropdown'
import { FILTER_OPTIONS } from '../../lib/relationshipFilter'
import type { RelationshipFilter } from '../../lib/relationshipFilter'
```

Extend the props interface (lines 38-48) with two new members:

```tsx
interface GraphCanvasProps {
  nodes: GraphNodeView[]
  edges: GraphEdgeView[]
  activeNodeId: string | null
  hoveredNodeId: string | null
  refitSignal: number
  filter: RelationshipFilter
  onFilterChange: (filter: RelationshipFilter) => void
  onSelectNode: (id: string) => void
  onHoverNode: (id: string | null) => void
  onMoveNode: (nodeId: string, x: number, y: number) => void
  onLayoutNodes: (positions: Record<string, { x: number; y: number }>) => void
}
```

Destructure the two new props in the function signature (after `refitSignal`):

```tsx
export default function GraphCanvas({
  nodes,
  edges,
  activeNodeId,
  hoveredNodeId,
  refitSignal,
  filter,
  onFilterChange,
  onSelectNode,
  onHoverNode,
  onMoveNode,
  onLayoutNodes,
}: GraphCanvasProps) {
```

After the `<FloatingControls ... />` block (ends at line 376), add the dropdown and the empty-result hint, so the full return becomes:

```tsx
      <FloatingControls
        onZoomIn={() => zoomCenter(1.2)}
        onZoomOut={() => zoomCenter(1 / 1.2)}
        onFit={fitToContent}
        onSweep={handleSweep}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <RelationshipFilterDropdown value={filter} onChange={onFilterChange} />
      </div>
      {filter !== 'all' && nodes.length === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 glass-panel rounded-lg px-4 py-2 font-label-sm text-on-surface-variant">
          No {FILTER_OPTIONS.find((option) => option.id === filter)?.label ?? 'matching'}{' '}
          relationships in this graph
        </div>
      )}
    </div>
  )
```

- [ ] **Step 2: Update App.tsx imports and state**

In `frontend/src/App.tsx`:

Add imports after the existing `GraphCanvas` import (line 3):

```tsx
import { filterGraph, type RelationshipFilter } from './lib/relationshipFilter'
```

Add state after `refitSignal` (line 21):

```tsx
  const [filter, setFilter] = useState<RelationshipFilter>('all')
```

Add a `handleFilterChange` callback after `handleRecompile` (after line 84):

```tsx
  const handleFilterChange = useCallback((next: RelationshipFilter) => {
    setFilter(next)
    setRefitSignal((n) => n + 1)
  }, [])
```

- [ ] **Step 3: Update App.tsx lifecycle and derived values**

In `frontend/src/App.tsx`:

Add `setFilter('all')` inside `handleGraphCompiled` (after `setGraph(mapped)`), inside `handleOpenWorkspace` (next to `setHoveredNodeId(null)`), and inside `handleRecompile` (next to `setRecompileError(null)`):

```tsx
  const handleGraphCompiled = useCallback((result: CompileResponse) => {
    const mapped = mapGraphPayload(result.graph)
    setGraph(mapped)
    setFilter('all')
    setActiveNodeId((prev) => prev ?? mapped.nodes[0]?.id ?? null)
  }, [])
```

```tsx
  const handleOpenWorkspace = useCallback((workspace: WorkspaceResponse) => {
    const payload = workspace.graph_payload
    if (payload) {
      setGraph(mapGraphPayload(payload as unknown as GraphPayload))
      setActiveNodeId(null)
      setHoveredNodeId(null)
    }
    setWorkspaceId(workspace.id)
    setIsRecompiling(false)
    setRecompileError(null)
    setFilter('all')
    setScreen('workspace')
  }, [])
```

```tsx
  const handleRecompile = useCallback(async () => {
    if (!workspaceId) return
    setIsRecompiling(true)
    setRecompileError(null)
    setFilter('all')
    try {
      const result = await recompileWorkspace(workspaceId)
      setGraph(mapGraphPayload(result.graph))
      setActiveNodeId(result.graph.nodes[0]?.id ?? null)
      setRefitSignal((n) => n + 1)
    } catch (err) {
      setRecompileError(err instanceof Error ? err.message : 'Recompile failed.')
    } finally {
      setIsRecompiling(false)
    }
  }, [workspaceId])
```

Add the `visible` memo and the active-node-clearing effect after `handleFilterChange`:

```tsx
  const visible = useMemo(
    () => (graph ? filterGraph(graph.nodes, graph.edges, filter) : { nodes: [], edges: [] }),
    [graph, filter]
  )

  useEffect(() => {
    if (!graph || !activeNodeId) return
    const isActiveVisible = visible.nodes.some((node) => node.id === activeNodeId)
    if (!isActiveVisible) setActiveNodeId(null)
  }, [graph, filter, activeNodeId, visible.nodes])
```

Add `useMemo` and `useEffect` to the existing React import (line 1):

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
```

Replace the `activeNode` fallback (lines 128-129) so the inspection panel falls back to the first visible node:

```tsx
  const activeNode =
    graph.nodes.find((node) => node.id === activeNodeId) ?? visible.nodes[0] ?? null
```

- [ ] **Step 4: Update App.tsx workspace JSX**

Replace the workspace `<main>` block (lines 141-154) so `GraphCanvas` receives the visible graph and the filter props:

```tsx
      <main className="flex-1 relative flex overflow-hidden">
        <GraphCanvas
          nodes={visible.nodes}
          edges={visible.edges}
          activeNodeId={activeNodeId}
          hoveredNodeId={hoveredNodeId}
          refitSignal={refitSignal}
          filter={filter}
          onFilterChange={handleFilterChange}
          onSelectNode={setActiveNodeId}
          onHoverNode={setHoveredNodeId}
          onMoveNode={handleMoveNode}
          onLayoutNodes={handleLayoutNodes}
        />
        {activeNode && <InspectionPanel node={activeNode} />}
      </main>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: exits 0.

- [ ] **Step 6: Build**

Run: `npm run build` in `frontend/`
Expected: successful `vite build`.

- [ ] **Step 7: Manual verification**

Run `npm run dev` in `frontend/`, open a compiled workspace, and check:
1. Dropdown renders top-center of the canvas with the count of six options, "Show All" selected.
2. Selecting "Limitations" leaves only `LIMITATION -> CLAIM` and `LIMITATION -> METHODOLOGY` edges plus their nodes; everything else disappears; viewport auto-fits.
3. Selecting a group with no matches shows "No <group> relationships in this graph".
4. Selecting "Show All" restores the full graph.
5. Selecting "Contradictions" shows every `CHALLENGES` edge regardless of categories.
6. The detail of the last-selected node can still be inspected even when its node is filtered out (panel keeps operating on the full graph).
7. Navigating to the dashboard and reopening a workspace resets the filter to "Show All".

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/graph/GraphCanvas.tsx frontend/src/App.tsx
git commit -m "feat(frontend): wire relationship filter into the graph canvas"
```

---

## Spec Coverage Check

- Requirement 1 (six filter options) → Task 1 (`FILTER_OPTIONS`) + Task 2 (dropdown menu).
- Requirement 2 (full isolation) → Task 1 `filterGraph` + Task 3 (App passes `visible` to canvas).
- Requirement 3 (no group overlap; supportive-evidence-only) → Task 1 `matchesRule` `claims_evidence` case enforces `supports`.
- Floating dropdown placement → Task 2 + Task 3 (top-center overlay inside the viewport).
- Reset on new graph load → Task 3 (`setFilter('all')` in three handlers).
- Zero-match hint → Task 3 empty-hint overlay.
- Active node cleared when filtered out; panel falls back to first visible node → Task 3 `visible` effect + `activeNode` fallback.
- Auto-fit on filter change (no re-layout) → Task 3 `handleFilterChange` bumps `refitSignal`.
- No new test framework; verified via `npm run build` → Global Constraints + per-task build/typecheck steps.