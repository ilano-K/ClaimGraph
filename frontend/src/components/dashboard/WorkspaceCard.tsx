import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import type { WorkspaceMetric, WorkspaceSummary } from '../../data/dashboardData'

const INGRESS_BADGE: Record<WorkspaceSummary['ingress'], string> = {
  HTTP: 'bg-primary/10 text-primary border border-primary/30',
  MCP: 'bg-tertiary/10 text-tertiary border border-tertiary/30',
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

function StatusBadge({ status }: { status: WorkspaceSummary['status'] }) {
  if (status === 'awaiting') {
    return (
      <div className="flex items-center gap-1.5 text-secondary font-label-sm bg-secondary/10 px-2 py-1 rounded border border-secondary/20">
        <Icon name="hourglass_empty" className="text-[14px]" />
        Awaiting documents
      </div>
    )
  }
  if (status === 'compiling') {
    return (
      <div className="flex items-center gap-1.5 text-tertiary font-label-sm bg-tertiary/10 px-2 py-1 rounded border border-tertiary/20">
        <Icon name="sync" className="text-[14px] animate-spin" />
        Analyzing…
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5 text-error font-label-sm bg-error/10 px-2 py-1 rounded border border-error/20">
        <Icon name="error" className="text-[14px]" />
        Analysis failed
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-secondary font-label-sm bg-secondary/10 px-2 py-1 rounded border border-secondary/20">
      <Icon name="check_circle" className="text-[14px]" />
      Open Project
    </div>
  )
}

interface WorkspaceCardProps {
  workspace: WorkspaceSummary
  onOpen: () => void
}

/**
 * One project-space tile in the Dashboard grid. Cards are always openable —
 * the landing view is the project space (document list), not a graph.
 */
export default function WorkspaceCard({ workspace, onOpen }: WorkspaceCardProps) {
  return (
    <article className="glass-panel rounded-xl overflow-hidden flex flex-col group relative">
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
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4 relative">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {workspace.documentLabel}
        </p>
        <div className="bg-surface-container-low rounded p-3 text-mono font-mono text-label-sm text-on-surface-variant flex flex-col gap-2 border border-white/5">
          {workspace.metrics.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
        </div>
      </div>

      <div className="px-5 py-4 bg-surface-container-low/50 border-t border-white/5 flex items-center justify-between">
        <StatusBadge status={workspace.status} />
        <button
          type="button"
          onClick={onOpen}
          className="bg-transparent border border-primary text-primary hover:bg-primary/10 transition-colors font-label-md px-4 py-1.5 rounded flex items-center gap-2"
          style={{ boxShadow: '0 0 10px rgba(173, 198, 255, 0.1)' }}
        >
          Open Project Space
          <Icon name="arrow_forward" className="text-[16px]" />
        </button>
      </div>
    </article>
  )
}