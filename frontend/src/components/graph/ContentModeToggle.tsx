import { cn } from '../../lib/utils'

export type ContentMode = 'collapsed' | 'expanded'

interface ContentModeToggleProps {
  value: ContentMode
  onChange: (mode: ContentMode) => void
}

const MODES: Array<{ id: ContentMode; label: string }> = [
  { id: 'collapsed', label: 'Collapsed' },
  { id: 'expanded', label: 'Expanded' },
]

/**
 * Two-segment "Collapsed | Expanded" switch for node card content. Collapsed
 * hides card content until the card is hovered; Expanded shows it on every
 * card. Matches the glass-panel styling of the related filter dropdown.
 */
export default function ContentModeToggle({ value, onChange }: ContentModeToggleProps) {
  return (
    <div className="glass-panel rounded-lg p-0.5 flex items-center gap-0.5 font-label-md text-label-sm">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={cn(
            'px-3 py-1.5 rounded-md transition-colors',
            mode.id === value ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-white/10'
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}