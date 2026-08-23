import Icon from '../ui/Icon'

export default function DashboardSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[280px] h-screen fixed left-0 top-0 z-40 pt-20 bg-surface-dim/50 backdrop-blur-xl border-r border-white/10">
      <nav className="flex-1 px-4 space-y-1">
        <button
          type="button"
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded transition-all duration-150 font-label-md bg-primary/10 text-primary border-r-4 border-primary scale-[0.98]"
        >
          <Icon name="dashboard" />
          Workspaces
        </button>
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