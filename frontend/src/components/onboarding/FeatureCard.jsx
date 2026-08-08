import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'

const ACCENT_STYLES = {
  primary: {
    chip: 'bg-primary-container/20 border-primary-container/30 text-primary-container group-hover:bg-primary-container/30',
    dot: 'bg-primary',
  },
  secondary: {
    chip: 'bg-secondary/20 border-secondary/30 text-secondary group-hover:bg-secondary/30',
    dot: 'bg-secondary',
  },
  tertiary: {
    chip: 'bg-tertiary/20 border-tertiary/30 text-tertiary group-hover:bg-tertiary/30',
    dot: 'bg-tertiary',
  },
}

/**
 * One of the three feature highlight cards on the Welcome (Step 1) screen.
 * Kept accent-agnostic; the accent comes from the feature data.
 */
export default function FeatureCard({ feature }) {
  const accent = ACCENT_STYLES[feature.accent]
  if (!accent) return null

  return (
    <div className="glass-panel rounded-xl p-6 flex items-start gap-6 hover:-translate-y-1 transition-transform duration-300 group">
      <div
        className={cn(
          'flex-shrink-0 w-12 h-12 rounded-lg border flex items-center justify-center transition-colors',
          accent.chip
        )}
      >
        <Icon name={feature.icon} className="text-3xl" />
      </div>
      <div>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
          {feature.title}
        </h3>
        <p className="font-body-md text-body-md text-outline">{feature.description}</p>
      </div>
    </div>
  )
}