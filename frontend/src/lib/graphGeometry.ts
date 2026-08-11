/**
 * Graph layout math. Nodes live in "world coordinates" (px) declared in the
 * presentation data. Edges are re-routed from the live node positions so a
 * connection always joins the two cards regardless of how they are dragged.
 */

import type { GraphNodeView } from '../api/types'

export interface Point {
  x: number
  y: number
}

export function nodeCenter(node: GraphNodeView): Point {
  const { x, y, width, height } = node.presentation
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * Picks the anchor face of a card that faces the other node, returning the
 * anchor point in world coordinates.
 */
function anchorPoint(node: GraphNodeView, other: GraphNodeView): Point {
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
 * Moves a point `distance` (px) toward `toward`, returning a new point.
 */
function insetPoint(point: Point, toward: Point, distance: number): Point {
  const dx = toward.x - point.x
  const dy = toward.y - point.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: point.x, y: point.y }
  const f = distance / len
  return { x: point.x + dx * f, y: point.y + dy * f }
}

interface EdgeControls {
  start: Point
  c1: Point
  c2: Point
  end: Point
}

/**
 * Computes the cubic bezier control points for an edge between two live nodes.
 * The endpoint anchors are pulled `inset` px toward the curve so an arrowhead
 * rendered at the end stays visible just outside the target card (cards are
 * HTML elements painted above the SVG and would otherwise hide the tip).
 */
function edgeControlPoints(source: GraphNodeView, target: GraphNodeView, inset = 10): EdgeControls {
  const start = anchorPoint(source, target)
  const end = anchorPoint(target, source)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const horizontal = Math.abs(dx) >= Math.abs(dy)

  const c1: Point = horizontal
    ? { x: start.x + dx * 0.35, y: start.y }
    : { x: start.x, y: start.y + dy * 0.35 }
  const c2: Point = horizontal
    ? { x: end.x - dx * 0.35, y: end.y }
    : { x: end.x, y: end.y - dy * 0.35 }

  return {
    start: insetPoint(start, c1, inset),
    c1,
    c2,
    end: insetPoint(end, c2, inset),
  }
}

/**
 * Builds a smooth cubic-bezier edge path between two live nodes.
 */
export function buildEdgePath(source: GraphNodeView, target: GraphNodeView): string {
  const { start, c1, c2, end } = edgeControlPoints(source, target)
  return [
    `M ${start.x} ${start.y}`,
    `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  ].join(' ')
}

/**
 * The point at the middle (t = 0.5) of an edge's curve, in world
 * coordinates. Used to anchor edge labels on the path itself.
 */
export function edgeMidpoint(source: GraphNodeView, target: GraphNodeView): Point {
  const { start, c1, c2, end } = edgeControlPoints(source, target)
  const t = 0.5
  const mt = 1 - t
  return {
    x:
      mt * mt * mt * start.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * end.x,
    y:
      mt * mt * mt * start.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * end.y,
  }
}

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Bounding box (in world coordinates) that contains every node card.
 */
export function worldBounds(nodes: GraphNodeView[]): WorldBounds {
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
