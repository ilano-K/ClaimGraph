import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'

const STATUS_STYLES = {
  complete: {
    icon: 'check_circle',
    chip: 'bg-secondary/10 border-secondary/20 text-secondary',
    labelClass: 'text-secondary',
    rowClass: '',
    scan: false,
  },
  extracting: {
    icon: 'psychology',
    chip: 'bg-primary/10 border-primary/30 text-primary',
    labelClass: 'text-primary animate-pulse',
    rowClass: 'bg-primary/[0.02]',
    scan: true,
  },
  uploading: {
    icon: 'cloud_upload',
    chip: 'bg-surface-variant border-outline-variant text-outline',
    labelClass: 'text-outline',
    rowClass: '',
    scan: false,
  },
}

const STATUS_LABELS = {
  complete: 'Complete',
  extracting: 'Extracting Text...',
  uploading: 'Uploading...',
}

/**
 * Single document row inside the processing card. Visual state is driven by
 * the document status (complete / extracting / uploading).
 */
export default function ProcessingFileRow({ document: doc }) {
  const style = STATUS_STYLES[doc.status]
  const barClass = { complete: 'bg-secondary', extracting: 'bg-primary', uploading: 'bg-outline-variant' }[doc.status]

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-4 p-5 border-b border-white/5 hover:bg-white/[0.02] transition-colors group',
        style.rowClass
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 relative',
          style.scan && 'overflow-hidden scan-line',
          style.chip
        )}
      >
        <Icon name={style.icon} className="text-secondary" />
      </div>
      <div className="flex flex-col gap-1 flex-grow min-w-0">
        <div className="flex justify-between items-start sm:items-center gap-4">
          <span className="font-label-md text-label-md text-on-surface truncate">{doc.name}</span>
          <span className={cn('font-mono text-mono shrink-0', style.labelClass)}>
            {STATUS_LABELS[doc.status]}
          </span>
        </div>
        <div className="flex justify-between items-center gap-4 mt-1">
          <span className="font-mono text-mono text-on-surface-variant opacity-70 text-[11px] shrink-0">
            {doc.size}
          </span>
          <div
            className={cn(
              'flex-grow h-1 bg-surface-container-highest rounded-full overflow-hidden relative',
              style.scan && 'scan-line'
            )}
          >
            <div
              className={cn(
                'absolute h-full rounded-full transition-all duration-300',
                style.scan && 'scan-line',
                barClass
              )}
              style={{ width: `${doc.progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}