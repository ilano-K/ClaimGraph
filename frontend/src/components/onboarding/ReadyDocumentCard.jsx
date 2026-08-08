import Icon from '../ui/Icon.jsx'

/**
 * One processed-document summary card on the Ready (Step 4) screen.
 */
export default function ReadyDocumentCard({ document: doc, index }) {
  return (
    <div
      className="onboarding-doc-card rounded-lg p-4 flex items-center justify-between group slide-in-card"
      style={{ animationDelay: `${100 * (index + 1)}ms` }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center border border-primary/30 shrink-0">
          <Icon name="description" className="text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-label-md text-label-md text-on-surface mb-1 truncate">
            {doc.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-mono text-outline">
              {doc.pages} Pages
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <span className="bg-secondary/10 border border-secondary text-secondary font-label-sm text-label-sm px-2 py-1 rounded-full flex items-center gap-1">
          <Icon name="task_alt" className="text-[14px]" filled />
          Ready
        </span>
      </div>
    </div>
  )
}