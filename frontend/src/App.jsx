import { useCallback, useMemo, useState } from 'react'
import TopNavBar from './components/layout/TopNavBar.jsx'
import GraphCanvas from './components/graph/GraphCanvas.jsx'
import InspectionPanel from './components/inspector/InspectionPanel.jsx'
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import { mockMetadata, mockNodes, mockEdges } from './data/mockData.js'

export default function App() {
  const [screen, setScreen] = useState('onboarding')
  const [activeNodeId, setActiveNodeId] = useState(mockNodes[0].id)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)

  const [nodes, setNodes] = useState(() =>
    mockNodes.map((node) => ({
      ...node,
      presentation: { ...node.presentation },
    }))
  )
  const edges = useMemo(() => mockEdges, [])
  const metadata = useMemo(() => mockMetadata, [])

  const activeNode = useMemo(
    () => nodes.find((node) => node.id === activeNodeId) ?? nodes[0],
    [nodes, activeNodeId]
  )

  const handleMoveNode = useCallback((nodeId, x, y) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? { ...node, presentation: { ...node.presentation, x, y } }
          : node
      )
    )
  }, [])

  if (screen === 'onboarding') {
    return (
      <OnboardingFlow
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

  return (
    <div className="text-on-surface font-body-md h-screen overflow-hidden flex flex-col">
      <TopNavBar
        metadata={metadata}
        onNavigateToDashboard={() => setScreen('dashboard')}
      />
      <main className="flex-1 relative flex overflow-hidden">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          activeNodeId={activeNodeId}
          hoveredNodeId={hoveredNodeId}
          onSelectNode={setActiveNodeId}
          onHoverNode={setHoveredNodeId}
          onMoveNode={handleMoveNode}
        />
        <InspectionPanel node={activeNode} />
      </main>
    </div>
  )
}