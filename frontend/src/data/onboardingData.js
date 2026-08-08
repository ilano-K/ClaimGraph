/**
 * Fake data for the ClaimGraph onboarding flow, mirroring the reference
 * onboarding.html design so the screens can be previewed end-to-end.
 */

export const ONBOARDING_STEPS = [
  { number: 1, label: 'Welcome' },
  { number: 2, label: 'Upload' },
  { number: 3, label: 'Processing' },
  { number: 4, label: 'Ready' },
]

export const welcomeFeatures = [
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

export const initialProcessingDocuments = [
  {
    id: 'doc-1',
    name: 'RFC-9214_Network_Topology.pdf',
    size: '1.2 MB',
    status: 'complete',
    progress: 100,
    kind: 'network',
  },
  {
    id: 'doc-2',
    name: 'IEEE_2023_Analysis_Draft.pdf',
    size: '3.4 MB',
    status: 'extracting',
    progress: 45,
    kind: 'analysis',
  },
  {
    id: 'doc-3',
    name: 'Dataset_Supplementary_Material.pdf',
    size: '890 KB',
    status: 'uploading',
    progress: 10,
    kind: 'dataset',
  },
]

export const readyDocuments = [
  { id: 'doc-1', name: 'RFC-9214_Network_Topology.pdf', pages: 24 },
  { id: 'doc-2', name: 'IEEE_2023_Analysis_Draft.pdf', pages: 12 },
  { id: 'doc-3', name: 'Dataset_Supplementary_Material.pdf', pages: 8 },
]