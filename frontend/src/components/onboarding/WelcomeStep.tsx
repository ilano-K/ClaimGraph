import FeatureCard from './FeatureCard'
import { welcomeFeatures } from '../../data/onboardingData'

interface WelcomeStepProps {
  onContinue: () => void
  onSkip: () => void
}

/**
 * Welcome (Step 1) screen. Hero copy, three feature highlight cards, and the
 * primary / secondary onboarding actions. Pure presentational.
 */
export default function WelcomeStep({ onContinue, onSkip }: WelcomeStepProps) {
  return (
    <main className="flex-grow flex items-center justify-center pt-24 pb-32 px-margin-mobile md:px-margin-desktop bg-grid-slate">
      <div className="w-full max-w-3xl flex flex-col items-center">
        <div className="text-center mb-16 space-y-4">
          <h1 className="font-display text-display text-on-background">
            Welcome to ClaimGraph
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
            Let's personalize your workspace by bringing in your documents.
          </p>
        </div>

        <div className="w-full space-y-6 mb-16">
          {welcomeFeatures.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>

        <div className="flex flex-col items-center space-y-6 w-full max-w-sm">
          <button
            type="button"
            onClick={onContinue}
            className="w-full bg-primary-container text-on-primary-container font-label-md text-label-md py-4 rounded-lg kinetic-glow active:scale-95 transition-all"
          >
            Create a Workspace
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="font-label-md text-label-md text-outline hover:text-primary transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </main>
  )
}
