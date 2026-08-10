import Icon from '../ui/Icon.jsx'
import ReadyDocumentCard from './ReadyDocumentCard.jsx'
import { readyDocuments as fallbackDocuments } from '../../data/onboardingData.js'

/**
 * Ready (Step 4) screen. Confirmation hero plus the list of processed documents
 * and the actions that hand off into the main workspace.
 */
export default function ReadyStep({ onOpenWorkspace, onAddDocuments, documents = fallbackDocuments, workspaceName = '' }) {
  return (
    <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-12 px-margin-mobile md:px-margin-desktop z-10 relative min-h-screen font-body-md text-body-md antialiased">
      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-secondary blur-[100px] opacity-20"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[30vw] h-[30vw] rounded-full bg-primary blur-[120px] opacity-10"></div>
      </div>

      <div className="relative w-full max-w-3xl flex flex-col items-center z-10">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-24 h-24 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary glow-success mb-6">
            <Icon name="check_circle" className="text-secondary text-5xl" filled />
          </div>
          <h1 className="font-display text-display text-on-surface mb-2">
            {workspaceName.trim() ? `"${workspaceName.trim()}" is Ready!` : 'Your Workspace is Ready!'}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Successfully processed {documents.length} documents.
          </p>
        </div>

        <div className="w-full glass-panel rounded-xl p-6 mb-10 flex flex-col gap-4">
          {documents.map((doc, index) => (
            <ReadyDocumentCard key={doc.id} document={doc} index={index} />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-8 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            style={{ boxShadow: '0 0 15px rgba(77, 142, 255, 0.4)' }}
          >
            <Icon name="open_in_new" />
            Open Workspace
          </button>
          <button
            type="button"
            onClick={onAddDocuments}
            className="glass-panel hover:bg-surface-variant text-on-surface font-label-md text-label-md px-8 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="add" />
            Add More Documents
          </button>
        </div>
      </div>
    </main>
  )
}