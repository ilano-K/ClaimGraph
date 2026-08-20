import { computeSweepLayout } from './sweepLayout'
import type {
  DocumentAnalysis,
  GraphEdgeView,
  GraphNodeView,
  GraphPayload,
  NodeCategory,
  NodeTone,
  WorkspaceMetadata,
} from '../api/types'

const DEFAULT_CARD_WIDTH = 256
const DEFAULT_CARD_HEIGHT = 168

const NODE_CATEGORY_TONES: Record<NodeCategory, NodeTone> = {
  claim: 'cyan',
  evidence: 'green',
  methodology: 'purple',
  limitation: 'yellow',
  risk: 'amber',
  consequence: 'red',
}

const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  claim: 'CLAIM',
  evidence: 'EVIDENCE',
  methodology: 'METHODOLOGY',
  limitation: 'LIMITATION',
  risk: 'RISK',
  consequence: 'CONSEQUENCE',
}

export interface MappedGraph {
  nodes: GraphNodeView[]
  edges: GraphEdgeView[]
  metadata: WorkspaceMetadata
}

/**
 * Deterministic starting layout. The backend returns no coordinates, so a
 * layered left-to-right flow is computed up front with `computeSweepLayout`
 * (dagre); nodes remain draggable once rendered and can be re-swept.
 */
function findDocument(documents: DocumentAnalysis[], documentId: string) {
  return documents.find((doc) => doc.metadata.id === documentId)
}

/**
 * Converts the backend `GraphPayload` into the frontend node/edge/metadata
 * shapes. `presentation.*` values that the API provides are derived from real
 * data (executive summary, verbatim quote, document title); only fields with
 * no backend source yet (`thread`) are left empty.
 */
export function mapGraphPayload(payload: GraphPayload): MappedGraph {
  const positions = computeSweepLayout(
    payload.nodes.map((node) => ({
      id: node.id,
      width: DEFAULT_CARD_WIDTH,
      height: DEFAULT_CARD_HEIGHT,
    })),
    payload.edges.map((edge) => ({ source: edge.source, target: edge.target }))
  )

  const nodes: GraphNodeView[] = payload.nodes.map((node) => {
    const document = findDocument(payload.documents, node.document_id)
    const tone = NODE_CATEGORY_TONES[node.node_category] ?? 'cyan'
    const badgeLabel = NODE_CATEGORY_LABELS[node.node_category] ?? 'CLAIM'
    const pos = positions.get(node.id)
    const x = pos?.x ?? 0
    const y = pos?.y ?? 0
    const sourceTitle = document?.metadata.title ?? 'Verbatim source'

    return {
      ...node,
      presentation: {
        x,
        y,
        width: 256,
        height: 168,
        tone,
        badgeLabel,
        meta: document ? document.metadata.title : 'Unverified source',
        synthesis: node.summary,
        quoteSource: document ? `Source: ${sourceTitle}` : '',
        thread: [],
        citations: [
          {
            id: `citation-${node.id}`,
            text: node.quote,
            meta: sourceTitle,
          },
        ],
      },
    }
  })

  const edges: GraphEdgeView[] = payload.edges.map((edge) => ({
    ...edge,
  }))

  const primary = payload.documents[0]?.metadata
  const metadata: WorkspaceMetadata = {
    title: primary?.title ?? 'Untitled Workspace',
    author: primary?.author ?? [],
    token_count: primary?.token_count ?? 0,
  }

  return { nodes, edges, metadata }
}
