import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import { sidebarNav } from '../../data/dashboardData'

/**
 * Fixed left navigation rail for the Dashboard. Mirrors dashboard.html:
 * the active workspace identity, the workspace category links, and the
 * trailing settings entry. Pure presentational.
 */
export default function DashboardSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[280px] h-screen fixed left-0 top-0 z-40 pt-20 bg-surface-dim/50 backdrop-blur-xl border-r border-white/10">
      <div className="px-6 py-4 border-b border-white/5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
            <Icon name="share" className="text-on-primary text-[22px]" />
          </div>
          <div>
            <div className="font-label-md text-label-md text-on-surface">
              ClaimGraph MVP
            </div>
            <div className="font-mono text-label-sm text-on-surface-variant mt-0.5">
              Dual-Ingress Engine
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {sidebarNav.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              'flex items-center gap-3 w-full px-4 py-2.5 rounded transition-all duration-150 font-label-md',
              item.active
                ? 'bg-primary/10 text-primary border-r-4 border-primary scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-bright/50'
            )}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-white/5">
        <button
          type="button"
          className="flex items-center gap-3 px-4 py-2 rounded w-full text-on-surface-variant hover:bg-surface-variant/30 transition-all duration-150 font-label-md"
        >
          <Icon name="settings" className="text-[18px]" />
          Settings
        </button>
      </div>
    </aside>
  )
}