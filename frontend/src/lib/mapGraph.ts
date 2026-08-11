import type {
  DocumentAnalysis,
  GraphEdgeView,
  GraphNodeView,
  GraphPayload,
  NodeCategory,
  NodeTone,
  WorkspaceMetadata,
} from '../api/types'

const NODE_CATEGORY_TONES: Record<NodeCategory, NodeTone> = {
  claim: 'blue',
  evidence: 'green',
  tradeoff: 'red',
  methodology: 'purple',
}

const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  claim: 'CLAIM',
  evidence: 'EVIDENCE',
  tradeoff: 'TRADEOFF',
  methodology: 'METHODOLOGY',
}

export interface MappedGraph {
  nodes: GraphNodeView[]
  edges: GraphEdgeView[]
  metadata: WorkspaceMetadata
}

/**
 * Deterministic starting layout. The backend returns no coordinates, so nodes
 * are arranged on a grid; they remain draggable once rendered.
 */
function layoutPosition(count: number, index: number): { x: number; y: number } {
  const spacing = 340
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  return {
    x: 80 + (index % columns) * spacing,
    y: 80 + Math.floor(index / columns) * spacing,
  }
}

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
  const nodes: GraphNodeView[] = payload.nodes.map((node, index) => {
    const document = findDocument(payload.documents, node.document_id)
    const tone = NODE_CATEGORY_TONES[node.node_category] ?? 'blue'
    const badgeLabel = NODE_CATEGORY_LABELS[node.node_category] ?? 'CLAIM'
    const { x, y } = layoutPosition(payload.nodes.length, index)
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
        synthesis: document?.executive_summary ?? '',
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
