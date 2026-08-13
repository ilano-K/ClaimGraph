import { Fragment, memo } from 'react'
import type { GraphEdgeView, GraphNodeView, EdgeRelation } from '../../api/types'
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
}

interface ConnectionLinesProps {
  edges: GraphEdgeView[]
  nodes: GraphNodeView[]
  hoveredNodeId: string | null
}

/**
 * Renders the graph edges between node cards. Each edge gets an arrowhead
 * (source -> target) and a persistent pill label showing its `relation`. The
 * line visually reflects the verb action:
 *
 * - SUPPORTS:  solid, stroke color matches the source node's accent.
 * - LIMITS:    dashed with a slow opacity pulse (yellow tint).
 * - CAUSES:    solid, red/amber tint, thicker stroke.
 * - CHALLENGES: dashed, red tint, thickest stroke.
 *
 * When a node is hovered, edges touching that node are `emphasized` (brighten +
 * thicken) while every other edge and its pill are `dimmed` to near-invisible,
 * so the hovered node's connections stand out. The SVG lives inside the
 * pan/zoom wrapper, so its coordinate system matches the world coordinates
 * used by the node cards.
 */
function EdgeLabel({ edge, state }: EdgeLabelProps) {
  const text = edge.relation.toUpperCase()
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
  causes: '#F97316',
  challenges: '#EF4444',
}

function colorSlug(color: string) {
  return color.replace('#', '')
}

function ConnectionLines({ edges, nodes, hoveredNodeId }: ConnectionLinesProps) {
  const toneByNode = new Map<string, keyof typeof NODE_ACCENT>()
  for (const node of nodes) {
    toneByNode.set(node.id, node.presentation.tone)
  }

  const coloredEdges = edges.map((edge) => {
    let color = EDGE_TINT[edge.relation as Exclude<EdgeRelation, 'supports'>]
    if (edge.relation === 'supports') {
      const tone = toneByNode.get(edge.source)
      color = (tone && NODE_ACCENT[tone]) || '#22D3EE'
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
          return edge.relation && edge.label ? (
            <EdgeLabel key={`label-${edge.id}`} edge={edge} state={state} />
          ) : null
        })}
      </g>
    </svg>
  )
}

export default memo(ConnectionLines)
