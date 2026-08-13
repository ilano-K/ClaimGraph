import type { WorkspaceResponse } from '../api/types'
import type { WorkspaceMetric, WorkspaceSummary } from '../data/dashboardData'
import { formatRelativeTime } from './utils'

type CardStatus = WorkspaceSummary['status']

function cardStatus(status: string): CardStatus {
  switch (status) {
    case 'ready':
      return 'ready'
    case 'compiling':
      return 'compiling'
    case 'empty':
    case 'queued':
      return 'awaiting'
    case 'failed':
      return 'failed'
    default:
      return 'awaiting'
  }
}

/**
 * Node-count metrics derived from the workspace's compiled graph payload,
 * falling back to `null` values (rendered as "--") when nothing is compiled.
 */
function nodeCounts(payload: WorkspaceResponse['graph_payload']): WorkspaceMetric[] {
  const nodes = payload?.nodes
  const counts = {
    claims: 0,
    evidence: 0,
    methodology: 0,
    limitations: 0,
    risks: 0,
    consequences: 0,
  }
  const hasPayload = Array.isArray(nodes)

  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const category = (node as { node_category?: string }).node_category
      if (category === 'claim') counts.claims += 1
      else if (category === 'evidence') counts.evidence += 1
      else if (category === 'methodology') counts.methodology += 1
      else if (category === 'limitation') counts.limitations += 1
      else if (category === 'risk') counts.risks += 1
      else if (category === 'consequence') counts.consequences += 1
    }
  }

  const value = (count: number) => (hasPayload ? count : null)

  return [
    { label: 'Core Claims', value: value(counts.claims), tone: 'cyan' },
    { label: 'Empirical Evidence', value: value(counts.evidence), tone: 'green' },
    { label: 'Methodology', value: value(counts.methodology), tone: 'purple' },
    { label: 'Limitations', value: value(counts.limitations), tone: 'yellow' },
    { label: 'Risks', value: value(counts.risks), tone: 'amber' },
    { label: 'Consequences', value: value(counts.consequences), tone: 'red' },
  ]
}

function documentLabel(payload: WorkspaceResponse['graph_payload']): string {
  const documents = payload?.documents
  if (!Array.isArray(documents) || documents.length === 0) return 'No documents yet'
  return `${documents.length} document${documents.length === 1 ? '' : 's'} analyzed`
}

/**
 * Converts a backend `WorkspaceResponse` into the dashboard card's view model.
 */
export function mapWorkspaceResponse(response: WorkspaceResponse): WorkspaceSummary {
  return {
    id: response.id,
    ingress: response.ingress_mode === 'mcp' ? 'MCP' : 'HTTP',
    title: response.name,
    lastModified: formatRelativeTime(response.updated_at),
    documentLabel: documentLabel(response.graph_payload),
    status: cardStatus(response.status),
    metrics: nodeCounts(response.graph_payload),
  }
}