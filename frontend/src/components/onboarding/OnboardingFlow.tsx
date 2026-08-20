import { useCallback, useState } from 'react'
import OnboardingHeader from './OnboardingHeader'
import WelcomeStep from './WelcomeStep'
import CreateWorkspaceStep from './CreateWorkspaceStep'
import UploadStep from './UploadStep'
import { createWorkspace, uploadDocuments } from '../../api/client'
import type {
  UploadedFile,
  WorkspaceResponse,
} from '../../api/types'
import { fileExtension } from '../../lib/utils'

const STEPS = {
  welcome: 1,
  workspace: 2,
  upload: 3,
} as const

type Step = keyof typeof STEPS

interface OnboardingFlowProps {
  onOpenWorkspace: (workspace: WorkspaceResponse) => void
  onSkip: () => void
}

/**
 * Orchestrates the onboarding flow (welcome -> create workspace -> upload).
 * The workspace is created via `POST /workspaces/create`; documents are
 * uploaded WITHOUT compiling — the flow ends by opening the project space,
 * where each document can be analyzed individually.
 */
export default function OnboardingFlow({ onOpenWorkspace, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleCreateWorkspace = async () => {
    if (isCreating) return
    setIsCreating(true)
    setCreateError(null)
    try {
      if (workspace) {
        setStep('upload')
        return
      }
      const created = await createWorkspace({
        name: workspaceName.trim(),
        description: workspaceDescription.trim(),
      })
      setWorkspace(created)
      setStep('upload')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create the workspace.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAddFiles = (incoming: File[]) => {
    const accepted = incoming.filter(
      (file) =>
        fileExtension(file.name) === 'pdf' || fileExtension(file.name) === 'docx'
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
          ? `${invalid} file${invalid === 1 ? '' : 's'} skipped — only PDF and DOCX files are supported.`
          : 'That file type is not supported. Only PDF and DOCX files are accepted.'
      )
    } else {
      setUploadError(null)
    }
  }

  const handleRemoveFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const handleFinishUpload = useCallback(async () => {
    if (!workspace || files.length === 0 || isUploading) return
    setIsUploading(true)
    setUploadError(null)
    try {
      // Upload only — documents sit in the project space until analyzed.
      await uploadDocuments(workspace.id, files.map(({ file }) => file))
      onOpenWorkspace(workspace)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }, [workspace, files, isUploading, onOpenWorkspace])

  return (
    <div className="text-on-background font-body-md bg-background min-h-screen flex flex-col overflow-x-hidden antialiased">
      <OnboardingHeader activeStep={STEPS[step]} totalSteps={3} />

      {step === 'welcome' && (
        <WelcomeStep onContinue={() => setStep('workspace')} onSkip={onSkip} />
      )}

      {step === 'workspace' && (
        <CreateWorkspaceStep
          name={workspaceName}
          onNameChange={setWorkspaceName}
          description={workspaceDescription}
          onDescriptionChange={setWorkspaceDescription}
          error={createError}
          isSubmitting={isCreating}
          onSubmit={() => void handleCreateWorkspace()}
          onBack={() => setStep('welcome')}
          onSkip={onSkip}
        />
      )}

      {step === 'upload' && (
        <UploadStep
          files={files}
          error={uploadError}
          isSubmitting={isUploading}
          onAdd={handleAddFiles}
          onRemove={handleRemoveFile}
          onProcess={() => void handleFinishUpload()}
          onBack={() => setStep('workspace')}
          onSkip={onSkip}
        />
      )}
    </div>
  )
}