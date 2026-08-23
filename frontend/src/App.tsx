import { useCallback, useEffect, useMemo, useState } from 'react'
import TopNavBar from './components/layout/TopNavBar'
import GraphCanvas from './components/graph/GraphCanvas'
import InspectionPanel from './components/inspector/InspectionPanel'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import Dashboard from './components/dashboard/Dashboard'
import { mapGraphPayload, type MappedGraph } from './lib/mapGraph'
import {
  buildFilterOptions,
  filterGraph,
  type RelationshipFilter,
} from './lib/relationshipFilter'
import type { GraphPayload, WorkspaceDocument, WorkspaceResponse } from './api/types'

type Screen = 'onboarding' | 'dashboard' | 'project' | 'graph'

export default function App() {
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem('claimgraph-onboarded') === 'true'
  })
  const [screen, setScreen] = useState<Screen>(() => {
    return localStorage.getItem('claimgraph-onboarded') === 'true' ? 'dashboard' : 'onboarding'
  })
  const [graph, setGraph] = useState<MappedGraph | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [refitSignal, setRefitSignal] = useState(0)
  const [filter, setFilter] = useState<RelationshipFilter>('all')

  const handleOpenWorkspace = useCallback((next: WorkspaceResponse) => {
    setWorkspace(next)
    setGraph(null)
    setDocument(null)
    setActiveNodeId(null)
    setHoveredNodeId(null)
    setFilter('all')
    setRefitSignal((n) => n + 1)
    setScreen('project')
  }, [])

  const handleOpenGraph = useCallback((next: WorkspaceDocument) => {
    if (!next.graph_payload) return
    setDocument(next)
    setGraph(mapGraphPayload(next.graph_payload as unknown as GraphPayload))
    setActiveNodeId(null)
    setHoveredNodeId(null)
    setFilter('all')
    setRefitSignal((n) => n + 1)
    setScreen('graph')
  }, [])

  const handleMoveNode = useCallback((nodeId: string, x: number, y: number) => {
    setGraph((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: prev.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, presentation: { ...node.presentation, x, y } }
            : node
        ),
      }
    })
  }, [])

  const handleLayoutNodes = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      setGraph((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          nodes: prev.nodes.map((node) => {
            const point = positions[node.id]
            if (!point) return node
            return { ...node, presentation: { ...node.presentation, ...point } }
          }),
        }
      })
    },
    []
  )

  const handleFilterChange = useCallback((next: RelationshipFilter) => {
    setFilter(next)
    setRefitSignal((n) => n + 1)
  }, [])

  const visible = useMemo(
    () => (graph ? filterGraph(graph.nodes, graph.edges, filter) : { nodes: [], edges: [] }),
    [graph, filter]
  )

  const filterOptions = useMemo(
    () => (graph ? buildFilterOptions(graph.nodes, graph.edges) : []),
    [graph]
  )

  useEffect(() => {
    if (!graph) return
    const stillAvailable = filterOptions.some((option) => option.id === filter)
    if (!stillAvailable && filter !== 'all') setFilter('all')
  }, [graph, filter, filterOptions])

  useEffect(() => {
    if (!graph || !activeNodeId) return
    const isActiveVisible = visible.nodes.some((node) => node.id === activeNodeId)
    if (!isActiveVisible) setActiveNodeId(null)
  }, [graph, filter, activeNodeId, visible.nodes])

  const handleCompleteOnboarding = useCallback(() => {
    localStorage.setItem('claimgraph-onboarded', 'true')
    setHasOnboarded(true)
    setScreen('dashboard')
  }, [])

  if (screen === 'onboarding' && !hasOnboarded) {
    return <OnboardingFlow onOpenWorkspace={(ws) => { handleCompleteOnboarding(); handleOpenWorkspace(ws); }} onSkip={handleCompleteOnboarding} />
  }

  if (screen === 'dashboard' || (screen === 'project' && workspace)) {
    return (
      <Dashboard
        onOpenWorkspace={handleOpenWorkspace}
        onOpenGraph={handleOpenGraph}
        activeWorkspace={screen === 'project' ? workspace : null}
        onBackToDashboard={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'graph' && workspace && document && graph) {
    const activeNode =
      graph.nodes.find((node) => node.id === activeNodeId) ?? visible.nodes[0] ?? null
    return (
      <div className="text-on-surface font-body-md h-screen overflow-hidden flex flex-col">
        <TopNavBar
          workspaceName={workspace.name}
          documentName={document.filename}
          onBack={() => setScreen('project')}
        />
        <main className="flex-1 relative flex overflow-hidden">
          <GraphCanvas
            nodes={visible.nodes}
            edges={visible.edges}
            activeNodeId={activeNodeId}
            hoveredNodeId={hoveredNodeId}
            refitSignal={refitSignal}
            filter={filter}
            filterOptions={filterOptions}
            onFilterChange={handleFilterChange}
            onSelectNode={setActiveNodeId}
            onHoverNode={setHoveredNodeId}
            onMoveNode={handleMoveNode}
            onLayoutNodes={handleLayoutNodes}
          />
          {activeNode && (
            <InspectionPanel
              node={activeNode}
              workspaceId={workspace.id}
              documentId={document.id}
              documentName={document.filename}
            />
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 h-screen text-on-surface">
      <h1 className="font-display text-display">No Graph Loaded</h1>
      <p className="text-on-surface-variant">Create a workspace and upload documents to get started.</p>
      <button
        type="button"
        onClick={() => setScreen('dashboard')}
        className="bg-primary text-on-primary font-label-md px-6 py-3 rounded-lg"
      >
        Go to Dashboard
      </button>
    </div>
  )
}