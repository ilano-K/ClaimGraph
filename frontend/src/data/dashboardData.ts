/**
 * Static data for the workspace Dashboard. Still fake: there is no backend
 * endpoint to list workspaces yet, so the grid/sidebar/filters render these
 * placeholders. Not part of the /graphs/compile or /workspaces/create wiring.
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
  tone?: 'green' | 'red'
}

export interface WorkspaceSummary {
  id: string
  ingress: 'HTTP' | 'MCP'
  title: string
  lastModified: string
  documentLabel: string
  status: 'ready' | 'processing'
  metrics: WorkspaceMetric[]
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

export const workspaces: WorkspaceSummary[] = [
  {
    id: 'ws-consensus',
    ingress: 'HTTP',
    title: 'Distributed Consensus Analysis',
    lastModified: '2 hours ago',
    documentLabel: '3 RFCs uploaded',
    status: 'ready',
    metrics: [
      { label: 'Core Claims', value: 12 },
      { label: 'Empirical Evidence', value: 45, tone: 'green' },
      { label: 'Red Trade-Offs', value: 8, tone: 'red' },
    ],
  },
  {
    id: 'ws-neural',
    ingress: 'MCP',
    title: 'Neural-Net-Lit-Review',
    lastModified: 'Just now',
    documentLabel: '5 PDFs uploaded',
    status: 'processing',
    metrics: [
      { label: 'Core Claims', value: null },
      { label: 'Empirical Evidence', value: null },
      { label: 'Trade-Offs', value: null },
    ],
  },
]
