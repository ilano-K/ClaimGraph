import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import NodeCard from './NodeCard'
import ConnectionLines from './ConnectionLines'
import FloatingControls from './FloatingControls'
import RelationshipFilterDropdown from './RelationshipFilterDropdown'
import ContentModeToggle from './ContentModeToggle'
import type { ContentMode } from './ContentModeToggle'
import { FILTER_OPTIONS } from '../../lib/relationshipFilter'
import type { RelationshipFilter } from '../../lib/relationshipFilter'
import { buildEdgePath, edgeMidpoint, worldBounds } from '../../lib/graphGeometry'
import { computeSweepLayout } from '../../lib/sweepLayout'
import { clamp } from '../../lib/utils'
import type { GraphEdgeView, GraphNodeView } from '../../api/types'

const MIN_SCALE = 0.25
const MAX_SCALE = 3
const EDGE_PADDING = 40

interface View {
  x: number
  y: number
  scale: number
}

interface DragState {
  type: 'pan' | 'node'
  pointerId: number
  startX: number
  startY: number
  viewX?: number
  viewY?: number
  nodeId?: string
  nodeX?: number
  nodeY?: number
  scale?: number
}

interface NodeSize {
  width: number
  height: number
}

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

/**
 * The graph workspace. Wraps the SVG edge layer + node cards in a single
 * "world" that can be panned and zoomed; nodes can also be dragged and the
 * edges re-route themselves from the live node positions so connections
 * never break.
 */
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
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })
  const hasFittedRef = useRef(false)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [nodeSizes, setNodeSizes] = useState<Record<string, NodeSize>>({})
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [contentMode, setContentMode] = useState<ContentMode>('collapsed')

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = viewportRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (el.requestFullscreen) {
        await el.requestFullscreen()
      }
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  const handleNodeMeasure = useCallback((id: string, size: NodeSize) => {
    setNodeSizes((prev) => {
      const existing = prev[id]
      if (existing && existing.width === size.width && existing.height === size.height) {
        return prev
      }
      return { ...prev, [id]: size }
    })
  }, [])

  const sizedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const measured = nodeSizes[node.id]
        if (!measured) return node
        return {
          ...node,
          presentation: {
            ...node.presentation,
            width: measured.width,
            height: measured.height,
          },
        }
      }),
    [nodes, nodeSizes]
  )

  const routedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const source = sizedNodes.find((n) => n.id === edge.source)
        const target = sizedNodes.find((n) => n.id === edge.target)
        if (!source || !target) return edge
        return {
          ...edge,
          path: buildEdgePath(source, target),
          label: edgeMidpoint(source, target),
        }
      }),
    [edges, sizedNodes]
  )

  /* ------------------------------------------------------------------ */
  /* Pan / zoom                                                          */
  /* ------------------------------------------------------------------ */

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    setView((prev) => {
      const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE)
      const wx = (px - prev.x) / prev.scale
      const wy = (py - prev.y) / prev.scale
      return { x: px - wx * scale, y: py - wy * scale, scale }
    })
  }, [])

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = viewportRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
    },
    [zoomAt]
  )

  const fitToContent = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const bounds = worldBounds(sizedNodes)
    const worldWidth = bounds.maxX - bounds.minX
    const worldHeight = bounds.maxY - bounds.minY
    if (worldWidth <= 0 || worldHeight <= 0) return

    const scale = clamp(
      Math.min(
        (rect.width - EDGE_PADDING * 2) / worldWidth,
        (rect.height - EDGE_PADDING * 2) / worldHeight
      ),
      MIN_SCALE,
      MAX_SCALE
    )
    const cx = bounds.minX + worldWidth / 2
    const cy = bounds.minY + worldHeight / 2
    setView({
      x: rect.width / 2 - cx * scale,
      y: rect.height / 2 - cy * scale,
      scale,
    })
  }, [sizedNodes])

  const measuredCount = Object.keys(nodeSizes).length

  useEffect(() => {
    if (hasFittedRef.current) return
    fitToContent()
    if (measuredCount >= nodes.length) hasFittedRef.current = true
  }, [measuredCount, nodes.length, fitToContent])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (!hasFittedRef.current) fitToContent()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fitToContent])

  // Refit only when the refit signal actually changes, not when `fitToContent`
  // is rebuilt (hovering a collapsed node resizes the card and changes its
  // identity on every size report). `lastRefitRef` records the last handled
  // signal so repeated identity changes can't snap the view back out of a zoom.
  const lastRefitRef = useRef(0)
  useEffect(() => {
    if (refitSignal <= 0 || refitSignal === lastRefitRef.current) return
    lastRefitRef.current = refitSignal
    hasFittedRef.current = false
    fitToContent()
  }, [refitSignal, fitToContent])

  /* ------------------------------------------------------------------ */
  /* Sweep layout                                                        */
  /* ------------------------------------------------------------------ */

  const handleSweep = useCallback(() => {
    const positions = computeSweepLayout(
      sizedNodes.map((node) => ({
        id: node.id,
        width: node.presentation.width,
        height: node.presentation.height,
      })),
      edges.map((edge) => ({ source: edge.source, target: edge.target }))
    )
    const positionMap: Record<string, { x: number; y: number }> = {}
    for (const [id, point] of positions) positionMap[id] = point
    onLayoutNodes(positionMap)
    requestAnimationFrame(() => fitToContent())
  }, [sizedNodes, edges, onLayoutNodes, fitToContent])

  // Auto-sweep the (filtered) visible graph whenever the relationship filter
  // changes, so each isolated pathway re-lays itself out. Skipped on the
  // initial render since the graph is already laid out then.
  const previousFilterRef = useRef(filter)
  useEffect(() => {
    if (previousFilterRef.current === filter) return
    previousFilterRef.current = filter
    handleSweep()
  }, [filter, handleSweep])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12)
    },
    [zoomAt]
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    // Native `wheel` listener so preventDefault() is honored (React uses a
    // passive wheel listener by default which would ignore it).
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  /* ------------------------------------------------------------------ */
  /* Panning the canvas                                                   */
  /* ------------------------------------------------------------------ */

  const handleViewportPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target
    if (target instanceof Element) {
      const interactive = target.closest('button, input, select, textarea, a, [role="button"]')
      if (interactive) return
    }
    const el = viewportRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    dragRef.current = {
      type: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /* Dragging a node                                                      */
  /* ------------------------------------------------------------------ */

  const handleNodePointerDown = useCallback(
    (node: GraphNodeView, e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const el = viewportRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      dragRef.current = {
        type: 'node',
        pointerId: e.pointerId,
        nodeId: node.id,
        startX: e.clientX,
        startY: e.clientY,
        nodeX: node.presentation.x,
        nodeY: node.presentation.y,
        scale: viewRef.current.scale,
      }
      onSelectNode(node.id)
      setDraggingNodeId(node.id)
    },
    [onSelectNode]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return

      if (drag.type === 'pan') {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        setView((prev) => ({
          ...prev,
          x: (drag.viewX ?? 0) + dx,
          y: (drag.viewY ?? 0) + dy,
        }))
      } else if (drag.type === 'node' && drag.nodeId !== undefined) {
        const dx = (e.clientX - drag.startX) / (drag.scale ?? 1)
        const dy = (e.clientY - drag.startY) / (drag.scale ?? 1)
        onMoveNode(drag.nodeId, (drag.nodeX ?? 0) + dx, (drag.nodeY ?? 0) + dy)
      }
    },
    [onMoveNode]
  )

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    setDraggingNodeId(null)
    const el = viewportRef.current
    if (el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      ref={viewportRef}
      className="graph-viewport flex-1 relative overflow-hidden touch-none select-none"
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <ConnectionLines edges={routedEdges} nodes={sizedNodes} hoveredNodeId={hoveredNodeId} />
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
      </div>
      <FloatingControls
        onZoomIn={() => zoomCenter(1.2)}
        onZoomOut={() => zoomCenter(1 / 1.2)}
        onFit={fitToContent}
        onSweep={handleSweep}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <RelationshipFilterDropdown value={filter} onChange={onFilterChange} />
        <ContentModeToggle value={contentMode} onChange={setContentMode} />
      </div>
      {filter !== 'all' && nodes.length === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 glass-panel rounded-lg px-4 py-2 font-label-sm text-on-surface-variant">
          No {FILTER_OPTIONS.find((option) => option.id === filter)?.label ?? 'matching'}{' '}
          relationships in this graph
        </div>
      )}
    </div>
  )
}
