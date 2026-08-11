import Icon from '../ui/Icon'

/**
 * Sticky bottom row: question input plus the Dismiss / Add to Draft actions.
 */
export default function InspectorFooter() {
  return (
    <div className="p-4 border-t border-white/10 bg-surface/80 backdrop-blur-md">
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Ask about this node..."
          className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-primary focus:ring-0 px-0 py-2 text-body-sm text-on-surface transition-colors placeholder:text-outline-variant"
        />
        <button type="button" className="absolute right-0 top-2 text-primary hover:text-primary-fixed transition-colors" aria-label="Send">
          <Icon name="send" className="!text-[20px]" />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 glass-panel text-on-surface border border-outline-variant/50 hover:bg-surface-bright/20 font-label-md py-2 rounded-lg transition-all text-sm"
        >
          Dismiss
        </button>
        <button
          type="button"
          className="flex-1 bg-secondary text-on-secondary-fixed font-label-md py-2 rounded-lg hover:bg-secondary-fixed transition-all text-sm shadow-[0_0_15px_rgba(78,222,163,0.3)]"
        >
          Add to Draft
        </button>
      </div>
    </div>
  )
}
