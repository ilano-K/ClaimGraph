import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import {
  FILTER_OPTIONS,
  type RelationshipFilter,
  type RelationshipFilterOption,
} from '../../lib/relationshipFilter'

interface RelationshipFilterDropdownProps {
  value: RelationshipFilter
  onChange: (filter: RelationshipFilter) => void
}

/**
 * Floating dropdown that picks the active RelationshipFilter. Mirrors the
 * `glass-panel` styling and outside-click-to-close behavior used by the
 * dashboard card menu. Rendered inside the graph viewport.
 */
export default function RelationshipFilterDropdown({
  value,
  onChange,
}: RelationshipFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const selected = FILTER_OPTIONS.find((option) => option.id === value) ?? FILTER_OPTIONS[0]

  function selectOption(option: RelationshipFilterOption) {
    onChange(option.id)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="glass-panel rounded-lg px-3 py-2 flex items-center gap-2 font-label-md text-label-sm text-on-surface hover:bg-white/10 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="filter_list" className="text-[18px]" />
        <span className="hidden sm:inline">{selected.label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[16px]" />
      </button>
      {open && (
        <div className="glass-panel rounded-lg p-1 flex flex-col w-64 absolute left-0 top-10 z-30">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => selectOption(option)}
              className={cn(
                'px-3 py-2 rounded text-left transition-colors',
                option.id === value
                  ? 'text-primary bg-primary/10'
                  : 'text-on-surface hover:bg-white/10'
              )}
            >
              <span className="block font-label-sm">{option.label}</span>
              <span className="block font-label-sm text-label-xs text-on-surface-variant mt-0.5">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}