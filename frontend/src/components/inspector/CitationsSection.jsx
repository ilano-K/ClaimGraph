import Icon from '../ui/Icon.jsx'

/**
 * The citations view for a node.
 */
export default function CitationsSection({ content }) {
  const citations = content?.citations ?? []

  return (
    <div className="flex flex-col gap-3">
      <p className="font-label-sm text-outline text-[11px] uppercase tracking-widest">
        Verbatim sources · {citations.length}
      </p>
      {citations.map((citation) => (
        <div
          key={citation.id}
          className="relative p-4 bg-surface-container/40 border-l-2 border-outline rounded-r-lg"
        >
          <Icon name="format_quote" className="absolute top-2 left-2 text-outline/20 !text-3xl" />
          <p className="text-[13px] text-on-surface italic relative z-10 pl-6">
            {citation.text}
          </p>
          <div className="mt-2 pl-6 font-mono text-[10px] text-outline">{citation.meta}</div>
        </div>
      ))}
    </div>
  )
}