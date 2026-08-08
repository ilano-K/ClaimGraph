import { cn } from '../../lib/utils.js'

/**
 * Wrapper around the Material Symbols outlined icon font.
 * Usage: <Icon name="settings" />
 */
export default function Icon({ name, className, fontSize }) {
  return (
    <span
      className={cn('material-symbols-outlined select-none leading-none', className)}
      style={fontSize ? { fontSize } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}