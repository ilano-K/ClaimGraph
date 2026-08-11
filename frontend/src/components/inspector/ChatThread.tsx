import Icon from '../ui/Icon'
import type { ChatMessage } from '../../api/types'

function Message({ message }: { message: ChatMessage }) {
  const isAssistant = message.author === 'assistant'
  return (
    <div className="flex gap-3">
      <div
        className={
          'w-6 h-6 rounded flex items-center justify-center shrink-0 ' +
          (isAssistant
            ? 'bg-primary-container/20 border border-primary/30'
            : 'bg-surface-bright')
        }
      >
        <Icon
          name={isAssistant ? 'bolt' : 'person'}
          className={isAssistant ? 'text-primary !text-[14px]' : 'text-outline !text-[14px]'}
        />
      </div>
      <div
        className={
          'rounded-lg rounded-tl-none p-3 text-body-sm ' +
          (isAssistant
            ? 'bg-primary-container/5 border border-primary/10 text-on-surface-variant'
            : 'bg-surface-container')
        }
      >
        {message.text}
      </div>
    </div>
  )
}

interface ChatThreadProps {
  thread: ChatMessage[]
}

/**
 * The analysis thread shown in the Details tab.
 */
export default function ChatThread({ thread }: ChatThreadProps) {
  const messages = thread ?? []
  if (messages.length === 0) {
    return (
      <div>
        <h4 className="font-label-sm text-outline mb-3 text-[11px] uppercase tracking-widest">
          Analysis Thread
        </h4>
        <p className="text-[13px] text-on-surface-variant">No follow-up questions yet.</p>
      </div>
    )
  }
  return (
    <div className="mt-4 flex-1 flex flex-col">
      <h4 className="font-label-sm text-outline mb-3 text-[11px] uppercase tracking-widest">
        Analysis Thread
      </h4>
      <div className="flex flex-col gap-4 flex-1">
        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}
      </div>
    </div>
  )
}
