/**
 * Fake data for the workspace Dashboard, mirroring the reference
 * dashboard.html design (dual-ingress workspace grid).
 */

export const filterOptions = [
  { key: 'all', label: 'All Workspaces' },
  { key: 'http', label: 'Browser App (HTTP REST)' },
  { key: 'mcp', label: 'MCP Tool Workspaces' },
]

export const sortOptions = [
  { key: 'last-modified', label: 'Last Modified' },
  { key: 'title', label: 'Title' },
]

export const sidebarNav = [
  { key: 'all', label: 'All Workspaces', icon: 'dashboard', active: true },
  { key: 'http', label: 'HTTP Workspaces', icon: 'language', active: false },
  { key: 'mcp', label: 'MCP Workspaces', icon: 'terminal', active: false },
]

export const workspaces = [
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