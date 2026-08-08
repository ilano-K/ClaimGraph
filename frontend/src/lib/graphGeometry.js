/**
 * Graph layout math. Nodes live in "world coordinates" (px) declared in the
 * presentation data. Edges are re-routed from the live node positions so a
 * connection always joins the two cards regardless of how they are dragged.
 */

export function nodeCenter(node) {
  const { x, y, width, height } = node.presentation
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * Picks the anchor face of a card that faces the other node, returning the
 * anchor point in world coordinates.
 */
function anchorPoint(node, other) {
  const { x, y, width, height } = node.presentation
  const me = nodeCenter(node)
  const them = nodeCenter(other)
  const dx = them.x - me.x
  const dy = them.y - me.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal travel: use the left/right faces.
    return dx >= 0
      ? { x: x + width, y: y + height * 0.45 }
      : { x, y: y + height * 0.45 }
  }
  // Vertical travel: use the top/bottom faces.
  return dy >= 0
    ? { x: x + width * 0.5, y: y + height }
    : { x: x + width * 0.5, y }
}

/**
 * Builds a smooth cubic-bezier edge path between two live nodes.
 */
export function buildEdgePath(source, target) {
  const start = anchorPoint(source, target)
  const end = anchorPoint(target, source)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const horizontal = Math.abs(dx) >= Math.abs(dy)

  const c1 = horizontal
    ? { x: start.x + dx * 0.35, y: start.y }
    : { x: start.x, y: start.y + dy * 0.35 }
  const c2 = horizontal
    ? { x: end.x - dx * 0.35, y: end.y }
    : { x: end.x, y: end.y - dy * 0.35 }

  return [
    `M ${start.x} ${start.y}`,
    `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  ].join(' ')
}

/**
 * Bounding box (in world coordinates) that contains every node card.
 */
export function worldBounds(nodes) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const { x, y, width, height } = node.presentation
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }
  return { minX, minY, maxX, maxY }
}