# Node Card Content Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users collapse node cards to title+badge with hover-to-reveal content, plus a global Collapsed/Expanded switch on the graph canvas.

**Architecture:** `GraphCanvas` owns a `contentMode` state (`'collapsed' | 'expanded'`), renders a new segmented toggle beside the Relationship Filter dropdown, and passes the mode to every `NodeCard`. `NodeCard` keeps a local `hovered` state and conditionally renders summary + confidence bar when `contentMode === 'expanded' || hovered`.

**Tech Stack:** React 18 + TypeScript + Tailwind. Icon wrapper and `cn` util.

## Global Constraints

- Frontend only — no backend files modified.
- No new test framework; verify each task with `npm run typecheck` + `npm run build` in `frontend/`.
- No animation/transitions added.
- Default mode is `'collapsed'` on each canvas mount (transient view state, not persisted).
- Existing `onMeasure`/ResizeObserver size reporting must keep working so edges re-anchor when card height changes.
- Commit `docs/` paths (under `.gitignore`) with `git add -f`.

---

### Task 1: Content mode type + toggle component

**Files:**
- Create: `frontend/src/components/graph/ContentModeToggle.tsx`

**Interfaces:**
- Produces (consumed by Task 2/Task 3):
  - `export type ContentMode = 'collapsed' | 'expanded'`
  - `interface ContentModeToggleProps { value: ContentMode; onChange: (mode: ContentMode) => void }`
  - `export default function ContentModeToggle({ value, onChange }: ContentModeToggleProps)`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/graph/ContentModeToggle.tsx` with exactly this content:

```tsx
import { cn } from '../../lib/utils'

export type ContentMode = 'collapsed' | 'expanded'

interface ContentModeToggleProps {
  value: ContentMode
  onChange: (mode: ContentMode) => void
}

const MODES: Array<{ id: ContentMode; label: string }> = [
  { id: 'collapsed', label: 'Collapsed' },
  { id: 'expanded', label: 'Expanded' },
]

/**
 * Two-segment "Collapsed | Expanded" switch for node card content. Collapsed
 * hides card content until the card is hovered; Expanded shows it on every
 * card. Matches the glass-panel styling of the related filter dropdown.
 */
