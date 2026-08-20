import { useCallback, useEffect, useMemo, useState } from 'react'
import DashboardHeader from './DashboardHeader'
import DashboardSidebar from './DashboardSidebar'
import WorkspaceFilterBar from './WorkspaceFilterBar'
import WorkspaceCard from './WorkspaceCard'
import Icon from '../ui/Icon'
import { listWorkspaces } from '../../api/client'
import { mapWorkspaceResponse } from '../../lib/mapWorkspace'
import type { WorkspaceResponse } from '../../api/types'

interface DashboardProps {
  onNewWorkspace: () => void
  onOpenWorkspace: (workspace: WorkspaceResponse) => void
}

/**
 * Dashboard screen. Mirrors dashboard.html: fixed top bar, fixed left rail,
 * and the workspace card grid. Cards are loaded live from `POST /api/workspaces/`
 * and open their project space (document list), never a graph directly.
 */
export default function Dashboard({ onNewWorkspace, onOpenWorkspace }: DashboardProps) {
  const [records, setRecords] = useState<WorkspaceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="text-on-surface min-h-screen flex flex-col font-body-md antialiased overflow-x-hidden bg-background">
      <DashboardHeader onNewWorkspace={onNewWorkspace} />
      <DashboardSidebar />

      <main className="flex-1 pt-24 pb-12 px-margin-mobile md:px-margin-desktop lg:pl-[312px] max-w-container-max mx-auto w-full relative z-10">
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
              onClick={onNewWorkspace}
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
      </main>
    </div>
  )
}