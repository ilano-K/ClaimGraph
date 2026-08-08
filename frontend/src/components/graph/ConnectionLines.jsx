import { memo } from 'react'

/**
 * Renders the animated dashed edges between claim cards. When any node is
 * hovered the full trail brightens, mirroring the reference behavior.
 *
 * The SVG lives inside the pan/zoom wrapper, so its coordinate system matches
 * the world coordinates used by the node cards. A fixed, generous canvas size
 * keeps the paths drawable regardless of where nodes are dragged to.
 */
function ConnectionLines({ edges, highlighted }) {
  return (
    <svg
      className="svg-container"
      style={{ width: 6000, height: 4000, overflow: 'visible' }}
    >
      {edges.map((edge) => (
        <path
          key={edge.id}
          className={highlighted ? 'connection-line highlighted' : 'connection-line'}
          d={edge.path}
        />
      ))}
    </svg>
  )
}

export default memo(ConnectionLines)