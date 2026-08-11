import type { WorkspaceMetadata } from '../../api/types'
import Icon from '../ui/Icon'

interface NavItemDef {
  key: string
  label: string
  hint: string
  active: boolean
}

const NAV_ITEMS: NavItemDef[] = [
  { key: 'full-web', label: 'Full Web', hint: '🌐', active: true },
  { key: 'skeptic', label: 'Skeptic Mode', hint: '🔴', active: false },
  { key: 'evidence', label: 'Evidence Trail', hint: '🟢', active: false },
]

function NavItem({ item }: { item: NavItemDef }) {
  if (item.active) {
    return (
      <button
        type="button"
        className="text-primary border-b-2 border-primary pb-1 font-label-md text-label-md transition-colors flex items-center gap-1"
      >
        <span>{item.hint}</span>
        {item.label}
      </button>
    )
  }
  return (
    <button
      type="button"
      className="text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md pb-1 flex items-center gap-1"
    >
      <span>{item.hint}</span>
      {item.label}
    </button>
  )
}

interface TopNavBarProps {
  metadata: WorkspaceMetadata
  onNavigateToDashboard: () => void
}

export default function TopNavBar({ metadata, onNavigateToDashboard }: TopNavBarProps) {
  return (
    <header className="flex justify-between items-center px-gutter h-16 bg-surface/60 backdrop-blur-xl border-b border-white/10 shrink-0">
      {/* Left: Brand & Document Info */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg object-cover border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
            <Icon name="share" className="text-on-primary text-[18px]" />
          </div>
          <span className="font-display text-headline-md font-bold text-primary tracking-tighter">
            ClaimGraph
          </span>
        </div>
        <div className="h-6 w-px bg-outline-variant/50 mx-2 hidden sm:block"></div>
        <div className="hidden sm:flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/30 text-body-sm min-w-0">
          <Icon name="description" className="text-outline !text-[16px]" />
          <span className="text-on-surface font-mono truncate max-w-[200px] lg:max-w-xs">
            {metadata.title}
          </span>
        </div>
      </div>

      {/* Center: Navigation/Filters */}
      <nav className="hidden md:flex items-center gap-6">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.key} item={item} />
        ))}
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30 !text-label-sm">
          <div className="w-2 h-2 rounded-full bg-secondary"></div>
          <span className="text-outline text-[11px] font-label-sm uppercase">Connect MCP</span>
        </div>
        <button
          type="button"
          className="bg-primary-container text-on-primary-container font-label-md px-4 py-2 rounded-lg hover:bg-primary-fixed transition-colors flex items-center gap-2"
        >
          <Icon name="upload_file" className="!text-[18px]" />
          <span className="hidden sm:inline">Analyze PDF</span>
        </button>
        <button
          type="button"
          className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-all"
          aria-label="Dashboard"
          onClick={onNavigateToDashboard}
        >
          <Icon name="home" />
        </button>
        <button
          type="button"
          className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-all"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}
