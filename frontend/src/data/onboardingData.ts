/**
 * Static copy used by the onboarding flow. `welcomeFeatures` is marketing
 * copy (not fake data); per-document state now comes from the backend.
 */

export type FeatureAccent = 'primary' | 'secondary' | 'tertiary'

export interface WelcomeFeature {
  id: string
  icon: string
  accent: FeatureAccent
  title: string
  description: string
}

export const welcomeFeatures: WelcomeFeature[] = [
  {
    id: 'mapping',
    icon: 'hub',
    accent: 'primary',
    title: 'Semantic Mapping',
    description:
      'Automatically link claims to evidence across multiple documents.',
  },
  {
    id: 'verification',
    icon: 'fact_check',
    accent: 'secondary',
    title: 'Verbatim Verification',
    description:
      'Every node is cross-referenced with direct citations from the source.',
  },
  {
    id: 'interrogation',
    icon: 'psychology',
    accent: 'tertiary',
    title: 'AI Interrogation',
    description: 'Chat directly with your data to uncover hidden trade-offs.',
  },
]
