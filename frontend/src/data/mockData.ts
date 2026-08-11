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
  blue: {
    badge: 'bg-blue-500/10 border border-blue-500 text-blue-400',
    progress: 'bg-blue-500',
    card: 'node-blue',
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
}
