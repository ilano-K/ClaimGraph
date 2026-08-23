import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import type { WorkspaceSummary } from '../../data/dashboardData'

const INGRESS_BADGE: Record<WorkspaceSummary['ingress'], string> = {
  HTTP: 'bg-primary/10 text-primary border border-primary/30',
  MCP: 'bg-tertiary/10 text-tertiary border border-tertiary/30',
}

const STATUS_ICON: Record<WorkspaceSummary['status'], { icon: string; color: string }> = {
  ready: { icon: 'check_circle', color: 'text-secondary' },
  compiling: { icon: 'sync', color: 'text-tertiary animate-spin' },
  awaiting: { icon: 'hourglass_empty', color: 'text-on-surface-variant' },
  failed: { icon: 'error', color: 'text-error' },
}

interface WorkspaceCardProps {
  workspace: WorkspaceSummary
  onOpen: () => void
}

export default function WorkspaceCard({ workspace, onOpen }: WorkspaceCardProps) {
  const statusIcon = STATUS_ICON[workspace.status]

  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-surface-container-low rounded-xl p-5 flex flex-col gap-3 text-left border border-outline-variant/30 hover:border-primary/40 transition-all duration-200 group w-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-[11px] font-mono px-2 py-0.5 rounded', INGRESS_BADGE[workspace.ingress])}>
              {workspace.ingress}
            </span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors truncate">
            {workspace.title}
          </h2>
          <p className="text-mono text-on-surface-variant text-[11px] mt-0.5">
            {workspace.lastModified}
          </p>
        </div>
        <Icon name={statusIcon.icon} className={cn('text-[20px] shrink-0 mt-1', statusIcon.color)} />
      </div>

      <div className="flex items-center gap-4 text-label-sm text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          <Icon name="description" className="text-[14px] text-primary" />
          <span className="text-on-surface font-medium">{workspace.documentCount}</span>
          <span>Documents</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="check_circle" className="text-[14px] text-secondary" />
          <span className="text-on-surface font-medium">{workspace.analyzedCount}</span>
          <span>Analyzed</span>
        </div>
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-white/5">
        <span className="font-label-sm text-primary group-hover:underline flex items-center gap-1">
          Open
          <Icon name="arrow_forward" className="text-[14px]" />
        </span>
      </div>
    </button>
  )
}