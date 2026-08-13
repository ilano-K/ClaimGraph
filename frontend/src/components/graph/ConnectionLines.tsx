import { Fragment, memo } from 'react'
import type { GraphEdgeView, GraphNodeView, EdgeRelation } from '../../api/types'
import { NODE_ACCENT } from '../../data/mockData'

interface EdgeLabelProps {
  edge: GraphEdgeView
  highlighted: boolean
}

interface ConnectionLinesProps {
  edges: GraphEdgeView[]
  nodes: GraphNodeView[]
  highlighted: boolean
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
 * When any node is hovered the full trail brightens. The SVG lives inside the
 * pan/zoom wrapper, so its coordinate system matches the world coordinates
 * used by the node cards.
 */
function EdgeLabel({ edge, highlighted }: EdgeLabelProps) {
  const text = edge.relation.toUpperCase()
  const label = edge.label ?? { x: 0, y: 0 }
  const pillWidth = text.length * 7 + 16
  const pillHeight = 20
  return (
    <g className={highlighted ? 'edge-label highlighted' : 'edge-label'}>
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

function ConnectionLines({ edges, nodes, highlighted }: ConnectionLinesProps) {
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
  const highlightSuffix = highlighted ? '-hi' : ''

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
      {coloredEdges.map((edge) => (
        <path
          key={edge.id}
          className={`connection-line edge-${edge.relation}${
            highlighted ? ' highlighted' : ''
          }`}
          style={{ stroke: edge.color }}
          d={edge.path}
          markerEnd={`url(#arrow-${colorSlug(edge.color)}${highlightSuffix})`}
        />
      ))}
      <g className="edge-labels">
        {coloredEdges.map((edge) =>
          edge.relation && edge.label ? (
            <EdgeLabel key={`label-${edge.id}`} edge={edge} highlighted={highlighted} />
          ) : null
        )}
      </g>
    </svg>
  )
}

export default memo(ConnectionLines)
