import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'

/**
 * Create Workspace (Step 2) screen. Name (required) and description
 * (optional) inputs feed onboarding state. Continue stays disabled until a
 * name is entered; Back returns to Welcome; Skip routes to the dashboard.
 */
export default function CreateWorkspaceStep({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onBack,
  onSkip,
}) {
  const isValid = name.trim().length > 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (isValid) onSubmit()
      }}
    >
      <main className="relative z-10 pt-[120px] pb-24 px-margin-mobile md:px-margin-desktop flex flex-col items-center min-h-screen font-body-md text-body-md antialiased">
        <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>

        <div className="relative w-full max-w-3xl flex flex-col gap-12">
          <div className="flex flex-col gap-4 text-center items-center">
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 border border-primary/20 mb-2">
              <Icon name="workspaces" className="text-primary text-3xl" />
            </div>
            <h1 className="font-display text-display text-on-background">
              Create Your Workspace
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
              Give your workspace a name and description. The documents you
              upload next will be mapped into it automatically.
            </p>
          </div>

          <div className="flex flex-col gap-6 bg-surface-container-low/60 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-2xl">
            <div className="flex flex-col gap-2">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                Workspace Name
              </span>
              <input
                id="workspace-name"
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="e.g. Network Infrastructure Review"
                autoFocus
                className="w-full bg-surface-container-low/60 border border-outline-variant/50 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                Description <span className="text-outline">(optional)</span>
              </span>
              <textarea
                id="workspace-description"
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="What is this workspace about? Add context to help ClaimGraph organize your documents."
                rows={4}
                className="w-full bg-surface-container-low/60 border border-outline-variant/50 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all resize-none"
              />
            </div>
          </div>

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
                type="submit"
                disabled={!isValid}
                className={cn(
                  'font-label-md text-label-md px-8 py-3 rounded-lg flex items-center gap-2 transition-all',
                  !isValid
                    ? 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border border-outline-variant/30'
                    : 'bg-primary-container text-on-primary-container kinetic-glow active:scale-95 border border-transparent'
                )}
              >
                Continue
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </form>
  )
}