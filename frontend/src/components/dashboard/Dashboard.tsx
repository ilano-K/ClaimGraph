import DashboardHeader from './DashboardHeader'
import DashboardSidebar from './DashboardSidebar'
import WorkspaceFilterBar from './WorkspaceFilterBar'
import WorkspaceCard from './WorkspaceCard'
import { workspaces } from '../../data/dashboardData'

interface DashboardProps {
  onNewWorkspace: () => void
  onOpenWorkspace: () => void
}

/**
 * Workspace Dashboard screen. Mirrors dashboard.html: fixed top bar, fixed
 * left rail, and the filterable workspace card grid. Still renders placeholder
 * workspace data — no backend list-workspaces endpoint exists yet.
 */
export default function Dashboard({ onNewWorkspace, onOpenWorkspace }: DashboardProps) {
  return (
    <div className="text-on-surface min-h-screen flex flex-col font-body-md antialiased overflow-x-hidden bg-background">
      <DashboardHeader onNewWorkspace={onNewWorkspace} />
      <DashboardSidebar />

      <main className="flex-1 pt-24 pb-12 px-margin-mobile md:px-margin-desktop lg:pl-[312px] max-w-container-max mx-auto w-full relative z-10">
        <WorkspaceFilterBar />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onOpen={onOpenWorkspace}
            />
          ))}
        </div>
      </main>
    </div>
  )
}