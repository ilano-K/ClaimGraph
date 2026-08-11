import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import type { WorkspaceMetric, WorkspaceSummary } from '../../data/dashboardData'

const INGRESS_BADGE: Record<WorkspaceSummary['ingress'], string> = {
  HTTP: 'bg-primary/10 text-primary border border-primary/30',
  MCP: 'bg-tertiary/10 text-tertiary border border-tertiary/30',
}

function MetricRow({ metric }: { metric: WorkspaceMetric }) {
  return (
    <div className="flex justify-between items-center">
      <span className="flex items-center gap-1">
        {metric.tone && (
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              metric.tone === 'green' ? 'bg-emerald-500' : 'bg-error'
            )}
          />
        )}
        {metric.label}
      </span>
      <span className={metric.value == null ? 'text-on-surface-variant' : 'text-on-surface'}>
        {metric.value ?? '--'}
      </span>
    </div>
  )
}

function ReadyFooter({ onOpen }: { onOpen: () => void }) {
  return (
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
  )
}

function ProcessingFooter() {
  return (
    <div className="px-5 py-4 bg-surface-container-low/50 border-t border-white/5 flex items-center justify-between">
      <div className="flex items-center justify-center gap-2 w-full text-tertiary font-label-sm bg-tertiary/10 px-3 py-1.5 rounded border border-tertiary/20">
        <Icon name="sync" className="text-[16px] animate-spin" />
        Compiling Graph...
      </div>
    </div>
  )
}

interface WorkspaceCardProps {
  workspace: WorkspaceSummary
  onOpen: () => void
}

/**
 * One workspace tile in the Dashboard grid. Mirrors dashboard.html's two
 * states: `ready` (historical workspace, opens the graph canvas) and
 * `processing` (live MCP ingress currently compiling).
 */
export default function WorkspaceCard({ workspace, onOpen }: WorkspaceCardProps) {
  const isProcessing = workspace.status === 'processing'

  return (
    <article className="glass-panel rounded-xl overflow-hidden flex flex-col group relative">
      {isProcessing && (
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
        <button
          type="button"
          className={cn(
            'relative text-on-surface-variant hover:text-primary p-1',
            isProcessing && 'disabled:opacity-50'
          )}
          disabled={isProcessing}
        >
          <Icon name="more_vert" />
        </button>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4 relative">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {workspace.documentLabel}
        </p>
        <div
          className={cn(
            'bg-surface-container-low rounded p-3 text-mono font-mono text-label-sm text-on-surface-variant flex flex-col gap-2 border border-white/5',
            isProcessing && 'opacity-50'
          )}
        >
          {workspace.metrics.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
        </div>
      </div>

      {isProcessing ? (
        <ProcessingFooter />
      ) : (
        <ReadyFooter onOpen={onOpen} />
      )}
    </article>
  )
}