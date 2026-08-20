import type { NodeTone } from '../api/types'

/**
 * Map of accent tone -> tailwind/css classes used by node cards. This is a
 * presentational style map (not fake content), so it lives on even though the
 * graph itself now comes from the backend.
 */
export const NODE_TONES: Record<NodeTone, { badge: string; progress: string; card: string }> = {
  red: {
    badge: 'bg-red-500/10 border border-red-500 text-red-400',
    progress: 'bg-red-500',
    card: 'node-red',
  },
  green: {
    badge: 'bg-emerald-500/10 border border-emerald-500 text-emerald-400',
    progress: 'bg-emerald-500',
    card: 'node-green',
  },
  purple: {
    badge: 'bg-purple-500/10 border border-purple-500 text-purple-400',
    progress: 'bg-purple-500',
    card: 'node-purple',
  },
  cyan: {
    badge: 'bg-cyan-500/10 border border-cyan-500 text-cyan-400',
    progress: 'bg-cyan-500',
    card: 'node-cyan',
  },
  yellow: {
    badge: 'bg-yellow-500/10 border border-yellow-500 text-yellow-400',
    progress: 'bg-yellow-500',
    card: 'node-yellow',
  },
  amber: {
    badge: 'bg-amber-500/10 border border-amber-500 text-amber-400',
    progress: 'bg-amber-500',
    card: 'node-amber',
  },
}

/**
 * Solid accent hex per tone, matching the node card border. Used to color
 * SUPPORTS edges so they match their source node.
 */
export const NODE_ACCENT: Record<NodeTone, string> = {
  red: '#EF4444',
  green: '#10B981',
  purple: '#8B5CF6',
  cyan: '#22D3EE',
  yellow: '#EAB308',
  amber: '#F59E0B',
}

/**
 * Pill style for claims with no incoming evidence edge.
 */
export const NO_EVIDENCE_BADGE =
  'bg-amber-500/10 border border-amber-500 text-amber-400'
