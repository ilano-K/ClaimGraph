import { cn } from '../../lib/utils'

interface IconProps {
  name: string
  className?: string
  fontSize?: string | number
  filled?: boolean
}

/**
 * Wrapper around the Material Symbols outlined icon font.
 * Usage: <Icon name="settings" />
 */
export default function Icon({ name, className, fontSize, filled }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined select-none leading-none', className)}
      style={{
        ...(fontSize ? { fontSize } : undefined),
        ...(filled ? { fontVariationSettings: "'FILL' 1" } : undefined),
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
