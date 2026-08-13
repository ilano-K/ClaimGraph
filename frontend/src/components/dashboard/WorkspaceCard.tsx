import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import type { WorkspaceMetric, WorkspaceSummary } from '../../data/dashboardData'

const INGRESS_BADGE: Record<WorkspaceSummary['ingress'], string> = {
  HTTP: 'bg-primary/10 text-primary border border-primary/30',
  MCP: 'bg-tertiary/10 text-tertiary border border-tertiary/30',
}

const STATUS_FOOTERS: Record<
  Exclude<WorkspaceSummary['status'], 'ready'>,
  { icon: string; label: string; tone: string; spin?: boolean }
> = {
  compiling: {
    icon: 'sync',
    label: 'Compiling Graph...',
    tone: 'text-tertiary bg-tertiary/10 border-tertiary/20',
    spin: true,
  },
  awaiting: {
    icon: 'hourglass_empty',
    label: 'Awaiting documents',
    tone: 'text-secondary bg-secondary/10 border-secondary/20',
  },
  failed: {
    icon: 'error',
    label: 'Compilation failed',
    tone: 'text-error bg-error/10 border-error/20',
  },
}

const METRIC_DOT: Record<string, string> = {
  cyan: 'bg-cyan-400',
  green: 'bg-emerald-500',
  purple: 'bg-purple-400',
  yellow: 'bg-yellow-400',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
}

function MetricRow({ metric }: { metric: WorkspaceMetric }) {
  return (
    <div className="flex justify-between items-center">
      <span className="flex items-center gap-1">
        {metric.tone && (
          <div className={cn('w-1.5 h-1.5 rounded-full', METRIC_DOT[metric.tone] ?? 'bg-error')} />
        )}
        {metric.label}
      </span>
      <span className={metric.value == null ? 'text-on-surface-variant' : 'text-on-surface'}>
        {metric.value ?? '--'}
      </span>
    </div>
  )
}

function ReadyFooter({
  onOpen,
  error,
}: {
  onOpen: () => void
  error: string | null
}) {
  return (
    <>
      <div className="px-5 py-4 bg-surface-container-low/50 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-secondary font-label-sm bg-secondary/10 px-2 py-1 rounded border border-secondary/20">
          <Icon name="check_circle" className="text-[14px]" />
          Compiled &amp; Ready
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="bg-transparent border border-primary text-primary hover:bg-primary/10 transition-colors font-label-md px-4 py-1.5 rounded flex items-center gap-2"
          style={{ boxShadow: '0 0 10px rgba(173, 198, 255, 0.1)' }}
        >
          Open Graph Canvas
          <Icon name="arrow_forward" className="text-[16px]" />
        </button>
      </div>
      {error && (
        <div className="px-5 py-2 bg-error/10 border-t border-error/20 flex items-start gap-2 text-error text-label-sm">
          <Icon name="error_outline" className="text-[16px] shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}
    </>
  )
}

function ProcessingFooter({ status }: { status: Exclude<WorkspaceSummary['status'], 'ready'> }) {
  const footer = STATUS_FOOTERS[status]
  return (
    <div className="px-5 py-4 bg-surface-container-low/50 border-t border-white/5 flex items-center justify-between">
      <div
        className={`flex items-center justify-center gap-2 w-full font-label-sm px-3 py-1.5 rounded border ${footer.tone}`}
      >
        <Icon name={footer.icon} className={footer.spin ? 'text-[16px] animate-spin' : 'text-[16px]'} />
        {footer.label}
      </div>
    </div>
  )
}

interface WorkspaceCardProps {
  workspace: WorkspaceSummary
  onOpen: () => void
  onRecompile: () => void
  isRecompiling: boolean
  error: string | null
}

/**
 * One workspace tile in the Dashboard grid. Mirrors dashboard.html's states:
 * `ready` (historical workspace, opens the graph canvas) and the non-ready
 * ones surfaced as compiling / awaiting-documents / failed footers.
 */
export default function WorkspaceCard({
  workspace,
  onOpen,
  onRecompile,
  isRecompiling,
  error,
}: WorkspaceCardProps) {
  const isReady = workspace.status === 'ready'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <article className="glass-panel rounded-xl overflow-hidden flex flex-col group relative">
      {!isReady && (
        <div className="absolute inset-0 bg-surface-dim/30 z-10 pointer-events-none" />
      )}

      <div className="p-5 border-b border-white/5 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium',
                INGRESS_BADGE[workspace.ingress]
              )}
            >
              {workspace.ingress}
            </span>
            <span className="text-mono font-mono text-on-surface-variant">
              Last Modified: {workspace.lastModified}
            </span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">
            {workspace.title}
          </h2>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={cn(
              'relative text-on-surface-variant hover:text-primary p-1',
              !isReady && 'disabled:opacity-50'
            )}
            disabled={!isReady}
            onClick={() => isReady && setMenuOpen((v) => !v)}
          >
            <Icon name="more_vert" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 glass-panel rounded-lg p-1 flex flex-col w-40">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onRecompile()
                }}
                disabled={isRecompiling}
                className="px-3 py-2 text-label-sm flex items-center gap-2 text-on-surface hover:bg-white/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="sync" className={isRecompiling ? 'text-[16px] animate-spin' : 'text-[16px]'} />
                {isRecompiling ? 'Recompiling...' : 'Recompile'}
              </button>
            </div>
          )}
        </div>
      </div>

<div className="p-5 flex-1 flex flex-col gap-4 relative">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {workspace.documentLabel}
        </p>
        <div
          className={cn(
            'bg-surface-container-low rounded p-3 text-mono font-mono text-label-sm text-on-surface-variant flex flex-col gap-2 border border-white/5',
            !isReady && 'opacity-50'
          )}
        >
          {workspace.metrics.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
        </div>
      </div>

      {workspace.status === 'ready' ? (
        <ReadyFooter onOpen={onOpen} error={error} />
      ) : (
        <ProcessingFooter status={workspace.status} />
      )}
    </article>
  )
}