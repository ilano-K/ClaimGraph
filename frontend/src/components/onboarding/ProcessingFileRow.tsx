import Icon from '../ui/Icon'
import { cn } from '../../lib/utils'
import type { UploadedDocument } from '../../api/types'

interface ProcessingFileRowProps {
  document: UploadedDocument
  status: 'active' | 'complete'
}

/**
 * Single document row inside the processing card. Driven by the real request
 * phase: every uploaded file is `active` while the workspace is being
 * compiled and flips to `complete` when the compile response succeeds.
 */
export default function ProcessingFileRow({ document: doc, status }: ProcessingFileRowProps) {
  const isComplete = status === 'complete'

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
      <div
        className={cn(
          'w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 relative overflow-hidden scan-line',
          isComplete
            ? 'bg-secondary/10 border-secondary/20 text-secondary'
            : 'bg-primary/10 border-primary/30 text-primary'
        )}
      >
        <Icon name={isComplete ? 'check_circle' : 'document_scanner'} className="text-secondary" />
      </div>
      <div className="flex flex-col gap-1 flex-grow min-w-0">
        <div className="flex justify-between items-start sm:items-center gap-4">
          <span className="font-label-md text-label-md text-on-surface truncate">{doc.name}</span>
          <span
            className={cn(
              'font-mono text-mono shrink-0',
              isComplete ? 'text-secondary' : 'text-primary animate-pulse'
            )}
          >
            {isComplete ? 'Complete' : 'Processing...'}
          </span>
        </div>
        <div className="flex justify-between items-center gap-4 mt-1">
          <span className="font-mono text-mono text-on-surface-variant opacity-70 text-[11px] shrink-0">
            {doc.size}
          </span>
          <div
            className={cn(
              'flex-grow h-1 bg-surface-container-highest rounded-full overflow-hidden relative scan-line',
              !isComplete && 'animate-pulse-glow'
            )}
          ></div>
        </div>
      </div>
    </div>
  )
}
