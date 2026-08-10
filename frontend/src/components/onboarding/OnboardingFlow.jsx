import { useEffect, useMemo, useRef, useState } from 'react'
import OnboardingHeader from './OnboardingHeader.jsx'
import WelcomeStep from './WelcomeStep.jsx'
import CreateWorkspaceStep from './CreateWorkspaceStep.jsx'
import UploadStep from './UploadStep.jsx'
import ProcessingStep from './ProcessingStep.jsx'
import ReadyStep from './ReadyStep.jsx'
import { clamp, fileExtension, formatBytes } from '../../lib/utils.js'

const STEP_NUMBER = {
  welcome: 1,
  workspace: 2,
  upload: 3,
  processing: 4,
  ready: 5,
}

/**
 * Orchestrates the fake onboarding flow (welcome -> create workspace ->
 * upload -> processing -> ready). Step 3 is a real file picker (PDF/DOCX);
 * the files the user selects become the documents simulated through the
 * Processing and Ready steps.
 */
export default function OnboardingFlow({ onOpenWorkspace, onSkip }) {
  const [step, setStep] = useState('welcome')
  const [files, setFiles] = useState([])
  const [documents, setDocuments] = useState([])
  const [uploadError, setUploadError] = useState(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const fileIdRef = useRef(0)

  useEffect(() => {
    if (step !== 'processing') return undefined

    const interval = setInterval(() => {
      setDocuments((prev) => {
        const allDone = prev.every((doc) => doc.status === 'complete')
        if (allDone) return prev

        return prev.map((doc) => {
          if (doc.status === 'complete') return doc
          const next = Math.min(100, doc.progress + 7 + Math.floor(Math.random() * 9))
          const status =
            next >= 100
              ? 'complete'
              : next >= 35
                ? 'extracting'
                : 'uploading'
          return { ...doc, status, progress: next }
        })
      })
    }, 260)

    return () => clearInterval(interval)
  }, [step])

  const overallProgress = useMemo(() => {
    if (documents.length === 0) return 0
    const sum = documents.reduce((acc, doc) => acc + doc.progress, 0)
    return Math.round(sum / documents.length)
  }, [documents])

  const handleAddFiles = (incoming) => {
    const accepted = incoming.filter((file) => fileExtension(file.name) === 'pdf' || fileExtension(file.name) === 'docx')
    const invalid = incoming.length - accepted.length

    if (accepted.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...accepted.map((file) => ({ id: `doc-${++fileIdRef.current}`, file })),
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

  const handleRemoveFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const handleProcessUpload = () => {
    setDocuments(
      files.map(({ id, file }) => {
        const ext = fileExtension(file.name)
        return {
          id,
          name: file.name,
          size: formatBytes(file.size),
          bytes: file.size,
          pages: clamp(Math.round(file.size / 30000), 1, 250),
          status: 'uploading',
          progress: 10,
          kind: ext,
        }
      })
    )
    setStep('processing')
  }

  const handleContinueReady = () => setStep('ready')

  return (
    <div className="text-on-background font-body-md bg-background min-h-screen flex flex-col overflow-x-hidden antialiased">
      <OnboardingHeader activeStep={STEP_NUMBER[step]} totalSteps={5} />

      {step === 'welcome' && (
        <WelcomeStep onContinue={() => setStep('workspace')} onSkip={onSkip} />
      )}

      {step === 'workspace' && (
        <CreateWorkspaceStep
          name={workspaceName}
          onNameChange={setWorkspaceName}
          description={workspaceDescription}
          onDescriptionChange={setWorkspaceDescription}
          onSubmit={() => setStep('upload')}
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
          overallProgress={overallProgress}
          onContinue={handleContinueReady}
        />
      )}

      {step === 'ready' && (
        <ReadyStep
          documents={documents}
          workspaceName={workspaceName}
          onOpenWorkspace={onOpenWorkspace}
          onAddDocuments={() => setStep('upload')}
        />
      )}
    </div>
  )
}