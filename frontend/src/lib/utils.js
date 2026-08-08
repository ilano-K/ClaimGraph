export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function formatConfidence(score) {
  return `${Math.round(score * 100)}%`
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}