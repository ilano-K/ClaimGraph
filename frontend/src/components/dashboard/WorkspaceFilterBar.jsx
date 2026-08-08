import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'
import { filterOptions, sortOptions } from '../../data/dashboardData.js'

/**
 * Workspace filter controls above the card grid. Mirrors dashboard.html:
 * a segmented scope toggle plus a sort dropdown.
 */
export default function WorkspaceFilterBar() {
  const [activeFilter, setActiveFilter] = useState(filterOptions[0].key)
  const [sortKey, setSortKey] = useState(sortOptions[0].key)

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <div className="flex bg-surface-container-high rounded p-1">
        {filterOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setActiveFilter(option.key)}
            className={cn(
              'px-4 py-1.5 rounded font-label-md transition-colors',
              activeFilter === option.key
                ? 'bg-surface-variant text-on-surface shadow-sm border border-white/5'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 font-label-sm text-on-surface-variant">
        <span>Sort by:</span>
        <button
          type="button"
          className="flex items-center gap-1 border-b border-outline-variant pb-0.5 hover:text-primary transition-colors"
        >
          {sortOptions.find((option) => option.key === sortKey)?.label}
          <Icon name="keyboard_arrow_down" className="text-[16px]" />
        </button>
      </div>
    </div>
  )
}