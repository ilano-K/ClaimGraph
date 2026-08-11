/**
 * Backend API contracts mirroring `backend/app/schemas/` plus the frontend
 * view models built from them (namespaced `presentation.*` fields).
 */

export type NodeCategory = 'claim' | 'evidence' | 'tradeoff' | 'methodology'
export type EdgeRelation = 'supports' | 'limits' | 'depends_on'
export type NodeTone = 'red' | 'blue' | 'green' | 'purple'

export interface DocumentMetadata {
  id: string
  title: string
  author: string[]
  token_count: number
}

export interface DocumentAnalysis {
  metadata: DocumentMetadata
  executive_summary: string
}

export interface GraphNode {
  id: string
  document_id: string
  node_category: NodeCategory
  title: string
  summary: string
  quote: string
  confidence_score: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: EdgeRelation
  reasoning: string
}

export interface GraphPayload {
  documents: DocumentAnalysis[]
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface CompileResponse {
  success: boolean
  message: string
  documents: DocumentAnalysis[]
  graph: GraphPayload
}

export interface WorkspaceResponse {
  id: string
  name: string
  ingress_mode: string
  status: string
  graph_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/* ------------------------------------------------------------------ */
/* Frontend view models                                                */
/* ------------------------------------------------------------------ */

export interface Citation {
  id: string
  text: string
  meta: string
}

export interface ChatMessage {
  author: 'user' | 'assistant'
  text: string
}

export interface NodeContent {
  synthesis: string
  quote: string
  quoteSource: string
  thread: ChatMessage[]
  citations: Citation[]
}

export interface GraphNodePresentation {
  x: number
  y: number
  width: number
  height: number
  tone: NodeTone
  badgeLabel: string
  meta: string
  synthesis: string
  quoteSource: string
  thread: ChatMessage[]
  citations: Citation[]
}

export interface GraphNodeView extends GraphNode {
  presentation: GraphNodePresentation
}

export interface GraphEdgeView {
  id: string
  source: string
  target: string
  relation: EdgeRelation
  reasoning: string
  path?: string
  label?: { x: number; y: number }
}

export interface WorkspaceMetadata {
  title: string
  author: string[]
  token_count: number
}

export interface UploadedDocument {
  id: string
  name: string
  size: string
  kind: string
}

export interface UploadedFile {
  id: string
  file: File
}

export type ProcessingPhase = 'uploading' | 'compiling' | 'complete' | 'error'
