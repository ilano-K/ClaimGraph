# Node Card Content Toggle — Design

**Date:** 2026-08-13
**Status:** Approved
**Scope:** Frontend-only, graph canvas node cards.

## Problem

Every node card on the canvas always renders its summary and confidence bar,
which clutters dense graphs (up to 40 nodes). Users want cards to show only
title + category by default, reveal content on hover, and have a global switch
to show all content at once.

## Requirements

1. Node cards default to **Collapsed**: badge + title + three-dots icon only.
2. In collapsed mode, hovering a card reveals its **content** (summary text +
   confidence bar) on that card.
3. A global **Collapsed / Expanded** switch on the canvas. `Expanded` shows
   content on every card permanently (hover not required).
4. Default = Collapsed each time the canvas loads (transient view state, not
   persisted). Edges keep re-anchoring to live card geometry via the existing
   size-reporting mechanism.

## Design

- New `ContentMode` type: `'collapsed' | 'expanded'`.
- New component `frontend/src/components/graph/ContentModeToggle.tsx`: a
  compact two-segment control ("Collapsed | Expanded") styled with `glass-panel`,
  rendered beside the existing Relationship Filter dropdown at the top-center
  of the graph viewport.
- `GraphCanvas.tsx` owns `contentMode` local state and passes it to each
  `NodeCard`.
- `NodeCard.tsx` adds a local `hovered` state and renders the summary paragraph
  + confidence bar only when `contentMode === 'expanded' || hovered`. The badge,
  title, and three-dots icon always render. ResizeObserver keeps reporting the
  live card size so edges re-route when content toggles.

## Out of scope

- Animation/transitions, per-card buttons, persistence across sessions,
  backend changes.