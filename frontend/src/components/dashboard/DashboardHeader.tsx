import Icon from '../ui/Icon'

interface DashboardHeaderProps {
  onNewWorkspace: () => void
  projectName?: string
  projectMeta?: string
  onBackToDashboard?: () => void
  trailingAction?: React.ReactNode
}

export default function DashboardHeader({ onNewWorkspace, projectName, projectMeta, onBackToDashboard, trailingAction }: DashboardHeaderProps) {
  const inProject = Boolean(projectName)

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface/60 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center gap-8 flex-1 min-w-0">
        <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
            <Icon name="share" className="text-on-primary text-[18px]" />
          </div>
          ClaimGraph
        </h1>

        {inProject && (
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="flex items-center gap-1 font-label-md text-on-surface-variant hover:text-primary transition-colors shrink-0"
            >
              <Icon name="arrow_back" className="text-[18px]" />
              Workspaces
            </button>
            <Icon name="chevron_right" className="text-outline-variant text-[18px] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-label-md text-label-md text-on-surface truncate">{projectName}</span>
              {projectMeta && (
                <span className="font-mono text-mono text-on-surface-variant text-[11px]">{projectMeta}</span>
              )}
            </div>
          </div>
        )}

        {!inProject && (
          <div className="relative max-w-md w-full hidden md:block">
            <Icon
              name="search"
              className="absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pb-1 !text-body-md"
            />
            <input
              type="text"
              placeholder="Search workspaces or documents..."
              className="input-minimal w-full pl-8 pr-4 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 flex-1 justify-end shrink-0">
        {trailingAction ?? (
          <button
            type="button"
            onClick={onNewWorkspace}
            className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
            style={{ boxShadow: '0 0 15px rgba(173, 198, 255, 0.3)' }}
          >
            <Icon name="add" className="text-[18px]" />
            New Workspace
          </button>
        )}
      </div>
    </header>
  )
}