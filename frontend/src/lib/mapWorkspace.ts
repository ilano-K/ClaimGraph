import type { WorkspaceResponse } from '../api/types'
import type { WorkspaceSummary } from '../data/dashboardData'
import { formatRelativeTime } from './utils'

type CardStatus = WorkspaceSummary['status']

function cardStatus(workspace: WorkspaceResponse): CardStatus {
  const docs = workspace.documents ?? []
  if (docs.length === 0) return 'awaiting'
  if (docs.some((doc) => doc.status === 'analyzing')) return 'compiling'
  if (docs.some((doc) => doc.status === 'failed')) return 'failed'
  return 'ready'
}

function documentCounts(workspace: WorkspaceResponse) {
  const docs = workspace.documents ?? []
  return {
    total: docs.length,
    analyzed: docs.filter((doc) => doc.status === 'ready').length,
  }
}

export function mapWorkspaceResponse(response: WorkspaceResponse): WorkspaceSummary {
  const counts = documentCounts(response)
  return {
    id: response.id,
    ingress: response.ingress_mode === 'mcp' ? 'MCP' : 'HTTP',
    title: response.name,
    lastModified: formatRelativeTime(response.updated_at),
    documentCount: counts.total,
    analyzedCount: counts.analyzed,
    status: cardStatus(response),
  }
}