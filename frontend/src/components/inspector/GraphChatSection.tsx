import Icon from '../ui/Icon'
import ChatThread from './ChatThread'
import type { NodeContent } from '../../api/types'

interface GraphChatSectionProps {
  content: NodeContent
}

/**
 * The Graph Chat tab: a full-height chat between the user and the graph.
 */
export default function GraphChatSection({ content }: GraphChatSectionProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded bg-primary-container/20 border border-primary/30 flex items-center justify-center shrink-0">
          <Icon name="hub" className="text-primary !text-[14px]" />
        </div>
        <h4 className="font-label-sm text-on-surface-variant text-[11px] uppercase tracking-widest">
          Graph Chat · whole graph
        </h4>
      </div>
      <ChatThread thread={content.thread} />
    </div>
  )
}
