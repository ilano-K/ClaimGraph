import Icon from '../ui/Icon.jsx'

export default function FloatingControls({ onZoomIn, onZoomOut, onFit, onToggleFullscreen, isFullscreen }) {
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
          aria-label="Fit screen"
          onClick={onFit}
        >
          <Icon name="fit_screen" />
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
    </div>
  )
}