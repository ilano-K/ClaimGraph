import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import ChatThread from './ChatThread'
import { chatWithDocument } from '../../api/client'
import type { ChatMessage } from '../../api/types'

interface GraphChatSectionProps {
  workspaceId: string
  documentId: string
  documentName: string
}

/**
 * The Graph Chat tab: a live conversation with the document agent.
 * History lives locally for the session (the backend is stateless).
 */
export default function GraphChatSection({
  workspaceId,
  documentId,
  documentName,
}: GraphChatSectionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || isSending) return
    setMessages((prev) => [...prev, { author: 'user', text }])
    setDraft('')
    requestAnimationFrame(adjustHeight)
    setIsSending(true)
    try {
      const result = await chatWithDocument(workspaceId, documentId, text)
      setMessages((prev) => [...prev, { author: 'assistant', text: result.reply }])
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Sorry, something went wrong.'
      setMessages((prev) => [...prev, { author: 'assistant', text: detail }])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded bg-primary-container/20 border border-primary/30 flex items-center justify-center shrink-0">
          <Icon name="hub" className="text-primary !text-[14px]" />
        </div>
        <h4 className="font-label-sm text-on-surface-variant text-[11px] uppercase tracking-widest">
          Graph Chat · {documentName}
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <ChatThread
          thread={messages}
          title="Graph Chat"
          emptyText="Ask a question about your documents to get started."
        />
        {isSending && (
          <div className="flex gap-3 mt-4">
            <div className="w-6 h-6 rounded bg-primary-container/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Icon name="bolt" className="text-primary !text-[14px]" />
            </div>
            <div className="rounded-lg rounded-tl-none p-3 bg-primary-container/5 border border-primary/10 text-body-sm text-on-surface-variant animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="relative mt-4">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            adjustHeight()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={`Ask about ${documentName}...`}
          disabled={isSending}
          className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-primary focus:ring-0 pr-10 py-2 text-body-sm text-on-surface transition-colors placeholder:text-outline-variant disabled:opacity-50 resize-none overflow-y-auto max-h-40"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || !draft.trim()}
          className="absolute right-0 top-2 text-primary hover:text-primary-fixed transition-colors disabled:opacity-40"
          aria-label="Send"
        >
          <Icon name="send" className="!text-[20px]" />
        </button>
      </div>
    </div>
  )
}