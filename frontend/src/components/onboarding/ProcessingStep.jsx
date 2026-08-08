import Icon from '../ui/Icon.jsx'
import ProcessingFileRow from './ProcessingFileRow.jsx'

/**
 * Processing (Step 3) screen. Shows overall progress and the per-file pipeline
 * state. Reads its document list from props so the orchestrator can simulate
 * live progress against fake data.
 */
export default function ProcessingStep({ documents, overallProgress, onContinue }) {
  const isComplete = documents.every((doc) => doc.status === 'complete')

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
            Processing Your PDFs
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
              {overallProgress}% Complete
            </span>
          </div>
          <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden border border-white/5 relative">
            <div
              className="absolute h-full bg-primary rounded-full transition-all duration-700 ease-out animate-pulse-glow"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="flex flex-col bg-surface-container-low/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
          <div className="absolute top-0 left-0 w-[1px] h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
          {documents.map((doc) => (
            <ProcessingFileRow key={doc.id} document={doc} />
          ))}
        </div>

        <div className="flex justify-end pt-6 mt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onContinue}
            disabled={!isComplete}
            className="font-label-md text-label-md px-8 py-3 rounded-lg bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border border-outline-variant/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Workspace
            <Icon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      </div>
    </main>
  )
}