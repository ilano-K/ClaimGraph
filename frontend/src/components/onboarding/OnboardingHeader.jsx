import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/utils.js'

/**
 * Fixed top app bar used across the onboarding flow. Mirrors the reference
 * onboarding.html TopAppBar: brand, 4-step progress nav, and trailing actions.
 */
export default function OnboardingHeader({ activeStep, totalSteps = 4 }) {
  return (
    <header className="fixed top-0 w-full bg-background/60 backdrop-blur-xl flex justify-between items-center px-margin-desktop py-4 z-50 border-b border-white/10 transition-all duration-300">
      <div className="font-headline-md text-headline-md font-bold text-primary flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg border border-outline-variant/50 bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shrink-0">
          <Icon name="share" className="text-on-primary text-[18px]" />
        </div>
        ClaimGraph
      </div>

      <nav className="hidden md:flex items-center gap-8 font-label-md text-label-md uppercase tracking-widest">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <span
            key={step}
            className={cn(
              'cursor-pointer pb-1 transition-colors',
              step === activeStep
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-primary'
            )}
          >
            Step {step} of {totalSteps}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-4 text-on-surface-variant">
        <button
          type="button"
          className="p-2 rounded-full hover:bg-surface-variant/50 hover:text-primary transition-colors"
          aria-label="Help"
        >
          <Icon name="help" />
        </button>
        <button
          type="button"
          className="p-2 rounded-full hover:bg-surface-variant/50 hover:text-primary transition-colors"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}