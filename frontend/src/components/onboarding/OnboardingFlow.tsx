import { useCallback, useState } from 'react'
import OnboardingHeader from './OnboardingHeader'
import WelcomeStep from './WelcomeStep'
import CreateWorkspaceStep from './CreateWorkspaceStep'
import UploadStep from './UploadStep'
import ProcessingStep from './ProcessingStep'
import ReadyStep from './ReadyStep'
import { compileWorkspace, createWorkspace, uploadDocuments } from '../../api/client'
import type {
  CompileResponse,
  ProcessingPhase,
  UploadedDocument,
  UploadedFile,
  WorkspaceResponse,
} from '../../api/types'
import { fileExtension, formatBytes } from '../../lib/utils'

const STEPS = {
  welcome: 1,
  workspace: 2,
  upload: 3,
  processing: 4,
  ready: 5,
} as const

type Step = keyof typeof STEPS

interface OnboardingFlowProps {
  onOpenWorkspace: () => void
  onSkip: () => void
  onGraphCompiled: (result: CompileResponse) => void
}

/**
 * Orchestrates the onboarding flow (welcome -> create workspace ->
 * upload -> processing -> ready). The workspace is created via
 * `POST /workspaces/create`; documents are uploaded and compiled through the
 * backend, and the resulting graph is handed up to `App` before the
 * workspace screen opens.
 */
export default function OnboardingFlow({
  onOpenWorkspace,
  onSkip,
  onGraphCompiled,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [phase, setPhase] = useState<ProcessingPhase>('uploading')
  const [compileError, setCompileError] = useState<string | null>(null)
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null)

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

  const runCompile = async (target: WorkspaceResponse) => {
    setPhase('uploading')
    setCompileError(null)
    try {
      await uploadDocuments(target.id, files.map(({ file }) => file))
      setPhase('compiling')
      const result = await compileWorkspace(target.id)
      setCompileResult(result)
      setPhase('complete')
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : 'Processing failed.')
      setPhase('error')
    }
  }

  const handleProcessUpload = () => {
    if (!workspace || files.length === 0) return
    setDocuments(
      files.map(({ id, file }) => ({
        id,
        name: file.name,
        size: formatBytes(file.size),
        kind: fileExtension(file.name),
      }))
    )
    setStep('processing')
    void runCompile(workspace)
  }

  const handleContinueReady = () => setStep('ready')

  const handleOpenWorkspace = useCallback(() => {
    if (compileResult) onGraphCompiled(compileResult)
    onOpenWorkspace()
  }, [compileResult, onGraphCompiled, onOpenWorkspace])

  return (
    <div className="text-on-background font-body-md bg-background min-h-screen flex flex-col overflow-x-hidden antialiased">
      <OnboardingHeader activeStep={STEPS[step]} totalSteps={5} />

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
          onAdd={handleAddFiles}
          onRemove={handleRemoveFile}
          onProcess={handleProcessUpload}
          onBack={() => setStep('workspace')}
          onSkip={onSkip}
        />
      )}

      {step === 'processing' && (
        <ProcessingStep
          documents={documents}
          phase={phase}
          error={compileError}
          onRetry={() => workspace && void runCompile(workspace)}
          onBackToUpload={() => setStep('upload')}
          onContinue={handleContinueReady}
        />
      )}

      {step === 'ready' && (
        <ReadyStep
          documents={compileResult?.documents ?? []}
          workspaceName={workspaceName}
          onOpenWorkspace={handleOpenWorkspace}
          onAddDocuments={() => setStep('upload')}
        />
      )}
    </div>
  )
}