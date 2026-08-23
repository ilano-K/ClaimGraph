/**
 * Dashboard UI chrome: filter/sort options and sidebar navigation. The
 * workspace grid itself is now loaded live from `GET /api/workspaces/` via
 * `lib/mapWorkspace.ts` — no fake workspace list lives here.
 */

export interface FilterOption {
  key: string
  label: string
}

export interface SortOption {
  key: string
  label: string
}

export interface SidebarNavItem {
  key: string
  label: string
  icon: string
  active: boolean
}

export interface WorkspaceMetric {
  label: string
  value: number | null
  tone?: 'cyan' | 'green' | 'purple' | 'yellow' | 'amber' | 'red'
}

export interface WorkspaceSummary {
  id: string
  ingress: 'HTTP' | 'MCP'
  title: string
  lastModified: string
  documentCount: number
  analyzedCount: number
  status: 'ready' | 'compiling' | 'awaiting' | 'failed'
}

export const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Workspaces' },
  { key: 'http', label: 'Browser App (HTTP REST)' },
  { key: 'mcp', label: 'MCP Tool Workspaces' },
]

export const sortOptions: SortOption[] = [
  { key: 'last-modified', label: 'Last Modified' },
  { key: 'title', label: 'Title' },
]

export const sidebarNav: SidebarNavItem[] = [
  { key: 'all', label: 'All Workspaces', icon: 'dashboard', active: true },
  { key: 'http', label: 'HTTP Workspaces', icon: 'language', active: false },
  { key: 'mcp', label: 'MCP Workspaces', icon: 'terminal', active: false },
]
