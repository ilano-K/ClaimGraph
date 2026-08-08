import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', active: true },
  { key: 'settings', label: 'Settings', active: false },
]

/**
 * Fixed top app bar for the Dashboard. Mirrors dashboard.html: brand + search,
 * primary nav links, and the primary "New Workspace" action.
 */
export default function DashboardHeader({ onNewWorkspace }) {
  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface-container/60 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center gap-8 flex-1 min-w-0">
        <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
            <Icon name="share" className="text-on-primary text-[18px]" />
          </div>
          ClaimGraph
        </h1>
        <div className="relative max-w-md w-full hidden md:block">
          <Icon
            name="search"
            className="absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pb-1 !text-body-md"
          />
          <input
            type="text"
            placeholder="Search workspaces or documents..."
            className="input-minimal w-full pl-8 pr-4 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0"
          />
        </div>
      </div>

      <nav className="hidden lg:flex items-center gap-6 font-label-md">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              'font-label-md transition-colors duration-200',
              item.active
                ? 'text-primary border-b-2 border-primary pb-1'
                : 'text-on-surface-variant hover:text-primary pb-1'
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4 flex-1 justify-end shrink-0">
        <button
          type="button"
          onClick={onNewWorkspace}
          className="bg-primary text-on-primary hover:bg-primary-fixed transition-colors duration-200 font-label-md px-4 py-2 rounded flex items-center gap-2"
          style={{ boxShadow: '0 0 15px rgba(173, 198, 255, 0.3)' }}
        >
          <Icon name="add" className="text-[18px]" />
          New Workspace
        </button>
      </div>
    </header>
  )
}