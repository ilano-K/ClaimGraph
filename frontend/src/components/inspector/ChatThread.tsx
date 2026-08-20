import ReactMarkdown from 'react-markdown'
import Icon from '../ui/Icon'
import type { ChatMessage } from '../../api/types'

function normalizeMarkdown(text: string): string {
  const lines = text.split('\n')
  const result = lines.map((line, i) => {
    const isBullet = /^[ \t]*[-*+] /.test(line)
    if (i > 0 && isBullet) {
      const prev = lines[i - 1]
      const prevIsList = /^[ \t]*[-*+] /.test(prev) || /^[ \t]*\d+[.)] /.test(prev)
      if (!prevIsList && prev.trim() !== '') return '\n' + line
    }
    return line
  })
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const markdownComponents: Parameters<typeof ReactMarkdown>[0]['components'] = {
  p: ({ children }) => <p>{children}</p>,
  h1: ({ children }) => <h1 className="text-body-lg font-semibold text-on-surface">{children}</h1>,
  h2: ({ children }) => <h2 className="text-body-md font-semibold text-on-surface">{children}</h2>,
  h3: ({ children }) => <h3 className="text-body-sm font-semibold text-on-surface">{children}</h3>,
  h4: ({ children }) => <h4 className="text-body-sm font-semibold text-on-surface">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc ml-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-4">{children}</ol>,
  li: ({ children }) => <li className="leading-normal">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-outline-variant pl-3 italic">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="bg-surface-container-high p-2 rounded-md overflow-x-auto whitespace-pre font-mono text-[12px]">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className) || /^\n/.test(String(children))
    return isBlock ? (
      <code className="font-mono text-[12px]">{children}</code>
    ) : (
      <code className="bg-surface-container-high px-1 py-0.5 rounded font-mono text-[12px]">{children}</code>
    )
  },
}

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
          'rounded-lg rounded-tl-none p-3 text-body-sm whitespace-pre-wrap ' +
          (isAssistant
            ? 'bg-primary-container/5 border border-primary/10 text-on-surface-variant'
            : 'bg-surface-container')
        }
      >
        {isAssistant ? (
          <div className="space-y-2">
            <ReactMarkdown components={markdownComponents}>{normalizeMarkdown(message.text)}</ReactMarkdown>
          </div>
        ) : (
          message.text
        )}
      </div>
    </div>
  )
}

interface ChatThreadProps {
  thread: ChatMessage[]
  title?: string
  emptyText?: string
}

/**
 * A chronological list of chat bubbles. Used both by the Details tab
 * (static analysis thread) and the Graph Chat tab (live conversation).
 */
export default function ChatThread({ thread, title = 'Analysis Thread', emptyText = 'No follow-up questions yet.' }: ChatThreadProps) {
  const messages = thread ?? []
  if (messages.length === 0) {
    return (
      <div>
        <h4 className="font-label-sm text-outline mb-3 text-[11px] uppercase tracking-widest">
          {title}
        </h4>
        <p className="text-[13px] text-on-surface-variant">{emptyText}</p>
      </div>
    )
  }
  return (
    <div className="mt-4 flex-1 flex flex-col">
      <h4 className="font-label-sm text-outline mb-3 text-[11px] uppercase tracking-widest">
        {title}
      </h4>
      <div className="flex flex-col gap-4 flex-1">
        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}
      </div>
    </div>
  )
}
