/**
 * Backend API contracts mirroring `backend/app/schemas/` plus the frontend
 * view models built from them (namespaced `presentation.*` fields).
 */

export type NodeCategory =
  | 'claim'
  | 'evidence'
  | 'methodology'
  | 'limitation'
  | 'risk'
  | 'consequence'
export type EdgeRelation = 'supports' | 'limits' | 'causes' | 'challenges'
export type NodeTone = 'cyan' | 'green' | 'purple' | 'yellow' | 'amber' | 'red'

export type WorkspaceDocumentStatus = 'not_analyzed' | 'analyzing' | 'ready' | 'failed'

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
  has_evidence: boolean
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

export interface WorkspaceDocument {
  id: string
  workspace_id: string
  filename: string
  status: WorkspaceDocumentStatus
  claim_count: number
  evidence_count: number
  graph_payload: Record<string, unknown> | null
}

export interface WorkspaceResponse {
  id: string
  name: string
  ingress_mode: string
  status: string
  graph_payload: Record<string, unknown> | null
  documents: WorkspaceDocument[]
  created_at: string
  updated_at: string
}

export interface ChatResponse {
  reply: string
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
