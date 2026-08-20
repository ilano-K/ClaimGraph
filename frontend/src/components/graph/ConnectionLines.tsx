import { Fragment, memo } from 'react'
import type { EdgeRelation, GraphEdgeView, GraphNodeView, NodeCategory } from '../../api/types'
import { NODE_ACCENT } from '../../data/mockData'

type EdgeState = 'normal' | 'emphasized' | 'dimmed'

function edgeState(edge: GraphEdgeView, hoveredNodeId: string | null): EdgeState {
  if (!hoveredNodeId) return 'normal'
  if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) return 'emphasized'
  return 'dimmed'
}

interface EdgeLabelProps {
  edge: GraphEdgeView
  state: EdgeState
  text: string
}

interface ConnectionLinesProps {
  edges: GraphEdgeView[]
  nodes: GraphNodeView[]
  hoveredNodeId: string | null
}

/**
 * Maps each source-category -> target-category pair allowed by the backend
 * prompt (`backend/app/prompts/claim_graph.py`, section 2) to the specific
 * verb shown on the edge pill. The LLM only emits the coarse `relation`
 * enum (SUPPORTS/LIMITS/CAUSES/CHALLENGES); the frontend picks the precise
 * label since several distinct category pairs share the same relation.
 */
const EDGE_LABELS: Record<EdgeRelation, Partial<Record<NodeCategory, Partial<Record<NodeCategory, string>>>>> = {
  supports: {
    evidence: { claim: 'VALIDATES' },
    methodology: { evidence: 'GENERATES', methodology: 'ENABLES' },
  },
  limits: {
    limitation: { claim: 'CONSTRAINS', methodology: 'COMPROMISES' },
  },
  causes: {
    claim: { consequence: 'PRODUCES', risk: 'INTRODUCES' },
  },
  challenges: {
    evidence: { claim: 'CONTRADICTS' },
    consequence: { claim: 'UNDERMINES' },
  },
}

function resolveEdgeLabel(
  relation: EdgeRelation,
  sourceCategory: GraphNodeView['node_category'] | undefined,
  targetCategory: GraphNodeView['node_category'] | undefined
): string {
  const bySource = sourceCategory && EDGE_LABELS[relation][sourceCategory]
  const label = bySource && targetCategory ? bySource[targetCategory] : undefined
  return label ?? relation.toUpperCase()
}

/**
 * Renders the graph edges between node cards. Each edge gets an arrowhead
 * (source -> target) and a persistent pill label showing its `relation`. The
 * line visually reflects the verb action:
 *
 * - SUPPORTS:  solid, stroke color matches the source node's accent.
 * - LIMITS:    dashed with a slow opacity pulse (yellow tint).
 * - CAUSES:    solid, thicker stroke; green when it produces a consequence
 *              (CLAIM -> CONSEQUENCE is positive), amber when it produces a
 *              risk (CLAIM -> RISK is negative).
 * - CHALLENGES: dashed, red tint, thickest stroke.
 *
 * When a node is hovered, edges touching that node are `emphasized` (brighten +
 * thicken) while every other edge and its pill are `dimmed` to near-invisible,
 * so the hovered node's connections stand out. The SVG lives inside the
 * pan/zoom wrapper, so its coordinate system matches the world coordinates
 * used by the node cards.
 */
function EdgeLabel({ edge, state, text }: EdgeLabelProps) {
  const label = edge.label ?? { x: 0, y: 0 }
  const pillWidth = text.length * 7 + 16
  const pillHeight = 20
  return (
    <g className={`edge-label ${state}`}>
      <rect
        x={label.x - pillWidth / 2}
        y={label.y - pillHeight / 2}
        width={pillWidth}
        height={pillHeight}
        rx={pillHeight / 2}
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  )
}

const EDGE_TINT: Record<Exclude<EdgeRelation, 'supports'>, string> = {
  limits: '#FACC15',
  causes: '#10B981',
  challenges: '#EF4444',
}

const RISK_TINT = '#F59E0B'

function colorSlug(color: string) {
  return color.replace('#', '')
}

function ConnectionLines({ edges, nodes, hoveredNodeId }: ConnectionLinesProps) {
  const toneByNode = new Map<string, keyof typeof NODE_ACCENT>()
  const categoryByNode = new Map<string, GraphNodeView['node_category']>()
  for (const node of nodes) {
    toneByNode.set(node.id, node.presentation.tone)
    categoryByNode.set(node.id, node.node_category)
  }

  const coloredEdges = edges.map((edge) => {
    let color = EDGE_TINT[edge.relation as Exclude<EdgeRelation, 'supports'>]
    if (edge.relation === 'supports') {
      const tone = toneByNode.get(edge.source)
      color = (tone && NODE_ACCENT[tone]) || '#22D3EE'
    } else if (edge.relation === 'causes' && categoryByNode.get(edge.target) === 'risk') {
      color = RISK_TINT
    }
    return { ...edge, color }
  })

  const colors = Array.from(new Set(coloredEdges.map((edge) => edge.color)))

  return (
    <svg
      className="svg-container"
      style={{ width: 6000, height: 4000, overflow: 'visible' }}
    >
      <defs>
        {colors.map((color) => (
          <Fragment key={color}>
            <marker
              id={`arrow-${colorSlug(color)}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 0 1 L 8 5 L 0 9 L 2 5 z" fill={color} />
            </marker>
            <marker
              id={`arrow-${colorSlug(color)}-hi`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 0 1 L 8 5 L 0 9 L 2 5 z" fill="#FFFFFF" />
            </marker>
          </Fragment>
        ))}
      </defs>
      {coloredEdges.map((edge) => {
        const state = edgeState(edge, hoveredNodeId)
        const markerSuffix = state === 'emphasized' ? '-hi' : ''
        return (
          <path
            key={edge.id}
            className={`connection-line edge-${edge.relation} ${state}`}
            style={{ stroke: edge.color }}
            d={edge.path}
            markerEnd={`url(#arrow-${colorSlug(edge.color)}${markerSuffix})`}
          />
        )
      })}
      <g className="edge-labels">
        {coloredEdges.map((edge) => {
          const state = edgeState(edge, hoveredNodeId)
          if (!edge.relation || !edge.label) return null
          const text = resolveEdgeLabel(
            edge.relation,
            categoryByNode.get(edge.source),
            categoryByNode.get(edge.target)
          )
          return <EdgeLabel key={`label-${edge.id}`} edge={edge} state={state} text={text} />
        })}
      </g>
    </svg>
  )
}

export default memo(ConnectionLines)
