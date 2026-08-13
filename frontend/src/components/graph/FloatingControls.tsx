import Icon from '../ui/Icon'

interface FloatingControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onSweep: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
  isRecompiling: boolean
  recompileError: string | null
  onRecompile: () => void
}

export default function FloatingControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onSweep,
  onToggleFullscreen,
  isFullscreen,
  isRecompiling,
  recompileError,
  onRecompile,
}: FloatingControlsProps) {
  return (
    <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-20">
      <div className="glass-panel rounded-lg p-1 flex flex-col gap-1">
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors"
          aria-label="Zoom in"
          onClick={onZoomIn}
        >
          <Icon name="add" />
        </button>
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors"
          aria-label="Zoom out"
          onClick={onZoomOut}
        >
          <Icon name="remove" />
        </button>
        <div className="h-px bg-outline-variant/50 w-full my-1"></div>
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors"
          aria-label="Sweep layout"
          onClick={onSweep}
        >
          <Icon name="sweep" />
        </button>
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors"
          aria-label="Fit screen"
          onClick={onFit}
        >
          <Icon name="fit_screen" />
        </button>
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Recompile graph"
          onClick={onRecompile}
          disabled={isRecompiling}
        >
          <Icon name="sync" className={isRecompiling ? 'text-[16px] animate-spin' : 'text-[16px]'} />
        </button>
        <div className="h-px bg-outline-variant/50 w-full my-1"></div>
        <button
          type="button"
          className="p-2 text-on-surface hover:bg-white/10 rounded transition-colors"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={onToggleFullscreen}
        >
          <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} />
        </button>
      </div>
      {recompileError && (
        <div className="glass-panel rounded-lg px-3 py-2 flex items-start gap-2 text-error text-label-sm max-w-[200px]">
          <Icon name="error_outline" className="text-[16px] shrink-0 mt-0.5" />
          <span className="leading-snug">{recompileError}</span>
        </div>
      )}
    </div>
  )
}
