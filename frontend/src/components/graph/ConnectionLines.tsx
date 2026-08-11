import { memo } from 'react'
import type { GraphEdgeView } from '../../api/types'

interface EdgeLabelProps {
  edge: GraphEdgeView
  highlighted: boolean
}

interface ConnectionLinesProps {
  edges: GraphEdgeView[]
  highlighted: boolean
}

/**
 * Renders the animated dashed edges between claim cards. Each edge gets an
 * arrowhead (source -> target) and a persistent pill label showing its
 * `relation`. When any node is hovered the full trail brightens, mirroring the
 * reference behavior.
 *
 * The SVG lives inside the pan/zoom wrapper, so its coordinate system matches
 * the world coordinates used by the node cards. A fixed, generous canvas size
 * keeps the paths drawable regardless of where nodes are dragged to.
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

function ConnectionLines({ edges, highlighted }: ConnectionLinesProps) {
  const markerId = highlighted ? 'arrowhead-highlighted' : 'arrowhead'
  return (
    <svg
      className="svg-container"
      style={{ width: 6000, height: 4000, overflow: 'visible' }}
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 0 1 L 8 5 L 0 9 L 2 5 z" className="edge-arrow" />
        </marker>
        <marker
          id="arrowhead-highlighted"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 0 1 L 8 5 L 0 9 L 2 5 z" className="edge-arrow highlighted" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          className={highlighted ? 'connection-line highlighted' : 'connection-line'}
          d={edge.path}
          markerEnd={`url(#${markerId})`}
        />
      ))}
      <g className="edge-labels">
        {edges.map((edge) =>
          edge.relation && edge.label ? (
            <EdgeLabel key={`label-${edge.id}`} edge={edge} highlighted={highlighted} />
          ) : null
        )}
      </g>
    </svg>
  )
}

export default memo(ConnectionLines)
