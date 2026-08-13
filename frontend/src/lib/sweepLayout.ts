import * as dagre from 'dagre'

/**
 * Frontend-only layered graph layout ("sweep"). Wraps `dagre` — the same
 * engine n8n's sweep uses — to arrange nodes in a tidy left-to-right flow so
 * edges route cleanly instead of criss-crossing.
 *
 * Node ids and edges are provided in plain shapes so this module stays React-
 * free and trivially testable.
 */

export interface SweepNode {
  id: string
  width: number
  height: number
}

export interface SweepEdge {
  source: string
  target: string
}

export interface Point {
  x: number
  y: number
}

const DEFAULT_WIDTH = 256
const DEFAULT_HEIGHT = 168
const SPACING = 340
const MARGIN = 80
const TARGET_ASPECT = 1.25

const GRAPH_LABEL: dagre.GraphLabel = {
  rankdir: 'LR',
  nodesep: 36,
  ranksep: 240,
  marginx: 40,
  marginy: 40,
}

/**
 * Deterministic index-based grid, matching the pre-sweep spacing. Used as a
 * fallback when dagre cannot produce a layout for whatever reason.
 */
function gridFallback(nodes: SweepNode[]): Map<string, Point> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const positions = new Map<string, Point>()
  nodes.forEach((node, index) => {
    positions.set(node.id, {
      x: MARGIN + (index % columns) * SPACING,
      y: MARGIN + Math.floor(index / columns) * SPACING,
    })
  })
  return positions
}

/**
 * Computes top-left world coordinates ({@link Point}) for each node id based
 * on the directed edge flow. dagre places nodes by rank (longest-path
 * layering, cycle-broken) with barycenter ordering to minimize crossings;
 * the returned positions only include nodes that were supplied.
 */
export function computeSweepLayout(nodes: SweepNode[], edges: SweepEdge[]): Map<string, Point> {
  if (nodes.length === 0) return new Map()

  const g = new dagre.graphlib.Graph({ directed: true })
  g.setGraph(GRAPH_LABEL)
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.width > 0 ? node.width : DEFAULT_WIDTH,
      height: node.height > 0 ? node.height : DEFAULT_HEIGHT,
    })
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  try {
    dagre.layout(g)
  } catch {
    return gridFallback(nodes)
  }

  const centers: Array<{ id: string; cx: number; cy: number; width: number; height: number }> = []
  for (const node of nodes) {
    const placed = g.node(node.id)
    if (!placed || placed.width <= 0 || placed.height <= 0) {
      return gridFallback(nodes)
    }
    centers.push({
      id: node.id,
      cx: placed.x,
      cy: placed.y,
      width: placed.width,
      height: placed.height,
    })
  }

  // Rebalance horizontally: if the layout is taller than wide, scale every
  // x-coordinate outward from the vertical center so the final width reaches
  // TARGET_ASPECT x the height. Columns keep their left-to-right order.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const c of centers) {
    minX = Math.min(minX, c.cx - c.width / 2)
    maxX = Math.max(maxX, c.cx + c.width / 2)
    minY = Math.min(minY, c.cy - c.height / 2)
    maxY = Math.max(maxY, c.cy + c.height / 2)
  }
  const width = maxX - minX
  const height = maxY - minY
  const xScale = width > 0 && height * TARGET_ASPECT > width ? (height * TARGET_ASPECT) / width : 1
  const centerX = (minX + maxX) / 2

  const positions = new Map<string, Point>()
  for (const c of centers) {
    positions.set(c.id, {
      x: centerX + (c.cx - centerX) * xScale - c.width / 2,
      y: c.cy - c.height / 2,
    })
  }
  return positions
}