import { useCallback, useRef, useState, type DragEvent } from 'react'
import Icon from '../ui/Icon'
import { cn, fileExtension, formatBytes } from '../../lib/utils'
import { createWorkspace, uploadDocuments } from '../../api/client'
import type { UploadedFile, WorkspaceResponse } from '../../api/types'

type ModalStep = 'details' | 'upload'

interface NewWorkspaceModalProps {
  onClose: () => void
  onCreated: (workspace: WorkspaceResponse) => void
}

const FILE_ICON: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
}

export default function NewWorkspaceModal({ onClose, onCreated }: NewWorkspaceModalProps) {
  const [step, setStep] = useState<ModalStep>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const isValid = name.trim().length > 0

  const handleCreate = async () => {
    if (isCreating || !isValid) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const created = await createWorkspace({
        name: name.trim(),
        description: description.trim(),
      })
      setWorkspace(created)
      setStep('upload')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create workspace.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAddFiles = (incoming: File[]) => {
    const accepted = incoming.filter(
      (file) => fileExtension(file.name) === 'pdf' || fileExtension(file.name) === 'docx'
    )
    const invalid = incoming.length - accepted.length

    if (accepted.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          id: crypto.randomUUID(),
          file,
        })),
      ])
    }

    if (invalid > 0 || accepted.length === 0) {
      setUploadError(
        invalid > 0
          ? `${invalid} file${invalid === 1 ? '' : 's'} skipped — only PDF and DOCX are supported.`
          : 'That file type is not supported. Only PDF and DOCX files are accepted.'
      )
    } else {
      setUploadError(null)
    }
  }

  const handleRemoveFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const handleFinish = useCallback(async () => {
    if (!workspace || isUploading) return
    if (files.length === 0) {
      onCreated(workspace)
      return
    }
    setIsUploading(true)
    setUploadError(null)
    try {
      await uploadDocuments(workspace.id, files.map(({ file }) => file))
      onCreated(workspace)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }, [workspace, files, isUploading, onCreated])

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
    handleAddFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg mx-4 bg-surface-container border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Icon name={step === 'details' ? 'workspaces' : 'upload_file'} className="text-primary !text-[18px]" />
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface">
              {step === 'details' ? 'New Workspace' : 'Add Documents'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors"
            aria-label="Close"
          >
            <Icon name="close" className="!text-[20px]" />
          </button>
        </div>

        {step === 'details' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (isValid && !isCreating) void handleCreate()
            }}
          >
            <div className="px-6 py-5 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Network Infrastructure Review"
                  autoFocus
                  className="w-full bg-surface-container-low/60 border border-outline-variant/50 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                  Description <span className="text-outline">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this workspace about?"
                  rows={3}
                  className="w-full bg-surface-container-low/60 border border-outline-variant/50 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all resize-none"
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error">
                  <Icon name="error" className="!text-[18px] shrink-0" />
                  {createError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface px-4 py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || isCreating}
                className={cn(
                  'font-label-md text-label-md px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all',
                  !isValid || isCreating
                    ? 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed'
                    : 'bg-primary text-on-primary hover:bg-primary-fixed kinetic-glow'
                )}
              >
                {isCreating ? (
                  <>
                    <Icon name="sync" className="!text-[18px] animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    Create Workspace
                    <Icon name="arrow_forward" className="!text-[18px]" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === 'upload' && (
          <div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Add documents to <span className="text-on-surface font-medium">{workspace?.name}</span>. You can also skip this and add documents later.
              </p>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-all duration-200 bg-surface-container-low/40',
                  dragging
                    ? 'border-primary scale-[1.01] bg-primary/5'
                    : 'border-outline-variant/60 hover:border-primary/50 hover:bg-surface-container-low/60'
                )}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Icon
                    name="cloud_upload"
                    className={cn('text-primary text-3xl transition-transform duration-200', dragging && 'scale-110')}
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="font-label-md text-label-md text-on-surface">
                    Drag & drop files here
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    or <span className="text-primary underline underline-offset-4">browse</span>
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
                    handleAddFiles(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />
              </button>

              {uploadError && (
                <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error">
                  <Icon name="error" className="!text-[18px] shrink-0" />
                  {uploadError}
                </div>
              )}

              {files.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                      Selected
                    </span>
                    <span className="font-mono text-mono text-primary font-bold">
                      {files.length} file{files.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex flex-col bg-surface-container-low/60 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {files.map(({ id, file }) => {
                      const ext = fileExtension(file.name)
                      return (
                        <div key={id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon name={FILE_ICON[ext] ?? 'description'} className="text-primary !text-[16px]" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-grow">
                            <span className="font-label-md text-label-md text-on-surface truncate">
                              {file.name}
                            </span>
                            <span className="font-mono text-mono text-on-surface-variant opacity-70 text-[11px]">
                              {formatBytes(file.size)} · {ext.toUpperCase()}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(id)}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                          >
                            <Icon name="close" className="!text-[16px]" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={isUploading}
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Skip, open workspace
              </button>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={files.length === 0 || isUploading}
                className={cn(
                  'font-label-md text-label-md px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all',
                  files.length === 0 || isUploading
                    ? 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed'
                    : 'bg-primary text-on-primary hover:bg-primary-fixed kinetic-glow'
                )}
              >
                {isUploading ? (
                  <>
                    <Icon name="sync" className="!text-[18px] animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    Upload & Open
                    <Icon name="arrow_forward" className="!text-[18px]" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
