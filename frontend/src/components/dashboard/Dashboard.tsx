import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardHeader from './DashboardHeader'
import DashboardSidebar from './DashboardSidebar'
import WorkspaceFilterBar from './WorkspaceFilterBar'
import WorkspaceCard from './WorkspaceCard'
import NewWorkspaceModal from './NewWorkspaceModal'
import Icon from '../ui/Icon'
import { cn, fileExtension } from '../../lib/utils'
import { listWorkspaces, getWorkspaceDetail, compileDocument, uploadDocuments } from '../../api/client'
import { mapWorkspaceResponse } from '../../lib/mapWorkspace'
import type { GraphNode, GraphEdge, WorkspaceDocument, WorkspaceResponse } from '../../api/types'

const STATUS_META: Record<
  WorkspaceDocument['status'],
  { icon: string; label: string; tone: string; spin?: boolean }
> = {
  not_analyzed: {
    icon: 'hourglass_empty',
    label: 'Un-analyzed',
    tone: 'text-on-surface-variant bg-surface-container-high border-white/10',
  },
  analyzing: {
    icon: 'sync',
    label: 'Analyzing…',
    tone: 'text-tertiary bg-tertiary/10 border-tertiary/20',
    spin: true,
  },
  ready: {
    icon: 'check_circle',
    label: 'Analyzed',
    tone: 'text-secondary bg-secondary/10 border-secondary/20',
  },
  failed: {
    icon: 'error',
    label: 'Analysis failed',
    tone: 'text-error bg-error/10 border-error/20',
  },
}

const FILE_ICON: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
}

interface DashboardProps {
  onOpenWorkspace: (workspace: WorkspaceResponse) => void
  onOpenGraph: (document: WorkspaceDocument) => void
  activeWorkspace: WorkspaceResponse | null
  onBackToDashboard: () => void
}

/**
 * Dashboard screen. Mirrors dashboard.html: fixed top bar, fixed left rail,
 * and the workspace card grid. Cards are loaded live from `POST /api/workspaces/`
 * and open their project space (document list), never a graph directly.
 */
