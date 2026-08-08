import { memo, useEffect, useRef } from 'react'
import Icon from '../ui/Icon.jsx'
import { cn, formatConfidence } from '../../lib/utils.js'
import { NODE_TONES } from '../../data/mockData.js'

/**
 * A single claim card on the graph canvas. Draggable via pointer events and
 * reports its rendered size so edges can anchor to the true card geometry.
 */
function NodeCard({
  node,
  isActive,
  onSelect,
  onHover,
  onMeasure,
  onNodePointerDown,
}) {
  const { presentation } = node
  const tone = NODE_TONES[presentation.tone]
  const cardRef = useRef(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const report = () => {
      const width = el.offsetWidth
      const height = el.offsetHeight
      if (width > 0 && height > 0) {
        onMeasure(node.id, { width, height })
      }
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [node.id, onMeasure])

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute node-card rounded-lg p-4 z-10 flex flex-col gap-3 cursor-grab active:cursor-grabbing',
        tone.card,
        isActive && 'active'
      )}
      style={{ top: presentation.y, left: presentation.x, width: presentation.width }}
      onPointerDown={(e) => onNodePointerDown(node, e)}
      onClick={(e) => onSelect(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex justify-between items-start gap-2">
        <span
          className={cn(
            'px-2 py-0.5 rounded-full font-mono text-[9px] tracking-wider whitespace-nowrap',
            tone.badge
          )}
        >
          {presentation.badgeLabel}
        </span>
        <Icon name="more_horiz" className="text-outline !text-[16px] shrink-0" />
      </div>
      <h3 className="font-headline-md text-headline-md text-on-surface !text-lg leading-tight">
        {node.title}
      </h3>
      <p className="text-[13px] text-on-surface-variant leading-relaxed">{node.summary}</p>
      <div className="mt-1 h-1 w-full bg-surface-container rounded-full overflow-hidden">
        <div
          className={cn('h-full', tone.progress)}
          style={{ width: formatConfidence(node.confidence_score) }}
        ></div>
      </div>
    </div>
  )
}

export default memo(NodeCard)