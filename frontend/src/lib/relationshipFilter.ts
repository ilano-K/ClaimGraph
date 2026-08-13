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