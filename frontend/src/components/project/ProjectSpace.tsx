import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { cn, fileExtension } from '../../lib/utils'
import { compileDocument, getWorkspaceDetail, uploadDocuments } from '../../api/client'
import type { WorkspaceDocument, WorkspaceResponse } from '../../api/types'

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

interface ProjectSpaceProps {
  workspace: WorkspaceResponse
  onBack: () => void
  onOpenGraph: (document: WorkspaceDocument) => void
}

export default function ProjectSpace({
  workspace,
  onBack,
  onOpenGraph,
}: ProjectSpaceProps) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await getWorkspaceDetail(workspace.id)
      setDocuments(detail.documents ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }, [workspace.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAnalyze = async (document: WorkspaceDocument) => {
    if (analyzingId) return
    if (document.status === 'analyzing') return
    setAnalyzingId(document.id)
    setAnalyzeErrors((prev) => ({ ...prev, [document.id]: '' }))
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === document.id ? { ...doc, status: 'analyzing' } : doc))
    )
    try {
      await compileDocument(workspace.id, document.id)
      await refresh()
    } catch (err) {
      setAnalyzeErrors((prev) => ({
        ...prev,
        [document.id]: err instanceof Error ? err.message : 'Analysis failed.',
      }))
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === document.id ? { ...doc, status: 'failed' } : doc))
      )
    } finally {
      setAnalyzingId(null)
    }
  }

  const handleUpload = async (files: File[]) => {
    const accepted = files.filter(
      (file) => fileExtension(file.name) === 'pdf' || fileExtension(file.name) === 'docx'
    )
    if (accepted.length === 0) return
    setUploading(true)
    setError(null)
    try {
      await uploadDocuments(workspace.id, accepted)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const analyzedCount = documents.filter((doc) => doc.status === 'ready').length

  return (
    <div className="text-on-surface min-h-screen flex flex-col font-body-md antialiased bg-background overflow-x-hidden">
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface-container/60 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-all shrink-0"
            aria-label="Back to dashboard"
          >
            <Icon name="arrow_back" />
          </button>
          <div className="w-8 h-8 rounded-lg border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
            <Icon name="folder_open" className="text-on-primary text-[18px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface truncate">
              {workspace.name}
            </h1>
            <span className="font-mono text-mono text-on-surface-variant text-[11px]">
              {documents.length} document{documents.length === 1 ? '' : 's'} · {analyzedCount} analyzed
            </span>
          </div>
        </div>
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
      </header>

      <main className="flex-1 pt-24 pb-12 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto w-full relative z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
            <Icon name="progress_activity" className="text-[32px] animate-spin" />
            <p className="font-body-sm text-body-sm">Loading documents…</p>
          </div>
        ) : error && documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant text-center">
            <Icon name="cloud_off" className="text-[32px] text-error" />
            <p className="font-body-sm text-body-sm">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
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
                    return (
                      <article key={doc.id} className="glass-panel rounded-xl overflow-hidden flex flex-col group relative">
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
                            <div className="bg-surface-container-low rounded p-3 text-mono font-mono text-label-sm text-on-surface-variant flex flex-col gap-2 border border-white/5">
                              <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                  Claims
                                </span>
                                <span className="text-on-surface">{doc.claim_count}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Evidence
                                </span>
                                <span className="text-on-surface">{doc.evidence_count}</span>
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

                        <div className="px-5 py-4 bg-surface-container-low/50 border-t border-white/5 flex items-center justify-between">
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

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error mt-4">
                <Icon name="error" className="text-[18px] shrink-0" />
                {error}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}