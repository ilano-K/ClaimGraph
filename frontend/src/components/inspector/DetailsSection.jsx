import Icon from '../ui/Icon.jsx'

/**
 * Title block + verified pill + steady analysis meta for a node.
 */
export default function DetailsSection({ node, content }) {
  const presentation = node.presentation

  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-bright border border-outline-variant text-on-surface-variant flex items-center gap-1">
            <span className="text-secondary">✓</span> 100% Verbatim Verified
          </span>
        </div>
        <h2 className="font-headline-md text-headline-md text-xl mb-1 text-on-surface">
          {node.title}
        </h2>
        <p className="font-mono text-[11px] !text-label-sm text-outline uppercase tracking-wider">
          {presentation.meta}
        </p>
      </div>

      <div className="text-[13px] text-on-surface-variant leading-relaxed">
        <p>{content.synthesis}</p>
      </div>

      {/* Quote Box */}
      <div className="relative p-4 bg-red-950/20 border-l-2 border-red-500 rounded-r-lg group">
        <Icon name="format_quote" className="absolute top-2 left-2 text-red-500/20 !text-3xl" />
        <p className="text-[13px] text-on-surface italic relative z-10 pl-6">{content.quote}</p>
        <div className="mt-2 pl-6 font-mono text-[10px] text-outline">{content.quoteSource}</div>
      </div>
    </>
  )
}