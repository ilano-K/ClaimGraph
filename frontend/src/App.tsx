import { useCallback, useState } from 'react'
import TopNavBar from './components/layout/TopNavBar'
import GraphCanvas from './components/graph/GraphCanvas'
import InspectionPanel from './components/inspector/InspectionPanel'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import Dashboard from './components/dashboard/Dashboard'
import { mapGraphPayload, type MappedGraph } from './lib/mapGraph'
import { recompileWorkspace } from './api/client'
import type { CompileResponse, GraphPayload, WorkspaceResponse } from './api/types'

type Screen = 'onboarding' | 'dashboard' | 'workspace'

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [graph, setGraph] = useState<MappedGraph | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [isRecompiling, setIsRecompiling] = useState(false)
  const [recompileError, setRecompileError] = useState<string | null>(null)
  const [refitSignal, setRefitSignal] = useState(0)

  const handleGraphCompiled = useCallback((result: CompileResponse) => {
    const mapped = mapGraphPayload(result.graph)
    setGraph(mapped)
    setActiveNodeId((prev) => prev ?? mapped.nodes[0]?.id ?? null)
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

  const handleLayoutNodes = useCallback((positions: Record<string, { x: number; y: number }>) => {
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
  }, [])

  const handleOpenWorkspace = useCallback((workspace: WorkspaceResponse) => {
    const payload = workspace.graph_payload
    if (payload) {
      setGraph(mapGraphPayload(payload as unknown as GraphPayload))
      setActiveNodeId(null)
      setHoveredNodeId(null)
    }
    setWorkspaceId(workspace.id)
    setIsRecompiling(false)
    setRecompileError(null)
    setScreen('workspace')
  }, [])

  const handleRecompile = useCallback(async () => {
    if (!workspaceId) return
    setIsRecompiling(true)
    setRecompileError(null)
    try {
      const result = await recompileWorkspace(workspaceId)
      setGraph(mapGraphPayload(result.graph))
      setActiveNodeId(result.graph.nodes[0]?.id ?? null)
      setRefitSignal((n) => n + 1)
    } catch (err) {
      setRecompileError(err instanceof Error ? err.message : 'Recompile failed.')
    } finally {
      setIsRecompiling(false)
    }
  }, [workspaceId])

  if (screen === 'onboarding') {
    return (
      <OnboardingFlow
        onGraphCompiled={handleGraphCompiled}
        onOpenWorkspace={(workspace) => {
          setWorkspaceId(workspace.id)
          setIsRecompiling(false)
          setRecompileError(null)
          setScreen('workspace')
        }}
        onSkip={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'dashboard') {
    return (
      <Dashboard
        onNewWorkspace={() => setScreen('onboarding')}
        onOpenWorkspace={handleOpenWorkspace}
      />
    )
  }

  if (!graph) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 h-screen text-on-surface">
        <h1 className="font-display text-display">No Graph Loaded</h1>
        <p className="text-on-surface-variant">
          Create a workspace and upload documents to build your first graph.
        </p>
        <button
          type="button"
          onClick={() => setScreen('onboarding')}
          className="bg-primary text-on-primary font-label-md px-6 py-3 rounded-lg"
        >
          Create a Workspace
        </button>
      </div>
    )
  }

  const activeNode =
    graph.nodes.find((node) => node.id === activeNodeId) ?? graph.nodes[0] ?? null

  return (
    <div className="text-on-surface font-body-md h-screen overflow-hidden flex flex-col">
      <TopNavBar
        metadata={graph.metadata}
        onNavigateToDashboard={() => setScreen('dashboard')}
        isRecompiling={isRecompiling}
        recompileError={recompileError}
        onRecompile={handleRecompile}
        onDismissRecompileError={() => setRecompileError(null)}
      />
      <main className="flex-1 relative flex overflow-hidden">
        <GraphCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          activeNodeId={activeNodeId}
          hoveredNodeId={hoveredNodeId}
          refitSignal={refitSignal}
          onSelectNode={setActiveNodeId}
          onHoverNode={setHoveredNodeId}
          onMoveNode={handleMoveNode}
          onLayoutNodes={handleLayoutNodes}
        />
        {activeNode && <InspectionPanel node={activeNode} />}
      </main>
    </div>
  )
}