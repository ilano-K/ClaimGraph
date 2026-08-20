import type { WorkspaceResponse } from '../api/types'
import type { WorkspaceMetric, WorkspaceSummary } from '../data/dashboardData'
import { formatRelativeTime } from './utils'

type CardStatus = WorkspaceSummary['status']

function cardStatus(workspace: WorkspaceResponse): CardStatus {
  const docs = workspace.documents ?? []
  if (docs.length === 0) return 'awaiting'
  if (docs.some((doc) => doc.status === 'analyzing')) return 'compiling'
  if (docs.some((doc) => doc.status === 'failed')) return 'failed'
  return 'ready'
}

/**
 * Document counts for the card, derived from the workspace's document list
 * (per-document analysis is the unit of work now, not a combined graph).
 */
function documentCounts(workspace: WorkspaceResponse) {
  const docs = workspace.documents ?? []
  return {
    total: docs.length,
    analyzed: docs.filter((doc) => doc.status === 'ready').length,
  }
}

/**
 * Node-count metrics summed across documents that have been analyzed.
 */
function nodeCounts(workspace: WorkspaceResponse): WorkspaceMetric[] {
  const docs = workspace.documents ?? []
  const claims = docs.reduce((sum, doc) => sum + doc.claim_count, 0)
  const evidence = docs.reduce((sum, doc) => sum + doc.evidence_count, 0)
  return [
    { label: 'Core Claims', value: claims, tone: 'cyan' },
    { label: 'Empirical Evidence', value: evidence, tone: 'green' },
  ]
}

/**
 * Converts a backend `WorkspaceResponse` into the dashboard card's view model.
 */
export function mapWorkspaceResponse(response: WorkspaceResponse): WorkspaceSummary {
  const counts = documentCounts(response)
  return {
    id: response.id,
    ingress: response.ingress_mode === 'mcp' ? 'MCP' : 'HTTP',
    title: response.name,
    lastModified: formatRelativeTime(response.updated_at),
    documentLabel:
      counts.total === 0
        ? 'No documents yet'
        : `${counts.total} document${counts.total === 1 ? '' : 's'} · ${counts.analyzed} analyzed`,
    status: cardStatus(response),
    metrics: nodeCounts(response),
  }
}