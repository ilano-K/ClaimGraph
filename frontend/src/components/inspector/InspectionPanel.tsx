import { useState } from 'react'
import Icon from '../ui/Icon'
import DetailsSection from './DetailsSection'
import CitationsSection from './CitationsSection'
import GraphChatSection from './GraphChatSection'
import InspectorFooter from './InspectorFooter'
import { cn } from '../../lib/utils'
import type { GraphNodeView, NodeContent } from '../../api/types'

const TABS = [
  { key: 'details', icon: 'info', label: 'Details' },
  { key: 'citations', icon: 'format_quote', label: 'Citations' },
  { key: 'chat', icon: 'bolt', label: 'Graph Chat' },
]

type TabKey = (typeof TABS)[number]['key']

function covers(node: GraphNodeView): NodeContent {
  return {
    synthesis: node.presentation.synthesis,
    quote: node.quote,
    quoteSource: node.presentation.quoteSource,
    thread: node.presentation.thread,
    citations: node.presentation.citations,
  }
}

interface InspectionPanelProps {
  node: GraphNodeView
  workspaceId: string
  documentId: string
  documentName: string
}

/**
 * The right-side inspection panel. Chooses its body based on the active tab
 * and renders the shared query bar / CTA footer at the bottom.
 */
export default function InspectionPanel({
  node,
  workspaceId,
  documentId,
  documentName,
}: InspectionPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('details')
  const [width, setWidth] = useState(380)
  const [isDragging, setIsDragging] = useState(false)
  const content = covers(node)

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
  }

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const max = Math.round(window.innerWidth * 0.6)
    const next = Math.min(Math.max(window.innerWidth - e.clientX, 260), max)
    setWidth(next)
  }

  const stopResize = () => setIsDragging(false)

  return (
    <aside
      style={{ width }}
      className={cn(
        'shrink-0 glass-panel border-l border-white/10 flex flex-col shadow-2xl relative z-30',
        isDragging && 'select-none'
      )}
    >
      <div
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        className="absolute top-0 bottom-0 left-0 w-5 -translate-x-1/2 cursor-col-resize z-40 flex items-center justify-center group"
      >
        <div
          className={cn(
            'w-px h-full bg-white/10 transition-colors',
            isDragging ? 'bg-secondary' : 'group-hover:bg-white/25'
          )}
        />
      </div>
      {/* Panel Header Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-surface/40">
        <div className="flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1 pb-1 text-label-sm transition-colors',
                activeTab === tab.key
                  ? 'text-secondary border-b-2 border-secondary'
                  : 'text-outline hover:text-on-surface-variant'
              )}
            >
              <Icon name={tab.icon} className="!text-[16px]" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {activeTab === 'details' && <DetailsSection node={node} content={content} />}
        {activeTab === 'citations' && <CitationsSection content={content} />}
        {activeTab === 'chat' && (
          <GraphChatSection
            workspaceId={workspaceId}
            documentId={documentId}
            documentName={documentName}
          />
        )}
      </div>

      <InspectorFooter />
    </aside>
  )
}
