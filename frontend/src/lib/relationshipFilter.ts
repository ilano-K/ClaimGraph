import type { EdgeRelation, GraphEdgeView, GraphNodeView, NodeCategory } from '../api/types'

export type RelationshipFilter =
  | 'all'
  | 'methodology'
  | 'isolated'
  | 'supports'
  | 'limits'
  | 'causes'
  | 'challenges'

export interface RelationshipFilterOption {
  id: RelationshipFilter
  label: string
  description: string
}

const DEFAULT_OPTIONS: RelationshipFilterOption[] = [
  { id: 'all', label: 'Show All', description: 'Every node and relationship on the canvas' },
]

const RELATION_META: Record<EdgeRelation, { label: string }> = {
  supports: { label: 'Supports' },
  limits: { label: 'Limits' },
  causes: { label: 'Causes' },
  challenges: { label: 'Challenges' },
}

const ALL_RELATIONS: EdgeRelation[] = ['supports', 'limits', 'causes', 'challenges']

/**
 * Builds the dropdown options for the currently loaded graph. Options are
 * dynamic: a relationship slider only appears when edges of that relation are
 * actually on the canvas, the methodology pipeline only when such edges exist,
 * and a "No Connections" option only when isolated nodes are present.
 */
export function buildFilterOptions(
  nodes: GraphNodeView[],
  edges: GraphEdgeView[]
): RelationshipFilterOption[] {
  const categoryByNodeId = new Map<string, NodeCategory>()
  for (const node of nodes) categoryByNodeId.set(node.id, node.node_category)

  const options: RelationshipFilterOption[] = [...DEFAULT_OPTIONS]

  const relationEdgeCounts = new Map<EdgeRelation, number>()
  for (const edge of edges) {
    relationEdgeCounts.set(edge.relation, (relationEdgeCounts.get(edge.relation) ?? 0) + 1)
  }

  for (const relation of ALL_RELATIONS) {
    const count = relationEdgeCounts.get(relation)
    if (!count) continue
    options.push({
      id: relation,
      label: RELATION_META[relation].label,
      description: `${count} ${count === 1 ? 'connection' : 'connections'}`,
    })
  }

  const hasMethodologyPipeline = edges.some((edge) => {
    const sourceCategory = categoryByNodeId.get(edge.source)
    const targetCategory = categoryByNodeId.get(edge.target)
    return (
      edge.relation === 'supports' &&
      sourceCategory === 'methodology' &&
      (targetCategory === 'methodology' || targetCategory === 'evidence')
    )
  })
  if (hasMethodologyPipeline) {
    options.push({
      id: 'methodology',
      label: 'Methodology Pipeline',
      description: 'METHODOLOGY -> METHODOLOGY & METHODOLOGY -> EVIDENCE',
    })
  }

  const edgesIndex = new Set<string>()
  for (const edge of edges) {
    edgesIndex.add(edge.source)
    edgesIndex.add(edge.target)
  }
  const isolatedCount = nodes.filter((node) => !edgesIndex.has(node.id)).length
  if (isolatedCount > 0) {
    options.push({
      id: 'isolated',
      label: 'No Connections',
      description: `${isolatedCount} ${isolatedCount === 1 ? 'node' : 'nodes'} with no edges`,
    })
  }

  return options
}

function matchesRule(
  filter: RelationshipFilter,
  relation: EdgeRelation,
  sourceCategory: NodeCategory,
  targetCategory: NodeCategory
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'supports':
      return relation === 'supports'
    case 'limits':
      return relation === 'limits'
    case 'causes':
      return relation === 'causes'
    case 'challenges':
      return relation === 'challenges'
    case 'methodology':
      return (
        relation === 'supports' &&
        ((sourceCategory === 'methodology' && targetCategory === 'methodology') ||
          (sourceCategory === 'methodology' && targetCategory === 'evidence'))
      )
    case 'isolated':
      return false
  }
}

export interface FilteredGraph {
  nodes: GraphNodeView[]
  edges: GraphEdgeView[]
}

/**
 * Full-isolation filter: returns the edges matching `filter` and every node
 * touching at least one matching edge. `'all'` returns the inputs unchanged.
 * `'isolated'` returns just the nodes that have no edges at all. Nodes/edges
 * not touching a matched edge are removed entirely.
 */
export function filterGraph(
  nodes: GraphNodeView[],
  edges: GraphEdgeView[],
  filter: RelationshipFilter
): FilteredGraph {
  if (filter === 'all') return { nodes, edges }

  if (filter === 'isolated') {
    const edgesIndex = new Set<string>()
    for (const edge of edges) {
      edgesIndex.add(edge.source)
      edgesIndex.add(edge.target)
    }
    return { nodes: nodes.filter((node) => !edgesIndex.has(node.id)), edges: [] }
  }

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