export default function ContentModeToggle({ value, onChange }: ContentModeToggleProps) {
  return (
    <div className="glass-panel rounded-lg p-0.5 flex items-center gap-0.5 font-label-md text-label-sm">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={cn(
            'px-3 py-1.5 rounded-md transition-colors',
            mode.id === value ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-white/10'
          )}
        >
          {mode.label}
        </button>
      ))}
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
git add frontend/src/components/graph/ContentModeToggle.tsx
git commit -m "feat(frontend): add node card content mode toggle"
```

---

### Task 2: NodeCard hover-reveal content

**Files:**
- Modify: `frontend/src/components/graph/NodeCard.tsx` (imports line 1; props interface lines 7-15; component lines 21-29; JSX lines 79-85)

**Interfaces:**
- Consumes (from Task 1): `type ContentMode` from `./ContentModeToggle`

- [ ] **Step 1: Update imports and props**

In `frontend/src/components/graph/NodeCard.tsx`:

Replace the React import (line 1) to add `useState`:

```tsx
import { memo, useEffect, useRef, useState, type PointerEvent } from 'react'
```

Add a `ContentMode` import after the `GraphNodeView` import (line 5):

```tsx
import type { ContentMode } from './ContentModeToggle'
```

Add `contentMode` to the props interface (after `isActive`):

```tsx
interface NodeCardProps {
  node: GraphNodeView
  isActive: boolean
  contentMode: ContentMode
  isDragging: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onMeasure: (id: string, size: { width: number; height: number }) => void
  onNodePointerDown: (node: GraphNodeView, e: PointerEvent<HTMLDivElement>) => void
}
```

Destructure it in the component signature (after `isActive`):

```tsx
function NodeCard({
  node,
  isActive,
  contentMode,
  isDragging,
  onSelect,
  onHover,
  onMeasure,
  onNodePointerDown,
}: NodeCardProps) {
```

- [ ] **Step 2: Add local hover state**

Add after `const cardRef = useRef<HTMLDivElement>(null)`:

```tsx
  const [hovered, setHovered] = useState(false)
```

Add `showContent` after the `tone`/`cardRef` declarations:

```tsx
  const showContent = contentMode === 'expanded' || hovered
```

- [ ] **Step 3: Toggle hover handlers and hide content when collapsed**

In the `<div>` JSX, update the hover handlers to also update local hover state:

```tsx
      onMouseEnter={() => {
        setHovered(true)
        onHover(node.id)
      }}
      onMouseLeave={() => {
        setHovered(false)
        onHover(null)
      }}
```

Wrap the summary paragraph and confidence bar (lines 79-85) so they render only when `showContent`:

```tsx
      {showContent && (
        <>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">{node.summary}</p>
          <div className="mt-1 h-1 w-full bg-surface-container rounded-full overflow-hidden">
            <div
              className={cn('h-full', tone.progress)}
              style={{ width: formatConfidence(node.confidence_score) }}
            ></div>
          </div>
        </>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: exits 0.

- [ ] **Step 5: Build**

Run: `npm run build` in `frontend/`
Expected: successful `vite build`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/graph/NodeCard.tsx
git commit -m "feat(frontend): collapse node card content until hover or expanded mode"
```

---

### Task 3: Wire content mode through GraphCanvas

**Files:**
- Modify: `frontend/src/components/graph/GraphCanvas.tsx` (imports added in Task 1's sibling area; state after `isFullscreen`; NodeCard usage in the map at lines 356-367; top overlay at lines 376-386)

**Interfaces:**
- Consumes (from Task 1): `ContentModeToggle` default export + `type ContentMode`

- [ ] **Step 1: Import and state**

In `frontend/src/components/graph/GraphCanvas.tsx`:

Add the import after the `RelationshipFilterDropdown` import:

```tsx
import ContentModeToggle from './ContentModeToggle'
import type { ContentMode } from './ContentModeToggle'
```

Add state after the `isFullscreen` state (line 74):

```tsx
  const [contentMode, setContentMode] = useState<ContentMode>('collapsed')
```

- [ ] **Step 2: Pass the mode to every node card**

Update the `NodeCard` usage in the nodes map (currently at lines 356-367) to include the new prop:

```tsx
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            isActive={node.id === activeNodeId}
            contentMode={contentMode}
            isDragging={node.id === draggingNodeId}
            onSelect={onSelectNode}
            onHover={onHoverNode}
            onMeasure={handleNodeMeasure}
            onNodePointerDown={handleNodePointerDown}
          />
        ))}
```

- [ ] **Step 3: Render the toggle next to the filter dropdown**

Update the top-center overlay so the toggle sits to the right of the filter dropdown:

```tsx
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <RelationshipFilterDropdown value={filter} onChange={onFilterChange} />
        <ContentModeToggle value={contentMode} onChange={setContentMode} />
      </div>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: exits 0.

- [ ] **Step 5: Build**

Run: `npm run build` in `frontend/`
Expected: successful `vite build`.

- [ ] **Step 6: Manual verification**

Run `npm run dev` in `frontend/`, open a compiled workspace, and check:
1. Cards render collapsed (badge + title + three-dots only).
2. Hovering a card reveals its summary + confidence bar; edges re-anchor to the grown card (no layout jump beyond edge routing).
3. Switching the control to "Expanded" shows content on all cards without hovering.
4. Switching back to "Collapsed" hides content again.
5. The toggle sits beside the Relationship Filter dropdown and stays clickable during hover over cards.
6. Relationship filtering still works — filter change still re-sweeps.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/graph/GraphCanvas.tsx
git commit -m "feat(frontend): add content mode toggle to graph canvas controls"
```

---

## Spec Coverage Check

- Collapsed default (title+badge only) → Task 2 (`showContent` false by default, mode defaults `'collapsed'` in Task 3).
- Hover reveals content → Task 2 local `hovered` state.
- Global Collapsed/Expanded switch → Task 1 (`ContentModeToggle`) + Task 3 wiring.
- Summary + confidence bar as the "content" → Task 2 wraps exactly those two elements.
- Edges re-anchor via existing size reporting → Task 2 keeps `onMeasure`/ResizeObserver untouched; card height change re-reports.
- Transient (not persisted), default collapsed each visit → Task 3 local state.
- No animation → Global Constraints.