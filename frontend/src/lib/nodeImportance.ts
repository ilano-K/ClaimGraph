import type { GraphEdge, ImportanceTier } from '../api/types'

export interface NodeImportance {
  degree: number
  tier: ImportanceTier
  width: number
}

const BASE_CARD_WIDTH = 256
const MAX_WIDTH_BONUS = 88

/**
 * Degree centrality (in + out edges) per node id. Nodes with no edges at all
 * (not expected per the backend's no-orphan rule, but defensive) get 0.
 */
export function computeDegreeMap(
  nodeIds: string[],
  edges: Pick<GraphEdge, 'source' | 'target'>[]
): Map<string, number> {
  const degrees = new Map(nodeIds.map((id) => [id, 0]))
  for (const edge of edges) {
    if (degrees.has(edge.source)) degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
    if (degrees.has(edge.target)) degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1)
  }
  return degrees
}

/**
 * Degree centrality scaled relative to the most-connected node in *this*
 * graph, so a heavily-argued claim visibly outweighs a single-edge footnote
 * regardless of the graph's overall size. Drives both the card's rendered
 * width (`sweepLayout` and `mapGraph` size cards off this) and the CSS
 * emphasis tier applied in `NodeCard`, so the most important nodes in the
 * argument are legible at a glance instead of requiring a deliberate read.
 */
export function computeNodeImportance(
  nodeIds: string[],
  edges: Pick<GraphEdge, 'source' | 'target'>[]
): Map<string, NodeImportance> {
  const degrees = computeDegreeMap(nodeIds, edges)
  const maxDegree = Math.max(1, ...degrees.values())

  const result = new Map<string, NodeImportance>()
  for (const [id, degree] of degrees) {
    const ratio = degree / maxDegree
    const tier: ImportanceTier = ratio >= 0.66 ? 'high' : ratio >= 0.33 ? 'medium' : 'low'
    const width = Math.round(BASE_CARD_WIDTH + MAX_WIDTH_BONUS * ratio)
    result.set(id, { degree, tier, width })
  }
  return result
}
