import Icon from '../ui/Icon'
import ProcessingFileRow from './ProcessingFileRow'
import { cn } from '../../lib/utils'
import type { ProcessingPhase, UploadedDocument } from '../../api/types'

interface ProcessingStepProps {
  documents: UploadedDocument[]
  phase: ProcessingPhase
  error: string | null
  onRetry: () => void
  onBackToUpload: () => void
  onContinue: () => void
}

const PHASE_MESSAGE: Record<ProcessingPhase, string> = {
  uploading: 'Uploading your documents...',
  compiling: 'Compiling the semantic graph...',
  complete: 'Compilation complete.',
  error: 'Processing failed.',
}

const PHASE_PCT: Record<ProcessingPhase, number> = {
  uploading: 30,
  compiling: 65,
  complete: 100,
  error: 100,
}

/**
 * Processing screen. Shows the uploaded file list against the real request
 * phase driven by `OnboardingFlow` (upload -> compile -> complete), with an
 * error state that allows retrying.
 */
export default function ProcessingStep({
  documents,
  phase,
  error,
  onRetry,
  onBackToUpload,
  onContinue,
}: ProcessingStepProps) {
  const isComplete = phase === 'complete'
  const isError = phase === 'error'

  return (
    <main className="relative z-10 pt-[120px] pb-24 px-margin-mobile md:px-margin-desktop flex flex-col items-center min-h-screen max-w-container-max mx-auto">
      <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>

      <div className="relative w-full max-w-3xl flex flex-col gap-12">
        <div className="flex flex-col gap-4 text-center items-center">
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 border border-primary/20 mb-2">
            <Icon name="document_scanner" className="text-primary text-3xl" />
          </div>
          <h1 className="font-display text-display text-on-background">
            Processing Your Documents
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Please keep this window open while we index your documents, extract
            claims, and build the initial semantic graph.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <div className="flex justify-between items-end">
            <span className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
              Overall Progress
            </span>
            <span className="font-mono text-mono text-primary font-bold">
              {isComplete ? 'Complete' : PHASE_MESSAGE[phase]}
            </span>
          </div>
          <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden border border-white/5 relative">
            <div
              className={cn(
                'absolute h-full bg-primary rounded-full transition-all duration-700 ease-out',
                !isComplete && 'animate-pulse-glow'
              )}
              style={{ width: `${PHASE_PCT[phase]}%` }}
            ></div>
          </div>
        </div>

        <div className="flex flex-col bg-surface-container-low/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
          <div className="absolute top-0 left-0 w-[1px] h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
          {documents.map((doc) => (
            <ProcessingFileRow key={doc.id} document={doc} status={isComplete ? 'complete' : 'active'} />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-4 border-t border-white/5">
          {isError && error && (
            <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 font-label-md text-label-md text-error flex-shrink">
              <Icon name="error" className="text-[18px] shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-6 ml-auto">
            {isError && (
              <>
                <button
                  type="button"
                  onClick={onBackToUpload}
                  className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Icon name="arrow_back" className="text-[18px]" />
                  Edit Files
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="font-label-md text-label-md px-8 py-3 rounded-lg flex items-center gap-2 transition-all bg-primary-container text-on-primary-container kinetic-glow active:scale-95 border border-transparent"
                >
                  <Icon name="refresh" className="text-[18px]" />
                  Retry
                </button>
              </>
            )}
            {!isError && (
              <button
                type="button"
                onClick={onContinue}
                disabled={!isComplete}
                className={cn(
                  'font-label-md text-label-md px-8 py-3 rounded-lg flex items-center gap-2 transition-all',
                  isComplete
                    ? 'bg-primary-container text-on-primary-container kinetic-glow active:scale-95 border border-transparent'
                    : 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border border-outline-variant/30'
                )}
              >
                Continue to Workspace
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}