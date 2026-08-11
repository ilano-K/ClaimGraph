import { useCallback, useState } from 'react'
import TopNavBar from './components/layout/TopNavBar'
import GraphCanvas from './components/graph/GraphCanvas'
import InspectionPanel from './components/inspector/InspectionPanel'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import Dashboard from './components/dashboard/Dashboard'
import { mapGraphPayload, type MappedGraph } from './lib/mapGraph'
import type { CompileResponse } from './api/types'

type Screen = 'onboarding' | 'dashboard' | 'workspace'

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [graph, setGraph] = useState<MappedGraph | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

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

  if (screen === 'onboarding') {
    return (
      <OnboardingFlow
        onGraphCompiled={handleGraphCompiled}
        onOpenWorkspace={() => setScreen('workspace')}
        onSkip={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'dashboard') {
    return (
      <Dashboard
        onNewWorkspace={() => setScreen('onboarding')}
        onOpenWorkspace={() => setScreen('workspace')}
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
      />
      <main className="flex-1 relative flex overflow-hidden">
        <GraphCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          activeNodeId={activeNodeId}
          hoveredNodeId={hoveredNodeId}
          onSelectNode={setActiveNodeId}
          onHoverNode={setHoveredNodeId}
          onMoveNode={handleMoveNode}
        />
        {activeNode && <InspectionPanel node={activeNode} />}
      </main>
    </div>
  )
}