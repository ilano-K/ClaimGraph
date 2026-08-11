import { useRef, useState, type DragEvent } from 'react'
import Icon from '../ui/Icon'
import { cn, formatBytes, fileExtension } from '../../lib/utils'
import type { UploadedFile } from '../../api/types'

const FILE_ICON: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
}

interface UploadStepProps {
  files: UploadedFile[]
  error: string | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  onProcess: () => void
  onBack: () => void
  onSkip: () => void
}

/**
 * Upload (Step 2) screen. Drag-and-drop zone plus a real hidden file picker
 * (PDF/DOCX only). Selected files are listed with remove controls and handed
 * back up to the orchestrator, which uploads and compiles them against the
 * created workspace.
 */
export default function UploadStep({
  files,
  error,
  onAdd,
  onRemove,
  onProcess,
  onBack,
  onSkip,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const count = files.length

  const handleDragEnter = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragLeave = () => {
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    onAdd(Array.from(e.dataTransfer.files))
  }

  return (
    <main className="relative z-10 pt-[120px] pb-24 px-margin-mobile md:px-margin-desktop flex flex-col items-center min-h-screen">
      <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>

      <div className="relative w-full max-w-3xl flex flex-col gap-12">
        <div className="flex flex-col gap-4 text-center items-center">
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 border border-primary/20 mb-2">
            <Icon name="upload_file" className="text-primary text-3xl" />
          </div>
          <h1 className="font-display text-display text-on-background">
            Upload Your Documents
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Add the contracts, RFCs, and reports you want to interrogate.
            ClaimGraph will map every claim to its evidence automatically.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'w-full flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-14 transition-all duration-200 bg-surface-container-low/40 backdrop-blur-xl',
              dragging
                ? 'border-primary scale-[1.01] bg-primary/5'
                : 'border-outline-variant/60 hover:border-primary/50 hover:bg-surface-container-low/60'
            )}
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 transition-transform duration-200">
              <Icon
                name="cloud_upload"
                className={cn('text-primary text-4xl transition-transform duration-200', dragging && 'scale-110')}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-label-md text-label-md text-on-surface">
                Drag &amp; drop files here
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                or <span className="text-primary underline underline-offset-4">browse from your device</span>
              </span>
            </div>
            <span className="font-mono text-mono text-outline text-[11px] uppercase tracking-widest">
              PDF · DOCX only
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                onAdd(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </button>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error">
              <Icon name="error" className="text-[18px] shrink-0" />
              {error}
            </div>
          )}
        </div>

        {count > 0 && (
          <div className="flex flex-col gap-3 w-full">
            <div className="flex justify-between items-end">
              <span className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
                Selected Files
              </span>
              <span className="font-mono text-mono text-primary font-bold">
                {count} file{count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-col bg-surface-container-low/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl divide-y divide-white/5">
              {files.map(({ id, file }) => {
                const ext = fileExtension(file.name)
                return (
                  <div
                    key={id}
                    className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon name={FILE_ICON[ext] ?? 'description'} className="text-primary" />
                    </div>
                    <div className="flex flex-col gap-0.5 flex-grow min-w-0">
                      <span className="font-label-md text-label-md text-on-surface truncate">
                        {file.name}
                      </span>
                      <span className="font-mono text-mono text-on-surface-variant opacity-70 text-[11px]">
                        {formatBytes(file.size)} · {ext.toUpperCase()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(id)}
                      aria-label={`Remove ${file.name}`}
                      className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                    >
                      <Icon name="close" className="text-[18px]" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onBack}
            className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={onSkip}
              className="font-label-md text-label-md text-outline hover:text-primary transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onProcess}
              disabled={count === 0}
              className={cn(
                'font-label-md text-label-md px-8 py-3 rounded-lg flex items-center gap-2 transition-all',
                count === 0
                  ? 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border border-outline-variant/30'
                  : 'bg-primary-container text-on-primary-container kinetic-glow active:scale-95 border border-transparent'
              )}
            >
              Process {count > 0 ? `${count} File${count === 1 ? '' : 's'}` : 'Files'}
              <Icon name="arrow_forward" className="text-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}