export default function Dashboard({ onOpenWorkspace, onOpenGraph, activeWorkspace, onBackToDashboard }: DashboardProps) {
  const [records, setRecords] = useState<WorkspaceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const [documents, setDocuments] = useState<WorkspaceDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const workspaces = await listWorkspaces()
      setRecords(workspaces)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const cards = useMemo(() => records.map(mapWorkspaceResponse), [records])

  const refreshDocs = useCallback(async () => {
    if (!activeWorkspace) return
    setDocsLoading(true)
    setDocsError(null)
    try {
      const detail = await getWorkspaceDetail(activeWorkspace.id)
      setDocuments(detail.documents ?? [])
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Failed to load documents.')
    } finally {
      setDocsLoading(false)
    }
  }, [activeWorkspace])

  useEffect(() => {
    if (activeWorkspace) {
      setDocuments([])
      setAnalyzeErrors({})
      void refreshDocs()
    }
  }, [activeWorkspace, refreshDocs])

  const handleAnalyze = async (doc: WorkspaceDocument) => {
    if (!activeWorkspace || analyzingId) return
    if (doc.status === 'analyzing') return
    setAnalyzingId(doc.id)
    setAnalyzeErrors((prev) => ({ ...prev, [doc.id]: '' }))
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: 'analyzing' } : d))
    )
    try {
      await compileDocument(activeWorkspace.id, doc.id)
      await refreshDocs()
    } catch (err) {
      setAnalyzeErrors((prev) => ({
        ...prev,
        [doc.id]: err instanceof Error ? err.message : 'Analysis failed.',
      }))
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: 'failed' } : d))
      )
    } finally {
      setAnalyzingId(null)
    }
  }

  const handleUpload = async (files: File[]) => {
    if (!activeWorkspace) return
    const accepted = files.filter(
      (f) => fileExtension(f.name) === 'pdf' || fileExtension(f.name) === 'docx'
    )
    if (accepted.length === 0) return
    setUploading(true)
    setDocsError(null)
    try {
      await uploadDocuments(activeWorkspace.id, accepted)
      await refreshDocs()
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleNewWorkspace = () => setShowNewModal(true)

  const handleWorkspaceCreated = useCallback((ws: WorkspaceResponse) => {
    setShowNewModal(false)
    onOpenWorkspace(ws)
  }, [onOpenWorkspace])

  const analyzedCount = documents.filter((d) => d.status === 'ready').length
  const inProject = Boolean(activeWorkspace)

  const trailingAction = inProject ? (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => {
          handleUpload(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ boxShadow: '0 0 15px rgba(173, 198, 255, 0.3)' }}
      >
        <Icon name={uploading ? 'sync' : 'upload_file'} className={cn('!text-[18px]', uploading && 'animate-spin')} />
        {uploading ? 'Uploading…' : 'Add Documents'}
      </button>
    </>
  ) : undefined

  return (
    <div className="text-on-surface min-h-screen flex flex-col font-body-md antialiased overflow-x-hidden bg-background">
      <DashboardHeader
        onNewWorkspace={handleNewWorkspace}
        projectName={activeWorkspace?.name}
        projectMeta={inProject ? `${documents.length} document${documents.length === 1 ? '' : 's'} · ${analyzedCount} analyzed` : undefined}
        onBackToDashboard={onBackToDashboard}
        trailingAction={trailingAction}
      />
      <DashboardSidebar />

      {showNewModal && (
        <NewWorkspaceModal onClose={() => setShowNewModal(false)} onCreated={handleWorkspaceCreated} />
      )}

      <main className="flex-1 pt-24 pb-12 px-margin-mobile md:px-margin-desktop lg:pl-[312px] w-full relative z-10">
        {inProject ? (
          <>
            {docsLoading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
                <Icon name="progress_activity" className="text-[32px] animate-spin" />
                <p className="font-body-sm text-body-sm">Loading documents…</p>
              </div>
            ) : docsError && documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant text-center">
                <Icon name="cloud_off" className="text-[32px] text-error" />
                <p className="font-body-sm text-body-sm">{docsError}</p>
                <button
                  type="button"
                  onClick={() => void refreshDocs()}
                  className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
                >
                  <Icon name="refresh" className="text-[16px]" />
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex justify-between items-end">
                    <span className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
                      Documents
                    </span>
                    <span className="font-mono text-mono text-primary font-bold">
                      {documents.length} file{documents.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-on-surface-variant text-center glass-panel rounded-xl">
                      <Icon name="inbox" className="text-[32px]" />
                      <p className="font-headline-md text-headline-md text-on-surface">No Documents Yet</p>
                      <p className="font-body-sm text-body-sm">
                        Add documents to this workspace to start analyzing them.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
                      >
                        <Icon name="add" className="text-[16px]" />
                        Add Documents
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {documents.map((doc) => {
                        const meta = STATUS_META[doc.status]
                        const ext = fileExtension(doc.filename)
                        const gp = doc.graph_payload as { nodes?: GraphNode[]; edges?: GraphEdge[] } | null
                        const nodes = gp?.nodes ?? []
                        const edges = gp?.edges ?? []
                        const nodeCount = nodes.length
                        const edgeCount = edges.length
                        const categories = new Set(nodes.map((n) => n.node_category))
                        return (
                          <article key={doc.id} className="bg-surface-container-low rounded-xl overflow-hidden flex flex-col group relative border border-outline-variant/30 hover:border-primary/40 transition-all duration-200">
                            <div className="p-5 border-b border-white/5 flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                                <Icon name={FILE_ICON[ext] ?? 'description'} className="text-primary" />
                              </div>
                              <div className="flex flex-col gap-1 min-w-0 flex-grow">
                                <h2 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors truncate text-base">
                                  {doc.filename}
                                </h2>
                                <span className="font-mono text-mono text-on-surface-variant text-[11px]">
                                  {ext.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            <div className="p-5 flex-1 flex flex-col gap-3">
                              {doc.status === 'ready' ? (
                                <div className="bg-surface-container rounded p-3 text-mono font-mono text-label-sm text-on-surface-variant flex flex-col gap-2 border border-outline-variant/20">
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5">
                                      <Icon name="hub" className="text-[13px] text-primary" />
                                      Nodes
                                    </span>
                                    <span className="text-on-surface">{nodeCount}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5">
                                      <Icon name="link" className="text-[13px] text-secondary" />
                                      Connections
                                    </span>
                                    <span className="text-on-surface">{edgeCount}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5">
                                      <Icon name="category" className="text-[13px] text-tertiary" />
                                      Categories
                                    </span>
                                    <span className="text-on-surface">{categories.size}</span>
                                  </div>
                                </div>
                              ) : (
                                <p className="font-body-sm text-body-sm text-on-surface-variant">
                                  {doc.status === 'analyzing'
                                    ? 'Analyzing document for claims and evidence…'
                                    : doc.status === 'failed'
                                      ? 'Analysis encountered an error.'
                                      : 'Document uploaded. Ready to analyze.'}
                                </p>
                              )}
                              {analyzeErrors[doc.id] && (
                                <div className="flex items-center gap-2 text-error text-label-sm bg-error/10 border border-error/20 rounded px-3 py-2">
                                  <Icon name="error_outline" className="text-[14px] shrink-0" />
                                  <span className="truncate">{analyzeErrors[doc.id]}</span>
                                </div>
                              )}
                            </div>

                            <div className="px-5 py-4 bg-surface-container/50 border-t border-white/5 flex items-center justify-between">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2 py-1 rounded border font-label-sm',
                                  meta.tone
                                )}
                              >
                                <Icon
                                  name={meta.icon}
                                  className={cn('text-[14px]', meta.spin && 'animate-spin')}
                                />
                                {meta.label}
                              </span>
                              {doc.status === 'ready' ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleAnalyze(doc)}
                                    disabled={analyzingId !== null}
                                    className="text-on-surface-variant hover:text-on-surface hover:bg-white/5 p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="Re-analyze"
                                  >
                                    <Icon name="sync" className="text-[16px]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenGraph(doc)}
                                    className="bg-transparent border border-primary text-primary hover:bg-primary/10 transition-colors font-label-md px-4 py-1.5 rounded flex items-center gap-2"
                                    style={{ boxShadow: '0 0 10px rgba(173, 198, 255, 0.1)' }}
                                  >
                                    Open Graph
                                    <Icon name="arrow_forward" className="text-[16px]" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleAnalyze(doc)}
                                  disabled={analyzingId !== null || doc.status === 'analyzing'}
                                  className="bg-primary-container text-on-primary-container font-label-md px-4 py-1.5 rounded flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Icon name="analytics" className="text-[16px]" />
                                  Analyze
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>

                {docsError && (
                  <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error mt-4">
                    <Icon name="error" className="text-[18px] shrink-0" />
                    {docsError}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <WorkspaceFilterBar />

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
                <Icon name="progress_activity" className="text-[32px] animate-spin" />
                <p className="font-body-sm text-body-sm">Loading workspaces...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant text-center">
                <Icon name="cloud_off" className="text-[32px] text-error" />
                <p className="font-body-sm text-body-sm">{error}</p>
                <p className="text-on-surface-variant/70 text-sm">
                  Make sure the ClaimGraph server is running.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
                >
                  <Icon name="refresh" className="text-[16px]" />
                  Retry
                </button>
              </div>
            ) : cards.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant text-center">
                <Icon name="inbox" className="text-[32px]" />
                <p className="font-headline-md text-headline-md text-on-surface">No Workspaces Yet</p>
                <p className="font-body-sm text-body-sm">
                  Create your first workspace to start building a claim graph.
                </p>
                <button
                  type="button"
                  onClick={handleNewWorkspace}
                  className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
                >
                  <Icon name="add" className="text-[16px]" />
                  New Workspace
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {cards.map((card) => {
                  const record = records.find((r) => r.id === card.id)
                  return (
                    <WorkspaceCard
                      key={card.id}
                      workspace={card}
                      onOpen={() => record && onOpenWorkspace(record)}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}